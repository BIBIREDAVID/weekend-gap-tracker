const axios = require("axios");
const { FINNHUB_BASE_URL } = require("./config");

/**
 * Real underlying market price — the thing the RWA Data API's own
 * `referencePrice` field turned out NOT to be (see NOTES.md: it's exactly
 * `tokenPrice / tokenToShareRatio`, a derived value, not an independent
 * quote). Finnhub's `/quote` returns the last trade price during market
 * hours and holds at the last close while the market is shut — exactly the
 * "frozen over the weekend" reference this project needs to diff against.
 *
 * Free tier: https://finnhub.io/register (no card required), 60 req/min.
 */
async function getStockQuote(apiKey, symbol) {
  const resp = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
    params: { symbol, token: apiKey },
    timeout: 10_000,
  });
  const { c: price, pc: previousClose, t: quoteTime } = resp.data || {};
  if (!price) return null; // Finnhub returns c=0 for an unknown/delisted symbol
  return { price, previousClose, quoteTime };
}

module.exports = { getStockQuote };
