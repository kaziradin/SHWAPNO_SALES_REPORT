"use client";

import type { RefObject } from "react";
import { downloadCsv, tableToCsv } from "@/lib/csv";

/** An Export CSV link for a table: it saves the table as it shows on screen. */
export default function ExportCsv({ tableRef, filename }: { tableRef: RefObject<HTMLTableElement | null>; filename: string }) {
  return (
    <div className="csv-tools">
      <button type="button" className="linkish" onClick={() => {
        const table = tableRef.current;
        if (table) downloadCsv(filename, tableToCsv(table));
      }}>Export CSV</button>
    </div>
  );
}
