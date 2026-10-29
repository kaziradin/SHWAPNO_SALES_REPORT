"use client";

import { useEffect, useState } from "react";
import type { DailyData, DailyDetailData, DayFields, DetailRow } from "@/lib/types";
import { full, growth, pct, signedFull, titleCase } from "@/lib/format";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";
import {
  Cell, Chg, dayLong, dayMonth, difference, diffChg, Figures, growthChg, ratiosOf, SortState, SortTh, sumFigures,
} from "@/lib/daily";

type Amounts = Pick<DayFields, "sales" | "splySales" | "gpv" | "splyGpv" | "valueAdj" | "splyValueAdj">;
type Group = "all" | "same";
type SortKey = "name" | "sales" | "gpv" | "gp" | "gpvoi" | "goi";
type Sort = SortState<SortKey>;

/** A row of the tree: a division, a head, a CRP or a category. Figures are summed over every row below it. */
type Node = { id: string; level: number; name: string; figures: Figures; children: Node[] };

const MTD = "mtd";
const SEP = "\u001f";
const GROUP_LABEL: Record<Group, string> = { all: "All stores", same: "Same stores" };
const LEVEL_NAME: Record<number, string> = { 1: "Division", 2: "Head", 3: "CRP", 4: "Category level 3" };
const BLANK: Chg = { text: null, t: "flat" };

/** Figures for the chosen days, summed from the money fields. GPV+OI is GPV plus value adj, as in the workbook. */
function periodFigures(a: Amounts, idx: number[]): Figures {
  const s = (v: (number | null)[]) => idx.reduce((t, i) => t + (v[i] ?? 0), 0);
  const gpv = s(a.gpv), splyGpv = s(a.splyGpv);
  return {
    sales: s(a.sales), splySales: s(a.splySales),
    gpv, splyGpv,
    gpvOi: gpv + s(a.valueAdj), splyGpvOi: splyGpv + s(a.splyValueAdj),
    ff: null, splyFf: null,
  };
}

/** Where a row sits in the tree: division, head, CRP, category. A missing part gets a placeholder so every row has a place. */
function pathOf(r: DetailRow): string[] {
  return [r.division, r.head ?? "(no head)", r.crp ?? "(no CRP)", r.category ?? "(no category)"];
}

function buildTree(rows: DetailRow[], idx: number[]): Node[] {
  const roots: Node[] = [];
  const byId = new Map<string, Node>();
  for (const r of rows) {
    const f = periodFigures(r, idx);
    let siblings = roots;
    let id = "";
    pathOf(r).forEach((name, depth) => {
      id = depth === 0 ? name : `${id}${SEP}${name}`;
      let node = byId.get(id);
      if (!node) {
        node = { id, level: depth + 1, name, figures: sumFigures([]), children: [] };
        byId.set(id, node);
        siblings.push(node);
      }
      node.figures = sumFigures([node.figures, f]);
      siblings = node.children;
    });
  }
  return roots;
}

function parentIds(nodes: Node[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children.length) {
      out.push(n.id);
      parentIds(n.children, out);
    }
  }
  return out;
}

function sortValue(n: Node, key: SortKey): number | string {
  const f = n.figures, x = ratiosOf(f);
  switch (key) {
    case "name": return n.name;
    case "sales": return f.sales ?? 0;
    case "gpv": return f.gpv ?? 0;
    case "gp": return x.gp ?? 0;
    case "gpvoi": return f.gpvOi ?? 0;
    case "goi": return x.goi ?? 0;
  }
}

/** The rows in display order, with the children of open rows; `all` lists every row regardless. */
function flatten(nodes: Node[], sort: Sort, open: Set<string>, depth: number, all: boolean): { node: Node; depth: number }[] {
  const m = sort.dir === "asc" ? 1 : -1;
  const ordered = [...nodes].sort((a, b) => {
    const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
    return typeof x === "string" ? x.localeCompare(y as string) * m : ((x as number) - (y as number)) * m;
  });
  return ordered.flatMap((node) => {
    const expanded = node.children.length > 0 && (all || open.has(node.id));
    return [{ node, depth }, ...(expanded ? flatten(node.children, sort, open, depth + 1, all) : [])];
  });
}

/** Divisions and categories are shown in title case; heads, CRPs (people) and the placeholders as written. */
function shownName(n: Node): string {
  if (n.name === "0") return "(not set)";
  if (n.name.startsWith("(") || n.level === 2 || n.level === 3) return n.name;
  return titleCase(n.name);
}

