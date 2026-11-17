"use client";

import { useState, type CSSProperties } from "react";
import type { CrpFf, DailyHead, DayFields, DetailRow } from "@/lib/types";
import { abbrOf, arrowOf, crOrDash, full, growth, pct, signedPct, titleCase, toneOfNum } from "@/lib/format";
import { dayMonth, dayWeekday, isFriSat } from "@/lib/daily";

type Measure = "sales" | "gpv" | "gpvoi" | "gp" | "goi" | "bs" | "ff";
const MEASURES: { k: Measure; l: string }[] = [
  { k: "sales", l: "Sales" },
  { k: "gpv", l: "GPV" },
  { k: "gpvoi", l: "GPV+OI" },
  { k: "gp", l: "GP%" },
  { k: "goi", l: "GP+OI%" },
  { k: "bs", l: "Basket" },
  { k: "ff", l: "Footfall" },
];

/** One row of the table: sales and GPV for each day (in taka), and footfall where it can be counted (null where not). */
type Line = { name: string; division?: string; role?: string; s: (number | null)[]; g: (number | null)[]; f: (number | null)[] | null;
  /** The same day last year: sales, GPV and footfall, for the change under each figure. */
  sl: (number | null)[]; gl: (number | null)[]; fl: (number | null)[] | null;
  /** GPV+OI (GPV plus value adj) this period and last year. */
  oi: (number | null)[]; oil: (number | null)[]; drill: boolean; key: string };

/** Adds day arrays together; a day with no value in any of them stays blank. */
const addDays = (arrs: ((number | null)[] | null)[], n: number): (number | null)[] =>
  Array.from({ length: n }, (_, i) => {
    let t = 0, any = false;
    for (const a of arrs) {
      const v = a ? a[i] : null;
      if (v != null) { t += v; any = true; }
    }
    return any ? t : null;
  });

const sumOf = (a: (number | null)[]) => a.reduce<number>((t, v) => t + (v ?? 0), 0);

/** GPV plus value adj (GPV+OI) for each day; blank where the GPV is blank. */
const plusAdj = (g: (number | null)[], adj: (number | null)[]): (number | null)[] =>
  g.map((v, i) => (v == null ? null : v + (adj[i] ?? 0)));

/** One measure for one day of a row. Basket is sales per bill, in taka. */
function valueAt(l: Line, m: Measure, i: number): number | null {
  const s = l.s[i], g = l.g[i], f = l.f ? l.f[i] : null, oi = l.oi[i];
  if (m === "sales") return s;
  if (m === "gpv") return g;
  if (m === "gpvoi") return oi;
  if (m === "goi") return s && oi != null ? oi / s : null;
  if (m === "gp") return s && g != null ? g / s : null;
  if (m === "bs") return s != null && f ? s / f : null;
  return f;
}

/** One measure over every day of a row. */
function totalAt(l: Line, m: Measure): number | null {
  const s = sumOf(l.s), g = sumOf(l.g), oi = sumOf(l.oi);
  if (m === "sales") return s;
  if (m === "gpv") return g;
  if (m === "gpvoi") return oi;
  if (m === "goi") return s ? oi / s : null;
  if (m === "gp") return s ? g / s : null;
  if (m === "bs") return l.f && sumOf(l.f) ? s / sumOf(l.f) : null;
  return l.f ? sumOf(l.f) : null;
}

/** One measure for one day of a row, against the same day last year. */
function lastAt(l: Line, m: Measure, i: number): number | null {
  const s = l.sl[i], g = l.gl[i], f = l.fl ? l.fl[i] : null, oi = l.oil[i];
  if (m === "sales") return s;
  if (m === "gpv") return g;
  if (m === "gpvoi") return oi;
  if (m === "goi") return s && oi != null ? oi / s : null;
  if (m === "gp") return s && g != null ? g / s : null;
  if (m === "bs") return s != null && f ? s / f : null;
  return f;
}

/** One measure over every day of a row, against the same days last year. */
function totalLastAt(l: Line, m: Measure): number | null {
  const s = sumOf(l.sl), g = sumOf(l.gl), oi = sumOf(l.oil);
  if (m === "sales") return s;
  if (m === "gpv") return g;
  if (m === "gpvoi") return oi;
  if (m === "goi") return s ? oi / s : null;
  if (m === "gp") return s ? g / s : null;
  if (m === "bs") return l.fl && sumOf(l.fl) ? s / sumOf(l.fl) : null;
  return l.fl ? sumOf(l.fl) : null;
}

