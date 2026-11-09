"""Read the day-wise report and the value adj workbooks and write data/daily.json and data/daily-detail.json:
this month day by day, per category head and in total, for every store group: all stores and same stores, each
also for own and franchise stores.

Each day is compared two ways:
- groups: with the same day last year (SPLY). The fields named splySales, splyGpv, splyValueAdj and splyFf
  are last year's figures.
- splmGroups: with the same day last month (SPLM). The same field names hold last month's figures. For the same
  stores the this-month figures change too, because the report and the value adj match the outlets to the
  comparison's store list.

Sources
- Day Wise Sales GP Trend Report.xlsx (the newest file in ../1. SALES FILE whose name matches "Day wise Sales GP
  Trend"): sales, GP% and footfall, in the day-only, division x head and division x category x head x CRP sheets.
  The sheets' columns are read from their header rows.
- Day Wise Val Adj.xlsx (this month), Day Wise Val Adj SPLY.xlsx (last year) and Day Wise Val Adj SPLM.xlsx (last
  month), in ../../val adj/autmation for day wise val adj: value adj per day and CRP ("Summary Category" sheet).
  The SPLY and SPLM files are keyed by their own dates.

Figures
- GPV = sales x GP%. Value adj is added for GP+OI: GPV+OI = GPV + value adj.
- Footfall is not in the detail rows: a bill can span several categories, so it does not add up.

Usage:  python scripts/extract_daily.py [path-to-report-xlsx]
"""
import datetime as dt
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SALES_FOLDER = ROOT.parent / "1. SALES FILE"
VAL_FOLDER = ROOT.parent.parent / "val adj" / "autmation for day wise val adj"
VAL_THIS = VAL_FOLDER / "Day Wise Val Adj.xlsx"
VAL_SPLY = VAL_FOLDER / "Day Wise Val Adj SPLY.xlsx"
VAL_SPLM = VAL_FOLDER / "Day Wise Val Adj SPLM.xlsx"
REPORT_JSON = ROOT / "data" / "report.json"
OUT = ROOT / "data" / "daily.json"
DETAIL_OUT = ROOT / "data" / "daily-detail.json"

DAY_SHEET = "5 Day only"
HEAD_SHEET = "3 Day x Div x Head"
DETAIL_SHEET = "1 Day x Div x Cat3 x Head x CRP"

# Header rows of the sheets: block (row 3), measure (row 4), period (row 5).
BLOCKS = {
    "All store": "all", "Same store": "same",
    "All store OWN": "allOwn", "All store FRAN": "allFran",
    "Same store OWN": "sameOwn", "Same store FRAN": "sameFran",
}
GROUPS = tuple(BLOCKS.values())
MEASURES = {"Revenue": "sales", "GP%": "gp", "FF": "ff"}
# 'THIS (vs SPLM)' is this month's figure for the same stores against last month's list; the all-store
# blocks have one THIS column, which is used for both comparisons.
PERIODS = {"THIS": "this", "THIS (vs SPLY)": "this", "THIS (vs SPLM)": "this_splm", "SPLY": "sply", "SPLM": "splm"}
COMPARISONS = ("sply", "splm")
# Value adj parts (per CRP row) and which parts make up each group.
VA_PARTS_OF = {
    "all": ("all",), "allOwn": ("allOwn",), "allFran": ("allFran",),
    "same": ("sameOwn", "sameFran"), "sameOwn": ("sameOwn",), "sameFran": ("sameFran",),
}
OUTPUT = ("sales", "splySales", "gpv", "splyGpv", "valueAdj", "splyValueAdj", "ff", "splyFf")
DETAIL_FIELDS = ("sales", "splySales", "gpv", "splyGpv", "valueAdj", "splyValueAdj", "ff", "splyFf")
# The day-wise report names the LIFESTYLE head 'Ms. Adiba'; the monthly report and the head list use
# Md. Hasib-Ul-Alam, so the day-wise name is changed to that. Keyed by division, so other heads are unaffected.
HEAD_NAMES = {("LIFESTYLE", "Ms. Adiba"): "Md. Hasib-Ul-Alam"}

