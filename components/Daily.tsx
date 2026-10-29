"use client";

import { useEffect, useState } from "react";
import type { DailyData, DailyDetailData, DailyHead, DayFields } from "@/lib/types";
import { abbrOf, arrowOf, crFmt, crOrDash, crSigned, full, growth, pct, roleName, signedPct, titleCase, toneOfNum } from "@/lib/format";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";
import {
  Cell, dayFieldsOfRows, dayLong, dayMonth, dayWeekday, difference, diffChg, Figures, growthChg, isFriSat, MTD, Ratios, ratiosOf,
  SHOWN_DIVISIONS, sumFigures, uniqSorted,
} from "@/lib/daily";
import DailyDetail from "./DailyDetail";
import DayLines, { type DayPoint } from "./DayLines";

type Group = "all" | "same";
const GROUP_LABEL: Record<Group, string> = { all: "All stores", same: "Same stores" };
const TOTAL = "total";
/** The Period choice that takes the dates typed in From and To. */
const RANGE = "range";

type DayRow = { date: string; sply: string; f: Figures; x: Ratios };

/** One row of the day table: a measure, with this month's and last year's value for any day or the whole period. */
type Metric = {
  label: string;
  kind: "amount" | "ratio";
  format: "money" | "int" | "pct";
  /** Needs footfall, which cannot be worked out for a single CRP, so these rows are hidden when a CRP is chosen. */
  footfall?: boolean;
  /** A money amount, shown in crore; counts and basket are shown as plain figures. */
  crore?: boolean;
  now: (f: Figures, x: Ratios) => number | null;
  prev: (f: Figures, x: Ratios) => number | null;
};
const METRICS: Metric[] = [
  { label: "Sales", kind: "amount", format: "money", crore: true, now: (f) => f.sales, prev: (f) => f.splySales },
  { label: "GPV", kind: "amount", format: "money", crore: true, now: (f) => f.gpv, prev: (f) => f.splyGpv },
  { label: "GP%", kind: "ratio", format: "pct", now: (_, x) => x.gp, prev: (_, x) => x.splyGp },
  { label: "GPV+OI", kind: "amount", format: "money", crore: true, now: (f) => f.gpvOi, prev: (f) => f.splyGpvOi },
  { label: "GP+OI%", kind: "ratio", format: "pct", now: (_, x) => x.goi, prev: (_, x) => x.splyGoi },
  { label: "Footfall", kind: "amount", format: "int", footfall: true, now: (f) => f.ff, prev: (f) => f.splyFf },
  { label: "Basket", kind: "amount", format: "money", footfall: true, now: (_, x) => x.bs, prev: (_, x) => x.splyBs },
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
  const firstDate = daily.days[0].date, lastDate = daily.days[daily.days.length - 1].date;
  const [period, setPeriod] = useState<string>(MTD);
  const [from, setFrom] = useState<string>(firstDate);
  const [to, setTo] = useState<string>(lastDate);
  const [group, setGroup] = useState<Group>("all");
  const [head, setHead] = useState<string>(TOTAL);
  const [crp, setCrp] = useState("");
  const [cat, setCat] = useState("");
  const [detail, setDetail] = useState<DailyDetailData | null>(null);

  // the detail rows are a separate data file; they give the CRP and category lists, the figures when either is chosen,
  // and the detail table
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
  // detail rows of the listed divisions, for the CRP and category lists and for the figures when either is chosen
  const listedRows = (rs: DailyDetailData["groups"]["all"] | undefined) => (rs ?? []).filter((r) => SHOWN_DIVISIONS.includes(r.division));
  const rowsOfHead = (h: DailyHead | null, rs = listedRows(detail?.groups[group])) =>
    (h ? rs.filter((r) => r.division === h.division && r.head === h.head) : rs);
  const headRows = rowsOfHead(headSel);
  // a CRP belongs to a head and the CRP and category lists narrow each other, so a choice always has rows behind it;
  // one that no longer fits is ignored
  const crpSel = crp && headRows.some((r) => r.crp === crp) ? crp : "";
  const catSel = cat && headRows.some((r) => r.category === cat && (!crpSel || r.crp === crpSel)) ? cat : "";
  const crpOptions = uniqSorted(headRows.filter((r) => !catSel || r.category === catSel).map((r) => r.crp));
  const catOptions = uniqSorted(headRows.filter((r) => !crpSel || r.crp === crpSel).map((r) => r.category));
  // with a CRP or category chosen the figures are the sum of the matching detail rows, which have no footfall
  const fromRows = Boolean(crpSel || catSel);
  const source: DayFields = fromRows
    ? dayFieldsOfRows(headRows.filter((r) => (!crpSel || r.crp === crpSel) && (!catSel || r.category === catSel)), daily.days.length)
    : headSel ?? g.total;
  const headText = headSel ? headLabel(headSel) : "All category heads";
  const selectionLabel = [headText, crpSel && `CRP ${crpSel}`, catSel && `category ${titleCase(catSel)}`].filter(Boolean).join(", ");
  const metrics = fromRows ? METRICS.filter((m) => !m.footfall) : METRICS;

  const onHead = (v: string) => {
    setHead(v);
    const rs = rowsOfHead(g.heads.find((x) => headKey(x) === v) ?? null);
    if (crpSel && !rs.some((r) => r.crp === crpSel)) setCrp("");
    if (catSel && !rs.some((r) => r.category === catSel)) setCat("");
  };
  const onGroup = (v: Group) => {
    setGroup(v);
    const rs = listedRows(detail?.groups[v]);
    if (crpSel && !rs.some((r) => r.crp === crpSel)) setCrp("");
    if (catSel && !rs.some((r) => r.category === catSel)) setCat("");
  };

  const rows: DayRow[] = daily.days.map((d, i) => {
    const f = dayFigures(source, i);
    return { date: d.date, sply: d.sply, f, x: ratiosOf(f) };
  });
  // the days the Period choice covers: the whole month so far, one day, or the dates from From to To in either order
  const lo = from <= to ? from : to, hi = from <= to ? to : from;
  const chosenIdx = rows.map((_, i) => i).filter((i) => {
    const date = rows[i].date;
    if (period === MTD) return true;
    if (period === RANGE) return date >= lo && date <= hi;
    return date === period;
  });
  const chosen = chosenIdx.map((i) => rows[i]);
  // the totals, the KPI band and the table follow the chosen days; the charts keep the whole month and mark them
  const total = sumFigures(chosen.map((r) => r.f));
  const totalX = ratiosOf(total);
  const withTotal = chosen.length > 1;
  const band = period === MTD ? undefined : period === RANGE ? { from: lo, to: hi } : { from: period, to: period };
  const totalLabel = period === MTD ? "Month to date" : period === RANGE ? "Selected period" : "Selected day";
  const periodName = period === MTD ? `Month to date (${daily.periodLabel})`
    : period === RANGE ? `${dayLong(lo)} to ${dayLong(hi)}`
    : dayLong(period);
  // last year's days matched with the chosen days, as the workbook matches them
  const splys = chosen.map((r) => r.sply).sort();
  const compareName = chosen.length === 1 ? dayLong(splys[0])
    : chosen.length === 0 ? "no matched days"
    : `the matched days of ${dayMonth(splys[0])} to ${dayMonth(splys[splys.length - 1])} ${splys[0].slice(0, 4)}`;
  const colClass = (date: string) => (isFriSat(date) ? "wk" : undefined);

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

  const shown = (m: Metric, v: number | null) => (m.kind === "ratio" ? pct(v, 2) : m.crore ? crOrDash(v) : full(v));
  const changeOf = (m: Metric, n: number | null, p: number | null) => (m.kind === "ratio" ? diffChg(n, p) : growthChg(n, p));

  // the same layout as the table: a column per chosen day, a Total column when there is more than one day
  const exportDays = () => {
    const cols: ExportCol[] = [
      { header: "Measure", format: "text" }, { header: "Row", format: "text" },
      ...chosen.map((r) => ({ header: dayMonth(r.date), format: "money" as const })),
      ...(withTotal ? [{ header: `Total (${chosen.length} days)`, format: "money" as const }] : []),
    ];
    const all = [...chosen.map((r) => ({ f: r.f, x: r.x })), ...(withTotal ? [{ f: total, x: totalX }] : [])];
    const body: ExportCell[][] = [
      ["Day", "", ...chosen.map((r) => dayWeekday(r.date)), ...(withTotal ? [""] : [])],
      ["Compared with", "Same day last year", ...chosen.map((r) => dayLong(r.sply)), ...(withTotal ? [""] : [])],
    ];
    const formats: ExportCol["format"][] = ["text", "text"];
    for (const m of metrics) {
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
            <option value={RANGE}>Date range (From and To)</option>
            {[...daily.days].reverse().map((d) => <option key={d.date} value={d.date}>{dayLong(d.date)}</option>)}
          </select>
        </label>
        {period === RANGE && (
          <>
            <label>From
              <input type="date" value={from} min={firstDate} max={lastDate} aria-label="From date"
                onChange={(e) => e.target.value && setFrom(e.target.value)} />
            </label>
            <label>To
              <input type="date" value={to} min={firstDate} max={lastDate} aria-label="To date"
                onChange={(e) => e.target.value && setTo(e.target.value)} />
            </label>
          </>
        )}
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
        <label>Category
          <select value={catSel} onChange={(e) => setCat(e.target.value)} aria-label="Category" disabled={!detail}>
            <option value="">{detail ? "All categories" : "Loading…"}</option>
            {catOptions.map((c) => <option key={c} value={c}>{c === "0" ? "(not set)" : titleCase(c)}</option>)}
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
        {selectionLabel}, {GROUP_LABEL[group].toLowerCase()}, {periodName}.{" "}
        {chosen.length ? "Each day is compared with the same day last year." : "No days fall in this range; choose dates inside the data period."}
        {period === RANGE && from > to && " The two dates were swapped, so the range runs from the earlier to the later date."}
        {fromRows && " Footfall and basket are hidden when a CRP or category is chosen: a bill with items from several categories would be counted more than once."}
      </p>

      <div className="day-charts">
        <DayLines title="Day wise sales" kind="money" points={seriesOf(rows, (r) => [r.f.sales, r.f.splySales])}
          total={{ now: total.sales, prev: total.splySales }} band={band} totalLabel={totalLabel} />
        <div className="day-pair">
          <DayLines title="Day wise GPV" kind="money" points={seriesOf(rows, (r) => [r.f.gpv, r.f.splyGpv])}
            total={{ now: total.gpv, prev: total.splyGpv }} band={band} totalLabel={totalLabel} />
          <DayLines title="Day wise GPV+OI" kind="money" points={seriesOf(rows, (r) => [r.f.gpvOi, r.f.splyGpvOi])}
            total={{ now: total.gpvOi, prev: total.splyGpvOi }} band={band} totalLabel={totalLabel} />
        </div>
        <div className="day-pair">
          <DayLines title="Day wise GP%" kind="pct" points={seriesOf(rows, (r) => [r.x.gp, r.x.splyGp])}
            total={{ now: totalX.gp, prev: totalX.splyGp }} band={band} totalLabel={totalLabel} />
          <DayLines title="Day wise GP+OI%" kind="pct" points={seriesOf(rows, (r) => [r.x.goi, r.x.splyGoi])}
            total={{ now: totalX.goi, prev: totalX.splyGoi }} band={band} totalLabel={totalLabel} />
        </div>
      </div>

      <div className="ov-section-head"><h2>Day by day</h2></div>
      <div className="xbar"><ExportButton onClick={exportDays} /></div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table day-wide">
            <caption>
              {selectionLabel}, {GROUP_LABEL[group].toLowerCase()}, {periodName}. Each day against the same day last year; hover a date to see which day.
              Friday and Saturday are shaded.
            </caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                {chosen.map((r) => (
                  <th key={r.date} scope="col" className={colClass(r.date)} title={`Compared with ${dayLong(r.sply)}`}>
                    {dayMonth(r.date)}
                    <div className="sub">{dayWeekday(r.date)}</div>
                  </th>
                ))}
                {withTotal && <th scope="col">Total ({chosen.length} days)</th>}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.label}>
                  <th scope="row">{m.label}</th>
                  {chosen.map((r) => (
                    <Cell key={r.date} cls={colClass(r.date)} value={shown(m, m.now(r.f, r.x))}
                      chg={changeOf(m, m.now(r.f, r.x), m.prev(r.f, r.x))} />
                  ))}
                  {withTotal && (
                    <Cell value={shown(m, m.now(total, totalX))} chg={changeOf(m, m.now(total, totalX), m.prev(total, totalX))} />
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DailyDetail daily={daily} group={group} detail={detail} chosen={chosenIdx} label={periodName} compare={compareName}
        head={headSel} crp={crpSel} cat={catSel} />
    </div>
  );
}
