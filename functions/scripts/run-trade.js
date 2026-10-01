#!/usr/bin/env node
/**
 * Manual trigger for the weekend-gap trade: quote -> swap -> sign -> settle.
 *
 * `/swap` returns either executionMode="RFQ" (sign `rfq.typedDataToSign`
 * with EIP-712, settle via order/submit) or "SWAP" (sign+broadcast the
 * returned `tx` directly). The docs claim equity/RWA tokens always come
 * back RFQ — confirmed live that's NOT true: USDT->AAPLon came back SWAP
 * via vendor LiquidMesh, presumably because it found real AMM liquidity
 * for that pair. This script handles both; see NOTES.md for the finding.
 *
 * Defaults to a dry run (quote + swap, +simulate for the SWAP path, no
 * signing). Pass --live to actually sign and submit/broadcast — this moves
 * real funds on BSC mainnet.
 *
 *   cd functions
 *   cp .env.example .env   # OC_API_KEY, OC_SECRET_KEY, WALLET_PRIVATE_KEY
 *   node scripts/run-trade.js --to 0x<rwaTokenAddress> --usdt 10
 *   node scripts/run-trade.js --to 0x<rwaTokenAddress> --usdt 10 --live
 *
 * Selling a held RWA token back to USDT: pass --from <rwaTokenAddress>
 * --amount <token qty> --decimals <token decimals> instead of --to/--usdt
 * (BSC RWA tokens are BEP-20 and default to 18 decimals unless overridden).
 */
require("dotenv").config();
const { randomUUID } = require("crypto");
const { Wallet, JsonRpcProvider } = require("ethers");
const { BinanceWeb3Client } = require("../src/binanceClient");
const {
  getAggregatedQuote,
  buildSwapTransaction,
  submitRfqOrder,
  getRfqOrderStatus,
  simulateTransaction,
  broadcastTransaction,
} = require("../src/trading");
const { toSmallestUnit, fromSmallestUnit } = require("../src/units");
const { signRfqTypedData } = require("../src/signing");
const {
  BSC_CHAIN_ID,
  BSC_RPC_URL,
  BSC_USDT_ADDRESS,
  DEFAULT_SLIPPAGE_PCT,
  RFQ_TERMINAL_STATUSES,
} = require("../src/config");

// BSC's USDT (Binance-Peg, BEP-20) uses 18 decimals, NOT the 6 decimals
// Ethereum mainnet USDT uses — confirmed live via a quote's fromToken.decimal
// field. Got this wrong once already: --usdt 10 at the wrong decimals sent
// 1e-11 USDT and tripped the API's $5 minimum-order error. See NOTES.md.
const USDT_DECIMALS = 18;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 120_000;

