"""Read 'Day wise Sales GP Trend.xlsx' and write data/daily.json: this month day by day, each day
next to the same day last year, for all stores and for same stores, per category head and in total.

The file saves GPV (this month and SPLY) as formulas without their values, so GPV is rebuilt with the
workbook's own formula, sales x GP%. GPV+OI, GP+OI% and basket are worked out from the saved values
the same way the workbook does (GP+OI% = GP% + value adj / sales; basket = sales / footfall).

Usage:  python scripts/extract_daily.py [path-to-xlsx]
Default input: ../1. SALES FILE/Day wise Sales GP Trend.xlsx (relative to this project).
"""
import datetime as dt
import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = ROOT.parent / "1. SALES FILE" / "Day wise Sales GP Trend.xlsx"
OUT = ROOT / "data" / "daily.json"

# store group -> sheet (same block layout in both)
GROUPS = {"all": "ALL STORE", "same": "SPLY SAME STORE"}
# block title (column C of the block's header row) -> field
FIELDS = {
    "Sales THIS MONTH": "sales",
    "SPLY Sales": "splySales",
    "GP% THIS": "gp",
    "SPLY GP%": "splyGp",
    "GPV THIS MONTH": "gpv",
    "SPLY GPV": "splyGpv",
    "VALUE ADJ THIS MONTH": "valueAdj",
    "VALUE ADJ SPLY": "splyValueAdj",
    "FF THIS": "ff",
    "SPLY FF": "splyFf",
}
# written to the JSON; the GP% fields are only used to rebuild GPV
OUTPUT = ("sales", "splySales", "gpv", "splyGpv", "valueAdj", "splyValueAdj", "ff", "splyFf")


def number(v):
    # full precision: the GP% fields are ratios and are rounded only where money is written out
    return float(v) if isinstance(v, (int, float)) else None


def money(values):
    return [round(v, 2) if v is not None else None for v in values]


def read_sheet(ws):
    """Returns (days, heads, total). heads maps (division, role, head) to {field: [value per day]}."""
    rows = list(ws.iter_rows(values_only=True))
    days, cols = None, None
    current = None  # the field of the block being read; None outside the blocks used here
    heads, total = {}, {}
    for row in rows:
        # a block header row has its title in column C and "Category Role" in column D
        if row[3] == "Category Role" and isinstance(row[2], str):
            current = FIELDS.get(row[2])
            if current is None:
                continue
            block_cols = [i for i, v in enumerate(row) if isinstance(v, dt.datetime)]
            if cols is None:
                cols = block_cols
                days = [row[i] for i in cols]
            elif block_cols != cols:
                raise SystemExit(f"Block '{row[2]}' has different day columns from the first block")
            continue
        if current is None or row[2] is None:
            continue
        values = [number(row[i]) for i in cols]
        if row[2] == "Grand Total":
            total[current] = values
            continue
        key = (str(row[2]).strip(), str(row[3]).strip(), str(row[4]).strip())
        head = heads.setdefault(key, {})
        if current in head:
            raise SystemExit(f"Head {key} appears twice in '{current}'")
        head[current] = values
    if cols is None:
        raise SystemExit("No day columns found: the sheet layout has changed")
    return days, heads, total


def fill_gpv(fields, label):
    """GPV = sales x GP% (the workbook's formula). Keeps a saved GPV value when the file has one."""
    for sales, gp, gpv in (("sales", "gp", "gpv"), ("splySales", "splyGp", "splyGpv")):
        gpv_values = fields.setdefault(gpv, [None] * len(fields[sales]))
        for i, (s, r) in enumerate(zip(fields[sales], fields[gp])):
            if gpv_values[i] is None and s is not None and r is not None:
                gpv_values[i] = round(s * r, 2)
        missing = [i for i, s in enumerate(fields[sales]) if s is not None and gpv_values[i] is None]
        if missing:
            raise SystemExit(f"{label}: no {gpv} for day {missing[0] + 1}; the sheet layout may have changed")


def sply_dates(ws, days):
    """The SPLY date the workbook compares each THIS day with, from the detail sheet's header rows."""
    rows = {str(r[0]): r for r in ws.iter_rows(min_row=3, max_row=4, values_only=True) if r[0]}
    this_row, sply_row = rows["THIS date"], rows["SPLY date (compared)"]
    cols = [i for i, v in enumerate(this_row) if isinstance(v, dt.datetime)]
    out = {}
    for i, day in enumerate(days):
        c = cols[i]
        if this_row[c].date() != day.date():
            raise SystemExit(f"Detail sheet day {this_row[c]:%Y-%m-%d} does not match {day:%Y-%m-%d}")
        out[day.date()] = sply_row[c].date()
    return out


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    sheets = {group: read_sheet(wb[name]) for group, name in GROUPS.items()}
    dates = sply_dates(wb["ALL STORE DETAIL"], sheets["all"][0])
    wb.close()

    days = sheets["all"][0]
    total_sales = sheets["all"][2]["sales"]
    # the last day with a sales figure; later columns are not reported yet
    last = max(i for i, v in enumerate(total_sales) if v)
    n = last + 1

    out_groups = {}
    for group, (_, heads, total) in sheets.items():
        fill_gpv(total, f"{group} total")
        for key, fields in heads.items():
            fill_gpv(fields, f"{group} {key[2]}")
        # how much of the company total the category heads cover (the rest is outside the heads)
        head_sales = sum(f["sales"][last] or 0 for f in heads.values())
        group_sales = total["sales"][last]
        print(f"{group}: {len(heads)} heads, heads cover {head_sales / group_sales:.2%} of sales on day {last + 1}")
        out_groups[group] = {
            "total": {k: money(total[k][:n]) for k in OUTPUT},
            "heads": [
                {"division": d, "role": r, "head": h, **{k: money(f[k][:n]) for k in OUTPUT}}
                for (d, r, h), f in heads.items()
            ],
        }

    period_start, period_end = days[0], days[last]
    out = {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "sourceFile": src.name,
        "asOf": period_end.date().isoformat(),
        "periodLabel": f"{period_start:%b} {period_start.day}-{period_end.day} {period_end.year}",
        "days": [{"date": d.date().isoformat(), "sply": dates[d.date()].isoformat()} for d in days[:n]],
        "groups": out_groups,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"As of {out['asOf']} | {out['periodLabel']} | {n} days | saved {OUT}")


if __name__ == "__main__":
    main()
