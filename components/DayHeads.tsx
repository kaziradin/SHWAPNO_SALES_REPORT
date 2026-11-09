"use client";

import { Fragment } from "react";
import type { HeadRow } from "@/lib/types";
import { abbrOf, roleName } from "@/lib/format";
import type { Figures, Ratios } from "@/lib/daily";
import { WIDE, WideCells } from "./HeadMeasures";

/** One head's figures for the chosen days on the Day wise sales tab. */
export type DayHeadRow = { division: string; role: string; head: string; f: Figures; x: Ratios };

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

/** The Category heads table, for the Day wise sales tab: one row per head, the same measures and columns. */
export default function DayHeads({ rows, total, totalLabel, showFootfall, cmpShort, caption }: {
  rows: DayHeadRow[]; total: { f: Figures; x: Ratios }; totalLabel: string;
  /** Footfall and basket are hidden when a CRP or category is chosen, as on the rest of the tab. */
  showFootfall: boolean;
  cmpShort: string;
  caption: string;
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
              <th scope="col" className="l dh-c2" title="Category role">Role</th>
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
              <tr key={r.division + r.head}>
                <td className="l dh-c1" title={r.division}>{abbrOf(r.division)}</td>
                <td className="l dh-c2">{roleName(r.role)}</td>
                <th scope="row" className="l dh-c3">{r.head}</th>
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
