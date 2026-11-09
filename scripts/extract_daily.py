"""Read the day-wise report and the value adj workbooks and write data/daily.json and data/daily-detail.json:
this month day by day, each day next to the same day last year, for all stores and for same stores, per
category head and in total.

Sources
- Day Wise Sales GP Trend Report.xlsx (the newest file in ../1. SALES FILE whose name matches "Day wise Sales GP
  Trend"): sales, GP% and footfall for this month (THIS) and last year (SPLY), in the day-only, division x head
  and division x category x head x CRP sheets. The sheets' columns are read from their header rows.
- Day Wise Val Adj.xlsx and Day Wise Val Adj SPLY.xlsx (in ../../val adj/autmation for day wise val adj): value adj
  per day and CRP ("Summary Category" sheet). The SPLY file is keyed by the SPLY date.

Figures
- GPV = sales x GP%. Value adj is added for GP+OI: GPV+OI = GPV + value adj.
- Same stores = outlets in both periods (the SPLY SAME OWN and SPLY SAME FRAN value adj columns).
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
REPORT_JSON = ROOT / "data" / "report.json"
OUT = ROOT / "data" / "daily.json"
DETAIL_OUT = ROOT / "data" / "daily-detail.json"

DAY_SHEET = "5 Day only"
HEAD_SHEET = "3 Day x Div x Head"
DETAIL_SHEET = "1 Day x Div x Cat3 x Head x CRP"

# Header rows of the sheets: block (row 3), measure (row 4), period (row 5).
BLOCKS = {"All store": "all", "Same store": "same"}
MEASURES = {"Revenue": "sales", "GP%": "gp", "FF": "ff"}
PERIODS = {"THIS": "this", "THIS (vs SPLY)": "this", "SPLY": "sply"}
# index of the store group in the value adj sums: all outlets, or same stores
STORES = {"all": 0, "same": 1}
OUTPUT = ("sales", "splySales", "gpv", "splyGpv", "valueAdj", "splyValueAdj", "ff", "splyFf")
DETAIL_FIELDS = ("sales", "splySales", "gpv", "splyGpv", "valueAdj", "splyValueAdj")
ZERO = (0.0, 0.0)


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
    """(block, field, period) -> column index, read from the sheet's header rows. Only the 'All store' and
    'Same store' blocks are read; their OWN and FRAN blocks are not used."""
    block_row, measure_row, period_row = list(ws.iter_rows(min_row=3, max_row=5, values_only=True))
    found, block = {}, None
    for i in range(len(block_row)):
        label = text(block_row[i])
        if label is not None and label.startswith(("All store", "Same store")):
            block = BLOCKS.get(label)
        measure, period = MEASURES.get(text(measure_row[i])), PERIODS.get(text(period_row[i]))
        if block and measure and period:
            found[(block, measure, period)] = i
    needed = [(b, m, p) for b in BLOCKS.values() for m in MEASURES.values() for p in ("this", "sply")]
    missing = [k for k in needed if k not in found]
    if missing:
        raise SystemExit(f"{ws.title}: columns not found for {missing}; the sheet layout may have changed")
    return found


def read_totals(ws):
    """Day -> {'sply': SPLY date, 'all': {(field, period): value}, 'same': {...}} from the day-only sheet."""
    cols = columns(ws)
    out = {}
    for row in ws.iter_rows(min_row=6, values_only=True):
        if not isinstance(row[0], dt.datetime) or not isinstance(row[1], dt.datetime):
            continue
        out[row[0].date()] = {
            "sply": row[1].date(),
            **{g: {(m, p): number(row[i]) for (b, m, p), i in cols.items() if b == g} for g in STORES},
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
        key = (row[0].date(), div, text(row[4]), text(row[5]), text(row[6]))
        if key in out:
            raise SystemExit(f"{ws.title}: {key} appears twice")
        out[key] = values
    return out, skipped


def read_value_adj(path):
    """Rows of the Summary Category sheet: (day, division, category, head, crp, all outlets, same stores)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = wb["Summary Category"].iter_rows(values_only=True)
    header = [text(h) for h in next(rows)]

    def column(*names):
        for name in names:
            if name in header:
                return header.index(name)
        raise SystemExit(f"{path.name}: none of {names} in the Summary Category header")

    all_col = column("All Outlets", "Grand Total")
    same_cols = (column("SPLY SAME OWN"), column("SPLY SAME FRAN"))
    out = []
    for row in rows:
        if not isinstance(row[0], dt.datetime) or text(row[1]) in (None, "Total", "GRAND TOTAL"):
            continue
        same = sum(number(row[c]) or 0.0 for c in same_cols)
        out.append((row[0].date(), text(row[1]), text(row[2]), text(row[3]), text(row[4]),
                    number(row[all_col]) or 0.0, same))
    wb.close()
    return out


