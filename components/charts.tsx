"use client";

import { useEffect, useRef, useState } from "react";

/** Render charts at their real pixel width so text stays 11px instead of scaling with the viewBox. */
export function useWidth(fallback = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

export type TipRow = [string, string];
type Tip = { x: number; y: number; title: string; rows: TipRow[] } | null;

export function useTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.MouseEvent, title: string, rows: TipRow[]) => {
    const pad = 14;
    const x = Math.min(e.clientX + pad, window.innerWidth - 240);
    setTip({ x, y: e.clientY + pad, title, rows });
  };
  const hide = () => setTip(null);
  // the tooltip is position: fixed, so drop it when the page scrolls under the pointer
  useEffect(() => {
    if (!tip) return;
    window.addEventListener("scroll", hide, { passive: true });
    return () => window.removeEventListener("scroll", hide);
  }, [tip]);
  const node = tip ? (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      <b>{tip.title}</b>
      {tip.rows.map(([k, v]) => (
        <div className="row" key={k}>
          <span>{k}</span>
          <span>{v}</span>
        </div>
      ))}
    </div>
  ) : null;
  return { show, hide, node };
}

/** Horizontal bars: current period (blue) over comparison period (neutral), one row per item. */
export function PairedBars({
  items,
  format,
  tipRows,
  labelWidth = 150,
}: {
  items: { label: string; now: number; last: number; note?: string; noteTone?: "up" | "down" | "flat" }[];
  format: (v: number) => string;
  tipRows: (i: number) => TipRow[];
  labelWidth?: number;
}) {
  const { show, hide, node } = useTooltip();
  const { ref, w: W } = useWidth();
  labelWidth = Math.min(labelWidth, W * 0.3);
  const right = 110;
  const rowH = 38;
  const barH = 11;
  const H = items.length * rowH + 4;
  const max = Math.max(1, ...items.flatMap((d) => [d.now, d.last]));
  const plotW = W - labelWidth - right;
  const sx = (v: number) => (Math.max(0, v) / max) * plotW;

  return (
    <div ref={ref}>
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sales this period versus comparison period">
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line key={t} className="gridline" x1={labelWidth + plotW * t} x2={labelWidth + plotW * t} y1={0} y2={H - 4} />
        ))}
        <line className="baseline" x1={labelWidth} x2={labelWidth} y1={0} y2={H - 4} />
        {items.map((d, i) => {
          const y = i * rowH + 6;
          const wNow = sx(d.now);
          const wLast = sx(d.last);
          return (
            <g key={d.label}>
              <text x={labelWidth - 10} y={y + barH + 3} textAnchor="end" dominantBaseline="middle">
                {d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label}
              </text>
              <path d={roundRight(labelWidth, y, wNow, barH)} fill="var(--this)" />
              <path d={roundRight(labelWidth, y + barH + 2, wLast, barH)} fill="var(--last)" />
              <text className="val" x={labelWidth + wNow + 6} y={y + barH / 2 + 1} dominantBaseline="middle">
                {format(d.now)}
              </text>
              {d.note && (
                <text
                  x={W - 4}
                  y={y + barH + 1}
                  textAnchor="end"
                  dominantBaseline="middle"
                  style={{ fill: `var(--${d.noteTone === "up" ? "up" : d.noteTone === "down" ? "down" : "muted"})`, fontWeight: 600 }}
                >
                  {d.note}
                </text>
              )}
              <rect
                className="hit"
                x={0}
                y={i * rowH}
                width={W}
                height={rowH}
                onMouseMove={(e) => show(e, d.label, tipRows(i))}
                onMouseLeave={hide}
              />
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

/** Diverging bars around zero: positive growth blue (right), negative red (left). */
export function DivergingBars({
  items,
  format,
  tipRows,
  labelWidth = 170,
}: {
  items: { label: string; value: number }[];
  format: (v: number) => string;
  tipRows: (i: number) => TipRow[];
  labelWidth?: number;
}) {
  const { show, hide, node } = useTooltip();
  const { ref, w: W } = useWidth();
  labelWidth = Math.min(labelWidth, W * 0.38);
  const rowH = 26;
  const barH = 14;
  const H = items.length * rowH + 4;
  // One extreme outlier (e.g. a tiny division at +566%) would flatten every other bar:
  // scale to the next-largest value and clip the outlier, marking it with a break.
  const abs = items.map((d) => Math.abs(d.value)).sort((a, b) => b - a);
  const ext = Math.max(0.01, abs.length > 2 && abs[0] > abs[1] * 3 ? abs[1] * 1.25 : abs[0] ?? 0);
  const plotW = W - labelWidth - 8;
  const pad = 56; // room for the value label on each side
  const half = (plotW - pad * 2) / 2;
  const zero = labelWidth + pad + half;
  const sx = (v: number) => (Math.min(Math.abs(v), ext) / ext) * half;

  return (
    <div ref={ref}>
      <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Growth by item">
        <line className="baseline" x1={zero} x2={zero} y1={0} y2={H - 4} />
        {items.map((d, i) => {
          const y = i * rowH + (rowH - barH) / 2;
          const w = sx(d.value);
          const pos = d.value >= 0;
          return (
            <g key={d.label + i}>
              <text x={labelWidth - 10} y={y + barH / 2 + 1} textAnchor="end" dominantBaseline="middle">
                {d.label.length > 26 ? d.label.slice(0, 25) + "…" : d.label}
              </text>
              <path
                d={pos ? roundRight(zero, y, w, barH) : roundLeft(zero, y, w, barH)}
                fill={pos ? "var(--pos)" : "var(--neg)"}
              />
              {Math.abs(d.value) > ext && (
                // axis-break mark: the bar is longer than drawn
                <path
                  d={`M${zero + (pos ? w - 14 : -w + 10)},${y + barH + 1} l4,${-barH - 2} M${zero + (pos ? w - 9 : -w + 15)},${y + barH + 1} l4,${-barH - 2}`}
                  stroke="var(--surface)"
                  strokeWidth={2.5}
                />
              )}
              <text
                className="val"
                x={pos ? zero + w + 5 : zero - w - 5}
                y={y + barH / 2 + 1}
                textAnchor={pos ? "start" : "end"}
                dominantBaseline="middle"
              >
                {format(d.value)}
              </text>
              <rect
                className="hit"
                x={0}
                y={i * rowH}
                width={W}
                height={rowH}
                onMouseMove={(e) => show(e, d.label, tipRows(i))}
                onMouseLeave={hide}
              />
            </g>
          );
        })}
      </svg>
      {node}
    </div>
  );
}

// Bars anchored to the baseline: square at the axis, 4px rounded at the data end.
function roundRight(x: number, y: number, w: number, h: number) {
  if (w <= 0) return "";
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}
function roundLeft(x: number, y: number, w: number, h: number) {
  if (w <= 0) return "";
  const r = Math.min(4, w, h / 2);
  return `M${x},${y}H${x - w + r}Q${x - w},${y} ${x - w},${y + r}V${y + h - r}Q${x - w},${y + h} ${x - w + r},${y + h}H${x}Z`;
}
