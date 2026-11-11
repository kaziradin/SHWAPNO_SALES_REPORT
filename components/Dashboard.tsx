"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Cat3Row, CrpFf, DailyData, DailyDetailData, DailyHead, DetailRow, HeadRow, Metrics, MonthOverview, Outlet, Report, SegmentKey, StoreKey } from "@/lib/types";
import {
  abbrOf, arrowOf, crFmt, crOrDash, crSigned, diff, growth, int, longDate, monthName, pct, pp, roleName, signedPct, titleCase, toneOfNum,
} from "@/lib/format";
import { DivergingBars, useTooltip, useWidth, type TipRow } from "./charts";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";
import { headlessWithin, uniqSorted } from "@/lib/daily";
import FilterBar, { CMP_LABEL, SEGMENT_LABELS, type Cmp } from "./FilterBar";
import Overview from "./Overview";
import Daily from "./Daily";
import { WIDE, WideCells } from "./HeadMeasures";

type Tab = "overview" | "heads" | "daily" | "outlets";

export default function Dashboard({ report, months, daily }: { report: Report; months: MonthOverview[]; daily: DailyData }) {
  const [cmp, setCmp] = useState<Cmp>("sply");
  const [segment, setSegment] = useState<SegmentKey>("all");
  const [tab, setTab] = useState<Tab>("overview");
  // months are sorted newest first; the latest month is the default
  const [month, setMonth] = useState(months[0]?.month ?? "");
  const monthData = months.find((m) => m.month === month) ?? months[0];
  // Overview sidebar (Claude-style): docked + collapsible on desktop, drawer on small screens
  const [sideOpen, setSideOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("bpr-side") === "closed") setSideOpen(false); } catch {}
  }, []);
  const setSide = (open: boolean) => {
    setSideOpen(open);
    try { localStorage.setItem("bpr-side", open ? "open" : "closed"); } catch {}
  };
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const comparison = report[cmp];
  const seg = comparison.segments[segment] ?? comparison.segments.all!;
  const segKeys = (Object.keys(SEGMENT_LABELS) as SegmentKey[]).filter((k) => comparison.segments[k]);

  const sidebar = tab === "overview" && monthData ? (
    <>
      {drawer && <div className="ov-backdrop" onClick={() => setDrawer(false)} aria-hidden />}
      <aside id="ov-sidebar" className={`ov-sb${sideOpen ? "" : " rail"}${drawer ? " drawer" : ""}`} aria-label="Filters and report details">
        <div className="ov-sb-top">
          {(sideOpen || drawer) && <span className="ov-sb-brand">Shwapno BPR</span>}
          <button className="ov-sb-icon" title={drawer ? "Close" : sideOpen ? "Close sidebar" : "Open sidebar"}
            aria-label={drawer ? "Close filters" : sideOpen ? "Close sidebar" : "Open sidebar"} aria-expanded={sideOpen || drawer}
            onClick={() => (drawer ? setDrawer(false) : setSide(!sideOpen))}>
            <Icon name="panel" />
          </button>
        </div>
        {sideOpen || drawer ? (
          <div className="ov-sb-body">
            <div className="ov-sb-label">Filters</div>
            <FilterBar
              layout="side"
              months={months.map((m) => m.month)} month={monthData.month} onMonth={setMonth}
              segments={(Object.keys(SEGMENT_LABELS) as SegmentKey[]).filter((k) => monthData[cmp].segments[k])}
              segment={segment} onSegment={setSegment}
              cmp={cmp} onCmp={setCmp}
            />
          </div>
        ) : (
          <nav className="ov-sb-rail" aria-label="Filters (collapsed)">
            <button title={`Month: ${monthName(monthData.month)}`} onClick={() => setSide(true)}><Icon name="calendar" /></button>
            <button title={`Store group: ${SEGMENT_LABELS[segment]}`} onClick={() => setSide(true)}><Icon name="store" /></button>
            <button title={`Compare with: ${CMP_LABEL[cmp].short}`} onClick={() => setSide(true)}><Icon name="compare" /></button>
          </nav>
        )}
      </aside>
    </>
  ) : null;

  return (
    <div className={sidebar ? `ov-shell${sideOpen ? "" : " rail"}` : undefined}>
    {sidebar}
    <main className={`wrap${tab === "overview" ? " wide" : ""}`}>
      <header className="top">
        <div>
          <h1>Business Performance</h1>
          <div className="sub">
            {tab === "overview" && monthData
              ? <>Till {longDate(monthData.asOf)} · {monthData.periodLabel} · compared with the {CMP_LABEL[cmp].long}</>
              : tab === "daily"
                ? <>Till {longDate(daily.asOf)} · {daily.periodLabel} · each day compared with the same day last year</>
                : <>Till {longDate(report.asOf)} · {report.periodLabel} · compared with the {CMP_LABEL[cmp].long}</>}
          </div>
        </div>
        {tab !== "overview" && tab !== "daily" && <div className="controls">
          <div className="seg" role="group" aria-label="Comparison period">
            {(["sply", "splm"] as Cmp[]).map((c) => (
              <button key={c} aria-pressed={cmp === c} onClick={() => setCmp(c)} title={CMP_LABEL[c].long}>
                vs {CMP_LABEL[c].short}
              </button>
            ))}
          </div>
        </div>}
      </header>

      <nav className="tabs" role="tablist">
        {([
          ["overview", "Overview"],
          ["heads", "Category heads"],
          ["daily", "Day wise sales"],
          ["outlets", "Outlets & targets"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {tab === "overview" && monthData && (
        <>
          <button className="ov-drawer-btn" onClick={() => setDrawer(true)} aria-controls="ov-sidebar" aria-expanded={drawer}>
            <Icon name="panel" /> Filters · {monthName(monthData.month)} · {SEGMENT_LABELS[segment]} · vs {CMP_LABEL[cmp].short}
          </button>
          <Overview data={monthData} cmp={cmp} segment={segment} />
        </>
      )}
      {tab === "heads" && <Heads report={report} cmp={cmp} daily={daily} onCmp={setCmp} />}
      {tab === "daily" && <Daily daily={daily} />}
      {tab === "outlets" && <Outlets outlets={report.outlets} cmp={cmp} />}

      <p className="foot">
        Source: {tab === "daily" ? daily.sourceFile : report.sourceFile} · data extracted{" "}
        {(tab === "daily" ? daily.generatedAt : report.generatedAt).replace("T", " ")}
      </p>
    </main>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

function Icon({ name }: { name: "panel" | "calendar" | "store" | "compare" }) {
  const p = {
    panel: <><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M8 4v12" /></>,
    calendar: <><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8.5h14M7 3v3M13 3v3" /></>,
    store: <><path d="M3.5 8 5 4h10l1.5 4" /><path d="M3.5 8h13v1.2a2.2 2.2 0 0 1-4.3 0 2.2 2.2 0 0 1-4.4 0 2.2 2.2 0 0 1-4.3 0Z" /><path d="M5 10.5V16h10v-5.5" /></>,
    compare: <><path d="M4 7h11l-3-3M16 13H5l3 3" /></>,
  }[name];
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>{p}</svg>
  );
}

function Delta({ v, kind = "pct" }: { v: number | null; kind?: "pct" | "pp" }) {
  if (v == null || !isFinite(v)) return <span className="delta flat">–</span>;
  const tone = Math.abs(v) < 0.0005 ? "flat" : v > 0 ? "up" : "down";
  const arrow = tone === "up" ? "▲ " : tone === "down" ? "▼ " : "";
  return <span className={`delta ${tone}`}>{arrow}{kind === "pp" ? pp(v) : signedPct(v)}</span>;
}

type SortState<K extends string> = { key: K; dir: 1 | -1 };
function useSort<T, K extends string>(rows: T[], get: Record<K, (r: T) => number | string | null>, initial: SortState<NoInfer<K>>) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const f = get[sort.key];
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(y as string) : x - (y as number)) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const th = (key: K, label: string, cls = "") => (
    <th
      className={`sortable ${cls}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}
      aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      {label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
    </th>
  );
  return { sorted, th };
}

/* ------------------------------------------------------------------ overview */

/* ------------------------------------------------------------------ category heads */

const headLabel = (r: HeadRow) => `${abbrOf(r.division)} - ${roleName(r.role)} - ${r.head}`;
const ratioOf = (a: number, b: number) => (b ? a / b : null);

type ChartKind = "crore" | "full" | "pct";
type ChartItem = { label: string; now: number; last: number; chg: string; t: "up" | "down" | "flat"; kind: ChartKind };

/** Values in the same format as the Overview tooltip: crore for money, full figures for counts, % for ratios. */
const fmtKind = (k: ChartKind, v: number) => (k === "crore" ? crFmt(v) : k === "pct" ? pct(v, 2) : fm(v));
const diffKind = (k: ChartKind, d: number) => (k === "crore" ? crSigned(d) : k === "pct" ? signedPct(d, 2) : `${d >= 0 ? "+" : "−"}${fm(Math.abs(d))}`);

/** Growth bars: this period (navy) against SPLY (grey) for one head. */
function growthItem(r: HeadRow, now: number | null | undefined, last: number | null | undefined, kind: ChartKind): ChartItem {
  const n = now ?? 0, l = last ?? 0;
  const g = n && l ? n / l - 1 : null;
  return { label: headLabel(r), now: n, last: l, chg: signedPct(g, 2), t: toneOfNum(g), kind };
}

/** Ratio bars (GP%, GP+OI%): the change shown is the difference between the two percentages. */
function pointItem(r: HeadRow, now: number | null | undefined, last: number | null | undefined): ChartItem {
  const n = now ?? 0, l = last ?? 0;
  const d = now != null && last != null ? now - last : null;
  return { label: headLabel(r), now: n, last: l, chg: signedPct(d, 2), t: toneOfNum(d), kind: "pct" };
}

function wrapText(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= max || !cur) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Column chart: navy = this period, grey = SPLY; change above each pair; full label below. Hover shows the figures.
 *  Drawn at its real width, so the text stays the same size whether the chart is full width or half of a row. */
function HeadChart({ title, sub, items, sLabel }: { title: string; sub: string; items: ChartItem[]; sLabel: string }) {
  const { show, hide, node } = useTooltip();
  const { ref, w: W } = useWidth(560);
  const top = 40, plotH = 220;
  if (items.length === 0) return null;
  const gw = W / items.length;
  // each label wraps to the width of its column
  const perLine = Math.max(7, Math.floor((gw - 4) / 5.6));
  const chgSize = gw < 72 ? 11 : 12;
  const lines = items.map((it) => wrapText(it.label, perLine));
  const maxLines = Math.max(...lines.map((l) => l.length));
  const base = top + plotH;
  const H = base + 18 + 13 * maxLines + 12;
  const vmax = Math.max(1e-9, ...items.flatMap((it) => [Math.abs(it.now), Math.abs(it.last)]));
  const bw = Math.min(26, (gw - 14) / 2);
  const tip = (it: ChartItem): TipRow[] => [
    ["This period", fmtKind(it.kind, it.now)],
    [sLabel, fmtKind(it.kind, it.last)],
    ["Difference", diffKind(it.kind, it.now - it.last)],
    ["Change", it.chg],
  ];
  return (
    <div className="ov-panel">
      <h3>{title}<small>{sub}</small></h3>
      <div ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${title}, this period against ${sLabel}`}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={0} x2={W} y1={base - plotH * t} y2={base - plotH * t} className="ov-grid" />
        ))}
        <line x1={0} x2={W} y1={base} y2={base} className="ov-base" />
        {items.map((it, i) => {
          const cx = gw * i + gw / 2;
          const hn = (plotH * Math.abs(it.now)) / vmax;
          const hl = (plotH * Math.abs(it.last)) / vmax;
          const topY = base - Math.max(hn, hl, 2);
          const col = it.t === "up" ? "var(--ov-up)" : it.t === "down" ? "var(--ov-down)" : "var(--ov-ink2)";
          return (
            <g key={i} onMouseMove={(e) => show(e, it.label, tip(it))} onMouseLeave={hide}>
              <rect className="ov-col-hit" x={gw * i} y={0} width={gw} height={H} />
              <rect x={cx - bw - 1} y={base - hn} width={bw} height={Math.max(hn, 0)} rx={3} style={{ fill: "var(--this)" }} />
              <rect x={cx + 1} y={base - hl} width={bw} height={Math.max(hl, 0)} rx={3} style={{ fill: "var(--last)" }} />
              <text x={cx} y={topY - 8} textAnchor="middle" fontSize={chgSize} style={{ fill: col, fontWeight: 600 }}>{it.chg}</text>
              {lines[i].map((ln, k) => (
                <text key={k} x={cx} y={base + 18 + 13 * k} textAnchor="middle" fontSize={10} className="ov-col-name">{ln}</text>
              ))}
            </g>
          );
        })}
      </svg>
      </div>
      {node}
    </div>
  );
}

