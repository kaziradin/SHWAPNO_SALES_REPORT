"""Read 'Business Performance Report.xlsx' and write the dashboard data:
data/months/YYYY-MM.json (one per month), data/months/index.json, and data/report.json (latest month).

Usage:  python scripts/extract.py [path-to-xlsx]
Default input: ../1. SALES FILE/Business Performance Report.xlsx (relative to this project).
"""
import datetime as dt
import json
import math
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_XLSX = ROOT.parent / "1. SALES FILE" / "Business Performance Report.xlsx"
OUT = ROOT / "data" / "report.json"
MONTHS = ROOT / "data" / "months"

SEGMENTS = {
    "ALL STORE": "all",
    "ALL OWN STORE": "own",
    "ALL FRANCHISE STORE": "franchise",
    "SAME STORE": "same",
    "OWN SAME STORE": "ownSame",
    "FRANCHISE SAME STORE": "franchiseSame",
    "NEW OWN STORE": "newOwn",
    "NEW FRANCHISE": "newFranchise",
}

# header text (normalised) -> output key
METRICS = {
    "SALES THIS": "sales", "SALES LAST": "salesLast",
    "FF THIS": "ff", "FF LAST": "ffLast",
    "BS THIS": "bs", "BS LAST": "bsLast",
    "GP% THIS": "gp", "GP% LAST": "gpLast",
    "GPV THIS": "gpv", "GPV LAST": "gpvLast",
    "CPV THIS": "cpv", "CPV LAST": "cpvLast",
    # GP including other income (the workbook calls it "Adjusted GP%" / "Adj GPV")
    "ADJUSTED GP% THIS": "gpOi", "ADJUSTED GP% LAST": "gpOiLast",
    "ADJ GPV THIS": "gpvOi", "ADJ GPV LAST": "gpvOiLast",
}


def norm(v):
    return re.sub(r"\s+", " ", str(v)).strip().upper() if v is not None else ""


def num(v, digits=4):
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return None if math.isnan(v) or math.isinf(v) else round(float(v), digits)
    try:
        return round(float(str(v).replace(",", "")), digits)
    except ValueError:
        return None


def pct(v):
    return None if v is None else round(v / 100, 5)


