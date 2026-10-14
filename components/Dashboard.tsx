"use client";

import { useEffect, useMemo, useState } from "react";
import type { Cat3Row, Metrics, Outlet, Report, SegmentKey } from "@/lib/types";
import { diff, growth, int, longDate, pct, pp, signedPct, taka, titleCase } from "@/lib/format";
import { DivergingBars, PairedBars, type TipRow } from "./charts";

type Cmp = "sply" | "splm";
type Tab = "overview" | "divisions" | "heads" | "outlets" | "categories";

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All stores",
  own: "Own stores",
  franchise: "Franchise stores",
  same: "Same stores",
  ownSame: "Own same stores",
  franchiseSame: "Franchise same stores",
  newOwn: "New own stores",
  newFranchise: "New franchise",
};
const CMP_LABEL: Record<Cmp, { short: string; long: string }> = {
  sply: { short: "SPLY", long: "same period last year" },
  splm: { short: "SPLM", long: "same period last month" },
};

export default function Dashboard({ report }: { report: Report }) {
  const [cmp, setCmp] = useState<Cmp>("sply");
  const [segment, setSegment] = useState<SegmentKey>("all");
  const [tab, setTab] = useState<Tab>("overview");

  // remember the viewer's last tab / comparison (per-browser convenience only)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("bpr-view") || "{}");
      if (s.cmp) setCmp(s.cmp);
      if (s.tab) setTab(s.tab);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("bpr-view", JSON.stringify({ cmp, tab })); } catch {}
  }, [cmp, tab]);

  const comparison = report[cmp];
  const seg = comparison.segments[segment] ?? comparison.segments.all!;
  const segKeys = (Object.keys(SEGMENT_LABELS) as SegmentKey[]).filter((k) => comparison.segments[k]);

  return (
    <main className="wrap">
      <header className="top">
        <div>
          <h1>Business Performance</h1>
          <div className="sub">
            Till {longDate(report.asOf)} · {report.periodLabel} · compared with the {CMP_LABEL[cmp].long}
          </div>
        </div>
        <div className="controls">
          <div className="seg" role="group" aria-label="Comparison period">
            {(["sply", "splm"] as Cmp[]).map((c) => (
              <button key={c} aria-pressed={cmp === c} onClick={() => setCmp(c)} title={CMP_LABEL[c].long}>
                vs {CMP_LABEL[c].short}
              </button>
            ))}
          </div>
          {(tab === "overview" || tab === "divisions") && (
            <select value={segment} onChange={(e) => setSegment(e.target.value as SegmentKey)} aria-label="Store group">
              {segKeys.map((k) => (
                <option key={k} value={k}>{SEGMENT_LABELS[k]}</option>
              ))}
            </select>
          )}
        </div>
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

      {tab === "overview" && <Overview report={report} cmp={cmp} seg={seg} segment={segment} />}
      {tab === "divisions" && <Divisions cmp={cmp} seg={seg} segment={segment} />}
      {tab === "heads" && <Heads report={report} cmp={cmp} />}
      {tab === "outlets" && <Outlets outlets={report.outlets} cmp={cmp} />}
      {tab === "categories" && <Categories rows={report.cat3} />}

      <p className="foot">
        Source: {report.sourceFile} · data extracted {report.generatedAt.replace("T", " ")}
      </p>
    </main>
  );
}

/* ------------------------------------------------------------------ helpers */

function Delta({ v, kind = "pct" }: { v: number | null; kind?: "pct" | "pp" }) {
  if (v == null || !isFinite(v)) return <span className="delta flat">–</span>;
  const tone = Math.abs(v) < 0.0005 ? "flat" : v > 0 ? "up" : "down";
  const arrow = tone === "up" ? "▲ " : tone === "down" ? "▼ " : "";
  return <span className={`delta ${tone}`}>{arrow}{kind === "pp" ? pp(v) : signedPct(v)}</span>;
}

