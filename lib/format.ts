// Money is shown with crFmt below (crore, lakh); counts such as footfall use these plain formats.
export function int(v: number | null | undefined): string {
  return v == null ? "–" : Math.round(v).toLocaleString("en-IN");
}

export function pct(v: number | null | undefined, digits = 2): string {
  return v == null || !isFinite(v) ? "–" : `${(v * 100).toFixed(digits)}%`;
}

export function signedPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "–";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(digits)}%`;
}

/** Percentage-point difference for ratios such as GP%. */
export function pp(v: number | null | undefined, digits = 2): string {
  if (v == null || !isFinite(v)) return "–";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(digits)} pp`;
}

export function growth(now: number | null | undefined, last: number | null | undefined): number | null {
  // blank when either the current or the comparison value is missing or zero
  if (!now || !last) return null;
  return now / last - 1;
}

export function diff(now: number | null | undefined, last: number | null | undefined): number | null {
  return now == null || last == null ? null : now - last;
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bMerchandis\b/, "Merchandise");
}

export function longDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/* ---- Overview formats: full figures, no currency sign or Cr/L abbreviations ---- */

/** 1,445,503,760 (Western grouping, no decimals) */
export function full(v: number | null | undefined): string {
  return v == null || !isFinite(v) ? "–" : Math.round(v).toLocaleString("en-US");
}

/** +345,445,366 / −3,696,821 */
export function signedFull(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "–";
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("en-US")}`;
}

/* ---- Shared labels and tones (category heads and the daily tab) ---- */

const ABBR: Record<string, string> = {
  "COMPANY GOODS": "CG", "PACKED COMMODITY": "PC", "LOOSE COMMODITY": "LC",
  "FRESH PRODUCE": "FP", "GENERAL MERCHANDISE": "GM", LIFESTYLE: "LS",
};
export const abbrOf = (division: string) => ABBR[division.toUpperCase()] ?? division.slice(0, 2).toUpperCase();

export const roleName = (role: string) => {
  const r = role.replace("Mechandising", "Merchandising");
  return r === r.toUpperCase() ? titleCase(r) : r;
};

/** How every money amount is shown: 12.34 Cr from one crore, 1.02 Lac from one lakh up to a crore, otherwise the plain number. */
export const crFmt = (v: number) => {
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  const two = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // the unit is chosen on the rounded figure, so 99.996 Lac reads 1.00 Cr and not 100.00 Lac
  const crore = Math.round((a / 1e7) * 100) / 100;
  if (crore >= 1) return `${sign}${two(crore)} Cr`;
  const lac = Math.round((a / 1e5) * 100) / 100;
  if (lac >= 1) return `${sign}${two(lac)} Lac`;
  return `${sign}${Math.round(a).toLocaleString("en-US")}`;
};
export const crSigned = (v: number) => `${v >= 0 ? "+" : "−"}${crFmt(Math.abs(v))}`;
/** The same, or a dash when there is no value. */
export const crOrDash = (v: number | null | undefined) => (v == null || !isFinite(v) ? "–" : crFmt(v));

export const toneOfNum = (v: number | null | undefined): "up" | "down" | "flat" =>
  v == null || !isFinite(v) || Math.abs(v) < 0.00005 ? "flat" : v > 0 ? "up" : "down";
export const arrowOf = (t: "up" | "down" | "flat") => (t === "up" ? "▲ " : t === "down" ? "▼ " : "");

export function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
