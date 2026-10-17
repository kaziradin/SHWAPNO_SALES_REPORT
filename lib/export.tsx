import * as XLSX from "xlsx";

export type ExportCol = { header: string; format?: "money" | "int" | "pct" | "text" };
export type ExportCell = string | number | null;

const NUMBER_FORMATS: Record<string, string> = { money: "#,##0", int: "#,##0", pct: "0.00%" };

/** Downloads a table as an Excel (.xlsx) file. Numbers stay numeric; each column carries its own format. */
export function downloadExcel(filename: string, sheet: string, cols: ExportCol[], rows: ExportCell[][]) {
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.header), ...rows]);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = 1; r <= range.e.r; r++) {
    cols.forEach((c, ci) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if (cell && typeof cell.v === "number" && c.format && NUMBER_FORMATS[c.format]) cell.z = NUMBER_FORMATS[c.format];
    });
  }
  ws["!cols"] = cols.map((c, ci) => {
    const longest = Math.max(c.header.length, ...rows.slice(0, 300).map((r) => String(r[ci] ?? "").length));
    return { wch: Math.min(60, Math.max(12, longest + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, filename);
}

/** Small button shown above or beside a table. */
export function ExportButton({ onClick, label = "Download Excel" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="exportbtn" onClick={onClick}>{label}</button>
  );
}
