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

- Store wise target file in the ZONAL FILE folder: the "Store wise Target*.xlsx" whose day headers give the month of the
  data (so the December file is picked up when it arrives; the newest is used if two match). It has four blocks of day
  columns: sales, GPV, FF and BS targets. Each outlet gets its sales, GPV and footfall target for each day of the data.
  The basket target is sales / footfall, as the workbook's BS block is on every day.

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


TARGET_GLOB = "Store wise Target*.xlsx"


def cell(row, j):
    return row[j] if j < len(row) else None


def target_num(v):
    """A target figure as a number; blanks and error values such as #DIV/0! count as zero."""
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def read_top(path):
    """The first four rows of a target workbook (its label row and header row), read without loading the rest."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        return [tuple(r) for r in wb.worksheets[0].iter_rows(min_row=1, max_row=4, values_only=True)]
    finally:
        wb.close()


def target_layout(top):
    """The four day blocks of the target sheet (sales, GPV, FF, BS), from its label row and header row. Each block is a
    run of date columns over the same days; the FF and BS blocks are labelled in the row above their first column."""
    labels, header = top[1], top[3]
    runs = []
    for j, v in enumerate(header):
        if isinstance(v, dt.datetime):
            if runs and runs[-1]["end"] == j - 1:
                runs[-1]["end"] = j
                runs[-1]["dates"].append(v.date())
            else:
                runs.append({"start": j, "end": j, "dates": [v.date()]})
    if len(runs) != 4 or any(r["dates"] != runs[0]["dates"] for r in runs):
        raise SystemExit("The target sheet is not in the expected layout: four blocks of day columns (sales, GPV, FF, BS) "
                         "over the same days.")
    if str(cell(labels, runs[2]["start"]) or "").strip() != "FF" or str(cell(labels, runs[3]["start"]) or "").strip() != "BS":
        raise SystemExit("The target sheet's FF and BS labels are not above the expected columns.")
    return runs


def target_month(path):
    d = target_layout(read_top(path))[0]["dates"][0]
    return f"{d.year:04d}-{d.month:02d}"


def pick_target(folder, month):
    """The Store wise target file for the month of the data, found from the day headers of each file, so a file for a
    new month (such as 'Store wise TargetDEC26.xlsx') is picked up when it arrives. The newest is used if several match."""
    found = [p for p in folder.glob(TARGET_GLOB) if not p.name.startswith("~$") and target_month(p) == month]
    f = newest(found)
    if f is None:
        raise SystemExit(f"No store wise target file for {month} in {folder}: expected a name like 'Store wise Targetnov26.xlsx'")
    return f


def read_targets(path):
    """Per outlet code, the target sales, GPV and footfall of each day of the target month:
    {"dates": [ISO dates], "codes": {code: [[sales, GPV, footfall] per date]}}."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        rows = wb.worksheets[0].iter_rows(values_only=True)
        top = [tuple(next(rows)) for _ in range(4)]
        runs = target_layout(top)
        header = list(top[3])
        code_col = next(j for j, v in enumerate(header) if str(v or "").strip() == "Outlet Code")
        dates = [d.isoformat() for d in runs[0]["dates"]]
        codes, blank = {}, 0
        for r in rows:
            code = str(cell(r, code_col) or "").strip()
            if not code:
                blank += 1
                if blank > 50:  # the data ends in a long run of empty rows
                    break
                continue
            blank = 0
            codes[code] = [[target_num(cell(r, runs[0]["start"] + k)), target_num(cell(r, runs[1]["start"] + k)),
                            target_num(cell(r, runs[2]["start"] + k))] for k in range(len(dates))]
    finally:
        wb.close()
    return {"dates": dates, "codes": codes}


def day_targets(per_date, day_k):
    """One outlet's target [sales, GPV, footfall] for each day of the data; zero where the target file has no such day.
    Footfall keeps two decimals, so the basket target (sales / footfall) is not distorted by rounding."""
    return [[round(per_date[k][0]), round(per_date[k][1]), round(per_date[k][2], 2)] if k is not None else [0, 0, 0] for k in day_k]


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
    target_file = pick_target(ZONAL_FOLDER, days[0]["date"][:7])
    print("Store wise target:", target_file.name)

    zonal = read_zonal(zonal_file)
    dv = read_outlet_dv(OUTLET_DV)
    this = read_outlet_file(kinds["This"])
    sply = read_outlet_file(kinds["SPLY"])
    splm = read_outlet_file(kinds["SPLM"])
    targets = read_targets(target_file)
    tgt_index = {d: k for k, d in enumerate(targets["dates"])}
    day_k = [tgt_index.get(d["date"][:10]) for d in days]  # the target file's column of each day of the data
    if any(k is None for k in day_k):
        print("No target for", [d["date"][:10] for d, k in zip(days, day_k) if k is None])

    # the days of the dashboard: this month's days, and the matching days last year and last month. Each outlet gets one
    # [sales, GPV, footfall] per day, so the Store wise tab can total any From-To range of the month.
    n = len(days)
    periods = {"this": "date", "sply": "sply", "splm": "splm"}
    day_index = {p: defaultdict(list) for p in periods}
    for i, d in enumerate(days):
        for p, key in periods.items():
            day_index[p][d[key][:10]].append(i)
    per = {p: defaultdict(lambda: [[0.0, 0.0, 0.0] for _ in range(n)]) for p in periods}
    names = {}
    for p, src in (("this", this), ("sply", sply), ("splm", splm)):
        for (day, code), v in src.items():
            idx = day_index[p].get(day)
            if not idx:
                continue
            for i in idx:
                acc = per[p][code][i]
                acc[0] += v["sales"]; acc[1] += v["gpv"]; acc[2] += v["ff"]
            if v["name"]:
                names.setdefault(code, v["name"])

    codes = set(zonal) | {c for p in periods for c, rows_ in per[p].items() if any(r[0] for r in rows_)}

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
            "target": day_targets(targets["codes"][code], day_k) if code in targets["codes"] else None,
            "daily": {p: [[round(s), round(g), round(f)] for s, g, f in per[p][code]] for p in periods},
        })

    # the outlet totals against the dashboard's day totals (small gaps are expected: the outlet files are a separate export)
    t = daily["groups"]["all"]["total"]
    for p, key in (("this", "sales"), ("sply", "splySales"), ("splm", "splySales")):
        if p == "splm":
            t = daily["splmGroups"]["all"]["total"]
        outlet_total = sum(day[0] for o in outlets for day in o["daily"][p])
        day_total = sum(v or 0 for v in t[key])
        print(f"{p}: outlets {outlet_total:,.0f} vs dashboard {day_total:,.0f} ({(outlet_total / day_total - 1) * 100:+.3f}%)")

    with_target = sum(1 for o in outlets if o["target"] is not None)
    print(f"targets: {with_target} of {len(outlets)} outlets have a target in {target_file.name}")
    out = {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "asOf": daily["asOf"],
        "periodLabel": daily["periodLabel"],
        "zonalFile": zonal_file.name,
        "targetFile": target_file.name,
        "outletFiles": {k: f.name for k, f in kinds.items()},
        "days": [{"date": d["date"][:10], "sply": d["sply"][:10], "splm": d["splm"][:10]} for d in days],
        "outlets": outlets,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(outlets)} outlets saved to {OUT} ({OUT.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