def dump(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def legacy(report):
    """Round the SPLY/SPLM store-group blocks to 4 decimals, as report.json always had them."""
    for c in ("sply", "splm"):
        for block in report[c]["segments"].values():
            for rec in block["divisions"] + ([block["total"]] if block["total"] else []):
                for k, v in rec.items():
                    if isinstance(v, float):
                        rec[k] = round(v, 4)
    return report


def rows_of(ws):
    return [list(r) for r in ws.iter_rows(values_only=True)]


def header_map(header):
    """First occurrence of each known metric header -> column index."""
    cols = {}
    for i, h in enumerate(header):
        key = METRICS.get(norm(h))
        if key and key not in cols:
            cols[key] = i
    return cols


def comparison(ws):
    """Parse SPLY / SPLM sheets: blocks of division rows per store segment."""
    rows = rows_of(ws)
    label = next((r[1] for r in rows[:3] if isinstance(r[1], str) and "Same Day" in r[1]), "")
    out, seg, cols = {}, None, {}
    for r in rows:
        a = norm(r[0])
        if a in SEGMENTS and norm(r[1]) == "SALES THIS":
            seg, cols = SEGMENTS[a], header_map(r)
            if seg in out:  # later duplicate blocks (e.g. trailing SAME STORE) are ignored
                seg = None
            else:
                out[seg] = {"divisions": [], "total": None}
            continue
        if seg is None or not a:
            continue
        rec = {k: num(r[i], 10) for k, i in cols.items() if i < len(r)}  # full precision; see legacy()
        if rec.get("sales") is None:
            continue
        if a == "TOTALS":
            out[seg]["total"] = rec
            seg = None
        else:
            out[seg]["divisions"].append({"division": str(r[0]).strip(), **rec})
    return label.strip(), out


def category_heads(ws):
    """ALL STORE block of the CAT HEAD WISE sheets."""
    rows = rows_of(ws)
    out, cols, active = [], {}, False
    for r in rows:
        a = norm(r[0])
        if a == "ALL STORE" and any(norm(c) == "SALES THIS" for c in r[:6]):
            cols, active = header_map(r), True
            continue
        if not active:
            continue
        if not a or a == "TOTALS" or a in SEGMENTS:
            if out:
                break
            continue
        rec = {k: num(r[i]) for k, i in cols.items() if i < len(r)}
        if rec.get("sales") is None:
            continue
        out.append({"division": str(r[0]).strip(), "role": str(r[1] or "").strip(),
                    "head": str(r[2] or "").strip(), **rec})
    return out


def outlet_compare(ws):
    rows = rows_of(ws)
    hdr = next(i for i, r in enumerate(rows) if norm(r[0]) == "CODE")
    out = {}
    for r in rows[hdr + 1:]:
        code = str(r[0] or "").strip()
        if not re.fullmatch(r"[A-Z]\d{3}", code):
            continue
        out[code] = {
            "sales": num(r[1]), "salesLast": num(r[2]),
            "ff": num(r[3]), "ffLast": num(r[4]),
            "gp": num(r[5]), "gpLast": num(r[6]),
            "gpv": num(r[9]) if len(r) > 9 else None,
            "gpvLast": num(r[10]) if len(r) > 10 else None,
        }
    return out


def outlets(wb):
    rows = rows_of(wb["Outlet Target - OPS"])
    as_of = rows[0][0]
    sply, splm = outlet_compare(wb["Outlet(SPLY)"]), outlet_compare(wb["Outlet(SPLM)"])
    out = []
    for r in rows[3:]:
        code = str(r[0] or "").strip()
        if not re.fullmatch(r"[A-Z]\d{3}", code):
            continue
        name = re.sub(rf"^{code}\s*-\s*", "", str(r[1] or "")).strip()
        y, m = sply.get(code, {}), splm.get(code, {})
        out.append({
            "code": code, "name": name,
            "leader": str(r[2] or "").strip(), "zonal": str(r[3] or "").strip(),
            "target": num(r[4]), "achv": num(r[5]),
            # growth pairs come from the same sheet so "this" and "last" cover identical days
            "salesTy": y.get("sales"), "salesLy": y.get("salesLast"),
            "salesTm": m.get("sales"), "salesLm": m.get("salesLast"),
            "ff": y.get("ff") or m.get("ff"), "ffLy": y.get("ffLast"), "ffLm": m.get("ffLast"),
            # outlet sheets store GP as a percentage number (17.4); keep fractions everywhere
            "gp": pct(y.get("gp") or m.get("gp")),
        })
    company = {"target": num(rows[0][4]), "achv": num(rows[0][5])}
    return as_of, company, out


def cat3(ws):
    rows = rows_of(ws)
    out = []
    for r in rows[2:]:
        if not r[1] or not r[3]:
            continue
        sales = num(r[6])
        if sales is None:
            continue
        out.append({
            "division": str(r[1]).strip(), "cat1": str(r[2] or "").strip(),
            "cat3": str(r[3]).strip(), "crp": str(r[4] or "").strip(), "head": str(r[5] or "").strip(),
            "sales": sales, "salesLy": num(r[7]),
            "sameSales": num(r[9]), "sameSalesLy": num(r[10]),
            "gp": num(r[12]), "gpLy": num(r[13]),
            "gpv": num(r[24]), "gpvLy": num(r[25]),
        })
    return out


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    print(f"Reading {src} ...")
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)

    sply_label, sply = comparison(wb["SPLY"])
    splm_label, splm = comparison(wb["SPLM"])
    as_of, company, outlet_rows = outlets(wb)
    if isinstance(as_of, (dt.datetime, dt.date)):
        as_of = as_of.strftime("%Y-%m-%d")

    report = {
        "generatedAt": dt.datetime.now().isoformat(timespec="seconds"),
        "sourceFile": src.name,
        "asOf": as_of,
        # "Same Day SPLY Oct 1-13 2026 vs 1-13th Oct 2025 ..." -> "Oct 1-13 2026"
        "periodLabel": re.split(r"\s+vs\s+", sply_label.replace("Same Day SPLY", ""), flags=re.I)[0].strip(),
        "target": company,
        "sply": {"label": sply_label, "segments": sply,
                 "heads": category_heads(wb["SPLY -CAT HEAD WISE"])},
        "splm": {"label": splm_label, "segments": splm,
                 "heads": category_heads(wb["SPLM-CAT HEAD WISE"])},
        "outlets": outlet_rows,
        "cat3": cat3(wb["CAT 3 Responsible Person Wise"]),
    }
    # One snapshot per month, overwritten daily while the month is open; the last
    # day's file is what remains as that month's final report.
    month = str(as_of)[:7]
    MONTHS.mkdir(parents=True, exist_ok=True)
    dump(MONTHS / f"{month}.json", report)

    index = []
    for f in sorted(MONTHS.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9].json")):
        m = json.loads(f.read_text(encoding="utf-8"))
        index.append({"month": f.stem, "asOf": m["asOf"], "periodLabel": m["periodLabel"]})
    dump(MONTHS / "index.json", index)

    # report.json (used by the other tabs) always mirrors the latest month, with the
    # 4-decimal rounding those tabs were built on so their figures stay exactly the same.
    latest = index[-1]["month"]
    dump(OUT, legacy(json.loads((MONTHS / f"{latest}.json").read_text(encoding="utf-8"))))

    print(f"As of {as_of} | {len(outlet_rows)} outlets | {len(report['cat3'])} cat-3 rows "
          f"| SPLY segments {list(sply)}")
    print(f"Saved month {month}; months on file: {', '.join(i['month'] for i in index)}; report.json = {latest}")


if __name__ == "__main__":
    main()
