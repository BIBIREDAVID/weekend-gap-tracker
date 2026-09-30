const { getRwaTokenList } = require("./rwaData");
const { getTokenBalancesByAddress } = require("./wallet");
const { getStockQuote } = require("./marketData");
const {
  BSC_CHAIN_ID,
  BSC_USDT_ADDRESS,
  DEFAULT_TAB_ID,
  TRACKED_TICKERS,
  SPREAD_FLAG_THRESHOLD_PCT,
  FINNHUB_THROTTLE_MS,
} = require("./config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Percent gap between the on-chain per-share token price and the REAL
 * underlying reference price. Positive = token trading above the reference
 * (premium); negative = below (discount). This is the core "weekend gap"
 * number the whole project is built around.
 *
 * `tokenPrice` here must already be normalized to a per-share basis
 * (tokenPrice / tokenToShareRatio) and `referencePrice` must come from an
 * independent source (marketData.js/Finnhub) — NOT the RWA Data API's own
 * `referencePrice` field, which is exactly `tokenPrice / tokenToShareRatio`
 * by construction (confirmed live, see NOTES.md), not an independent quote.
 * Comparing tokenPrice to that field always yields ~0%, or a fixed
 * ratio-driven number with nothing to do with a real price gap.
 */
function computeSpreadPct(tokenPrice, referencePrice) {
  const token = Number(tokenPrice);
  const ref = Number(referencePrice);
  if (!Number.isFinite(token) || !Number.isFinite(ref) || ref === 0) return null;
  return ((token - ref) / ref) * 100;
}

/** Reshape one raw RWA token-list entry into what the dashboard reads. */
function normalizeToken(raw, polledAt, quotesByTicker) {
  const tokenPrice = Number(raw.tokenPrice);
  const tokenToShareRatio = Number(raw.tokenToShareRatio) || 1;
  const perShareTokenPrice = tokenPrice / tokenToShareRatio;

  const quote = quotesByTicker.get(raw.underlyingTicker) || null;
  const realReferencePrice = quote ? quote.price : null;
  const spreadPct = realReferencePrice !== null ? computeSpreadPct(perShareTokenPrice, realReferencePrice) : null;

  const status = raw.statusInfo || {};
  return {
    id: `${raw.platformId}_${raw.binanceChainId}_${raw.tokenContractAddress}`,
    binanceChainId: raw.binanceChainId,
    tokenContractAddress: raw.tokenContractAddress,
    platformId: raw.platformId,
    tokenSymbol: raw.tokenSymbol,
    underlyingTicker: raw.underlyingTicker,
    underlyingName: raw.underlyingName,
    tokenPrice,
    tokenToShareRatio,
    // Kept for transparency/debugging only — NOT used for spreadPct. See
    // computeSpreadPct()'s docstring for why (it's derived from tokenPrice,
    // not an independent quote).
    platformReferencePrice: Number(raw.referencePrice),
    realReferencePrice,
    realReferencePriceSource: quote ? "finnhub" : null,
    spreadPct,
    flagged: spreadPct !== null && Math.abs(spreadPct) >= SPREAD_FLAG_THRESHOLD_PCT,
    openState: !!status.openState,
    marketStatus: status.marketStatus || null,
    reasonCode: status.reasonCode || null,
    reasonMsg: status.reasonMsg || null,
    nextOpenTime: status.nextOpenTime || null,
    nextCloseTime: status.nextCloseTime || null,
    volume24H: raw.volume24H ? Number(raw.volume24H) : null,
    marketCap: raw.marketCap ? Number(raw.marketCap) : null,
    polledAt,
  };
}

/**
 * Fetch a real reference price per unique underlying ticker, throttled to
 * stay within Finnhub's free-tier rate limit. Returns a Map<ticker, quote>;
 * a ticker Finnhub couldn't quote is simply absent (normalizeToken treats
 * that as "no real reference price yet", not a crash).
 */
async function fetchRealReferencePrices(finnhubApiKey, tickers) {
  const quotesByTicker = new Map();
  for (const ticker of tickers) {
    try {
      const quote = await getStockQuote(finnhubApiKey, ticker);
      if (quote) quotesByTicker.set(ticker, quote);
    } catch (err) {
      console.error(`Finnhub quote failed for ${ticker}:`, err.message);
    }
    await sleep(FINNHUB_THROTTLE_MS);
  }
  return quotesByTicker;
}

/**
 * Pull the tracked tickers' tokens, compute real spreads, and write:
 *  - `latest/{id}`     one doc per token, overwritten every poll — cheap
 *                      for the dashboard to subscribe to with onSnapshot.
 *  - `snapshots/{auto}` one doc per token per poll — the history the
 *                      spread chart and weekend-window view are built from.
 *
 * `db` is a firebase-admin Firestore instance, passed in rather than
 * initialized here so this stays unit-testable without booting Firebase.
 *
 * Note: `tabId` is accepted for API-compatibility but doesn't actually
 * filter the RWA Data API's response (confirmed live — see NOTES.md).
 * TRACKED_TICKERS is the real, client-side sector filter.
 */
async function pollRwaTokens(client, { db, finnhubApiKey, tabId = DEFAULT_TAB_ID, binanceChainId = BSC_CHAIN_ID }) {
  if (!finnhubApiKey) {
    throw new Error(
      "Missing finnhubApiKey — the spread metric needs a real reference price " +
        "from Finnhub (https://finnhub.io/register, free). See functions/.env.example.",
    );
  }

  const res = await getRwaTokenList(client, { binanceChainId, tabId });
  if (res.code !== 0) {
    throw new Error(`RWA token list returned code ${res.code}: ${res.msg}`);
  }

  const tracked = new Set(TRACKED_TICKERS);
  const rawTokens = (res.data || []).filter((raw) => tracked.has(raw.underlyingTicker));

  const uniqueTickers = [...new Set(rawTokens.map((raw) => raw.underlyingTicker))];
  const quotesByTicker = await fetchRealReferencePrices(finnhubApiKey, uniqueTickers);

  const polledAt = Date.now();
  const tokens = rawTokens.map((raw) => normalizeToken(raw, polledAt, quotesByTicker));

  const batch = db.batch();
  for (const t of tokens) {
    batch.set(db.collection("latest").doc(t.id), t);
    batch.set(db.collection("snapshots").doc(), t); // auto id, keeps history
  }
  await batch.commit();

  const flaggedCount = tokens.filter((t) => t.flagged).length;
  const missingQuoteCount = tokens.filter((t) => t.realReferencePrice === null).length;
  return { tabId, binanceChainId, tokenCount: tokens.length, flaggedCount, missingQuoteCount, polledAt, tokens };
}

/**
 * Wallet API balance snapshot for the dashboard's post-trade balance panel.
 * Queries native BNB + USDT (the quote currency every trade is against) +
 * whatever RWA tokens the current poll is tracking, so a token bought by
 * scripts/run-trade.js shows up here without any extra config. `address` is
 * the wallet's public address only — never the private key, so this can run
 * from the same GitHub Actions poll that has no signing capability.
 */
async function pollWalletBalance(client, { db, address, binanceChainId = BSC_CHAIN_ID, tokenContractAddresses = [] }) {
  if (!address) return null; // optional feature — no-op until WALLET_ADDRESS is configured

  const tokens = [
    { binanceChainId, tokenContractAddress: "" }, // native BNB
    { binanceChainId, tokenContractAddress: BSC_USDT_ADDRESS },
    ...tokenContractAddresses.map((tokenContractAddress) => ({ binanceChainId, tokenContractAddress })),
  ].slice(0, 20); // API limit

  const res = await getTokenBalancesByAddress(client, { address, tokens });
  if (res.code !== 0) {
    throw new Error(`Wallet balance lookup returned code ${res.code}: ${res.msg}`);
  }

  const polledAt = Date.now();
  const assets = (res.data || []).flatMap((chainEntry) => chainEntry.tokenAssets || []);
  const doc = {
    address,
    binanceChainId,
    assets: assets.map((a) => ({
      tokenContractAddress: a.tokenContractAddress,
      symbol: a.symbol,
      balance: a.balance,
      tokenPrice: a.tokenPrice ?? null,
      isRiskToken: !!a.isRiskToken,
    })),
    polledAt,
  };
  await db.collection("wallet").doc("latest").set(doc);
  return doc;
}

module.exports = { computeSpreadPct, normalizeToken, pollRwaTokens, pollWalletBalance };