/** The change of a figure against the same day last year: a growth for money and counts, the difference in points for GP%. */
function changeOf(m: Measure, n: number | null, l: number | null): { text: string; tone: string } | null {
  if (m === "gp" || m === "goi") {
    if (n == null || l == null) return null;
    const d = n - l;
    return { text: signedPct(d, 2), tone: toneOfNum(d) };
  }
  const g = growth(n, l);
  if (g == null) return null;
  return { text: `${arrowOf(toneOfNum(g))}${signedPct(g, 2)}`, tone: toneOfNum(g) };
}

/** One figure in the table, with its change against the same day last year underneath. */
function ValueCell({ m, n, l, style }: { m: Measure; n: number | null; l: number | null; style?: CSSProperties }) {
  const c = changeOf(m, n, l);
  return (
    <td style={style}>
      <div>{shown(n, m)}</div>
      {c && <div><span className={`delta ${c.tone}`}>{c.text}</span></div>}
    </td>
  );
}

const shown = (v: number | null, m: Measure) =>
  v == null ? "–" : m === "sales" || m === "gpv" || m === "gpvoi" ? crOrDash(v) : m === "gp" || m === "goi" ? pct(v, 2) : full(v);

/** The day-by-day table of the heads: a measure selector, one column per day, and a drill from head to person to category.
 *  Footfall is counted for a head, a person under it (crpFf) and a category of that person; a blank means not counted. */
