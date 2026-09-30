/**
 * String-based decimal <-> smallest-unit conversion (BigInt math only —
 * no floating point, so a $ amount never drifts by a wei/satoshi).
 */

/** "12.5" USDT (decimals=6) -> "12500000". Truncates past `decimals` places. */
function toSmallestUnit(amountStr, decimals) {
  const [whole, frac = ""] = String(amountStr).trim().split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const combined = `${whole}${fracPadded}`.replace(/^0+(?=\d)/, "");
  return BigInt(combined || "0").toString();
}

/** "12500000" (decimals=6) -> "12.5". */
function fromSmallestUnit(amountStr, decimals) {
  const s = BigInt(amountStr).toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

module.exports = { toSmallestUnit, fromSmallestUnit };
