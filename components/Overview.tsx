"use client";

import type { DivisionRow, Metrics, MonthOverview, SegmentKey } from "@/lib/types";
import { crFmt, full, growth, pct, signedFull, signedPct } from "@/lib/format";
import { useTooltip, useWidth, type TipRow } from "./charts";
import { CMP_LABEL, SEGMENT_LABELS, type Cmp } from "./FilterBar";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";

/** The six divisions shown on the Overview, in this order (Restaurant etc. are excluded). */
const DIVISIONS: { key: string; label: string }[] = [
  { key: "COMPANY GOODS", label: "Company Goods" },
  { key: "PACKED COMMODITY", label: "Packed Commodity" },
  { key: "LOOSE COMMODITY", label: "Loose Commodity" },
  { key: "FRESH PRODUCE", label: "Fresh Produce" },
  { key: "GENERAL MERCHAND", label: "General Merchandise" }, // sheet spells it "MERCHANDIS"
  { key: "LIFESTYLE", label: "Lifestyle" },
];

type Kind = "money" | "pct";
type Metric = { key: string; label: string; kind: Kind; now: keyof Metrics; last: keyof Metrics; crore?: boolean };

const SALES: Metric = { key: "sales", label: "Sales", kind: "money", now: "sales", last: "salesLast", crore: true };
const GP: Metric = { key: "gp", label: "GP%", kind: "pct", now: "gp", last: "gpLast" };
const GPV: Metric = { key: "gpv", label: "GPV", kind: "money", now: "gpv", last: "gpvLast", crore: true };
const GPOI: Metric = { key: "gpOi", label: "GP+OI%", kind: "pct", now: "gpOi", last: "gpOiLast" };
const GPVOI: Metric = { key: "gpvOi", label: "GPV+OI", kind: "money", now: "gpvOi", last: "gpvOiLast", crore: true };
const FF: Metric = { key: "ff", label: "Footfall", kind: "money", now: "ff", last: "ffLast" };
const BS: Metric = { key: "bs", label: "Basket size", kind: "money", now: "bs", last: "bsLast" };

const KPIS = [SALES, GP, GPV, GPOI, GPVOI, FF, BS];

const val = (m: Metrics | undefined, k: keyof Metrics) => (m ? (m[k] as number | null | undefined) ?? null : null);
/** Comparison value; for % metrics it is meaningless when the comparison period had no sales (new stores). */
const lastVal = (m: Metrics | undefined, metric: Metric) =>
  metric.kind === "pct" && !m?.salesLast ? null : val(m, metric.last);
const fmt = (kind: Kind, v: number | null) => (kind === "pct" ? pct(v, 2) : full(v));
/** Growth: ratio for money/counts, percentage-point difference for % metrics. */
const change = (kind: Kind, now: number | null, last: number | null) =>
  kind === "pct" ? (now == null || last == null ? null : now - last) : growth(now, last);
