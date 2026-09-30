import React, { useEffect, useMemo, useState } from "react";
import { collection, limitToLast, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";

const FLAG_THRESHOLD_PCT = 1.0; // keep in sync with functions/src/config.js
const MAX_POINTS = 500; // ~5 days of history at a 15-min poll cadence
const WIDTH = 860;
const HEIGHT = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };

/** Sat 00:00–Mon 00:00 windows (local time) that overlap [start, end]. */
function weekendWindows(start, end) {
  const windows = [];
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // back up to the preceding Sunday
  while (d.getTime() <= end) {
    const sat = new Date(d);
    sat.setDate(sat.getDate() + 6);
    const mon = new Date(d);
    mon.setDate(mon.getDate() + 8);
    if (mon.getTime() >= start && sat.getTime() <= end) {
      windows.push([Math.max(sat.getTime(), start), Math.min(mon.getTime(), end)]);
    }
    d.setDate(d.getDate() + 7);
  }
  return windows;
}

function formatTick(ms) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
}

/** Inline SVG line chart of spreadPct over time, with weekend windows shaded. */
export default function SpreadHistoryChart({ tokenId, tokenLabel, onClose }) {
  const [points, setPoints] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPoints(null);
    const q = query(
      collection(db, "snapshots"),
      where("id", "==", tokenId),
      orderBy("polledAt"),
      limitToLast(MAX_POINTS),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setPoints(snap.docs.map((d) => d.data())),
      (err) => setError(err.message),
    );
    return unsub;
  }, [tokenId]);

  const chart = useMemo(() => {
    if (!points || points.length < 2) return null;

    const times = points.map((p) => p.polledAt);
    const minT = times[0];
    const maxT = times[times.length - 1];

    const spreads = points.map((p) => p.spreadPct ?? 0);
    const maxAbs = Math.max(FLAG_THRESHOLD_PCT, ...spreads.map((s) => Math.abs(s))) * 1.15;

    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;

    const x = (t) => PAD.left + (maxT === minT ? 0 : ((t - minT) / (maxT - minT)) * innerW);
    const y = (v) => PAD.top + innerH / 2 - (v / maxAbs) * (innerH / 2);

    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.polledAt).toFixed(1)},${y(p.spreadPct ?? 0).toFixed(1)}`)
      .join(" ");

    const weekends = weekendWindows(minT, maxT).map(([s, e]) => ({
      x1: x(s),
      x2: x(e),
    }));

    // Day-boundary ticks.
    const ticks = [];
    const d = new Date(minT);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < minT) d.setDate(d.getDate() + 1);
    for (; d.getTime() <= maxT; d.setDate(d.getDate() + 1)) {
      ticks.push(d.getTime());
    }

    const last = points[points.length - 1];

    return { linePath, weekends, ticks, x, y, zeroY: y(0), flagY: y(FLAG_THRESHOLD_PCT), flagYNeg: y(-FLAG_THRESHOLD_PCT), last };
  }, [points]);

  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <h2>{tokenLabel} — spread history</h2>
        <button type="button" className="chart-close" onClick={onClose} aria-label="Close chart">
          ×
        </button>
      </div>

      {error && <p className="error">Couldn't load history: {error}</p>}

      {!error && points === null && <p className="hint">Loading history…</p>}

      {!error && points !== null && points.length < 2 && (
        <p className="hint">
          Not enough history yet for a chart — needs at least two polls. Snapshots accumulate every
          15 minutes once the poller is running.
        </p>
      )}

      {chart && (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="spread-chart" role="img" aria-label={`Spread % over time for ${tokenLabel}`}>
          {chart.weekends.map((w, i) => (
            <rect
              key={i}
              x={w.x1}
              y={PAD.top}
              width={Math.max(0, w.x2 - w.x1)}
              height={HEIGHT - PAD.top - PAD.bottom}
              className="chart-weekend"
            />
          ))}

          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chart.flagY} y2={chart.flagY} className="chart-threshold" />
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chart.flagYNeg} y2={chart.flagYNeg} className="chart-threshold" />
          <line x1={PAD.left} x2={WIDTH - PAD.right} y1={chart.zeroY} y2={chart.zeroY} className="chart-zero" />

          {chart.ticks.map((t, i) => (
            <g key={i}>
              <line x1={chart.x(t)} x2={chart.x(t)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="chart-gridline" />
              <text x={chart.x(t)} y={HEIGHT - 8} className="chart-tick-label" textAnchor="middle">
                {formatTick(t)}
              </text>
            </g>
          ))}

          <path d={chart.linePath} className="chart-line" fill="none" />
          <circle cx={chart.x(chart.last.polledAt)} cy={chart.y(chart.last.spreadPct ?? 0)} r={3.5} className="chart-dot" />

          <text x={PAD.left - 8} y={chart.flagY} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
            +{FLAG_THRESHOLD_PCT}%
          </text>
          <text x={PAD.left - 8} y={chart.zeroY} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
            0%
          </text>
          <text x={PAD.left - 8} y={chart.flagYNeg} className="chart-axis-label" textAnchor="end" dominantBaseline="middle">
            -{FLAG_THRESHOLD_PCT}%
          </text>
        </svg>
      )}
    </div>
  );
}