function tone(v: number | null): "up" | "down" | "flat" {
  return v == null || Math.abs(v) < 0.0005 ? "flat" : v > 0 ? "up" : "down";
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

function Overview({ report, cmp, seg, segment }: { report: Report; cmp: Cmp; seg: SegData; segment: SegmentKey }) {
  const t = seg.total;
  const s = CMP_LABEL[cmp].short;
  const ach = report.target.achv != null && report.target.target ? report.target.achv / report.target.target : null;
  const divs = seg.divisions;
  const byGrowth = [...divs]
    .map((d) => ({ d, g: growth(d.sales, d.salesLast) }))
    .filter((x) => x.g != null)
    .sort((a, b) => (b.g as number) - (a.g as number));

  return (
    <>
      <section className="kpis">
        <div className="kpi hero">
          <div className="label">Sales · {SEGMENT_LABELS[segment]}</div>
          <div className="value">{taka(t?.sales)}</div>
          <div className="note">
            <Delta v={growth(t?.sales, t?.salesLast)} /> vs {s} ({taka(t?.salesLast)})
          </div>
        </div>
        <div className="kpi">
          <div className="label">Target achievement</div>
          <div className="value">{pct(ach)}</div>
          <div className="note">{taka(report.target.achv)} of {taka(report.target.target)}</div>
          <div className="meter" aria-hidden><span style={{ width: `${Math.min(100, (ach ?? 0) * 100)}%` }} /></div>
        </div>
        <div className="kpi">
          <div className="label">Footfall</div>
          <div className="value">{int(t?.ff)}</div>
          <div className="note"><Delta v={growth(t?.ff, t?.ffLast)} /> vs {s}</div>
        </div>
        <div className="kpi">
          <div className="label">Basket size</div>
          <div className="value">{taka(t?.bs)}</div>
          <div className="note"><Delta v={growth(t?.bs, t?.bsLast)} /> vs {s}</div>
        </div>
        <div className="kpi">
          <div className="label">Gross profit %</div>
          <div className="value">{pct(t?.gp, 2)}</div>
          <div className="note"><Delta v={diff(t?.gp, t?.gpLast)} kind="pp" /> vs {s}</div>
        </div>
        <div className="kpi">
          <div className="label">Gross profit value</div>
          <div className="value">{taka(t?.gpv)}</div>
          <div className="note"><Delta v={growth(t?.gpv, t?.gpvLast)} /> vs {s}</div>
        </div>
      </section>

      <div className="grid2">
        <div className="card">
          <div className="card-head">
            <div>
              <h2>Sales by division</h2>
              <p className="hint">Growth vs {s} shown on the right</p>
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--this)" }} />This period</span>
              <span><i style={{ background: "var(--last)" }} />{s}</span>
            </div>
          </div>
          <PairedBars
            items={divs.map((d) => {
              const g = growth(d.sales, d.salesLast);
              return { label: titleCase(d.division), now: d.sales ?? 0, last: d.salesLast ?? 0, note: signedPct(g), noteTone: tone(g) };
            })}
            format={(v) => taka(v, 1)}
            tipRows={(i) => metricTip(divs[i], cmp)}
          />
        </div>
        <div className="card">
          <h2>Sales growth by division</h2>
          <p className="hint">vs {s}, sorted high to low</p>
          <DivergingBars
            items={byGrowth.map(({ d, g }) => ({ label: titleCase(d.division), value: g as number }))}
            format={(v) => signedPct(v)}
            tipRows={(i) => metricTip(byGrowth[i].d, cmp)}
          />
        </div>
      </div>

      <LeaderSummary outlets={report.outlets} />
    </>
  );
}

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
  const heads = report[cmp].heads;
  const items = heads
    .map((h) => ({ h, g: growth(h.sales, h.salesLast) }))
    .filter((x) => x.g != null)
    .sort((a, b) => (b.g as number) - (a.g as number));
  const label = (h: (typeof heads)[number]) => `${h.role} (${titleCase(h.division)})`;

  return (
    <>
      <div className="card">
        <h2>Sales growth by category role</h2>
        <p className="hint">All stores, vs {s}. Hover a bar for the responsible head and details.</p>
        <DivergingBars
          labelWidth={230}
          items={items.map(({ h, g }) => ({ label: label(h), value: g as number }))}
          format={(v) => signedPct(v)}
          tipRows={(i) => [["Head", items[i].h.head], ...metricTip(items[i].h, cmp)]}
        />
      </div>
      <div className="card">
        <h2>Category heads</h2>
        <p className="hint">All stores, vs {s}</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Division</th><th className="l">Category role</th><th className="l">Head</th>
                <th>Sales</th><th>Sales {s}</th><th>Growth</th>
                <th>Footfall</th><th>FF growth</th>
                <th>GP %</th><th>GP % chg</th><th>GP value</th>
              </tr>
            </thead>
            <tbody>
              {heads.map((h, i) => (
                <tr key={i}>
                  <td>{titleCase(h.division)}</td>
                  <td className="l name" title={h.role}>{h.role}</td>
                  <td className="l">{h.head}</td>
                  <td>{taka(h.sales)}</td>
                  <td>{taka(h.salesLast)}</td>
                  <td><Delta v={growth(h.sales, h.salesLast)} /></td>
                  <td>{int(h.ff)}</td>
                  <td><Delta v={growth(h.ff, h.ffLast)} /></td>
                  <td>{pct(h.gp, 2)}</td>
                  <td><Delta v={diff(h.gp, h.gpLast)} kind="pp" /></td>
                  <td>{taka(h.gpv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
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
