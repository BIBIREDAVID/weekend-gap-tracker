# Developer Experience Report — running log

Log friction the moment it happens, not from memory on the last day. This
becomes the DX report submission (25% of the score) — the brief is explicit
that a perfunctory or AI-generated report won't be accepted, so treat this as
real working notes, not a document to polish at the end.

Format: `- [date] note`. Keep entries specific — exact page, exact error,
exact status code — vague feedback doesn't count per the brief.

## Onboarding

Docs opened: 2026-09-27. First successful signed call: _pending — needs a real
API key, see functions/scripts/test-signature.js_.

- [2026-09-27] Docs are thorough and example-heavy: the authentication page
  gives copy-pasteable Node/Python/Java signing code AND explicitly names its
  own most common failure mode (signed `requestPath` missing the `/build`
  prefix → `40102 Invalid signature`) before you can hit it. Good sign for
  onboarding speed — update this once a real key is in hand and we know if
  it holds up in practice.

## Documentation issues

- [2026-09-27] RWA Data page (`rwa-data`): the `platformId` enum on
  **Get RWA Token Issuance Platforms**, **Get RWA Token List**, and
  **Search RWA Token** only lists two values — `ondo` and `bstock`. The
  hackathon brief names three platforms central to this track (bStocks, Ondo,
  xStocks), but xStocks has no corresponding enum value anywhere on this
  page. Needs live verification once we have a key: does an unfiltered
  `Get RWA Token List` call return xStocks tokens under some other
  `platformId` string, or is xStocks simply not indexed by this endpoint
  yet? If the latter, that's worth flagging under Requested capabilities
  below.

## API pitfalls

- [2026-09-30] **Potentially project-defining**: RWA Data docs (both
  `Get RWA Token List` and `Get Underlying Market Data`) describe
  `referencePrice` identically: "A per-share converted price derived from
  the on-chain token price, **not an official quote from the traditional
  stock market**." That means `referencePrice` is `tokenPrice` run through
  `tokenToShareRatio`, not an independent feed — there's no field anywhere
  in this API that's an actual Nasdaq/NYSE quote. This project's whole
  premise is the spread between the on-chain price and the *real* market
  price, especially across the weekend. If `referencePrice` really is just
  a deterministic function of `tokenPrice`, `computeSpreadPct()` in
  `functions/src/poll.js` may show ~0% by construction (mod rounding),
  not a genuine premium/discount. Needs live verification once we have a
  key — watch whether spreads move independently of `tokenToShareRatio`
  once real data is flowing, and if not, this needs either an external
  stock-price feed as the real reference, or a rethink of what "spread"
  means for this project. Flagging before spending more build time on
  features that assume the current number is meaningful.

  External cross-check (no Binance key needed for this part): Ondo's own
  AAPLon price on app.ondo.finance is $331.74 mid-day 2026-09-30, real AAPL
  closed 2026-09-29 at $329.40 — same ballpark, which is expected regardless
  of how `referencePrice` is computed (token price should track the real
  stock closely during market hours either way). This doesn't resolve the
  actual question, which is what happens to `referencePrice` specifically
  *while the real market is closed* (weekends): does it stay pinned to
  Friday's close (a real, useful reference), or does it keep recomputing
  from the live `tokenPrice` via `tokenToShareRatio` (which would make it
  move in lockstep with the token and show ~0% spread all weekend, every
  weekend)? No public tracker exposes Binance's specific `referencePrice`
  field, so this genuinely needs a live key + a poll captured over an actual
  weekend to resolve — can't be verified further right now.

  **Fix confirmed working, 2026-09-30 (real keys, market open):** ran the
  corrected `pollRwaTokens()` (Finnhub as the real reference,
  `tokenPrice ÷ tokenToShareRatio` normalized before comparing) against all
  12 currently-tracked Magnificent-7 tokens. Every one got a real quote
  (`missingQuoteCount: 0`), and spreads came back sane: -0.09% to +0.56%,
  nothing flagged. That's exactly what open-market hours should look like —
  small natural noise, not the 900%-class ratio artifacts from before. Still
  need to see what happens *across an actual weekend* to confirm the metric
  moves the way this project's premise expects — that's the real test, and
  it needs the poller running unattended (GitHub Actions secrets:
  `OC_API_KEY`, `OC_SECRET_KEY`, `FINNHUB_API_KEY`,
  `FIREBASE_SERVICE_ACCOUNT_JSON`) through a Friday-to-Monday span.

