"""Write data/outlet-cat.json for the Category drill-down on the Store wise performance tab: per outlet, the sales, GPV and
value adj (OI) of each Division x Category Level 1 x Category Level 3 line, this month, the same days last year and the
same days last month.

Sources
- Sales rows (Oultet wise folder): "THIS NOV.csv", "SPLY Nov.csv" and "SPLM Nov.csv". Each row is a day, an outlet and an
  article line with Article Division, Category L1 and Category L3, and POS NSI (sales) and POS GPV. The file's "Total" row
  has no date and no outlet, so it is left out.
- OI rows (automation folder): the Detail sheet of "Day Wise Val Adj.xlsx", "...SPLY.xlsx" and "...SPLM.xlsx". Each row is
  an article code, an outlet and a division, with a column per day. Each article code gets its Division, Category L1 and
  Category L3 from "Cat Level 3.xlsx" (Power BI folder), so OI joins the sales lines on the same three names.
- The days of each period come from data/daily.json (this month, and the matching days last year and last month).

Usage:  python scripts/extract_outlet_cat.py
"""
import csv
import datetime as dt
import json
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUTLET_FOLDER = ROOT.parent.parent / "val adj" / "Oultet wise"
VAL_FOLDER = ROOT.parent.parent / "val adj" / "autmation for day wise val adj"
CAT_MAP = Path("D:/210610 - Previous Laptop Data/Drive E/Shwapno - Analytics - Mahabub/ShwapnoPowerBi/Cat Level 3.xlsx")
DAILY_JSON = ROOT / "data" / "daily.json"
OUT = ROOT / "data" / "outlet-cat.json"

SALES_FILES = {"this": "THIS NOV.csv", "sply": "SPLY Nov.csv", "splm": "SPLM Nov.csv"}
VAL_FILES = {"this": "Day Wise Val Adj.xlsx", "sply": "Day Wise Val Adj SPLY.xlsx", "splm": "Day Wise Val Adj SPLM.xlsx"}
UNMAPPED = ("(not mapped)", "", "")


def read_article_map():
    """Article code -> (Division, Category Level 1, Level 3), from the Power BI Cat Level 3 sheet."""
    wb = openpyxl.load_workbook(CAT_MAP, read_only=True, data_only=True)
    try:
        out = {}
        for r in wb.worksheets[0].iter_rows(min_row=2, values_only=True):
            if r[0] is None or r[5] is None:
                continue
            out[str(r[0]).strip()] = (str(r[2] or "").strip(), str(r[3] or "").strip(), str(r[5]).strip())
        return out
    finally:
        wb.close()


def read_sales(path, days):
    """(outlet, division, cat1, cat3) -> [sales, GPV] over the days given (a set of ISO dates)."""
    agg = defaultdict(lambda: [0.0, 0.0])
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rd = csv.reader(fh)
        h = next(rd)
        i_date, i_out = h.index("Date"), h.index("Outlet Code")
        i_div, i_l1, i_l3 = h.index("Article Division"), h.index("Category L1"), h.index("Category L3")
        i_nsi, i_gpv = h.index("POS NSI"), h.index("POS GPV")
        for row in rd:
            day = row[i_date][:10]
            outlet = row[i_out].strip()
            if day not in days or not outlet:  # the grand Total row has no date and no outlet
                continue
            k = (outlet, row[i_div].strip(), row[i_l1].strip(), row[i_l3].strip())
            acc = agg[k]
            acc[0] += float(row[i_nsi] or 0)
            acc[1] += float(row[i_gpv] or 0)
    return agg


def read_oi(path, days, article_map):
    """(outlet, division, cat1, cat3) -> OI, summed over the days given. Articles with no map line go to '(not mapped)'."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        rows = wb["Detail"].iter_rows(values_only=True)
        header = next(rows)
        day_cols = [(j, h.date().isoformat()) for j, h in enumerate(header) if isinstance(h, dt.datetime) and h.date().isoformat() in days]
        agg = defaultdict(float)
        for r in rows:
            outlet = str(r[1] or "").strip()
            if not outlet:
                continue
            code = str(r[0] or "").strip()
            line = article_map.get(code, UNMAPPED)
            total = 0.0
            for j, _ in day_cols:
                v = r[j] if j < len(r) else None
                if isinstance(v, (int, float)):
                    total += v
            if total:
                agg[(outlet,) + line] += total
    finally:
        wb.close()
    return agg


def main():
    daily = json.loads(DAILY_JSON.read_text(encoding="utf-8"))
    days = daily["days"]
    period_days = {
        "this": {d["date"][:10] for d in days},
        "sply": {d["sply"][:10] for d in days},
        "splm": {d["splm"][:10] for d in days},
    }
    article_map = read_article_map()
    print(f"article map: {len(article_map)} articles")

    sales = {p: read_sales(OUTLET_FOLDER / SALES_FILES[p], period_days[p]) for p in ("this", "sply", "splm")}
    oi = {p: read_oi(VAL_FOLDER / VAL_FILES[p], period_days[p], article_map) for p in ("this", "sply", "splm")}

    # every line that has sales or OI in any period
    keys = set()
    for p in ("this", "sply", "splm"):
        keys |= {k for k, v in sales[p].items() if v[0] or v[1]}
        keys |= {k for k, v in oi[p].items() if v}

    # each line (Division, Category L1, Category L3) is written once in the key list; an outlet's lines refer to it by index
    key_index, key_list = {}, []
    outlets = defaultdict(list)
    for k in sorted(keys):
        row = []
        for p in ("this", "sply", "splm"):
            s, g = sales[p].get(k, [0.0, 0.0])
            row += [round(s), round(g), round(oi[p].get(k, 0.0))]
        if any(row):
            line = (k[1], k[2], k[3])
            if line not in key_index:
                key_index[line] = len(key_list)
                key_list.append(list(line))
            outlets[k[0]].append([key_index[line]] + row)

    # the OI that found no sales line (its key is not in the sales files) is counted here, so the totals can be checked
    for p in ("this", "sply", "splm"):
        s_total = sum(v[0] for v in sales[p].values())
        oi_total = sum(oi[p].values())
        oi_unjoined = sum(v for k, v in oi[p].items() if k not in sales[p])
        print(f"{p}: sales {s_total:,.0f}  OI {oi_total:,.0f}  OI on lines with no sales {oi_unjoined:,.0f}")

    out = {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "asOf": daily["asOf"],
        "periodLabel": daily["periodLabel"],
        # keys[i] is [Division, Category L1, Category L3]; each outlet line is [key index, then the nine figures below]
        "keys": key_list,
        "columns": ["key", "thisSales", "thisGpv", "thisOi", "splySales", "splyGpv", "splyOi",
                    "splmSales", "splmGpv", "splmOi"],
        "outlets": outlets,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    lines = sum(len(v) for v in outlets.values())
    print(f"{len(outlets)} outlets, {lines} lines saved to {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
