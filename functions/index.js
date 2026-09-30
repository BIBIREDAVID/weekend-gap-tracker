const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

const { BinanceWeb3Client } = require("./src/binanceClient");
const { pollRwaTokens, pollWalletBalance } = require("./src/poll");

admin.initializeApp();
const db = admin.firestore();

// This project runs on the Firebase Spark (free) plan, which can't deploy
// Cloud Functions at all (that always requires Blaze). The actual 15-min
// poll runs as a GitHub Actions cron job instead — see
// functions/scripts/run-poll.js and .github/workflows/poll.yml.
//
// pollNow below is kept for local emulator testing only; it is never
// deployed (nothing here runs `firebase deploy --only functions`).
// In the emulator, put credentials in functions/.env (see .env.example).
const OC_API_KEY = defineSecret("OC_API_KEY");
const OC_SECRET_KEY = defineSecret("OC_SECRET_KEY");
const FINNHUB_API_KEY = defineSecret("FINNHUB_API_KEY");

function buildClient() {
  return new BinanceWeb3Client({
    apiKey: OC_API_KEY.value(),
    secretKey: OC_SECRET_KEY.value(),
  });
}

/**
 * Manual trigger for local dev only — hit this in the emulator to test
 * the poll logic against real Firestore without waiting on GitHub Actions:
 *   curl http://127.0.0.1:5001/<project-id>/us-central1/pollNow
 */
exports.pollNow = onRequest(
  { secrets: [OC_API_KEY, OC_SECRET_KEY, FINNHUB_API_KEY] },
  async (req, res) => {
    try {
      const client = buildClient();
      const summary = await pollRwaTokens(client, { db, finnhubApiKey: FINNHUB_API_KEY.value() });
      const walletAddress = process.env.WALLET_ADDRESS;
      if (walletAddress) {
        await pollWalletBalance(client, {
          db,
          address: walletAddress,
          tokenContractAddresses: summary.tokens.map((t) => t.tokenContractAddress),
        });
      }
      const { tokens, ...summaryOut } = summary;
      res.status(200).json({ ok: true, ...summaryOut });
    } catch (err) {
      logger.error("pollNow failed", err);
      res.status(500).json({ ok: false, error: err.message });
    }
  },
);
