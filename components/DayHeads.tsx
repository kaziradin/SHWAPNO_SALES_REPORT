"use client";

import { Fragment, useState } from "react";
import type { HeadRow } from "@/lib/types";
import { abbrOf, titleCase } from "@/lib/format";
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

/** Adds a key to a set, or removes it when it is there. */
const toggled = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

/** The Category heads table, for the Day wise sales tab: one row per head, the same measures and columns. A head opens
 *  to its responsible persons (CRPs), and a person opens to their categories. */
export default function DayHeads({ rows, total, totalLabel, showFootfall, cmpShort, caption }: {
  rows: DayHeadRow[]; total: { f: Figures; x: Ratios }; totalLabel: string;
  /** Footfall and basket are hidden when a CRP or category is chosen, as on the rest of the tab. */
  showFootfall: boolean;
  cmpShort: string;
  caption: string;
}) {
  const shown = showFootfall ? WIDE : WIDE.filter((m) => !m.needsFootfall);
  const [openHeads, setOpenHeads] = useState<Set<string>>(new Set());
  const [openCrps, setOpenCrps] = useState<Set<string>>(new Set());
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
            {rows.map((r) => {
              const hk = `${r.division}|${r.head}`;
              const isOpen = openHeads.has(hk);
              return (
                <Fragment key={hk}>
                  <tr>
                    <td className="l dh-c1" title={r.division}>{abbrOf(r.division)}</td>
                    <td className="l dh-c2">{r.role}</td>
                    <th scope="row" className="l dh-c3">
                      <button type="button" className="linkish" aria-expanded={isOpen}
                        onClick={() => setOpenHeads((s) => toggled(s, hk))}>
                        {isOpen ? "−" : "+"} {r.head}
                      </button>
                    </th>
                    {shown.map((m) => <WideCells key={m.label} m={m} r={asHeadRow(r.f, r.x)} />)}
                  </tr>
                  {isOpen && r.crps.map((c) => {
                    const ck = `${hk}|${c.name}`;
                    const cOpen = openCrps.has(ck);
                    return (
                      <Fragment key={ck}>
                        <tr className="dh-sub">
                          <td className="dh-c1" />
                          <td className="dh-c2" />
                          <th scope="row" className="l dh-c3 dh-crp">
                            <button type="button" className="linkish" aria-expanded={cOpen}
                              onClick={() => setOpenCrps((s) => toggled(s, ck))}>
                              {cOpen ? "−" : "+"} {c.name}
                            </button>
                          </th>
                          {shown.map((m) => <WideCells key={m.label} m={m} r={asHeadRow(c.f, c.x)} />)}
                        </tr>
                        {cOpen && c.cats.map((cat) => (
                          <tr key={`${ck}|${cat.name}`} className="dh-sub">
                            <td className="dh-c1" />
                            <td className="dh-c2" />
                            <td className="l dh-c3 dh-cat">{titleCase(cat.name)}</td>
                            {shown.map((m) => <WideCells key={m.label} m={m} r={asHeadRow(cat.f, cat.x)} />)}
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}
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
