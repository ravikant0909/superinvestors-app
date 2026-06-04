"""
SuperInvestors Configuration

Investor list with verified CIK numbers, data paths, SEC settings.
CIK numbers verified via SEC EDGAR full-text search API (2026-03-04).
"""
import os
from pathlib import Path

# =============================================================================
# Paths
# =============================================================================

PROJECT_ROOT = Path(__file__).parent
CACHE_DIR = PROJECT_ROOT / "cache"
OUTPUT_DIR = PROJECT_ROOT / "output"
CUSIP_CACHE_FILE = PROJECT_ROOT / "cusip_ticker_map.json"

# Ensure directories exist
CACHE_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

# Google Drive output (syncs automatically)
GDRIVE_OUTPUT = Path(
    "/Users/ravf/Library/CloudStorage/GoogleDrive-ravikant0909@gmail.com/"
    "My Drive/Finance/Investments/AWB"
)

# =============================================================================
# SEC EDGAR Settings
# =============================================================================

SEC_USER_AGENT = "SuperInvestors Research ravikant0909@gmail.com"
SEC_BASE_URL = "https://www.sec.gov"
SEC_EDGAR_API = "https://data.sec.gov"
SEC_RATE_LIMIT = 10  # requests per second (SEC guideline)

# =============================================================================
# Investor Registry
#
# All CIK numbers verified via:
#   https://efts.sec.gov/LATEST/search-index?q="INVESTOR NAME"&forms=13F-HR
#
# Format: slug -> { name, cik, manager, style, description, files_13f }
#
# files_13f: True (default if omitted) = files SEC 13F-HR quarterly
#            False = non-US or inactive, pipeline should skip
# =============================================================================

