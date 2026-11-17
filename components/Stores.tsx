"use client";

import { useEffect, useMemo, useState } from "react";
import type { StoreDay, StoresData } from "@/lib/types";
import { arrowOf, crOrDash, full, growth, pct, signedPct, titleCase, toneOfNum } from "@/lib/format";
import { CMP_SHORT, CMP_WORD, type Cmp, dayLong, type StoreGroup, type StoreType, uniqSorted } from "@/lib/daily";

type Kind = "money" | "count" | "ratio";

/** The filter labels, as on the Category wise performance tab. */
const STORE_GROUP_LABEL: Record<StoreGroup, string> = { all: "All stores", same: "Same stores" };
const TYPE_LABEL: Record<StoreType, string> = { all: "Own and franchise", own: "Own stores", fran: "Franchise stores" };

/** The tint of each measure's columns, as on the other day-wise tables. */
const TINT: Record<string, string> = { Sales: "tint-blue", GPV: "tint-green", "GP%": "tint-amber", Footfall: "tint-grey", Basket: "tint-grey" };

/** One outlet's sales, GPV and footfall over the chosen days, for one period. */
type Sum = { sales: number; gpv: number; ff: number };

const sumDays = (days: StoreDay[], idx: number[]): Sum => {
  const t: Sum = { sales: 0, gpv: 0, ff: 0 };
  for (const i of idx) {
    const d = days[i];
    t.sales += d[0]; t.gpv += d[1]; t.ff += d[2];
  }
  return t;
};

const addSums = (rows: Sum[]): Sum => rows.reduce<Sum>((t, r) => ({ sales: t.sales + r.sales, gpv: t.gpv + r.gpv, ff: t.ff + r.ff }), { sales: 0, gpv: 0, ff: 0 });

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

/** One target figure: a money amount in crore, or a count as a plain figure. */
function TargetCell({ v, kind, tint, start }: { v: number | null; kind: "money" | "count"; tint: string; start?: boolean }) {
  const text = v == null ? "–" : kind === "money" ? crOrDash(v) : full(v);
  return <td className={start ? `${tint} grp-start` : tint}>{text}</td>;
}

/** The Store wise performance tab: one row per outlet, with its leader, zonal manager, division, format and status.
 *  The filters sit in a panel beside the table, as on the Category wise performance tab. */
export default function Stores() {
  const [data, setData] = useState<StoresData | null>(null);

  useEffect(() => {
    let live = true;
    import("@/data/stores.json").then((m) => {
      if (live) setData(m.default as unknown as StoresData);
    });
    return () => { live = false; };
  }, []);

  if (!data) return <p className="hint">Loading the store figures…</p>;
  return <StoreTable data={data} />;
}

