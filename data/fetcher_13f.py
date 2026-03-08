"""
13F-HR Filing Fetcher

Fetches 13F-HR filings from SEC EDGAR for a given CIK.
Parses the XML infotable to extract holdings data.
Rate-limits to 10 req/sec, caches raw filings locally.
"""

import json
import logging
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

import requests

from config import (
    CACHE_DIR,
    DEFAULT_QUARTERS_BACK,
    SEC_EDGAR_API,
    SEC_RATE_LIMIT,
    SEC_USER_AGENT,
)

logger = logging.getLogger(__name__)

# XML namespace used in 13F infotables
NS_13F = "http://www.sec.gov/document/xml/ns/13F/"
# Some filings use a different namespace
NS_13F_ALT = "http://www.sec.gov/document/xml/ns/13f/"


class RateLimiter:
    """Simple rate limiter: max N requests per second."""

    def __init__(self, max_per_second: int = 10):
        self.min_interval = 1.0 / max_per_second
        self._last_request = 0.0

    def wait(self):
        now = time.monotonic()
        elapsed = now - self._last_request
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request = time.monotonic()


class Fetcher13F:
    """Fetches and parses 13F-HR filings from SEC EDGAR."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": SEC_USER_AGENT,
            "Accept-Encoding": "gzip, deflate",
        })
        self.rate_limiter = RateLimiter(SEC_RATE_LIMIT)
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def fetch_filings(
        self,
        cik: str,
        investor_key: str,
        quarters_back: int = DEFAULT_QUARTERS_BACK,
    ) -> list[dict]:
        """
        Fetch recent 13F-HR filings for a given CIK.

        Returns a list of dicts, one per filing, each containing:
            - accession_number
            - filing_date
            - report_date (period of report / quarter end)
            - holdings: list of holding dicts
        """
        cik_padded = cik.lstrip("0").zfill(10)
        logger.info(f"[{investor_key}] Fetching filing index for CIK {cik}")

        filings_meta = self._get_filing_list(cik_padded, quarters_back)
        if not filings_meta:
            logger.warning(f"[{investor_key}] No 13F-HR filings found for CIK {cik}")
            return []

        logger.info(
            f"[{investor_key}] Found {len(filings_meta)} 13F-HR filings, "
            f"fetching up to {quarters_back}"
        )

        results = []
        for meta in filings_meta[:quarters_back]:
            accession = meta["accession_number"]
            cache_path = self._cache_path(investor_key, accession)

            if cache_path.exists():
                logger.debug(f"[{investor_key}] Cache hit: {accession}")
                with open(cache_path, "r") as f:
                    results.append(json.load(f))
                continue

            try:
                holdings = self._fetch_and_parse_infotable(
                    cik_padded, meta, investor_key
                )
                filing_data = {
                    "accession_number": accession,
                    "filing_date": meta.get("filing_date", ""),
                    "report_date": meta.get("report_date", ""),
                    "investor_key": investor_key,
                    "cik": cik,
                    "holdings_count": len(holdings),
                    "total_value_thousands": sum(
                        h.get("value", 0) for h in holdings
                    ),
                    "holdings": holdings,
                    "fetched_at": datetime.utcnow().isoformat(),
                }

                # Cache the result
                cache_path.parent.mkdir(parents=True, exist_ok=True)
                with open(cache_path, "w") as f:
                    json.dump(filing_data, f, indent=2)
                logger.info(
                    f"[{investor_key}] Parsed {accession}: "
                    f"{len(holdings)} holdings, "
                    f"${filing_data['total_value_thousands'] / 1000:.1f}M total"
                )
                results.append(filing_data)

            except Exception as e:
                logger.error(
                    f"[{investor_key}] Failed to parse {accession}: {e}",
                    exc_info=True,
                )
                continue

        return results

    def get_latest_two_filings(
        self, cik: str, investor_key: str
    ) -> tuple[Optional[dict], Optional[dict]]:
        """
        Convenience: fetch the two most recent 13F filings.
        Returns (latest, previous) or (latest, None) if only one exists.
        """
        filings = self.fetch_filings(cik, investor_key, quarters_back=2)
        latest = filings[0] if len(filings) > 0 else None
        previous = filings[1] if len(filings) > 1 else None
        return latest, previous

    # -----------------------------------------------------------------
    # Filing index retrieval
    # -----------------------------------------------------------------

    def _get_filing_list(
        self, cik_padded: str, max_filings: int
    ) -> list[dict]:
        """
        Get list of 13F-HR filing metadata from the EDGAR submissions API.
        Returns list of dicts with accession_number, filing_date, report_date.
        """
        url = f"{SEC_EDGAR_API}/submissions/CIK{cik_padded}.json"
        data = self._get_json(url)
        if not data:
            return []

        filings_meta = []

        # Process recent filings
        recent = data.get("filings", {}).get("recent", {})
        filings_meta.extend(self._extract_13f_from_index(recent))

        # Process older filing pages if needed
        if len(filings_meta) < max_filings:
            for file_entry in data.get("filings", {}).get("files", []):
                if len(filings_meta) >= max_filings:
                    break
                file_url = f"{SEC_EDGAR_API}/submissions/{file_entry['name']}"
                older_data = self._get_json(file_url)
                if older_data:
                    filings_meta.extend(self._extract_13f_from_index(older_data))

        # Sort by filing date descending (most recent first)
        filings_meta.sort(key=lambda x: x.get("filing_date", ""), reverse=True)
        return filings_meta[:max_filings]

    def _extract_13f_from_index(self, index_data: dict) -> list[dict]:
        """Extract 13F-HR entries from a filing index response."""
        results = []
        forms = index_data.get("form", [])
        accessions = index_data.get("accessionNumber", [])
        filing_dates = index_data.get("filingDate", [])
        report_dates = index_data.get("reportDate", [])
        primary_docs = index_data.get("primaryDocument", [])

        for i, form in enumerate(forms):
            # Match 13F-HR and 13F-HR/A (amendments)
            if form in ("13F-HR", "13F-HR/A"):
                results.append({
                    "form_type": form,
                    "accession_number": accessions[i] if i < len(accessions) else "",
                    "filing_date": filing_dates[i] if i < len(filing_dates) else "",
                    "report_date": report_dates[i] if i < len(report_dates) else "",
                    "primary_document": primary_docs[i] if i < len(primary_docs) else "",
                })

        return results

    # -----------------------------------------------------------------
    # Infotable parsing
    # -----------------------------------------------------------------

    def _fetch_and_parse_infotable(
        self, cik_padded: str, meta: dict, investor_key: str
    ) -> list[dict]:
        """
        Fetch the filing index page, find the infotable XML, parse holdings.
        """
        accession = meta["accession_number"]
        accession_no_dashes = accession.replace("-", "")
        cik_num = cik_padded.lstrip('0')

        # SEC EDGAR uses accession number WITHOUT dashes in directory path
        # e.g., https://www.sec.gov/Archives/edgar/data/1067983/000119312526054580/
        # But data.sec.gov sometimes needs different format. Try both.

        # Try the EDGAR Archives URL format (most reliable)
        index_urls = [
            f"https://www.sec.gov/Archives/edgar/data/{cik_num}/{accession_no_dashes}/index.json",
            f"{SEC_EDGAR_API}/Archives/edgar/data/{cik_num}/{accession_no_dashes}/index.json",
        ]

        index_data = None
        for index_url in index_urls:
            index_data = self._get_json(index_url)
            if index_data:
                break

        infotable_url = None
        if index_data:
            infotable_url = self._find_infotable_in_index(
                index_data, cik_padded, accession_no_dashes
            )

        # Fallback: try common infotable filenames
        if not infotable_url:
            infotable_url = self._try_common_infotable_urls(
                cik_padded, accession_no_dashes
            )

        if not infotable_url:
            logger.warning(
                f"[{investor_key}] Could not find infotable for {accession}"
            )
            return []

        # Fetch and cache the raw XML
        raw_cache = self._raw_cache_path(investor_key, accession)
        raw_cache.parent.mkdir(parents=True, exist_ok=True)

        if raw_cache.exists():
            with open(raw_cache, "r") as f:
                xml_text = f.read()
        else:
            xml_text = self._get_text(infotable_url)
            if xml_text:
                with open(raw_cache, "w") as f:
                    f.write(xml_text)

        if not xml_text:
            return []

        return self._parse_infotable_xml(xml_text)

    def _find_infotable_in_index(
        self, index_data: dict, cik_padded: str, accession_no_dashes: str
    ) -> Optional[str]:
        """Find the infotable document URL from the filing index JSON."""
        cik_num = cik_padded.lstrip('0')
        base_url = (
            f"https://www.sec.gov/Archives/edgar/data/"
            f"{cik_num}/{accession_no_dashes}/"
        )

        items = index_data.get("directory", {}).get("item", [])

        # First pass: look for files with "infotable" in the name
        for item in items:
            name = item.get("name", "").lower()
            if any(
                keyword in name
                for keyword in ["infotable", "info_table", "information_table"]
            ):
                return base_url + item["name"]

        # Second pass: find XML files that are NOT the primary doc and NOT index files
        # The infotable is typically the largest XML file
        xml_candidates = []
        for item in items:
            name = item.get("name", "")
            name_lower = name.lower()
            if (
                name_lower.endswith(".xml")
                and "primary" not in name_lower
                and "index" not in name_lower
                and not name_lower.startswith("0")  # skip accession-based index files
                and "R" not in name  # skip R1.htm, R2.htm style files
            ):
                size = int(item.get("size", "0") or "0")
                xml_candidates.append((name, size))

        # Pick the largest XML file (infotable is typically much larger than primary_doc)
        if xml_candidates:
            xml_candidates.sort(key=lambda x: x[1], reverse=True)
            return base_url + xml_candidates[0][0]

        return None

    def _try_common_infotable_urls(
        self, cik_padded: str, accession_no_dashes: str
    ) -> Optional[str]:
        """Try common infotable filenames as fallback."""
        cik_num = cik_padded.lstrip('0')
        base_url = (
            f"https://www.sec.gov/Archives/edgar/data/"
            f"{cik_num}/{accession_no_dashes}/"
        )
        common_names = [
            "infotable.xml",
            "InfoTable.xml",
            "INFOTABLE.XML",
            "information_table.xml",
            "InformationTable.xml",
            "form13fInfoTable.xml",
        ]

        for name in common_names:
            url = base_url + name
            self.rate_limiter.wait()
            try:
                resp = self.session.head(url, timeout=15)
                if resp.status_code == 200:
                    return url
            except requests.RequestException:
                continue

        return None

    def _parse_infotable_xml(self, xml_text: str) -> list[dict]:
        """
        Parse the 13F infotable XML and extract holdings.
        Handles both namespaced and non-namespaced XML.
        """
        holdings = []

        # Clean up common XML issues
        xml_text = xml_text.strip()
        if xml_text.startswith("<?xml"):
            # Remove any content before the root element on the same line
            pass

        try:
            root = ET.fromstring(xml_text)
        except ET.ParseError as e:
            logger.warning(f"XML parse error: {e}")
            # Try wrapping in a root element
            try:
                root = ET.fromstring(f"<root>{xml_text}</root>")
            except ET.ParseError:
                logger.error("Cannot parse infotable XML even with wrapper")
                return []

        # Try to detect namespace
        ns = ""
        root_tag = root.tag
        if "{" in root_tag:
            ns = root_tag.split("}")[0] + "}"

        # If no namespace detected, try known ones
        namespaces_to_try = []
        if ns:
            namespaces_to_try.append(ns)
        namespaces_to_try.extend([
            f"{{{NS_13F}}}",
            f"{{{NS_13F_ALT}}}",
            "",  # No namespace
        ])

        for ns_prefix in namespaces_to_try:
            # Find all infoTable entries
            entries = root.findall(f".//{ns_prefix}infoTable")
            if not entries:
                entries = root.findall(f".//{ns_prefix}InfoTable")
            if not entries:
                # Try finding by local name pattern
                entries = [
                    el
                    for el in root.iter()
                    if el.tag.lower().endswith("infotable")
                    and len(list(el)) > 0  # has children
                ]
            if entries:
                for entry in entries:
                    holding = self._parse_single_holding(entry, ns_prefix)
                    if holding:
                        holdings.append(holding)
                break

        if not holdings:
            logger.warning(
                f"No holdings found. Root tag: {root.tag}, "
                f"children: {[c.tag for c in root][:5]}"
            )

        return holdings

    def _parse_single_holding(self, entry: ET.Element, ns: str) -> Optional[dict]:
        """Parse a single infoTable entry into a holdings dict."""

        def get_text(parent: ET.Element, tag: str) -> str:
            """Get text from a child element, trying with and without namespace."""
            el = parent.find(f"{ns}{tag}")
            if el is None:
                el = parent.find(tag)
            if el is None:
                # Case-insensitive search
                for child in parent:
                    local_tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    if local_tag.lower() == tag.lower():
                        return (child.text or "").strip()
                return ""
            return (el.text or "").strip()

        def get_nested_text(parent: ET.Element, outer: str, inner: str) -> str:
            """Get text from a nested element (e.g., shrsOrPrnAmt/sshPrnamt)."""
            outer_el = parent.find(f"{ns}{outer}")
            if outer_el is None:
                outer_el = parent.find(outer)
            if outer_el is None:
                for child in parent:
                    local_tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                    if local_tag.lower() == outer.lower():
                        outer_el = child
                        break
            if outer_el is None:
                return ""
            return get_text(outer_el, inner)

        name = get_text(entry, "nameOfIssuer")
        if not name:
            return None

        cusip = get_text(entry, "cusip")
        title_of_class = get_text(entry, "titleOfClass")

        # Value is in thousands of dollars
        value_str = get_text(entry, "value")
        try:
            value = int(value_str) if value_str else 0
        except ValueError:
            value = 0

        # Shares or principal amount
        shares_str = get_nested_text(entry, "shrsOrPrnAmt", "sshPrnamt")
        try:
            shares = int(shares_str) if shares_str else 0
        except ValueError:
            shares = 0

        share_type = get_nested_text(entry, "shrsOrPrnAmt", "sshPrnamtType")
        investment_discretion = get_text(entry, "investmentDiscretion")
        voting_sole = get_nested_text(entry, "votingAuthority", "Sole")
        voting_shared = get_nested_text(entry, "votingAuthority", "Shared")
        voting_none = get_nested_text(entry, "votingAuthority", "None")
        put_call = get_text(entry, "putCall")

        holding = {
            "name_of_issuer": name,
            "title_of_class": title_of_class,
            "cusip": cusip,
            "value": value,  # in thousands
            "shares": shares,
            "share_type": share_type or "SH",
            "investment_discretion": investment_discretion,
            "put_call": put_call if put_call else None,
        }

        # Add voting authority if available
        if any([voting_sole, voting_shared, voting_none]):
            holding["voting_authority"] = {
                "sole": int(voting_sole) if voting_sole else 0,
                "shared": int(voting_shared) if voting_shared else 0,
                "none": int(voting_none) if voting_none else 0,
            }

        return holding

    # -----------------------------------------------------------------
    # HTTP helpers
    # -----------------------------------------------------------------

    def _get_json(self, url: str) -> Optional[dict]:
        """Fetch JSON from a URL with rate limiting."""
        self.rate_limiter.wait()
        try:
            resp = self.session.get(url, timeout=30)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            logger.error(f"HTTP error fetching {url}: {e}")
            return None
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error for {url}: {e}")
            return None

    def _get_text(self, url: str) -> Optional[str]:
        """Fetch text content from a URL with rate limiting."""
        self.rate_limiter.wait()
        try:
            resp = self.session.get(url, timeout=30)
            resp.raise_for_status()
            return resp.text
        except requests.RequestException as e:
            logger.error(f"HTTP error fetching {url}: {e}")
            return None

    # -----------------------------------------------------------------
    # Cache paths
    # -----------------------------------------------------------------

    def _cache_path(self, investor_key: str, accession: str) -> Path:
        """Path to cached parsed filing JSON."""
        safe_accession = accession.replace("-", "")
        return CACHE_DIR / investor_key / f"{safe_accession}.json"

    def _raw_cache_path(self, investor_key: str, accession: str) -> Path:
        """Path to cached raw XML infotable."""
        safe_accession = accession.replace("-", "")
        return CACHE_DIR / investor_key / "raw" / f"{safe_accession}.xml"


# -----------------------------------------------------------------
# CLI usage
# -----------------------------------------------------------------

if __name__ == "__main__":
    import sys
    from config import INVESTORS

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    cik = sys.argv[1] if len(sys.argv) > 1 else INVESTORS["berkshire_hathaway"]["cik"]
    key = sys.argv[2] if len(sys.argv) > 2 else "berkshire_hathaway"

    fetcher = Fetcher13F()
    filings = fetcher.fetch_filings(cik, key, quarters_back=2)

    for filing in filings:
        print(
            f"\n{filing['filing_date']} | {filing['report_date']} | "
            f"{filing['holdings_count']} holdings | "
            f"${filing['total_value_thousands'] / 1_000_000:.1f}B"
        )
        for h in filing["holdings"][:5]:
            print(
                f"  {h['name_of_issuer']:40s} {h['cusip']}  "
                f"${h['value']:>12,}k  {h['shares']:>14,} {h['share_type']}"
            )
        if filing["holdings_count"] > 5:
            print(f"  ... and {filing['holdings_count'] - 5} more")
