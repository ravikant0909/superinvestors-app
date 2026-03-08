"""
CUSIP-to-Ticker Mapper

Maps CUSIP identifiers from 13F filings to stock ticker symbols.
Primary source: SEC company_tickers.json (maps CIK -> ticker, includes CUSIP-like data).
Secondary: manual CUSIP lookup table for common securities.
Fallback: uses issuer name from the 13F filing itself.
"""

import json
import logging
import re
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import requests

from config import CUSIP_CACHE_FILE, SEC_USER_AGENT

logger = logging.getLogger(__name__)

# Well-known CUSIP -> ticker mappings for securities that are hard to resolve
# automatically (ETFs, preferred shares, foreign ADRs, etc.)
MANUAL_CUSIP_MAP = {
    "594918104": "MSFT",     # Microsoft
    "037833100": "AAPL",     # Apple
    "02079K107": "GOOG",     # Alphabet Class C
    "02079K305": "GOOGL",    # Alphabet Class A
    "023135106": "AMZN",     # Amazon
    "30303M102": "META",     # Meta Platforms
    "67066G104": "NVDA",     # NVIDIA
    "88160R101": "TSLA",     # Tesla
    "46625H100": "JPM",      # JPMorgan Chase
    "060505104": "BAC",      # Bank of America
    "92826C839": "V",        # Visa
    "585055106": "MA",       # Mastercard
    "478160104": "JNJ",      # Johnson & Johnson
    "742718109": "PG",       # Procter & Gamble
    "931142103": "WMT",      # Walmart
    "11135F101": "BRK.B",    # Berkshire Hathaway B
    "20030N101": "CMCSA",    # Comcast
    "172967424": "C",        # Citigroup
    "88579Y101": "MMM",      # 3M
    "500754106": "KO",       # Coca-Cola
    "713448108": "PEP",      # PepsiCo
    "437076102": "HD",       # Home Depot
    "254687106": "DIS",      # Walt Disney
    "872540109": "TFC",      # Truist
    "808513105": "SCHW",     # Schwab
    "30231G102": "XOM",      # Exxon Mobil
    "166764100": "CVX",      # Chevron
    "02376R102": "AAL",      # American Airlines
    "125896100": "CI",       # Cigna
    "84756N109": "SQ",       # Block (Square)
    "79466L302": "CRM",      # Salesforce
}

# Cache refresh interval (7 days)
CACHE_MAX_AGE_DAYS = 7


