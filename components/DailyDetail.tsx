"use client";

import { useEffect, useState } from "react";
import type { DailyData, DailyDetailData, DailyHead, DayFields, DetailRow } from "@/lib/types";
import { crOrDash, growth, pct, titleCase } from "@/lib/format";
import { downloadExcel, ExportButton, type ExportCell, type ExportCol } from "@/lib/export";
import {
  Cell, dayLong, dayMonth, difference, diffChg, Figures, growthChg, MTD, ratiosOf, SHOWN_DIVISIONS, SortState, SortTh, sumFigures,
} from "@/lib/daily";

type Amounts = Pick<DayFields, "sales" | "splySales" | "gpv" | "splyGpv" | "valueAdj" | "splyValueAdj">;
type Group = "all" | "same";
type SortKey = "name" | "sales" | "gpv" | "gp" | "gpvoi" | "goi";
type Sort = SortState<SortKey>;

/** A row of the tree: a division, a head, a CRP or a category. Figures are summed over every row below it. */
type Node = { id: string; level: number; name: string; figures: Figures; children: Node[] };

const SEP = "\u001f";
const GROUP_LABEL: Record<Group, string> = { all: "All stores", same: "Same stores" };
const LEVEL_NAME: Record<number, string> = { 1: "Division", 2: "Head", 3: "CRP", 4: "Category level 3" };

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

/** The rows in display order, with the children of open rows; `all` lists every row regardless.
 *  The divisions keep their fixed order; the rows inside each division follow the chosen sort. */
function flatten(nodes: Node[], sort: Sort, open: Set<string>, depth: number, all: boolean): { node: Node; depth: number }[] {
  const m = sort.dir === "asc" ? 1 : -1;
  const ordered = depth === 0
    ? [...nodes].sort((a, b) => SHOWN_DIVISIONS.indexOf(a.name) - SHOWN_DIVISIONS.indexOf(b.name))
    : [...nodes].sort((a, b) => {
        const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
        return typeof x === "string" ? x.localeCompare(y as string) * m : ((x as number) - (y as number)) * m;
      });
  return ordered.flatMap((node) => {
    const expanded = node.children.length > 0 && (all || open.has(node.id));
    return [{ node, depth }, ...(expanded ? flatten(node.children, sort, open, depth + 1, all) : [])];
  });
}

/** Divisions are shown as the workbook writes them (COMPANY GOODS); categories in title case; heads, CRPs and placeholders as written. */
function shownName(n: Node): string {
  if (n.name === "0") return "(not set)";
  if (n.name.startsWith("(") || n.level !== 4) return n.name;
  return titleCase(n.name);
}

/** The detail table. The period, store group, category head, CRP and category come from the filters at the top of the tab. */
export default function DailyDetail({ daily, group, detail, chosen, label, compare, head, crp, cat }: {
  daily: DailyData; group: Group; detail: DailyDetailData | null; chosen: number[]; label: string; compare: string;
  head: DailyHead | null; crp: string; cat: string;
}) {
  const [sort, setSort] = useState<Sort>({ key: "sales", dir: "desc" });
  const [open, setOpen] = useState<Set<string>>(new Set());

  // the days chosen in the Period list (a month, one day or a date range), with their label and last-year comparison
  const idx = chosen;
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
        {label}, {groupLabel}. Follows the period, store group, category head, CRP and category chosen at the top.
        Click + to open a division, then its heads, the CRPs under each head, and their categories.
      </p>
      {!detail ? (
        <p className="hint">Loading the detail…</p>
      ) : (
        <DetailTable
          daily={daily} detail={detail} group={group} idx={idx} label={label} compare={compare} groupLabel={groupLabel}
          head={head} crp={crp} cat={cat} sort={sort} onSort={onSort} open={open} toggle={toggle} setOpen={setOpen}
        />
      )}
    </section>
  );
}

