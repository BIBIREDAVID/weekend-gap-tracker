import React, { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import MarketStatusBadge from "./components/MarketStatusBadge.jsx";
import SpreadHistoryChart from "./components/SpreadHistoryChart.jsx";
import WalletBalance from "./components/WalletBalance.jsx";

const FLAG_THRESHOLD_PCT = 1.0; // keep in sync with functions/src/config.js

function formatUpdated(ms) {
  if (!ms) return "—";
  const seconds = Math.round((Date.now() - ms) / 1000);
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

export default function App() {
  const [tokens, setTokens] = useState(null); // null = still loading
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // token whose history is charted

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "latest"),
      (snap) => {
        const rows = snap.docs.map((d) => d.data());
        rows.sort((a, b) => Math.abs(b.spreadPct ?? 0) - Math.abs(a.spreadPct ?? 0));
        setTokens(rows);
      },
      (err) => setError(err.message),
    );
    return unsub;
  }, []);

  return (
    <main className="page">
      <header className="header">
        <h1>Weekend Gap Tracker</h1>
        <p className="subtitle">
          On-chain price (normalized per share) vs. the real underlying market price from Finnhub.
          The gap widens fastest when the underlying market is closed but the token keeps trading.
        </p>
      </header>

      <WalletBalance />

      {error && <p className="error">Couldn't load data: {error}</p>}

      {selected && (
        <SpreadHistoryChart
          tokenId={selected.id}
          tokenLabel={`${selected.underlyingTicker} (${selected.tokenSymbol})`}
          onClose={() => setSelected(null)}
        />
      )}

      {tokens === null && !error && <p className="hint">Loading…</p>}

      {tokens !== null && tokens.length === 0 && (
        <p className="hint">
          No data yet. Run the poller once — locally: <code>cd functions &amp;&amp; npm run serve</code>{" "}
          then <code>curl http://127.0.0.1:5001/&lt;project-id&gt;/us-central1/pollNow</code>, or wait
          for the 15-minute schedule once deployed.
        </p>
      )}

      {tokens !== null && tokens.length > 0 && (
        <table className="ticker-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Platform</th>
              <th>On-chain (per share)</th>
              <th>Reference (Finnhub)</th>
              <th>Spread</th>
              <th>Market</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((t) => (
              <tr
                key={t.id}
                className={`row-clickable${t.flagged ? " row-flagged" : ""}${selected?.id === t.id ? " row-selected" : ""}`}
                onClick={() => setSelected(t)}
                title="View spread history"
              >
                <td>
                  <span className="ticker">{t.underlyingTicker}</span>
                  <span className="token-symbol">{t.tokenSymbol}</span>
                </td>
                <td>{t.platformId}</td>
                <td title={`Raw on-chain price $${t.tokenPrice?.toFixed(4)} ÷ ${t.tokenToShareRatio}x ratio`}>
                  ${(t.tokenPrice / (t.tokenToShareRatio || 1)).toFixed(2)}
                </td>
                <td>{t.realReferencePrice === null ? "—" : `$${t.realReferencePrice.toFixed(2)}`}</td>
                <td className={Math.abs(t.spreadPct ?? 0) >= FLAG_THRESHOLD_PCT ? "spread-flagged" : undefined}>
                  {t.spreadPct === null ? "—" : `${t.spreadPct > 0 ? "+" : ""}${t.spreadPct.toFixed(2)}%`}
                </td>
                <td>
                  <MarketStatusBadge
                    openState={t.openState}
                    marketStatus={t.marketStatus}
                    reasonMsg={t.reasonMsg}
                    nextOpenTime={t.nextOpenTime}
                  />
                </td>
                <td className="updated">{formatUpdated(t.polledAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
