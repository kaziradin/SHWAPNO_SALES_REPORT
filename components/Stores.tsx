"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyData, OutletCatData, StoreRow, StoresData } from "@/lib/types";
import { abbrOf, arrowOf, crOrDash, crSigned, full, growth, pct, signedPct, titleCase, toneOfNum } from "@/lib/format";
import { CMP_SHORT, CMP_WORD, type Cmp, dayLong, SHOWN_DIVISIONS, storeKey, type StoreGroup, type StoreType, uniqSorted } from "@/lib/daily";
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

/** One outlet in the table: its details, its figures this month and for the comparison, and its target. */
type Row = { r: StoreRow; now: Sum; last: Sum; tgt: Sum | null };

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

/** The figures of one row that the table shows, and that a column sorts by. Each is null where it cannot be worked out. */
const figuresOf = ({ now, last, tgt }: Row) => {
  const ratio = (a: number, b: number) => (b ? a / b : null);
  const diff = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);
  const gpNow = ratio(now.gpv, now.sales), gpLast = ratio(last.gpv, last.sales);
  const goiNow = ratio(now.gpv + now.va, now.sales), goiLast = ratio(last.gpv + last.va, last.sales);
  const bsNow = ratio(now.sales, now.ff), bsLast = ratio(last.sales, last.ff);
  // the basket target: the target sales over the target footfall
  const tgtBs = tgt && tgt.ff ? tgt.sales / tgt.ff : null;
  return {
    salesNow: now.sales, salesLast: last.sales, salesGr: growth(now.sales, last.sales),
    gpvNow: now.gpv, gpvLast: last.gpv, gpvGr: growth(now.gpv, last.gpv),
    goNow: now.gpv + now.va, goLast: last.gpv + last.va, goGr: growth(now.gpv + now.va, last.gpv + last.va),
    gpNow, gpLast, gpDiff: diff(gpNow, gpLast),
    goiNow, goiLast, goiDiff: diff(goiNow, goiLast),
    ffNow: now.ff, ffLast: last.ff, ffGr: growth(now.ff, last.ff),
    bsNow, bsLast, bsGr: growth(bsNow, bsLast),
    // each target: the target, this month's figure against it (ACH), and the gap (this month less the target)
    tgtSales: tgt ? tgt.sales : null, tgtSalesAch: tgt ? ratio(now.sales, tgt.sales) : null, tgtSalesGap: tgt ? now.sales - tgt.sales : null,
    tgtGpv: tgt ? tgt.gpv : null, tgtGpvAch: tgt ? ratio(now.gpv, tgt.gpv) : null, tgtGpvGap: tgt ? now.gpv - tgt.gpv : null,
    tgtFf: tgt ? tgt.ff : null, tgtFfAch: tgt ? ratio(now.ff, tgt.ff) : null, tgtFfGap: tgt ? now.ff - tgt.ff : null,
    tgtBs, tgtBsAch: bsNow != null && tgtBs ? bsNow / tgtBs : null, tgtBsGap: bsNow != null && tgtBs != null ? bsNow - tgtBs : null,
  };
};
type NumKey = keyof ReturnType<typeof figuresOf>;
type TextKey = "code" | "name" | "division" | "status";
type SortKey = NumKey | TextKey;
const TEXT_KEYS: SortKey[] = ["code", "name", "division", "status"];

/** A row's value for one column, for sorting: text for the outlet details, a number for the figures. */
const sortValueOf = (x: Row, key: SortKey): number | string | null => {
  if (key === "code") return x.r.code;
  if (key === "name") return x.r.name;
  if (key === "division") return x.r.division;
  if (key === "status") return x.r.status;
  return figuresOf(x)[key as NumKey];
};