function DetailTable({ daily, detail, group, idx, label, compare, groupLabel, head, crp, cat, sort, onSort, open, toggle, setOpen }: {
  daily: DailyData; detail: DailyDetailData; group: Group; idx: number[]; label: string; compare: string; groupLabel: string;
  head: DailyHead | null; crp: string; cat: string; sort: Sort; onSort: (k: SortKey) => void;
  open: Set<string>; toggle: (id: string) => void; setOpen: (s: Set<string>) => void;
}) {
  // the listed divisions' rows for the head, CRP and category chosen at the top
  const rows = detail.groups[group].filter(
    (r) => SHOWN_DIVISIONS.includes(r.division)
      && (!head || (r.division === head.division && r.head === head.head))
      && (!crp || r.crp === crp)
      && (!cat || r.category === cat),
  );
  const filtered = Boolean(head || crp || cat);
  const tree = buildTree(rows, idx);
  const shown = flatten(tree, sort, open, 0, false);
  const everything = flatten(tree, sort, open, 0, true);
  const allParents = parentIds(tree);

  // with any filter on, every level is opened so the matching rows can be seen; with none, the table starts closed
  const filterKey = `${group}|${head ? head.division + head.head : ""}|${crp}|${cat}`;
  useEffect(() => {
    setOpen(new Set(filtered ? allParents : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // the grand total is the workbook's total for every division, including the ones not listed; with a filter on,
  // the total is of the listed rows that match
  const dayTotal = periodFigures(daily.groups[group].total, idx);
  const rowsTotal = sumFigures(tree.map((n) => n.figures));
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
      : [...rowsOut, ["", "Grand total (all divisions)", ...cells(dayTotal)]];
    downloadExcel(`day-wise-detail-${group}${filtered ? "-filtered" : ""}.xlsx`, "Day wise detail", cols, body);
  };

  return (
    <>
      <div className="xbar">
        <button type="button" className="exportbtn" onClick={() => setOpen(new Set(allParents))}>Expand all</button>
        <button type="button" className="exportbtn" onClick={() => setOpen(new Set())}>Collapse all</button>
        <ExportButton onClick={exportDetail} />
      </div>
      <div className="ov-panel ov-table-panel">
        <div className="ov-table-scroll">
          <table className="ov-table">
            <caption>
              {label}, {groupLabel}{filtered ? ", filtered" : ""}. Compared with {compare}. Click a heading to sort the rows inside each division.
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
                    <Cell value={crOrDash(f.sales)} chg={growthChg(f.sales, f.splySales)} />
                    <Cell value={crOrDash(f.gpv)} chg={growthChg(f.gpv, f.splyGpv)} />
                    <Cell value={pct(x.gp, 2)} chg={diffChg(x.gp, x.splyGp)} />
                    <Cell value={crOrDash(f.gpvOi)} chg={growthChg(f.gpvOi, f.splyGpvOi)} />
                    <Cell value={pct(x.goi, 2)} chg={diffChg(x.goi, x.splyGoi)} />
                  </tr>
                );
              })}
            </tbody>
            {tree.length > 0 && filtered && (
              <tfoot>
                <tr>
                  <th scope="row" style={{ textAlign: "left" }}>Total (filtered rows)</th>
                  <Cell value={crOrDash(rowsTotal.sales)} chg={growthChg(rowsTotal.sales, rowsTotal.splySales)} />
                  <Cell value={crOrDash(rowsTotal.gpv)} chg={growthChg(rowsTotal.gpv, rowsTotal.splyGpv)} />
                  <Cell value={pct(rowsX.gp, 2)} chg={diffChg(rowsX.gp, rowsX.splyGp)} />
                  <Cell value={crOrDash(rowsTotal.gpvOi)} chg={growthChg(rowsTotal.gpvOi, rowsTotal.splyGpvOi)} />
                  <Cell value={pct(rowsX.goi, 2)} chg={diffChg(rowsX.goi, rowsX.splyGoi)} />
                </tr>
              </tfoot>
            )}
            {tree.length > 0 && !filtered && (
              <tfoot>
                <tr>
                  <th scope="row" style={{ textAlign: "left" }}>Grand total (all divisions)</th>
                  <Cell value={crOrDash(dayTotal.sales)} chg={growthChg(dayTotal.sales, dayTotal.splySales)} />
                  <Cell value={crOrDash(dayTotal.gpv)} chg={growthChg(dayTotal.gpv, dayTotal.splyGpv)} />
                  <Cell value={pct(dayX.gp, 2)} chg={diffChg(dayX.gp, dayX.splyGp)} />
                  <Cell value={crOrDash(dayTotal.gpvOi)} chg={growthChg(dayTotal.gpvOi, dayTotal.splyGpvOi)} />
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