INVESTORS = {
    # =========================================================================
    # ORIGINAL 10 INVESTORS
    # =========================================================================
    "berkshire_hathaway": {
        "name": "Berkshire Hathaway Inc",
        "cik": "1067983",
        "manager": "Warren Buffett / Ted Weschler / Todd Combs",
        "style": "Value",
        "description": "Conglomerate run by Warren Buffett. Largest US value investor.",
    },
    "himalaya_capital": {
        "name": "Himalaya Capital Management LLC",
        "cik": "1709323",
        "manager": "Li Lu",
        "style": "Deep Value",
        "description": "Charlie Munger's protege. Concentrated deep-value portfolio.",
    },
    "pabrai_funds": {
        "name": "Dalal Street, LLC",
        "cik": "1549575",
        "manager": "Mohnish Pabrai",
        "style": "Deep Value / Cloning",
        "description": "Buffett-style deep value. Concentrated, long-term holdings.",
    },
    "baupost_group": {
        "name": "Baupost Group LLC",
        "cik": "1061768",
        "manager": "Seth Klarman",
        "style": "Deep Value / Distressed",
        "description": "One of the largest hedge funds. Distressed and deep value.",
    },
    "tci_fund": {
        "name": "TCI Fund Management Ltd",
        "cik": "1647251",
        "manager": "Chris Hohn",
        "style": "Activist / Quality",
        "description": "UK-based activist. Concentrated quality compounders.",
    },
    "saber_capital": {
        "name": "Saber Capital Managment LLC",
        "cik": "1911378",
        "manager": "John Huber",
        "style": "Concentrated Value",
        "description": "Concentrated portfolio, 5-10 positions. Long-term compounders.",
    },
    "akre_capital": {
        "name": "Akre Capital Management LLC",
        "cik": "1112520",
        "manager": "Chuck Akre / Chris Cerrone / John Neff",
        "style": "Quality Compounders",
        "description": "Compounding machines. Buy and hold high-ROIC businesses.",
    },
    "appaloosa_management": {
        "name": "Appaloosa LP",
        "cik": "1656456",
        "manager": "David Tepper",
        "style": "Distressed / Opportunistic",
        "description": "Distressed debt turned equity. Bold, contrarian bets.",
    },
    "pershing_square": {
        "name": "Pershing Square Capital Management LP",
        "cik": "1336528",
        "manager": "Bill Ackman",
        "style": "Activist / Concentrated",
        "description": "Activist investor. 8-12 concentrated positions.",
    },
    "markel_gayner": {
        "name": "Markel Group Inc.",
        # FIXED 2026-06-01: old CIK 1034180 ("Markel-Gayner Asset Management LLC")
        # stopped filing in 2007. The active 13F filer is Markel Group Inc.
        "cik": "1096343",
        "manager": "Tom Gayner",
        "style": "Quality Value",
        "description": "Insurance company with Berkshire-like equity portfolio.",
    },
    # =========================================================================
    # NEW INVESTORS — ACTIVE 13F FILERS
    # =========================================================================
    "cas_investment": {
        "name": "CAS Investment Partners, LLC",
        "cik": "1697591",
        "manager": "Cliff Sosin",
        "style": "Concentrated Value",
        "description": "Concentrated, long-duration value investing. Few positions, high conviction.",
    },
    "oakcliff_capital": {
        "name": "Oakcliff Capital Partners, LP",
        "cik": "1657335",
        "manager": "Bryan Lawrence",
        "style": "Quality Value",
        "description": "Concentrated quality compounder portfolio. Long-term holder.",
    },
    "giverny_capital": {
        "name": "Giverny Capital Inc.",
        "cik": "1641864",
        "manager": "Francois Rochon",
        "style": "Quality Growth",
        "description": "Canadian manager filing 13F. Quality growth at reasonable prices.",
    },
    "fundsmith": {
        "name": "Fundsmith LLP",
        "cik": "1569205",
        "manager": "Terry Smith",
        "style": "Quality Compounders",
        "description": "UK-based, files 13F. Buy good companies, don't overpay, do nothing.",
    },
    "semper_augustus": {
        "name": "Semper Augustus Investments Group LLC",
        "cik": "1115373",
        "manager": "Christopher Bloomstran",
        "style": "Deep Value / Quality",
        "description": "Deep value with quality overlay. Concentrated, long-term holdings.",
    },
    "dorsey_asset": {
        "name": "Dorsey Asset Management, LLC",
        "cik": "1671657",
        "manager": "Pat Dorsey",
        "style": "Moat Investing",
        "description": "Former Morningstar director of equity research. Invests in wide-moat businesses.",
    },
    "gardner_russo": {
        "name": "Gardner Russo & Quinn LLC",
        "cik": "860643",
        "manager": "Thomas Russo",
        "style": "Global Value",
        "description": "Global value investor. Focuses on companies with capacity to reinvest.",
    },
    "chou_associates": {
        "name": "Chou Associates Management Inc.",
        "cik": "1389403",
        "manager": "Francis Chou",
        "style": "Deep Value / Contrarian",
        "description": "Canadian manager filing 13F. Deep value, contrarian, distressed situations.",
    },
    "harris_associates": {
        "name": "Harris Associates L P",
        "cik": "813917",
        "manager": "Bill Nygren",
        "style": "Value",
        "description": "Oakmark Funds. Large-cap value with long-term horizon.",
    },
    "davis_advisors": {
        "name": "Davis Selected Advisers",
        "cik": "1036325",
        "manager": "Chris Davis",
        "style": "Quality Value",
        "description": "Multi-generational investment firm. Durable business franchises.",
    },
    "ruane_cunniff": {
        "name": "Ruane, Cunniff & Goldfarb L.P.",
        "cik": "1720792",
        "manager": "David Poppe",
        "style": "Quality Growth",
        "description": "Sequoia Fund managers. Concentrated quality growth portfolio.",
    },
    "century_management": {
        "name": "Van Den Berg Management I, Inc",
        "cik": "1142062",
        "manager": "Arnold Van Den Berg",
        "style": "Deep Value",
        "description": "Century Management. Deep value investing with margin of safety focus.",
    },
    "horizon_kinetics": {
        "name": "Horizon Kinetics Asset Management LLC",
        "cik": "1056823",
        "manager": "Murray Stahl",
        "style": "Contrarian / Real Assets",
        "description": "Contrarian investor focused on real assets, royalties, and inflation hedges.",
    },
    "lone_pine": {
        "name": "Lone Pine Capital LLC",
        "cik": "1061165",
        "manager": "Stephen Mandel",
        "style": "Long/Short Growth",
        "description": "Tiger cub. Growth-oriented long/short equity. Large AUM.",
    },
    "fairfax_financial": {
        "name": "Fairfax Financial Holdings Ltd",
        "cik": "915191",
        "manager": "Prem Watsa",
        "style": "Deep Value / Insurance",
        "description": "Canadian insurer filing 13F. Berkshire-like model with deep value approach.",
    },
    "atreides_management": {
        "name": "Atreides Management, LP",
        "cik": "1777813",
        "manager": "Gavin Baker",
        "style": "Tech / Growth",
        "description": "Former Fidelity PM. Technology-focused growth investing.",
    },
    "coatue_management": {
        "name": "Coatue Management LLC",
        "cik": "1135730",
        "manager": "Philippe Laffont",
        "style": "Tech / Growth",
        "description": "Tiger cub. Technology-focused, data-driven hedge fund. Large AUM.",
    },
    "punch_card": {
        "name": "Punch Card Management L.P.",
        "cik": "1631664",
        "manager": "Norbert Lou",
        "style": "Concentrated Value",
        "description": "Ultra-concentrated portfolio. Buffett's punch card philosophy in practice.",
    },
    "situational_awareness": {
        "name": "Situational Awareness LP",
        "cik": "2045724",
        "manager": "Leopold Aschenbrenner / Carl Shulman",
        "style": "Thematic / AGI Infrastructure",
        "description": "AGI-thesis hedge fund. $5.5B in AI infrastructure: data centers, power, chips, networking.",
    },
    # =========================================================================
    # NON-US / INACTIVE — DO NOT FILE 13F (or stopped filing)
    # =========================================================================
    "rv_capital": {
        "name": "RV Capital AG",
        "cik": "1766596",
        "manager": "Robert Vinall",
        "style": "Quality Compounders",
        "description": "Swiss-based. Files 13F but irregularly (13F-HR). Concentrated quality portfolio.",
        "files_13f": False,  # Swiss — files sporadically, not reliable for quarterly tracking
    },
    "lindsell_train": {
        "name": "Lindsell Train Ltd",
        "cik": "1484150",
        "manager": "Nick Train",
        "style": "Quality Compounders",
        "description": "UK-based. Files 13F. Ultra-low turnover, durable franchise businesses.",
        "files_13f": False,  # UK — files 13F but holdings are mostly non-US; limited value
    },
    "arlington_value": {
        "name": "Arlington Value Capital, LLC",
        "cik": "1568820",
        "manager": "Allan Mecham",
        "style": "Concentrated Value",
        "description": "Returned outside capital ~2020. Last 13F filed 2020-05-15. INACTIVE.",
        "files_13f": False,  # Returned capital mid-2020, no longer filing
    },
    # =========================================================================
    # ADDITIONAL INVESTORS — VERIFIED 13F FILERS
    # =========================================================================
    "altimeter_capital": {
        "name": "Altimeter Capital Management, LP",
        "cik": "1541617",
        "manager": "Brad Gerstner",
        "style": "Tech Growth",
        "description": "Tech-focused growth investor.",
    },
    "biglari_capital": {
        "name": "Biglari Capital Corp.",
        "cik": "1334429",
        "manager": "Sardar Biglari",
        "style": "Concentrated Value",
        "description": "Buffett-inspired concentrated investor.",
    },
    "bridgewater": {
        "name": "Bridgewater Associates, LP",
        "cik": "1350694",
        "manager": "Ray Dalio",
        "style": "Macro / Risk Parity",
        "description": "World's largest hedge fund. Macro and risk parity.",
    },
    "d1_capital": {
        "name": "D1 Capital Partners L.P.",
        "cik": "1747057",
        "manager": "Dan Sundheim",
        "style": "Long/Short Growth",
        "description": "Tiger Cub. Growth-oriented.",
    },
    "druckenmiller_duquesne": {
        "name": "Duquesne Family Office LLC",
        "cik": "1536411",
        "manager": "Stanley Druckenmiller",
        "style": "Macro / Growth",
        "description": "Macro legend, now running family office. Concentrated growth bets.",
    },
    "durable_capital": {
        "name": "Durable Capital Partners LP",
        "cik": "1798849",
        "manager": "Henry Ellenbogen",
        "style": "Growth at Reasonable Price",
        "description": "Former T. Rowe Price star. Long-term growth compounders.",
    },
    "elliott_investment": {
        "name": "Elliott Investment Management L.P.",
        "cik": "1791786",
        "manager": "Paul Singer",
        "style": "Activist / Multi-Strategy",
        "description": "Activist, distressed, multi-strategy.",
    },
    "fairholme_capital": {
        "name": "Fairholme Capital Management LLC",
        "cik": "1056831",
        "manager": "Bruce Berkowitz",
        "style": "Concentrated Value",
        "description": "Ultra-concentrated deep value.",
    },
    "gamco_investors": {
        "name": "GAMCO Investors, Inc.",
        "cik": "807249",
        "manager": "Mario Gabelli",
        "style": "Value",
        "description": "Classic value investor, PMV methodology.",
    },
    "glenview_capital": {
        "name": "Glenview Capital Management, LLC",
        "cik": "1138995",
        "manager": "Larry Robbins",
        "style": "Healthcare / Value",
        "description": "Healthcare-focused value investor.",
    },
    "goehring_rozencwajg": {
        "name": "Goehring & Rozencwajg Associates, LLC",
        "cik": "1863154",
        "manager": "Leigh Goehring & Adam Rozencwajg",
        "style": "Natural Resources",
        "description": "Commodity and natural resource specialists.",
    },
    "greenlight_capital": {
        "name": "Greenlight Capital, Inc.",
        # NEEDS REVIEW 2026-06-01: CIK 1079114 is correct ("GREENLIGHT CAPITAL INC")
        # but SEC shows no 13F-HR from this CIK since 2024-02-14 (Q4 2023). Verify
        # whether Greenlight stopped filing, dropped below the $100M threshold, or
        # now files under a different entity before relying on this filer's data.
        "cik": "1079114",
        "manager": "David Einhorn",
        "style": "Value / Activist",
        "description": "Value-oriented, occasional activist.",
    },
    "icahn_enterprises": {
        "name": "Icahn Capital LP",
        "cik": "921669",
        "manager": "Carl Icahn",
        "style": "Activist",
        "description": "Legendary corporate activist.",
    },
    "maverick_capital": {
        "name": "Maverick Capital, Ltd.",
        "cik": "934639",
        "manager": "Lee Ainslie",
        "style": "Long/Short Equity",
        "description": "Tiger Cub. Long/short equity.",
    },
    "miller_value": {
        "name": "Miller Value Partners, LLC",
        "cik": "1135778",
        "manager": "Bill Miller",
        "style": "Value / Contrarian",
        "description": "15-year S&P streak. Deep value contrarian.",
    },
    "orbimed_advisors": {
        "name": "OrbiMed Advisors LLC",
        "cik": "1055951",
        "manager": "Samuel Isaly",
        "style": "Healthcare",
        "description": "Healthcare-focused investment firm.",
    },
    "paulson_co": {
        "name": "Paulson & Co. Inc.",
        "cik": "1035674",
        "manager": "John Paulson",
        "style": "Event-Driven / Macro",
        "description": "Made $15B on subprime trade. Event-driven.",
    },
    "scion_asset": {
        "name": "Scion Asset Management, LLC",
        "cik": "1649339",
        "manager": "Michael Burry",
        "style": "Deep Value / Contrarian",
        "description": "The Big Short. Deep contrarian value.",
    },
    "shawspring": {
        "name": "ShawSpring Partners LLC",
        "cik": "1766908",
        "manager": "Dennis Hong",
        "style": "Quality Growth",
        "description": "Concentrated, long-term quality growth.",
    },
    "soros_fund": {
        "name": "Soros Fund Management LLC",
        "cik": "1029160",
        "manager": "George Soros",
        "style": "Macro / Multi-Strategy",
        "description": "Legendary macro investor.",
    },
    "srs_investment": {
        "name": "SRS Investment Management, LLC",
        "cik": "1503174",
        "manager": "Karthik Sarma",
        "style": "Concentrated Value",
        "description": "Ultra-concentrated, deep value.",
    },
    "starboard_value": {
        "name": "Starboard Value LP",
        "cik": "1517137",
        "manager": "Jeff Smith",
        "style": "Activist Value",
        "description": "Activist investor, operational improvements.",
    },
    "tang_capital": {
        "name": "Tang Capital Management LLC",
        "cik": "1232621",
        "manager": "Kevin Tang",
        "style": "Healthcare / Biotech",
        "description": "Healthcare and biotech specialist.",
    },
    "third_avenue": {
        "name": "Third Avenue Management LLC",
        "cik": "1099281",
        "manager": "Marty Whitman",
        "style": "Deep Value",
        "description": "Graham-style deep value, asset-focused.",
    },
    "third_point": {
        "name": "Third Point LLC",
        "cik": "1040273",
        "manager": "Dan Loeb",
        "style": "Event-Driven / Activist",
        "description": "Event-driven, activist campaigns.",
    },
    "tiger_global": {
        "name": "Tiger Global Management LLC",
        "cik": "1167483",
        "manager": "Chase Coleman",
        "style": "Tech Growth",
        "description": "Tiger Cub. Global tech growth.",
    },
    "trian_fund": {
        "name": "Trian Fund Management, L.P.",
        "cik": "1345471",
        "manager": "Nelson Peltz",
        "style": "Activist",
        "description": "Operational activist, board seats.",
    },
    "turtle_creek": {
        "name": "Turtle Creek Asset Management Inc.",
        "cik": "1484148",
        "manager": "Andrew Brenton",
        "style": "Concentrated Value",
        "description": "Canadian value investor, very concentrated.",
    },
    "viking_global": {
        "name": "Viking Global Investors LP",
        "cik": "1103804",
        "manager": "Andreas Halvorsen",
        "style": "Long/Short Equity",
        "description": "Tiger Cub. Large-cap growth and value.",
    },
    "weitz_investment": {
        "name": "Weitz Investment Management, Inc.",
        "cik": "883965",
        "manager": "Wally Weitz",
        "style": "Value",
        "description": "Classic value investor, concentrated portfolios.",
    },
    "whale_rock": {
        "name": "Whale Rock Capital Management LLC",
        "cik": "1387322",
        "manager": "Alex Sacerdote",
        "style": "Tech Growth",
        "description": "Technology growth specialist.",
    },
    # =========================================================================
    # COVERAGE EXPANSION (2026-06) — concentrated / quality managers
    # =========================================================================
    "ark_invest": {
        "name": "ARK Investment Management LLC",
        "cik": "1697748",
        "manager": "Cathie Wood",
        "style": "Disruptive Growth",
        "description": "Thematic disruptive-innovation ETFs. High-conviction, high-turnover growth.",
    },
    "gqg_partners": {
        "name": "GQG Partners LLC",
        "cik": "1697233",
        "manager": "Rajiv Jain",
        "style": "Quality Growth",
        "description": "Quality-growth manager across US and emerging markets.",
    },
    "royce_associates": {
        "name": "Royce & Associates LP",
        "cik": "906304",
        "manager": "Chuck Royce",
        "style": "Small-Cap Value",
        "description": "Small-cap value specialist; very broad portfolio.",
        "max_quarters": 4,
    },
    "southeastern_asset": {
        "name": "Southeastern Asset Management Inc",
        "cik": "807985",
        "manager": "Mason Hawkins",
        "style": "Concentrated Value",
        "description": "Longleaf Partners. Concentrated, long-term intrinsic-value investing.",
    },
    "first_eagle": {
        "name": "First Eagle Investment Management LLC",
        "cik": "1325447",
        "manager": "Matthew McLennan / Jean-Marie Eveillard",
        "style": "Global Value",
        "description": "Global value with a gold/cash margin of safety; broad portfolio.",
        "max_quarters": 4,
    },
    "oaktree_capital": {
        "name": "Oaktree Capital Management LP",
        "cik": "949509",
        "manager": "Howard Marks / Bruce Karsh",
        "style": "Distressed / Credit",
        "description": "Distressed debt and credit-oriented value. Marks/Karsh.",
    },
    "daily_journal": {
        "name": "Daily Journal Corp",
        "cik": "783412",
        "manager": "Charlie Munger",
        "style": "Concentrated Value",
        "description": "Munger's tiny, ultra-concentrated securities portfolio at Daily Journal.",
    },
    "tweedy_browne": {
        "name": "Tweedy, Browne Company LLC",
        "cik": "732905",
        "manager": "Tweedy Browne",
        "style": "Global Value",
        "description": "Graham-lineage global deep-value firm.",
    },
    "baker_bros": {
        "name": "Baker Bros. Advisors LP",
        "cik": "1263508",
        "manager": "Julian & Felix Baker",
        "style": "Biotech",
        "description": "Concentrated long-term biotech investing.",
    },
    "tudor_investment": {
        "name": "Tudor Investment Corp",
        "cik": "923093",
        "manager": "Paul Tudor Jones",
        "style": "Global Macro",
        "description": "Macro trading firm; broad, fast-changing book.",
        "max_quarters": 4,
    },
    "apollo_management": {
        "name": "Apollo Management Holdings LP",
        "cik": "1449434",
        "manager": "Leon Black / Marc Rowan",
        "style": "Private Equity / Credit",
        "description": "Alternative-asset manager; 13F covers public-equity stakes.",
        "max_quarters": 4,
    },
    "de_shaw": {
        "name": "D. E. Shaw & Co., Inc.",
        "cik": "1009207",
        "manager": "David Shaw",
        "style": "Quantitative",
        "description": "Quant multi-strategy firm; very large 13F book.",
        "max_quarters": 4,
    },
    "gotham_asset": {
        "name": "Gotham Asset Management LLC",
        "cik": "1510387",
        "manager": "Joel Greenblatt",
        "style": "Quant Value (Magic Formula)",
        "description": "Systematic value (magic formula); broad long book.",
        "max_quarters": 4,
    },
    "esl_investments": {
        "name": "RBS Partners, L.P. (ESL Investments)",
        "cik": "860585",
        "manager": "Eddie Lampert",
        "style": "Concentrated Value",
        "description": "Lampert's ESL. Concentrated; public 13F book wound down (last filed 2022).",
    },
    # =========================================================================
    # COVERAGE EXPANSION — quant / multi-strategy giants (huge 13Fs, depth-capped)
    # =========================================================================
    "aqr_capital": {
        "name": "AQR Capital Management LLC",
        "cik": "1167557",
        "manager": "Cliff Asness",
        "style": "Quantitative",
        "description": "Systematic factor investing; very large 13F book.",
        "max_quarters": 4,
    },
    "citadel_advisors": {
        "name": "Citadel Advisors LLC",
        "cik": "1423053",
        "manager": "Ken Griffin",
        "style": "Multi-Strategy / Market-Making",
        "description": "Multi-strategy hedge fund; thousands of positions (market-making book).",
        "max_quarters": 2,
    },
    "renaissance_tech": {
        "name": "Renaissance Technologies LLC",
        "cik": "1037389",
        "manager": "Jim Simons",
        "style": "Quantitative",
        "description": "Quant pioneer (Medallion). Thousands of statistical positions.",
        "max_quarters": 2,
    },
    "point72": {
        "name": "Point72 Asset Management, L.P.",
        "cik": "1603466",
        "manager": "Steve Cohen",
        "style": "Multi-Strategy",
        "description": "Cohen's multi-strategy fund; broad book.",
        "max_quarters": 4,
    },
    "two_sigma": {
        "name": "Two Sigma Investments, LP",
        "cik": "1179392",
        "manager": "John Overdeck & David Siegel",
        "style": "Quantitative",
        "description": "Data-driven quant fund; thousands of positions.",
        "max_quarters": 2,
    },
    # =========================================================================
    # COVERAGE EXPANSION — historical (filed 13F, since wound down / inactive)
    # =========================================================================
    "hayman_capital": {
        "name": "Hayman Capital Management, L.P.",
        "cik": "1420192",
        "manager": "Kyle Bass",
        "style": "Global Macro",
        "description": "Macro/special-situations. Public 13F book mostly wound down (last ~2016).",
    },
    "ruane_cunniff_goldfarb": {
        "name": "Ruane, Cunniff & Goldfarb Inc",
        "cik": "728014",
        "manager": "Robert Goldfarb",
        "style": "Concentrated Value",
        "description": "Sequoia Fund under Goldfarb. Historical 13Fs (through ~2018).",
    },
    "wintergreen_advisers": {
        "name": "Wintergreen Advisers, LLC",
        "cik": "1360079",
        "manager": "David Winters",
        "style": "Global Value",
        "description": "Global value; fund wound down (last 13F ~2019).",
    },
    "praetorian_capital": {
        "name": "Praetorian Capital Management LLC",
        "cik": "1337851",
        "manager": "Harris Kupperman",
        "style": "Global Macro / Inflation",
        "description": "Concentrated macro/inflation themes (Kuppy). Historical 13Fs (~through 2023).",
    },
}

# =============================================================================
# Quarter Configuration
# =============================================================================

# Quarter end dates for 13F filings
QUARTER_END_DATES = {
    1: "03-31",
    2: "06-30",
    3: "09-30",
    4: "12-31",
}

# 13F filing deadlines (45 days after quarter end)
QUARTER_DEADLINES = {
    1: {"end": "03-31", "deadline": "05-15"},
    2: {"end": "06-30", "deadline": "08-14"},
    3: {"end": "09-30", "deadline": "11-14"},
    4: {"end": "12-31", "deadline": "02-14"},
}

# How many quarters of history to fetch per investor (default)
DEFAULT_QUARTERS_BACK = 12  # 3 years

# =============================================================================
# Logging
# =============================================================================

LOG_FILE = PROJECT_ROOT / "pipeline.log"
