"use client";

import { Fragment, useRef, useState } from "react";
import type { HeadRow } from "@/lib/types";
import { abbrOf, full, pct, roleName, signedPct, titleCase } from "@/lib/format";
import type { Figures, Ratios } from "@/lib/daily";
import { WIDE, WideCells } from "./HeadMeasures";
import ExportCsv from "./ExportCsv";

/** A category under a responsible person, for the chosen days. */
export type DayCatRow = { name: string; f: Figures; x: Ratios };
/** A responsible person (CRP) under a head, with their categories. */
export type DayCrpRow = { name: string; f: Figures; x: Ratios; cats: DayCatRow[] };
/** One head's figures for the chosen days on the Day wise sales tab, with the responsible persons under it. */
export type DayHeadRow = { division: string; role: string; head: string; f: Figures; x: Ratios; crps: DayCrpRow[] };

/** The measures of the Category wise performance tables, in the order and colours of the day table. Value adj is left out:
 *  it is the difference between GPV+OI and GPV. */
const MEASURE_ORDER = [
  { label: "Sales", tint: "tint-blue", m: WIDE.find((w) => w.label === "Sales")! },
  { label: "GPV", tint: "tint-green", m: WIDE.find((w) => w.label === "GPV")! },
  { label: "GPV+OI", tint: "tint-green", m: { ...WIDE.find((w) => w.label === "Adjusted GPV")!, label: "GPV+OI" } },
  { label: "GP%", tint: "tint-amber", m: WIDE.find((w) => w.label === "GP%")! },
  { label: "GP+OI%", tint: "tint-amber", m: { ...WIDE.find((w) => w.label === "Adjusted GP%")!, label: "GP+OI%" } },
  { label: "Footfall", tint: "tint-grey", m: WIDE.find((w) => w.label === "Footfall")! },
  { label: "Basket", tint: "tint-grey", m: WIDE.find((w) => w.label === "Basket")! },
];

/** The figures as the head table's measures read them (this period, the comparison, and their ratios). */
const asHeadRow = (f: Figures, x: Ratios): Partial<HeadRow> => ({
  sales: f.sales, salesLast: f.splySales,
  ff: f.ff, ffLast: f.splyFf,
  bs: x.bs, bsLast: x.splyBs,
  gp: x.gp, gpLast: x.splyGp,
  gpv: f.gpv, gpvLast: f.splyGpv,
  gpOi: x.goi, gpOiLast: x.splyGoi,
  gpvOi: f.gpvOi, gpvOiLast: f.splyGpvOi,
});

/** The Category heads table, for the Day wise sales tab: one row per head, the same measures and columns. The head name
 *  opens its drill-down (responsible persons, then their categories). */
