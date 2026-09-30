/**
 * Thin wrappers over the Trading API + pre/post-transaction endpoints,
 * same one-function-per-endpoint style as rwaData.js. See
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/trading-api
 *
 * IMPORTANT — RFQ vs SWAP: `GET /swap` returns `executionMode`, either
 * "SWAP" (sign+broadcast the returned `tx`) or "RFQ" (sign `rfq.typedDataToSign`
 * with EIP-712 and settle via order/submit). Equity/RWA tokens — Ondo and
 * BStock, the platforms this project trades — always come back as RFQ.
 * simulateTransaction/broadcastTransaction below exist for completeness
 * (e.g. a plain BNB/USDT top-up swap) but the gap-trade flow in
 * scripts/run-trade.js uses the RFQ path, not those two.
 */

/** GET /api/v1/dex/aggregator/quote — one route per vendor, sorted by toTokenAmount desc. */
function getAggregatedQuote(
  client,
  { binanceChainId, amount, fromTokenAddress, toTokenAddress, userWalletAddress, vendor },
) {
  return client.get("/api/v1/dex/aggregator/quote", {
    binanceChainId,
    amount,
    fromTokenAddress,
    toTokenAddress,
    userWalletAddress,
    vendor,
  });
}

/**
 * GET /api/v1/dex/aggregator/swap — build calldata for a quoted route.
 * `quoteId` must come from a `/quote` call within its ~30s TTL.
 */
function buildSwapTransaction(
  client,
  {
    binanceChainId,
    amount,
    fromTokenAddress,
    toTokenAddress,
    userWalletAddress,
    quoteId,
    slippagePercent,
    approveTransaction,
  },
) {
  return client.get("/api/v1/dex/aggregator/swap", {
    binanceChainId,
    amount,
    fromTokenAddress,
    toTokenAddress,
    userWalletAddress,
    quoteId,
    slippagePercent,
    approveTransaction,
  });
}

/**
 * POST /api/v1/dex/aggregator/order/submit — settle an RFQ route.
 * `userSignature` is the EIP-712 signature of `rfq.typedDataToSign` from
 * `/swap`. `quoteId` here is the SAME quoteId passed into `/swap`, not
 * a separate `rfq.orderId` field — see NOTES.md, the docs describe this
 * field inconsistently with what `/swap` actually returns.
 */
function submitRfqOrder(client, { requestId, userSignature, vendor, quoteId, signingScheme }) {
  return client.post("/api/v1/dex/aggregator/order/submit", {
    requestId,
    userSignature,
    vendor,
    quoteId,
    signingScheme,
  });
}

/** GET /api/v1/dex/aggregator/order/{orderId} — poll until a terminal status (see RFQ_TERMINAL_STATUSES). */
function getRfqOrderStatus(client, { orderId }) {
  return client.get(`/api/v1/dex/aggregator/order/${encodeURIComponent(orderId)}`);
}

/** POST /api/v1/dex/pre-transaction/simulate — off-chain dry run of a signed-or-unsigned EVM tx. Plain-SWAP path only. */
function simulateTransaction(client, { binanceChainId, evmTx }) {
  return client.post("/api/v1/dex/pre-transaction/simulate", { binanceChainId, evmTx });
}

/** POST /api/v1/dex/pre-transaction/broadcast-transaction — relay a client-signed raw tx. Plain-SWAP path only. */
function broadcastTransaction(client, { binanceChainId, signedTransaction, address, enableMevProtection }) {
  return client.post("/api/v1/dex/pre-transaction/broadcast-transaction", {
    binanceChainId,
    signedTransaction,
    address,
    enableMevProtection,
  });
}

module.exports = {
  getAggregatedQuote,
  buildSwapTransaction,
  submitRfqOrder,
  getRfqOrderStatus,
  simulateTransaction,
  broadcastTransaction,
};