def value_adj_sums(rows):
    """Value adj summed by day, by day and head, and by day and CRP. Value adj is only given per CRP, so the
    head and day sums are the sums of those CRP rows and nothing is counted twice."""
    total = defaultdict(lambda: [0.0, 0.0])
    head = defaultdict(lambda: [0.0, 0.0])
    crp = defaultdict(lambda: [0.0, 0.0])
    for day, div, cat, hd, c, all_v, same_v in rows:
        for bucket, key in ((total, day), (head, (day, div, hd)), (crp, (day, div, cat, hd, c))):
            bucket[key][0] += all_v
            bucket[key][1] += same_v
    return {"total": total, "head": head, "crp": crp}


def report_roles():
    """Category role of each head, from the monthly report (the day-wise sheets do not have it). A head the
    report does not list takes the role of its division."""
    heads = json.loads(REPORT_JSON.read_text(encoding="utf-8"))["sply"]["heads"]
    by_head = {(h["division"], h["head"]): h["role"] for h in heads}
    by_division = {}
    for h in heads:
        by_division.setdefault(h["division"], h["role"])
    return by_head, by_division


def main():
    report = Path(sys.argv[1]) if len(sys.argv) > 1 else find_day_wise()
    for path in (VAL_THIS, VAL_SPLY):
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

    this_rows, sply_rows = read_value_adj(VAL_THIS), read_value_adj(VAL_SPLY)
    va_this, va_sply = value_adj_sums(this_rows), value_adj_sums(sply_rows)

    # the last day with a sales figure; later columns are not reported yet
    days = sorted(totals)
    last = max(i for i, d in enumerate(days) if totals[d]["all"][("sales", "this")])
    days = days[: last + 1]
    sply = {d: totals[d]["sply"] for d in days}
    this_days = {r[0] for r in this_rows}
    sply_days = {r[0] for r in sply_rows}
    if [d for d in days if d not in this_days] or [sply[d] for d in days if sply[d] not in sply_days]:
        raise SystemExit("A day of the report is missing from the value adj workbooks")

    roles_by_head, roles_by_division = report_roles()

    def role(division, head):
        if (division, head) in roles_by_head:
            return roles_by_head[(division, head)]
        print(f"Head {head} ({division}) is not in the monthly report: role taken from its division")
        return roles_by_division.get(division, "")

    out_groups = {}
    for g, i in STORES.items():
        total = {k: [] for k in OUTPUT}
        for d in days:
            t = totals[d][g]
            values = {
                "sales": t[("sales", "this")], "splySales": t[("sales", "sply")],
                "gpv": product(t[("sales", "this")], t[("gp", "this")]),
                "splyGpv": product(t[("sales", "sply")], t[("gp", "sply")]),
                "valueAdj": va_this["total"].get(d, ZERO)[i],
                "splyValueAdj": va_sply["total"].get(sply[d], ZERO)[i],
                "ff": t[("ff", "this")], "splyFf": t[("ff", "sply")],
            }
            for k in OUTPUT:
                total[k].append(values[k])

        head_rows = []
        for div, hd in head_order:
            fields = {k: [] for k in OUTPUT}
            for d in days:
                h = heads.get((d, div, hd), {})
                values = {
                    "sales": h.get((g, "sales", "this")), "splySales": h.get((g, "sales", "sply")),
                    "gpv": product(h.get((g, "sales", "this")), h.get((g, "gp", "this"))),
                    "splyGpv": product(h.get((g, "sales", "sply")), h.get((g, "gp", "sply"))),
                    "valueAdj": va_this["head"].get((d, div, hd), ZERO)[i],
                    "splyValueAdj": va_sply["head"].get((sply[d], div, hd), ZERO)[i],
                    "ff": h.get((g, "ff", "this")), "splyFf": h.get((g, "ff", "sply")),
                }
                for k in OUTPUT:
                    fields[k].append(values[k])
            head_rows.append({"division": div, "role": role(div, hd), "head": hd,
                              **{k: money(v) for k, v in fields.items()}})

        # how much of the company total the category heads cover (the rest is outside the heads)
        head_sales = sum(h["sales"][-1] or 0 for h in head_rows if h["sales"])
        group_sales = total["sales"][-1] or 1
        print(f"{g}: {len(head_rows)} heads, heads cover {head_sales / group_sales:.2%} of sales on {days[-1]:%d-%b}")
        out_groups[g] = {"total": {k: money(v) for k, v in total.items()}, "heads": head_rows}

    period_start, period_end = days[0], days[-1]
    out = {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "sourceFile": report.name,
        "asOf": period_end.isoformat(),
        "periodLabel": f"{period_start:%b} {period_start.day}-{period_end.day} {period_end.year}",
        "days": [{"date": d.isoformat(), "sply": sply[d].isoformat()} for d in days],
        "groups": out_groups,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"As of {out['asOf']} | {out['periodLabel']} | {len(days)} days | saved {OUT}")

    # detail rows: one per division, category or CRP. Value adj is given per CRP only.
    keys = list(dict.fromkeys(
        [k[1:] for k in leaves] + [k[1:] for k in va_this["crp"]] + [k[1:] for k in va_sply["crp"]]))
    detail_groups = {}
    for g, i in STORES.items():
        rows = []
        for key in keys:
            div, cat, hd, c = key
            vals = {k: [] for k in DETAIL_FIELDS}
            for d in days:
                leaf = leaves.get((d, *key), {})
                s, ss = leaf.get((g, "sales", "this")), leaf.get((g, "sales", "sply"))
                gp, sgp = leaf.get((g, "gp", "this")), leaf.get((g, "gp", "sply"))
                vals["sales"].append(s)
                vals["splySales"].append(ss)
                vals["gpv"].append(product(s, gp))
                vals["splyGpv"].append(product(ss, sgp))
                vals["valueAdj"].append(va_this["crp"].get((d, *key), ZERO)[i])
                vals["splyValueAdj"].append(va_sply["crp"].get((sply[d], *key), ZERO)[i])
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
                raise SystemExit(f"{g} detail sales differ from the day total on {d:%d-%b} by {row_sales - total_sales:,.0f}")
        va_gap = [round((out_groups[g]["total"]["valueAdj"][n] or 0) - sum(r["valueAdj"][n] or 0 for r in rows))
                  for n in range(len(days))]
        print(f"{g}: {len(rows)} detail rows; value adj not on any row (taka): {va_gap}")

    detail = {
        "generatedAt": out["generatedAt"],
        "sourceFile": report.name,
        "asOf": out["asOf"],
        "groups": detail_groups,
    }
    DETAIL_OUT.write_text(json.dumps(detail, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"saved {DETAIL_OUT} ({DETAIL_OUT.stat().st_size / 1e6:.2f} MB)")


if __name__ == "__main__":
    main()
