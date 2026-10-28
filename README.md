# Shwapno Business Performance Dashboard

A Next.js dashboard built from two daily workbooks in `..\1. SALES FILE`:
**Business Performance Report.xlsx** and **Day wise Sales GP Trend.xlsx**.

- **Overview**: sales, target achievement, footfall, basket size and GP, plus division charts and target by leader or zonal manager
- **Category heads**: growth by category role and responsible head, with the responsible persons behind each head (SPLY)
- **Day wise sales**: each day of the month against the same day last year, for sales, GPV and GP+OI%, for all stores or same stores, per category head or in total
- **Outlets & targets**: about 1,000 outlets with target vs achievement, search and filters

The Overview, Category heads and Outlets tabs can be compared with **SPLY** (same period last year) or **SPLM** (same period last month). The Day wise sales tab compares each day with the same day last year.

## Daily update

1. Replace `..\1. SALES FILE\Business Performance Report.xlsx` and `..\1. SALES FILE\Day wise Sales GP Trend.xlsx` with the new files.
2. Double-click **`update.bat`**.

`update.bat` runs `scripts/extract.py` and `scripts/extract_daily.py`, which read the workbooks' values into:

- `data/months/YYYY-MM.json`: one snapshot per month. It's overwritten each day while the month is open, so the last day becomes the month's final report.
- `data/months/index.json`: the list of months, used by the Overview's month selector.
- `data/report.json`: a copy of the latest month, used by the other tabs.
- `data/daily.json`: each day of the month and the same day last year (sales, GPV, value adj, footfall), for all stores and same stores, per category head and in total. Overwritten each run.

The day-wise workbook saves GPV as formulas without values, so `extract_daily.py` rebuilds GPV as sales × GP%, the workbook's own formula.

`update.bat` then commits and pushes the `data` folder. The GitHub Actions workflow (`.github/workflows/pages.yml`) rebuilds the site and publishes it to
**https://kaziradin.github.io/SHWAPNO_SALES_REPORT/**.

The Overview reads the monthly snapshots. Its filters are Month, Store group, and vs SPLY / vs SPLM.

GitHub Pages must be set to **Settings → Pages → Source: GitHub Actions**. With "Deploy from a branch", GitHub also publishes this README to the same address and can overwrite the dashboard.

## Local development

```bash
python scripts/extract.py        # Business Performance Report -> data/months, data/report.json
python scripts/extract_daily.py  # Day wise Sales GP Trend -> data/daily.json
npm install
npm run dev                 # http://localhost:3000
npm run build               # static export in out/
```

The extractor reads the sheets `SPLY`, `SPLM`, `SPLY -CAT HEAD WISE`, `SPLM-CAT HEAD WISE`,
`Outlet Target - OPS`, `Outlet(SPLY)`, `Outlet(SPLM)` and `CAT 3 Responsible Person Wise`.
If any of those sheets is renamed, update `scripts/extract.py`.