class CUSIPMapper:
    """Maps CUSIP codes to ticker symbols using SEC data and heuristics."""

    def __init__(self):
        self._cusip_to_ticker: dict[str, str] = {}
        self._name_to_ticker: dict[str, str] = {}
        self._loaded = False

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------

    def map_cusip(self, cusip: str, issuer_name: str = "") -> str:
        """
        Map a CUSIP to a ticker symbol.

        Args:
            cusip: 9-character CUSIP identifier
            issuer_name: Name of issuer (fallback)

        Returns:
            Ticker symbol (best guess), or the CUSIP itself if unmappable.
        """
        if not self._loaded:
            self._load_or_fetch()

        cusip = cusip.strip().upper()

        # 1. Check manual overrides first (most reliable)
        if cusip in MANUAL_CUSIP_MAP:
            return MANUAL_CUSIP_MAP[cusip]

        # 2. Check the SEC-derived CUSIP map
        # Try full 9-digit CUSIP
        if cusip in self._cusip_to_ticker:
            return self._cusip_to_ticker[cusip]

        # Try 6-digit CUSIP prefix (issuer identifier only)
        cusip_6 = cusip[:6] if len(cusip) >= 6 else cusip
        if cusip_6 in self._cusip_to_ticker:
            return self._cusip_to_ticker[cusip_6]

        # 3. Fallback: try to match by issuer name
        if issuer_name:
            ticker = self._match_by_name(issuer_name)
            if ticker:
                return ticker

        # 4. Cannot resolve -- return CUSIP as identifier
        logger.debug(f"Cannot resolve CUSIP {cusip} ({issuer_name})")
        return cusip

    def map_holdings(self, holdings: list[dict]) -> list[dict]:
        """
        Add ticker symbols to a list of holdings dicts.
        Modifies holdings in-place and returns them.
        """
        if not self._loaded:
            self._load_or_fetch()

        for holding in holdings:
            cusip = holding.get("cusip", "")
            name = holding.get("name_of_issuer", "")
            holding["ticker"] = self.map_cusip(cusip, name)

        return holdings

    def get_stats(self) -> dict:
        """Return mapping statistics."""
        return {
            "cusip_entries": len(self._cusip_to_ticker),
            "name_entries": len(self._name_to_ticker),
            "manual_overrides": len(MANUAL_CUSIP_MAP),
            "loaded": self._loaded,
        }

    # -----------------------------------------------------------------
    # Data loading
    # -----------------------------------------------------------------

    def _load_or_fetch(self):
        """Load CUSIP mapping from cache, or fetch from SEC if stale."""
        if self._loaded:
            return

        cache_file = CUSIP_CACHE_FILE

        # Check if cache exists and is fresh
        if cache_file.exists():
            age = datetime.now() - datetime.fromtimestamp(
                cache_file.stat().st_mtime
            )
            if age < timedelta(days=CACHE_MAX_AGE_DAYS):
                self._load_from_cache(cache_file)
                if self._loaded:
                    return

        # Fetch fresh data from SEC
        self._fetch_from_sec(cache_file)

    def _load_from_cache(self, cache_file: Path):
        """Load the CUSIP-ticker mapping from local cache."""
        try:
            with open(cache_file, "r") as f:
                data = json.load(f)

            self._cusip_to_ticker = data.get("cusip_to_ticker", {})
            self._name_to_ticker = data.get("name_to_ticker", {})
            self._loaded = True
            logger.info(
                f"Loaded CUSIP map from cache: {len(self._cusip_to_ticker)} CUSIPs, "
                f"{len(self._name_to_ticker)} names"
            )
        except (json.JSONDecodeError, KeyError) as e:
            logger.warning(f"Cache file corrupt, will re-fetch: {e}")

    def _fetch_from_sec(self, cache_file: Path):
        """Fetch company_tickers.json from SEC and build CUSIP mapping."""
        url = "https://www.sec.gov/files/company_tickers.json"
        logger.info(f"Fetching company tickers from SEC: {url}")

        try:
            resp = requests.get(
                url,
                headers={"User-Agent": SEC_USER_AGENT},
                timeout=30,
            )
            resp.raise_for_status()
            tickers_data = resp.json()
        except (requests.RequestException, json.JSONDecodeError) as e:
            logger.error(f"Failed to fetch company tickers: {e}")
            # Try to load stale cache as fallback
            if cache_file.exists():
                logger.info("Falling back to stale cache")
                self._load_from_cache(cache_file)
            self._loaded = True  # Mark loaded even on failure to avoid retries
            return

        # Build mappings
        cusip_map = {}
        name_map = {}

        for entry in tickers_data.values():
            ticker = entry.get("ticker", "")
            cik = str(entry.get("cik_str", ""))
            title = entry.get("title", "")

            if not ticker:
                continue

            # SEC company_tickers.json doesn't have CUSIPs directly,
            # but we store the name->ticker mapping for fallback
            if title:
                clean_name = self._normalize_name(title)
                name_map[clean_name] = ticker

        # Also fetch the company_tickers_exchange.json for more data
        try:
            exchange_url = "https://www.sec.gov/files/company_tickers_exchange.json"
            resp2 = requests.get(
                exchange_url,
                headers={"User-Agent": SEC_USER_AGENT},
                timeout=30,
            )
            resp2.raise_for_status()
            exchange_data = resp2.json()

            # This file has fields: [cik, name, ticker, exchange]
            for row in exchange_data.get("data", []):
                if len(row) >= 3:
                    name = row[1] if len(row) > 1 else ""
                    ticker = row[2] if len(row) > 2 else ""
                    if name and ticker:
                        clean_name = self._normalize_name(name)
                        name_map[clean_name] = ticker
        except Exception as e:
            logger.debug(f"Could not fetch exchange data (non-critical): {e}")

        self._cusip_to_ticker = {**MANUAL_CUSIP_MAP, **cusip_map}
        self._name_to_ticker = name_map
        self._loaded = True

        # Save to cache
        cache_data = {
            "cusip_to_ticker": self._cusip_to_ticker,
            "name_to_ticker": self._name_to_ticker,
            "fetched_at": datetime.now().isoformat(),
            "entries": len(name_map),
        }
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with open(cache_file, "w") as f:
                json.dump(cache_data, f)
            logger.info(
                f"Saved CUSIP map to cache: {len(self._cusip_to_ticker)} CUSIPs, "
                f"{len(name_map)} names"
            )
        except IOError as e:
            logger.warning(f"Could not write cache file: {e}")

    # -----------------------------------------------------------------
    # Name matching
    # -----------------------------------------------------------------

    def _match_by_name(self, issuer_name: str) -> Optional[str]:
        """
        Try to match an issuer name from a 13F filing to a ticker symbol.
        Uses normalized name matching with progressive relaxation.
        """
        clean = self._normalize_name(issuer_name)

        # Exact match
        if clean in self._name_to_ticker:
            return self._name_to_ticker[clean]

        # Try removing common suffixes
        for suffix in [
            " inc", " corp", " co", " ltd", " llc", " lp",
            " plc", " sa", " nv", " ag", " se",
            " class a", " class b", " class c",
            " com", " common", " new", " hldgs", " holdings",
            " group", " international", " intl",
        ]:
            stripped = clean.rstrip()
            if stripped.endswith(suffix):
                candidate = stripped[: -len(suffix)].strip()
                if candidate in self._name_to_ticker:
                    return self._name_to_ticker[candidate]

        # Prefix match (issuer name might be truncated in 13F)
        for stored_name, ticker in self._name_to_ticker.items():
            if stored_name.startswith(clean) or clean.startswith(stored_name):
                return ticker

        return None

    @staticmethod
    def _normalize_name(name: str) -> str:
        """Normalize a company name for matching."""
        name = name.lower().strip()
        # Remove punctuation
        name = re.sub(r"[.,;:'\"/\\()\[\]{}&!@#$%^*+=|~`]", " ", name)
        # Collapse whitespace
        name = re.sub(r"\s+", " ", name).strip()
        return name


# -----------------------------------------------------------------
# CLI usage
# -----------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )

    mapper = CUSIPMapper()

    # Test some well-known CUSIPs
    test_cases = [
        ("594918104", "MICROSOFT CORP"),
        ("037833100", "APPLE INC"),
        ("30303M102", "META PLATFORMS INC"),
        ("67066G104", "NVIDIA CORP"),
        ("UNKNOWN99", "BERKSHIRE HATHAWAY INC"),
    ]

    print("\nCUSIP Mapping Test:")
    print("-" * 60)
    for cusip, name in test_cases:
        ticker = mapper.map_cusip(cusip, name)
        print(f"  {cusip}  {name:30s} -> {ticker}")

    print(f"\nStats: {mapper.get_stats()}")