export default function DailyDetail({ daily, group }: { daily: DailyData; group: Group }) {
  const [detail, setDetail] = useState<DailyDetailData | null>(null);
  const [period, setPeriod] = useState<string>(MTD);
  const [sort, setSort] = useState<Sort>({ key: "sales", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [crp, setCrp] = useState("");
  const [cat, setCat] = useState("");

  // the detail rows are a separate data file; load it only when this tab is opened
  useEffect(() => {
    let live = true;
    import("@/data/daily-detail.json").then((m) => {
      if (live) setDetail(m.default as unknown as DailyDetailData);
    });
    return () => { live = false; };
  }, []);

  const idx = period === MTD ? daily.days.map((_, i) => i) : [daily.days.findIndex((d) => d.date === period)];
  const label = period === MTD ? `Month to date (${daily.periodLabel})` : dayLong(period);
  // the last-year days the chosen period is compared with, as the workbook matches them
  const lastYear = daily.days.map((d) => d.sply).sort();
  const compare = period === MTD
    ? `the matched days of ${dayMonth(lastYear[0])} to ${dayMonth(lastYear[lastYear.length - 1])} ${lastYear[0].slice(0, 4)}`
    : dayLong(daily.days.find((d) => d.date === period)?.sply ?? period);
  const groupLabel = GROUP_LABEL[group].toLowerCase();

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "name" ? "asc" : "desc" }));
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="detail-heading">
      <div className="ov-section-head"><h2 id="detail-heading">Detail by division, head, CRP and category</h2></div>
      <p className="ov-note">
        {label}, {groupLabel}. Uses the store group selected above; the category head filter does not apply here.
        Click + to open a division, then its heads, the CRPs under each head, and their categories.
        Pick a CRP or a category to filter the table.
      </p>
      {!detail ? (
        <p className="hint">Loading the detail…</p>
      ) : (
        <DetailTable
          daily={daily} detail={detail} group={group} idx={idx} label={label} compare={compare} groupLabel={groupLabel}
          period={period} setPeriod={setPeriod} sort={sort} onSort={onSort} open={open} toggle={toggle} setOpen={setOpen}
          crp={crp} cat={cat} setCrp={setCrp} setCat={setCat}
        />
      )}
    </section>
  );
}

