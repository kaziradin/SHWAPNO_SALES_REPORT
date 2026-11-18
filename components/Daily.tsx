"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { CrpFf, DailyData, DailyDetailData, DailyHead, DayFields, DetailRow, DivFf, StoreKey } from "@/lib/types";
import { abbrOf, arrowOf, crFmt, crOrDash, crSigned, full, growth, pct, roleName, signedPct, titleCase, toneOfNum } from "@/lib/format";
import {
  dayFieldsOfRows, dayLong, dayMonth, dayWeekday, difference, Figures, isFriSat, Ratios, ratiosOf,
  CMP_SHORT, CMP_WORD, Cmp, headlessWithin, SHOWN_DIVISIONS, STORE_LABEL, storeKey, StoreGroup, StoreType, sumFigures, uniqSorted,
} from "@/lib/daily";
import DayLines, { type DayPoint } from "./DayLines";
import DayHeads, { DayHeadDrill, type DayCrpRow, type DayHeadRow } from "./DayHeads";
import DayByHead from "./DayByHead";
import ExportCsv from "./ExportCsv";

const STORE_GROUP_LABEL: Record<StoreGroup, string> = { all: "All stores", same: "Same stores" };
const TYPE_LABEL: Record<StoreType, string> = { all: "Own and franchise", own: "Own stores", fran: "Franchise stores" };
const TOTAL = "total";

/** A day of the month: its figures, and the date of the comparison day (last year's or last month's). */
type DayRow = { date: string; prev: string; f: Figures; x: Ratios };

