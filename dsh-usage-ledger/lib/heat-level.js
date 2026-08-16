/**
 * Heatmap shade for one day's token total, shared by the browser half
 * (UsageSection) and the smoke tests.
 *
 * Token usage spans orders of magnitude, so a plain linear share of the
 * busiest day flattens every smaller-but-real day into the near-white
 * level 1 — the panel then looks like it only shows the busiest day. A log
 * scale maps each order of magnitude to a visible shade: level 1 = any
 * activity, level 4 = the max day, with the levels between spread across
 * the token-range below the max.
 *
 * @param {number} tokens - day total (0 or positive).
 * @param {number} max - largest day total (must be positive).
 * @returns {number} 0 for empty days, 1..4 for active days.
 */
export function heatLevel(tokens, max) {
  if (!(tokens > 0)) return 0
  const safeMax = max > 0 ? max : 1
  const intensity = safeMax > 1 ? Math.log(tokens) / Math.log(safeMax) : tokens / safeMax
  return Math.min(4, 1 + Math.floor(3 * intensity))
}
