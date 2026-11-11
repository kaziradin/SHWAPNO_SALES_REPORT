"use client";

import { useRef, useState } from "react";
import { crFmt, crSigned, full, growth, pct, signedPct, toneOfNum } from "@/lib/format";
import { dayLong, dayNum, dayShort, difference } from "@/lib/daily";
import { useTooltip, useWidth, type TipRow } from "./charts";

export type DayPoint = { date: string; sply: string; now: number | null; prev: number | null };

/** One line per series, one point per day: this month (navy) against the same day last year (grey).
 *  Money is in crore, ratios in percent, counts (footfall, basket) as whole numbers. Move the pointer anywhere over the chart
 *  to read that day's figures. */
export default function DayLines({ title, kind, points, total, band, totalLabel = "Month to date", prevWord = "last year" }: {
  title: string; kind: "money" | "pct" | "count"; points: DayPoint[]; total: { now: number | null; prev: number | null };
  /** The days chosen in the Period list (one day or a date range), marked with a band. */
  band?: { from: string; to: string };
  /** What the summary line calls the chosen days. */
  totalLabel?: string;
  /** The comparison period in words: "last year" or "last month". */
  prevWord?: string;
}) {
  const { show, hide, node } = useTooltip();
  const { ref, w } = useWidth(560);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const H = 240, top = 14, bottom = 26, left = 66, right = 14;
  const fmt = (v: number) => (kind === "money" ? crFmt(v) : kind === "count" ? full(v) : pct(v, 2));
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
  // The value labels. The higher of a day's two values sits above its point and the lower one below. This month's values
  // are placed first (the last day first of all), then last year's; a label that would run into one already placed is
  // skipped, so no two numbers overlap.
  const nowAbove = points.map((p) => p.now == null || p.prev == null || p.now >= p.prev);
  const labelBoxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const fits = (text: string, cx: number, base: number, size: number) => {
    const half = (text.length * size * 0.6) / 2 + 2;
    const box = { x0: cx - half, x1: cx + half, y0: base - size, y1: base + 3 };
    if (labelBoxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return false;
    labelBoxes.push(box);
    return true;
  };
  const order = [lastIdx, ...points.map((_, i) => i).filter((i) => i !== lastIdx)].filter((i) => i >= 0);
  const valueLabels: { key: string; x: number; y: number; text: string; now: boolean }[] = [];
  for (const i of order) {
    const p = points[i];
    if (p.now == null) continue;
    const text = fmt(p.now), cy = nowAbove[i] ? y(p.now) - 8 : y(p.now) + 14;
    if (fits(text, x(i), cy, 10.5)) valueLabels.push({ key: `n${i}`, x: x(i), y: cy, text, now: true });
  }
  for (const i of order) {
    const p = points[i];
    if (p.prev == null) continue;
    const text = fmt(p.prev), cy = nowAbove[i] ? y(p.prev) + 14 : y(p.prev) - 8;
    if (fits(text, x(i), cy, 10)) valueLabels.push({ key: `p${i}`, x: x(i), y: cy, text, now: false });
  }
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
      [`Same day ${prevWord}`, p.prev == null ? "–" : fmt(p.prev)],
      ["Difference", d == null ? "–" : kind === "money" ? crSigned(d) : kind === "count" ? `${d >= 0 ? "+" : "−"}${full(Math.abs(d))}` : signedPct(d, 2)],
    ];
    if (kind !== "pct") rows.push(["Change", signedPct(growth(p.now, p.prev), 2)]);
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
  const change = kind === "pct" ? difference(total.now, total.prev) : growth(total.now, total.prev);
  const valueText = (v: number | null) => (v == null ? "–" : fmt(v));

  return (
    <div className="ov-panel">
      <h3>{title}</h3>
      <div className="day-sum">
        <span>
          {totalLabel} <b>{valueText(total.now)}</b> · same days {prevWord} <b>{valueText(total.prev)}</b> ·{" "}
          <span className={`delta ${toneOfNum(change)}`}>{signedPct(change, 2)}</span>
        </span>
        <span className="day-legend">
          <span><i className="sw sw-this" />This month</span>
          <span><i className="sw sw-last" />Same day {prevWord}</span>
        </span>
      </div>
      <div ref={ref}>
        <svg ref={svgRef} width={w} height={H} viewBox={`0 0 ${w} ${H}`} role="img"
          aria-label={`${title}: this month against the same day ${prevWord}`}>
          {ticks.map((t, k) => (
            <g key={k}>
              <line x1={left} x2={w - right} y1={y(t)} y2={y(t)} className="ov-grid" />
              <text x={left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} className="ov-col-name">{fmt(t)}</text>
            </g>
          ))}
          {points.map((p, i) => band && p.date >= band.from && p.date <= band.to && (
            <rect key={`sel-${p.date}`} x={x(i) - plotW / n / 2} y={top} width={plotW / n} height={plotH} fill="rgba(29, 78, 216, 0.12)" />
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
          {valueLabels.map((l) => (
            <text key={l.key} x={l.x} y={l.y} textAnchor="middle" pointerEvents="none"
              fontSize={l.now ? 10.5 : 10} fontWeight={l.now ? 600 : 400} style={{ fill: l.now ? "var(--this)" : "#6b7a90" }}>
              {l.text}
            </text>
          ))}
          {/* one layer over the whole plot: the nearest day is read from the pointer position */}
          <rect x={left} y={0} width={plotW} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={onLeave} />
        </svg>
      </div>
      {node}
    </div>
  );
}