# Which Summary Category columns make up each value adj part of this month's rows, for each comparison.
# The comparison decides which outlets count as same stores (in both periods) and which as new.
THIS_VA_LAYOUT = {
    "sply": {
        "all": ("All Outlets",),
        "allOwn": ("SPLY SAME OWN", "SPLY NEW OWN"),
        "allFran": ("SPLY SAME FRAN", "SPLY NEW FRAN"),
        "sameOwn": ("SPLY SAME OWN",),
        "sameFran": ("SPLY SAME FRAN",),
    },
    "splm": {
        "all": ("All Outlets",),
        "allOwn": ("SPLM SAME OWN", "SPLM NEW OWN"),
        "allFran": ("SPLM SAME FRAN", "SPLM NEW FRAN"),
        "sameOwn": ("SPLM SAME OWN",),
        "sameFran": ("SPLM SAME FRAN",),
    },
}
# The value adj of the comparison period, from its own workbook (keyed by that period's date).
PREV_VA_LAYOUT = {
    "sply": {
        "all": ("Grand Total",),
        "allOwn": ("Total OWN",),
        "allFran": ("Total FRAN",),
        "sameOwn": ("SPLY SAME OWN",),
        "sameFran": ("SPLY SAME FRAN",),
    },
    "splm": {
        "all": ("SPLM Total",),
        "allOwn": ("SPLM SAME OWN", "SPLM NEW OWN"),
        "allFran": ("SPLM SAME FRAN", "SPLM NEW FRAN"),
        "sameOwn": ("SPLM SAME OWN",),
        "sameFran": ("SPLM SAME FRAN",),
    },
}


def number(v):
    # full precision; money is rounded only when it is written out
    return float(v) if isinstance(v, (int, float)) else None


def text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def money(values):
    return [round(v, 2) if v is not None else None for v in values]


def product(a, b):
    return a * b if a is not None and b is not None else None


def head_of(division, head):
    return HEAD_NAMES.get((division, head), head)


def periods_of(group):
    """The periods a group has in the report: the same stores also have this month against last month's list."""
    return ("this", "sply", "splm") + (("this_splm",) if group.startswith("same") else ())


def this_period(group, cmp):
    """The report's this-month period for a group under a comparison."""
    return "this_splm" if cmp == "splm" and group.startswith("same") else "this"


def find_day_wise(folder=SALES_FOLDER):
    """The day-wise report. It is replaced with a new file each time and the name can change, so take the
    newest .xlsx whose name matches. Excel's '~$' lock files are skipped."""
    matches = sorted(
        (p for p in folder.glob("*.xlsx")
         if not p.name.startswith("~$") and re.search(r"day\s*wise\s*sales\s*gp\s*trend", p.name, re.I)),
        key=lambda p: p.stat().st_mtime, reverse=True)
    if not matches:
        raise SystemExit(f"No day-wise report in {folder}: expected a file named like 'Day Wise Sales GP Trend Report.xlsx'")
    if len(matches) > 1:
        print("Several day-wise reports found; using the newest. Others: " + ", ".join(p.name for p in matches[1:]))
    return matches[0]


def columns(ws):
    """(group, field, period) -> column index, read from the sheet's header rows. Every store group block
    (all, same, and their own and franchise blocks) is read."""
    block_row, measure_row, period_row = list(ws.iter_rows(min_row=3, max_row=5, values_only=True))
    found, block = {}, None
    for i in range(len(block_row)):
        label = text(block_row[i])
        if label is not None and label.startswith(("All store", "Same store")):
            block = BLOCKS.get(label)
        measure, period = MEASURES.get(text(measure_row[i])), PERIODS.get(text(period_row[i]))
        if block and measure and period:
            found[(block, measure, period)] = i
    needed = [(g, m, p) for g in GROUPS for m in MEASURES.values() for p in periods_of(g)]
    missing = [k for k in needed if k not in found]
    if missing:
        raise SystemExit(f"{ws.title}: columns not found for {missing}; the sheet layout may have changed")
    return found


