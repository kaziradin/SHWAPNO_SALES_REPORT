"use client";

import { useState } from "react";
import type { DailyHead, DayFields, DetailRow } from "@/lib/types";
import { abbrOf, crOrDash, full, pct, titleCase } from "@/lib/format";
import { dayMonth, dayWeekday, isFriSat } from "@/lib/daily";

type Measure = "sales" | "gpv" | "gp" | "bs" | "ff";
const MEASURES: { k: Measure; l: string; perBill: boolean }[] = [
  { k: "sales", l: "Sales", perBill: false },
  { k: "gpv", l: "GPV", perBill: false },
  { k: "gp", l: "GP%", perBill: false },
  { k: "bs", l: "Basket", perBill: true },
  { k: "ff", l: "Footfall", perBill: true },
];

/** One row of the table: sales and GPV for each day (in taka), and footfall where it can be counted (null where not). */
type Line = { name: string; code?: string; s: (number | null)[]; g: (number | null)[]; f: (number | null)[] | null; drill: boolean; key: string };

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

/** One measure for one day of a row. Basket is sales per bill, in taka. */
function valueAt(l: Line, m: Measure, i: number): number | null {
  const s = l.s[i], g = l.g[i], f = l.f ? l.f[i] : null;
  if (m === "sales") return s;
  if (m === "gpv") return g;
  if (m === "gp") return s && g != null ? g / s : null;
  if (m === "bs") return s != null && f ? s / f : null;
  return f;
}

/** One measure over every day of a row. */
function totalAt(l: Line, m: Measure): number | null {
  const s = sumOf(l.s), g = sumOf(l.g);
  if (m === "sales") return s;
  if (m === "gpv") return g;
  if (m === "gp") return s ? g / s : null;
  if (m === "bs") return l.f && sumOf(l.f) ? s / sumOf(l.f) : null;
  return l.f ? sumOf(l.f) : null;
}

const shown = (v: number | null, m: Measure) =>
  v == null ? "–" : m === "sales" || m === "gpv" ? crOrDash(v) : m === "gp" ? pct(v, 2) : full(v);

/** The day-by-day table of the heads: a measure selector, one column per day, and a drill from head to person to category. */
export default function DayByHead({ heads, totalF, detailRows, days, cmpShort, scope }: {
  heads: DailyHead[]; totalF: DayFields; detailRows: DetailRow[]; days: { date: string }[]; cmpShort: string; scope: string;
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

  let lines: Line[];
  let total: Line;
  if (level === 0) {
    lines = heads.map((h) => ({ name: h.head, code: abbrOf(h.division), s: h.sales, g: h.gpv, f: h.ff, drill: true, key: `${h.division}|${h.head}` }));
    total = { name: "Total (all divisions)", s: totalF.sales, g: totalF.gpv, f: totalF.ff, drill: false, key: "" };
  } else if (level === 1 && headOf) {
    const byCrp = new Map<string, DetailRow[]>();
    for (const r of rowsOfHead) byCrp.set(r.crp as string, [...(byCrp.get(r.crp as string) ?? []), r]);
    lines = [...byCrp.entries()]
      .map(([crp, rs]) => ({ name: crp, s: addDays(rs.map((r) => r.sales), n), g: addDays(rs.map((r) => r.gpv), n), f: null, drill: true, key: crp }))
      .sort((a, b) => sumOf(b.s) - sumOf(a.s));
    total = { name: "Total", s: headOf.sales, g: headOf.gpv, f: headOf.ff, drill: false, key: "" };
  } else {
    const rs = rowsOfHead.filter((r) => r.crp === crpName);
    lines = rs
      .map((r) => ({ name: titleCase(r.category as string), s: r.sales, g: r.gpv, f: r.ff, drill: false, key: r.category as string }))
      .sort((a, b) => sumOf(b.s) - sumOf(a.s));
    total = { name: "Total", s: addDays(rs.map((r) => r.sales), n), g: addDays(rs.map((r) => r.gpv), n), f: null, drill: false, key: "" };
  }

  const personLevel = level === 1;
  const activeMeasure: Measure = personLevel && MEASURES.find((x) => x.k === measure)?.perBill ? "sales" : measure;
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
        {MEASURES.map((x) => {
          const off = personLevel && x.perBill;
          return (
            <button key={x.k} type="button" aria-pressed={activeMeasure === x.k} disabled={off} title={off ? "Not counted per person" : undefined}
              onClick={() => setMeasure(x.k)}>{x.l}</button>
          );
        })}
      </div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table" style={{ fontSize: 12 }}>
            <caption>{scope}. Click a head&apos;s › to see its persons, and a person&apos;s › to see their categories.</caption>
            <thead>
              <tr>
                <th scope="col" className="l">{firstCol}</th>
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
                  <td className="l">
                    {l.code && <span style={{ color: "var(--ov-ink2)", fontSize: 11, marginRight: 6 }}>{l.code}</span>}
                    {l.drill
                      ? <button type="button" className="linkish" onClick={() => (level === 0 ? setHeadKey(l.key) : setCrpName(l.key))}>{l.name} ›</button>
                      : l.name}
                  </td>
                  {days.map((d, i) => (
                    <td key={d.date} style={{ background: isFriSat(d.date) ? "var(--surface-1)" : undefined }}>{shown(valueAt(l, activeMeasure, i), activeMeasure)}</td>
                  ))}
                  <td style={{ fontWeight: 500 }}>{shown(totalAt(l, activeMeasure), activeMeasure)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="l">{total.name}</th>
                {days.map((d, i) => (
                  <td key={d.date} style={{ fontWeight: 500, background: isFriSat(d.date) ? "var(--surface-1)" : undefined }}>{shown(valueAt(total, activeMeasure, i), activeMeasure)}</td>
                ))}
                <td style={{ fontWeight: 500 }}>{shown(totalAt(total, activeMeasure), activeMeasure)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
