"use client";

import { useEffect, useState } from "react";
import type { DailyData, DailyDetailData, DailyHead, DayFields } from "@/lib/types";
import { abbrOf, arrowOf, crFmt, crSigned, full, growth, pct, roleName, signedPct, toneOfNum } from "@/lib/format";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";
import {
  Cell, dayFieldsOfRows, dayLong, dayMonth, dayWeekday, difference, diffChg, Figures, growthChg, isFriSat, MTD, Ratios, ratiosOf,
  sumFigures, uniqSorted,
} from "@/lib/daily";
import DailyDetail from "./DailyDetail";
import DayLines, { type DayPoint } from "./DayLines";

type Group = "all" | "same";
const GROUP_LABEL: Record<Group, string> = { all: "All stores", same: "Same stores" };
const TOTAL = "total";

type DayRow = { date: string; sply: string; f: Figures; x: Ratios };

/** One row of the day table: a measure, with this month's and last year's value for any day or the whole period. */
type Metric = {
  label: string;
  kind: "amount" | "ratio";
  format: "money" | "int" | "pct";
  now: (f: Figures, x: Ratios) => number | null;
  prev: (f: Figures, x: Ratios) => number | null;
};
const METRICS: Metric[] = [
  { label: "Sales", kind: "amount", format: "money", now: (f) => f.sales, prev: (f) => f.splySales },
  { label: "GPV", kind: "amount", format: "money", now: (f) => f.gpv, prev: (f) => f.splyGpv },
  { label: "GP%", kind: "ratio", format: "pct", now: (_, x) => x.gp, prev: (_, x) => x.splyGp },
  { label: "GPV+OI", kind: "amount", format: "money", now: (f) => f.gpvOi, prev: (f) => f.splyGpvOi },
  { label: "GP+OI%", kind: "ratio", format: "pct", now: (_, x) => x.goi, prev: (_, x) => x.splyGoi },
  { label: "Footfall", kind: "amount", format: "int", now: (f) => f.ff, prev: (f) => f.splyFf },
  { label: "Basket", kind: "amount", format: "money", now: (_, x) => x.bs, prev: (_, x) => x.splyBs },
];

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

/** One chart's points: this month and the same day last year for each day. */
const seriesOf = (rows: DayRow[], pick: (r: DayRow) => [number | null, number | null]): DayPoint[] =>
  rows.map((r) => {
    const [now, prev] = pick(r);
    return { date: r.date, sply: r.sply, now, prev };
  });

