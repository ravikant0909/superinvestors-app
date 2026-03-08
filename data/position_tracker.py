"""
Position Tracker

Compares 13F holdings between two quarters to identify changes:
NEW, INCREASED, DECREASED, SOLD_OUT, UNCHANGED.

Computes share deltas, value deltas, and percentage changes.
"""

import logging
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class ChangeType(str, Enum):
    """Types of position changes between quarters."""
    NEW = "NEW"
    INCREASED = "INCREASED"
    DECREASED = "DECREASED"
    SOLD_OUT = "SOLD_OUT"
    UNCHANGED = "UNCHANGED"


# Threshold below which a share change is considered "UNCHANGED"
# (handles rounding, stock splits, small adjustments)
UNCHANGED_THRESHOLD_PCT = 0.5  # 0.5%


class PositionTracker:
    """Compares holdings between two quarters and categorizes changes."""

    def __init__(self, unchanged_threshold_pct: float = UNCHANGED_THRESHOLD_PCT):
        self.unchanged_threshold_pct = unchanged_threshold_pct

    def compare(
        self,
        current_holdings: list[dict],
        previous_holdings: list[dict],
        current_quarter: str = "",
        previous_quarter: str = "",
    ) -> dict:
        """
        Compare two quarters of holdings and return structured change data.

        Args:
            current_holdings: List of holding dicts from the latest filing.
            previous_holdings: List of holding dicts from the prior filing.
            current_quarter: Label for current quarter (e.g., "2025-Q4").
            previous_quarter: Label for previous quarter (e.g., "2025-Q3").

        Returns:
            Dict with summary stats and detailed per-position changes.
        """
        # Build lookup maps keyed by CUSIP
        current_map = self._build_holdings_map(current_holdings)
        previous_map = self._build_holdings_map(previous_holdings)

        all_cusips = set(current_map.keys()) | set(previous_map.keys())

        changes = []
        summary = {
            "new": 0,
            "increased": 0,
            "decreased": 0,
            "sold_out": 0,
            "unchanged": 0,
            "total_current": len(current_map),
            "total_previous": len(previous_map),
        }

        for cusip in sorted(all_cusips):
            curr = current_map.get(cusip)
            prev = previous_map.get(cusip)

            change = self._compute_change(cusip, curr, prev)
            changes.append(change)
            summary[change["change_type"].lower()] += 1

        # Sort: NEW first, then SOLD_OUT, then by absolute share delta descending
        change_type_order = {
            ChangeType.NEW: 0,
            ChangeType.SOLD_OUT: 1,
            ChangeType.INCREASED: 2,
            ChangeType.DECREASED: 3,
            ChangeType.UNCHANGED: 4,
        }
        changes.sort(
            key=lambda c: (
                change_type_order.get(ChangeType(c["change_type"]), 5),
                -abs(c.get("value_delta", 0)),
            )
        )

        # Compute portfolio-level totals
        total_current_value = sum(
            h.get("value", 0) for h in current_holdings
        )
        total_previous_value = sum(
            h.get("value", 0) for h in previous_holdings
        )

        return {
            "current_quarter": current_quarter,
            "previous_quarter": previous_quarter,
            "summary": summary,
            "total_current_value_thousands": total_current_value,
            "total_previous_value_thousands": total_previous_value,
            "portfolio_value_delta_thousands": total_current_value - total_previous_value,
            "portfolio_value_change_pct": (
                round(
                    (total_current_value - total_previous_value)
                    / total_previous_value
                    * 100,
                    2,
                )
                if total_previous_value > 0
                else None
            ),
            "changes": [self._serialize_change(c) for c in changes],
        }

    def get_significant_changes(
        self,
        comparison: dict,
        min_value_thousands: int = 10_000,
        exclude_unchanged: bool = True,
    ) -> list[dict]:
        """
        Filter comparison results to only significant changes.

        Args:
            comparison: Output from compare().
            min_value_thousands: Minimum position value ($K) to include.
            exclude_unchanged: Whether to exclude unchanged positions.

        Returns:
            Filtered list of change dicts.
        """
        results = []
        for change in comparison.get("changes", []):
            if exclude_unchanged and change["change_type"] == "UNCHANGED":
                continue

            # Check value threshold against the larger of current or previous
            max_value = max(
                change.get("current_value", 0),
                change.get("previous_value", 0),
            )
            if max_value < min_value_thousands:
                continue

            results.append(change)

        return results

    # -----------------------------------------------------------------
    # Internals
    # -----------------------------------------------------------------

    def _build_holdings_map(self, holdings: list[dict]) -> dict[str, dict]:
        """
        Build a map from CUSIP -> aggregated holding data.
        Aggregates multiple entries for the same CUSIP (e.g., different
        share classes or put/call entries).
        """
        holdings_map: dict[str, dict] = {}

        for h in holdings:
            cusip = h.get("cusip", "").strip().upper()
            if not cusip:
                continue

            if cusip in holdings_map:
                # Aggregate: sum shares and value
                existing = holdings_map[cusip]
                existing["shares"] += h.get("shares", 0)
                existing["value"] += h.get("value", 0)
            else:
                holdings_map[cusip] = {
                    "cusip": cusip,
                    "name_of_issuer": h.get("name_of_issuer", ""),
                    "ticker": h.get("ticker", cusip),
                    "title_of_class": h.get("title_of_class", ""),
                    "shares": h.get("shares", 0),
                    "value": h.get("value", 0),
                    "share_type": h.get("share_type", "SH"),
                    "put_call": h.get("put_call"),
                }

        return holdings_map

    def _compute_change(
        self,
        cusip: str,
        current: Optional[dict],
        previous: Optional[dict],
    ) -> dict:
        """Compute the change for a single position."""

        if current and not previous:
            # NEW position
            return {
                "cusip": cusip,
                "ticker": current.get("ticker", cusip),
                "name_of_issuer": current.get("name_of_issuer", ""),
                "change_type": ChangeType.NEW,
                "current_shares": current["shares"],
                "previous_shares": 0,
                "share_delta": current["shares"],
                "share_change_pct": None,  # infinite
                "current_value": current["value"],
                "previous_value": 0,
                "value_delta": current["value"],
                "current_weight_pct": None,  # computed later if needed
            }

        if previous and not current:
            # SOLD OUT
            return {
                "cusip": cusip,
                "ticker": previous.get("ticker", cusip),
                "name_of_issuer": previous.get("name_of_issuer", ""),
                "change_type": ChangeType.SOLD_OUT,
                "current_shares": 0,
                "previous_shares": previous["shares"],
                "share_delta": -previous["shares"],
                "share_change_pct": -100.0,
                "current_value": 0,
                "previous_value": previous["value"],
                "value_delta": -previous["value"],
            }

        # Both exist -- compare
        curr_shares = current["shares"]
        prev_shares = previous["shares"]
        share_delta = curr_shares - prev_shares

        if prev_shares > 0:
            share_change_pct = round(share_delta / prev_shares * 100, 2)
        else:
            share_change_pct = None

        curr_value = current["value"]
        prev_value = previous["value"]
        value_delta = curr_value - prev_value

        # Determine change type
        if share_change_pct is not None and abs(share_change_pct) <= self.unchanged_threshold_pct:
            change_type = ChangeType.UNCHANGED
        elif share_delta > 0:
            change_type = ChangeType.INCREASED
        elif share_delta < 0:
            change_type = ChangeType.DECREASED
        else:
            change_type = ChangeType.UNCHANGED

        return {
            "cusip": cusip,
            "ticker": current.get("ticker", "") or previous.get("ticker", cusip),
            "name_of_issuer": current.get("name_of_issuer", "")
                or previous.get("name_of_issuer", ""),
            "change_type": change_type,
            "current_shares": curr_shares,
            "previous_shares": prev_shares,
            "share_delta": share_delta,
            "share_change_pct": share_change_pct,
            "current_value": curr_value,
            "previous_value": prev_value,
            "value_delta": value_delta,
        }

    @staticmethod
    def _serialize_change(change: dict) -> dict:
        """Convert a change dict to JSON-serializable format."""
        result = dict(change)
        if isinstance(result.get("change_type"), ChangeType):
            result["change_type"] = result["change_type"].value
        return result