- [2026-09-30] Confirmed live (real key): `platformId` really is only `ondo`
  and `bstock` — `Get RWA Token Issuance Platforms` returns exactly those
  two, and `Search RWA Token` for "AAPL" returns zero `xStocks`-platform
  assets across all three chains it lists (bsc/eth/solana). xStocks is
  simply not indexed by this API at all right now, not a filter/lookup
  issue on our side.

- [2026-09-30] Confirmed live (real key): **`referencePrice` is exactly
  `tokenPrice ÷ tokenToShareRatio`, zero exceptions across all 488 polled
  tokens.** This isn't just the docs' wording — checked programmatically,
  `Math.abs(tokenPrice/ratio - referencePrice)` is 0 for every token. Worse
  than expected: 108/488 tokens showed a "spread" ≥1% purely from
  `tokenToShareRatio ≠ 1` (e.g. `NFLXon` at ratio=10 showed a 900% fake
  spread) — a static per-token constant with nothing to do with weekend
  price gaps. The dashboard's flagging was firing on denomination
  artifacts, not real premium/discount. **Fix in progress**: pull a real
  reference price from an external market-data API (Finnhub) instead of
  trusting this field, and normalize `tokenPrice ÷ tokenToShareRatio`
  against *that* before computing spread.

- [2026-09-30] `tabId` on `Get RWA Token List` doesn't filter by sector as
  documented/assumed: `tabId=1` and `tabId=9` (our config.js comment said
  9="Magnificent 7") both returned the identical 488-token list in the same
  order. The poller has been pulling the entire RWA catalog every 15 min,
  not a curated sector. Worked around this by filtering client-side in
  `poll.js` to an explicit ticker allowlist instead of trusting `tabId` —
  also keeps external market-data calls (Finnhub) small enough for a free
  tier. Not investigated further (e.g. whether tabId needs a different
  param name/type) since the client-side filter is a fine permanent fix
  either way.

- [2026-09-30] `bstock` tokens on `Get RWA Token List` return
  `statusInfo.marketStatus: null` even when `openState: true` and
  `reasonCode: "TRADING"` (confirmed live on MSFTB, TSLAB, etc. during
  regular US market hours) — `ondo` tokens populate `marketStatus`
  ("regular") correctly for the same window. Dashboard showed "Unknown" for
  every bstock row until `MarketStatusBadge.jsx` was changed to fall back to
  `openState` when `marketStatus` is missing.

_Fill in as we hit them — exact error message + status code + what fixed it._

- [2026-09-30] Trading API (`trading-api`), `GET /aggregator/swap`: the response's
  `executionMode` field is documented as `"SWAP"` (sign+broadcast the `tx` object)
  or `"RFQ"` (sign `rfq.typedDataToSign` with EIP-712, settle via
  `POST /order/submit`), and the docs state equity/RWA tokens (Ondo, BStock)
  *always* come back as RFQ. That means `pre-transaction/simulate` and
  `pre-transaction/broadcast-transaction` — the two endpoints named in our own
  roadmap ("Trading API quote → Transaction API simulate → broadcast") — don't
  apply to the actual tokenized-stock trade this project cares about. Built
  the RFQ path instead (`functions/scripts/run-trade.js`); needs a real key to
  confirm `executionMode` really does come back `"RFQ"` for an Ondo/BStock pair
  in practice, not just per the docs.

- [2026-09-30] `POST /order/submit` request body: the `quoteId` field's
  description says to pass `` `rfq.orderId` from the `/swap` response ``, but
  the `/swap` response schema's `rfq` object has no `orderId` field at all
  (only `vendor`, `txType`, `typedDataToSign`, `signingScheme`,
  `signatureData`). Implemented it as reusing the same `quoteId` that was
  passed into `/swap` (the one property named `quoteId` in the request body,
  and the only candidate value the client actually has at that point) — needs
  live verification once a key is available; if wrong, the fix is probably
  waiting for the field to exist somewhere in the `/swap` response.

## AI stack feedback (Wallet Skills / Agentic Wallet / CLI)

_Stretch goal, not started yet._

## Tokenized-stock specifics

_Fill in once the poller has real data: liquidity/slippage outside normal
market hours, and how bStocks vs. Ondo vs. xStocks differ in practice for the
same underlying (see the platformId question above — this is where that
gets answered empirically)._

## Redesign suggestions

_What would make this platform usable the moment someone lands, if you were
rebuilding it._

## Requested capabilities

_Endpoints, SDK support, features or tooling that would have helped._