function Num({ value, change, t }: { value: string; change: string | null; t: "up" | "down" | "flat" }) {
  return (
    <td>
      <div className="ov-td-val">{value}</div>
      {change !== null && <div><span className={`delta ${t}`}>{arrowOf(t)}{change}</span></div>}
    </td>
  );
}

/** Growth and percentage-point difference for Excel columns (null when there is no base). */
const growthOf = (n?: number | null, l?: number | null): number | null => (!n || !l ? null : n / l - 1);
const diffOf = (n?: number | null, l?: number | null): number | null => (n == null || l == null ? null : n - l);

type HeadSort = { key: "name" | "sales" | "gpv" | "gp" | "gpvoi" | "goi" | "ff" | "bs"; dir: "asc" | "desc" };

function headSortValue(r: HeadRow, key: HeadSort["key"]): number | string {
  switch (key) {
    case "name": return `${r.division} ${r.head}`;
    case "sales": return r.sales ?? 0;
    case "gpv": return r.gpv ?? 0;
    case "gp": return r.gp ?? 0;
    case "gpvoi": return r.gpvOi ?? 0;
    case "goi": return r.gpOi ?? 0;
    case "ff": return r.ff ?? 0;
    case "bs": return (r.sales ?? 0) / (r.ff || 1);
  }
}

/** Orders the heads for the table and every head chart. */
function sortHeads(rs: HeadRow[], sort: HeadSort): HeadRow[] {
  const m = sort.dir === "asc" ? 1 : -1;
  return [...rs].sort((x, y) => {
    const a = headSortValue(x, sort.key), b = headSortValue(y, sort.key);
    return typeof a === "string" ? a.localeCompare(b as string) * m : ((a as number) - (b as number)) * m;
  });
}