export default function DayHeads({ rows, total, totalLabel, cmpShort, caption, onOpen }: {
  rows: DayHeadRow[]; total: { f: Figures; x: Ratios }; totalLabel: string;
  cmpShort: string;
  caption: string;
  /** Opens a head's drill-down; the key is the division and head. */
  onOpen: (key: string) => void;
}) {
  // footfall and basket show a dash where they cannot be counted exactly for the selection
  const shown = MEASURE_ORDER;
  const tableRef = useRef<HTMLTableElement>(null);
  return (
    <div className="ov-panel ov-table-panel">
      <ExportCsv tableRef={tableRef} filename="category-heads.csv" />
      <div className="ov-table-scroll">
        <table ref={tableRef} className="ov-table dh tinted">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="l dh-c1" title="Division">Div</th>
              <th scope="col" className="l dh-c2">Category role</th>
              <th scope="col" className="l dh-c3">Head</th>
              {shown.map((x) => (
                <Fragment key={x.label}>
                  <th scope="col" className={`${x.tint} grp-start`}>{x.label} this</th>
                  <th scope="col" className={x.tint}>{x.label} {cmpShort}</th>
                  <th scope="col" className={x.tint}>Diff</th>
                  {x.m.growth && <th scope="col" className={x.tint}>GR%</th>}
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.division}|${r.head}`}>
                <td className="l dh-c1" title={r.division}>{abbrOf(r.division)}</td>
                <td className="l dh-c2">{r.role}</td>
                <th scope="row" className="l dh-c3">
                  <button type="button" className="linkish" onClick={() => onOpen(`${r.division}|${r.head}`)}>{r.head} ›</button>
                </th>
                {shown.map((x) => <WideCells key={x.label} m={x.m} r={asHeadRow(r.f, r.x)} tint={x.tint} groupStart />)}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={3} className="l dh-foot">{totalLabel}</th>
                {shown.map((x) => <WideCells key={x.label} m={x.m} r={asHeadRow(total.f, total.x)} tint={x.tint} groupStart />)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Growth of a value against the comparison, in the drill-down's colours; blank where either side is missing or zero. */
function Growth({ now, last }: { now: number | null; last: number | null }) {
  if (!now || !last) return null;
  const g = now / last - 1;
  const t = g > 0 ? "up" : g < 0 ? "down" : "flat";
  return <span className={`delta ${t}`}>{t === "up" ? "▲ " : t === "down" ? "▼ " : ""}{signedPct(g, 2)}</span>;
}

/** Change in percentage points of a ratio against the comparison. */
function PointChange({ now, last }: { now: number | null; last: number | null }) {
  if (now == null || last == null) return null;
  const d = now - last;
  const t = d > 0 ? "up" : d < 0 ? "down" : "flat";
  return <span className={`delta ${t}`}>{t === "up" ? "▲ " : t === "down" ? "▼ " : ""}{signedPct(d, 2)}</span>;
}

/** The seven figures of a row: sales, GPV, GP%, GPV+OI, GP+OI%, footfall and basket, each with its change. */
function MetricCells({ f, x }: { f: Figures; x: Ratios }) {
  return (
    <>
      <td><div>{full(f.sales)}</div><div><Growth now={f.sales} last={f.splySales} /></div></td>
      <td><div>{full(f.gpv)}</div><div><Growth now={f.gpv} last={f.splyGpv} /></div></td>
      <td><div>{pct(x.gp, 2)}</div><div><PointChange now={x.gp} last={x.splyGp} /></div></td>
      <td><div>{full(f.gpvOi)}</div><div><Growth now={f.gpvOi} last={f.splyGpvOi} /></div></td>
      <td><div>{pct(x.goi, 2)}</div><div><PointChange now={x.goi} last={x.splyGoi} /></div></td>
      <td><div>{full(f.ff)}</div><div><Growth now={f.ff} last={f.splyFf} /></div></td>
      <td><div>{full(x.bs)}</div><div><Growth now={x.bs} last={x.splyBs} /></div></td>
    </>
  );
}

/** The drill-down of one head on the Day wise sales tab: its responsible persons, and a person's categories on +. */
export function DayHeadDrill({ head, cmpShort, scopeText, onBack }: {
  head: DayHeadRow; cmpShort: string;
  /** What the figures cover, for example "all stores, month to date". */
  scopeText: string;
  onBack: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const tableRef = useRef<HTMLTableElement>(null);
  const toggle = (name: string) => setOpen((s) => {
    const next = new Set(s);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <button className="linkish" onClick={onBack}>← Back to all heads</button>
          <h2 style={{ marginTop: 8 }}>{head.head}</h2>
          <p className="hint">{titleCase(head.division)} · {roleName(head.role)} · responsible persons and categories (Cat 3) · vs {cmpShort} · {scopeText}</p>
        </div>
      </div>
      <ExportCsv tableRef={tableRef} filename="category-head-drill.csv" />
      <div className="table-wrap">
        <table ref={tableRef}>
          <thead>
            <tr>
              <th scope="col" className="l">Category (Cat 3)</th>
              <th scope="col">Sales</th>
              <th scope="col">GPV</th>
              <th scope="col">GP%</th>
              <th scope="col">GPV+OI</th>
              <th scope="col">GP+OI%</th>
              <th scope="col">Footfall</th>
              <th scope="col">Basket</th>
            </tr>
          </thead>
          <tbody>
            {head.crps.map((c) => {
              const isOpen = open.has(c.name);
              return (
                <Fragment key={c.name}>
                  <tr className="drill-group">
                    <td className="l">
                      <button className="plusbtn" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} categories of ${c.name}`}
                        onClick={() => toggle(c.name)}>
                        {isOpen ? "−" : "+"}
                      </button>
                      <b>{c.name}</b>
                      <div className="sub">{c.cats.length} categor{c.cats.length === 1 ? "y" : "ies"}</div>
                    </td>
                    <MetricCells f={c.f} x={c.x} />
                  </tr>
                  {isOpen && c.cats.map((cat) => (
                    <tr key={`${c.name}|${cat.name}`}>
                      <td className="l"><div>{titleCase(cat.name)}</div></td>
                      <MetricCells f={cat.f} x={cat.x} />
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="l">Total ({head.crps.length} persons)</td>
              <MetricCells f={head.f} x={head.x} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="hint">Click + to show a person's categories.</p>
    </div>
  );
}
