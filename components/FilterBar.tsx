"use client";

import type { SegmentKey } from "@/lib/types";
import { monthName } from "@/lib/format";

export type Cmp = "sply" | "splm";

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All stores",
  own: "Own stores",
  franchise: "Franchise stores",
  same: "Same stores",
  ownSame: "Own same stores",
  franchiseSame: "Franchise same stores",
  newOwn: "New own stores",
  newFranchise: "New franchise",
};

export const CMP_LABEL: Record<Cmp, { short: string; long: string }> = {
  sply: { short: "SPLY", long: "same period last year" },
  splm: { short: "SPLM", long: "same period last month" },
};

/**
 * Shared filter bar: month, store group and comparison period.
 * Sticky, so the filters stay in view while scrolling. Only the Overview uses it for now;
 * other tabs will move onto it as they are redesigned.
 */
export default function FilterBar({
  months, month, onMonth,
  segments, segment, onSegment,
  cmp, onCmp,
  layout = "bar",
}: {
  months: string[]; month: string; onMonth: (m: string) => void;
  segments: SegmentKey[]; segment: SegmentKey; onSegment: (s: SegmentKey) => void;
  cmp: Cmp; onCmp: (c: Cmp) => void;
  /** "bar": sticky horizontal bar; "side": stacked fields for the sidebar */
  layout?: "bar" | "side";
}) {
  return (
    <div className={`fbar${layout === "side" ? " side" : ""}`} role="toolbar" aria-label="Report filters">
      <label className="fbar-field">
        <span>Month</span>
        <select value={month} onChange={(e) => onMonth(e.target.value)}>
          {months.map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
      </label>
      <label className="fbar-field">
        <span>Store group</span>
        <select value={segment} onChange={(e) => onSegment(e.target.value as SegmentKey)}>
          {segments.map((k) => <option key={k} value={k}>{SEGMENT_LABELS[k]}</option>)}
        </select>
      </label>
      <div className="fbar-field">
        <span>Compare with</span>
        <div className="seg" role="group" aria-label="Comparison period">
          {(["sply", "splm"] as Cmp[]).map((c) => (
            <button key={c} aria-pressed={cmp === c} onClick={() => onCmp(c)} title={CMP_LABEL[c].long}>
              vs {CMP_LABEL[c].short}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
