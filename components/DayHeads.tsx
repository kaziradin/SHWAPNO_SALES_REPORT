"use client";

import { Fragment, useState } from "react";
import type { HeadRow } from "@/lib/types";
import { abbrOf, crOrDash, pct, roleName, signedPct, titleCase } from "@/lib/format";
import type { Figures, Ratios } from "@/lib/daily";
import { WIDE, WideCells } from "./HeadMeasures";

/** A category under a responsible person, for the chosen days. */
export type DayCatRow = { name: string; f: Figures; x: Ratios };
/** A responsible person (CRP) under a head, with their categories. */
export type DayCrpRow = { name: string; f: Figures; x: Ratios; cats: DayCatRow[] };
/** One head's figures for the chosen days on the Day wise sales tab, with the responsible persons under it. */
export type DayHeadRow = { division: string; role: string; head: string; f: Figures; x: Ratios; crps: DayCrpRow[] };

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
export default function DayHeads({ rows, total, totalLabel, showFootfall, cmpShort, caption, onOpen }: {
  rows: DayHeadRow[]; total: { f: Figures; x: Ratios }; totalLabel: string;
  /** Footfall and basket are hidden when a CRP or category is chosen, as on the rest of the tab. */
  showFootfall: boolean;
  cmpShort: string;
  caption: string;
  /** Opens a head's drill-down; the key is the division and head. */
  onOpen: (key: string) => void;
}) {
  const shown = showFootfall ? WIDE : WIDE.filter((m) => !m.needsFootfall);
  return (
    <div className="ov-panel ov-table-panel">
      <div className="ov-table-scroll">
        <table className="ov-table dh">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="l dh-c1" title="Division">Div</th>
              <th scope="col" className="l dh-c2">Category role</th>
              <th scope="col" className="l dh-c3">Head</th>
              {shown.map((m) => (
                <Fragment key={m.label}>
                  <th scope="col">{m.label} this</th>
                  <th scope="col">{m.label} {cmpShort}</th>
                  <th scope="col">Diff</th>
                  {m.growth && <th scope="col">GR%</th>}
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
                {shown.map((m) => <WideCells key={m.label} m={m} r={asHeadRow(r.f, r.x)} />)}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <th scope="row" colSpan={3} className="l dh-foot">{totalLabel}</th>
                {shown.map((m) => <WideCells key={m.label} m={m} r={asHeadRow(total.f, total.x)} />)}
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

/** The five figures of a row: sales, GPV, GP%, GPV+OI and GP+OI%, each with its change. */
function MetricCells({ f, x }: { f: Figures; x: Ratios }) {
  return (
    <>
      <td><div>{crOrDash(f.sales)}</div><div><Growth now={f.sales} last={f.splySales} /></div></td>
      <td><div>{crOrDash(f.gpv)}</div><div><Growth now={f.gpv} last={f.splyGpv} /></div></td>
      <td><div>{pct(x.gp, 2)}</div><div><PointChange now={x.gp} last={x.splyGp} /></div></td>
      <td><div>{crOrDash(f.gpvOi)}</div><div><Growth now={f.gpvOi} last={f.splyGpvOi} /></div></td>
      <td><div>{pct(x.goi, 2)}</div><div><PointChange now={x.goi} last={x.splyGoi} /></div></td>
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col" className="l">Category (Cat 3)</th>
              <th scope="col">Sales</th>
              <th scope="col">GPV</th>
              <th scope="col">GP%</th>
              <th scope="col">GPV+OI</th>
              <th scope="col">GP+OI%</th>
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