/** One measure's three cells: this period, the comparison, and the change (a growth for money and counts, points for ratios). */
function Metric({ now, last, kind, tint, label }: { now: number | null; last: number | null; kind: Kind; tint: string; label: string }) {
  const show = (v: number | null) => (v == null ? "–" : kind === "money" || kind === "count" ? full(v) : pct(v, 2));
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

/** A target's three cells: the target, the achievement (ACH: this month against the target), and the gap (this month less
 *  the target). Money is in crore (the gap in lakh below one crore); counts are plain figures. */
function TargetTriple({ tgt, ach, gap, kind, tint, start }: {
  tgt: number | null; ach: number | null; gap: number | null; kind: "money" | "count"; tint: string; start?: boolean;
}) {
  const shownTgt = tgt == null ? "–" : full(tgt);
  const shownGap = gap == null ? "–" : `${gap < 0 ? "−" : "+"}${full(Math.abs(gap))}`;
  return (
    <>
      <td className={start ? `${tint} grp-start` : tint}>{shownTgt}</td>
      <td className={tint}>{ach == null ? "–" : pct(ach, 2)}</td>
      <td className={tint}><span className={`delta ${toneOfNum(gap)}`}>{shownGap}</span></td>
    </>
  );
}

/** A column header that sorts the table by its column. Clicking the active column again reverses the order. */
function SortTh<K extends string>({ k, label, cls, sortKey, dir, onSort }: {
  k: K; label: string; cls: string; sortKey: K; dir: "asc" | "desc"; onSort: (k: K) => void;
}) {
  const active = sortKey === k;
  return (
    <th scope="col" className={cls} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="th-sort" onClick={() => onSort(k)}>
        {label}{active && <span className="th-arrow">{dir === "asc" ? " ▲" : " ▼"}</span>}
      </button>
    </th>
  );
}

/** The columns of the outlet drill-down that sort it. */
type DrillKey = "division" | "cat3" | "now" | "last" | "diff" | "growth";

/** The order of the divisions in the drill-down: the six main ones (CG, PC, LC, FP, GM, LS), then every other division. */
const divisionRank = (division: string) => {
  const i = SHOWN_DIVISIONS.indexOf(division);
  return i >= 0 ? i : SHOWN_DIVISIONS.length;
};

/** A division's label: the code for the six main ones, as on the Category wise sheet, and the name for the others. */
const divisionLabel = (division: string) => (SHOWN_DIVISIONS.includes(division) ? abbrOf(division) : titleCase(division));

/** The drill-down's division filter: "Others" stands for every division that is not one of the six main ones. */
const OTHERS = "__others__";
const inArea = (division: string, area: string) =>
  !area || (area === OTHERS ? !SHOWN_DIVISIONS.includes(division) : division === area);

/** The measures of the outlet drill-down. The ratios are over sales; GPV+OI is GPV plus value adj (OI). */
type DrillMeasure = "sales" | "gpv" | "oi" | "gpvoi" | "gp" | "gpvoipct";
const DRILL_MEASURES: { key: DrillMeasure; label: string; ratio: boolean }[] = [
  { key: "sales", label: "Sales", ratio: false },
  { key: "gpv", label: "GPV", ratio: false },
  { key: "oi", label: "OI", ratio: false },
  { key: "gpvoi", label: "GPV+OI", ratio: false },
  { key: "gp", label: "GP%", ratio: true },
  { key: "gpvoipct", label: "GPV+OI%", ratio: true },
];

/** One outlet's figures on one line (a division, a Category L1 and a Category L3), this month and for the comparison. */
type DrillFigures = { s: number; g: number; o: number };
type DrillLine = { division: string; cat1: string; cat3: string; now: DrillFigures; last: DrillFigures };

/** A measure's value for some figures: money in taka, or a ratio over sales (null where there are no sales). */
const measureOf = (m: DrillMeasure, v: DrillFigures): number | null => {
  switch (m) {
    case "sales": return v.s;
    case "gpv": return v.g;
    case "oi": return v.o;
    case "gpvoi": return v.g + v.o;
    case "gp": return v.s ? v.g / v.s : null;
    case "gpvoipct": return v.s ? (v.g + v.o) / v.s : null;
  }
};

/** An outlet's breakdown by division and Category Level 3, for the chosen measure, this month against the comparison. */
function OutletDrill({ code, name, data, cmp, short, onClose }: {
  code: string; name: string; data: OutletCatData | null; cmp: Cmp; short: string; onClose: () => void;
}) {
  const [measure, setMeasure] = useState<DrillMeasure>("sales");
  const info = DRILL_MEASURES.find((m) => m.key === measure) ?? DRILL_MEASURES[0];
  const lines = useMemo<DrillLine[]>(() => {
    if (!data) return [];
    return (data.outlets[code] ?? []).map((ln) => {
      const [division, cat1, cat3] = data.keys[ln[0]];
      const now = { s: ln[1], g: ln[2], o: ln[3] };
      const last = cmp === "sply" ? { s: ln[4], g: ln[5], o: ln[6] } : { s: ln[7], g: ln[8], o: ln[9] };
      return { division, cat1, cat3, now, last };
    });
  }, [data, code, cmp]);
  // the division and Cat 3 filters of the breakdown: the six main divisions, and "Others" for every other division
  const [area, setArea] = useState("");
  const [cat, setCat] = useState("");
  const hasOthers = useMemo(() => lines.some((l) => !SHOWN_DIVISIONS.includes(l.division)), [lines]);
  const cats = useMemo(() => uniqSorted(lines.filter((l) => inArea(l.division, area)).map((l) => l.cat3)), [lines, area]);
  // the columns sort the breakdown. By default the lines run by division (CG, PC, LC, FP, GM, LS, then the others) and,
  // within a division, by this month's value of the chosen measure, highest first
  const [dsort, setDsort] = useState<DrillKey>("division");
  const [ddir, setDdir] = useState<"asc" | "desc">("asc");
  const onDrillSort = (k: DrillKey) => {
    if (k === dsort) setDdir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setDsort(k);
      setDdir(k === "division" || k === "cat3" ? "asc" : "desc");
    }
  };
  const valueOf = (l: DrillLine, k: DrillKey): number | string | null => {
    const n = measureOf(measure, l.now), p = measureOf(measure, l.last);
    switch (k) {
      case "division": return divisionRank(l.division);
      case "cat3": return l.cat3;
      case "now": return n;
      case "last": return p;
      case "diff": return n != null && p != null ? n - p : null;
      case "growth": return info.ratio ? null : growth(n, p);
    }
  };
  // the lines in the sort order; a blank always goes last, and ties keep the division order, then the value order
  const rows = useMemo(() => [...lines].sort((a, b) => {
    const va = valueOf(a, dsort), vb = valueOf(b, dsort);
    let c = 0;
    if (va == null || vb == null) c = va == null && vb == null ? 0 : va == null ? 1 : -1;
    else {
      c = typeof va === "string" ? va.localeCompare(String(vb)) : (va as number) - (vb as number);
      if (ddir === "desc") c = -c;
    }
    return c || divisionRank(a.division) - divisionRank(b.division) || (measureOf(measure, b.now) ?? 0) - (measureOf(measure, a.now) ?? 0);
  }), [lines, measure, dsort, ddir, info.ratio]);
  const shown = useMemo(
    () => rows.filter((l) => inArea(l.division, area) && (!cat || l.cat3 === cat)),
    [rows, area, cat],
  );
  const sumOf = (list: DrillLine[], pick: (l: DrillLine) => DrillFigures): DrillFigures =>
    list.reduce((t, l) => {
      const v = pick(l);
      return { s: t.s + v.s, g: t.g + v.g, o: t.o + v.o };
    }, { s: 0, g: 0, o: 0 });
  const totalNow = sumOf(shown, (l) => l.now), totalLast = sumOf(shown, (l) => l.last);

  // this month, the comparison, the difference and the growth, for the chosen measure (ratios give points, not growth)
  const cellsOf = (now: DrillFigures, last: DrillFigures) => {
    const n = measureOf(measure, now), l = measureOf(measure, last);
    const d = n != null && l != null ? n - l : null;
    return { n, l, d, gr: info.ratio ? null : growth(n, l) };
  };
  // money as whole taka with thousands separators (1,455,555), so the figures compare directly
  const fmtTaka = (v: number) => Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const moneyShown = (v: number) => `${v < 0 ? "−" : ""}${fmtTaka(v)}`;
  const moneyDiffShown = (v: number) => `${v < 0 ? "−" : "+"}${fmtTaka(v)}`;
  const show = (v: number | null) => (v == null ? "–" : info.ratio ? pct(v, 2) : moneyShown(v));
  const shownDiff = (d: number | null) => (d == null ? "–" : info.ratio ? signedPct(d, 2) : moneyDiffShown(d));
  const shownGr = (gr: number | null) => (info.ratio || gr == null ? "–" : `${arrowOf(toneOfNum(gr))}${signedPct(gr, 2)}`);
  const totals = cellsOf(totalNow, totalLast);

  // the rows on screen, to a CSV file: the division, Cat 3, this month, the comparison, the difference and the growth;
  // money in taka, ratios in percent
  const exportCsv = () => {
    const esc = (x: string | number | null) => {
      if (x == null) return "";
      const s = String(x);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const num = (v: number | null, ratio: boolean) => (v == null ? "" : (ratio ? v * 100 : v).toFixed(2));
    const head = ["Division", "Cat 3", "This", short, info.ratio ? "Diff (pts)" : "Diff", info.ratio ? "" : "Growth %"];
    const body = shown.map((l) => {
      const c = cellsOf(l.now, l.last);
      return [titleCase(l.division), titleCase(l.cat3), num(c.n, info.ratio), num(c.l, info.ratio), num(c.d, info.ratio),
        info.ratio || c.gr == null ? "" : (c.gr * 100).toFixed(2)];
    });
    const foot = ["Total", "", num(totals.n, info.ratio), num(totals.l, info.ratio), num(totals.d, info.ratio),
      info.ratio || totals.gr == null ? "" : (totals.gr * 100).toFixed(2)];
    const text = "﻿" + [head, ...body, foot].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${code}_${measure}_vs_${short}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="ov-panel drill-panel">
      <div className="drill-head">
        <h3>{code} · {name} · by division and Cat 3, vs {short}</h3>
        <button type="button" className="linkish" onClick={onClose}>Close</button>
      </div>
      <div className="seg" role="group" aria-label="Measure">
        {DRILL_MEASURES.map((m) => (
          <button key={m.key} type="button" aria-pressed={measure === m.key} onClick={() => setMeasure(m.key)}>{m.label}</button>
        ))}
      </div>
      <div className="drill-tools">
        <label>Division
          <select value={area} onChange={(e) => { setArea(e.target.value); setCat(""); }} aria-label="Division">
            <option value="">All divisions</option>
            {SHOWN_DIVISIONS.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}
            {hasOthers && <option value={OTHERS}>Others</option>}
          </select>
        </label>
        <label>Cat 3
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Cat 3">
            <option value="">All Cat 3</option>
            {cats.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </select>
        </label>
        <button type="button" className="linkish drill-export" onClick={exportCsv} disabled={!data || shown.length === 0}>Export CSV</button>
      </div>
      {!data ? (
        <p className="hint">Loading the category figures…</p>
      ) : lines.length === 0 ? (
        <p className="hint">No sales or OI lines for this outlet in these days.</p>
      ) : (
        <div className="ov-table-scroll drill-scroll">
          <table className="ov-table drill-table">
            <thead>
              <tr>
                <SortTh k="division" label="Division" cls="l" sortKey={dsort} dir={ddir} onSort={onDrillSort} />
                <SortTh k="cat3" label="Cat 3" cls="l" sortKey={dsort} dir={ddir} onSort={onDrillSort} />
                <SortTh k="now" label="This" cls="" sortKey={dsort} dir={ddir} onSort={onDrillSort} />
                <SortTh k="last" label={short} cls="" sortKey={dsort} dir={ddir} onSort={onDrillSort} />
                <SortTh k="diff" label={info.ratio ? "Diff (pts)" : "Diff"} cls="" sortKey={dsort} dir={ddir} onSort={onDrillSort} />
                <SortTh k="growth" label="Growth %" cls="" sortKey={dsort} dir={ddir} onSort={onDrillSort} />
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => {
                const c = cellsOf(l.now, l.last);
                return (
                  <tr key={`${l.division}|${l.cat1}|${l.cat3}`}>
                    <td className="l">{divisionLabel(l.division)}</td>
                    <td className="l">{titleCase(l.cat3)}</td>
                    <td>{show(c.n)}</td>
                    <td>{show(c.l)}</td>
                    <td><span className={`delta ${toneOfNum(c.d)}`}>{shownDiff(c.d)}</span></td>
                    <td><span className={`delta ${toneOfNum(c.gr)}`}>{shownGr(c.gr)}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={2} className="l">Total · {shown.length} {shown.length === 1 ? "line" : "lines"}</th>
                <td>{show(totals.n)}</td>
                <td>{show(totals.l)}</td>
                <td><span className={`delta ${toneOfNum(totals.d)}`}>{shownDiff(totals.d)}</span></td>
                <td><span className={`delta ${toneOfNum(totals.gr)}`}>{shownGr(totals.gr)}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

/** The Store wise performance tab: one row per outlet, with its area and status.
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
  // the table's sort: the column, and its direction (the default is sales this month, highest first)
  const [sortKey, setSortKey] = useState<SortKey>("salesNow");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // the day-wise charts show the values (this month against the comparison), or each day's growth (GR%) against it
  const [view, setView] = useState<"values" | "growth">("values");
  const growthMode = view === "growth";
  // the numbers printed on the chart points
  const [labels, setLabels] = useState(true);
  // the table, for the CSV export
  const tableRef = useRef<HTMLTableElement>(null);
  // the outlet whose division and Cat 3 breakdown is open; its data is loaded the first time one is opened
  const [drill, setDrill] = useState<{ code: string; name: string } | null>(null);
  const [catData, setCatData] = useState<OutletCatData | null>(null);
  // opens an outlet's breakdown (from its code or its name); once it is on the page, it is brought into view above the table
  const openDrill = (code: string, name: string) => setDrill({ code, name });
  useEffect(() => {
    if (drill) document.querySelector(".drill-panel")?.scrollIntoView({ block: "start" });
  }, [drill]);
  useEffect(() => {
    if (!drill || catData) return;
    let live = true;
    import("@/data/outlet-cat.json").then((m) => {
      if (live) setCatData(m.default as unknown as OutletCatData);
    });
    return () => { live = false; };
  }, [drill, catData]);

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
    // several codes or names, separated by commas: an outlet shows if it matches any of them
    const terms = search.toLowerCase().split(",").map((t) => t.trim()).filter(Boolean);
    return outlets
      .filter((r) => store === "all" || (cmp === "sply" ? r.sameSply : r.sameSplm))
      .filter((r) => type === "all" || (type === "own" ? r.status === "Own" : r.status === "Franchise"))
      .filter((r) => !division || r.division === division)
      .filter((r) => !format || r.format === format)
      .filter((r) => !leader || r.leader === leader)
      .filter((r) => !zonal || r.zonal === zonal)
      .filter((r) => terms.length === 0 || terms.some((t) => r.code.toLowerCase().includes(t) || r.name.toLowerCase().includes(t)));
  }, [outlets, cmp, store, type, division, format, leader, zonal, search]);
  // the rows: the outlets passing the filters with sales in the chosen days (in the sort order chosen above)
  const rows: Row[] = useMemo(() => passing
    .map((r) => ({ r, now: sumDays(r.daily.this, chosen), last: sumDays(r.daily[cmp], chosen), tgt: r.target ? sumDays(r.target, chosen) : null }))
    .filter(({ now, last }) => now.sales > 0 || last.sales > 0), [passing, chosen, cmp]);
  const sortedRows = useMemo(() => [...rows].sort((a, b) => {
    const va = sortValueOf(a, sortKey), vb = sortValueOf(b, sortKey);
    // a blank always sorts last, whichever way the column is ordered
    if (va == null || vb == null) return va == null && vb == null ? 0 : va == null ? 1 : -1;
    const c = typeof va === "string" ? va.localeCompare(String(vb)) : va - (vb as number);
    return sortDir === "asc" ? c : -c;
  }), [rows, sortKey, sortDir]);
  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(TEXT_KEYS.includes(k) ? "asc" : "desc");
    }
  };
  const head = { sortKey, dir: sortDir, onSort };

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

  // the table as it shows on screen, to a CSV file: one line per row, the same columns, numbers without thousands separators
  const exportTable = () => {
    const table = tableRef.current;
    if (!table) return;
    const clean = (s: string) => s.replace(/[▲▼]/g, "").replace(/−/g, "-").replace(/(\d),(?=\d{3}(?!\d))/g, "$1").replace(/\s+/g, " ").trim();
    const esc = (x: string) => (/[",\r\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
    const lines = [...table.querySelectorAll("tr")].map((tr) => {
      // a cell that spans columns (the total row's label) is followed by blanks, so the columns stay in line
      const cells = [...tr.children].flatMap((c) => {
        const text = c.textContent ?? "";
        const shown = text.trim() === "–" ? "" : clean(text);
        return [shown, ...Array((c as HTMLTableCellElement).colSpan - 1).fill("")];
      });
      return cells.map(esc).join(",");
    });
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `store-wise_${cmp}_${from}_to_${to}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="codes or names, e.g. D062, D007" aria-label="Outlet search" />
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

        {drill && <OutletDrill code={drill.code} name={drill.name} data={catData} cmp={cmp} short={short} onClose={() => setDrill(null)} />}

        <div className="ov-panel ov-table-panel">
          <div className="table-tools">
            <button type="button" className="linkish" onClick={exportTable} disabled={rows.length === 0}>Export CSV</button>
          </div>
          <div className="ov-table-scroll">
            <table ref={tableRef} className="ov-table stores-table tinted">
              <thead>
                <tr>
                  <SortTh k="code" label="Code" cls="l st-c1" {...head} />
                  <SortTh k="name" label="Outlet" cls="l st-c2" {...head} />
                  <SortTh k="division" label="Area" cls="l" {...head} />
                  <SortTh k="status" label="Status" cls="l" {...head} />
                  <SortTh k="salesNow" label="Sales this" cls={`${TINT.Sales} grp-start`} {...head} />
                  <SortTh k="salesLast" label={`Sales ${short}`} cls={TINT.Sales} {...head} />
                  <SortTh k="salesGr" label="GR%" cls={TINT.Sales} {...head} />
                  <SortTh k="gpvNow" label="GPV this" cls={`${TINT.GPV} grp-start`} {...head} />
                  <SortTh k="gpvLast" label={`GPV ${short}`} cls={TINT.GPV} {...head} />
                  <SortTh k="gpvGr" label="GR%" cls={TINT.GPV} {...head} />
                  <SortTh k="goNow" label="GPV+OI this" cls={`${TINT["GPV+OI"]} grp-start`} {...head} />
                  <SortTh k="goLast" label={`GPV+OI ${short}`} cls={TINT["GPV+OI"]} {...head} />
                  <SortTh k="goGr" label="GR%" cls={TINT["GPV+OI"]} {...head} />
                  <SortTh k="gpNow" label="GP% this" cls={`${TINT["GP%"]} grp-start`} {...head} />
                  <SortTh k="gpLast" label={`GP% ${short}`} cls={TINT["GP%"]} {...head} />
                  <SortTh k="gpDiff" label="Diff" cls={TINT["GP%"]} {...head} />
                  <SortTh k="goiNow" label="GP+OI% this" cls={`${TINT["GP+OI%"]} grp-start`} {...head} />
                  <SortTh k="goiLast" label={`GP+OI% ${short}`} cls={TINT["GP+OI%"]} {...head} />
                  <SortTh k="goiDiff" label="Diff" cls={TINT["GP+OI%"]} {...head} />
                  <SortTh k="ffNow" label="Footfall this" cls={`${TINT.Footfall} grp-start`} {...head} />
                  <SortTh k="ffLast" label={`Footfall ${short}`} cls={TINT.Footfall} {...head} />
                  <SortTh k="ffGr" label="GR%" cls={TINT.Footfall} {...head} />
                  <SortTh k="bsNow" label="Basket this" cls={`${TINT.Basket} grp-start`} {...head} />
                  <SortTh k="bsLast" label={`Basket ${short}`} cls={TINT.Basket} {...head} />
                  <SortTh k="bsGr" label="GR%" cls={TINT.Basket} {...head} />
                  <SortTh k="tgtSales" label="Sales TGT" cls={`${TINT.Sales} grp-start`} {...head} />
                  <SortTh k="tgtSalesAch" label="ACH %" cls={TINT.Sales} {...head} />
                  <SortTh k="tgtSalesGap" label="Gap" cls={TINT.Sales} {...head} />
                  <SortTh k="tgtGpv" label="GPV TGT" cls={TINT.GPV} {...head} />
                  <SortTh k="tgtGpvAch" label="ACH %" cls={TINT.GPV} {...head} />
                  <SortTh k="tgtGpvGap" label="Gap" cls={TINT.GPV} {...head} />
                  <SortTh k="tgtFf" label="FF TGT" cls={TINT.Footfall} {...head} />
                  <SortTh k="tgtFfAch" label="ACH %" cls={TINT.Footfall} {...head} />
                  <SortTh k="tgtFfGap" label="Gap" cls={TINT.Footfall} {...head} />
                  <SortTh k="tgtBs" label="BS TGT" cls={TINT.Basket} {...head} />
                  <SortTh k="tgtBsAch" label="ACH %" cls={TINT.Basket} {...head} />
                  <SortTh k="tgtBsGap" label="Gap" cls={TINT.Basket} {...head} />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(({ r, now, last, tgt }) => {
                  const fg = figuresOf({ r, now, last, tgt });
                  return (
                    <tr key={r.code}>
                      <td className="l st-c1"><button type="button" className="outlet-link" onClick={() => openDrill(r.code, r.name)}>{r.code}</button></td>
                      <td className="l st-c2" title={r.name}>
                        <button type="button" className="outlet-link" onClick={() => openDrill(r.code, r.name)}>{r.name}</button>
                      </td>
                      <td className="l">{r.division ? titleCase(r.division) : "–"}</td>
                      <td className="l">{r.status}</td>
                      <Metric now={now.sales} last={last.sales} kind="money" tint={TINT.Sales} label="Sales" />
                      <Metric now={now.gpv} last={last.gpv} kind="money" tint={TINT.GPV} label="GPV" />
                      <Metric now={fg.goNow} last={fg.goLast} kind="money" tint={TINT["GPV+OI"]} label="GPV+OI" />
                      <Metric now={fg.gpNow} last={fg.gpLast} kind="ratio" tint={TINT["GP%"]} label="GP%" />
                      <Metric now={fg.goiNow} last={fg.goiLast} kind="ratio" tint={TINT["GP+OI%"]} label="GP+OI%" />
                      <Metric now={now.ff} last={last.ff} kind="count" tint={TINT.Footfall} label="Footfall" />
                      <Metric now={fg.bsNow} last={fg.bsLast} kind="count" tint={TINT.Basket} label="Basket" />
                      <TargetTriple tgt={fg.tgtSales} ach={fg.tgtSalesAch} gap={fg.tgtSalesGap} kind="money" tint={TINT.Sales} start />
                      <TargetTriple tgt={fg.tgtGpv} ach={fg.tgtGpvAch} gap={fg.tgtGpvGap} kind="money" tint={TINT.GPV} />
                      <TargetTriple tgt={fg.tgtFf} ach={fg.tgtFfAch} gap={fg.tgtFfGap} kind="count" tint={TINT.Footfall} />
                      <TargetTriple tgt={fg.tgtBs} ach={fg.tgtBsAch} gap={fg.tgtBsGap} kind="count" tint={TINT.Basket} />
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4} className="l">Total · {rows.length} {rows.length === 1 ? "outlet" : "outlets"}</th>
                    <Metric now={s} last={sl} kind="money" tint={TINT.Sales} label="Sales" />
                    <Metric now={g} last={gl} kind="money" tint={TINT.GPV} label="GPV" />
                    <Metric now={go} last={gol} kind="money" tint={TINT["GPV+OI"]} label="GPV+OI" />
                    <Metric now={gp} last={gpl} kind="ratio" tint={TINT["GP%"]} label="GP%" />
                    <Metric now={goi} last={goil} kind="ratio" tint={TINT["GP+OI%"]} label="GP+OI%" />
                    <Metric now={f} last={fl} kind="count" tint={TINT.Footfall} label="Footfall" />
                    <Metric now={bs} last={bsl} kind="count" tint={TINT.Basket} label="Basket" />
                    <TargetTriple tgt={ts} ach={achSalesPct} gap={ts != null ? achOf.sales - ts : null} kind="money" tint={TINT.Sales} start />
                    <TargetTriple tgt={tg} ach={achGpvPct} gap={tg != null ? achOf.gpv - tg : null} kind="money" tint={TINT.GPV} />
                    <TargetTriple tgt={tf} ach={achFfPct} gap={tf != null ? achOf.ff - tf : null} kind="count" tint={TINT.Footfall} />
                    <TargetTriple tgt={tb} ach={achBsPct} gap={tb != null && achOf.ff ? achOf.sales / achOf.ff - tb : null} kind="count" tint={TINT.Basket} />
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