export default function DayByHead({ heads, totalF, detailRows, crpFf, days, cmpShort, scope }: {
  heads: DailyHead[]; totalF: DayFields; detailRows: DetailRow[]; crpFf: CrpFf[]; days: { date: string }[]; cmpShort: string; scope: string;
}) {
  const n = days.length;
  const [headKey, setHeadKey] = useState<string | null>(null);
  const [crpName, setCrpName] = useState<string | null>(null);
  const [measure, setMeasure] = useState<Measure>("sales");

  const headOf = heads.find((h) => `${h.division}|${h.head}` === headKey) ?? null;
  const level = headOf && crpName ? 2 : headOf ? 1 : 0;
  const rowsOfHead = headOf
    ? detailRows.filter((r) => r.division === headOf.division && r.head === headOf.head && r.crp != null && r.category != null)
    : [];
  // the footfall of a person under the open head
  const ffOfCrp = (crp: string | null): CrpFf | null => (headOf && crp
    ? crpFf.find((p) => p.division === headOf.division && p.head === headOf.head && p.crp === crp) ?? null
    : null);

  let lines: Line[];
  let total: Line;
  if (level === 0) {
    lines = heads.map((h) => ({ name: h.head, division: h.division, role: h.role, s: h.sales, g: h.gpv, f: h.ff, sl: h.splySales, gl: h.splyGpv, fl: h.splyFf, oi: plusAdj(h.gpv, h.valueAdj), oil: plusAdj(h.splyGpv, h.splyValueAdj), drill: true, key: `${h.division}|${h.head}` }));
    total = { name: "Total (all divisions)", s: totalF.sales, g: totalF.gpv, f: totalF.ff, sl: totalF.splySales, gl: totalF.splyGpv, fl: totalF.splyFf,
      oi: plusAdj(totalF.gpv, totalF.valueAdj), oil: plusAdj(totalF.splyGpv, totalF.splyValueAdj), drill: false, key: "" };
  } else if (level === 1 && headOf) {
    const byCrp = new Map<string, DetailRow[]>();
    for (const r of rowsOfHead) byCrp.set(r.crp as string, [...(byCrp.get(r.crp as string) ?? []), r]);
    lines = [...byCrp.entries()]
      .map(([crp, rs]) => ({ name: crp, s: addDays(rs.map((r) => r.sales), n), g: addDays(rs.map((r) => r.gpv), n), f: ffOfCrp(crp)?.ff ?? null, sl: addDays(rs.map((r) => r.splySales), n), gl: addDays(rs.map((r) => r.splyGpv), n), fl: ffOfCrp(crp)?.splyFf ?? null,
        oi: addDays(rs.map((r) => plusAdj(r.gpv, r.valueAdj)), n), oil: addDays(rs.map((r) => plusAdj(r.splyGpv, r.splyValueAdj)), n),
        drill: true, key: crp, division: headOf.division, role: headOf.role }))
      .sort((a, b) => sumOf(b.s) - sumOf(a.s));
    total = { name: "Total", s: headOf.sales, g: headOf.gpv, f: headOf.ff, sl: headOf.splySales, gl: headOf.splyGpv, fl: headOf.splyFf,
      oi: plusAdj(headOf.gpv, headOf.valueAdj), oil: plusAdj(headOf.splyGpv, headOf.splyValueAdj), drill: false, key: "" };
  } else {
    const rs = rowsOfHead.filter((r) => r.crp === crpName);
    lines = rs
      .map((r) => ({ name: titleCase(r.category as string), s: r.sales, g: r.gpv, f: r.ff, sl: r.splySales, gl: r.splyGpv, fl: r.splyFf,
        oi: plusAdj(r.gpv, r.valueAdj), oil: plusAdj(r.splyGpv, r.splyValueAdj), drill: false, key: r.category as string, division: headOf?.division, role: headOf?.role }))
      .sort((a, b) => sumOf(b.s) - sumOf(a.s));
    total = { name: "Total", s: addDays(rs.map((r) => r.sales), n), g: addDays(rs.map((r) => r.gpv), n), f: ffOfCrp(crpName)?.ff ?? null,
      sl: addDays(rs.map((r) => r.splySales), n), gl: addDays(rs.map((r) => r.splyGpv), n), fl: ffOfCrp(crpName)?.splyFf ?? null,
      oi: addDays(rs.map((r) => plusAdj(r.gpv, r.valueAdj)), n), oil: addDays(rs.map((r) => plusAdj(r.splyGpv, r.splyValueAdj)), n), drill: false, key: "" };
  }

  const activeMeasure = measure;
  const firstCol = level === 0 ? "Head" : level === 1 ? "CRP" : "Category (Cat 3)";

  return (
    <div>
      <nav aria-label="Drill path" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 13, margin: "0 0 10px" }}>
        {level === 0
          ? <span style={{ fontWeight: 500 }}>All heads</span>
          : <button type="button" className="linkish" onClick={() => { setHeadKey(null); setCrpName(null); }}>All heads</button>}
        {headOf && <span style={{ color: "var(--ov-ink2)" }}>›</span>}
        {headOf && (level === 1
          ? <span style={{ fontWeight: 500 }}>{headOf.head}</span>
          : <button type="button" className="linkish" onClick={() => setCrpName(null)}>{headOf.head}</button>)}
        {crpName && <span style={{ color: "var(--ov-ink2)" }}>›</span>}
        {crpName && <span style={{ fontWeight: 500 }}>{crpName}</span>}
      </nav>
      <div className="seg" role="group" aria-label="Measure" style={{ marginBottom: 12 }}>
        {MEASURES.map((x) => (
          <button key={x.k} type="button" aria-pressed={activeMeasure === x.k} onClick={() => setMeasure(x.k)}>{x.l}</button>
        ))}
      </div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table dh day-head-table">
            <caption>{scope}. Click a head&apos;s › to see its persons, and a person&apos;s › to see their categories.</caption>
            <thead>
              <tr>
                <th scope="col" className="l dh-c1" title="Division">Div</th>
                <th scope="col" className="l dh-c2">Category role</th>
                <th scope="col" className="l dh-c3">{firstCol}</th>
                {days.map((d) => (
                  <th key={d.date} scope="col" style={{ background: isFriSat(d.date) ? "var(--surface-1)" : undefined }}>
                    {dayMonth(d.date)}
                    <div style={{ fontWeight: 400, color: "var(--ov-ink2)", fontSize: 11 }}>{dayWeekday(d.date)}</div>
                  </th>
                ))}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="l dh-c1" title={l.division}>{l.division ? abbrOf(l.division) : ""}</td>
                  <td className="l dh-c2">{l.role ?? ""}</td>
                  <td className="l dh-c3">
                    {l.drill
                      ? <button type="button" className="linkish" onClick={() => (level === 0 ? setHeadKey(l.key) : setCrpName(l.key))}>{l.name} ›</button>
                      : l.name}
                  </td>
                  {days.map((d, i) => (
                    <ValueCell key={d.date} m={activeMeasure} n={valueAt(l, activeMeasure, i)} l={lastAt(l, activeMeasure, i)}
                      style={{ background: isFriSat(d.date) ? "var(--surface-1)" : undefined }} />
                  ))}
                  <ValueCell m={activeMeasure} n={totalAt(l, activeMeasure)} l={totalLastAt(l, activeMeasure)} style={{ fontWeight: 500 }} />
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3} className="l dh-foot">{total.name}</th>
                {days.map((d, i) => (
                  <ValueCell key={d.date} m={activeMeasure} n={valueAt(total, activeMeasure, i)} l={lastAt(total, activeMeasure, i)}
                    style={{ fontWeight: 500, background: isFriSat(d.date) ? "var(--surface-1)" : undefined }} />
                ))}
                <ValueCell m={activeMeasure} n={totalAt(total, activeMeasure)} l={totalLastAt(total, activeMeasure)} style={{ fontWeight: 500 }} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