function StoreTable({ data }: { data: StoresData }) {
  const firstDate = data.days[0].date, lastDate = data.days[data.days.length - 1].date;
  const [from, setFrom] = useState<string>(firstDate);
  const [to, setTo] = useState<string>(lastDate);
  // the figures are compared with the same days last year (SPLY) or last month (SPLM)
  const [cmp, setCmp] = useState<Cmp>("sply");
  const [store, setStore] = useState<StoreGroup>("all");
  const [type, setType] = useState<StoreType>("all");
  const [division, setDivision] = useState("");
  const [format, setFormat] = useState("");
  const [leader, setLeader] = useState("");
  const [zonal, setZonal] = useState("");
  const [search, setSearch] = useState("");

  const outlets = data.outlets;
  const lists = useMemo(() => ({
    divisions: uniqSorted(outlets.map((r) => r.division || null)),
    formats: uniqSorted(outlets.map((r) => r.format || null)),
    leaders: uniqSorted(outlets.map((r) => r.leader || null)),
    zonals: uniqSorted(outlets.map((r) => r.zonal || null)),
  }), [outlets]);

  // the days from From to To, in either order, as indexes of the month's days; by default the whole data so far
  const lo = from <= to ? from : to, hi = from <= to ? to : from;
  const isLatest = lo === firstDate && hi === lastDate;
  const chosen = useMemo(
    () => data.days.map((_, i) => i).filter((i) => data.days[i].date >= lo && data.days[i].date <= hi),
    [data, lo, hi],
  );
  const periodName = isLatest ? `Month to date (${data.periodLabel})`
    : lo === hi ? dayLong(lo)
    : `${dayLong(lo)} to ${dayLong(hi)}`;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return outlets
      .map((r) => ({ r, now: sumDays(r.daily.this, chosen), last: sumDays(r.daily[cmp], chosen), tgt: r.target ? sumDays(r.target, chosen) : null }))
      .filter(({ r }) => store === "all" || (cmp === "sply" ? r.sameSply : r.sameSplm))
      .filter(({ r }) => type === "all" || (type === "own" ? r.status === "Own" : r.status === "Franchise"))
      .filter(({ r }) => !division || r.division === division)
      .filter(({ r }) => !format || r.format === format)
      .filter(({ r }) => !leader || r.leader === leader)
      .filter(({ r }) => !zonal || r.zonal === zonal)
      .filter(({ r }) => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .filter(({ now, last }) => now.sales > 0 || last.sales > 0)
      .sort((a, b) => b.now.sales - a.now.sales);
  }, [outlets, chosen, cmp, store, type, division, format, leader, zonal, search]);

  // the totals of the outlets shown
  const total = addSums(rows.map((x) => x.now)), totalLast = addSums(rows.map((x) => x.last));
  const s = total.sales, sl = totalLast.sales;
  const g = total.gpv, gl = totalLast.gpv;
  const f = total.ff, fl = totalLast.ff;
  const gp = s ? g / s : null, gpl = sl ? gl / sl : null;
  const bs = f ? s / f : null, bsl = fl ? sl / fl : null;
  // the targets of the outlets shown that have one; achievement is their sales against those targets, so both cover the same outlets
  const tgtRows = rows.flatMap((x) => (x.tgt ? [{ now: x.now, tgt: x.tgt }] : []));
  const tgtTotal = addSums(tgtRows.map((x) => x.tgt));
  const achSales = addSums(tgtRows.map((x) => x.now)).sales;
  const noTarget = rows.length - tgtRows.length;
  const ts = tgtRows.length ? tgtTotal.sales : null, tg = tgtRows.length ? tgtTotal.gpv : null, tf = tgtRows.length ? tgtTotal.ff : null;
  const tb = ts != null && tf ? ts / tf : null;
  const ach = ts ? achSales / ts : null;
  const short = CMP_SHORT[cmp];
  const kFmt = (v: number) => `${(v / 1000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K`;
  const kpi = [
    // the till-date achievement: the sales of the outlets with a target against their target, for the days chosen
    { label: "Ach %", value: pct(ach, 2), sub: `Target: ${crOrDash(ts)}`, delta: ach != null ? ach - 1 : null, ratio: true },
    { label: "Sales", value: crOrDash(s), sub: `${short}: ${crOrDash(sl)}`, delta: growth(s, sl), ratio: false },
    { label: "GPV", value: crOrDash(g), sub: `${short}: ${crOrDash(gl)}`, delta: growth(g, gl), ratio: false },
    { label: "GP%", value: pct(gp, 2), sub: `${short}: ${pct(gpl, 2)}`, delta: gp != null && gpl != null ? gp - gpl : null, ratio: true },
    { label: "Footfall", value: kFmt(f), sub: `${short}: ${kFmt(fl)}`, delta: growth(f, fl), ratio: false },
    { label: "Basket", value: full(bs), sub: `${short}: ${full(bsl)}`, delta: growth(bs, bsl), ratio: false },
  ];

  // the filters are at their defaults: all stores, own and franchise, all divisions and outlets, the latest period, vs SPLY
  const isDefault = store === "all" && type === "all" && !division && !format && !leader && !zonal && !search && isLatest && cmp === "sply";
  const resetAll = () => {
    setCmp("sply");
    setStore("all");
    setType("all");
    setFrom(firstDate);
    setTo(lastDate);
    setDivision("");
    setFormat("");
    setLeader("");
    setZonal("");
    setSearch("");
  };

  const select = (label: string, value: string, set: (v: string) => void, options: string[], all: string, show: (v: string) => string = (v) => v) => (
    <label>{label}
      <select value={value} onChange={(e) => set(e.target.value)} aria-label={label}>
        <option value="">{all}</option>
        {options.map((o) => <option key={o} value={o}>{show(o)}</option>)}
      </select>
    </label>
  );

  return (
    <div className="ov day-page">
      <aside className="drill-filters day-filters day-filters-panel" aria-label="Store wise performance filters">
        <button type="button" className="linkish" onClick={resetAll} disabled={isDefault}
          style={{ alignSelf: "flex-start", whiteSpace: "nowrap" }}>Reset all filters</button>
        <div className="fbar-field">
          <span>Compare with</span>
          <div className="seg" role="group" aria-label="Comparison period">
            {(["sply", "splm"] as Cmp[]).map((c) => (
              <button key={c} type="button" aria-pressed={cmp === c} onClick={() => setCmp(c)}>vs {CMP_SHORT[c]}</button>
            ))}
          </div>
        </div>
        <label>From
          <input type="date" value={from} min={firstDate} max={lastDate} aria-label="From date"
            onChange={(e) => { if (e.target.value) setFrom(e.target.value); }} />
        </label>
        <label>To
          <input type="date" value={to} min={firstDate} max={lastDate} aria-label="To date"
            onChange={(e) => { if (e.target.value) setTo(e.target.value); }} />
        </label>
        <label>Store group
          <select value={store} onChange={(e) => setStore(e.target.value as StoreGroup)} aria-label="Store group">
            {(Object.keys(STORE_GROUP_LABEL) as StoreGroup[]).map((k) => <option key={k} value={k}>{STORE_GROUP_LABEL[k]}</option>)}
          </select>
        </label>
        <label>Store type
          <select value={type} onChange={(e) => setType(e.target.value as StoreType)} aria-label="Store type">
            {(Object.keys(TYPE_LABEL) as StoreType[]).map((k) => <option key={k} value={k}>{TYPE_LABEL[k]}</option>)}
          </select>
        </label>
        {select("Division", division, setDivision, lists.divisions, "All divisions", titleCase)}
        {select("Format", format, setFormat, lists.formats, "All formats")}
        {select("Leader", leader, setLeader, lists.leaders, "All leaders")}
        {select("Zonal", zonal, setZonal, lists.zonals, "All zonals")}
        <label>Outlet search
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="name or code" aria-label="Outlet search" />
        </label>
      </aside>

      <div className="day-main">
        <section className="ov-kpis six" aria-label="Store wise key figures">
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
          {rows.length} {rows.length === 1 ? "outlet" : "outlets"} · {periodName}. Each outlet is compared with the same days {CMP_WORD[cmp]}.{" "}
          {chosen.length === 0 && "No days fall in this range; choose dates inside the data period."}
          {from > to && " The two dates were swapped, so the range runs from the earlier to the later date."}
          {" "}Targets from {data.targetFile}
          {noTarget > 0 && `; ${noTarget} ${noTarget === 1 ? "outlet has" : "outlets have"} no target in it`}.
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
                  <th scope="col" className={`${TINT.Sales} grp-start`}>Sales TGT</th>
                  <th scope="col" className={TINT.GPV}>GPV TGT</th>
                  <th scope="col" className={TINT.Footfall}>FF TGT</th>
                  <th scope="col" className={TINT.Basket}>BS TGT</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, now, last, tgt }) => {
                  const gpNow = now.sales ? now.gpv / now.sales : null;
                  const gpLast = last.sales ? last.gpv / last.sales : null;
                  const basketNow = now.ff ? now.sales / now.ff : null;
                  const basketLast = last.ff ? last.sales / last.ff : null;
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
                      <Metric now={now.sales} last={last.sales} kind="money" tint={TINT.Sales} label="Sales" />
                      <Metric now={now.gpv} last={last.gpv} kind="money" tint={TINT.GPV} label="GPV" />
                      <Metric now={gpNow} last={gpLast} kind="ratio" tint={TINT["GP%"]} label="GP%" />
                      <Metric now={now.ff} last={last.ff} kind="count" tint={TINT.Footfall} label="Footfall" />
                      <Metric now={basketNow} last={basketLast} kind="count" tint={TINT.Basket} label="Basket" />
                      <TargetCell v={tgt ? tgt.sales : null} kind="money" tint={TINT.Sales} start />
                      <TargetCell v={tgt ? tgt.gpv : null} kind="money" tint={TINT.GPV} />
                      <TargetCell v={tgt ? tgt.ff : null} kind="count" tint={TINT.Footfall} />
                      <TargetCell v={tgt && tgt.ff ? tgt.sales / tgt.ff : null} kind="count" tint={TINT.Basket} />
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
                    <TargetCell v={ts} kind="money" tint={TINT.Sales} start />
                    <TargetCell v={tg} kind="money" tint={TINT.GPV} />
                    <TargetCell v={tf} kind="count" tint={TINT.Footfall} />
                    <TargetCell v={tb} kind="count" tint={TINT.Basket} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
