import { arrowOf, growth, signedPct, toneOfNum } from "@/lib/format";
import type { DayFields, DetailRow } from "@/lib/types";

/** The Period choice that covers every day of the month so far. */
export const MTD = "mtd";

/** The distinct names in a list, without blanks, in alphabetical order. */
export const uniqSorted = (values: (string | null)[]) =>
  [...new Set(values.filter((v): v is string => v != null))].sort((a, b) => a.localeCompare(b));

/** Day fields summed over detail rows, for a head or CRP choice. Footfall is not in the detail rows, so it stays blank. */
export function dayFieldsOfRows(rows: DetailRow[], n: number): DayFields {
  const sum = (pick: (r: DetailRow) => (number | null)[]) =>
    Array.from({ length: n }, (_, i) => rows.reduce((t, r) => t + (pick(r)[i] ?? 0), 0));
  const blank = Array.from({ length: n }, () => null as number | null);
  return {
    sales: sum((r) => r.sales), splySales: sum((r) => r.splySales),
    gpv: sum((r) => r.gpv), splyGpv: sum((r) => r.splyGpv),
    valueAdj: sum((r) => r.valueAdj), splyValueAdj: sum((r) => r.splyValueAdj),
    ff: blank, splyFf: blank,
  };
}

/** Figures for a day, a period or a row. GPV+OI is GPV plus value adj, as in the workbook. */
export type Figures = {
  sales: number | null; splySales: number | null;
  gpv: number | null; splyGpv: number | null;
  gpvOi: number | null; splyGpvOi: number | null;
  ff: number | null; splyFf: number | null;
};
export type Ratios = { gp: number | null; splyGp: number | null; goi: number | null; splyGoi: number | null; bs: number | null; splyBs: number | null };
export type Chg = { text: string | null; t: "up" | "down" | "flat" };
export type SortState<K extends string> = { key: K; dir: "asc" | "desc" };

const FIELDS = ["sales", "splySales", "gpv", "splyGpv", "gpvOi", "splyGpvOi", "ff", "splyFf"] as const;

/** Sums figures over days or rows; a field with no value anywhere stays blank. */
export function sumFigures(rows: Figures[]): Figures {
  const out = {} as Figures;
  for (const k of FIELDS) {
    const vals = rows.map((r) => r[k]).filter((v): v is number => v != null);
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

export const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
export const difference = (n: number | null, l: number | null) => (n != null && l != null ? n - l : null);

export function ratiosOf(f: Figures): Ratios {
  return {
    gp: ratio(f.gpv, f.sales), splyGp: ratio(f.splyGpv, f.splySales),
    goi: ratio(f.gpvOi, f.sales), splyGoi: ratio(f.splyGpvOi, f.splySales),
    bs: ratio(f.sales, f.ff), splyBs: ratio(f.splySales, f.splyFf),
  };
}

/** Growth is blank when either side is missing or zero, as on the other tabs. */
export const growthChg = (n: number | null, l: number | null): Chg => {
  const g = growth(n, l);
  return { text: g == null ? null : signedPct(g, 2), t: toneOfNum(g) };
};
/** Ratio change: the difference between the two percentages. */
export const diffChg = (n: number | null, l: number | null): Chg => {
  const d = difference(n, l);
  return { text: d == null ? null : signedPct(d, 2), t: toneOfNum(d) };
};

const parseDay = (iso: string) => new Date(`${iso}T00:00:00`);
export const dayShort = (iso: string) => parseDay(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
export const dayLong = (iso: string) => parseDay(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
export const dayNum = (iso: string) => parseDay(iso).getDate();
/** 1-Oct */
export const dayMonth = (iso: string) => parseDay(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace(" ", "-");
export const dayWeekday = (iso: string) => parseDay(iso).toLocaleDateString("en-GB", { weekday: "short" });
/** Friday and Saturday are the peak days, so they get their own shading. */
export const isFriSat = (iso: string) => [5, 6].includes(parseDay(iso).getDay());

export function SortTh<K extends string>({ k, label, sort, onSort, cls }: {
  k: K; label: string; sort: SortState<K>; onSort: (k: K) => void; cls?: string;
}) {
  const active = sort.key === k;
  return (
    <th scope="col" className={cls} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className="sortbtn" onClick={() => onSort(k)}>{label}{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
    </th>
  );
}

export function Cell({ value, chg, cls }: { value: string; chg: Chg; cls?: string }) {
  return (
    <td className={cls}>
      <div className="ov-td-val">{value}</div>
      {chg.text !== null && <div><span className={`delta ${chg.t}`}>{arrowOf(chg.t)}{chg.text}</span></div>}
    </td>
  );
}
