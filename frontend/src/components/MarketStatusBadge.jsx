import React from "react";

const STATUS_LABEL = {
  regular: "Open",
  premarket: "Pre-market",
  postmarket: "Post-market",
  overnight: "Overnight",
  closed: "Closed",
  pause: "Halted",
};

function formatWhen(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Small colored badge for a token's statusInfo — open/closed plus why. */
export default function MarketStatusBadge({
  openState,
  marketStatus,
  reasonMsg,
  nextOpenTime,
}) {
  // bstock tokens come back with marketStatus: null even when openState is
  // populated (confirmed live — see NOTES.md), so fall back to openState
  // rather than showing "Unknown" for an otherwise-known state.
  const label = STATUS_LABEL[marketStatus] || marketStatus || (openState ? "Open" : "Closed");
  const nextOpen = formatWhen(nextOpenTime);
  const title = [reasonMsg, nextOpen ? `Reopens ${nextOpen}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`status-badge ${openState ? "status-open" : "status-closed"}`}
      title={title || undefined}
    >
      {label}
    </span>
  );
}