def read_totals(ws):
    """Day -> {'sply': SPLY date, 'splm': SPLM date, group: {(field, period): value}} from the day-only sheet."""
    cols = columns(ws)
    out = {}
    for row in ws.iter_rows(min_row=6, values_only=True):
        if not isinstance(row[0], dt.datetime) or not isinstance(row[1], dt.datetime) or not isinstance(row[2], dt.datetime):
            continue
        out[row[0].date()] = {
            "sply": row[1].date(), "splm": row[2].date(),
            **{g: {(m, p): number(row[i]) for (b, m, p), i in cols.items() if b == g} for g in GROUPS},
        }
    return out


def read_heads(ws):
    """(day, division, head) -> {(group, field, period): value}, and the heads in the sheet's order.
    Rows without a head are division totals and are left out."""
    cols = columns(ws)
    out, order = {}, []
    for row in ws.iter_rows(min_row=6, values_only=True):
        div, head = text(row[3]), text(row[4])
        if not isinstance(row[0], dt.datetime) or div is None or head is None:
            continue
        head = head_of(div, head)
        out[(row[0].date(), div, head)] = {k: number(row[i]) for k, i in cols.items()}
        if (div, head) not in order:
            order.append((div, head))
    return out, order


def read_leaves(ws):
    """(day, division, category, head, crp) -> {(group, field, period): value} from the detail sheet, and the
    sales of rows with no division. A row sits at the level its keys reach (division, category or CRP), and
    each value sits on one row only, so the rows add up to the sheet's totals."""
    cols = columns(ws)
    out, skipped = {}, 0.0
    for row in ws.iter_rows(min_row=6, values_only=True):
        if not isinstance(row[0], dt.datetime):
            continue
        values = {k: number(row[i]) for k, i in cols.items()}
        div = text(row[3])
        if div is None:
            skipped += values[("all", "sales", "this")] or 0.0
            continue
        key = (row[0].date(), div, text(row[4]), head_of(div, text(row[5])), text(row[6]))
        if key in out:
            raise SystemExit(f"{ws.title}: {key} appears twice")
        out[key] = values
    return out, skipped


