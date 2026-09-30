const crypto = require("crypto");
const axios = require("axios");
const { BINANCE_BASE_URL, BUILD_PREFIX } = require("./config");

/**
 * Binance Web3 API client — HMAC-SHA256 request signing.
 *
 * Spec: https://web3.binance.com/en/dev-docs/authentication
 *
 * The #1 documented cause of `40102 Invalid signature` is a signed
 * requestPath that omits the `/build` prefix, or a query string that's
 * encoded differently in the signature than on the wire. This client
 * builds the query string once and reuses the exact same string for both,
 * so there's no way for the two to drift apart.
 *
 * apiKey / secretKey are read once at construction time — pass them in
 * explicitly (from Firebase Secret Manager in production, from
 * functions/.env in the emulator) rather than reaching into process.env
 * here, so this file stays testable without Firebase running.
 */
class BinanceWeb3Client {
  constructor({ apiKey, secretKey }) {
    if (!apiKey || !secretKey) {
      throw new Error(
        "BinanceWeb3Client requires both apiKey and secretKey. " +
          "Get them from https://web3.binance.com/en/dev-portal/project",
      );
    }
    this.apiKey = apiKey;
    this.secretKey = secretKey;
  }

  /** Raw-encoded query string, e.g. "chainId=1&symbol=ETH%20USDT". Stable key order. */
  static buildQueryString(params = {}) {
    const entries = Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== null,
    );
    if (entries.length === 0) return "";
    return entries
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
  }

  /** signature = Base64(HMAC-SHA256(timestamp + METHOD + requestPath + body, secretKey)) */
  sign({ timestamp, method, requestPath, body }) {
    const preHash = `${timestamp}${method}${requestPath}${body}`;
    return crypto
      .createHmac("sha256", this.secretKey)
      .update(preHash, "utf8")
      .digest("base64");
  }

  async request(method, path, { query, body } = {}) {
    const queryStr = BinanceWeb3Client.buildQueryString(query);
    const pathWithQuery = queryStr ? `${path}?${queryStr}` : path;
    // Signed requestPath MUST carry the /build prefix — see module docstring.
    const requestPath = BUILD_PREFIX + pathWithQuery;
    const timestamp = new Date().toISOString();
    const bodyStr =
      method === "GET" || method === "HEAD" ? "" : body ? JSON.stringify(body) : "";

    const signature = this.sign({
      timestamp,
      method: method.toUpperCase(),
      requestPath,
      body: bodyStr,
    });

    const headers = {
      "X-OC-APIKEY": this.apiKey,
      "X-OC-TIMESTAMP": timestamp,
      "X-OC-SIGN": signature,
    };
    if (bodyStr) headers["Content-Type"] = "application/json";

    try {
      const resp = await axios.request({
        method,
        url: BINANCE_BASE_URL + pathWithQuery,
        headers,
        data: bodyStr || undefined,
        timeout: 10_000,
      });
      return resp.data;
    } catch (err) {
      if (err.response) {
        // Surface the API's own error shape ({code, msg, data, timestamp})
        // rather than axios's generic "Request failed with status code 401".
        const { status, data } = err.response;
        const apiMsg = data && data.msg ? data.msg : JSON.stringify(data);
        const apiCode = data && data.code;
        throw new Error(
          `Binance Web3 API ${status} (code ${apiCode}) on ${method} ${path}: ${apiMsg}`,
        );
      }
      throw err;
    }
  }

  get(path, query) {
    return this.request("GET", path, { query });
  }

  post(path, body) {
    return this.request("POST", path, { body });
  }
}

module.exports = { BinanceWeb3Client };
