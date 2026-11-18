"use client";

import { useEffect, useMemo, useState } from "react";
import type { DailyData, StoresData } from "@/lib/types";
import { arrowOf, crOrDash, full, growth, pct, signedPct, titleCase, toneOfNum } from "@/lib/format";
import { CMP_SHORT, CMP_WORD, type Cmp, dayLong, storeKey, type StoreGroup, type StoreType, uniqSorted } from "@/lib/daily";
import DayLines, { type DayPoint } from "./DayLines";

type Kind = "money" | "count" | "ratio";

/** One KPI card: the figure, its change against the comparison, and two lines (the comparison, and the target or the OI). */
type Card = { label: string; value: string; change: number | null; ratio: boolean; line1: string; line2: string };

/** The filter labels, as on the Category wise performance tab. */
const STORE_GROUP_LABEL: Record<StoreGroup, string> = { all: "All stores", same: "Same stores" };
const TYPE_LABEL: Record<StoreType, string> = { all: "Own and franchise", own: "Own stores", fran: "Franchise stores" };

/** The tint of each measure's columns, as on the other day-wise tables. */
const TINT: Record<string, string> = {
  Sales: "tint-blue", GPV: "tint-green", "GPV+OI": "tint-green", "GP%": "tint-amber", "GP+OI%": "tint-amber",
  Footfall: "tint-grey", Basket: "tint-grey",
};

/** One outlet's sales, GPV, footfall and value adj (OI) over the chosen days, for one period. */
type Sum = { sales: number; gpv: number; ff: number; va: number };

/** Sums the chosen days. A day is [sales, GPV, footfall] and, for the actuals, value adj (OI) as the fourth figure. */
const sumDays = (days: number[][], idx: number[]): Sum => {
  const t: Sum = { sales: 0, gpv: 0, ff: 0, va: 0 };
  for (const i of idx) {
    const d = days[i];
    t.sales += d[0]; t.gpv += d[1]; t.ff += d[2];
    t.va += d.length > 3 ? d[3] : 0;
  }
  return t;
};

const addSums = (rows: Sum[]): Sum =>
  rows.reduce<Sum>((t, r) => ({ sales: t.sales + r.sales, gpv: t.gpv + r.gpv, ff: t.ff + r.ff, va: t.va + r.va }),
    { sales: 0, gpv: 0, ff: 0, va: 0 });

/** One measure's three cells: this period, the comparison, and the change (a growth for money and counts, points for ratios). */
function Metric({ now, last, kind, tint, label }: { now: number | null; last: number | null; kind: Kind; tint: string; label: string }) {
  const show = (v: number | null) => (v == null ? "–" : kind === "money" ? crOrDash(v) : kind === "count" ? full(v) : pct(v, 2));
  const change = kind === "ratio" ? (now != null && last != null ? now - last : null) : growth(now, last);
  const text = change == null ? "–" : kind === "ratio" ? signedPct(change, 2) : `${arrowOf(toneOfNum(change))}${signedPct(change, 2)}`;
  return (
    <>
      <td className={`${tint} grp-start`} aria-label={`${label} this`}>{show(now)}</td>
      <td className={tint} aria-label={`${label} comparison`}>{show(last)}</td>
      <td className={tint}><span className={`delta ${toneOfNum(change)}`}>{text}</span></td>
    </>
  );
}

/** One target figure: a money amount in crore, or a count as a plain figure. */
function TargetCell({ v, kind, tint, start }: { v: number | null; kind: "money" | "count"; tint: string; start?: boolean }) {
  const text = v == null ? "–" : kind === "money" ? crOrDash(v) : full(v);
  return <td className={start ? `${tint} grp-start` : tint}>{text}</td>;
}

/** The Store wise performance tab: one row per outlet, with its leader, zonal manager, division, format and status.
 *  The filters sit in a panel beside the table, as on the Category wise performance tab. */
