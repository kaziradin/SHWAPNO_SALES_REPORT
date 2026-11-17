"""Read the outlet-wise files, the zonal file and Outlet_DV, and write data/stores.json for the Store wise performance tab.

Run after extract_daily.py: the days (this month, and the matching days last year and last month) are taken from
data/daily.json, so the outlet figures use the same days as the Day wise and Category wise tabs.

Sources
- Outlet-wise files in ../val adj/Oultet wise: one file per comparison, named like "This NOV DATE+OUTLET.csv",
  "SPLY NOV DATE+OUTLET.csv" and "SPLM NOV DATE+OUTLET.csv" (the newest matching file of each kind is used, so the
  December files are picked up when they arrive). Each row is a day and an outlet: POS NSI (sales), POS GPV and Footfall.
  The "Total" rows are left out.
- Zonal file in ../val adj/Oultet wise/ZONAL FILE: the newest "Zonal file_*.xlsx", sheet "Final_Zone Dis". Gives each
  outlet's division, format, leader, zonal manager, regional head and district.
- Outlet_DV.xlsx (ShwapnoPowerBi folder): the outlet lists. Status (own or franchise) comes from the SAME/NEW OWN and FRAN
  lists; same store vs last year and vs last month come from the SPLY and SPLM SAME STORE lists.

Usage:  python scripts/extract_stores.py
"""
import csv
import datetime as dt
import json
import re
from collections import defaultdict
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
OUTLET_FOLDER = ROOT.parent.parent / "val adj" / "Oultet wise"
ZONAL_FOLDER = OUTLET_FOLDER / "ZONAL FILE"
OUTLET_DV = Path("D:/210610 - Previous Laptop Data/Drive E/Shwapno - Analytics - Mahabub/ShwapnoPowerBi/Outlet_DV.xlsx")
DAILY_JSON = ROOT / "data" / "daily.json"
OUT = ROOT / "data" / "stores.json"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
KIND_RE = re.compile(r"^(This|SPLY|SPLM)\s.*DATE\+OUTLET\.csv$", re.IGNORECASE)


def num(v):
    return float(v) if v not in (None, "") else 0.0


def newest(paths):
    paths = [p for p in paths if not p.name.startswith("~$")]
    if not paths:
        return None
    return max(paths, key=lambda p: p.stat().st_mtime)


def read_outlet_file(path):
    """(date, outlet code) -> {sales, gpv, ff, name}, from one day-by-outlet file."""
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            day = row.get("Date") or ""
            if not DATE_RE.match(day):
                continue  # the file's "Total" rows
            code = (row.get("Outlet Code") or "").strip()
            if not code:
                continue
            key = (day, code)
            cell = out.setdefault(key, {"sales": 0.0, "gpv": 0.0, "ff": 0.0, "name": (row.get("Outlet Name") or "").strip()})
            cell["sales"] += num(row.get("POS NSI"))
            cell["gpv"] += num(row.get("POS GPV"))
            cell["ff"] += num(row.get("Footfall"))
    return out


