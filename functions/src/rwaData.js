/**
 * Thin wrappers over the RWA Data + Market endpoints this project uses.
 * One function per endpoint, named after the docs' own endpoint titles,
 * so it's easy to find the matching page in
 * https://web3.binance.com/en/dev-docs/catalog/web3-wallet/api/rest-api/rwa-data
 */

/** GET /api/v1/dex/market/rwa/platforms — platformId omitted returns all platforms. */
function getRwaTokenIssuancePlatforms(client, { platformId } = {}) {
  return client.get("/api/v1/dex/market/rwa/platforms", { platformId });
}

/**
 * GET /api/v1/dex/market/rwa/tokens — the one call the dashboard MVP
 * actually runs on: for each token it returns tokenPrice, referencePrice
 * AND full statusInfo (openState, marketStatus, reasonMsg, nextOpenTime)
 * in a single response. tabId filters by sector (see SECTOR_TABS).
 */
function getRwaTokenList(client, { binanceChainId, platformId, tabId } = {}) {
  return client.get("/api/v1/dex/market/rwa/tokens", {
    binanceChainId,
    platformId,
    tabId,
  });
}

/** GET /api/v1/dex/market/rwa/price — batch price lookup by contract address, max 100. */
function getRwaTokenPrice(client, { binanceChainId, tokenContractAddresses }) {
  return client.get("/api/v1/dex/market/rwa/price", {
    binanceChainId,
    tokenContractAddresses,
  });
}

/** GET /api/v1/dex/market/rwa/search — ticker/company-name/address keyword search. */
function searchRwaToken(client, { keyword, platformId } = {}) {
  return client.get("/api/v1/dex/market/rwa/search", { keyword, platformId });
}

/** GET /api/v1/dex/market/rwa/underlying-profile — company info + attestation reports. */
function getRwaUnderlyingInfo(client, { binanceChainId, tokenContractAddress }) {
  return client.get("/api/v1/dex/market/rwa/underlying-profile", {
    binanceChainId,
    tokenContractAddress,
  });
}

/** GET /api/v1/dex/market/rwa/underlying-market — 52w range, PE, dividend yield, etc. */
function getRwaUnderlyingMarketData(client, { binanceChainId, tokenContractAddress }) {
  return client.get("/api/v1/dex/market/rwa/underlying-market", {
    binanceChainId,
    tokenContractAddress,
  });
}

/** GET /api/v1/dex/market/candles — bar in {1s,5s,30s,1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M}. */
function getCandles(client, { binanceChainId, tokenContractAddress, bar, after, before, limit }) {
  return client.get("/api/v1/dex/market/candles", {
    binanceChainId,
    tokenContractAddress,
    bar,
    after,
    before,
    limit,
  });
}

module.exports = {
  getRwaTokenIssuancePlatforms,
  getRwaTokenList,
  getRwaTokenPrice,
  searchRwaToken,
  getRwaUnderlyingInfo,
  getRwaUnderlyingMarketData,
  getCandles,
};
