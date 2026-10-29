"use client";

import { useState } from "react";
import type { DailyData, DayFields } from "@/lib/types";
import { abbrOf, arrowOf, crFmt, crSigned, full, growth, pct, roleName, signedPct, toneOfNum } from "@/lib/format";
import { useTooltip, useWidth, type TipRow } from "./charts";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";
import {
  Cell, dayLong, dayNum, dayShort, difference, diffChg, Figures, growthChg, Ratios, ratiosOf, SortState, SortTh, sumFigures,
} from "@/lib/daily";
import DailyDetail from "./DailyDetail";

type Group = "all" | "same";
const GROUP_LABEL: Record<Group, string> = { all: "All stores", same: "Same stores" };
const TOTAL = "total";

type DayRow = { date: string; sply: string; f: Figures; x: Ratios };

type SortKey = "day" | "sales" | "gpv" | "gp" | "gpvoi" | "goi" | "ff" | "bs";
type Sort = SortState<SortKey>;

const at = (a: (number | null)[], i: number) => a[i] ?? null;

function dayFigures(f: DayFields, i: number): Figures {
  const gpv = at(f.gpv, i), splyGpv = at(f.splyGpv, i);
  const adj = at(f.valueAdj, i), splyAdj = at(f.splyValueAdj, i);
  return {
    sales: at(f.sales, i), splySales: at(f.splySales, i),
    gpv, splyGpv,
    gpvOi: gpv == null ? null : gpv + (adj ?? 0),
    splyGpvOi: splyGpv == null ? null : splyGpv + (splyAdj ?? 0),
    ff: at(f.ff, i), splyFf: at(f.splyFf, i),
  };
}

const headKey = (h: { division: string; role: string; head: string }) => `${h.division}|${h.role}|${h.head}`;
const headLabel = (h: { division: string; role: string; head: string }) => `${abbrOf(h.division)} - ${roleName(h.role)} - ${h.head}`;