function SortTh({ k, label, sort, onSort, cls }: { k: HeadSort["key"]; label: string; sort: HeadSort; onSort: (k: HeadSort["key"]) => void; cls?: string }) {
  const active = sort.key === k;
  return (
    <th scope="col" className={cls} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className="sortbtn" onClick={() => onSort(k)}>{label}{active ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
    </th>
  );
}

/** The all-stores and same-stores heads from the day-wise file, for this month and for SPLY: the days summed, with the
 *  same definitions as the Day wise sales tab, so the two tabs agree. SPLM and the other store groups stay as they were. */
function withDailyHeads(rows: HeadRow[], dailyHeads: DailyHead[]): HeadRow[] {
  const byHead = new Map(dailyHeads.map((h) => [`${h.division}|${h.head}`, h]));
  const sum = (a: (number | null)[]) => a.reduce<number>((t, v) => t + (v ?? 0), 0);
  const over = (n: number, d: number) => (d ? n / d : null);
  return rows.map((r) => {
    const d = byHead.get(`${r.division}|${r.head}`);
    if (!d) return r;
    const sales = sum(d.sales), ff = sum(d.ff), gpv = sum(d.gpv), gpvOi = gpv + sum(d.valueAdj);
    const salesLast = sum(d.splySales), ffLast = sum(d.splyFf);
    const gpvLast = sum(d.splyGpv), gpvOiLast = gpvLast + sum(d.splyValueAdj);
    return {
      ...r,
      sales, ff: ff || null, bs: over(sales, ff),
      gpv, gp: over(gpv, sales), gpvOi, gpOi: over(gpvOi, sales),
      salesLast, ffLast: ffLast || null, bsLast: over(salesLast, ffLast),
      gpvLast, gpLast: over(gpvLast, salesLast), gpvOiLast, gpOiLast: over(gpvOiLast, salesLast),
    };
  });
}

/** The day-wise data group of each segment of the Category heads tab. */
const STORE_OF: Partial<Record<SegmentKey, StoreKey>> = {
  all: "all", same: "same", own: "allOwn", ownSame: "sameOwn", franchise: "allFran", franchiseSame: "sameFran",
};

/** The this-month and same-store data groups behind a segment, for the head drill-down; null where there is no detail. */
function familyOf(seg: SegmentKey): { all: StoreKey; same: StoreKey } | null {
  if (seg === "all" || seg === "same") return { all: "all", same: "same" };
  if (seg === "own" || seg === "ownSame") return { all: "allOwn", same: "sameOwn" };
  if (seg === "franchise" || seg === "franchiseSame") return { all: "allFran", same: "sameFran" };
  return null;
}

function Heads({ report, cmp, daily, onCmp }: { report: Report; cmp: Cmp; daily: DailyData; onCmp: (c: Cmp) => void }) {
  const s = CMP_LABEL[cmp].short;
  const reportBlocks = report[cmp].headBlocks ?? {};
  // the segments with day-wise figures (all, same, own and franchise, and their same-store versions) come from the
  // day-wise file, against last year or last month, so they match the Day wise tab and the CRP and Category filters
  const dayGroups = cmp === "sply" ? daily.groups : daily.splmGroups;
  const blocks: Partial<Record<SegmentKey, HeadRow[]>> = { ...reportBlocks };
  for (const segKey of Object.keys(STORE_OF) as SegmentKey[]) {
    blocks[segKey] = withDailyHeads(reportBlocks[segKey] ?? [], dayGroups[STORE_OF[segKey] as StoreKey].heads);
  }
  const keys = (Object.keys(SEGMENT_LABELS) as SegmentKey[]).filter((k) => blocks[k]?.length);
  const [drill, setDrill] = useState<HeadRow | null>(null);
  const [seg, setSeg] = useState<SegmentKey>("all");
  const [hsort, setHsort] = useState<HeadSort>({ key: "sales", dir: "desc" });
  const onHeadSort = (k: HeadSort["key"]) =>
    setHsort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" }));
  // Head, CRP and Category filters of the head table; CRP and Category come from the detail rows, loaded only on this tab
  const [hHead, setHHead] = useState("");
  const [hCrp, setHCrp] = useState("");
  const [hCat, setHCat] = useState("");
  const [detail, setDetail] = useState<DailyDetailData | null>(null);
  useEffect(() => {
    let live = true;
    import("@/data/daily-detail.json").then((m) => {
      if (live) setDetail(m.default as unknown as DailyDetailData);
    });
    return () => { live = false; };
  }, []);
  if (drill) {
    // the same-store version of the segment: same stores, same own stores or same franchise stores
    const sameSeg: SegmentKey = seg === "own" || seg === "ownSame" ? "ownSame" : seg === "franchise" || seg === "franchiseSame" ? "franchiseSame" : "same";
    const headSame = (blocks[sameSeg] ?? []).find((x) => x.division === drill.division && x.head === drill.head);
    // the responsible persons and categories come from the day-wise detail, for last year and last month alike,
    // so they match the head table and the Day wise tab
    const cat = cat3FromDetail(detail, cmp, drill, seg);
    // footfall of the persons under this head, and the rows with no CRP or no head (their bills are not on any CRP row),
    // from the same day-wise detail; the drill uses them for its footfall and basket columns
    const fam = familyOf(seg);
    const rowsOf = (k: StoreKey | undefined): DetailRow[] => (detail && k ? (cmp === "sply" ? detail.groups : detail.splmGroups)[k] ?? [] : []);
    const personsOf = (k: StoreKey | undefined): CrpFf[] => (detail && k ? (cmp === "sply" ? detail.crpFfGroups : detail.splmCrpFfGroups)[k] ?? [] : [])
      .filter((p) => p.division === drill.division && p.head === drill.head);
    // bills with no CRP, per category, in the drill's division: [this period, last year]
    const headlessOf = (k: StoreKey | undefined): Map<string, [number, number]> => {
      const m = new Map<string, [number, number]>();
      for (const r of rowsOf(k)) {
        if (r.division !== drill.division || (r.crp != null && r.head != null) || !r.category) continue;
        const [a, b] = m.get(r.category) ?? [0, 0];
        m.set(r.category, [a + (sumNull(r.ff) ?? 0), b + (sumNull(r.splyFf) ?? 0)]);
      }
      return m;
    };
    return <HeadDrill head={drill} headSame={headSame} cat={cat} seg={seg} cmp={cmp} onCmp={onCmp} onBack={() => setDrill(null)}
      personAll={personsOf(fam?.all)} personSame={personsOf(fam?.same)} headlessAll={headlessOf(fam?.all)} headlessSame={headlessOf(fam?.same)} />;
  }

  const baseHeads = blocks[seg] ?? [];
  const headKeyOf = (x: { division: string; head: string | null }) => `${x.division}|${x.head ?? ""}`;
  const baseKeys = new Set(baseHeads.map(headKeyOf));
  // CRP and category need the detail rows, which cover SPLY for all stores and same stores
  const canDetail = Boolean(familyOf(seg)) && Boolean(detail);
  const detailRows: DetailRow[] = canDetail
    ? ((cmp === "sply" ? detail?.groups : detail?.splmGroups)?.[STORE_OF[seg] as StoreKey] ?? []).filter((r) => baseKeys.has(headKeyOf(r)))
    : [];
  const rowsFor = (headK: string, crpV: string, catV: string) =>
    detailRows.filter((r) => (!headK || headKeyOf(r) === headK) && (!crpV || r.crp === crpV) && (!catV || r.category === catV));
  // each choice is kept only while rows still match it, so a choice never gives an empty table
  const headSelKey = hHead && baseKeys.has(hHead) ? hHead : "";
  const crpSel = canDetail && hCrp && uniqSorted(rowsFor(headSelKey, "", "").map((r) => r.crp)).includes(hCrp) ? hCrp : "";
  const catSel = canDetail && hCat && uniqSorted(rowsFor(headSelKey, crpSel, "").map((r) => r.category)).includes(hCat) ? hCat : "";
  const crpOptions = canDetail ? uniqSorted(rowsFor(headSelKey, "", catSel).map((r) => r.crp)) : [];
  const catOptions = canDetail ? uniqSorted(rowsFor(headSelKey, crpSel, "").map((r) => r.category)) : [];
  const fromDetail = Boolean(crpSel || catSel);
  const filtered = Boolean(headSelKey || fromDetail);
  const sumArr = (a: (number | null)[]) => a.reduce<number>((t, v) => t + (v ?? 0), 0);
  // a head's figures from the detail rows of the chosen CRP and category; those rows have no footfall or basket
  const headRowsFromDetail = (rs: DetailRow[]): HeadRow[] => {
    const acc = new Map<string, { division: string; head: string; sales: number; salesLast: number; gpv: number; gpvLast: number; va: number; vaLast: number }>();
    for (const r of rs) {
      const k = headKeyOf(r);
      const g = acc.get(k) ?? { division: r.division, head: r.head ?? "", sales: 0, salesLast: 0, gpv: 0, gpvLast: 0, va: 0, vaLast: 0 };
      g.sales += sumArr(r.sales); g.salesLast += sumArr(r.splySales);
      g.gpv += sumArr(r.gpv); g.gpvLast += sumArr(r.splyGpv);
      g.va += sumArr(r.valueAdj); g.vaLast += sumArr(r.splyValueAdj);
      acc.set(k, g);
    }
    return [...acc.values()].map((g): HeadRow => {
      const role = baseHeads.find((h) => headKeyOf(h) === `${g.division}|${g.head}`)?.role ?? "";
      const gpvOi = g.gpv + g.va, gpvOiLast = g.gpvLast + g.vaLast;
      return {
        division: g.division, role, head: g.head,
        sales: g.sales, salesLast: g.salesLast, ff: null, ffLast: null, bs: null, bsLast: null,
        gp: ratioOf(g.gpv, g.sales), gpLast: ratioOf(g.gpvLast, g.salesLast),
        gpv: g.gpv, gpvLast: g.gpvLast, gpOi: ratioOf(gpvOi, g.sales), gpOiLast: ratioOf(gpvOiLast, g.salesLast),
        gpvOi, gpvOiLast,
      };
    });
  };
  const rows = fromDetail
    ? sortHeads(headRowsFromDetail(rowsFor(headSelKey, crpSel, catSel)), hsort)
    : sortHeads(headSelKey ? baseHeads.filter((h) => headKeyOf(h) === headSelKey) : baseHeads, hsort);
  // footfall and basket stay in the table; a dash where they cannot be counted exactly for the CRP or category chosen
  const shownWide = WIDE;
  const sum = (f: (r: HeadRow) => number | null | undefined) => rows.reduce((t, r) => t + (f(r) ?? 0), 0);
  // all stores and same stores take their totals from the day-wise file, which covers every head, so the figures here
  // match the Day wise sales tab; the other store groups add up the heads
  // with a filter on, the totals add up the filtered rows instead of the whole day-wise total
  const dayTotal = cmp === "sply" && (seg === "all" || seg === "same") && !filtered ? daily.groups[seg].total : null;
  const dsum = (a: (number | null)[]) => a.reduce<number>((t, v) => t + (v ?? 0), 0);
  const headsSales = sum((r) => r.sales);
  const S = dayTotal ? dsum(dayTotal.sales) : headsSales, L = dayTotal ? dsum(dayTotal.splySales) : sum((r) => r.salesLast);
  const G = dayTotal ? dsum(dayTotal.gpv) : sum((r) => r.gpv), GL = dayTotal ? dsum(dayTotal.splyGpv) : sum((r) => r.gpvLast);
  const GO = dayTotal ? G + dsum(dayTotal.valueAdj) : sum((r) => r.gpvOi);
  const GOL = dayTotal ? GL + dsum(dayTotal.splyValueAdj) : sum((r) => r.gpvOiLast);
  const FF = dayTotal ? dsum(dayTotal.ff) : sum((r) => r.ff), FFL = dayTotal ? dsum(dayTotal.splyFf) : sum((r) => r.ffLast);
  const companyTotal = dayTotal ? S : report[cmp].segments[seg]?.total?.sales ?? null;
  const gp = ratioOf(G, S), gpL = ratioOf(GL, L), goi = ratioOf(GO, S), goiL = ratioOf(GOL, L);
  const grS = L ? S / L - 1 : null, grG = GL ? G / GL - 1 : null, grGO = GOL ? GO / GOL - 1 : null;
  const ppOf = (a: number | null, b: number | null) => (a != null && b != null ? a - b : null);

  const kpi = [
    { label: dayTotal ? "Sales" : `Sales · ${rows.length} ${rows.length === 1 ? "head" : "heads"}`, value: crFmt(S), sply: `${s}: ${crFmt(L)}`, delta: `${crSigned(S - L)}   ${arrowOf(toneOfNum(grS))}${signedPct(grS, 2)}`, t: toneOfNum(grS) },
    { label: "GP%", value: pct(gp, 2), sply: `${s}: ${pct(gpL, 2)}`, delta: signedPct(ppOf(gp, gpL), 2), t: toneOfNum(ppOf(gp, gpL)) },
    { label: "GPV", value: crFmt(G), sply: `${s}: ${crFmt(GL)}`, delta: `${crSigned(G - GL)}   ${arrowOf(toneOfNum(grG))}${signedPct(grG, 2)}`, t: toneOfNum(grG) },
    { label: "GP+OI%", value: pct(goi, 2), sply: `${s}: ${pct(goiL, 2)}`, delta: signedPct(ppOf(goi, goiL), 2), t: toneOfNum(ppOf(goi, goiL)) },
    { label: "GPV+OI", value: crFmt(GO), sply: `${s}: ${crFmt(GOL)}`, delta: `${crSigned(GO - GOL)}   ${arrowOf(toneOfNum(grGO))}${signedPct(grGO, 2)}`, t: toneOfNum(grGO) },
  ];

  const money = (v: number) => Math.round(v).toLocaleString("en-US");
  const fmtMoney = (v: number) => money(v);
  const gFrom = (n: number | null | undefined, l: number | null | undefined) => {
    const g = n && l ? n / l - 1 : null;
    return { change: signedPct(g, 2), t: toneOfNum(g) };
  };
  const pFrom = (n: number | null | undefined, l: number | null | undefined) => {
    const d = n != null && l != null ? n - l : null;
    return { change: signedPct(d, 2), t: toneOfNum(d) };
  };

  // the totals row: the day-wise totals for all stores and same stores, otherwise the sum of the heads
  const wideTotals: Partial<HeadRow> = {
    sales: S, salesLast: L, ff: FF, ffLast: FFL, bs: S / (FF || 1), bsLast: L / (FFL || 1),
    gp, gpLast: gpL, gpv: G, gpvLast: GL, gpOi: goi, gpOiLast: goiL, gpvOi: GO, gpvOiLast: GOL,
  };
  const exportHeads = () => {
    const exportMeasures = (r: Partial<HeadRow>): ExportCell[] => shownWide.flatMap((m) => {
      const n = m.now(r) ?? null, l = m.last(r) ?? null;
      const d = n != null && l != null ? n - l : null;
      return m.growth ? [n, l, d, growthOf(n, l)] : [n, l, d];
    });
    const cols: ExportCol[] = [
      { header: "Division", format: "text" }, { header: "Category role", format: "text" }, { header: "Head", format: "text" },
      ...shownWide.flatMap((m): ExportCol[] => {
        const f: ExportCol["format"] = m.kind === "money" ? "money" : m.kind === "count" ? "int" : "pct";
        const cs: ExportCol[] = [{ header: `${m.label} this`, format: f }, { header: `${m.label} ${s}`, format: f }, { header: `${m.label} diff`, format: f }];
        return m.growth ? [...cs, { header: `${m.label} GR%`, format: "pct" }] : cs;
      }),
    ];
    const body: ExportCell[][] = [
      ...rows.map((r) => [r.division, roleName(r.role), r.head, ...exportMeasures(r)]),
      [dayTotal ? "Total (all category heads)" : "Total (" + rows.length + " heads)", "", "", ...exportMeasures(wideTotals)],
    ];
    downloadExcel(`category-heads-${s === "SPLY" ? "sply" : "splm"}.xlsx`, "Category heads", cols, body);
  };

  return (
    <div className="ov">
      <div className="drill-filters">
        <label>Store group
          <select value={seg} onChange={(e) => setSeg(e.target.value as SegmentKey)} aria-label="Store group">
            {keys.map((k) => <option key={k} value={k}>{SEGMENT_LABELS[k]}</option>)}
          </select>
        </label>
      </div>

      <section className="ov-kpis five" aria-label="Category heads key figures">
        {kpi.map((k) => (
          <div className="ov-kpi" key={k.label}>
            <div className="ov-kpi-label">{k.label}</div>
            <div className="ov-kpi-value">{k.value}</div>
            <div className="ov-kpi-cmp">{k.sply}</div>
            <div className="ov-kpi-delta"><span className={`ov-chg ${k.t}`}>{k.delta}</span></div>
          </div>
        ))}
      </section>
      {cmp === "sply" && (
        <p className="ov-note">
          {seg === "all" || seg === "same"
            ? `This month and SPLY for this store group come from the day-wise file (Day wise Sales GP Trend.xlsx, ${daily.periodLabel}), so the figures match the Day wise sales tab.`
            : "This store group comes from the Business Performance Report; the day-wise file covers all stores and same stores only."}
        </p>
      )}
      {companyTotal != null && !filtered && (
        <p className="ov-note">Heads total {crOrDash(headsSales)} of the company total {crOrDash(companyTotal)}; the rest is outside category heads (for example Restaurant).</p>
      )}

      <div className="ov-section-head"><h2>Head detail</h2></div>
      <div className="drill-filters day-filters">
        <label>Head
          <select value={headSelKey} onChange={(e) => { setHHead(e.target.value); setHCrp(""); setHCat(""); }} aria-label="Head">
            <option value="">All heads</option>
            {baseHeads.map((h) => <option key={headKeyOf(h)} value={headKeyOf(h)}>{h.head} · {titleCase(h.division)}</option>)}
          </select>
        </label>
        <label>CRP
          <select value={crpSel} onChange={(e) => setHCrp(e.target.value)} aria-label="CRP" disabled={!canDetail}>
            <option value="">{canDetail ? "All CRPs" : "Not on this view"}</option>
            {crpOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Category
          <select value={catSel} onChange={(e) => setHCat(e.target.value)} aria-label="Category" disabled={!canDetail}>
            <option value="">{canDetail ? "All categories" : "Not on this view"}</option>
            {catOptions.map((c) => <option key={c} value={c}>{c === "0" ? "(not set)" : titleCase(c)}</option>)}
          </select>
        </label>
        {filtered && (
          <button type="button" className="exportbtn" onClick={() => { setHHead(""); setHCrp(""); setHCat(""); }}>Clear filters</button>
        )}
      </div>
      <div className="xbar"><ExportButton onClick={exportHeads} /></div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table dh">
            <caption>
              Category heads vs {s}. Click a head to see its responsible persons and categories. Click a heading to sort.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="l dh-c1" title="Division">Div</th>
                <th scope="col" className="l dh-c2" title="Category role">Role</th>
                <SortTh k="name" label="Head" sort={hsort} onSort={onHeadSort} cls="l dh-c3" />
                {shownWide.map((m) => (
                  <Fragment key={m.label}>
                    {m.sortKey
                      ? <SortTh k={m.sortKey} label={`${m.label} this`} sort={hsort} onSort={onHeadSort} />
                      : <th scope="col">{m.label} this</th>}
                    <th scope="col">{m.label} {s}</th>
                    <th scope="col">Diff</th>
                    {m.growth && <th scope="col">GR%</th>}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.division + r.head}>
                  <td className="l dh-c1" title={r.division}>{abbrOf(r.division)}</td>
                  <td className="l dh-c2">{r.role}</td>
                  <th scope="row" className="l dh-c3">
                    <button className="linkish" onClick={() => setDrill(r)}>{r.head} ›</button>
                  </th>
                  {shownWide.map((m) => <WideCells key={m.label} m={m} r={r} />)}
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3} className="l dh-foot">
                    {dayTotal ? "Total (all category heads)" : `Total (${rows.length} ${rows.length === 1 ? "head" : "heads"})`}
                  </th>
                  {shownWide.map((m) => <WideCells key={m.label} m={m} r={wideTotals} />)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="ov-section-head"><h2>Sales performance</h2></div>
      <HeadChart title="Sales by category head" sub={`value and growth vs ${s}`} sLabel={s}
        items={rows.map((r) => growthItem(r, r.sales, r.salesLast, "crore"))} />

      <div className="ov-section-head"><h2>GPV and GPV+OI performance</h2></div>
      <div className="ov-grid-66">
        <HeadChart title="GPV" sub={`growth vs ${s}`} sLabel={s}
          items={rows.map((r) => growthItem(r, r.gpv, r.gpvLast, "crore"))} />
        <HeadChart title="GPV+OI" sub={`growth vs ${s}`} sLabel={s}
          items={rows.map((r) => growthItem(r, r.gpvOi, r.gpvOiLast, "crore"))} />
        <HeadChart title="GP%" sub={`change vs ${s} (%)`} sLabel={s}
          items={rows.map((r) => pointItem(r, r.gp, r.gpLast))} />
        <HeadChart title="GP+OI%" sub={`change vs ${s} (%)`} sLabel={s}
          items={rows.map((r) => pointItem(r, r.gpOi, r.gpOiLast))} />
      </div>

      <div className="ov-section-head"><h2>Traffic and basket</h2></div>
      <div className="ov-grid-66">
        <HeadChart title="Footfall (FF)" sub={`invoices, growth vs ${s}`} sLabel={s}
          items={rows.map((r) => growthItem(r, r.ff, r.ffLast, "full"))} />
        <HeadChart title="Basket size" sub={`sales per invoice, growth vs ${s}`} sLabel={s}
          items={rows.map((r) => growthItem(r, r.bs, r.bsLast, "full"))} />
      </div>

      {rows.length === 0 && <p className="hint">No category heads for this store group.</p>}
    </div>
  );
}

/** A sum of day values; blank when no day has a value. */
const sumNull = (v: (number | null)[] | undefined): number | null =>
  (v && v.some((x) => x != null) ? v.reduce<number>((t, x) => t + (x ?? 0), 0) : null);

/** The Cat 3 rows of one head for the drill-down, from the day-wise detail: the month to date, for all stores and for
 *  same stores, against last year or last month. Last month has no monthly Cat 3 figures, so it is built from here. */
function cat3FromDetail(detail: DailyDetailData | null, cmp: Cmp, head: HeadRow, seg: SegmentKey): Cat3Row[] {
  const fam = familyOf(seg);
  if (!detail || !fam) return [];
  const all = (cmp === "sply" ? detail.groups : detail.splmGroups)[fam.all];
  const same = (cmp === "sply" ? detail.groups : detail.splmGroups)[fam.same];
  const sum = (v: (number | null)[]) => v.reduce<number>((t, x) => t + (x ?? 0), 0);
  const isHead = (r: DetailRow) => r.division === head.division && r.head === head.head && r.crp != null && r.category != null;
  const out = new Map<string, Cat3Row>();
  const rowFor = (r: DetailRow): Cat3Row => {
    const key = `${r.crp}\u001f${r.category}`;
    let c = out.get(key);
    if (!c) {
      c = {
        division: r.division, cat1: "", cat3: r.category ?? "", crp: r.crp ?? "", head: r.head ?? "",
        sales: 0, salesLy: 0, sameSales: 0, sameSalesLy: 0, gp: null, gpLy: null, ff: null, ffLy: null, sameFf: null, sameFfLy: null,
        gpv: 0, gpvLy: 0, gpvOi: 0, gpvOiLy: 0, sameGpv: 0, sameGpvLy: 0, sameGpvOi: 0, sameGpvOiLy: 0,
      };
      out.set(key, c);
    }
    return c;
  };
  for (const r of all.filter(isHead)) {
    Object.assign(rowFor(r), {
      sales: sum(r.sales), salesLy: sum(r.splySales),
      gpv: sum(r.gpv), gpvLy: sum(r.splyGpv),
      gpvOi: sum(r.gpv) + sum(r.valueAdj), gpvOiLy: sum(r.splyGpv) + sum(r.splyValueAdj),
      ff: sumNull(r.ff), ffLy: sumNull(r.splyFf),
    });
  }
  for (const r of same.filter(isHead)) {
    Object.assign(rowFor(r), {
      sameSales: sum(r.sales), sameSalesLy: sum(r.splySales),
      sameGpv: sum(r.gpv), sameGpvLy: sum(r.splyGpv),
      sameGpvOi: sum(r.gpv) + sum(r.valueAdj), sameGpvOiLy: sum(r.splyGpv) + sum(r.splyValueAdj),
      sameFf: sumNull(r.ff), sameFfLy: sumNull(r.splyFf),
    });
  }
  return [...out.values()];
}

/* ------------------------------------------------------------------ head drill-down: Cat 3 by responsible person */

const fm = (v: number) => Math.round(v).toLocaleString("en-US");

type Level = "all" | "same";
type Agg = { s: number; sl: number; gpv: number; gpvl: number; goi: number; goil: number };
type SortKey = "name" | "sales" | "gp" | "gpv" | "goi" | "gpvoi";
type Sort = { key: SortKey; dir: "asc" | "desc" };

/** Sum of Cat 3 rows at the chosen store level (all stores or same stores). */
function aggregate(rs: Cat3Row[], level: Level): Agg {
  const t: Agg = { s: 0, sl: 0, gpv: 0, gpvl: 0, goi: 0, goil: 0 };
  for (const r of rs) {
    if (level === "all") {
      t.s += r.sales ?? 0; t.sl += r.salesLy ?? 0;
      t.gpv += r.gpv ?? 0; t.gpvl += r.gpvLy ?? 0;
      t.goi += r.gpvOi ?? 0; t.goil += r.gpvOiLy ?? 0;
    } else {
      t.s += r.sameSales ?? 0; t.sl += r.sameSalesLy ?? 0;
      t.gpv += r.sameGpv ?? 0; t.gpvl += r.sameGpvLy ?? 0;
      t.goi += r.sameGpvOi ?? 0; t.goil += r.sameGpvOiLy ?? 0;
    }
  }
  return t;
}

/** Rows that have any sales at the chosen level (zero rows are hidden). */
function hasSales(r: Cat3Row, level: Level): boolean {
  return level === "all" ? !!(r.sales || r.salesLy) : !!(r.sameSales || r.sameSalesLy);
}

const toneOf = (v: number): "up" | "down" | "flat" => (Math.abs(v) < 0.00005 ? "flat" : v > 0 ? "up" : "down");

/** Growth of a money value; blank where last year has no sales. */
function Growth({ now, last }: { now: number; last: number }) {
  if (!now || !last) return null;
  const g = now / last - 1;
  const t = toneOf(g);
  return <span className={`delta ${t}`}>{t === "up" ? "▲ " : t === "down" ? "▼ " : ""}{signedPct(g, 2)}</span>;
}

/** Change in percentage points, shown with a %; blank where a value is missing. */
function PointChange({ now, last }: { now: number | null; last: number | null }) {
  if (now == null || last == null) return null;
  const d = now - last;
  const t = toneOf(d);
  return <span className={`delta ${t}`}>{t === "up" ? "▲ " : t === "down" ? "▼ " : ""}{signedPct(d, 2)}</span>;
}

/** The drill's measure cells: the five money and ratio figures, then footfall and basket (sales per bill, in taka). */
function MetricCells({ a, ff }: { a: Agg; ff: [number | null, number | null] }) {
  const gp = a.s ? a.gpv / a.s : null;
  const gpl = a.sl ? a.gpvl / a.sl : null;
  const goi = a.s ? a.goi / a.s : null;
  const goil = a.sl ? a.goil / a.sl : null;
  const [f, fl] = ff;
  const bs = f ? a.s / f : null;
  const bsl = fl ? a.sl / fl : null;
  return (
    <>
      <td><div>{crFmt(a.s)}</div><div><Growth now={a.s} last={a.sl} /></div></td>
      <td><div>{crFmt(a.gpv)}</div><div><Growth now={a.gpv} last={a.gpvl} /></div></td>
      <td><div>{pct(gp, 2)}</div><div><PointChange now={gp} last={gpl} /></div></td>
      <td><div>{crFmt(a.goi)}</div><div><Growth now={a.goi} last={a.goil} /></div></td>
      <td><div>{pct(goi, 2)}</div><div><PointChange now={goi} last={goil} /></div></td>
      <td><div>{f == null ? "–" : fm(f)}</div><div><Growth now={f ?? 0} last={fl ?? 0} /></div></td>
      <td><div>{bs == null ? "–" : fm(bs)}</div><div><Growth now={bs ?? 0} last={bsl ?? 0} /></div></td>
    </>
  );
}

/** Sort key value for a group or a row (name sorts alphabetically, handled separately). */
function sortValue(a: Agg, key: SortKey): number {
  if (key === "sales") return a.s;
  if (key === "gpv") return a.gpv;
  if (key === "gp") return a.s ? a.gpv / a.s : 0;
  if (key === "gpvoi") return a.goi;
  if (key === "goi") return a.s ? a.goi / a.s : 0;
  return 0;
}

function sortCompare(x: { name: string; a: Agg }, y: { name: string; a: Agg }, sort: Sort): number {
  const m = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "name") return x.name.localeCompare(y.name) * m;
  return (sortValue(x.a, sort.key) - sortValue(y.a, sort.key)) * m;
}

function HeadDrill({ head, headSame, cat, seg, cmp, onCmp, onBack, personAll, personSame, headlessAll, headlessSame }: {
  head: HeadRow; headSame: HeadRow | undefined; cat: Cat3Row[]; seg: SegmentKey; cmp: Cmp; onCmp: (c: Cmp) => void; onBack: () => void;
  /** Footfall of each person under the head, for all stores and for same stores (exact per person). */
  personAll: CrpFf[]; personSame: CrpFf[];
  /** Bills with no CRP, per category, for all stores and for same stores: [this period, last year]. */
  headlessAll: Map<string, [number, number]>; headlessSame: Map<string, [number, number]>;
}) {
  const s = CMP_LABEL[cmp].short;
  // the segment's own name and its same-store version, for the subtitle and the starting level
  const baseSeg: SegmentKey = seg.startsWith("own") ? "own" : seg.startsWith("franchise") ? "franchise" : "all";
  const sameSeg: SegmentKey = baseSeg === "all" ? "same" : baseSeg === "own" ? "ownSame" : "franchiseSame";
  const [level, setLevel] = useState<Level>(seg === "same" || seg === "ownSame" || seg === "franchiseSame" ? "same" : "all");
  const [crp, setCrp] = useState("");
  const [catName, setCatName] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "sales", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const rows = useMemo(() => cat.filter((r) => r.division === head.division && r.head === head.head), [cat, head]);
  const levelRows = useMemo(() => rows.filter((r) => hasSales(r, level)), [rows, level]);
  const sales = (r: Cat3Row) => (level === "all" ? r.sales ?? 0 : r.sameSales ?? 0);
  const persons = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of levelRows) m.set(r.crp, (m.get(r.crp) ?? 0) + sales(r));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [levelRows, level]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(
    () => [...new Set(levelRows.filter((r) => !crp || r.crp === crp).map((r) => r.cat3))].sort(),
    [levelRows, crp]
  );
  const filtered = levelRows.filter((r) => (!crp || r.crp === crp) && (!catName || r.cat3 === catName));
  // footfall (distinct bills): exact for a person, for a category under one person, and for the head total. A category
  // sold by several persons, or a category with rows that have no CRP, is left blank, as on Day wise sales.
  const headless = level === "all" ? headlessAll : headlessSame;
  const ffAt = (r: Cat3Row): [number | null, number | null] => (level === "all"
    ? [r.ff ?? null, r.ffLy ?? null] : [r.sameFf ?? null, r.sameFfLy ?? null]);
  const sumPair = (pairs: [number | null, number | null][]): [number | null, number | null] => [
    sumNull(pairs.map((p) => p[0])), sumNull(pairs.map((p) => p[1])),
  ];
  const personFfOf = (name: string): [number | null, number | null] => {
    const p = (level === "all" ? personAll : personSame).find((x) => x.crp === name);
    return p ? [sumNull(p.ff), sumNull(p.splyFf)] : [null, null];
  };
  // a person: their own footfall, or with a category chosen, the footfall of that category's row
  const groupFfOf = (name: string, rs: Cat3Row[]): [number | null, number | null] => (catName ? sumPair(rs.map(ffAt)) : personFfOf(name));
  // the total: the chosen person's footfall, or the head's own footfall when no person is chosen
  const totalFfOf = (): [number | null, number | null] => {
    if (crp) return catName ? sumPair(filtered.map(ffAt)) : personFfOf(crp);
    if (catName) {
      const people = new Set(filtered.map((r) => r.crp));
      const seller = filtered.reduce<[number, number]>((t, r) => [t[0] + (ffAt(r)[0] ?? 0), t[1] + (ffAt(r)[1] ?? 0)], [0, 0]);
      return people.size === 1 && headlessWithin(seller, headless.get(catName) ?? [0, 0])
        ? sumPair(filtered.map(ffAt)) : [null, null];
    }
    return level === "all" ? [head.ff ?? null, head.ffLast ?? null] : [headSame?.ff ?? null, headSame?.ffLast ?? null];
  };
  const groups = persons
    .filter((p) => !crp || p === crp)
    .map((p) => {
      const own = filtered.filter((r) => r.crp === p);
      const rs = own.map((r) => ({ name: r.cat3, a: aggregate([r], level), r, ff: ffAt(r) }));
      return { name: p, rs, a: aggregate(own, level), ff: groupFfOf(p, own) };
    })
    .filter((g) => g.rs.length > 0)
    .sort((x, y) => sortCompare({ name: x.name, a: x.a }, { name: y.name, a: y.a }, sort))
    .map((g) => ({ ...g, rs: [...g.rs].sort((x, y) => sortCompare(x, y, sort)) }));

  const total = aggregate(filtered, level);
  const totalFf = totalFfOf();
  const all = aggregate(levelRows, level);
  const reference = level === "all" ? head.sales ?? 0 : headSame?.sales ?? null;
  const gap = reference == null ? 0 : all.s - reference;
  const nm = (v: string) => titleCase(v);

  const toggle = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  };
  const Th = ({ k, label, cls }: { k: SortKey; label: string; cls?: string }) => (
    <th scope="col" className={cls} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button className="sortbtn" onClick={() => toggle(k)}>
        {label}{sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  const exportDrill = () => {
    const metricCols: ExportCol[] = [
      { header: "Sales", format: "money" }, { header: `Sales ${s}`, format: "money" }, { header: "Sales growth", format: "pct" },
      { header: "GPV", format: "money" }, { header: `GPV ${s}`, format: "money" }, { header: "GPV growth", format: "pct" },
      { header: "GP%", format: "pct" }, { header: `GP% ${s}`, format: "pct" }, { header: "GP% change", format: "pct" },
      { header: "GPV+OI", format: "money" }, { header: `GPV+OI ${s}`, format: "money" }, { header: "GPV+OI growth", format: "pct" },
      { header: "GP+OI%", format: "pct" }, { header: `GP+OI% ${s}`, format: "pct" }, { header: "GP+OI% change", format: "pct" },
    ];
    const cols: ExportCol[] = [
      { header: "Responsible person", format: "text" }, { header: "Category (Cat 3)", format: "text" },
      { header: "Category group (Cat 1)", format: "text" }, ...metricCols,
    ];
    // growth as on screen: blank where last year has no sales
    const values = (a: Agg): ExportCell[] => {
      const gp = a.s ? a.gpv / a.s : null, gpl = a.sl ? a.gpvl / a.sl : null;
      const goi = a.s ? a.goi / a.s : null, goil = a.sl ? a.goil / a.sl : null;
      const gate = (n: number, l: number): number | null => (n && l ? n / l - 1 : null);
      const point = (n: number | null, l: number | null): number | null => (n == null || l == null ? null : n - l);
      return [
        a.s, a.sl, gate(a.s, a.sl),
        a.gpv, a.gpvl, gate(a.gpv, a.gpvl),
        gp, gpl, point(gp, gpl),
        a.goi, a.goil, gate(a.goi, a.goil),
        goi, goil, point(goi, goil),
      ];
    };
    const body: ExportCell[][] = [];
    for (const g of groups) {
      body.push([g.name, "", "", ...values(g.a)]);
      for (const x of g.rs) body.push([g.name, nm(x.r.cat3), nm(x.r.cat1), ...values(x.a)]);
    }
    body.push(["Total", "", "", ...values(total)]);
    const safe = head.head.replace(/[^A-Za-z0-9]+/g, "-");
    downloadExcel(`head-${safe}-${level}.xlsx`, "Responsible persons", cols, body);
  };

  if (!familyOf(seg)) {
    return (
      <div className="card">
        <button className="linkish" onClick={onBack}>← Back to all heads</button>
        <p className="hint" style={{ marginTop: 12 }}>Responsible person detail is not available for this store group. Choose another Store group.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <button className="linkish" onClick={onBack}>← Back to all heads</button>
          <h2 style={{ marginTop: 8 }}>{head.head}</h2>
          <p className="hint">{nm(head.division)} · {head.role} · responsible persons and categories (Cat 3) · {s} · {SEGMENT_LABELS[level === "all" ? baseSeg : sameSeg]}</p>
        </div>
      </div>
      <div className="xbar"><ExportButton onClick={exportDrill} /></div>
      <div className="drill-filters">
        <div className="seg" role="group" aria-label="Comparison period">
          {(["sply", "splm"] as Cmp[]).map((c) => (
            <button key={c} aria-pressed={cmp === c} onClick={() => onCmp(c)} title={CMP_LABEL[c].long}>vs {CMP_LABEL[c].short}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Store level">
          <button aria-pressed={level === "all"} onClick={() => { setLevel("all"); setCrp(""); setCatName(""); setOpen(new Set()); setSort({ key: "sales", dir: "desc" }); }}>{SEGMENT_LABELS[baseSeg]}</button>
          <button aria-pressed={level === "same"} onClick={() => { setLevel("same"); setCrp(""); setCatName(""); setOpen(new Set()); setSort({ key: "sales", dir: "desc" }); }}>{SEGMENT_LABELS[sameSeg]}</button>
        </div>
        <button className="linkish" onClick={() => setOpen(groups.length > 0 && groups.every((g) => open.has(g.name)) ? new Set() : new Set(groups.map((g) => g.name)))}>
          {groups.length > 0 && groups.every((g) => open.has(g.name)) ? "Collapse all" : "Expand all"}
        </button>
        <label>Responsible person
          <select value={crp} onChange={(e) => { setCrp(e.target.value); setCatName(""); }}>
            <option value="">All persons</option>
            {persons.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label>Category (Cat 3)
          <select value={catName} onChange={(e) => setCatName(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c} value={c}>{nm(c)}</option>)}
          </select>
        </label>
        {(crp || catName) && <button className="linkish" onClick={() => { setCrp(""); setCatName(""); }}>Clear filters</button>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <Th k="name" label="Category (Cat 3)" cls="l" />
              <Th k="sales" label="Sales" />
              <Th k="gpv" label="GPV" />
              <Th k="gp" label="GP%" />
              <Th k="gpvoi" label="GPV+OI" />
              <Th k="goi" label="GP+OI%" />
              <th scope="col">Footfall</th>
              <th scope="col">Basket</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const isOpen = open.has(g.name);
              return (
                <Fragment key={g.name}>
                  <tr className="drill-group">
                    <td className="l">
                      <button
                        className="plusbtn"
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? "Hide" : "Show"} categories of ${g.name}`}
                        onClick={() => setOpen((o) => { const n2 = new Set(o); if (n2.has(g.name)) n2.delete(g.name); else n2.add(g.name); return n2; })}
                      >
                        {isOpen ? "−" : "+"}
                      </button>
                      <b>{g.name}</b><div className="sub">{g.rs.length} categor{g.rs.length === 1 ? "y" : "ies"}</div>
                    </td>
                    <MetricCells a={g.a} ff={g.ff} />
                  </tr>
                  {isOpen && g.rs.map((x, i) => (
                    <tr key={g.name + i}>
                      <td className="l"><div>{nm(x.r.cat3)}</div>{x.r.cat1 && <div className="sub">{nm(x.r.cat1)}</div>}</td>
                      <MetricCells a={x.a} ff={x.ff} />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td className="l">Total ({groups.length} persons, {filtered.length} categories)</td>
                <MetricCells a={total} ff={totalFf} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length === 0 && <p className="hint">No categories match these filters.</p>}
      {Math.abs(gap) >= 1 && (
        <p className="hint">Category rows add up to {crFmt(all.s)}; the head row shows {crFmt(reference ?? 0)} (difference {crFmt(gap)}). The difference is in the source workbook.</p>
      )}
      <p className="hint">Click a column heading to sort. Click + to show a person's categories. Rows with no sales at this level are hidden.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ outlets */

const BANDS = [
  { key: "hit", label: "At or above target", test: (a: number) => a >= 1, color: "var(--good)", icon: "✓" },
  { key: "near", label: "90–100% of target", test: (a: number) => a >= 0.9 && a < 1, color: "var(--warn)", icon: "!" },
  { key: "below", label: "Below 90% of target", test: (a: number) => a < 0.9, color: "var(--crit)", icon: "✕" },
] as const;

function achOf(o: Outlet) {
  return o.target ? (o.achv ?? 0) / o.target : null;
}
function band(a: number | null) {
  return a == null ? null : BANDS.find((b) => b.test(a)) ?? null;
}

function AchCell({ a }: { a: number | null }) {
  const b = band(a);
  return (
    <div className="bar-cell">
      <span>{pct(a)}</span>
      <span className="track" aria-hidden>
        <span className="fill" style={{ width: `${Math.min(100, (a ?? 0) * 100)}%`, background: b?.color ?? "var(--last)" }} />
      </span>
    </div>
  );
}

function StatusPill({ a }: { a: number | null }) {
  const b = band(a);
  if (!b) return <span className="delta flat">–</span>;
  return (
    <span className="pill" title={b.label}>
      <span className="dot" style={{ background: b.color }} />
      {b.icon} {b.key === "hit" ? "On target" : b.key === "near" ? "Close" : "Behind"}
    </span>
  );
}

function rollup(outlets: Outlet[], by: "leader" | "zonal") {
  const m = new Map<string, { name: string; n: number; target: number; achv: number; hit: number }>();
  for (const o of outlets) {
    const k = o[by] || "—";
    const r = m.get(k) ?? { name: k, n: 0, target: 0, achv: 0, hit: 0 };
    r.n++;
    r.target += o.target ?? 0;
    r.achv += o.achv ?? 0;
    if ((achOf(o) ?? 0) >= 1) r.hit++;
    m.set(k, r);
  }
  return [...m.values()].map((r) => ({ ...r, ach: r.target ? r.achv / r.target : null }));
}

function LeaderSummary({ outlets }: { outlets: Outlet[] }) {
  const [by, setBy] = useState<"leader" | "zonal">("leader");
  const rows = useMemo(() => rollup(outlets, by), [outlets, by]);
  const { sorted, th } = useSort(rows, {
    name: (r) => r.name, n: (r) => r.n, target: (r) => r.target, achv: (r) => r.achv, ach: (r) => r.ach, hit: (r) => r.hit,
  }, { key: "ach", dir: -1 });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Target achievement by {by === "leader" ? "leader" : "zonal manager"}</h2>
          <p className="hint">Operations target, month to date. Click a column to sort.</p>
        </div>
        <div className="seg" role="group" aria-label="Group by">
          <button aria-pressed={by === "leader"} onClick={() => setBy("leader")}>Leader</button>
          <button aria-pressed={by === "zonal"} onClick={() => setBy("zonal")}>Zonal</button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th("name", by === "leader" ? "Leader" : "Zonal")}
              {th("n", "Outlets")}
              {th("target", "Target")}
              {th("achv", "Achieved")}
              {th("ach", "Achievement")}
              {th("hit", "On target")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{r.n}</td>
                <td>{crOrDash(r.target)}</td>
                <td>{crOrDash(r.achv)}</td>
                <td><AchCell a={r.ach} /></td>
                <td>{r.hit} / {r.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Outlets({ outlets, cmp }: { outlets: Outlet[]; cmp: Cmp }) {
  const s = CMP_LABEL[cmp].short;
  const [q, setQ] = useState("");
  const [leader, setLeader] = useState("");
  const [zonal, setZonal] = useState("");
  const [bandKey, setBandKey] = useState("");
  const [limit, setLimit] = useState(100);

  const leaders = useMemo(() => [...new Set(outlets.map((o) => o.leader).filter(Boolean))].sort(), [outlets]);
  const zonals = useMemo(() => [...new Set(outlets.map((o) => o.zonal).filter(Boolean))].sort(), [outlets]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return outlets.filter((o) =>
      (!needle || `${o.code} ${o.name}`.toLowerCase().includes(needle)) &&
      (!leader || o.leader === leader) &&
      (!zonal || o.zonal === zonal) &&
      (!bandKey || band(achOf(o))?.key === bandKey));
  }, [outlets, q, leader, zonal, bandKey]);

  const salesG = (o: Outlet) => (cmp === "sply" ? growth(o.salesTy, o.salesLy) : growth(o.salesTm, o.salesLm));
  const ffLast = (o: Outlet) => (cmp === "sply" ? o.ffLy : o.ffLm);
  const { sorted, th } = useSort(filtered, {
    name: (o) => o.code, leader: (o) => o.leader, zonal: (o) => o.zonal,
    target: (o) => o.target, achv: (o) => o.achv, ach: (o) => achOf(o),
    g: (o) => salesG(o), ff: (o) => o.ff, ffg: (o) => growth(o.ff, ffLast(o)), gp: (o) => o.gp,
  }, { key: "ach", dir: 1 });

  const counts = BANDS.map((b) => ({ ...b, n: outlets.filter((o) => band(achOf(o))?.key === b.key).length }));

  return (
    <>
      <div className="dist">
        {counts.map((b) => (
          <button
            key={b.key}
            className="box"
            style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit", outline: bandKey === b.key ? "2px solid var(--this)" : undefined }}
            onClick={() => setBandKey(bandKey === b.key ? "" : b.key)}
            aria-pressed={bandKey === b.key}
          >
            <div className="n">{b.n}</div>
            <div className="t"><span className="pill"><span className="dot" style={{ background: b.color }} />{b.icon}</span>{b.label}</div>
          </button>
        ))}
      </div>

      <div className="card">
        <h2>Outlets</h2>
        <p className="hint">
          Target vs achievement (month to date). Growth compares same-day sales with the {CMP_LABEL[cmp].long}; outlets that did not trade then show “–”.
        </p>
        <div className="toolbar">
          <input type="search" placeholder="Search code or outlet name" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={leader} onChange={(e) => setLeader(e.target.value)} aria-label="Leader">
            <option value="">All leaders</option>
            {leaders.map((l) => <option key={l}>{l}</option>)}
          </select>
          <select value={zonal} onChange={(e) => setZonal(e.target.value)} aria-label="Zonal">
            <option value="">All zonals</option>
            {zonals.map((l) => <option key={l}>{l}</option>)}
          </select>
          <span className="count">{filtered.length} of {outlets.length} outlets</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {th("name", "Outlet")}
                {th("leader", "Leader", "l")}
                {th("zonal", "Zonal", "l")}
                {th("target", "Target")}
                {th("achv", "Achieved")}
                {th("ach", "Achievement")}
                <th>Status</th>
                {th("g", `Growth vs ${s}`)}
                {th("ff", "Footfall")}
                {th("ffg", `FF vs ${s}`)}
                {th("gp", "GP %")}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((o) => (
                <tr key={o.code}>
                  <td className="name" title={o.name}><span className="code">{o.code}</span>{o.name}</td>
                  <td className="l">{o.leader}</td>
                  <td className="l">{o.zonal}</td>
                  <td>{crOrDash(o.target)}</td>
                  <td>{crOrDash(o.achv)}</td>
                  <td><AchCell a={achOf(o)} /></td>
                  <td><StatusPill a={achOf(o)} /></td>
                  <td><Delta v={salesG(o)} /></td>
                  <td>{int(o.ff)}</td>
                  <td><Delta v={growth(o.ff, ffLast(o))} /></td>
                  <td>{pct(o.gp, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > limit && (
          <div className="more">
            <button onClick={() => setLimit(limit + 200)}>Show more ({sorted.length - limit} left)</button>
          </div>
        )}
      </div>
    </>
  );
}

