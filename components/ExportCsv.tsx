"use client";

import type { RefObject } from "react";
import { downloadCsv, tableToCsv, tableToCsvSplit } from "@/lib/csv";

/** An Export CSV link for a table: it saves the table as it shows on screen. With `split`, each value and its change
 *  (GR%) are separate columns, for analysis in Excel. */
export default function ExportCsv({ tableRef, filename, split = false, measure = "" }: { tableRef: RefObject<HTMLTableElement | null>; filename: string; split?: boolean; measure?: string }) {
  return (
    <div className="csv-tools">
      <button type="button" className="linkish" onClick={() => {
        const table = tableRef.current;
        if (table) downloadCsv(filename, split ? tableToCsvSplit(table, measure) : tableToCsv(table));
      }}>Export CSV</button>
    </div>
  );
}
