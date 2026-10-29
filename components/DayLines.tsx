"use client";

import { useRef, useState } from "react";
import { crFmt, crSigned, growth, pct, signedPct, toneOfNum } from "@/lib/format";
import { dayLong, dayNum, dayShort, difference } from "@/lib/daily";
import { useTooltip, useWidth, type TipRow } from "./charts";

export type DayPoint = { date: string; sply: string; now: number | null; prev: number | null };

/** One line per series, one point per day: this month (navy) against the same day last year (grey).
 *  Money is in crore, ratios in percent. Move the pointer anywhere over the chart to read that day's figures. */
export default function DayLines({ title, kind, points, total }: {
  title: string; kind: "money" | "pct"; points: DayPoint[]; total: { now: number | null; prev: number | null };
}) {
  const { show, hide, node } = useTooltip();
  const { ref, w } = useWidth(560);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const H = 240, top = 14, bottom = 26, left = 66, right = 14;
  const fmt = (v: number) => (kind === "money" ? crFmt(v) : pct(v, 2));
  const values = points.flatMap((p) => [p.now, p.prev]).filter((v): v is number => v != null);
  const lo0 = values.length ? Math.min(...values) : 0;
  const hi0 = values.length ? Math.max(...values) : 1;
  const padding = (hi0 - lo0) * 0.08 || Math.abs(hi0) * 0.01 || 1;
  const lo = lo0 - padding, hi = hi0 + padding;
  const plotW = Math.max(40, w - left - right), plotH = H - top - bottom;
  const n = Math.max(1, points.length);
  const x = (i: number) => left + (plotW * (i + 0.5)) / n;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * plotH;
  const line = (key: "now" | "prev") =>
    points.map((p, i) => { const v = p[key]; return v == null ? null : `${x(i)},${y(v)}`; }).filter(Boolean).join(" ");
  // label every day when there is room, otherwise every second, third... day; the last day is always labelled
  const step = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 24))));
  const lastIdx = points.length - 1;
  const lastNow = lastIdx >= 0 ? points[lastIdx].now : null;
  const ticks = [hi0, (hi0 + lo0) / 2, lo0];

  const indexAt = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const px = clientX - svg.getBoundingClientRect().left - left;
    return Math.min(n - 1, Math.max(0, Math.floor((px / plotW) * n)));
  };
  const tipFor = (i: number): TipRow[] => {
    const p = points[i];
    const d = difference(p.now, p.prev);
    const rows: TipRow[] = [
      ["This day", p.now == null ? "–" : fmt(p.now)],
      ["Same day last year", p.prev == null ? "–" : fmt(p.prev)],
      ["Difference", d == null ? "–" : kind === "money" ? crSigned(d) : signedPct(d, 2)],
    ];
    if (kind === "money") rows.push(["Change", signedPct(growth(p.now, p.prev), 2)]);
    return rows;
  };
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const i = indexAt(e.clientX);
    if (i == null || !points[i]) return;
    setHover(i);
    show(e, `${dayLong(points[i].date)} · vs ${dayShort(points[i].sply)}`, tipFor(i));
  };
  const onLeave = () => {
    setHover(null);
    hide();
  };

  // month to date against the same days last year, with the change in the same units as the chart
  const change = kind === "money" ? growth(total.now, total.prev) : difference(total.now, total.prev);
  const valueText = (v: number | null) => (kind === "money" ? (v == null ? "–" : crFmt(v)) : pct(v, 2));

  return (
    <div className="ov-panel">
      <h3>{title}</h3>
      <div className="day-sum">
        <span>
          Month to date <b>{valueText(total.now)}</b> · same days last year <b>{valueText(total.prev)}</b> ·{" "}
          <span className={`delta ${toneOfNum(change)}`}>{signedPct(change, 2)}</span>
        </span>
        <span className="day-legend">
          <span><i className="sw sw-this" />This month</span>
          <span><i className="sw sw-last" />Same day last year</span>
        </span>
      </div>
      <div ref={ref}>
        <svg ref={svgRef} width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img"
          aria-label={`${title}: this month against the same day last year`}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={left} x2={w - right} y1={y(t)} y2={y(t)} className="ov-grid" />
              <text x={left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} className="ov-col-name">{fmt(t)}</text>
            </g>
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={top + plotH} className="day-guide" />}
          <polyline points={line("prev")} fill="none" style={{ stroke: "var(--last)" }} strokeWidth={2} strokeLinejoin="round" />
          <polyline points={line("now")} fill="none" style={{ stroke: "var(--this)" }} strokeWidth={2.5} strokeLinejoin="round" />
          {points.map((p, i) => (
            <g key={p.date}>
              {p.prev != null && <circle cx={x(i)} cy={y(p.prev)} r={hover === i ? 4.5 : 2.5} style={{ fill: "var(--last)" }} />}
              {p.now != null && <circle cx={x(i)} cy={y(p.now)} r={hover === i ? 5 : 3} style={{ fill: "var(--this)" }} />}
              {(i % step === 0 || i === lastIdx) && (
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} className="ov-col-name">{dayNum(p.date)}</text>
              )}
            </g>
          ))}
          {/* one layer over the whole plot: the nearest day is read from the pointer position */}
          <rect x={left} y={0} width={plotW} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={onLeave} />
          {lastNow != null && (
            <text x={x(lastIdx)} y={y(lastNow) - 9} textAnchor="end" fontSize={12} style={{ fill: "var(--this)", fontWeight: 600 }}
              pointerEvents="none">
              {fmt(lastNow)}
            </text>
          )}
        </svg>
      </div>
      {node}
    </div>
  );
}