export default function Daily({ daily }: { daily: DailyData }) {
  const [group, setGroup] = useState<Group>("all");
  const [head, setHead] = useState<string>(TOTAL);
  const [sort, setSort] = useState<Sort>({ key: "day", dir: "asc" });
  const g = daily.groups[group];
  const picked = g.heads.find((h) => headKey(h) === head);
  const source: DayFields = head === TOTAL || !picked ? g.total : picked;
  const selectionLabel = head === TOTAL || !picked ? "All category heads" : headLabel(picked);

  const rows: DayRow[] = daily.days.map((d, i) => {
    const f = dayFigures(source, i);
    return { date: d.date, sply: d.sply, f, x: ratiosOf(f) };
  });
  const total = sumFigures(rows.map((r) => r.f));
  const totalX = ratiosOf(total);

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "day" ? "asc" : "desc" }));
  const sorted = [...rows].sort((a, b) => {
    const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
    const m = sort.dir === "asc" ? 1 : -1;
    return typeof x === "string" ? x.localeCompare(y as string) * m : ((x as number) - (y as number)) * m;
  });

  const moneyDelta = (n: number | null, l: number | null) => {
    const gr = growth(n, l), d = difference(n, l);
    return { delta: `${d == null ? "–" : crSigned(d)}   ${arrowOf(toneOfNum(gr))}${signedPct(gr, 2)}`, t: toneOfNum(gr) };
  };
  const pointDelta = (n: number | null, l: number | null) => {
    const d = difference(n, l);
    return { delta: signedPct(d, 2), t: toneOfNum(d) };
  };
  const cr = (v: number | null) => (v == null ? "–" : crFmt(v));
  const kpi = [
    { label: "Sales", value: cr(total.sales), sply: `SPLY: ${cr(total.splySales)}`, ...moneyDelta(total.sales, total.splySales) },
    { label: "GP%", value: pct(totalX.gp, 2), sply: `SPLY: ${pct(totalX.splyGp, 2)}`, ...pointDelta(totalX.gp, totalX.splyGp) },
    { label: "GPV", value: cr(total.gpv), sply: `SPLY: ${cr(total.splyGpv)}`, ...moneyDelta(total.gpv, total.splyGpv) },
    { label: "GP+OI%", value: pct(totalX.goi, 2), sply: `SPLY: ${pct(totalX.splyGoi, 2)}`, ...pointDelta(totalX.goi, totalX.splyGoi) },
    { label: "GPV+OI", value: cr(total.gpvOi), sply: `SPLY: ${cr(total.splyGpvOi)}`, ...moneyDelta(total.gpvOi, total.splyGpvOi) },
  ];

  const exportDays = () => {
    const cols: ExportCol[] = [
      { header: "Date", format: "text" }, { header: "Same day last year", format: "text" },
      { header: "Sales", format: "money" }, { header: "Sales SPLY", format: "money" }, { header: "Sales growth", format: "pct" },
      { header: "GPV", format: "money" }, { header: "GPV SPLY", format: "money" }, { header: "GPV growth", format: "pct" },
      { header: "GP%", format: "pct" }, { header: "GP% SPLY", format: "pct" }, { header: "GP% change", format: "pct" },
      { header: "GPV+OI", format: "money" }, { header: "GPV+OI SPLY", format: "money" }, { header: "GPV+OI growth", format: "pct" },
      { header: "GP+OI%", format: "pct" }, { header: "GP+OI% SPLY", format: "pct" }, { header: "GP+OI% change", format: "pct" },
      { header: "Footfall", format: "int" }, { header: "Footfall SPLY", format: "int" }, { header: "Footfall growth", format: "pct" },
      { header: "Basket", format: "money" }, { header: "Basket SPLY", format: "money" }, { header: "Basket growth", format: "pct" },
    ];
    const cells = (f: Figures, x: Ratios): ExportCell[] => [
      f.sales, f.splySales, growth(f.sales, f.splySales),
      f.gpv, f.splyGpv, growth(f.gpv, f.splyGpv),
      x.gp, x.splyGp, difference(x.gp, x.splyGp),
      f.gpvOi, f.splyGpvOi, growth(f.gpvOi, f.splyGpvOi),
      x.goi, x.splyGoi, difference(x.goi, x.splyGoi),
      f.ff, f.splyFf, growth(f.ff, f.splyFf),
      x.bs, x.splyBs, growth(x.bs, x.splyBs),
    ];
    const body: ExportCell[][] = [
      ...sorted.map((r) => [dayLong(r.date), dayLong(r.sply), ...cells(r.f, r.x)]),
      [`Total (${rows.length} days)`, "", ...cells(total, totalX)],
    ];
    downloadExcel(`day-wise-sales-${group}.xlsx`, "Day wise sales", cols, body);
  };

  return (
    <div className="ov">
      <div className="drill-filters">
        <label>Store group
          <select value={group} onChange={(e) => setGroup(e.target.value as Group)} aria-label="Store group">
            {(Object.keys(GROUP_LABEL) as Group[]).map((k) => <option key={k} value={k}>{GROUP_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Category head
          <select value={head} onChange={(e) => setHead(e.target.value)} aria-label="Category head">
            <option value={TOTAL}>All category heads</option>
            {g.heads.map((h) => <option key={headKey(h)} value={headKey(h)}>{headLabel(h)}</option>)}
          </select>
        </label>
      </div>

      <section className="ov-kpis five" aria-label="Day wise sales key figures">
        {kpi.map((k) => (
          <div className="ov-kpi" key={k.label}>
            <div className="ov-kpi-label">{k.label}</div>
            <div className="ov-kpi-value">{k.value}</div>
            <div className="ov-kpi-cmp">{k.sply}</div>
            <div className="ov-kpi-delta"><span className={`ov-chg ${k.t}`}>{k.delta}</span></div>
          </div>
        ))}
      </section>
      <p className="ov-note">
        {selectionLabel}, {GROUP_LABEL[group].toLowerCase()}, {rows.length} days so far. Each day is compared with the same day last year.
      </p>

      <div className="day-charts">
        <DayLines rows={rows} kind="money" title="Day wise sales" sub="crore; navy this month, grey same day last year"
          pick={(r) => [r.f.sales, r.f.splySales]} />
        <div className="day-pair">
          <DayLines rows={rows} kind="money" title="Day wise GPV" sub="crore; navy this month, grey same day last year"
            pick={(r) => [r.f.gpv, r.f.splyGpv]} />
          <DayLines rows={rows} kind="money" title="Day wise GPV+OI" sub="crore; navy this month, grey same day last year"
            pick={(r) => [r.f.gpvOi, r.f.splyGpvOi]} />
        </div>
        <div className="day-pair">
          <DayLines rows={rows} kind="pct" title="Day wise GP%" sub="navy this month, grey same day last year"
            pick={(r) => [r.x.gp, r.x.splyGp]} />
          <DayLines rows={rows} kind="pct" title="Day wise GP+OI%" sub="navy this month, grey same day last year"
            pick={(r) => [r.x.goi, r.x.splyGoi]} />
        </div>
      </div>

      <div className="ov-section-head"><h2>Day by day</h2></div>
      <div className="xbar"><ExportButton onClick={exportDays} /></div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table">
            <caption>
              {selectionLabel}, {GROUP_LABEL[group].toLowerCase()}. Each day against the same day last year. Click a heading to sort.
            </caption>
            <thead>
              <tr>
                <SortTh k="day" label="Day" sort={sort} onSort={onSort} cls="l" />
                <SortTh k="sales" label="Sales" sort={sort} onSort={onSort} />
                <SortTh k="gpv" label="GPV" sort={sort} onSort={onSort} />
                <SortTh k="gp" label="GP%" sort={sort} onSort={onSort} />
                <SortTh k="gpvoi" label="GPV+OI" sort={sort} onSort={onSort} />
                <SortTh k="goi" label="GP+OI%" sort={sort} onSort={onSort} />
                <SortTh k="ff" label="Footfall" sort={sort} onSort={onSort} />
                <SortTh k="bs" label="Basket" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.date}>
                  <th scope="row" style={{ textAlign: "left" }}>
                    {dayLong(r.date)}
                    <div className="sub">vs {dayShort(r.sply)}</div>
                  </th>
                  <Cell value={full(r.f.sales)} chg={growthChg(r.f.sales, r.f.splySales)} />
                  <Cell value={full(r.f.gpv)} chg={growthChg(r.f.gpv, r.f.splyGpv)} />
                  <Cell value={pct(r.x.gp, 2)} chg={diffChg(r.x.gp, r.x.splyGp)} />
                  <Cell value={full(r.f.gpvOi)} chg={growthChg(r.f.gpvOi, r.f.splyGpvOi)} />
                  <Cell value={pct(r.x.goi, 2)} chg={diffChg(r.x.goi, r.x.splyGoi)} />
                  <Cell value={full(r.f.ff)} chg={growthChg(r.f.ff, r.f.splyFf)} />
                  <Cell value={full(r.x.bs)} chg={growthChg(r.x.bs, r.x.splyBs)} />
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row" style={{ textAlign: "left" }}>Total ({rows.length} days)</th>
                  <Cell value={full(total.sales)} chg={growthChg(total.sales, total.splySales)} />
                  <Cell value={full(total.gpv)} chg={growthChg(total.gpv, total.splyGpv)} />
                  <Cell value={pct(totalX.gp, 2)} chg={diffChg(totalX.gp, totalX.splyGp)} />
                  <Cell value={full(total.gpvOi)} chg={growthChg(total.gpvOi, total.splyGpvOi)} />
                  <Cell value={pct(totalX.goi, 2)} chg={diffChg(totalX.goi, totalX.splyGoi)} />
                  <Cell value={full(total.ff)} chg={growthChg(total.ff, total.splyFf)} />
                  <Cell value={full(totalX.bs)} chg={growthChg(totalX.bs, totalX.splyBs)} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <DailyDetail daily={daily} group={group} />
    </div>
  );
}

function sortValue(r: DayRow, key: SortKey): number | string {
  switch (key) {
    case "day": return r.date;
    case "sales": return r.f.sales ?? 0;
    case "gpv": return r.f.gpv ?? 0;
    case "gp": return r.x.gp ?? 0;
    case "gpvoi": return r.f.gpvOi ?? 0;
    case "goi": return r.x.goi ?? 0;
    case "ff": return r.f.ff ?? 0;
    case "bs": return r.x.bs ?? 0;
  }
}

/** One line per series, one point per day: this month (navy) against the same day last year (grey).
 *  Money is labelled in crore, ratios in percent to two decimals. Hover shows the day's figures. */
function DayLines({ rows, title, sub, kind, pick }: {
  rows: DayRow[]; title: string; sub: string; kind: "money" | "pct"; pick: (r: DayRow) => [number | null, number | null];
}) {
  const { show, hide, node } = useTooltip();
  const { ref, w } = useWidth(560);
  const H = 240, top = 14, bottom = 26, left = 66, right = 14;
  const fmt = (v: number) => (kind === "money" ? crFmt(v) : pct(v, 2));
  const pts = rows.map(pick);
  const values = pts.flatMap(([a, b]) => [a, b]).filter((v): v is number => v != null);
  const lo0 = values.length ? Math.min(...values) : 0;
  const hi0 = values.length ? Math.max(...values) : 1;
  const padding = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.01 || 1;
  const lo = lo0 - padding, hi = hi0 + padding;
  const plotW = Math.max(40, w - left - right), plotH = H - top - bottom;
  const n = Math.max(1, rows.length);
  const x = (i: number) => left + (plotW * (i + 0.5)) / n;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * plotH;
  const line = (side: 0 | 1) =>
    pts.map(([a, b], i) => { const v = side === 0 ? a : b; return v == null ? null : `${x(i)},${y(v)}`; }).filter(Boolean).join(" ");
  // label every day when there is room, otherwise every second, third... day; the last day is always labelled
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 24))));
  const lastIdx = rows.length - 1;
  const lastNow = lastIdx >= 0 ? pts[lastIdx][0] : null;
  const ticks = [hi0, (hi0 + lo0) / 2, lo0];
  return (
    <div className="ov-panel">
      <h3>{title}<small>{sub}</small></h3>
      <div ref={ref}>
        <svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img" aria-label={`${title}: this month against the same day last year`}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={left} x2={w - right} y1={y(t)} y2={y(t)} className="ov-grid" />
              <text x={left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} className="ov-col-name">{fmt(t)}</text>
            </g>
          ))}
          <polyline points={line(1)} fill="none" style={{ stroke: "var(--last)" }} strokeWidth={2} strokeLinejoin="round" />
          <polyline points={line(0)} fill="none" style={{ stroke: "var(--this)" }} strokeWidth={2.5} strokeLinejoin="round" />
          {rows.map((r, i) => {
            const [now, prev] = pts[i];
            const d = difference(now, prev);
            const tip: TipRow[] = [
              ["This day", now == null ? "–" : fmt(now)],
              ["Same day last year", prev == null ? "–" : fmt(prev)],
              ["Difference", d == null ? "–" : kind === "money" ? crSigned(d) : signedPct(d, 2)],
            ];
            if (kind === "money") tip.push(["Change", signedPct(growth(now, prev), 2)]);
            return (
              <g key={r.date} onMouseMove={(e) => show(e, `${dayLong(r.date)} · vs ${dayShort(r.sply)}`, tip)} onMouseLeave={hide}>
                <rect className="ov-col-hit" x={x(i) - plotW / n / 2} y={0} width={plotW / n} height={H} />
                {prev != null && <circle cx={x(i)} cy={y(prev)} r={3} style={{ fill: "var(--last)" }} />}
                {now != null && <circle cx={x(i)} cy={y(now)} r={3.5} style={{ fill: "var(--this)" }} />}
                {(i % step === 0 || i === lastIdx) && (
                  <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} className="ov-col-name">{dayNum(r.date)}</text>
                )}
              </g>
            );
          })}
          {lastNow != null && (
            <text x={x(lastIdx)} y={y(lastNow) - 9} textAnchor="end" fontSize={12} style={{ fill: "var(--this)", fontWeight: 600 }}>
              {fmt(lastNow)}
            </text>
          )}
        </svg>
      </div>
      {node}
    </div>
  );
}
