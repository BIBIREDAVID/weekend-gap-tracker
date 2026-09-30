#!/usr/bin/env node
/**
 * Standalone poll runner for GitHub Actions (Firebase Spark plan has no
 * scheduled Cloud Functions — those require Blaze). Same pollRwaTokens()
 * logic as the old scheduled function, just invoked by cron elsewhere and
 * authenticated with a service account instead of the Functions runtime.
 *
 * Env vars (see .github/workflows/poll.yml):
 *   OC_API_KEY, OC_SECRET_KEY        Binance Web3 credentials
 *   FINNHUB_API_KEY                  real reference price — https://finnhub.io/register
 *   FIREBASE_SERVICE_ACCOUNT_JSON    full service account key JSON, as a string (GitHub
 *                                    Actions secrets handle embedded newlines fine — it's
 *                                    only a dotenv/.env FILE that requires one line)
 *   FIREBASE_SERVICE_ACCOUNT_PATH    local-dev alternative: path to the downloaded .json
 *                                    file itself, so you never have to reformat it
 */
require("dotenv").config();
const fs = require("fs");
const admin = require("firebase-admin");
const { BinanceWeb3Client } = require("../src/binanceClient");
const { pollRwaTokens, pollWalletBalance } = require("../src/poll");

function loadServiceAccount() {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (path) return JSON.parse(fs.readFileSync(path, "utf8"));

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "Missing FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH. Generate one " +
        "from Firebase console > Project settings > Service accounts > Generate new private " +
        "key. For local runs, FIREBASE_SERVICE_ACCOUNT_PATH pointing at the downloaded file " +
        "is easiest; GitHub Actions secrets need FIREBASE_SERVICE_ACCOUNT_JSON instead, since " +
        "there's no file to point at there.",
    );
  }
  return JSON.parse(raw);
}

async function main() {
  const apiKey = process.env.OC_API_KEY;
  const secretKey = process.env.OC_SECRET_KEY;
  const finnhubApiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey || !secretKey) {
    console.error("Missing OC_API_KEY / OC_SECRET_KEY.");
    process.exit(1);
  }
  if (!finnhubApiKey) {
    console.error("Missing FINNHUB_API_KEY — see functions/.env.example.");
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(loadServiceAccount()) });
  const db = admin.firestore();

  const client = new BinanceWeb3Client({ apiKey, secretKey });
  const summary = await pollRwaTokens(client, { db, finnhubApiKey });
  const { tokens, ...summaryLog } = summary;
  console.log("Poll done:", summaryLog);

  // Optional: only runs once WALLET_ADDRESS is set (the wallet's public
  // address, never its private key — see scripts/run-trade.js for signing).
  const walletAddress = process.env.WALLET_ADDRESS;
  if (walletAddress) {
    const walletDoc = await pollWalletBalance(client, {
      db,
      address: walletAddress,
      tokenContractAddresses: summary.tokens.map((t) => t.tokenContractAddress),
    });
    console.log("Wallet balance updated:", walletDoc.assets.length, "assets");
  }
}

main().catch((err) => {
  console.error("Poll failed:", err.message);
  process.exit(1);
});
