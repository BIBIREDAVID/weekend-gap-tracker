# Weekend Gap Tracker

Tracks the spread between a tokenized stock's on-chain price and the REAL
underlying market price (via Finnhub — see NOTES.md for why not the RWA Data
API's own `referencePrice` field) — especially across the weekend, when the
underlying market is shut but the token keeps trading — and (once the trading
phase is built) can act on a wide spread with a small real trade on BSC.

Built for the BNB Chain / Binance Web3 tokenized-stocks hackathon. Submission
deadline: **Sun Oct 11, 2026, 12:00 UTC**.

## Status

- [x] Binance Web3 API client (HMAC-SHA256 request signing)
- [x] RWA Data endpoint wrappers + spread computation — **redone once with a real key**:
      the API's own `referencePrice` turned out to be derived from `tokenPrice`, not an
      independent quote (confirmed live — 108/488 tokens showed fake 900%-class "spreads"
      from share-ratio artifacts, not real price gaps). Now uses Finnhub as the real
      reference; see NOTES.md for the full story
- [x] Scheduled poller → Firestore (GitHub Actions cron, every 15 min)
- [x] Dashboard: live ticker table, spread %, market open/closed badge
- [x] Spread-history chart with the weekend window marked
- [x] Trading API quote → sign → settle (small live trade) — code written, untested against
      a real key; see NOTES.md — RWA/equity tokens settle via RFQ (EIP-712 sign + order/submit),
      not the plain-SWAP simulate/broadcast path this item originally assumed
- [x] Wallet API: post-trade balance on the dashboard — code written, untested against a real key
- [ ] Agentic Wallet / Wallet Skills stretch goal — researched + documented (see below),
      not installed: it's a separate integration path (QR sign-in via the Binance App,
      not our OC_API_KEY), and the install step needs your own account

## Prerequisites

- Node 20
- A Firebase project on the **Spark (free) plan** — Firestore only, no Cloud
  Functions are deployed, so Blaze isn't needed
