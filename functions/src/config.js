/**
 * Shared constants for the Weekend Gap Tracker backend.
 */

// Binance Web3 API — every request is signed and served under this base path.
// See: https://web3.binance.com/en/dev-docs/authentication
const BINANCE_BASE_URL = "https://web3.binance.com/build";
const BUILD_PREFIX = "/build";

// BSC mainnet — the only chain in scope for this hackathon track.
const BSC_CHAIN_ID = "56";

// RWA Data "Get RWA Token List" sector tabs (tabId query param) — DOESN'T
// ACTUALLY FILTER. Confirmed live: tabId=1 and tabId=9 both return the
// identical 488-token full catalog in the same order. Kept only as a
// documented value to pass through (harmless), NOT relied on for scoping —
// see TRACKED_TICKERS below for the real, client-side filter, and NOTES.md
// for how this was found.
const SECTOR_TABS = {
  MAGNIFICENT_7: 9,
  AI_CHIPS: 4,
  ETF: 11,
  BUFFETT_PORTFOLIO: 13,
};

// RWA Data platformId values — confirmed live (real key, 2026-09-30):
// `Get RWA Token Issuance Platforms` and `Search RWA Token` both only ever
// return these two. xStocks is not indexed by this API at all, despite
// being named in the hackathon brief — see NOTES.md.
const PLATFORMS = {
  ONDO: "ondo",
  BSTOCK: "bstock",
};

// Since tabId doesn't filter (see SECTOR_TABS above), this is the real
// sector scope for the MVP dashboard: the actual "Magnificent 7" mega-cap
// tickers, filtered client-side in poll.js against underlyingTicker. Also
// bounds how many symbols marketData.js has to query per poll — keeps the
// external stock-quote lookups well within any free-tier rate limit.
const TRACKED_TICKERS = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"];

// Default sector we poll for the MVP dashboard. Change or add more tabIds
// once the pipeline is proven — pollRwaTokens() takes a tabId per call.
const DEFAULT_TAB_ID = SECTOR_TABS.MAGNIFICENT_7;

// A spread past this magnitude (in percent) gets flagged on the dashboard.
// tokenPrice vs realReferencePrice, see computeSpreadPct() in poll.js.
const SPREAD_FLAG_THRESHOLD_PCT = 1.0;

// Finnhub — real underlying market price, used instead of the RWA Data
// API's own `referencePrice` field, which turned out to be a derived value
// (tokenPrice / tokenToShareRatio), not an independent quote. See
// marketData.js and NOTES.md.
const FINNHUB_BASE_URL = "https://finnhub.io/api/v1";

// Stay well under Finnhub's free-tier 60 req/min limit even if something
// else is also polling with the same key.
const FINNHUB_THROTTLE_MS = 1100;

// USDT on BSC — the quote currency the trading flow swaps against by default.
const BSC_USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

// Default max slippage for the trading flow (percent). RWA/equity tokens
// settle through an RFQ vendor at a fixed quoted price, so this mainly
// matters for the (rare, non-RWA) plain-SWAP path.
const DEFAULT_SLIPPAGE_PCT = "0.5";

// GET /aggregator/quote + /aggregator/swap: for equity/RWA tokens (Ondo,
// BStock — see PLATFORMS above) executionMode is always "RFQ", settled by
// one of these vendors via EIP-712 signature + POST /order/submit, never
// the plain SWAP tx path. See NOTES.md for what this means for
// pre-transaction/simulate + broadcast-transaction (they don't apply here).
const RFQ_VENDORS = {
  INCH_FUSION: "InchFusion",
  COW_SWAP: "CowSwap",
  PCS_X_RFQ: "PcsXRfq",
};

// Terminal states for GET /order/{orderId} polling.
const RFQ_TERMINAL_STATUSES = new Set(["FILLED", "FAILED", "EXPIRED", "CANCELLED"]);

module.exports = {
  BINANCE_BASE_URL,
  BUILD_PREFIX,
  BSC_CHAIN_ID,
  BSC_USDT_ADDRESS,
  DEFAULT_SLIPPAGE_PCT,
  SECTOR_TABS,
  PLATFORMS,
  TRACKED_TICKERS,
  RFQ_VENDORS,
  RFQ_TERMINAL_STATUSES,
  DEFAULT_TAB_ID,
  SPREAD_FLAG_THRESHOLD_PCT,
  FINNHUB_BASE_URL,
  FINNHUB_THROTTLE_MS,
};
