"use client";

import type { DivisionRow, Metrics, MonthOverview, SegmentKey } from "@/lib/types";
import { full, growth, pct, signedFull, signedPct } from "@/lib/format";
import { useTooltip, useWidth, type TipRow } from "./charts";
import { CMP_LABEL, SEGMENT_LABELS, type Cmp } from "./FilterBar";

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

/** Crore (1 Cr = 10,000,000), used only in hover tooltips for money values. */
const crore = (v: number | null, signed = false) => {
  if (v == null || !isFinite(v)) return "–";
  const t = (Math.abs(v) / 1e7).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : ""}${t} Cr`;
};

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
              <div className="ov-kpi-value">{fmt(m.kind, now)}</div>
              <div className="ov-kpi-cmp">{s}: <span>{fmt(m.kind, last)}</span></div>
              <div className="ov-kpi-delta">
                {m.kind === "money" && <span className={`ov-chg ${toneOf(d)}`}>{signedFull(d)}</span>}
                <Change kind={m.kind} v={change(m.kind, now, last)} />
              </div>
            </div>
          );
        })}
      </section>

      <Attention rows={rows} s={s} />

      <OwnFranchise data={data} cmp={cmp} />

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

      <SectionHead title="Traffic and basket" s={s} />
      <div className="ov-grid-66">
        <Panel title="Footfall (FF)" sub={`invoices, growth vs ${s}`}><ColumnChart metric={FF} rows={rows} s={s} /></Panel>
        <Panel title="Basket size" sub={`sales per invoice, growth vs ${s}`}><ColumnChart metric={BS} rows={rows} s={s} /></Panel>
      </div>

      <SectionHead title="GPV and GPV+OI Performance" s={s} />
      <div className="ov-grid-66">
        <Panel title="GPV" sub={`growth vs ${s}`}><ColumnChart metric={GPV} rows={rows} s={s} /></Panel>
        <Panel title="GP%" sub={`change vs ${s}`}><ColumnChart metric={GP} rows={rows} s={s} /></Panel>
        <Panel title="GPV+OI" sub={`growth vs ${s}`}><ColumnChart metric={GPVOI} rows={rows} s={s} /></Panel>
        <Panel title="GP+OI%" sub={`change vs ${s}`}><ColumnChart metric={GPOI} rows={rows} s={s} /></Panel>
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

/** Exceptions: divisions whose GP+OI% fell vs the comparison, shown as the decrease in %, largest first. */
function Attention({ rows, s }: { rows: Row[]; s: string }) {
  const items = rows
    .map((r) => {
      const now = val(r.row, GPOI.now), last = lastVal(r.row, GPOI);
      return { div: r.label, drop: now == null || last == null ? null : now - last };
    })
    .filter((x): x is { div: string; drop: number } => x.drop != null && x.drop < -0.00005)
    .sort((a, b) => a.drop - b.drop);
  return (
    <section className="ov-attn" aria-labelledby="attn-h">
      <div className="ov-attn-head">
        <h2 id="attn-h">Needs attention</h2>
        <span>Divisions where GP+OI% decreased vs {s}, largest decrease first</span>
      </div>
      {items.length === 0 ? (
        <p className="ov-attn-none">No division has a lower GP+OI% than {s}.</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li key={it.div}>
              <span className="ov-attn-badge" aria-hidden>▼</span>
              <b>{it.div}</b>
              <span className="ov-attn-metric">GP+OI%</span>
              <span className="ov-attn-val">{pctDiff(it.drop)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Own vs Franchise snapshot. Always compares the two store types (independent of the
 * Store group filter); follows the month and the SPLY/SPLM comparison.
 */
function OwnFranchise({ data, cmp }: { data: MonthOverview; cmp: Cmp }) {
  const segs = data[cmp].segments;
  const s = CMP_LABEL[cmp].short;
  const own = segs.own, fran = segs.franchise;
  const all = segs.all?.total?.sales ?? null;
  if (!own?.total || !fran?.total) return null;
  const share = (v: number | null) => (v == null || !all ? null : v / all);
  const ownShare = share(own.total.sales), franShare = share(fran.total.sales);

  const side = (label: string, t: Metrics, sh: number | null) => {
    const line = (m: Metric, name = m.label) => {
      const now = val(t, m.now), last = lastVal(t, m);
      return (
        <div className="ovf-line" key={m.key}>
          <span className="ovf-k">{name}</span>
          <span className="ovf-v">{fmt(m.kind, now)}</span>
          <Change kind={m.kind} v={change(m.kind, now, last)} />
        </div>
      );
    };
    return (
      <div className="ovf-side">
        <div className="ovf-head"><b>{label}</b><span>{pct(sh, 2)} of sales</span></div>
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

  return (
    <section className="ovf" aria-labelledby="ovf-h">
      <div className="ovf-title">
        <h2 id="ovf-h">Own vs Franchise</h2>
        <span>Totals by store type vs {s} · always compares both types, whatever the Store group filter</span>
      </div>
      <div className="ovf-grid">
        {side("Own stores", own.total, ownShare)}
        {side("Franchise stores", fran.total, franShare)}
      </div>
      <div className="ovf-share" role="img" aria-label={`Share of sales: own ${pct(ownShare, 2)}, franchise ${pct(franShare, 2)}`}>
        <span className="own" style={{ width: `${(ownShare ?? 0) * 100}%` }}>Own {pct(ownShare, 2)}</span>
        <span className="fran" style={{ width: `${(franShare ?? 0) * 100}%` }}>Franchise {pct(franShare, 2)}</span>
      </div>
      <details className="ovf-div">
        <summary>Show by division</summary>
        <div className="ov-table-scroll">
          <table className="ov-table">
            <thead>
              <tr>
                <th scope="col">Division</th>
                <th scope="col">Own sales</th><th scope="col">Franchise sales</th>
                <th scope="col">Own GP+OI%</th><th scope="col">Franchise GP+OI%</th>
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
                        <div className="ov-td-val">{fmt(mm.kind, now)}</div>
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
function DivisionTable({ rows, total, s }: { rows: Row[]; total: Metrics | undefined; s: string }) {
  const cols: Metric[] = [SALES, GPV, GP, GPVOI, GPOI, FF, BS];
  const line = (label: string, m: Metrics | undefined, cls = "") => (
    <tr className={cls} key={label}>
      <th scope="row">{label}</th>
      {cols.map((c) => {
        const now = val(m, c.now), last = lastVal(m, c);
        return (
          <td key={c.key}>
            <div className="ov-td-val">{fmt(c.kind, now)}</div>
            <Change kind={c.kind} v={change(c.kind, now, last)} />
          </td>
        );
      })}
    </tr>
  );
  return (
    <div className="ov-panel ov-table-panel">
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