/** One row of the day table: a measure, with this month's and last year's value for any day or the whole period. */
type Metric = {
  label: string;
  kind: "amount" | "ratio";
  format: "money" | "int" | "pct";
  /** Needs footfall: these rows are hidden where footfall cannot be counted exactly for the selection. */
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

/** Footfall per day: this month, and against the comparison. */
type FfArrays = { ff: (number | null)[]; splyFf: (number | null)[] };
/** The selection footfall is worked out for: a division, a head, a CRP and a category; blank or null where not chosen. */
type FfSel = { division: string; head: DailyHead | null; crp: string; cat: string };

const headKey = (h: { division: string; role: string; head: string }) => `${h.division}|${h.role}|${h.head}`;
const headLabel = (h: { division: string; role: string; head: string }) => `${abbrOf(h.division)} - ${roleName(h.role)} - ${h.head}`;

/** A date as the day table shows it: 01 Nov 2026 · Sun. */
const dateFull = (iso: string) =>
  `${new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · ${dayWeekday(iso)}`;

/** The tint of each measure's columns in the day table: money in blue and green, ratios in amber, counts in grey. */
const DAY_TINT: Record<string, string> = {
  Sales: "tint-blue", GPV: "tint-green", "GPV+OI": "tint-green", "GP%": "tint-amber", "GP+OI%": "tint-amber", Footfall: "tint-grey", Basket: "tint-grey",
};

/** One metric's cells in a row of the day table: this period, the comparison, the difference and, for money and counts, the growth. */
function RowMetric({ m, n, l, tint }: { m: Metric; n: number | null; l: number | null; tint: string }) {
  const shownValue = (v: number | null) => (v == null ? "–" : m.kind === "ratio" ? pct(v, 2) : full(v));
  const d = difference(n, l);
  const diffText = d == null ? "–" : m.kind === "ratio" ? signedPct(d, 2) : `${d >= 0 ? "+" : "−"}${full(Math.abs(d))}`;
  const g = m.kind === "ratio" ? null : growth(n, l);
  return (
    <>
      <td className={`${tint} grp-start`}>{shownValue(n)}</td>
      <td className={tint}>{shownValue(l)}</td>
      <td className={tint}><span className={`delta ${toneOfNum(d)}`}>{diffText}</span></td>
      {m.kind !== "ratio" && (
        <td className={tint}><span className={`delta ${toneOfNum(g)}`}>{g == null ? "–" : `${arrowOf(toneOfNum(g))}${signedPct(g, 2)}`}</span></td>
      )}
    </>
  );
}

/** One chart's points: this month and the same day last year for each day. */
const seriesOf = (rows: DayRow[], pick: (r: DayRow) => [number | null, number | null]): DayPoint[] =>
  rows.map((r) => {
    const [now, prev] = pick(r);
    return { date: r.date, sply: r.prev, now, prev };
  });

export default function Daily({ daily }: { daily: DailyData }) {
  const firstDate = daily.days[0].date, lastDate = daily.days[daily.days.length - 1].date;
  const [from, setFrom] = useState<string>(firstDate);
  const [to, setTo] = useState<string>(lastDate);
  // a day clicked in the Day by day table: the KPIs and charts show that day, the table keeps its view
  const [focus, setFocus] = useState<string>("");
  const [store, setStore] = useState<StoreGroup>("all");
  const [type, setType] = useState<StoreType>("all");
  // the data group the figures come from: all stores, same stores, or their own or franchise stores
  const group = storeKey(store, type);
  // the figures are compared with the same day last year (SPLY) or the same day last month (SPLM)
  const [cmp, setCmp] = useState<Cmp>("sply");
  const [division, setDivision] = useState("");
  const [head, setHead] = useState<string>(TOTAL);
  const [crp, setCrp] = useState("");
  const [cat, setCat] = useState("");
  const [detail, setDetail] = useState<DailyDetailData | null>(null);
  // the head whose drill-down is open under the head table ("division|head"), or empty for the table
  const [openHead, setOpenHead] = useState<string>("");
  // the charts show the values (this month against the comparison), or each day's growth (GR%) against it
  const [view, setView] = useState<"values" | "growth">("values");
  const growthMode = view === "growth";
  const dayRowsRef = useRef<HTMLTableElement>(null);
  // the numbers printed on the chart points
  const [labels, setLabels] = useState(true);

  // the detail rows are a separate data file; they give the CRP and category lists, the figures when either is chosen,
  // and the detail table
  useEffect(() => {
    let live = true;
    import("@/data/daily-detail.json").then((m) => {
      if (live) setDetail(m.default as unknown as DailyDetailData);
    });
    return () => { live = false; };
  }, []);

  const variant = cmp === "sply" ? daily.groups : daily.splmGroups;
  const g = variant[group];
  const detailRows = (k: StoreKey) => (cmp === "sply" ? detail?.groups[k] : detail?.splmGroups[k]);
  // footfall (distinct bills) of each person under a head, and of each division, for the comparison chosen
  const personFf = (k: StoreKey): CrpFf[] => (cmp === "sply" ? detail?.crpFfGroups[k] : detail?.splmCrpFfGroups[k]) ?? [];
  const divisionFf = (k: StoreKey): DivFf[] => (cmp === "sply" ? detail?.divFfGroups[k] : detail?.splmDivFfGroups[k]) ?? [];
  const picked = g.heads.find((h) => headKey(h) === head);
  const headSel: DailyHead | null = head === TOTAL || !picked ? null : picked;
  // detail rows of the listed divisions, for the CRP and category lists and for the figures when either is chosen
  const listedRows = (rs: DailyDetailData["groups"]["all"] | undefined) => (rs ?? []).filter((r) => SHOWN_DIVISIONS.includes(r.division));
  const rowsOfHead = (h: DailyHead | null, rs = listedRows(detailRows(group))) =>
    (h ? rs.filter((r) => r.division === h.division && r.head === h.head) : rs);
  const headRows = rowsOfHead(headSel).filter((r) => !division || r.division === division);
  // a CRP belongs to a head and the CRP and category lists narrow each other, so a choice always has rows behind it;
  // one that no longer fits is ignored
  const crpSel = crp && headRows.some((r) => r.crp === crp) ? crp : "";
  const catSel = cat && headRows.some((r) => r.category === cat && (!crpSel || r.crp === crpSel)) ? cat : "";
  const crpOptions = uniqSorted(headRows.filter((r) => !catSel || r.category === catSel).map((r) => r.crp));
  const catOptions = uniqSorted(headRows.filter((r) => !crpSel || r.crp === crpSel).map((r) => r.category));
  const noFf: (number | null)[] = daily.days.map(() => null);
  // Footfall (distinct bills) for a selection, per day, or null where it cannot be counted exactly. A division, a head,
  // and one person under one head are exact. A category is exact only within one person (a bill can hold several
  // persons' items). A person under two heads is not one count, so it shows a dash.
  const ffFor = (sel: FfSel): FfArrays | null => {
    if (sel.crp) {
      const persons = personFf(group).filter((p) => p.crp === sel.crp
        && (!sel.division || p.division === sel.division)
        && (!sel.head || (p.division === sel.head.division && p.head === sel.head.head)));
      if (persons.length !== 1) return null;
      if (!sel.cat) return persons[0];
      const cats = (detailRows(group) ?? []).filter((r) => r.division === persons[0].division && r.head === persons[0].head
        && r.crp === sel.crp && r.category === sel.cat);
      return cats.length === 1 ? cats[0] : null;
    }
    if (sel.cat) {
      // A category with no CRP chosen is counted from its one seller in the scope chosen: every bill with that category is
      // then that CRP's. Bills with no CRP (rows with no head or CRP) cannot be placed on a CRP, so the seller's figure is
      // shown only when those are at most HEADLESS_LIMIT of the category's bills. Rows with only value adj (such as
      // 'Unmapped') have no bills and do not count.
      const inDivision = (r: DetailRow) => (sel.head ? r.division === sel.head.division : !sel.division || r.division === sel.division);
      const rowsOfCat = listedRows(detailRows(group)).filter((r) => r.category === sel.cat && inDivision(r));
      const total = (a: (number | null)[]) => a.reduce<number>((t, v) => t + (v ?? 0), 0);
      const billsOf = (rs: DetailRow[]): [number, number] => rs.reduce<[number, number]>(
        (t, r) => [t[0] + total(r.ff), t[1] + total(r.splyFf)], [0, 0]);
      const sellers = rowsOfCat.filter((r) => r.crp != null && r.head != null && (!sel.head || r.head === sel.head.head)
        && (r.ff.some((v) => v) || r.splyFf.some((v) => v)));
      const people = new Set(sellers.map((r) => `${r.division}|${r.head}|${r.crp}`));
      if (people.size !== 1) return null;
      const headless = billsOf(rowsOfCat.filter((r) => r.crp == null || r.head == null));
      return headlessWithin(billsOf(sellers), headless) ? sellers[0] : null;
    }
    if (sel.head) return sel.head;
    if (sel.division) return divisionFf(group).find((d) => d.division === sel.division) ?? null;
    return g.total;
  };
  // with a CRP, category or division chosen the figures are the sum of the matching detail rows; footfall comes from above
  const fromRows = Boolean(crpSel || catSel || division);
  const ff = ffFor({ division, head: headSel, crp: crpSel, cat: catSel });
  const ffShown = ff != null;
  const base: DayFields = fromRows
    ? dayFieldsOfRows(headRows.filter((r) => (!crpSel || r.crp === crpSel) && (!catSel || r.category === catSel)), daily.days.length)
    : headSel ?? g.total;
  const source: DayFields = { ...base, ff: ff ? ff.ff : noFf, splyFf: ff ? ff.splyFf : noFf };
  const headText = headSel ? headLabel(headSel) : division ? `All heads in ${titleCase(division)}` : "All category heads";
  const selectionLabel = [headText, crpSel && `CRP ${crpSel}`, catSel && `category ${titleCase(catSel)}`].filter(Boolean).join(", ");
  const metrics = ffShown ? METRICS : METRICS.filter((m) => !m.footfall);
  // the figures of the chosen division for the day-by-head table's total row, with the division's footfall
  const divFf = division ? ffFor({ division, head: null, crp: "", cat: "" }) : null;
  const divisionTotal: DayFields | null = division
    ? { ...dayFieldsOfRows(listedRows(detailRows(group)).filter((r) => r.division === division), daily.days.length),
        ff: divFf ? divFf.ff : noFf, splyFf: divFf ? divFf.splyFf : noFf }
    : null;

  const onHead = (v: string) => {
    setHead(v);
    const rs = rowsOfHead(g.heads.find((x) => headKey(x) === v) ?? null);
    if (crpSel && !rs.some((r) => r.crp === crpSel)) setCrp("");
    if (catSel && !rs.some((r) => r.category === catSel)) setCat("");
  };
  const onDivision = (v: string) => {
    setDivision(v);
    if (headSel && v && headSel.division !== v) setHead(TOTAL);
    const rs = listedRows(detailRows(group)).filter((r) => !v || r.division === v);
    if (crpSel && !rs.some((r) => r.crp === crpSel)) setCrp("");
    if (catSel && !rs.some((r) => r.category === catSel)) setCat("");
  };
  const onGroup = (nextStore: StoreGroup, nextType: StoreType) => {
    setStore(nextStore);
    setType(nextType);
    const rs = listedRows(detailRows(storeKey(nextStore, nextType)));
    if (crpSel && !rs.some((r) => r.crp === crpSel)) setCrp("");
    if (catSel && !rs.some((r) => r.category === catSel)) setCat("");
  };
  const onCmp = (next: Cmp) => {
    setCmp(next);
    const rs = listedRows(next === "sply" ? detail?.groups[group] : detail?.splmGroups[group]);
    if (crpSel && !rs.some((r) => r.crp === crpSel)) setCrp("");
    if (catSel && !rs.some((r) => r.category === catSel)) setCat("");
  };

  const rows: DayRow[] = daily.days.map((d, i) => {
    const f = dayFigures(source, i);
    return { date: d.date, prev: cmp === "sply" ? d.sply : d.splm, f, x: ratiosOf(f) };
  });
  // the days from From to To, in either order; by default the latest period, the whole data so far
  const lo = from <= to ? from : to, hi = from <= to ? to : from;
  const isLatest = lo === firstDate && hi === lastDate;
  const chosenIdx = rows.map((_, i) => i).filter((i) => rows[i].date >= lo && rows[i].date <= hi);
  const chosen = chosenIdx.map((i) => rows[i]);
  // the totals, the KPI band and the table follow the chosen days; the charts keep the whole month and mark them
  const total = sumFigures(chosen.map((r) => r.f));
  const totalX = ratiosOf(total);
  const withTotal = chosen.length > 1;
  const band = isLatest ? undefined : { from: lo, to: hi };
  const totalLabel = isLatest ? "Month to date" : lo === hi ? "Selected day" : "Selected period";
  const periodName = isLatest ? `Month to date (${daily.periodLabel})`
    : lo === hi ? dayLong(lo)
    : `${dayLong(lo)} to ${dayLong(hi)}`;
  // last year's days matched with the chosen days, as the workbook matches them
  const splys = chosen.map((r) => r.prev).sort();
  const compareName = chosen.length === 1 ? dayLong(splys[0])
    : chosen.length === 0 ? "no matched days"
    : `the matched days of ${dayMonth(splys[0])} to ${dayMonth(splys[splys.length - 1])} ${splys[0].slice(0, 4)}`;
  // a clicked day is shown in the KPIs and charts; a day outside the chosen period is ignored
  const focusRow = chosen.find((r) => r.date === focus);
  const shownF = focusRow ? focusRow.f : total;
  const shownX = focusRow ? focusRow.x : totalX;
  const chartBand = focusRow ? { from: focus, to: focus } : band;
  const chartTotalLabel = focusRow ? "Selected day" : totalLabel;
  // a head's responsible persons (CRPs) and their categories for the chosen days; the CRP and Category filters apply
  const crpsOf = (h: DailyHead): DayCrpRow[] => {
    const rs = rowsOfHead(h).filter((r) => r.crp != null && r.category != null
      && (!crpSel || r.crp === crpSel) && (!catSel || r.category === catSel));
    // the sales of the rows, with their footfall (null where it cannot be counted exactly)
    const figures = (rows: DetailRow[], fx: FfArrays | null) => {
      const fields: DayFields = { ...dayFieldsOfRows(rows, daily.days.length), ff: fx ? fx.ff : noFf, splyFf: fx ? fx.splyFf : noFf };
      const f = sumFigures(chosenIdx.map((i) => dayFigures(fields, i)));
      return { f, x: ratiosOf(f) };
    };
    const byCrp = new Map<string, DetailRow[]>();
    for (const r of rs) byCrp.set(r.crp as string, [...(byCrp.get(r.crp as string) ?? []), r]);
    return [...byCrp.entries()]
      .map(([name, crows]) => {
        const sel: FfSel = { division: h.division, head: h, crp: name, cat: "" };
        const byCat = new Map<string, DetailRow[]>();
        for (const r of crows) byCat.set(r.category as string, [...(byCat.get(r.category as string) ?? []), r]);
        const cats = [...byCat.entries()]
          .map(([cat, catRows]) => ({ name: cat, ...figures(catRows, ffFor({ ...sel, cat })) }))
          .sort((a, b) => (b.f.sales ?? 0) - (a.f.sales ?? 0));
        return { name, ...figures(crows, ffFor(sel)), cats };
      })
      .sort((a, b) => (b.f.sales ?? 0) - (a.f.sales ?? 0));
  };
  // the head table under the charts: each head's figures for the chosen days, with the same filters as the tab
  const headTable: DayHeadRow[] = g.heads
    .filter((h) => !headSel || headKey(h) === headKey(headSel))
    .filter((h) => !division || h.division === division)
    .flatMap((h) => {
      const rs = fromRows ? rowsOfHead(h).filter((r) => (!crpSel || r.crp === crpSel) && (!catSel || r.category === catSel)) : [];
      if (fromRows && rs.length === 0) return [];
      const hf = ffFor({ division: h.division, head: h, crp: crpSel, cat: catSel });
      const fields: DayFields = { ...(fromRows ? dayFieldsOfRows(rs, daily.days.length) : h), ff: hf ? hf.ff : noFf, splyFf: hf ? hf.splyFf : noFf };
      const f = sumFigures(chosenIdx.map((i) => dayFigures(fields, i)));
      return [{ division: h.division, role: h.role, head: h.head, f, x: ratiosOf(f), crps: crpsOf(h) }];
    })
    // the divisions in the order the detail table lists them, and the heads alphabetically within each
    .sort((a, b) => SHOWN_DIVISIONS.indexOf(a.division) - SHOWN_DIVISIONS.indexOf(b.division) || a.head.localeCompare(b.head));
  const headTotalLabel = headSel ? "Total (selected head)" : fromRows ? "Total (filtered rows)" : "Total (all divisions)";
  const drillRow = headTable.find((h) => `${h.division}|${h.head}` === openHead);

  const moneyDelta = (n: number | null, l: number | null) => {
    const gr = growth(n, l), d = difference(n, l);
    return { delta: `${d == null ? "–" : crSigned(d)}   ${arrowOf(toneOfNum(gr))}${signedPct(gr, 2)}`, t: toneOfNum(gr) };
  };
  const pointDelta = (n: number | null, l: number | null) => {
    const d = difference(n, l);
    return { delta: signedPct(d, 2), t: toneOfNum(d) };
  };
  // footfall in thousands of bills, for example 1,886.9K
  const kFmt = (v: number | null) => (v == null ? "–" : `${(v / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`);
  // a count (footfall) changes by a number of bills and a growth; basket changes by growth only
  const countDelta = (n: number | null, l: number | null) => {
    const gr = growth(n, l), d = difference(n, l);
    return { delta: `${d == null ? "–" : `${d >= 0 ? "+" : "−"}${kFmt(Math.abs(d))}`}   ${arrowOf(toneOfNum(gr))}${signedPct(gr, 2)}`, t: toneOfNum(gr) };
  };
  const growthDelta = (n: number | null, l: number | null) => {
    const gr = growth(n, l);
    return { delta: `${arrowOf(toneOfNum(gr))}${signedPct(gr, 2)}`, t: toneOfNum(gr) };
  };
  const cr = (v: number | null) => (v == null ? "–" : crFmt(v));
  const kpi = [
    { label: "Sales", value: cr(shownF.sales), sply: `${CMP_SHORT[cmp]}: ${cr(shownF.splySales)}`, ...moneyDelta(shownF.sales, shownF.splySales) },
    { label: "GPV", value: cr(shownF.gpv), sply: `${CMP_SHORT[cmp]}: ${cr(shownF.splyGpv)}`, ...moneyDelta(shownF.gpv, shownF.splyGpv) },
    { label: "GPV+OI", value: cr(shownF.gpvOi), sply: `${CMP_SHORT[cmp]}: ${cr(shownF.splyGpvOi)}`, ...moneyDelta(shownF.gpvOi, shownF.splyGpvOi) },
    { label: "GP%", value: pct(shownX.gp, 2), sply: `${CMP_SHORT[cmp]}: ${pct(shownX.splyGp, 2)}`, ...pointDelta(shownX.gp, shownX.splyGp) },
    { label: "GP+OI%", value: pct(shownX.goi, 2), sply: `${CMP_SHORT[cmp]}: ${pct(shownX.splyGoi, 2)}`, ...pointDelta(shownX.goi, shownX.splyGoi) },
    { label: "Footfall", value: ffShown ? kFmt(shownF.ff) : "–", sply: `${CMP_SHORT[cmp]}: ${ffShown ? kFmt(shownF.splyFf) : "–"}`,
      ...(ffShown ? countDelta(shownF.ff, shownF.splyFf) : { delta: "", t: "flat" }) },
    { label: "Basket", value: ffShown ? full(shownX.bs) : "–", sply: `${CMP_SHORT[cmp]}: ${ffShown ? full(shownX.splyBs) : "–"}`,
      ...(ffShown ? growthDelta(shownX.bs, shownX.splyBs) : { delta: "", t: "flat" }) },
  ];


  // the same layout as the table: a column per chosen day, a Total column when there is more than one day
  // the filters are at their defaults: all stores, own and franchise, all divisions and heads, the latest period, vs SPLY
  const isDefault = store === "all" && type === "all" && !division && head === TOTAL && !crp && !cat && isLatest && cmp === "sply" && !focus;
  const resetAll = () => {
    setStore("all");
    setType("all");
    setDivision("");
    setHead(TOTAL);
    setCrp("");
    setCat("");
    setFrom(firstDate);
    setTo(lastDate);
    setFocus("");
    setOpenHead("");
    setCmp("sply");
  };

  return (
    <div className="ov day-page">
      <aside className="drill-filters day-filters day-filters-panel" aria-label="Day wise sales filters">
        <button type="button" className="linkish" onClick={resetAll} disabled={isDefault}
          style={{ alignSelf: "flex-start", whiteSpace: "nowrap" }}>Reset all filters</button>
        <div className="fbar-field">
          <span>Compare with</span>
          <div className="seg" role="group" aria-label="Comparison period">
            {(["sply", "splm"] as Cmp[]).map((c) => (
              <button key={c} type="button" aria-pressed={cmp === c} onClick={() => onCmp(c)}>vs {CMP_SHORT[c]}</button>
            ))}
          </div>
        </div>
        <label>From
          <input type="date" value={from} min={firstDate} max={lastDate} aria-label="From date"
            onChange={(e) => { if (e.target.value) { setFrom(e.target.value); setFocus(""); } }} />
        </label>
        <label>To
          <input type="date" value={to} min={firstDate} max={lastDate} aria-label="To date"
            onChange={(e) => { if (e.target.value) { setTo(e.target.value); setFocus(""); } }} />
        </label>
        <label>Store group
          <select value={store} onChange={(e) => onGroup(e.target.value as StoreGroup, type)} aria-label="Store group">
            {(Object.keys(STORE_GROUP_LABEL) as StoreGroup[]).map((k) => <option key={k} value={k}>{STORE_GROUP_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Store type
          <select value={type} onChange={(e) => onGroup(store, e.target.value as StoreType)} aria-label="Store type">
            {(Object.keys(TYPE_LABEL) as StoreType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Division
          <select value={division} onChange={(e) => onDivision(e.target.value)} aria-label="Division">
            <option value="">All divisions</option>
            {SHOWN_DIVISIONS.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}
          </select>
        </label>
        <label className="day-head">Category head
          <select value={head} onChange={(e) => onHead(e.target.value)} aria-label="Category head">
            <option value={TOTAL}>All category heads</option>
            {g.heads.filter((h) => !division || h.division === division).map((h) => <option key={headKey(h)} value={headKey(h)}>{headLabel(h)}</option>)}
          </select>
        </label>
        <label>CRP
          <select value={crpSel} onChange={(e) => setCrp(e.target.value)} aria-label="CRP" disabled={!detail}>
            <option value="">{detail ? "All CRPs" : "Loading…"}</option>
            {crpOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Category (Cat 3)
          <select value={catSel} onChange={(e) => setCat(e.target.value)} aria-label="Category" disabled={!detail}>
            <option value="">{detail ? "All categories" : "Loading…"}</option>
            {catOptions.map((c) => <option key={c} value={c}>{c === "0" ? "(not set)" : titleCase(c)}</option>)}
          </select>
        </label>
      </aside>

      <div className="day-main">
      <section className="ov-kpis day-kpis" aria-label="Day wise sales key figures">
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
        {selectionLabel}, {STORE_LABEL[group].toLowerCase()}, {periodName}.{" "}
        {chosen.length ? `Each day is compared with the same day ${CMP_WORD[cmp]}.` : "No days fall in this range; choose dates inside the data period."}
        {from > to && " The two dates were swapped, so the range runs from the earlier to the later date."}
        {!ffShown && " Footfall and basket show a dash here: the bills for this selection cannot be counted exactly, so they are left blank."}
      </p>
      {focusRow && (
        <p className="ov-note">
          Showing {dayLong(focus)} in the KPIs and charts.{" "}
          <button type="button" className="linkish" onClick={() => setFocus("")}>Back to {periodName}</button>
        </p>
      )}

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
        <DayLines title="Day wise sales" kind="money" points={seriesOf(rows, (r) => [r.f.sales, r.f.splySales])}
          total={{ now: shownF.sales, prev: shownF.splySales }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
        <div className="day-pair">
          <DayLines title="Day wise GPV" kind="money" points={seriesOf(rows, (r) => [r.f.gpv, r.f.splyGpv])}
            total={{ now: shownF.gpv, prev: shownF.splyGpv }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
          <DayLines title="Day wise GPV+OI" kind="money" points={seriesOf(rows, (r) => [r.f.gpvOi, r.f.splyGpvOi])}
            total={{ now: shownF.gpvOi, prev: shownF.splyGpvOi }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
        </div>
        <div className="day-pair">
          <DayLines title="Day wise GP%" kind="pct" points={seriesOf(rows, (r) => [r.x.gp, r.x.splyGp])}
            total={{ now: shownX.gp, prev: shownX.splyGp }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
          <DayLines title="Day wise GP+OI%" kind="pct" points={seriesOf(rows, (r) => [r.x.goi, r.x.splyGoi])}
            total={{ now: shownX.goi, prev: shownX.splyGoi }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
        </div>
        {ffShown && (
          <div className="day-pair">
            <DayLines title="Day wise footfall" kind="count" points={seriesOf(rows, (r) => [r.f.ff, r.f.splyFf])}
              total={{ now: shownF.ff, prev: shownF.splyFf }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
            <DayLines title="Day wise basket" kind="count" points={seriesOf(rows, (r) => [r.x.bs, r.x.splyBs])}
              total={{ now: shownX.bs, prev: shownX.splyBs }} band={chartBand} totalLabel={chartTotalLabel} prevWord={CMP_WORD[cmp]} growthMode={growthMode} showLabels={labels} />
          </div>
        )}
      </div>

      <div className="ov-section-head"><h2>Category heads</h2></div>
      {drillRow ? (
        <DayHeadDrill head={drillRow} cmpShort={CMP_SHORT[cmp]} scopeText={`${STORE_LABEL[group].toLowerCase()}, ${periodName}`}
          onBack={() => setOpenHead("")} />
      ) : (
        <DayHeads rows={headTable} total={{ f: total, x: totalX }} totalLabel={headTotalLabel}
          cmpShort={CMP_SHORT[cmp]} caption={`Category heads for ${periodName}, ${STORE_LABEL[group].toLowerCase()}, vs ${CMP_SHORT[cmp]}.`}
          onOpen={setOpenHead} />
      )}

      <div className="ov-section-head"><h2>Day by day, vs {CMP_SHORT[cmp]}</h2></div>
      <div className="ov-panel ov-table-panel">
        <ExportCsv tableRef={dayRowsRef} filename={`day-by-day_${cmp}.csv`} />
        <div className="ov-table-scroll day-rows-scroll">
          <table ref={dayRowsRef} className="ov-table day-rows-table">
            <caption>
              {selectionLabel}, {STORE_LABEL[group].toLowerCase()}, {periodName}. Each day against the same day {CMP_WORD[cmp]}.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="l dr-c1">This month date</th>
                <th scope="col" className="l dr-c2">Same day {CMP_WORD[cmp]} date</th>
                {metrics.map((m) => (
                  <Fragment key={m.label}>
                    <th scope="col" className={`${DAY_TINT[m.label]} grp-start`}>{m.label} this</th>
                    <th scope="col" className={DAY_TINT[m.label]}>{m.label} {CMP_SHORT[cmp]}</th>
                    <th scope="col" className={DAY_TINT[m.label]}>Diff</th>
                    {m.kind !== "ratio" && <th scope="col" className={DAY_TINT[m.label]}>GR %</th>}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {chosen.map((r) => (
                <tr key={r.date}>
                  <td className="l dr-c1">{dateFull(r.date)}</td>
                  <td className="l dr-c2">{dateFull(r.prev)}</td>
                  {metrics.map((m) => <RowMetric key={m.label} m={m} n={m.now(r.f, r.x)} l={m.prev(r.f, r.x)} tint={DAY_TINT[m.label]} />)}
                </tr>
              ))}
            </tbody>
            {chosen.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row" className="l dr-c1">Total · {chosen.length} {chosen.length === 1 ? "day" : "days"}</th>
                  <td className="dr-c2" />
                  {metrics.map((m) => <RowMetric key={m.label} m={m} n={m.now(total, totalX)} l={m.prev(total, totalX)} tint={DAY_TINT[m.label]} />)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="ov-section-head"><h2>Day by day, by head</h2></div>
      <DayByHead heads={division ? g.heads.filter((h) => h.division === division) : g.heads} totalF={divisionTotal ?? g.total}
        detailRows={detailRows(group) ?? []} crpFf={personFf(group)} days={daily.days} cmpShort={CMP_SHORT[cmp]}
        scope={`${STORE_LABEL[group].toLowerCase()}, each day of ${daily.periodLabel}, vs ${CMP_SHORT[cmp]}`} />

      </div>
    </div>
  );
}