def read_zonal(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Final_Zone Dis"]
    rows = ws.iter_rows(values_only=True)
    header = [str(h).strip() if h is not None else None for h in next(rows)]
    idx = {h: i for i, h in enumerate(header)}
    out = {}
    for r in rows:
        code = str(r[idx["CODE"]]).strip() if r[idx["CODE"]] is not None else ""
        if not code:
            continue
        out[code] = {
            "name": str(r[idx["Outlet Name"]] or "").strip(),
            "division": str(r[idx["Division"]] or "").strip(),
            "format": str(r[idx["Format"]] or "").strip(),
            "leader": str(r[idx["Leader"]] or "").strip(),
            "zonal": str(r[idx["Zonal"]] or "").strip(),
            "regional": str(r[idx["Regional Head HR Name"]] or "").strip(),
            "district": str(r[idx["District"]] or "").strip(),
        }
    wb.close()
    return out


def read_outlet_dv(path):
    """The outlet lists of Outlet_DV: name -> set of outlet codes (the VALUE columns are left out)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(wb["Outlet DV"].iter_rows(values_only=True))
    wb.close()
    head = rows[0]
    lists = {}
    for j, name in enumerate(head):
        if not name or str(name).endswith("VALUE"):
            continue
        lists[str(name).strip()] = {str(r[j]).strip() for r in rows[1:] if j < len(r) and r[j] not in (None, "")}
    return lists


def main():
    daily = json.loads(DAILY_JSON.read_text(encoding="utf-8"))
    days = daily["days"]  # each: date (this month), sply, splm

    zonal_file = newest(list(ZONAL_FOLDER.glob("Zonal file_*.xlsx")))
    if zonal_file is None:
        raise SystemExit(f"No zonal file in {ZONAL_FOLDER}: expected a name like 'Zonal file_nov26.xlsx'")
    kinds = {}
    for kind in ("This", "SPLY", "SPLM"):
        found = [p for p in OUTLET_FOLDER.glob("*.csv") if KIND_RE.match(p.name) and p.name.split()[0].lower() == kind.lower()]
        f = newest(found)
        if f is None:
            raise SystemExit(f"No outlet file for {kind} in {OUTLET_FOLDER}")
        kinds[kind] = f
    if not OUTLET_DV.exists():
        raise SystemExit(f"Outlet_DV not found: {OUTLET_DV}")

    print("Zonal file:", zonal_file.name)
    for k, f in kinds.items():
        print(f"{k} outlet file: {f.name}")
    print("Outlet_DV:", OUTLET_DV.name)

    zonal = read_zonal(zonal_file)
    dv = read_outlet_dv(OUTLET_DV)
    this = read_outlet_file(kinds["This"])
    sply = read_outlet_file(kinds["SPLY"])
    splm = read_outlet_file(kinds["SPLM"])

    # the days of the dashboard: this month's days, and the matching days last year and last month
    per = {"this": defaultdict(lambda: {"sales": 0.0, "gpv": 0.0, "ff": 0.0}),
           "sply": defaultdict(lambda: {"sales": 0.0, "gpv": 0.0, "ff": 0.0}),
           "splm": defaultdict(lambda: {"sales": 0.0, "gpv": 0.0, "ff": 0.0})}
    names = {}
    for d in days:
        for period, src, date in (("this", this, d["date"][:10]), ("sply", sply, d["sply"][:10]), ("splm", splm, d["splm"][:10])):
            for (day, code), v in src.items():
                if day != date:
                    continue
                acc = per[period][code]
                acc["sales"] += v["sales"]; acc["gpv"] += v["gpv"]; acc["ff"] += v["ff"]
                if v["name"]:
                    names.setdefault(code, v["name"])

    codes = set(zonal) | {c for c, v in per["this"].items() if v["sales"]} | {c for c, v in per["sply"].items() if v["sales"]} | {c for c, v in per["splm"].items() if v["sales"]}

    def status_of(code):
        if code in dv.get("SPLY SAME OWN", set()) | dv.get("SPLY NEW OWN", set()):
            return "Own"
        if code in dv.get("SPLY SAME FRAN", set()) | dv.get("SPLY NEW FRAN", set()):
            return "Franchise"
        if code in dv.get("SPLM SAME OWN", set()) | dv.get("SPLM NEW OWN", set()):
            return "Own"
        if code in dv.get("SPLM SAME FRAN", set()) | dv.get("SPLM NEW FRAN", set()):
            return "Franchise"
        return "Unknown"

    def money(v):
        return round(v, 2)

    outlets = []
    for code in sorted(codes):
        z = zonal.get(code, {})
        outlets.append({
            "code": code,
            "name": z.get("name") or names.get(code, code),
            "division": z.get("division", ""),
            "format": z.get("format", ""),
            "leader": z.get("leader", ""),
            "zonal": z.get("zonal", ""),
            "regional": z.get("regional", ""),
            "district": z.get("district", ""),
            "inZonal": code in zonal,
            "status": status_of(code),
            "sameSply": code in dv.get("SPLY SAME STORE", set()),
            "sameSplm": code in dv.get("SPLM SAME STORE", set()),
            **{p: {"sales": money(per[p][code]["sales"]), "gpv": money(per[p][code]["gpv"]), "ff": round(per[p][code]["ff"])}
               for p in ("this", "sply", "splm")},
        })

    # the outlet totals against the dashboard's day totals (small gaps are expected: the outlet files are a separate export)
    t = daily["groups"]["all"]["total"]
    for p, key in (("this", "sales"), ("sply", "splySales"), ("splm", "splySales")):
        if p == "splm":
            t = daily["splmGroups"]["all"]["total"]
        outlet_total = sum(o[p]["sales"] for o in outlets)
        day_total = sum(v or 0 for v in t[key])
        print(f"{p}: outlets {outlet_total:,.0f} vs dashboard {day_total:,.0f} ({(outlet_total / day_total - 1) * 100:+.3f}%)")

    out = {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "asOf": daily["asOf"],
        "periodLabel": daily["periodLabel"],
        "zonalFile": zonal_file.name,
        "outletFiles": {k: f.name for k, f in kinds.items()},
        "outlets": outlets,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(outlets)} outlets saved to {OUT} ({OUT.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
