"use client";

import { useState } from "react";
import type { DailyData, DayFields } from "@/lib/types";
import { abbrOf, arrowOf, crFmt, crSigned, full, growth, pct, roleName, signedPct, toneOfNum } from "@/lib/format";
import { useTooltip, type TipRow } from "./charts";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";

type Group = "all" | "same";
const GROUP_LABEL: Record<Group, string> = { all: "All stores", same: "Same stores" };
const TOTAL = "total";

/** Figures for one day, or for the period when summed. GPV+OI is GPV plus value adj, as in the workbook. */
type Figures = {
  sales: number | null; splySales: number | null;
  gpv: number | null; splyGpv: number | null;
  gpvOi: number | null; splyGpvOi: number | null;
  ff: number | null; splyFf: number | null;
};
type Ratios = { gp: number | null; splyGp: number | null; goi: number | null; splyGoi: number | null; bs: number | null; splyBs: number | null };
type DayRow = { date: string; sply: string; f: Figures; x: Ratios };
type Chg = { text: string | null; t: "up" | "down" | "flat" };

type SortKey = "day" | "sales" | "gpv" | "gp" | "gpvoi" | "goi" | "ff" | "bs";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const FIELDS = ["sales", "splySales", "gpv", "splyGpv", "gpvOi", "splyGpvOi", "ff", "splyFf"] as const;

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