export default function Stores() {
  const [data, setData] = useState<StoresData | null>(null);
  const [daily, setDaily] = useState<DailyData | null>(null);

  useEffect(() => {
    let live = true;
    import("@/data/stores.json").then((m) => {
      if (live) setData(m.default as unknown as StoresData);
    });
    import("@/data/daily.json").then((m) => {
      if (live) setDaily(m.default as unknown as DailyData);
    });
    return () => { live = false; };
  }, []);

  if (!data || !daily) return <p className="hint">Loading the store figures…</p>;
  return <StoreTable data={data} daily={daily} />;
}

function StoreTable({ data, daily }: { data: StoresData; daily: DailyData }) {
  const firstDate = data.days[0].date, lastDate = data.days[data.days.length - 1].date;
  const [from, setFrom] = useState<string>(firstDate);
  const [to, setTo] = useState<string>(lastDate);
  // the figures are compared with the same days last year (SPLY) or last month (SPLM)
  const [cmp, setCmp] = useState<Cmp>("sply");
  const [store, setStore] = useState<StoreGroup>("all");
  const [type, setType] = useState<StoreType>("all");
  const [division, setDivision] = useState("");
  const [format, setFormat] = useState("");
  const [leader, setLeader] = useState("");
  const [zonal, setZonal] = useState("");
  const [search, setSearch] = useState("");
  // the day-wise charts show the values (this month against the comparison), or each day's growth (GR%) against it
  const [view, setView] = useState<"values" | "growth">("values");
  const growthMode = view === "growth";
  // the numbers printed on the chart points
  const [labels, setLabels] = useState(true);

  const outlets = data.outlets;
  const lists = useMemo(() => ({
    divisions: uniqSorted(outlets.map((r) => r.division || null)),
    formats: uniqSorted(outlets.map((r) => r.format || null)),
    leaders: uniqSorted(outlets.map((r) => r.leader || null)),
    zonals: uniqSorted(outlets.map((r) => r.zonal || null)),
  }), [outlets]);

  // the days from From to To, in either order, as indexes of the month's days; by default the whole data so far
  const lo = from <= to ? from : to, hi = from <= to ? to : from;
  const isLatest = lo === firstDate && hi === lastDate;
  const chosen = useMemo(
    () => data.days.map((_, i) => i).filter((i) => data.days[i].date >= lo && data.days[i].date <= hi),
    [data, lo, hi],
  );
  const periodName = isLatest ? `Month to date (${data.periodLabel})`
    : lo === hi ? dayLong(lo)
    : `${dayLong(lo)} to ${dayLong(hi)}`;

  // the outlets passing the filters (the day-wise charts use them for the whole month)
  const passing = useMemo(() => {
    const q = search.trim().toLowerCase();
    return outlets
      .filter((r) => store === "all" || (cmp === "sply" ? r.sameSply : r.sameSplm))
      .filter((r) => type === "all" || (type === "own" ? r.status === "Own" : r.status === "Franchise"))
      .filter((r) => !division || r.division === division)
      .filter((r) => !format || r.format === format)
      .filter((r) => !leader || r.leader === leader)
      .filter((r) => !zonal || r.zonal === zonal)
      .filter((r) => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [outlets, cmp, store, type, division, format, leader, zonal, search]);
  // the rows: the outlets passing the filters with sales in the chosen days
  const rows = useMemo(() => passing
    .map((r) => ({ r, now: sumDays(r.daily.this, chosen), last: sumDays(r.daily[cmp], chosen), tgt: r.target ? sumDays(r.target, chosen) : null }))
    .filter(({ now, last }) => now.sales > 0 || last.sales > 0)
    .sort((a, b) => b.now.sales - a.now.sales), [passing, chosen, cmp]);

  // the totals: with no outlet filter, the Category wise figures of this store group and type (the same totals as that tab);
  // otherwise the sum of the outlets shown
  const key = storeKey(store, type);
  // the group of the chosen comparison: its THIS figures are the outlets in the same-store list of that comparison, and its
  // comparison figures are the same period last year (SPLY) or last month (SPLM), as the Category wise tab reads them
  const variant = cmp === "sply" ? daily.groups : daily.splmGroups;
  const T = variant[key].total, C = T;
  const sumAt = (a: (number | null)[]) => chosen.reduce((t, i) => t + (a[i] ?? 0), 0);
  const dayNow: Sum = { sales: sumAt(T.sales), gpv: sumAt(T.gpv), ff: sumAt(T.ff), va: sumAt(T.valueAdj) };
  const dayLast: Sum = { sales: sumAt(C.splySales), gpv: sumAt(C.splyGpv), ff: sumAt(C.splyFf), va: sumAt(C.splyValueAdj) };
  const useDaily = !division && !format && !leader && !zonal && !search;
  const total = useDaily ? dayNow : addSums(rows.map((x) => x.now));
  const totalLast = useDaily ? dayLast : addSums(rows.map((x) => x.last));

  // the day-wise charts: each day of the month, from the Category wise figures when no outlet filter is set, otherwise
  // from the outlets passing the filters (the whole month, not only the From-To days)
  const dayFigures = data.days.map((_, i): { now: Sum; last: Sum } => {
    if (useDaily) {
      return {
        now: { sales: T.sales[i] ?? 0, gpv: T.gpv[i] ?? 0, ff: T.ff[i] ?? 0, va: T.valueAdj[i] ?? 0 },
        last: { sales: C.splySales[i] ?? 0, gpv: C.splyGpv[i] ?? 0, ff: C.splyFf[i] ?? 0, va: C.splyValueAdj[i] ?? 0 },
      };
    }
    const now: Sum = { sales: 0, gpv: 0, ff: 0, va: 0 }, last: Sum = { sales: 0, gpv: 0, ff: 0, va: 0 };
    for (const r of passing) {
      const a = r.daily.this[i], b = r.daily[cmp][i];
      now.sales += a[0]; now.gpv += a[1]; now.ff += a[2]; now.va += a[3];
      last.sales += b[0]; last.gpv += b[1]; last.ff += b[2]; last.va += b[3];
    }
    return { now, last };
  });
  const ratioOf = (a: number, b: number) => (b ? a / b : null);
  const seriesOf = (pick: (d: { now: Sum; last: Sum }) => [number | null, number | null]): DayPoint[] =>
    data.days.map((day, i) => {
      const [now, prev] = pick(dayFigures[i]);
      return { date: day.date, sply: cmp === "sply" ? day.sply : day.splm, now, prev };
    });
  const chartBand = isLatest ? undefined : { from: lo, to: hi };
  const chartTotalLabel = isLatest ? "Month to date" : lo === hi ? "Selected day" : "Selected period";
  const s = total.sales, sl = totalLast.sales;
  const g = total.gpv, gl = totalLast.gpv;
  const f = total.ff, fl = totalLast.ff;
  // GPV+OI is GPV plus value adj (OI); GP+OI% is GPV+OI over sales
  const go = g + total.va, gol = gl + totalLast.va;
  const gp = s ? g / s : null, gpl = sl ? gl / sl : null;
  const goi = s ? go / s : null, goil = sl ? gol / sl : null;
  const bs = f ? s / f : null, bsl = fl ? sl / fl : null;
  // the targets of the outlets shown that have one; achievement is their sales against those targets, so both cover the same outlets
  const tgtRows = rows.flatMap((x) => (x.tgt ? [{ now: x.now, tgt: x.tgt }] : []));
  const tgtTotal = addSums(tgtRows.map((x) => x.tgt));
  const noTarget = rows.length - tgtRows.length;
  const ts = tgtRows.length ? tgtTotal.sales : null, tg = tgtRows.length ? tgtTotal.gpv : null, tf = tgtRows.length ? tgtTotal.ff : null;
  const tb = ts != null && tf ? ts / tf : null;
  // achievement against target, on the outlets that have one: their sales, GPV and footfall against those targets
  const achOf = addSums(tgtRows.map((x) => x.now));
  const achSalesPct = ts ? achOf.sales / ts : null;
  const achGpvPct = tg ? achOf.gpv / tg : null;
  const achFfPct = tf ? achOf.ff / tf : null;
  const achBsPct = tb && achOf.ff ? (achOf.sales / achOf.ff) / tb : null;
  const tgpPct = ts && tg ? tg / ts : null;
  const achGpPct = achOf.sales ? achOf.gpv / achOf.sales : null;
  const short = CMP_SHORT[cmp];
  const kFmt = (v: number) => `${(v / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  // differences: money in crore, or in lakh below one crore; counts in K or as plain figures; ratios in points
  const diffMoney = (v: number) => {
    const a = Math.abs(v), sign = v < 0 ? "−" : "+";
    return a >= 1e7 ? `${sign}${(a / 1e7).toFixed(2)} Cr` : `${sign}${(a / 1e5).toFixed(2)} L`;
  };
  const diffCount = (v: number) => `${v < 0 ? "−" : "+"}${kFmt(Math.abs(v))}`;
  const diffFull = (v: number) => `${v < 0 ? "−" : "+"}${full(Math.abs(v))}`;
  const noTargetText = "No target in the file";
  const scope = [store === "same" ? "SAME STORES" : "ALL STORES", type === "own" ? "OWN" : type === "fran" ? "FRANCHISE" : ""]
    .filter(Boolean).join(" · ");
  const cards: Card[] = [
    { label: "Sales", value: crOrDash(s), change: growth(s, sl), ratio: false,
      line1: `SPLY ${crOrDash(sl)} · diff ${diffMoney(s - sl)}`,
      line2: ts != null ? `TGT ${crOrDash(ts)} · ACH ${pct(achSalesPct, 2)}` : noTargetText },
    { label: "GPV", value: crOrDash(g), change: growth(g, gl), ratio: false,
      line1: `SPLY ${crOrDash(gl)} · diff ${diffMoney(g - gl)}`,
      line2: tg != null ? `TGT ${crOrDash(tg)} · ACH ${pct(achGpvPct, 2)}` : noTargetText },
    { label: "GPV+OI", value: crOrDash(go), change: growth(go, gol), ratio: false,
      line1: `SPLY ${crOrDash(gol)} · diff ${diffMoney(go - gol)}`,
      line2: `OI ${crOrDash(total.va)}` },
    { label: "GP%", value: pct(gp, 2), change: gp != null && gpl != null ? gp - gpl : null, ratio: true,
      line1: `SPLY ${pct(gpl, 2)}`,
      line2: tgpPct != null ? `TGT ${pct(tgpPct, 2)} · diff ${signedPct(achGpPct != null ? achGpPct - tgpPct : null, 2)}` : noTargetText },
    { label: "GP+OI%", value: pct(goi, 2), change: goi != null && goil != null ? goi - goil : null, ratio: true,
      line1: `SPLY ${pct(goil, 2)}`,
      line2: `GP% ${pct(gp, 2)} · OI adds ${signedPct(goi != null && gp != null ? goi - gp : null, 2)}` },
    { label: "Footfall", value: kFmt(f), change: growth(f, fl), ratio: false,
      line1: `SPLY ${kFmt(fl)} · diff ${diffCount(f - fl)}`,
      line2: tf != null ? `TGT ${kFmt(tf)} · ACH ${pct(achFfPct, 2)}` : noTargetText },
    { label: "Basket", value: full(bs), change: growth(bs, bsl), ratio: false,
      line1: `SPLY ${full(bsl)} · diff ${bs != null && bsl != null ? diffFull(bs - bsl) : "–"}`,
      line2: tb != null ? `TGT ${full(tb)} · ACH ${pct(achBsPct, 2)}` : noTargetText },
  ];

  // the filters are at their defaults: all stores, own and franchise, all divisions and outlets, the latest period, vs SPLY
  const isDefault = store === "all" && type === "all" && !division && !format && !leader && !zonal && !search && isLatest && cmp === "sply";
  const resetAll = () => {
    setCmp("sply");
    setStore("all");
    setType("all");
    setFrom(firstDate);
    setTo(lastDate);
    setDivision("");
    setFormat("");
    setLeader("");
    setZonal("");
    setSearch("");
  };

  const select = (label: string, value: string, set: (v: string) => void, options: string[], all: string, show: (v: string) => string = (v) => v) => (
    <label>{label}
      <select value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o} value={o}>{show(o)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="ov day-page">
      <aside className="drill-filters day-filters day-filters-panel" aria-label="Store wise performance filters">
        <button type="button" className="linkish" onClick={resetAll} disabled={isDefault}
          style={{ alignSelf: "flex-start", whiteSpace: "nowrap" }}>Reset all filters</button>
        <div className="fbar-field">
          <span>Compare with</span>
          <div className="seg" role="group" aria-label="Comparison period">
            {(["sply", "splm"] as Cmp[]).map((c) => (
              <button key={c} type="button" aria-pressed={cmp === c} onClick={() => setCmp(c)}>vs {CMP_SHORT[c]}</button>
            ))}
          </div>
        </div>
        <label>From
          <input type="date" value={from} min={firstDate} max={lastDate} aria-label="From date"
            onChange={(e) => { if (e.target.value) setFrom(e.target.value); }} />
        </label>
        <label>To
          <input type="date" value={to} min={firstDate} max={lastDate} aria-label="To date"
            onChange={(e) => { if (e.target.value) setTo(e.target.value); }} />
        </label>
        <label>Store group
          <select value={store} onChange={(e) => setStore(e.target.value as StoreGroup)} aria-label="Store group">
            {(Object.keys(STORE_GROUP_LABEL) as StoreGroup[]).map((k) => <option key={k} value={k}>{STORE_GROUP_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Store type
          <select value={type} onChange={(e) => setType(e.target.value as StoreType)} aria-label="Store type">
            {(Object.keys(TYPE_LABEL) as StoreType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
        </label>
        {select("Division", division, setDivision, lists.divisions, "All divisions", titleCase)}
        {select("Format", format, setFormat, lists.formats, "All formats")}
        {select("Leader", leader, setLeader, lists.leaders, "All leaders")}
        {select("Zonal", zonal, setZonal, lists.zonals, "All zonals")}
        <label>Outlet search
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name or code" aria-label="Outlet search" />
        </label>
      </aside>

      <div className="day-main">
        <section className="ov-kpis day-kpis" aria-label="Store wise key figures">
          {cards.map((c) => {
            const tone = toneOfNum(c.change);
            const text = c.change == null ? "–" : c.ratio ? signedPct(c.change, 2) : `${arrowOf(tone)}${signedPct(c.change, 2)}`;
            return (
              <div className="ov-kpi st-kpi" key={c.label}>
                <div className="ov-kpi-label">{c.label} · {scope}</div>
                <div className="ov-kpi-value">{c.value}</div>
                <span className={`st-pill ${tone}`}>{text}</span>
                <div className="ov-kpi-cmp">{c.line1}</div>
                <div className="ov-kpi-cmp">{c.line2}</div>
              </div>
            );
          })}
        </section>
        <p className="ov-note">
          {rows.length} {rows.length === 1 ? "outlet" : "outlets"} · {periodName}. Each outlet is compared with the same days {CMP_WORD[cmp]}.{" "}
          {chosen.length === 0 && "No days fall in this range; choose dates inside the data period."}
          {from > to && " The two dates were swapped, so the range runs from the earlier to the later date."}
          {useDaily && " Totals are the Category wise figures for this store group, so they match that tab; the outlet rows come from the outlet files and can differ from the total by about 0.2% on GPV."}
          {" "}Targets from {data.targetFile}
          {noTarget > 0 && `; ${noTarget} ${noTarget === 1 ? "outlet has" : "outlets have"} no target in it`}.
        </p>

        <div className="day-chart-bar">
          <div className="seg" role="group" aria-label="Chart data level">
            <button type="button" aria-pressed={!growthMode} onClick={() => setView("values")}>Values</button>
            <button type="button" aria-pressed={growthMode} onClick={() => setView("growth")}>Growth %</button>
          </div>
          <label className="day-chart-check">
            <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
            Data labels
          </label>
          <span className="day-chart-hint">
            {growthMode
              ? `Each day's growth against ${CMP_WORD[cmp]}.`
              : `Each day's figures this month, and the same day ${CMP_WORD[cmp]}.`}
          </span>
        </div>
        <div className="day-charts">
          <DayLines title="Day wise sales" kind="money" points={seriesOf((d) => [d.now.sales, d.last.sales])}
            total={{ now: s, prev: sl }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
          <div className="day-pair">
            <DayLines title="Day wise GPV" kind="money" points={seriesOf((d) => [d.now.gpv, d.last.gpv])}
              total={{ now: g, prev: gl }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
            <DayLines title="Day wise GPV+OI" kind="money" points={seriesOf((d) => [d.now.gpv + d.now.va, d.last.gpv + d.last.va])}
              total={{ now: go, prev: gol }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
          </div>
          <div className="day-pair">
            <DayLines title="Day wise GP%" kind="pct" points={seriesOf((d) => [ratioOf(d.now.gpv, d.now.sales), ratioOf(d.last.gpv, d.last.sales)])}
              total={{ now: gp, prev: gpl }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
            <DayLines title="Day wise GP+OI%" kind="pct"
              points={seriesOf((d) => [ratioOf(d.now.gpv + d.now.va, d.now.sales), ratioOf(d.last.gpv + d.last.va, d.last.sales)])}
              total={{ now: goi, prev: goil }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
          </div>
          <div className="day-pair">
            <DayLines title="Day wise footfall" kind="count" points={seriesOf((d) => [d.now.ff, d.last.ff])}
              total={{ now: f, prev: fl }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
            <DayLines title="Day wise basket" kind="count" points={seriesOf((d) => [ratioOf(d.now.sales, d.now.ff), ratioOf(d.last.sales, d.last.ff)])}
              total={{ now: bs, prev: bsl }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
          </div>
        </div>

        <div className="ov-panel ov-table-panel">
          <div className="ov-table-scroll">
            <table className="ov-table stores-table tinted">
              <thead>
                <tr>
                  <th scope="col" className="l st-c1">Code</th>
                  <th scope="col" className="l st-c2">Outlet</th>
                  <th scope="col" className="l">Division</th>
                  <th scope="col" className="l">Format</th>
                  <th scope="col" className="l">Status</th>
                  <th scope="col" className="l">Leader</th>
                  <th scope="col" className="l">Zonal</th>
                  <th scope="col" className="l">Same store</th>
                  <th scope="col" className={`${TINT.Sales} grp-start`}>Sales this</th>
                  <th scope="col" className={TINT.Sales}>Sales {short}</th>
                  <th scope="col" className={TINT.Sales}>GR%</th>
                  <th scope="col" className={`${TINT.GPV} grp-start`}>GPV this</th>
                  <th scope="col" className={TINT.GPV}>GPV {short}</th>
                  <th scope="col" className={TINT.GPV}>GR%</th>
                  <th scope="col" className={`${TINT["GPV+OI"]} grp-start`}>GPV+OI this</th>
                  <th scope="col" className={TINT["GPV+OI"]}>GPV+OI {short}</th>
                  <th scope="col" className={TINT["GPV+OI"]}>GR%</th>
                  <th scope="col" className={`${TINT["GP%"]} grp-start`}>GP% this</th>
                  <th scope="col" className={TINT["GP%"]}>GP% {short}</th>
                  <th scope="col" className={TINT["GP%"]}>Diff</th>
                  <th scope="col" className={`${TINT["GP+OI%"]} grp-start`}>GP+OI% this</th>
                  <th scope="col" className={TINT["GP+OI%"]}>GP+OI% {short}</th>
                  <th scope="col" className={TINT["GP+OI%"]}>Diff</th>
                  <th scope="col" className={`${TINT.Footfall} grp-start`}>Footfall this</th>
                  <th scope="col" className={TINT.Footfall}>Footfall {short}</th>
                  <th scope="col" className={TINT.Footfall}>GR%</th>
                  <th scope="col" className={`${TINT.Basket} grp-start`}>Basket this</th>
                  <th scope="col" className={TINT.Basket}>Basket {short}</th>
                  <th scope="col" className={TINT.Basket}>GR%</th>
                  <th scope="col" className={`${TINT.Sales} grp-start`}>Sales TGT</th>
                  <th scope="col" className={TINT.GPV}>GPV TGT</th>
                  <th scope="col" className={TINT.Footfall}>FF TGT</th>
                  <th scope="col" className={TINT.Basket}>BS TGT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, now, last, tgt }) => {
                  const gpNow = now.sales ? now.gpv / now.sales : null;
                  const gpLast = last.sales ? last.gpv / last.sales : null;
                  const goNow = now.gpv + now.va, goLast = last.gpv + last.va;
                  const goiNow = now.sales ? goNow / now.sales : null;
                  const goiLast = last.sales ? goLast / last.sales : null;
                  const basketNow = now.ff ? now.sales / now.ff : null;
                  const basketLast = last.ff ? last.sales / last.ff : null;
                  return (
                    <tr key={r.code}>
                      <td className="l st-c1">{r.code}</td>
                      <td className="l st-c2" title={r.name}>{r.name}</td>
                      <td className="l">{r.division ? titleCase(r.division) : "–"}</td>
                      <td className="l">{r.format || "–"}</td>
                      <td className="l">{r.status}</td>
                      <td className="l">{r.leader || "–"}</td>
                      <td className="l">{r.zonal || "–"}</td>
                      <td className="l">{(cmp === "sply" ? r.sameSply : r.sameSplm) ? "Yes" : "No"}</td>
                      <Metric now={now.sales} last={last.sales} kind="money" tint={TINT.Sales} label="Sales" />
                      <Metric now={now.gpv} last={last.gpv} kind="money" tint={TINT.GPV} label="GPV" />
                      <Metric now={goNow} last={goLast} kind="money" tint={TINT["GPV+OI"]} label="GPV+OI" />
                      <Metric now={gpNow} last={gpLast} kind="ratio" tint={TINT["GP%"]} label="GP%" />
                      <Metric now={goiNow} last={goiLast} kind="ratio" tint={TINT["GP+OI%"]} label="GP+OI%" />
                      <Metric now={now.ff} last={last.ff} kind="count" tint={TINT.Footfall} label="Footfall" />
                      <Metric now={basketNow} last={basketLast} kind="count" tint={TINT.Basket} label="Basket" />
                      <TargetCell v={tgt ? tgt.sales : null} kind="money" tint={TINT.Sales} start />
                      <TargetCell v={tgt ? tgt.gpv : null} kind="money" tint={TINT.GPV} />
                      <TargetCell v={tgt ? tgt.ff : null} kind="count" tint={TINT.Footfall} />
                      <TargetCell v={tgt && tgt.ff ? tgt.sales / tgt.ff : null} kind="count" tint={TINT.Basket} />
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={8} className="l">Total · {rows.length} {rows.length === 1 ? "outlet" : "outlets"}</th>
                    <Metric now={s} last={sl} kind="money" tint={TINT.Sales} label="Sales" />
                    <Metric now={g} last={gl} kind="money" tint={TINT.GPV} label="GPV" />
                    <Metric now={go} last={gol} kind="money" tint={TINT["GPV+OI"]} label="GPV+OI" />
                    <Metric now={gp} last={gpl} kind="ratio" tint={TINT["GP%"]} label="GP%" />
                    <Metric now={goi} last={goil} kind="ratio" tint={TINT["GP+OI%"]} label="GP+OI%" />
                    <Metric now={f} last={fl} kind="count" tint={TINT.Footfall} label="Footfall" />
                    <Metric now={bs} last={bsl} kind="count" tint={TINT.Basket} label="Basket" />
                    <TargetCell v={ts} kind="money" tint={TINT.Sales} start />
                    <TargetCell v={tg} kind="money" tint={TINT.GPV} />
                    <TargetCell v={tf} kind="count" tint={TINT.Footfall} />
                    <TargetCell v={tb} kind="count" tint={TINT.Basket} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
