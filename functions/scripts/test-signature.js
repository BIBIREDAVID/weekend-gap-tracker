#!/usr/bin/env node
/**
 * Day-1 sanity check: one signed call, no Firebase involved.
 *
 * Run once you have an API key + secret from
 * https://web3.binance.com/en/dev-portal/project :
 *
 *   cd functions
 *   npm install
 *   cp .env.example .env   # fill in OC_API_KEY / OC_SECRET_KEY
 *   node scripts/test-signature.js
 *
 * Prints the RWA token-issuance-platforms list on success, or the API's
 * own {code, msg} error on failure (e.g. 40102 Invalid signature — see
 * binanceClient.js's docstring for the #1 cause of that one).
 */
require("dotenv").config();
const { BinanceWeb3Client } = require("../src/binanceClient");
const { getRwaTokenIssuancePlatforms } = require("../src/rwaData");

async function main() {
  const apiKey = process.env.OC_API_KEY;
  const secretKey = process.env.OC_SECRET_KEY;
  if (!apiKey || !secretKey) {
    console.error(
      "Missing OC_API_KEY / OC_SECRET_KEY.\n" +
        "Copy functions/.env.example to functions/.env and fill them in, " +
        "or get credentials from https://web3.binance.com/en/dev-portal/project",
    );
    process.exit(1);
  }

  const client = new BinanceWeb3Client({ apiKey, secretKey });
  console.log("Calling GET /api/v1/dex/market/rwa/platforms ...");
  const res = await getRwaTokenIssuancePlatforms(client);
  console.log(JSON.stringify(res, null, 2));

  const platformIds = (res.data || []).map((p) => p.platformId);
  console.log("\nplatformIds returned:", platformIds);
  console.log(
    "(Docs only enumerate ondo/bstock for this field — note in NOTES.md " +
      "whether xStocks shows up here or needs a different lookup.)",
  );
}

main().catch((err) => {
  console.error("Call failed:", err.message);
  process.exit(1);
});