function sumFigures(rows: Figures[]): Figures {
  const out = {} as Figures;
  for (const k of FIELDS) {
    const vals = rows.map((r) => r[k]).filter((v): v is number => v != null);
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  return out;
}

const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
const difference = (n: number | null, l: number | null) => (n != null && l != null ? n - l : null);

function ratiosOf(f: Figures): Ratios {
  return {
    gp: ratio(f.gpv, f.sales), splyGp: ratio(f.splyGpv, f.splySales),
    goi: ratio(f.gpvOi, f.sales), splyGoi: ratio(f.splyGpvOi, f.splySales),
    bs: ratio(f.sales, f.ff), splyBs: ratio(f.splySales, f.splyFf),
  };
}

/** Growth is blank when either side is missing or zero, as on the other tabs. */
const growthChg = (n: number | null, l: number | null): Chg => {
  const g = growth(n, l);
  return { text: g == null ? null : signedPct(g, 2), t: toneOfNum(g) };
};
/** Ratio change: the difference between the two percentages. */
const diffChg = (n: number | null, l: number | null): Chg => {
  const d = difference(n, l);
  return { text: d == null ? null : signedPct(d, 2), t: toneOfNum(d) };
};

const cr = (v: number | null) => (v == null ? "–" : crFmt(v));

const parseDay = (iso: string) => new Date(`${iso}T00:00:00`);
const dayShort = (iso: string) => parseDay(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const dayLong = (iso: string) => parseDay(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const dayNum = (iso: string) => parseDay(iso).getDate();

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

      <div className="ov-section-head"><h2>Sales and GPV by day</h2></div>
      <DayColumns rows={rows} title="Sales by day" sub="crore; navy this month, grey same day last year" fmt={crFmt}
        pick={(r) => [r.f.sales, r.f.splySales]} />
      <DayColumns rows={rows} title="GPV by day" sub="crore; navy this month, grey same day last year" fmt={crFmt}
        pick={(r) => [r.f.gpv, r.f.splyGpv]} />

      <div className="ov-section-head"><h2>GP+OI% by day</h2></div>
      <GpOiLines rows={rows} />

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

function SortTh({ k, label, sort, onSort, cls }: { k: SortKey; label: string; sort: Sort; onSort: (k: SortKey) => void; cls?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" className={cls} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className="sortbtn" onClick={() => onSort(k)}>{label}{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
    </th>
  );
}

function Cell({ value, chg }: { value: string; chg: Chg }) {
  return (
    <td>
      <div className="ov-td-val">{value}</div>
      {chg.text !== null && <div><span className={`delta ${chg.t}`}>{arrowOf(chg.t)}{chg.text}</span></div>}
    </td>
  );
}

/** Paired columns per day: this month (navy) against the same day last year (grey); hover shows the figures. */
function DayColumns({ rows, title, sub, fmt, pick }: {
  rows: DayRow[]; title: string; sub: string; fmt: (v: number) => string; pick: (r: DayRow) => [number | null, number | null];
}) {
  const { show, hide, node } = useTooltip();
  const W = 1000, top = 12, plotH = 220, base = top + plotH, H = base + 24;
  const vals = rows.map(pick);
  const vmax = Math.max(1, ...vals.flatMap(([n, l]) => [n ?? 0, l ?? 0]));
  const gw = W / Math.max(1, rows.length);
  const bw = Math.min(18, (gw - 6) / 2);
  return (
    <div className="ov-panel">
      <h3>{title}<small>{sub}</small></h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title}: this month against the same day last year`}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={0} x2={W} y1={base - plotH * t} y2={base - plotH * t} className="ov-grid" />
        ))}
        <line x1={0} x2={W} y1={base} y2={base} className="ov-base" />
        {rows.map((r, i) => {
          const [now, last] = vals[i];
          const cx = gw * i + gw / 2;
          const hn = (plotH * (now ?? 0)) / vmax;
          const hl = (plotH * (last ?? 0)) / vmax;
          const d = difference(now, last);
          const tip: TipRow[] = [
            ["This day", now == null ? "–" : fmt(now)],
            ["Same day last year", last == null ? "–" : fmt(last)],
            ["Difference", d == null ? "–" : `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d))}`],
            ["Change", signedPct(growth(now, last), 2)],
          ];
          return (
            <g key={r.date} onMouseMove={(e) => show(e, `${dayLong(r.date)} · vs ${dayShort(r.sply)}`, tip)} onMouseLeave={hide}>
              <rect className="ov-col-hit" x={gw * i} y={0} width={gw} height={H} />
              <rect x={cx - bw - 1} y={base - hn} width={bw} height={Math.max(hn, 0)} rx={3} style={{ fill: "var(--this)" }} />
              <rect x={cx + 1} y={base - hl} width={bw} height={Math.max(hl, 0)} rx={3} style={{ fill: "var(--last)" }} />
              <text x={cx} y={base + 16} textAnchor="middle" fontSize={11} className="ov-col-name">{dayNum(r.date)}</text>
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

/** GP+OI% per day as two lines: this month (navy) against the same day last year (grey). */
function GpOiLines({ rows }: { rows: DayRow[] }) {
  const { show, hide, node } = useTooltip();
  const W = 1000, H = 240, pad = 24;
  const vals = rows.flatMap((r) => [r.x.goi, r.x.splyGoi]).filter((v): v is number => v != null);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 0.0001;
  const gw = W / Math.max(1, rows.length);
  const x = (i: number) => gw * i + gw / 2;
  const y = (v: number) => pad + ((hi - v) / span) * (H - 2 * pad);
  const line = (pick: (r: DayRow) => number | null) =>
    rows.map((r, i) => { const v = pick(r); return v == null ? null : `${x(i)},${y(v)}`; }).filter(Boolean).join(" ");
  return (
    <div className="ov-panel">
      <h3>GP+OI%<small>navy this month, grey same day last year</small></h3>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="GP+OI% by day, this month against the same day last year">
        <line x1={0} x2={W} y1={y(hi)} y2={y(hi)} className="ov-grid" />
        <line x1={0} x2={W} y1={y(lo)} y2={y(lo)} className="ov-grid" />
        <text x={4} y={y(hi) - 6} fontSize={11} className="ov-col-name">{pct(hi, 2)}</text>
        <text x={4} y={y(lo) + 14} fontSize={11} className="ov-col-name">{pct(lo, 2)}</text>
        <polyline points={line((r) => r.x.splyGoi)} fill="none" style={{ stroke: "var(--last)" }} strokeWidth={2.5} strokeLinejoin="round" />
        <polyline points={line((r) => r.x.goi)} fill="none" style={{ stroke: "var(--this)" }} strokeWidth={2.5} strokeLinejoin="round" />
        {rows.map((r, i) => {
          const tip: TipRow[] = [
            ["This day", pct(r.x.goi, 2)],
            ["Same day last year", pct(r.x.splyGoi, 2)],
            ["Difference", signedPct(difference(r.x.goi, r.x.splyGoi), 2)],
          ];
          return (
            <g key={r.date} onMouseMove={(e) => show(e, `${dayLong(r.date)} · vs ${dayShort(r.sply)}`, tip)} onMouseLeave={hide}>
              <rect className="ov-col-hit" x={gw * i} y={0} width={gw} height={H} />
              {r.x.splyGoi != null && <circle cx={x(i)} cy={y(r.x.splyGoi)} r={3} style={{ fill: "var(--last)" }} />}
              {r.x.goi != null && <circle cx={x(i)} cy={y(r.x.goi)} r={3.5} style={{ fill: "var(--this)" }} />}
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}
