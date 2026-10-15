# Shwapno Business Performance Dashboard

A Next.js dashboard built from the daily **Business Performance Report.xlsx**.

- **Overview**: sales, target achievement, footfall, basket size and GP, plus division charts and target by leader or zonal manager
- **Divisions**: every metric by division for any store group (all, own, franchise, same store, new)
- **Category heads**: growth by category role and responsible head
- **Outlets & targets**: about 1,000 outlets with target vs achievement, search and filters
- **Categories (Cat 3)**: category-level sales, growth and GP

Each tab can be compared with **SPLY** (same period last year) or **SPLM** (same period last month).

## Daily update

1. Replace `..\1. SALES FILE\Business Performance Report.xlsx` with the new file.
2. Double-click **`update.bat`**.

`update.bat` runs `scripts/extract.py`, which reads the workbook's cached values into:

- `data/months/YYYY-MM.json`: one snapshot per month. It's overwritten each day while the month is open, so the last day becomes the month's final report.
- `data/months/index.json`: the list of months, used by the Overview's month selector.
- `data/report.json`: a copy of the latest month, used by the other tabs.

The Overview reads the monthly snapshots. Its filters are Month, Store group, and vs SPLY / vs SPLM.
It then commits and pushes that file. The GitHub Actions workflow (`.github/workflows/pages.yml`) rebuilds the site and publishes it to
**https://kaziradin.github.io/SHWAPNO_SALES_REPORT/**.

## Local development

```bash
python scripts/extract.py   # Excel -> data/report.json
npm install
npm run dev                 # http://localhost:3000
npm run build               # static export in out/
```

The extractor reads the sheets `SPLY`, `SPLM`, `SPLY -CAT HEAD WISE`, `SPLM-CAT HEAD WISE`,
`Outlet Target - OPS`, `Outlet(SPLY)`, `Outlet(SPLM)` and `CAT 3 Responsible Person Wise`.
If any of those sheets is renamed, update `scripts/extract.py`.