function DetailTable({ daily, detail, group, idx, label, compare, groupLabel, period, setPeriod, sort, onSort, open, toggle, setOpen, crp, cat, setCrp, setCat }: {
  daily: DailyData; detail: DailyDetailData; group: Group; idx: number[]; label: string; compare: string; groupLabel: string;
  period: string; setPeriod: (p: string) => void; sort: Sort; onSort: (k: SortKey) => void;
  open: Set<string>; toggle: (id: string) => void; setOpen: (s: Set<string>) => void;
  crp: string; cat: string; setCrp: (c: string) => void; setCat: (c: string) => void;
}) {
  const allRows = detail.groups[group];
  // a choice that does not exist in this store group is ignored
  const crpSel = crp && allRows.some((r) => r.crp === crp) ? crp : "";
  const catSel = cat && allRows.some((r) => r.category === cat) ? cat : "";
  const matches = (r: DetailRow, c: string, k: string) => (!c || r.crp === c) && (!k || r.category === k);
  const options = (pick: (r: DetailRow) => string | null, c: string, k: string) =>
    [...new Set(allRows.filter((r) => matches(r, c, k)).map(pick).filter((v): v is string => v != null))].sort((a, b) => a.localeCompare(b));
  // each list offers only what exists with the other choice applied, so a choice never gives an empty table
  const crpOptions = options((r) => r.crp, "", catSel);
  const catOptions = options((r) => r.category, crpSel, "");
  const filtered = Boolean(crpSel || catSel);
  const change = (which: "crp" | "cat", value: string) => {
    let c = which === "crp" ? value : crpSel;
    let k = which === "cat" ? value : catSel;
    // if nothing matches both choices, the other one is cleared
    if (c && k && !allRows.some((r) => r.crp === c && r.category === k)) {
      if (which === "crp") k = "";
      else c = "";
    }
    setCrp(c);
    setCat(k);
    // with a choice made, every level is opened so the matching rows can be seen
    setOpen(new Set(c || k ? parentIds(buildTree(allRows.filter((r) => matches(r, c, k)), idx)) : []));
  };
  const clearFilters = () => {
    setCrp("");
    setCat("");
    setOpen(new Set());
  };
  const tree = buildTree(allRows.filter((r) => matches(r, crpSel, catSel)), idx);
  const shown = flatten(tree, sort, open, 0, false);
  const everything = flatten(tree, sort, open, 0, true);

  // the day-wise total and what the rows add up to; the difference is in the workbook total with no row
  const dayTotal = periodFigures(daily.groups[group].total, idx);
  const rowsTotal = sumFigures(tree.map((n) => n.figures));
  const unsplit = {
    sales: difference(dayTotal.sales, rowsTotal.sales),
    gpv: difference(dayTotal.gpv, rowsTotal.gpv),
    gpvOi: difference(dayTotal.gpvOi, rowsTotal.gpvOi),
  };
  const dayX = ratiosOf(dayTotal);
  const rowsX = ratiosOf(rowsTotal);

  const exportDetail = () => {
    const cols: ExportCol[] = [
      { header: "Level", format: "text" }, { header: "Name", format: "text" },
      { header: "Sales", format: "money" }, { header: "Sales SPLY", format: "money" }, { header: "Sales growth", format: "pct" },
      { header: "GPV", format: "money" }, { header: "GPV SPLY", format: "money" }, { header: "GPV growth", format: "pct" },
      { header: "GP%", format: "pct" }, { header: "GP% SPLY", format: "pct" }, { header: "GP% change", format: "pct" },
      { header: "GPV+OI", format: "money" }, { header: "GPV+OI SPLY", format: "money" }, { header: "GPV+OI growth", format: "pct" },
      { header: "GP+OI%", format: "pct" }, { header: "GP+OI% SPLY", format: "pct" }, { header: "GP+OI% change", format: "pct" },
    ];
    const cells = (f: Figures): ExportCell[] => {
      const x = ratiosOf(f);
      return [
        f.sales, f.splySales, growth(f.sales, f.splySales),
        f.gpv, f.splyGpv, growth(f.gpv, f.splyGpv),
        x.gp, x.splyGp, difference(x.gp, x.splyGp),
        f.gpvOi, f.splyGpvOi, growth(f.gpvOi, f.splyGpvOi),
        x.goi, x.splyGoi, difference(x.goi, x.splyGoi),
      ];
    };
    const rowsOut: ExportCell[][] = everything.map(({ node }) => [LEVEL_NAME[node.level], shownName(node), ...cells(node.figures)]);
    const body: ExportCell[][] = filtered
      ? [...rowsOut, ["", "Total (filtered rows)", ...cells(rowsTotal)]]
      : [
          ...rowsOut,
          ["", "Not in any row (workbook total minus rows)", unsplit.sales, null, null, unsplit.gpv, null, null, null, null, null, unsplit.gpvOi, null, null, null, null, null],
          ["", "Total", ...cells(dayTotal)],
        ];
    downloadExcel(`day-wise-detail-${group}${filtered ? "-filtered" : ""}.xlsx`, "Day wise detail", cols, body);
  };

  const allParents = parentIds(tree);

  return (
    <>
      <div className="drill-filters">
        <label>Period
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
            <option value={MTD}>Month to date ({daily.periodLabel})</option>
            {[...daily.days].reverse().map((d) => <option key={d.date} value={d.date}>{dayLong(d.date)}</option>)}
          </select>
        </label>
        <label>CRP
          <select value={crpSel} onChange={(e) => change("crp", e.target.value)} aria-label="CRP">
            <option value="">All CRPs</option>
            {crpOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>Category
          <select value={catSel} onChange={(e) => change("cat", e.target.value)} aria-label="Category">
            <option value="">All categories</option>
            {catOptions.map((c) => <option key={c} value={c}>{c === "0" ? "(not set)" : titleCase(c)}</option>)}
          </select>
        </label>
        {filtered && <button type="button" className="exportbtn" onClick={clearFilters}>Clear filters</button>}
      </div>
      <div className="xbar">
        <button type="button" className="exportbtn" onClick={() => setOpen(new Set(allParents))}>Expand all</button>
        <button type="button" className="exportbtn" onClick={() => setOpen(new Set())}>Collapse all</button>
        <ExportButton onClick={exportDetail} />
      </div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table">
            <caption>
              {label}, {groupLabel}{filtered ? ", filtered" : ""}. Compared with {compare}. Click a heading to sort within each level.
            </caption>
            <thead>
              <tr>
                <SortTh k="name" label="Division, head, CRP, category" sort={sort} onSort={onSort} cls="l" />
                <SortTh k="sales" label="Sales" sort={sort} onSort={onSort} />
                <SortTh k="gpv" label="GPV" sort={sort} onSort={onSort} />
                <SortTh k="gp" label="GP%" sort={sort} onSort={onSort} />
                <SortTh k="gpvoi" label="GPV+OI" sort={sort} onSort={onSort} />
                <SortTh k="goi" label="GP+OI%" sort={sort} onSort={onSort} />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ node, depth }) => {
                const f = node.figures, x = ratiosOf(f), isOpen = open.has(node.id);
                return (
                  <tr key={node.id}>
                    <th scope="row" style={{ textAlign: "left", paddingLeft: 12 + depth * 18 }}>
                      {node.children.length > 0 && (
                        <button className="plusbtn" onClick={() => toggle(node.id)} aria-expanded={isOpen}
                          aria-label={`${isOpen ? "Collapse" : "Expand"} ${shownName(node)}`}>
                          {isOpen ? "−" : "+"}
                        </button>
                      )}{" "}
                      {shownName(node)}
                    </th>
                    <Cell value={full(f.sales)} chg={growthChg(f.sales, f.splySales)} />
                    <Cell value={full(f.gpv)} chg={growthChg(f.gpv, f.splyGpv)} />
                    <Cell value={pct(x.gp, 2)} chg={diffChg(x.gp, x.splyGp)} />
                    <Cell value={full(f.gpvOi)} chg={growthChg(f.gpvOi, f.splyGpvOi)} />
                    <Cell value={pct(x.goi, 2)} chg={diffChg(x.goi, x.splyGoi)} />
                  </tr>
                );
              })}
            </tbody>
            {tree.length > 0 && filtered && (
              <tfoot>
                <tr>
                  <th scope="row" style={{ textAlign: "left" }}>Total (filtered rows)</th>
                  <Cell value={full(rowsTotal.sales)} chg={growthChg(rowsTotal.sales, rowsTotal.splySales)} />
                  <Cell value={full(rowsTotal.gpv)} chg={growthChg(rowsTotal.gpv, rowsTotal.splyGpv)} />
                  <Cell value={pct(rowsX.gp, 2)} chg={diffChg(rowsX.gp, rowsX.splyGp)} />
                  <Cell value={full(rowsTotal.gpvOi)} chg={growthChg(rowsTotal.gpvOi, rowsTotal.splyGpvOi)} />
                  <Cell value={pct(rowsX.goi, 2)} chg={diffChg(rowsX.goi, rowsX.splyGoi)} />
                </tr>
              </tfoot>
            )}
            {tree.length > 0 && !filtered && (
              <tfoot>
                <tr>
                  <th scope="row" style={{ textAlign: "left" }}>Not in any row (workbook total minus rows)</th>
                  <Cell value={unsplit.sales == null ? "–" : signedFull(unsplit.sales)} chg={BLANK} />
                  <Cell value={unsplit.gpv == null ? "–" : signedFull(unsplit.gpv)} chg={BLANK} />
                  <Cell value="–" chg={BLANK} />
                  <Cell value={unsplit.gpvOi == null ? "–" : signedFull(unsplit.gpvOi)} chg={BLANK} />
                  <Cell value="–" chg={BLANK} />
                </tr>
                <tr>
                  <th scope="row" style={{ textAlign: "left" }}>Total (day-wise)</th>
                  <Cell value={full(dayTotal.sales)} chg={growthChg(dayTotal.sales, dayTotal.splySales)} />
                  <Cell value={full(dayTotal.gpv)} chg={growthChg(dayTotal.gpv, dayTotal.splyGpv)} />
                  <Cell value={pct(dayX.gp, 2)} chg={diffChg(dayX.gp, dayX.splyGp)} />
                  <Cell value={full(dayTotal.gpvOi)} chg={growthChg(dayTotal.gpvOi, dayTotal.splyGpvOi)} />
                  <Cell value={pct(dayX.goi, 2)} chg={diffChg(dayX.goi, dayX.splyGoi)} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}
