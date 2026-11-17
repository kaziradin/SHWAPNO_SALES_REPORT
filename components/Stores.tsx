"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoreRow, StoresData } from "@/lib/types";
import { arrowOf, crOrDash, full, growth, pct, signedPct, titleCase, toneOfNum } from "@/lib/format";
import { CMP_SHORT, CMP_WORD, type Cmp, uniqSorted } from "@/lib/daily";

type Kind = "money" | "count" | "ratio";

/** The tint of each measure's columns, as on the other day-wise tables. */
const TINT: Record<string, string> = { Sales: "tint-blue", GPV: "tint-green", "GP%": "tint-amber", Footfall: "tint-grey", Basket: "tint-grey" };

/** The sum of one period's figure over a list of outlets. */
const sumOf = (rows: StoreRow[], p: Cmp | "this", k: "sales" | "gpv" | "ff") => rows.reduce((t, r) => t + r[p][k], 0);

/** One measure's three cells: this period, the comparison, and the change (a growth for money and counts, points for GP%). */
function Metric({ now, last, kind, tint, label }: { now: number | null; last: number | null; kind: Kind; tint: string; label: string }) {
  const show = (v: number | null) => (v == null ? "–" : kind === "money" ? crOrDash(v) : kind === "count" ? full(v) : pct(v, 2));
  const change = kind === "ratio" ? (now != null && last != null ? now - last : null) : growth(now, last);
  const text = change == null ? "–" : kind === "ratio" ? signedPct(change, 2) : `${arrowOf(toneOfNum(change))}${signedPct(change, 2)}`;
  return (
    <>
      <td className={`${tint} grp-start`} aria-label={`${label} this`}>{show(now)}</td>
      <td className={tint} aria-label={`${label} comparison`}>{show(last)}</td>
      <td className={tint}><span className={`delta ${toneOfNum(change)}`}>{text}</span></td>
    </>
  );
}