def read_value_adj(path, layout):
    """Rows of the Summary Category sheet: (day, division, category, head, crp, {part: value})."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = wb["Summary Category"].iter_rows(values_only=True)
    header = [text(h) for h in next(rows)]
    part_cols = {}
    for part, names in layout.items():
        for name in names:
            if name not in header:
                raise SystemExit(f"{path.name}: '{name}' not in the Summary Category header")
        part_cols[part] = [header.index(name) for name in names]
    out = []
    for row in rows:
        if not isinstance(row[0], dt.datetime) or text(row[1]) in (None, "Total", "GRAND TOTAL"):
            continue
        div = text(row[1])
        values = {part: sum(number(row[c]) or 0.0 for c in cols) for part, cols in part_cols.items()}
        out.append((row[0].date(), div, text(row[2]), head_of(div, text(row[3])), text(row[4]), values))
    wb.close()
    return out


def value_adj_sums(rows):
    """Value adj summed by day, by day and head, and by day and CRP. Value adj is only given per CRP, so the
    head and day sums are the sums of those CRP rows and nothing is counted twice."""
    total = defaultdict(lambda: defaultdict(float))
    head = defaultdict(lambda: defaultdict(float))
    crp = defaultdict(lambda: defaultdict(float))
    for day, div, cat, hd, c, values in rows:
        for bucket, key in ((total, day), (head, (day, div, hd)), (crp, (day, div, cat, hd, c))):
            for part, v in values.items():
                bucket[key][part] += v
    return {"total": total, "head": head, "crp": crp}


def va_value(bucket, key, group):
    """Value adj of a group for a key (a day, a head or a CRP): the parts that make up the group, added up."""
    got = bucket.get(key)
    return sum(got.get(part, 0.0) for part in VA_PARTS_OF[group]) if got else 0.0


def report_roles():
    """Category role of each head, from the monthly report (the day-wise sheets do not have it). A head the
    report does not list takes the role of its division."""
    heads = json.loads(REPORT_JSON.read_text(encoding="utf-8"))["sply"]["heads"]
    by_head = {(h["division"], h["head"]): h["role"] for h in heads}
    by_division = {}
    for h in heads:
        by_division.setdefault(h["division"], h["role"])
    return by_head, by_division


def build_variant(cmp, days, totals, heads, head_order, leaves, va_this, va_prev, role):
    """The day-wise figures against one comparison: 'sply' (same day last year) or 'splm' (same day last month).
    Returns (groups, detail groups)."""
    prev_date = {d: totals[d][cmp] for d in days}
    out_groups, detail_groups = {}, {}

    for g in GROUPS:
        tp = this_period(g, cmp)
        total = {k: [] for k in OUTPUT}
        for d in days:
            t = totals[d][g]
            values = {
                "sales": t[("sales", tp)], "splySales": t[("sales", cmp)],
                "gpv": product(t[("sales", tp)], t[("gp", tp)]),
                "splyGpv": product(t[("sales", cmp)], t[("gp", cmp)]),
                "valueAdj": va_value(va_this["total"], d, g),
                "splyValueAdj": va_value(va_prev["total"], prev_date[d], g),
                "ff": t[("ff", tp)], "splyFf": t[("ff", cmp)],
            }
            for k in OUTPUT:
                total[k].append(values[k])

        head_rows = []
        for div, hd in head_order:
            fields = {k: [] for k in OUTPUT}
            for d in days:
                h = heads.get((d, div, hd), {})
                values = {
                    "sales": h.get((g, "sales", tp)), "splySales": h.get((g, "sales", cmp)),
                    "gpv": product(h.get((g, "sales", tp)), h.get((g, "gp", tp))),
                    "splyGpv": product(h.get((g, "sales", cmp)), h.get((g, "gp", cmp))),
                    "valueAdj": va_value(va_this["head"], (d, div, hd), g),
                    "splyValueAdj": va_value(va_prev["head"], (prev_date[d], div, hd), g),
                    "ff": h.get((g, "ff", tp)), "splyFf": h.get((g, "ff", cmp)),
                }
                for k in OUTPUT:
                    fields[k].append(values[k])
            head_rows.append({"division": div, "role": role(div, hd), "head": hd,
                              **{k: money(v) for k, v in fields.items()}})

        # how much of the store group's sales the category heads cover (the rest is on division rows with no head)
        head_sales = sum(h["sales"][-1] or 0 for h in head_rows if h["sales"])
        group_sales = total["sales"][-1] or 1
        print(f"{cmp} {g}: {len(head_rows)} heads, heads cover {head_sales / group_sales:.2%} of sales on {days[-1]:%d-%b}")
        out_groups[g] = {"total": {k: money(v) for k, v in total.items()}, "heads": head_rows}

    # own and franchise have to add up to the store group: sales of this month and of the comparison period
    for g, own, fran in (("all", "allOwn", "allFran"), ("same", "sameOwn", "sameFran")):
        for d in days:
            for period in (this_period(g, cmp), cmp):
                s = totals[d][g][("sales", period)]
                parts = totals[d][own][("sales", period)] + totals[d][fran][("sales", period)]
                if abs(s - parts) > 0.001 * s:
                    raise SystemExit(f"{cmp} {g}: own + franchise sales differ from the store group on {d:%d-%b}")

    # the detail rows: one per division, category or CRP. Value adj is given per CRP only.
    keys = list(dict.fromkeys(
        [k[1:] for k in leaves] + [k[1:] for k in va_this["crp"]] + [k[1:] for k in va_prev["crp"]]))
    for g in GROUPS:
        tp = this_period(g, cmp)
        rows = []
        for key in keys:
            div, cat, hd, c = key
            vals = {k: [] for k in DETAIL_FIELDS}
            for d in days:
                leaf = leaves.get((d, *key), {})
                s, ss = leaf.get((g, "sales", tp)), leaf.get((g, "sales", cmp))
                gp, sgp = leaf.get((g, "gp", tp)), leaf.get((g, "gp", cmp))
                vals["sales"].append(s)
                vals["splySales"].append(ss)
                vals["gpv"].append(product(s, gp))
                vals["splyGpv"].append(product(ss, sgp))
                vals["valueAdj"].append(va_value(va_this["crp"], (d, *key), g))
                vals["splyValueAdj"].append(va_value(va_prev["crp"], (prev_date[d], *key), g))
                # footfall is valid on a category row (one person, one category); the page does not add it up across rows
                vals["ff"].append(leaf.get((g, "ff", tp)))
                vals["splyFf"].append(leaf.get((g, "ff", cmp)))
            if not any(v for values in vals.values() for v in values if v):
                continue
            rows.append({"division": div, "category": cat, "head": hd, "crp": c,
                         **{k: money(v) for k, v in vals.items()}})
        detail_groups[g] = rows

        # the rows should add up to the day totals; the value adj gap is value adj that has no row
        for n, d in enumerate(days):
            row_sales = sum(r["sales"][n] or 0 for r in rows)
            total_sales = out_groups[g]["total"]["sales"][n] or 0
            if abs(row_sales - total_sales) > 0.001 * total_sales:
                raise SystemExit(f"{cmp} {g} detail sales differ from the day total on {d:%d-%b} by {row_sales - total_sales:,.0f}")
        va_gap = [round((out_groups[g]["total"]["valueAdj"][n] or 0) - sum(r["valueAdj"][n] or 0 for r in rows))
                  for n in range(len(days))]
        print(f"{cmp} {g}: {len(rows)} detail rows; value adj not on any row (taka): {va_gap}")

    return out_groups, detail_groups


def main():
    report = Path(sys.argv[1]) if len(sys.argv) > 1 else find_day_wise()
    prev_paths = {"sply": VAL_SPLY, "splm": VAL_SPLM}
    for path in (VAL_THIS, VAL_SPLY, VAL_SPLM):
        if not path.exists():
            raise SystemExit(f"Value adj workbook not found: {path}")
    print(f"Reading {report.name} with the value adj from {VAL_FOLDER.name}")

    wb = openpyxl.load_workbook(report, read_only=True, data_only=True)
    totals = read_totals(wb[DAY_SHEET])
    heads, head_order = read_heads(wb[HEAD_SHEET])
    leaves, skipped = read_leaves(wb[DETAIL_SHEET])
    wb.close()
    if skipped:
        print(f"Rows with no division (not used): sales {skipped:,.0f}")

    # the last day with a sales figure; later columns are not reported yet
    days = sorted(totals)
    last = max(i for i, d in enumerate(days) if totals[d]["all"][("sales", "this")])
    days = days[: last + 1]

    roles_by_head, roles_by_division = report_roles()

    def role(division, head):
        if (division, head) in roles_by_head:
            return roles_by_head[(division, head)]
        print(f"Head {head} ({division}) is not in the monthly report: role taken from its division")
        return roles_by_division.get(division, "")

    results = {}
    for cmp in COMPARISONS:
        this_rows = read_value_adj(VAL_THIS, THIS_VA_LAYOUT[cmp])
        prev_rows = read_value_adj(prev_paths[cmp], PREV_VA_LAYOUT[cmp])
        this_days = {r[0] for r in this_rows}
        prev_days = {r[0] for r in prev_rows}
        if [d for d in days if d not in this_days] or [totals[d][cmp] for d in days if totals[d][cmp] not in prev_days]:
            raise SystemExit(f"A day of the report is missing from the value adj workbooks ({cmp})")
        results[cmp] = build_variant(
            cmp, days, totals, heads, head_order, leaves,
            value_adj_sums(this_rows), value_adj_sums(prev_rows), role)

    period_start, period_end = days[0], days[-1]
    out = {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "sourceFile": report.name,
        "asOf": period_end.isoformat(),
        "periodLabel": f"{period_start:%b} {period_start.day}-{period_end.day} {period_end.year}",
        "days": [{"date": d.isoformat(), "sply": totals[d]["sply"].isoformat(), "splm": totals[d]["splm"].isoformat()}
                 for d in days],
        "groups": results["sply"][0],
        "splmGroups": results["splm"][0],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"As of {out['asOf']} | {out['periodLabel']} | {len(days)} days | saved {OUT}")

    detail = {
        "generatedAt": out["generatedAt"],
        "sourceFile": report.name,
        "asOf": out["asOf"],
        "groups": results["sply"][1],
        "splmGroups": results["splm"][1],
    }
    DETAIL_OUT.write_text(json.dumps(detail, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"saved {DETAIL_OUT} ({DETAIL_OUT.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
