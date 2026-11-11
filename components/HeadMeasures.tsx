"use client";

import type { HeadRow } from "@/lib/types";
import { arrowOf, crOrDash, crSigned, pct, signedPct, toneOfNum } from "@/lib/format";

/** Growth of this period against the comparison; blank when either is missing or zero. */
const growthOf = (n?: number | null, l?: number | null): number | null => (!n || !l ? null : n / l - 1);
const fm = (v: number) => Math.round(v).toLocaleString("en-US");

/** The measures of the head table, in the order of the Power BI summary: each has this period, the comparison,
 *  the difference and, for money and counts, the growth. Value adj is Adjusted GPV less GPV. Used by the Category
 *  heads tab and by the head table on Day wise sales. */
export type WideMeasure = {
  label: string;
  kind: "money" | "count" | "pct";
  growth: boolean;
  sortKey?: "name" | "sales" | "gpv" | "gp" | "gpvoi" | "goi" | "ff" | "bs";
  /** Footfall and basket: left out of the Category heads tab's detail-only segments, which have no footfall. */
  needsFootfall?: boolean;
  now: (r: Partial<HeadRow>) => number | null | undefined;
  last: (r: Partial<HeadRow>) => number | null | undefined;
};

export const valueAdj = (gpvOi: number | null | undefined, gpv: number | null | undefined) =>
  (gpvOi != null && gpv != null ? gpvOi - gpv : null);

export const WIDE: WideMeasure[] = [
  { label: "Sales", kind: "money", growth: true, sortKey: "sales", now: (r) => r.sales, last: (r) => r.salesLast },
  { label: "Footfall", kind: "count", growth: true, sortKey: "ff", needsFootfall: true, now: (r) => r.ff, last: (r) => r.ffLast },
  { label: "Basket", kind: "count", growth: true, sortKey: "bs", needsFootfall: true, now: (r) => r.bs, last: (r) => r.bsLast },
  { label: "GP%", kind: "pct", growth: false, sortKey: "gp", now: (r) => r.gp, last: (r) => r.gpLast },
  { label: "GPV", kind: "money", growth: true, sortKey: "gpv", now: (r) => r.gpv, last: (r) => r.gpvLast },
  { label: "Value adj", kind: "money", growth: true, now: (r) => valueAdj(r.gpvOi, r.gpv), last: (r) => valueAdj(r.gpvOiLast, r.gpvLast) },
  { label: "Adjusted GP%", kind: "pct", growth: false, sortKey: "goi", now: (r) => r.gpOi, last: (r) => r.gpOiLast },
  { label: "Adjusted GPV", kind: "money", growth: true, sortKey: "gpvoi", now: (r) => r.gpvOi, last: (r) => r.gpvOiLast },
];

/** One measure in the head table: this period, the comparison, the difference and, where it applies, the growth. */
export function WideCells({ m, r }: { m: WideMeasure; r: Partial<HeadRow> }) {
  const n = m.now(r) ?? null, l = m.last(r) ?? null;
  const d = n != null && l != null ? n - l : null;
  const g = growthOf(n, l);
  const value = (v: number | null) => (m.kind === "money" ? crOrDash(v) : m.kind === "count" ? (v == null ? "–" : fm(v)) : pct(v, 2));
  const diff = m.kind === "money" ? (d == null ? "–" : crSigned(d))
    : m.kind === "count" ? (d == null ? "–" : `${d >= 0 ? "+" : "−"}${fm(Math.abs(d))}`)
    : signedPct(d, 2);
  return (
    <>
      <td>{value(n)}</td>
      <td>{value(l)}</td>
      <td><span className={`delta ${toneOfNum(d)}`}>{diff}</span></td>
      {m.growth && <td><span className={`delta ${toneOfNum(g)}`}>{arrowOf(toneOfNum(g))}{signedPct(g, 2)}</span></td>}
    </>
  );
}