/** Difference of two percentages (e.g. 17.37% → 17.06% = −0.31%), shown with a % sign. */
const pctDiff = (v: number | null) =>
  v == null || !isFinite(v) ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toFixed(2)}%`;
const fmtChange = (kind: Kind, v: number | null) => (kind === "pct" ? pctDiff(v) : signedPct(v, 2));
const toneOf = (v: number | null) => (v == null || !isFinite(v) || Math.abs(v) < 0.00005 ? "flat" : v > 0 ? "up" : "down");

function Change({ kind, v }: { kind: Kind; v: number | null }) {
  const t = toneOf(v);
  return (
    <span className={`ov-chg ${t}`}>
      {t === "up" ? "▲ " : t === "down" ? "▼ " : ""}
      {fmtChange(kind, v)}
    </span>
  );
}

/** Money in crore (1 Cr = 10,000,000), two decimals: 12.34 Cr. */
const crore = (v: number | null, signed = false) => {
  if (v == null || !isFinite(v)) return "–";
  return `${v < 0 ? "−" : signed && v > 0 ? "+" : ""}${crFmt(Math.abs(v))}`;
};
/** A metric's value the way the page shows it: crore for money, full figures for counts, % for ratios. */
const showValue = (m: Metric, v: number | null) => (m.crore ? crore(v) : fmt(m.kind, v));

/** Tooltip rows: Sales, GPV and GPV+OI in crore; footfall and basket as-is; % metrics in %. */
function tipRows(metric: Metric, row: Metrics | undefined, s: string): TipRow[] {
  const now = val(row, metric.now), last = lastVal(row, metric);
  const d = now == null || last == null ? null : now - last;
  const show = (v: number | null) => (metric.crore ? crore(v) : fmt(metric.kind, v));
  const rows: TipRow[] = [
    ["This period", show(now)],
    [s, show(last)],
  ];
  if (metric.kind === "pct") rows.push(["Difference", pctDiff(change("pct", now, last))]);
  else rows.push(["Difference", metric.crore ? crore(d, true) : signedFull(d)], ["Growth", signedPct(growth(now, last), 2)]);
  return rows;
}

export default function Overview({ data, cmp, segment }: { data: MonthOverview; cmp: Cmp; segment: SegmentKey }) {
  const block = data[cmp].segments[segment];
  const s = CMP_LABEL[cmp].short;
  const total = block?.total ?? undefined;
  const rows = DIVISIONS.map((d) => ({
    ...d,
    row: block?.divisions.find((r: DivisionRow) => r.division.toUpperCase().replace(/\s+/g, " ").startsWith(d.key)),
  }));

  if (!block) {
    return (
      <div className="ov-state" role="status">
        No data for <b>{SEGMENT_LABELS[segment]}</b> in {data.periodLabel}. Choose another store group.
      </div>
    );
  }

  return (
    <div className="ov">
      {/* KPI strip: Totals row of the selected store group */}
      <section className="ov-kpis" aria-label="Key figures">
        {KPIS.map((m) => {
          const now = val(total, m.now), last = lastVal(total, m);
          const d = now == null || last == null ? null : now - last;
          return (
            <div className="ov-kpi" key={m.key}>
              <div className="ov-kpi-label">{m.label}</div>
              <div className="ov-kpi-value">{m.crore ? crore(now) : fmt(m.kind, now)}</div>
              <div className="ov-kpi-cmp">{s}: <span>{m.crore ? crore(last) : fmt(m.kind, last)}</span></div>
              <div className="ov-kpi-delta">
                {m.kind === "money" && <span className={`ov-chg ${toneOf(d)}`}>{m.crore ? crore(d, true) : signedFull(d)}</span>}
                <Change kind={m.kind} v={change(m.kind, now, last)} />
              </div>
            </div>
          );
        })}
      </section>

      <OwnFranchise data={data} cmp={cmp} segment={segment} />

      {/* Performance: one dominant chart (8) + supporting ranking (4) */}
      <SectionHead title="Sales performance" s={s} />
      <div className="ov-grid-84">
        <Panel title="Sales by division" sub={`value and growth vs ${s}`}>
          <ColumnChart metric={SALES} rows={rows} s={s} height={320} />
        </Panel>
        <Panel title="Sales growth ranking" sub={`vs ${s}, highest first`}>
          <Ranking metric={SALES} rows={rows} s={s} />
        </Panel>
      </div>

      <SectionHead title="GPV and GPV+OI Performance" s={s} />
      <div className="ov-grid-66">
        <Panel title="GPV" sub={`growth vs ${s}`}><ColumnChart metric={GPV} rows={rows} s={s} /></Panel>
        <Panel title="GP%" sub={`change vs ${s}`}><ColumnChart metric={GP} rows={rows} s={s} /></Panel>
        <Panel title="GPV+OI" sub={`growth vs ${s}`}><ColumnChart metric={GPVOI} rows={rows} s={s} /></Panel>
        <Panel title="GP+OI%" sub={`change vs ${s}`}><ColumnChart metric={GPOI} rows={rows} s={s} /></Panel>
      </div>

      <SectionHead title="Traffic and basket" s={s} />
      <div className="ov-grid-66">
        <Panel title="Footfall (FF)" sub={`invoices, growth vs ${s}`}><ColumnChart metric={FF} rows={rows} s={s} /></Panel>
        <Panel title="Basket size" sub={`sales per invoice, growth vs ${s}`}><ColumnChart metric={BS} rows={rows} s={s} /></Panel>
      </div>

      <SectionHead title="Division detail" />
      <DivisionTable rows={rows} total={total} s={s} />

      <details className="ov-defs">
        <summary>Metric definitions and data notes</summary>
        <ul>
          <li><b>Sales</b>: POS net sales. <b>Footfall (FF)</b>: number of invoices. <b>Basket size</b>: sales ÷ footfall.</li>
          <li><b>GP%</b>: gross profit ÷ sales. <b>GPV</b>: gross profit value.</li>
          <li><b>GP+OI% / GPV+OI</b>: gross profit including other income (value adjustments), as calculated in the workbook.</li>
          <li><b>Growth</b>: this period ÷ comparison − 1. For GP% and GP+OI% the change is the difference between the two percentages (e.g. 17.37% → 17.06% = −0.31%).</li>
          <li>KPI cards and the table total use the workbook&rsquo;s Totals row, which includes Restaurant, so the six divisions shown can sum to slightly less.</li>
          <li>&ldquo;–&rdquo; means no comparable value (for example, a new store group had no sales in the comparison period).</li>
          <li>Source: {data.sourceFile}, sheets SPLY and SPLM.</li>
        </ul>
      </details>
    </div>
  );
}

function SectionHead({ title, s }: { title: string; s?: string }) {
  return (
    <header className="ov-section-head">
      <h2>{title}</h2>
      {s && (
        <div className="legend" aria-hidden>
          <span><i style={{ background: "var(--this)" }} />This period</span>
          <span><i style={{ background: "var(--last)" }} />{s}</span>
        </div>
      )}
    </header>
  );
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="ov-panel">
      <h3>{title}{sub && <small>{sub}</small>}</h3>
      {children}
    </div>
  );
}

type Row = { key: string; label: string; row: DivisionRow | undefined };

/**
 * Which pair of store types the Own vs Franchise panel compares, by the Store group filter.
 * "picked" marks the side that the filter itself selects (Own or Franchise).
 */
const OWN_FRAN_PAIRS: Partial<Record<SegmentKey, { own: SegmentKey; fran: SegmentKey; scope: string; picked: "own" | "fran" | null }>> = {
  all: { own: "own", fran: "franchise", scope: "All stores", picked: null },
  own: { own: "own", fran: "franchise", scope: "All stores", picked: "own" },
  franchise: { own: "own", fran: "franchise", scope: "All stores", picked: "fran" },
  same: { own: "ownSame", fran: "franchiseSame", scope: "Same stores", picked: null },
  ownSame: { own: "ownSame", fran: "franchiseSame", scope: "Same stores", picked: "own" },
  franchiseSame: { own: "ownSame", fran: "franchiseSame", scope: "Same stores", picked: "fran" },
  newOwn: { own: "newOwn", fran: "newFranchise", scope: "New stores", picked: "own" },
  newFranchise: { own: "newOwn", fran: "newFranchise", scope: "New stores", picked: "fran" },
};

/**
 * Own vs Franchise snapshot. Follows the Store group filter: the pair shown is the
 * own and franchise version of the selected group. Follows the month and SPLY/SPLM too.
 */
function OwnFranchise({ data, cmp, segment }: { data: MonthOverview; cmp: Cmp; segment: SegmentKey }) {
  const segs = data[cmp].segments;
  const s = CMP_LABEL[cmp].short;
  const pair = OWN_FRAN_PAIRS[segment] ?? OWN_FRAN_PAIRS.all!;
  const own = segs[pair.own], fran = segs[pair.fran];
  const scope = pair.scope.toLowerCase();

  if (!own?.total || !fran?.total) {
    return (
      <section className="ovf" aria-labelledby="ovf-h">
        <div className="ovf-title">
          <h2 id="ovf-h">Own vs Franchise</h2>
          <span>No own and franchise data for {scope} in this month.</span>
        </div>
      </section>
    );
  }

  const ownSales = own.total.sales ?? 0, franSales = fran.total.sales ?? 0;
  const pairSales = ownSales + franSales;
  const share = (v: number | null | undefined) => (v == null || !pairSales ? null : v / pairSales);
  const ownShare = share(own.total.sales), franShare = share(fran.total.sales);

  const side = (segKey: SegmentKey, t: Metrics, sh: number | null, picked: boolean) => {
    const line = (m: Metric, name = m.label) => {
      const now = val(t, m.now), last = lastVal(t, m);
      return (
        <div className="ovf-line" key={m.key}>
          <span className="ovf-k">{name}</span>
          <span className="ovf-v">{showValue(m, now)}</span>
          <Change kind={m.kind} v={change(m.kind, now, last)} />
        </div>
      );
    };
    return (
      <div className={`ovf-side${picked ? " picked" : ""}`}>
        <div className="ovf-head">
          <b>{SEGMENT_LABELS[segKey]}{picked && <em className="ovf-tag">Selected</em>}</b>
          <span>{pct(sh, 2)} share</span>
        </div>
        {line(SALES)}
        {line(GP)}
        {line(GPOI)}
        {line(GPVOI)}
        {line(FF, "Footfall")}
        {line(BS, "Basket")}
      </div>
    );
  };

  const divRows = DIVISIONS.map((d) => {
    const find = (b?: { divisions: DivisionRow[] }) =>
      b?.divisions.find((r) => r.division.toUpperCase().replace(/\s+/g, " ").startsWith(d.key));
    return { ...d, o: find(own), f: find(fran) };
  });

  const exportOwnFran = () => {
    const ms: Metric[] = [SALES, GPOI];
    const sides = [SEGMENT_LABELS[pair.own], SEGMENT_LABELS[pair.fran]];
    const cols: ExportCol[] = [{ header: "Division", format: "text" }];
    for (const name of sides) {
      for (const m of ms) {
        const f = m.kind === "pct" ? "pct" : "money";
        cols.push({ header: `${name} ${m.label}`, format: f }, { header: `${name} ${m.label} ${s}`, format: f }, { header: `${name} ${m.label} change`, format: "pct" });
      }
    }
    const body: ExportCell[][] = divRows.map((r) => [
      r.label,
      ...metricExportValues(ms, r.o),
      ...metricExportValues(ms, r.f),
    ]);
    downloadExcel(`own-vs-franchise-by-division-${s}.xlsx`, "Own vs Franchise", cols, body);
  };
  return (
    <section className="ovf" aria-labelledby="ovf-h">
      <div className="ovf-title">
        <h2 id="ovf-h">Own vs Franchise</h2>
        <span>{pair.scope} · totals vs {s} · changes with the Store group filter</span>
      </div>
      <div className="ovf-grid">
        {side(pair.own, own.total, ownShare, pair.picked === "own")}
        {side(pair.fran, fran.total, franShare, pair.picked === "fran")}
      </div>
      <div className="ovf-share" role="img" aria-label={`Share: ${SEGMENT_LABELS[pair.own]} ${pct(ownShare, 2)}, ${SEGMENT_LABELS[pair.fran]} ${pct(franShare, 2)}`}>
        <span className="own" style={{ width: `${(ownShare ?? 0) * 100}%` }}>Own {pct(ownShare, 2)}</span>
        <span className="fran" style={{ width: `${(franShare ?? 0) * 100}%` }}>Franchise {pct(franShare, 2)}</span>
      </div>
      <details className="ovf-div">
        <summary>Show by division</summary>
        <div className="xbar" style={{ marginTop: 8 }}><ExportButton onClick={exportOwnFran} /></div>
        <div className="ov-table-scroll">
          <table className="ov-table">
            <thead>
              <tr>
                <th scope="col">Division</th>
                <th scope="col">{SEGMENT_LABELS[pair.own]} sales</th><th scope="col">{SEGMENT_LABELS[pair.fran]} sales</th>
                <th scope="col">{SEGMENT_LABELS[pair.own]} GP+OI%</th><th scope="col">{SEGMENT_LABELS[pair.fran]} GP+OI%</th>
              </tr>
            </thead>
            <tbody>
              {divRows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  {[[SALES, r.o], [SALES, r.f], [GPOI, r.o], [GPOI, r.f]].map(([m, row], i) => {
                    const mm = m as Metric, rr = row as DivisionRow | undefined;
                    const now = val(rr, mm.now), last = lastVal(rr, mm);
                    return (
                      <td key={i}>
                        <div className="ov-td-val">{showValue(mm, now)}</div>
                        <Change kind={mm.kind} v={change(mm.kind, now, last)} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

/** Supporting ranking: divisions sorted by growth, bars diverging from zero. */
function Ranking({ metric, rows, s }: { metric: Metric; rows: Row[]; s: string }) {
  const { show, hide, node } = useTooltip();
  const items = rows
    .map((r) => ({ r, v: change(metric.kind, val(r.row, metric.now), lastVal(r.row, metric)) }))
    .sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity));
  const ext = Math.max(1e-9, ...items.map((x) => Math.abs(x.v ?? 0)));
  return (
    <>
      <ol className="ov-rank">
        {items.map(({ r, v }, i) => {
          const w = `${(Math.abs(v ?? 0) / ext) * 50}%`;
          return (
            <li key={r.key} onMouseMove={(e) => show(e, `${r.label} · ${metric.label}`, tipRows(metric, r.row, s))} onMouseLeave={hide}>
              <span className="ov-rank-n">{i + 1}</span>
              <span className="ov-rank-name">{r.label}</span>
              <Change kind={metric.kind} v={v} />
              <span className="ov-rank-track" aria-hidden>
                <span className="ov-rank-zero" />
                {v != null && <span className="ov-rank-bar" style={v >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />}
              </span>
            </li>
          );
        })}
      </ol>
      {node}
    </>
  );
}

/** Detail table: every Overview number in one place (also the accessible alternative to the charts). */
/** Excel columns for a set of metrics: this period, comparison and change, in that order. */
function metricExportCols(metrics: Metric[], s: string, first: string): ExportCol[] {
  const cols: ExportCol[] = [{ header: first, format: "text" }];
  for (const m of metrics) {
    const f = m.kind === "pct" ? "pct" : m.key === "ff" || m.key === "bs" ? "int" : "money";
    cols.push({ header: m.label, format: f }, { header: `${m.label} ${s}`, format: f }, { header: `${m.label} change`, format: "pct" });
  }
  return cols;
}

function metricExportValues(metrics: Metric[], m: Metrics | undefined): ExportCell[] {
  const out: ExportCell[] = [];
  for (const x of metrics) {
    const now = val(m, x.now), last = lastVal(m, x);
    out.push(now, last, change(x.kind, now, last));
  }
  return out;
}

function DivisionTable({ rows, total, s }: { rows: Row[]; total: Metrics | undefined; s: string }) {
  const cols: Metric[] = [SALES, GPV, GP, GPVOI, GPOI, FF, BS];
  const exportXlsx = () => {
    const body: ExportCell[][] = [
      ...rows.map((r) => [r.label, ...metricExportValues(cols, r.row)]),
      ["Total", ...metricExportValues(cols, total)],
    ];
    downloadExcel(`division-detail-${s}.xlsx`, "Division detail", metricExportCols(cols, s, "Division"), body);
  };
  const line = (label: string, m: Metrics | undefined, cls = "") => (
    <tr className={cls} key={label}>
      <th scope="row">{label}</th>
      {cols.map((c) => {
        const now = val(m, c.now), last = lastVal(m, c);
        return (
          <td key={c.key}>
            <div className="ov-td-val">{showValue(c, now)}</div>
            <Change kind={c.kind} v={change(c.kind, now, last)} />
          </td>
        );
      })}
    </tr>
  );
  return (
    <div className="ov-panel ov-table-panel">
      <div className="xbar" style={{ padding: "12px 16px 0" }}><ExportButton onClick={exportXlsx} /></div>
      <div className="ov-table-scroll">
        <table className="ov-table">
          <caption>Division results with change vs {s}. Total is the workbook Totals row (includes Restaurant).</caption>
          <thead>
            <tr>
              <th scope="col">Division</th>
              {cols.map((c) => <th scope="col" key={c.key}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>{rows.map((r) => line(r.label, r.row))}</tbody>
          <tfoot>{line("Total", total, "ov-total")}</tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * Column chart: per division a navy column (this period) and a grey column (comparison),
 * growth % (or % change for GP% metrics) above each pair, division name and this-period value below.
 * No y-axis numbers: every value is labelled, gridlines only give the scale.
 */
function ColumnChart({ metric, rows, s, height = 260 }: { metric: Metric; rows: Row[]; s: string; height?: number }) {
  const { show, hide, node } = useTooltip();
  const { ref, w: W } = useWidth(560);
  const groupW = W / rows.length;
  const narrow = groupW < 70; // phones: smaller text, no arrows
  const fs = narrow ? 9.5 : 11;
  const twoLine = rows.some((r) => r.label.includes(" ")) && groupW < 110;
  const top = 30, bottom = twoLine ? 40 : 26;
  const plotH = height - top - bottom;
  const max = Math.max(1e-9, ...rows.flatMap((r) => [val(r.row, metric.now) ?? 0, lastVal(r.row, metric) ?? 0]));
  const colW = Math.min(38, Math.max(8, (groupW - 20) / 2));
  const y = (v: number | null) => top + plotH - (Math.max(0, v ?? 0) / max) * plotH;

  return (
    <div ref={ref} className="ov-colchart">
      <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img"
        aria-label={`${metric.label} by division, this period versus ${s}`}>
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} x1={0} x2={W} y1={top + plotH * (1 - t)} y2={top + plotH * (1 - t)} className="ov-grid" />
        ))}
        <line x1={0} x2={W} y1={top + plotH} y2={top + plotH} className="ov-base" />
        {rows.map((r, i) => {
          const now = val(r.row, metric.now), last = lastVal(r.row, metric);
          const cx = groupW * i + groupW / 2;
          const ch = change(metric.kind, now, last);
          const t = toneOf(ch);
          const yNow = y(now), yLast = y(last);
          const words = r.label.split(" ");
          return (
            <g key={r.key}>
              <path d={colPath(cx - colW - 1, yNow, colW, top + plotH - yNow)} fill="var(--this)" />
              <path d={colPath(cx + 1, yLast, colW, top + plotH - yLast)} fill="var(--last)" />
              <text x={cx} y={Math.min(yNow, yLast) - 8} textAnchor="middle" className={`ov-col-chg ${t}`} fontSize={fs + 1}>
                {!narrow && (t === "up" ? "▲ " : t === "down" ? "▼ " : "")}{fmtChange(metric.kind, ch)}
              </text>
              <text x={cx} y={top + plotH + 16} textAnchor="middle" className="ov-col-name" fontSize={fs}>
                {words.length > 1 && twoLine
                  ? <><tspan x={cx}>{words[0]}</tspan><tspan x={cx} dy={fs + 2}>{words.slice(1).join(" ")}</tspan></>
                  : r.label}
              </text>
              <rect x={groupW * i} y={0} width={groupW} height={height} className="ov-col-hit"
                onMouseMove={(e) => show(e, `${r.label} · ${metric.label}`, tipRows(metric, r.row, s))} onMouseLeave={hide} />
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

/** Column anchored to the baseline: square at the bottom, 4px rounded top. */
function colPath(x: number, y: number, w: number, h: number) {
  if (h <= 0.5) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