/** The Store wise performance tab: one row per outlet, with its leader, zonal manager, division, format and status. */
export default function Stores() {
  const [data, setData] = useState<StoresData | null>(null);
  const [cmp, setCmp] = useState<Cmp>("sply");
  const [scope, setScope] = useState<"all" | "same">("all");
  const [status, setStatus] = useState("All");
  const [division, setDivision] = useState("");
  const [format, setFormat] = useState("");
  const [leader, setLeader] = useState("");
  const [zonal, setZonal] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let live = true;
    import("@/data/stores.json").then((m) => {
      if (live) setData(m.default as unknown as StoresData);
    });
    return () => { live = false; };
  }, []);

  const outlets = data?.outlets ?? [];
  const lists = useMemo(() => ({
    divisions: uniqSorted(outlets.map((r) => r.division || null)),
    formats: uniqSorted(outlets.map((r) => r.format || null)),
    leaders: uniqSorted(outlets.map((r) => r.leader || null)),
    zonals: uniqSorted(outlets.map((r) => r.zonal || null)),
  }), [outlets]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return outlets
      .filter((r) => (scope === "all" || (cmp === "sply" ? r.sameSply : r.sameSplm)))
      .filter((r) => status === "All" || r.status === status)
      .filter((r) => !division || r.division === division)
      .filter((r) => !format || r.format === format)
      .filter((r) => !leader || r.leader === leader)
      .filter((r) => !zonal || r.zonal === zonal)
      .filter((r) => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .filter((r) => r.this.sales > 0 || r[cmp].sales > 0)
      .sort((a, b) => b.this.sales - a.this.sales);
  }, [outlets, scope, cmp, status, division, format, leader, zonal, search]);

  if (!data) return <p className="hint">Loading the store figures…</p>;

  // the totals of the outlets shown
  const s = sumOf(rows, "this", "sales"), sl = sumOf(rows, cmp, "sales");
  const g = sumOf(rows, "this", "gpv"), gl = sumOf(rows, cmp, "gpv");
  const f = sumOf(rows, "this", "ff"), fl = sumOf(rows, cmp, "ff");
  const gp = s ? g / s : null, gpl = sl ? gl / sl : null;
  const bs = f ? s / f : null, bsl = fl ? sl / fl : null;
  const short = CMP_SHORT[cmp];
  const kFmt = (v: number) => `${(v / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  const kpi = [
    { label: "Sales", value: crOrDash(s), sub: `${short}: ${crOrDash(sl)}`, delta: growth(s, sl), ratio: false },
    { label: "GPV", value: crOrDash(g), sub: `${short}: ${crOrDash(gl)}`, delta: growth(g, gl), ratio: false },
    { label: "GP%", value: pct(gp, 2), sub: `${short}: ${pct(gpl, 2)}`, delta: gp != null && gpl != null ? gp - gpl : null, ratio: true },
    { label: "Footfall", value: kFmt(f), sub: `${short}: ${kFmt(fl)}`, delta: growth(f, fl), ratio: false },
    { label: "Basket", value: full(bs), sub: `${short}: ${full(bsl)}`, delta: growth(bs, bsl), ratio: false },
  ];

  const select = (label: string, value: string, set: (v: string) => void, options: string[], all: string) => (
    <label>{label}
      <select value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );

  return (
    <div className="ov">
      <div className="drill-filters">
        <div className="seg" role="group" aria-label="Comparison period">
          {(["sply", "splm"] as Cmp[]).map((c) => (
            <button key={c} type="button" aria-pressed={cmp === c} onClick={() => setCmp(c)}>vs {CMP_SHORT[c]}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Store scope">
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>All stores</button>
          <button type="button" aria-pressed={scope === "same"} onClick={() => setScope("same")}>Same stores</button>
        </div>
        <label>Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="All">All</option>
            <option value="Own">Own</option>
            <option value="Franchise">Franchise</option>
          </select>
        </label>
        {select("Division", division, setDivision, lists.divisions, "All divisions")}
        {select("Format", format, setFormat, lists.formats, "All formats")}
        {select("Leader", leader, setLeader, lists.leaders, "All leaders")}
        {select("Zonal", zonal, setZonal, lists.zonals, "All zonals")}
        <label>Outlet search
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name or code" aria-label="Outlet search" />
        </label>
        <button type="button" className="linkish"
          onClick={() => { setCmp("sply"); setScope("all"); setStatus("All"); setDivision(""); setFormat(""); setLeader(""); setZonal(""); setSearch(""); }}>
          Reset all filters
        </button>
      </div>

      <section className="ov-kpis five" aria-label="Store wise key figures">
        {kpi.map((k) => {
          const tone = toneOfNum(k.delta);
          const text = k.delta == null ? "" : k.ratio ? signedPct(k.delta, 2) : `${arrowOf(tone)}${signedPct(k.delta, 2)}`;
          return (
            <div className="ov-kpi" key={k.label}>
              <div className="ov-kpi-label">{k.label}</div>
              <div className="ov-kpi-value">{k.value}</div>
              <div className="ov-kpi-cmp">{k.sub}</div>
              <div className="ov-kpi-delta"><span className={`ov-chg ${tone}`}>{text}</span></div>
            </div>
          );
        })}
      </section>
      <p className="ov-note">
        {rows.length} {rows.length === 1 ? "outlet" : "outlets"} · {data.periodLabel} · compared with the same days {CMP_WORD[cmp]}
      </p>

      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table stores-table tinted">
            <thead>
              <tr>
                <th scope="col" className="l st-c1">Code</th>
                <th scope="col" className="l st-c2">Outlet</th>
                <th scope="col" className="l">Division</th>
                <th scope="col" className="l">Format</th>
                <th scope="col" className="l">Status</th>
                <th scope="col" className="l">Leader</th>
                <th scope="col" className="l">Zonal</th>
                <th scope="col" className="l">Same store</th>
                <th scope="col" className={`${TINT.Sales} grp-start`}>Sales this</th>
                <th scope="col" className={TINT.Sales}>Sales {short}</th>
                <th scope="col" className={TINT.Sales}>GR%</th>
                <th scope="col" className={`${TINT.GPV} grp-start`}>GPV this</th>
                <th scope="col" className={TINT.GPV}>GPV {short}</th>
                <th scope="col" className={TINT.GPV}>GR%</th>
                <th scope="col" className={`${TINT["GP%"]} grp-start`}>GP% this</th>
                <th scope="col" className={TINT["GP%"]}>GP% {short}</th>
                <th scope="col" className={TINT["GP%"]}>Diff</th>
                <th scope="col" className={`${TINT.Footfall} grp-start`}>Footfall this</th>
                <th scope="col" className={TINT.Footfall}>Footfall {short}</th>
                <th scope="col" className={TINT.Footfall}>GR%</th>
                <th scope="col" className={`${TINT.Basket} grp-start`}>Basket this</th>
                <th scope="col" className={TINT.Basket}>Basket {short}</th>
                <th scope="col" className={TINT.Basket}>GR%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const gpNow = r.this.sales ? r.this.gpv / r.this.sales : null;
                const gpLast = r[cmp].sales ? r[cmp].gpv / r[cmp].sales : null;
                const basketNow = r.this.ff ? r.this.sales / r.this.ff : null;
                const basketLast = r[cmp].ff ? r[cmp].sales / r[cmp].ff : null;
                return (
                  <tr key={r.code}>
                    <td className="l st-c1">{r.code}</td>
                    <td className="l st-c2" title={r.name}>{r.name}</td>
                    <td className="l">{r.division ? titleCase(r.division) : "–"}</td>
                    <td className="l">{r.format || "–"}</td>
                    <td className="l">{r.status}</td>
                    <td className="l">{r.leader || "–"}</td>
                    <td className="l">{r.zonal || "–"}</td>
                    <td className="l">{(cmp === "sply" ? r.sameSply : r.sameSplm) ? "Yes" : "No"}</td>
                    <Metric now={r.this.sales} last={r[cmp].sales} kind="money" tint={TINT.Sales} label="Sales" />
                    <Metric now={r.this.gpv} last={r[cmp].gpv} kind="money" tint={TINT.GPV} label="GPV" />
                    <Metric now={gpNow} last={gpLast} kind="ratio" tint={TINT["GP%"]} label="GP%" />
                    <Metric now={r.this.ff} last={r[cmp].ff} kind="count" tint={TINT.Footfall} label="Footfall" />
                    <Metric now={basketNow} last={basketLast} kind="count" tint={TINT.Basket} label="Basket" />
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row" colSpan={8} className="l">Total · {rows.length} {rows.length === 1 ? "outlet" : "outlets"}</th>
                  <Metric now={s} last={sl} kind="money" tint={TINT.Sales} label="Sales" />
                  <Metric now={g} last={gl} kind="money" tint={TINT.GPV} label="GPV" />
                  <Metric now={gp} last={gpl} kind="ratio" tint={TINT["GP%"]} label="GP%" />
                  <Metric now={f} last={fl} kind="count" tint={TINT.Footfall} label="Footfall" />
                  <Metric now={bs} last={bsl} kind="count" tint={TINT.Basket} label="Basket" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