- The [Firebase CLI](https://firebase.google.com/docs/cli): `npm install -g firebase-tools`
- A Binance Web3 API key + secret: https://web3.binance.com/en/dev-portal/project
- A Finnhub API key (free, no card) for the real reference price: https://finnhub.io/register
- A GitHub repo (for the Actions cron that runs the poller — see Deploying)
- To run the trading flow: a fresh BSC wallet funded with only the small amount you intend
  to trade (never your main wallet's private key)

## Setup

```bash
# 1. Point the Firebase CLI at your project
firebase login
firebase use --add   # pick your project, alias it "default"
#   (or edit .firebaserc directly)

# 2. Backend
cd functions
npm install
cp .env.example .env          # fill in OC_API_KEY / OC_SECRET_KEY / FINNHUB_API_KEY
node scripts/test-signature.js   # <-- the Day-1 check: one signed call, no Firebase needed

# 3. Frontend
cd ../frontend
npm install
cp .env.example .env          # fill in your Firebase web app config
npm run dev
```

## Running the poller locally

Two ways, both write to your **real** Firestore (no emulator needed for this
since the poller never runs as a Cloud Function):

```bash
cd functions
npm install
cp .env.example .env   # OC_API_KEY, OC_SECRET_KEY, FINNHUB_API_KEY, FIREBASE_SERVICE_ACCOUNT_JSON
npm run poll            # runs scripts/run-poll.js once, via the Admin SDK
```

Or, to exercise the HTTPS-trigger code path (`index.js`) in the emulator:

```bash
cd functions
npm run serve   # starts the Functions + Firestore emulators
# in another terminal:
curl http://127.0.0.1:5001/<your-project-id>/us-central1/pollNow
```

The frontend's `.env` should point at your real Firebase project (Firestore
emulator data doesn't show up in the hosted dashboard).

## Running the trading flow

Quotes, builds, signs and settles one swap on BSC mainnet — real funds move when
you pass `--live`. Defaults to a dry run (quote + swap, no signing) otherwise.

```bash
cd functions
npm install
cp .env.example .env   # OC_API_KEY, OC_SECRET_KEY, WALLET_PRIVATE_KEY

# Dry run: spend 10 USDT buying a token, see the quote, don't sign anything
node scripts/run-trade.js --to 0x<rwaTokenContractAddress> --usdt 10

# Live: actually sign the RFQ order and submit it
node scripts/run-trade.js --to 0x<rwaTokenContractAddress> --usdt 10 --live

# Sell a held token back to USDT (pass its decimals if not 18)
node scripts/run-trade.js --from 0x<rwaTokenContractAddress> --amount 5 --live
```

## Stretch goal: Agentic Wallet / Wallet Skills

This is a **separate integration path**, not an extension of the `functions/src/*`
REST client above. It's a Binance-published Claude/ChatGPT-compatible Skill (installed
via the `npx skills` CLI, itself downloading a `baw` binary), authenticated by scanning
a QR code in the Binance App — not `OC_API_KEY`/`OC_SECRET_KEY` at all. Two skills are
directly relevant:

- **`binance-tokenized-securities-info`** — read-only, gives an AI agent conversational
  access to the same kind of RWA/Ondo data this project polls (asset list, market
  status, live prices) without writing any API calls.
- **`binance-agentic-wallet`** — read+write, lets an AI agent check the trading
  wallet's balance and place market/limit swaps conversationally, as an alternative
  front end to `scripts/run-trade.js`. Constrained server-side by daily limits and a
  tradable-token allowlist you set in the Binance App, so it can't exceed what you've
  authorized even if the agent misbehaves.

Not installed here — the sign-in step needs your own Binance account, and running the
installer executes a third-party binary, both of which are your call to make, not mine.
To try it:

```bash
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-agentic-wallet
npx skills add binance/binance-skills-hub/skills/binance-web3/binance-tokenized-securities-info
```

Then follow the sign-in link it prints (scan with the Binance App) and, in a
Claude/ChatGPT/Copilot session with the skill installed, try: *"What's my wallet
address and how much USDT do I have?"* or *"Is the Ondo market open right now?"*

## Deploying

There's no Cloud Functions deploy — the project stays on the free Spark plan.
Instead:

1. **Firestore rules and indexes**: `firebase deploy --only firestore:rules,firestore:indexes`
   (the indexes deploy is needed the first time — the spread-history chart queries `snapshots`
   by `id` and orders by `polledAt`, which needs the composite index in `firestore.indexes.json`)
2. **Scheduled poll**: set these as GitHub Actions repo secrets (Settings >
   Secrets and variables > Actions), then `.github/workflows/poll.yml` runs
   it every 15 minutes automatically:
   - `OC_API_KEY`, `OC_SECRET_KEY`, `FINNHUB_API_KEY`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` — full JSON from Firebase console >
     Project settings > Service accounts > Generate new private key
3. **Frontend**: deploys to Vercel as usual (`vercel --prod` from
   `frontend/`, or via the Vercel dashboard) — set the `VITE_FIREBASE_*` env
   vars there too.

## Project layout

```
.github/workflows/
  poll.yml            GitHub Actions cron — runs the 15-min poll (see functions/scripts/run-poll.js)
functions/
  index.js            Emulator-only HTTPS trigger (pollNow), never deployed
  src/
    config.js          Chain ID, TRACKED_TICKERS (the real sector filter — tabId doesn't work,
                       see NOTES.md), spread threshold, trading constants
    binanceClient.js    Request signing (HMAC-SHA256, X-OC-* headers)
    rwaData.js          One wrapper per RWA Data / Market endpoint used
    marketData.js        Finnhub real reference price — see NOTES.md for why this exists
    trading.js           One wrapper per Trading API / order endpoint used
    signing.js            EIP-712 RFQ signature (keccak256 + raw ECDSA, see its docstring)
    units.js              BigInt decimal <-> smallest-unit conversion, no floats
    wallet.js              Wallet API balance-by-address wrapper
    poll.js              Spread computation + wallet balance snapshot + Firestore writes
  scripts/
    test-signature.js  Standalone first-call check (no Firebase)
    run-poll.js         Poll runner used by GitHub Actions + local `npm run poll`
    run-trade.js         quote -> swap -> sign -> settle, local `npm run trade`
frontend/
  src/
    firebase.js         Firestore client init
    App.jsx              Dashboard: live ticker table
    components/
      MarketStatusBadge.jsx
      SpreadHistoryChart.jsx  Click a ticker row to chart its spreadPct history from `snapshots`
      WalletBalance.jsx        Reads `wallet/latest`; renders nothing until WALLET_ADDRESS is set
firestore.indexes.json  Composite index for the snapshots query (id ==, polledAt asc) — deploy with
                         `firebase deploy --only firestore:indexes`
firestore.rules         Client: read-only. Writes only via Admin SDK.
```

## Notes

See `NOTES.md` for the running Developer Experience Report log — API
friction, doc issues, anything worth flagging gets written there as it
happens, not reconstructed from memory before submission.
