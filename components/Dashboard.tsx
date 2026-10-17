"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Cat3Row, HeadRow, Metrics, MonthOverview, Outlet, Report, SegmentKey } from "@/lib/types";
import { diff, growth, int, longDate, monthName, pct, pp, signedPct, taka, titleCase } from "@/lib/format";
import { DivergingBars, type TipRow } from "./charts";
import FilterBar, { CMP_LABEL, SEGMENT_LABELS, type Cmp } from "./FilterBar";
import Overview from "./Overview";

type Tab = "overview" | "divisions" | "heads" | "outlets" | "categories";

export default function Dashboard({ report, months }: { report: Report; months: MonthOverview[] }) {
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
              : <>Till {longDate(report.asOf)} · {report.periodLabel} · compared with the {CMP_LABEL[cmp].long}</>}
          </div>
        </div>
        {tab !== "overview" && <div className="controls">
          <div className="seg" role="group" aria-label="Comparison period">
            {(["sply", "splm"] as Cmp[]).map((c) => (
              <button key={c} aria-pressed={cmp === c} onClick={() => setCmp(c)} title={CMP_LABEL[c].long}>
                vs {CMP_LABEL[c].short}
              </button>
            ))}
          </div>
          {tab === "divisions" && (
            <select value={segment} onChange={(e) => setSegment(e.target.value as SegmentKey)} aria-label="Store group">
              {segKeys.map((k) => (
                <option key={k} value={k}>{SEGMENT_LABELS[k]}</option>
              ))}
            </select>
          )}
        </div>}
      </header>

      <nav className="tabs" role="tablist">
        {([
          ["overview", "Overview"],
          ["divisions", "Divisions"],
          ["heads", "Category heads"],
          ["outlets", "Outlets & targets"],
          ["categories", "Categories (Cat 3)"],
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
      {tab === "divisions" && <Divisions cmp={cmp} seg={seg} segment={segment} />}
      {tab === "heads" && <Heads report={report} cmp={cmp} />}
      {tab === "outlets" && <Outlets outlets={report.outlets} cmp={cmp} />}
      {tab === "categories" && <Categories rows={report.cat3} />}

      <p className="foot">
        Source: {report.sourceFile} · data extracted {report.generatedAt.replace("T", " ")}
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

function metricTip(m: Metrics, c: Cmp): TipRow[] {
  const s = CMP_LABEL[c].short;
  return [
    ["Sales", taka(m.sales)],
    [`Sales ${s}`, taka(m.salesLast)],
    ["Growth", signedPct(growth(m.sales, m.salesLast))],
    ["Footfall", int(m.ff)],
    ["Basket size", taka(m.bs)],
    ["GP %", pct(m.gp, 2)],
  ];
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

type SegData = { divisions: (Metrics & { division: string })[]; total: Metrics | null };

/* ------------------------------------------------------------------ divisions */

function Divisions({ cmp, seg, segment }: { cmp: Cmp; seg: SegData; segment: SegmentKey }) {
  const s = CMP_LABEL[cmp].short;
  return (
    <div className="card">
      <h2>Division performance · {SEGMENT_LABELS[segment]}</h2>
      <p className="hint">Every metric compared with the {CMP_LABEL[cmp].long} ({s}). Change the store group at the top right.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Division</th>
              <th>Sales</th><th>Sales {s}</th><th>Growth</th>
              <th>Footfall</th><th>FF growth</th>
              <th>Basket</th><th>Basket chg</th>
              <th>GP %</th><th>GP % chg</th>
              <th>GP value</th><th>GPV growth</th>
            </tr>
          </thead>
          <tbody>
            {seg.divisions.map((d) => <DivRow key={d.division} d={d} />)}
          </tbody>
          {seg.total && (
            <tfoot>
              <DivRow d={{ ...seg.total, division: "Total" }} />
            </tfoot>
          )}
        </table>
      </div>
      {seg.divisions.length === 0 && <p className="hint">No data for this store group.</p>}
    </div>
  );
}

function DivRow({ d }: { d: Metrics & { division: string } }) {
  return (
    <tr>
      <td>{d.division === "Total" ? "Total" : titleCase(d.division)}</td>
      <td>{taka(d.sales)}</td>
      <td>{taka(d.salesLast)}</td>
      <td><Delta v={growth(d.sales, d.salesLast)} /></td>
      <td>{int(d.ff)}</td>
      <td><Delta v={growth(d.ff, d.ffLast)} /></td>
      <td>{taka(d.bs)}</td>
      <td><Delta v={growth(d.bs, d.bsLast)} /></td>
      <td>{pct(d.gp, 2)}</td>
      <td><Delta v={diff(d.gp, d.gpLast)} kind="pp" /></td>
      <td>{taka(d.gpv)}</td>
      <td><Delta v={growth(d.gpv, d.gpvLast)} /></td>
    </tr>
  );
}

/* ------------------------------------------------------------------ category heads */

function Heads({ report, cmp }: { report: Report; cmp: Cmp }) {
  const s = CMP_LABEL[cmp].short;
  const blocks = report[cmp].headBlocks ?? {};
  const keys = (Object.keys(SEGMENT_LABELS) as SegmentKey[]).filter((k) => blocks[k]?.length);
  const [drill, setDrill] = useState<HeadRow | null>(null);
  const [seg, setSeg] = useState<SegmentKey>("all");
  // the drill-down uses the Cat 3 sheet, which is SPLY only: it is not offered on SPLM
  if (drill && cmp === "sply") return <HeadDrill head={drill} cat={report.cat3 ?? []} seg={seg} onBack={() => setDrill(null)} />;
  const rows = blocks[seg] ?? [];
  const sum = (f: (r: HeadRow) => number | null | undefined) => rows.reduce((t, r) => t + (f(r) ?? 0), 0);
  const S = sum((r) => r.sales), L = sum((r) => r.salesLast), FF = sum((r) => r.ff);
  const GPV = sum((r) => r.gpv), GPVOI = sum((r) => r.gpvOi);
  const nm = (v: string) => v.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const money = (v: number) => Math.round(v).toLocaleString("en-US");
  const grow = (now: number | null | undefined, last: number | null | undefined) => {
    const g = growth(now, last);
    if (g == null || !isFinite(g)) return <span className="delta flat">–</span>;
    const tone = Math.abs(g) < 0.00005 ? "flat" : g > 0 ? "up" : "down";
    return <span className={`delta ${tone}`}>{tone === "up" ? "▲ " : tone === "down" ? "▼ " : ""}{signedPct(g, 2)}</span>;
  };

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Category heads · {SEGMENT_LABELS[seg]}</h2>
          <p className="hint">Compared with the {CMP_LABEL[cmp].long} ({s}). Growth = sales ÷ {s} − 1.</p>
        </div>
        <select value={seg} onChange={(e) => setSeg(e.target.value as SegmentKey)} aria-label="Store group">
          {keys.map((k) => <option key={k} value={k}>{SEGMENT_LABELS[k]}</option>)}
        </select>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="l">Division</th><th className="l">Category role</th><th className="l">Head</th>
              <th>Sales</th><th>Sales {s}</th><th>Growth</th>
              <th>Footfall</th><th>Basket</th>
              <th>GP%</th><th>GP+OI%</th><th>GPV</th><th>GPV+OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="l">{nm(r.division)}</td>
                <td className="l name" title={r.role}>{r.role}</td>
                <td className="l">{cmp === "sply" ? <button className="linkish" onClick={() => setDrill(r)}>{r.head}</button> : r.head}</td>
                <td>{money(r.sales ?? 0)}</td>
                <td>{money(r.salesLast ?? 0)}</td>
                <td>{grow(r.sales, r.salesLast)}</td>
                <td>{money(r.ff ?? 0)}</td>
                <td>{money((r.sales ?? 0) / (r.ff || 1))}</td>
                <td>{pct(r.gp, 2)}</td>
                <td>{pct(r.gpOi, 2)}</td>
                <td>{money(r.gpv ?? 0)}</td>
                <td>{money(r.gpvOi ?? 0)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="l">Total</td><td className="l"></td><td className="l"></td>
                <td>{money(S)}</td><td>{money(L)}</td><td>{grow(S, L)}</td>
                <td>{money(FF)}</td><td>{money(S / (FF || 1))}</td>
                <td>{pct(GPV / (S || 1), 2)}</td><td>{pct(GPVOI / (S || 1), 2)}</td>
                <td>{money(GPV)}</td><td>{money(GPVOI)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {rows.length === 0 && <p className="hint">No category heads for this store group.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ head drill-down: Cat 3 by responsible person */

const SMALL_BASE = 100000; // last-year base below this: growth is not meaningful
const MAX_GROWTH = 5;      // changes beyond ±500% are not meaningful
const fm = (v: number) => Math.round(v).toLocaleString("en-US");

type Agg = { s: number; sl: number; gpv: number; gpvl: number; goi: number; goil: number };
function aggregate(rs: Cat3Row[]): Agg {
  const t = { s: 0, sl: 0, gpv: 0, gpvl: 0, goi: 0, goil: 0 };
  for (const r of rs) {
    t.s += r.sales ?? 0; t.sl += r.salesLy ?? 0;
    t.gpv += r.gpv ?? 0; t.gpvl += r.gpvLy ?? 0;
    t.goi += r.gpvOi ?? 0; t.goil += r.gpvOiLy ?? 0;
  }
  return t;
}

const toneOf = (v: number): "up" | "down" | "flat" => (Math.abs(v) < 0.00005 ? "flat" : v > 0 ? "up" : "down");

/** Growth of a money value; n/m when the last-year base is small or the change is beyond ±500%. */
function Growth({ now, last }: { now: number; last: number }) {
  const g = last >= SMALL_BASE ? now / last - 1 : NaN;
  if (!isFinite(g) || Math.abs(g) > MAX_GROWTH) return <span className="delta flat">n/m</span>;
  const t = toneOf(g);
  return <span className={`delta ${t}`}>{t === "up" ? "▲ " : t === "down" ? "▼ " : ""}{signedPct(g, 2)}</span>;
}

/** Change in percentage points, shown with a %; n/m when the sales base is small. */
function PointChange({ now, last, base }: { now: number | null; last: number | null; base: number }) {
  if (now == null || last == null || base < SMALL_BASE) return <span className="delta flat">n/m</span>;
  const d = now - last;
  const t = toneOf(d);
  return <span className={`delta ${t}`}>{t === "up" ? "▲ " : t === "down" ? "▼ " : ""}{signedPct(d, 2)}</span>;
}

function MetricCells({ a }: { a: Agg }) {
  const gp = a.s ? a.gpv / a.s : null;
  const gpl = a.sl ? a.gpvl / a.sl : null;
  const goi = a.s ? a.goi / a.s : null;
  const goil = a.sl ? a.goil / a.sl : null;
  return (
    <>
      <td><div>{fm(a.s)}</div><div><Growth now={a.s} last={a.sl} /></div></td>
      <td><div>{fm(a.gpv)}</div><div><Growth now={a.gpv} last={a.gpvl} /></div></td>
      <td><div>{pct(gp, 2)}</div><div><PointChange now={gp} last={gpl} base={a.sl} /></div></td>
      <td><div>{fm(a.goi)}</div><div><Growth now={a.goi} last={a.goil} /></div></td>
      <td><div>{pct(goi, 2)}</div><div><PointChange now={goi} last={goil} base={a.sl} /></div></td>
    </>
  );
}

function HeadDrill({ head, cat, seg, onBack }: { head: HeadRow; cat: Cat3Row[]; seg: SegmentKey; onBack: () => void }) {
  const [crp, setCrp] = useState("");
  const [catName, setCatName] = useState("");
  const rows = useMemo(() => cat.filter((r) => r.division === head.division && r.head === head.head), [cat, head]);
  const persons = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.crp, (m.get(r.crp) ?? 0) + (r.sales ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [rows]);
  const cats = useMemo(
    () => [...new Set(rows.filter((r) => !crp || r.crp === crp).map((r) => r.cat3))].sort(),
    [rows, crp]
  );
  const filtered = rows.filter((r) => (!crp || r.crp === crp) && (!catName || r.cat3 === catName));
  const groups = persons
    .filter((p) => !crp || p === crp)
    .map((p) => ({ name: p, rs: filtered.filter((r) => r.crp === p).sort((a, b) => (b.sales ?? 0) - (a.sales ?? 0)) }))
    .filter((g) => g.rs.length > 0);
  const total = aggregate(filtered);
  const all = aggregate(rows);
  const gap = all.s - (head.sales ?? 0);
  const nm = (v: string) => titleCase(v);

  if (seg !== "all") {
    return (
      <div className="card">
        <button className="linkish" onClick={onBack}>← Back to all heads</button>
        <p className="hint" style={{ marginTop: 12 }}>Responsible person detail is available for All stores only. Set the Store group to All stores.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <button className="linkish" onClick={onBack}>← Back to all heads</button>
          <h2 style={{ marginTop: 8 }}>{head.head}</h2>
          <p className="hint">{nm(head.division)} · {head.role} · responsible persons and categories (Cat 3) · SPLY · all stores</p>
        </div>
      </div>
      <div className="drill-filters">
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
            <tr><th className="l">Category (Cat 3)</th><th>Sales</th><th>GPV</th><th>GP%</th><th>GPV+OI</th><th>GP+OI%</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr className="drill-group">
                  <td className="l"><b>{g.name}</b><div className="sub">{g.rs.length} categor{g.rs.length === 1 ? "y" : "ies"}</div></td>
                  <MetricCells a={aggregate(g.rs)} />
                </tr>
                {g.rs.map((r, i) => (
                  <tr key={g.name + i}>
                    <td className="l"><div>{nm(r.cat3)}</div><div className="sub">{nm(r.cat1)}</div></td>
                    <MetricCells a={aggregate([r])} />
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td className="l">Total ({groups.length} persons, {filtered.length} categories)</td>
                <MetricCells a={total} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {filtered.length === 0 && <p className="hint">No categories match these filters.</p>}
      {Math.abs(gap) >= 1 && (
        <p className="hint">Category rows add up to {fm(all.s)}; the head row shows {fm(head.sales ?? 0)} (difference {fm(gap)}). The difference is in the source workbook.</p>
      )}
      <p className="hint">n/m = not meaningful: last year&apos;s base is below 100,000, or the change is beyond ±500%. GP% and GP+OI% changes are in %.</p>
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
                <td>{taka(r.target)}</td>
                <td>{taka(r.achv)}</td>
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
                  <td>{taka(o.target)}</td>
                  <td>{taka(o.achv)}</td>
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

/* ------------------------------------------------------------------ cat 3 */

function Categories({ rows }: { rows: Cat3Row[] }) {
  const [q, setQ] = useState("");
  const [division, setDivision] = useState("");
  const [head, setHead] = useState("");
  const [limit, setLimit] = useState(100);

  const divisions = useMemo(() => [...new Set(rows.map((r) => r.division))].sort(), [rows]);
  const heads = useMemo(() => [...new Set(rows.map((r) => r.head).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!needle || `${r.cat1} ${r.cat3} ${r.crp}`.toLowerCase().includes(needle)) &&
      (!division || r.division === division) &&
      (!head || r.head === head));
  }, [rows, q, division, head]);

  const tot = filtered.reduce((a, r) => ({ s: a.s + (r.sales ?? 0), l: a.l + (r.salesLy ?? 0) }), { s: 0, l: 0 });

  const { sorted, th } = useSort(filtered, {
    cat3: (r) => r.cat3, cat1: (r) => r.cat1, crp: (r) => r.crp,
    sales: (r) => r.sales, ly: (r) => r.salesLy, g: (r) => growth(r.sales, r.salesLy),
    sg: (r) => growth(r.sameSales, r.sameSalesLy), gp: (r) => r.gp, gpd: (r) => diff(r.gp, r.gpLy), gpv: (r) => r.gpv,
  }, { key: "sales", dir: -1 });

  return (
    <div className="card">
      <h2>Categories (Cat 3)</h2>
      <p className="hint">Same period last year only (SPLY) — this sheet has no SPLM view. Same-store growth excludes new outlets.</p>
      <div className="toolbar">
        <input type="search" placeholder="Search category or responsible person" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={division} onChange={(e) => setDivision(e.target.value)} aria-label="Division">
          <option value="">All divisions</option>
          {divisions.map((d) => <option key={d} value={d}>{titleCase(d)}</option>)}
        </select>
        <select value={head} onChange={(e) => setHead(e.target.value)} aria-label="Head">
          <option value="">All heads</option>
          {heads.map((h) => <option key={h}>{h}</option>)}
        </select>
        <span className="count">
          {filtered.length} categories · {taka(tot.s)} <Delta v={growth(tot.s, tot.l)} />
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {th("cat3", "Category")}
              {th("cat1", "Cat 1", "l")}
              {th("crp", "Responsible", "l")}
              {th("sales", "Sales")}
              {th("ly", "Sales SPLY")}
              {th("g", "Growth")}
              {th("sg", "Same-store growth")}
              {th("gp", "GP %")}
              {th("gpd", "GP % chg")}
              {th("gpv", "GP value")}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r, i) => (
              <tr key={r.division + r.cat3 + i}>
                <td className="name" title={r.cat3}>{r.cat3}</td>
                <td className="l">{r.cat1}</td>
                <td className="l">{r.crp}</td>
                <td>{taka(r.sales)}</td>
                <td>{taka(r.salesLy)}</td>
                <td><Delta v={growth(r.sales, r.salesLy)} /></td>
                <td><Delta v={growth(r.sameSales, r.sameSalesLy)} /></td>
                <td>{pct(r.gp, 2)}</td>
                <td><Delta v={diff(r.gp, r.gpLy)} kind="pp" /></td>
                <td>{taka(r.gpv)}</td>
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
  );
}