def format_quarter_label(report_date: str) -> str:
    """
    Convert a report date (e.g., '2025-09-30') to a quarter label (e.g., '2025-Q3').
    """
    if not report_date or len(report_date) < 7:
        return report_date

    try:
        year = report_date[:4]
        month = int(report_date[5:7])
        quarter = (month - 1) // 3 + 1
        return f"{year}-Q{quarter}"
    except (ValueError, IndexError):
        return report_date


# -----------------------------------------------------------------
# CLI usage
# -----------------------------------------------------------------

if __name__ == "__main__":
    # Demo with synthetic data
    previous = [
        {"cusip": "037833100", "name_of_issuer": "APPLE INC", "ticker": "AAPL",
         "shares": 1_000_000, "value": 150_000, "share_type": "SH"},
        {"cusip": "594918104", "name_of_issuer": "MICROSOFT CORP", "ticker": "MSFT",
         "shares": 500_000, "value": 200_000, "share_type": "SH"},
        {"cusip": "67066G104", "name_of_issuer": "NVIDIA CORP", "ticker": "NVDA",
         "shares": 200_000, "value": 100_000, "share_type": "SH"},
    ]

    current = [
        {"cusip": "037833100", "name_of_issuer": "APPLE INC", "ticker": "AAPL",
         "shares": 1_200_000, "value": 180_000, "share_type": "SH"},
        {"cusip": "594918104", "name_of_issuer": "MICROSOFT CORP", "ticker": "MSFT",
         "shares": 500_000, "value": 210_000, "share_type": "SH"},
        {"cusip": "30303M102", "name_of_issuer": "META PLATFORMS INC", "ticker": "META",
         "shares": 300_000, "value": 120_000, "share_type": "SH"},
    ]

    tracker = PositionTracker()
    result = tracker.compare(current, previous, "2025-Q4", "2025-Q3")

    print(f"\nPortfolio Changes: {result['previous_quarter']} -> {result['current_quarter']}")
    print(f"Summary: {result['summary']}")
    print(f"Portfolio value: ${result['total_previous_value_thousands']:,}K -> "
          f"${result['total_current_value_thousands']:,}K "
          f"({result['portfolio_value_change_pct']:+.1f}%)")
    print()

    for c in result["changes"]:
        print(
            f"  {c['change_type']:12s}  {c['ticker']:8s}  "
            f"{c['name_of_issuer']:25s}  "
            f"shares: {c['previous_shares']:>12,} -> {c['current_shares']:>12,}  "
            f"delta: {c['share_delta']:>+12,}"
        )
