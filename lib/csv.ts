/** A table as CSV text, as it shows on screen. Each row of the table is a line. A column span leaves blanks in the columns
 *  it covers, and a row span repeats its text down the rows it covers, so the columns stay in line. Numbers have no
 *  thousands separators, so they open as numbers; a dash (no value) is blank; arrows and chevrons are left out. A cell
 *  made of blocks (a value and its change) joins them with " / ". */
export function tableToCsv(table: HTMLTableElement): string {
  const cellText = (cell: HTMLTableCellElement): string => {
    const blocks = [...cell.children].filter((el) => el.tagName === "DIV");
    const raw = blocks.length ? blocks.map((b) => b.textContent ?? "").join(" / ") : (cell.textContent ?? "");
    const t = raw
      .replace(/[▲▼›]/g, "")
      .replace(/−/g, "-")
      .replace(/(\d),(?=\d{3}(?!\d))/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    return t === "–" ? "" : t;
  };
  const esc = (x: string) => (/[",\r\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);

  const out: string[][] = [];
  // the cells that a span from an earlier cell covers, by "row,column"
  const covered = new Map<string, string>();
  [...table.rows].forEach((tr, r) => {
    out[r] = out[r] ?? [];
    let c = 0;
    const fillCovered = () => {
      while (covered.has(`${r},${c}`)) {
        out[r][c] = covered.get(`${r},${c}`) ?? "";
        c++;
      }
    };
    for (const cell of [...tr.cells]) {
      fillCovered();
      const text = cellText(cell);
      const cs = cell.colSpan || 1, rs = cell.rowSpan || 1;
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          if (dr === 0 && dc === 0) out[r][c] = text;
          else if (dc === 0) covered.set(`${r + dr},${c}`, text);
          else covered.set(`${r + dr},${c + dc}`, "");
        }
      }
      c += cs;
    }
    fillCovered();
  });
  const width = Math.max(0, ...out.map((row) => row.length));
  return out.map((row) => Array.from({ length: width }, (_, i) => esc(row[i] ?? "")).join(",")).join("\r\n") + "\r\n";
}

/** Saves CSV text as a file (with a byte-order mark, so Excel reads the text as UTF-8). */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
