import React, { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatBalance(balance) {
  const n = Number(balance);
  if (!Number.isFinite(n)) return balance;
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function formatUsd(balance, tokenPrice) {
  const b = Number(balance);
  const p = Number(tokenPrice);
  if (!Number.isFinite(b) || !Number.isFinite(p)) return null;
  return (b * p).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/**
 * Post-trade balance panel — reads the `wallet/latest` doc that
 * pollWalletBalance() (functions/src/poll.js) writes every poll, once
 * WALLET_ADDRESS is configured. Absent that, this renders nothing.
 */
export default function WalletBalance() {
  const [wallet, setWallet] = useState(undefined); // undefined = loading, null = no doc yet

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "wallet", "latest"),
      (snap) => setWallet(snap.exists() ? snap.data() : null),
      () => setWallet(null),
    );
    return unsub;
  }, []);

  if (!wallet) return null; // feature not configured, or still loading — stay quiet either way

  return (
    <section className="wallet-panel">
      <div className="wallet-panel-header">
        <h2>Wallet balance</h2>
        <span className="wallet-address" title={wallet.address}>
          {shortAddress(wallet.address)}
        </span>
      </div>
      <div className="wallet-assets">
        {wallet.assets.map((a) => (
          <div key={a.tokenContractAddress || "native"} className="wallet-asset">
            <span className="wallet-asset-symbol">{a.symbol}</span>
            <span className="wallet-asset-balance">{formatBalance(a.balance)}</span>
            {formatUsd(a.balance, a.tokenPrice) && (
              <span className="wallet-asset-usd">{formatUsd(a.balance, a.tokenPrice)}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