export default function Daily({ daily }: { daily: DailyData }) {
  const [period, setPeriod] = useState<string>(MTD);
  const [group, setGroup] = useState<Group>("all");
  const [head, setHead] = useState<string>(TOTAL);
  const [crp, setCrp] = useState("");
  const [detail, setDetail] = useState<DailyDetailData | null>(null);

  // the detail rows are a separate data file; they give the CRP list, the figures for a CRP, and the detail table
  useEffect(() => {
    let live = true;
    import("@/data/daily-detail.json").then((m) => {
      if (live) setDetail(m.default as unknown as DailyDetailData);
    });
    return () => { live = false; };
  }, []);

  const g = daily.groups[group];
  const picked = g.heads.find((h) => headKey(h) === head);
  const headSel: DailyHead | null = head === TOTAL || !picked ? null : picked;
  const detailRows = detail?.groups[group] ?? [];
  const rowsOfHead = (h: DailyHead | null) => (h ? detailRows.filter((r) => r.division === h.division && r.head === h.head) : detailRows);
  // a CRP belongs to a head, so the list follows the head choice; a choice that no longer fits is ignored
  const crpOptions = uniqSorted(rowsOfHead(headSel).map((r) => r.crp));
  const crpSel = crp && crpOptions.includes(crp) ? crp : "";
  const source: DayFields = crpSel
    ? dayFieldsOfRows(rowsOfHead(headSel).filter((r) => r.crp === crpSel), daily.days.length)
    : headSel ?? g.total;
  const headText = headSel ? headLabel(headSel) : "All category heads";
  const selectionLabel = crpSel ? `${headText}, CRP ${crpSel}` : headText;

  const onHead = (v: string) => {
    setHead(v);
    const h = g.heads.find((x) => headKey(x) === v) ?? null;
    if (crpSel && !rowsOfHead(h).some((r) => r.crp === crpSel)) setCrp("");
  };
  const onGroup = (v: Group) => {
    setGroup(v);
    if (crpSel && !(detail?.groups[v] ?? []).some((r) => r.crp === crpSel)) setCrp("");
  };

  const rows: DayRow[] = daily.days.map((d, i) => {
    const f = dayFigures(source, i);
    return { date: d.date, sply: d.sply, f, x: ratiosOf(f) };
  });
  // the charts and the table show every day; the Period choice sets the totals and marks the day in the charts and table
  const monthTotal = sumFigures(rows.map((r) => r.f));
  const monthX = ratiosOf(monthTotal);
  const selected = period === MTD ? undefined : period;
  const selectedRow = rows.find((r) => r.date === selected);
  const total = selectedRow ? selectedRow.f : monthTotal;
  const totalX = selectedRow ? selectedRow.x : monthX;
  const periodText = selectedRow ? `${dayLong(selectedRow.date)} against ${dayLong(selectedRow.sply)}` : `month to date, ${rows.length} days`;
  const withTotal = !selected;
  const colClass = (date: string) => [isFriSat(date) ? "wk" : "", date === selected ? "sel" : ""].filter(Boolean).join(" ") || undefined;

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

  const shown = (m: Metric, v: number | null) => (m.kind === "ratio" ? pct(v, 2) : full(v));
  const changeOf = (m: Metric, n: number | null, p: number | null) => (m.kind === "ratio" ? diffChg(n, p) : growthChg(n, p));

  // the same layout as the table: a column per day, a Total column for the month, three rows per measure
  const exportDays = () => {
    const cols: ExportCol[] = [
      { header: "Measure", format: "text" }, { header: "Row", format: "text" },
      ...rows.map((r) => ({ header: dayMonth(r.date), format: "money" as const })),
      ...(withTotal ? [{ header: `Total (${rows.length} days)`, format: "money" as const }] : []),
    ];
    const all = [...rows.map((r) => ({ f: r.f, x: r.x })), ...(withTotal ? [{ f: monthTotal, x: monthX }] : [])];
    const body: ExportCell[][] = [
      ["Day", "", ...rows.map((r) => dayWeekday(r.date)), ...(withTotal ? [""] : [])],
      ["Compared with", "Same day last year", ...rows.map((r) => dayLong(r.sply)), ...(withTotal ? [""] : [])],
    ];
    const formats: ExportCol["format"][] = ["text", "text"];
    for (const m of METRICS) {
      body.push([m.label, "This month", ...all.map(({ f, x }) => m.now(f, x))]);
      body.push([m.label, "Same day last year", ...all.map(({ f, x }) => m.prev(f, x))]);
      body.push([
        m.label, m.kind === "ratio" ? "Change" : "Growth",
        ...all.map(({ f, x }) => (m.kind === "ratio" ? difference(m.now(f, x), m.prev(f, x)) : growth(m.now(f, x), m.prev(f, x)))),
      ]);
      formats.push(m.format, m.format, "pct");
    }
    downloadExcel(`day-wise-sales-${group}.xlsx`, "Day wise sales", cols, body, formats);
  };

  return (
    <div className="ov">
      <div className="drill-filters day-filters">
        <label>Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
            <option value={MTD}>Month to date ({daily.periodLabel})</option>
            {[...daily.days].reverse().map((d) => <option key={d.date} value={d.date}>{dayLong(d.date)}</option>)}
          </select>
        </label>
        <label>Store group
          <select value={group} onChange={(e) => onGroup(e.target.value as Group)} aria-label="Store group">
            {(Object.keys(GROUP_LABEL) as Group[]).map((k) => <option key={k} value={k}>{GROUP_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Category head
          <select value={head} onChange={(e) => onHead(e.target.value)} aria-label="Category head">
            <option value={TOTAL}>All category heads</option>
            {g.heads.map((h) => <option key={headKey(h)} value={headKey(h)}>{headLabel(h)}</option>)}
          </select>
        </label>
        <label>CRP
          <select value={crpSel} onChange={(e) => setCrp(e.target.value)} aria-label="CRP" disabled={!detail}>
            <option value="">{detail ? "All CRPs" : "Loading…"}</option>
            {crpOptions.map((c) => <option key={c} value={c}>{c}</option>)}
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
        {selectionLabel}, {GROUP_LABEL[group].toLowerCase()}, {periodText}. Each day is compared with the same day last year.
        {crpSel && " Footfall and basket are not recorded per CRP, so they show –."}
      </p>

      <div className="day-charts">
        <DayLines title="Day wise sales" kind="money" points={seriesOf(rows, (r) => [r.f.sales, r.f.splySales])}
          total={{ now: monthTotal.sales, prev: monthTotal.splySales }} selected={selected} />
        <div className="day-pair">
          <DayLines title="Day wise GPV" kind="money" points={seriesOf(rows, (r) => [r.f.gpv, r.f.splyGpv])}
            total={{ now: monthTotal.gpv, prev: monthTotal.splyGpv }} selected={selected} />
          <DayLines title="Day wise GPV+OI" kind="money" points={seriesOf(rows, (r) => [r.f.gpvOi, r.f.splyGpvOi])}
            total={{ now: monthTotal.gpvOi, prev: monthTotal.splyGpvOi }} selected={selected} />
        </div>
        <div className="day-pair">
          <DayLines title="Day wise GP%" kind="pct" points={seriesOf(rows, (r) => [r.x.gp, r.x.splyGp])}
            total={{ now: monthX.gp, prev: monthX.splyGp }} selected={selected} />
          <DayLines title="Day wise GP+OI%" kind="pct" points={seriesOf(rows, (r) => [r.x.goi, r.x.splyGoi])}
            total={{ now: monthX.goi, prev: monthX.splyGoi }} selected={selected} />
        </div>
      </div>

      <div className="ov-section-head"><h2>Day by day</h2></div>
      <div className="xbar"><ExportButton onClick={exportDays} /></div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table day-wide">
            <caption>
              {selectionLabel}, {GROUP_LABEL[group].toLowerCase()}. Each day against the same day last year; hover a date to see which day.
              Friday and Saturday are shaded{selected ? "; the day picked in Period is outlined" : ""}.
            </caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                {rows.map((r) => (
                  <th key={r.date} scope="col" className={colClass(r.date)} title={`Compared with ${dayLong(r.sply)}`}>
                    {dayMonth(r.date)}
                    <div className="sub">{dayWeekday(r.date)}</div>
                  </th>
                ))}
                {withTotal && <th scope="col">Total ({rows.length} days)</th>}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.label}>
                  <th scope="row">{m.label}</th>
                  {rows.map((r) => (
                    <Cell key={r.date} cls={colClass(r.date)} value={shown(m, m.now(r.f, r.x))}
                      chg={changeOf(m, m.now(r.f, r.x), m.prev(r.f, r.x))} />
                  ))}
                  {withTotal && (
                    <Cell value={shown(m, m.now(monthTotal, monthX))} chg={changeOf(m, m.now(monthTotal, monthX), m.prev(monthTotal, monthX))} />
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DailyDetail daily={daily} group={group} detail={detail} period={period} head={headSel} crp={crpSel} />
    </div>
  );
}
