import fs from "node:fs";
import path from "node:path";
import Dashboard from "@/components/Dashboard";
import data from "@/data/report.json";
import type { MonthOverview, Report } from "@/lib/types";

// Read every monthly snapshot at build time; the Overview only needs the SPLY/SPLM blocks.
function loadMonths(): MonthOverview[] {
  const dir = path.join(process.cwd(), "data", "months");
  const index: { month: string }[] = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf-8"));
  return index
    .map(({ month }) => {
      const r: Report = JSON.parse(fs.readFileSync(path.join(dir, `${month}.json`), "utf-8"));
      return {
        month,
        asOf: r.asOf,
        periodLabel: r.periodLabel,
        generatedAt: r.generatedAt,
        sourceFile: r.sourceFile,
        sply: { label: r.sply.label, segments: r.sply.segments },
        splm: { label: r.splm.label, segments: r.splm.segments },
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

export default function Page() {
  return <Dashboard report={data as unknown as Report} months={loadMonths()} />;
}