function parseArgs(argv) {
  const args = { live: false, decimals: 18, slippagePercent: DEFAULT_SLIPPAGE_PCT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--live") args.live = true;
    else if (a === "--to") args.to = argv[++i];
    else if (a === "--from") args.from = argv[++i];
    else if (a === "--usdt") args.usdt = argv[++i];
    else if (a === "--amount") args.amount = argv[++i];
    else if (a === "--decimals") args.decimals = Number(argv[++i]);
    else if (a === "--slippage") args.slippagePercent = argv[++i];
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollOrderStatus(client, orderId) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await getRfqOrderStatus(client, { orderId });
    if (res.code !== 0) throw new Error(`Order status lookup failed (code ${res.code}): ${res.msg}`);
    const { status } = res.data;
    console.log(`  order ${orderId}: ${status}`);
    if (RFQ_TERMINAL_STATUSES.has(status)) return res.data;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for order ${orderId} to reach a terminal status`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.OC_API_KEY;
  const secretKey = process.env.OC_SECRET_KEY;
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  if (!apiKey || !secretKey) {
    console.error("Missing OC_API_KEY / OC_SECRET_KEY — see functions/.env.example.");
    process.exit(1);
  }
  if (!privateKey) {
    console.error(
      "Missing WALLET_PRIVATE_KEY — see functions/.env.example. Use a fresh wallet funded " +
        "with only the small amount you intend to trade; never your main wallet's key.",
    );
    process.exit(1);
  }

  let fromTokenAddress, toTokenAddress, amount, fromDecimals;
  if (args.to) {
    if (!args.usdt) {
      console.error("--to requires --usdt <amount> (the USDT amount to spend).");
      process.exit(1);
    }
    fromTokenAddress = BSC_USDT_ADDRESS;
    toTokenAddress = args.to;
    fromDecimals = USDT_DECIMALS;
    amount = toSmallestUnit(args.usdt, USDT_DECIMALS);
  } else if (args.from) {
    if (!args.amount) {
      console.error("--from requires --amount <token quantity>.");
      process.exit(1);
    }
    fromTokenAddress = args.from;
    toTokenAddress = BSC_USDT_ADDRESS;
    fromDecimals = args.decimals;
    amount = toSmallestUnit(args.amount, args.decimals);
  } else {
    console.error("Pass either --to <rwaTokenAddress> --usdt <amount> (buy) or --from <rwaTokenAddress> --amount <qty> (sell).");
    process.exit(1);
  }

  const wallet = new Wallet(privateKey);
  const userWalletAddress = wallet.address;
  const client = new BinanceWeb3Client({ apiKey, secretKey });

  console.log(`Wallet: ${userWalletAddress}`);
  console.log(`Quoting ${fromSmallestUnit(amount, fromDecimals)} (${fromTokenAddress}) -> ${toTokenAddress} ...`);

  const quoteRes = await getAggregatedQuote(client, {
    binanceChainId: BSC_CHAIN_ID,
    amount,
    fromTokenAddress,
    toTokenAddress,
    userWalletAddress,
  });
  if (quoteRes.code !== 0) throw new Error(`Quote failed (code ${quoteRes.code}): ${quoteRes.msg}`);
  const routes = quoteRes.data || [];
  if (routes.length === 0) throw new Error("No routes returned for this pair/amount.");

  const best = routes[0]; // already sorted by toTokenAmount desc
  console.log(
    `Best route: ${best.vendorName} — ${amount} in -> ~${best.toTokenAmount} out ` +
      `(priceImpact ${best.priceImpactPercent ?? "?"}%)`,
  );

  const swapRes = await buildSwapTransaction(client, {
    binanceChainId: BSC_CHAIN_ID,
    amount,
    fromTokenAddress,
    toTokenAddress,
    userWalletAddress,
    quoteId: best.quoteId,
    slippagePercent: args.slippagePercent,
  });
  if (swapRes.code !== 0) throw new Error(`Swap build failed (code ${swapRes.code}): ${swapRes.msg}`);
  const { executionMode, tx, rfq } = swapRes.data;
  console.log(`executionMode: ${executionMode}`);

  if (executionMode === "SWAP") {
    console.log(`Simulating swap via ${tx.to} ...`);
    const simRes = await simulateTransaction(client, {
      binanceChainId: BSC_CHAIN_ID,
      evmTx: { from: tx.from, to: tx.to, value: tx.value, data: tx.data },
    });
    if (simRes.code !== 0) throw new Error(`Simulate failed (code ${simRes.code}): ${simRes.msg}`);
    console.log("Simulation result:", JSON.stringify(simRes.data, null, 2));

    if (!args.live) {
      console.log("Dry run (pass --live to sign and broadcast). Quote + swap + simulate look good, stopping here.");
      return;
    }

    const provider = new JsonRpcProvider(BSC_RPC_URL);
    const nonce = await provider.getTransactionCount(userWalletAddress, "pending");
    const signedTx = await wallet.signTransaction({
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
      gasLimit: BigInt(tx.gas),
      gasPrice: BigInt(tx.gasPrice),
      nonce,
      chainId: Number(BSC_CHAIN_ID),
      type: 0,
    });

    console.log("Broadcasting ...");
    const broadcastRes = await broadcastTransaction(client, {
      binanceChainId: BSC_CHAIN_ID,
      signedTransaction: signedTx,
      address: userWalletAddress,
    });
    if (broadcastRes.code !== 0) throw new Error(`Broadcast failed (code ${broadcastRes.code}): ${broadcastRes.msg}`);
    console.log("Broadcast result:", JSON.stringify(broadcastRes.data, null, 2));
    return;
  }

  // executionMode === "RFQ"
  if (!args.live) {
    console.log("Dry run (pass --live to sign and submit). Quote + swap look good, stopping here.");
    return;
  }

  console.log(`Signing RFQ order for vendor ${rfq.vendor} ...`);
  const userSignature = signRfqTypedData(privateKey, rfq.typedDataToSign);

  const submitRes = await submitRfqOrder(client, {
    requestId: randomUUID(),
    userSignature,
    vendor: rfq.vendor,
    quoteId: best.quoteId,
    signingScheme: rfq.signingScheme,
  });
  if (submitRes.code !== 0) throw new Error(`Order submit failed (code ${submitRes.code}): ${submitRes.msg}`);
  const { orderId } = submitRes.data;
  console.log(`Submitted: orderId=${orderId}, initial status=${submitRes.data.status}`);

  const finalState = await pollOrderStatus(client, orderId);
  console.log("Final state:", JSON.stringify(finalState, null, 2));
}

main().catch((err) => {
  console.error("Trade failed:", err.message);
  process.exit(1);
});
