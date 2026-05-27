import { SLOTS, STATUSES } from "@/lib/dashboard-config";

async function loadPdfJs() {
  const pdfjsLib: any = await import("pdfjs-dist");
  // @ts-ignore - Vite worker URL
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
  return pdfjsLib;
}

export type ParsedEntry = {
  entry_date: string;
  person: string;
  location: string | null;
  slot_10: string | null;
  slot_11: string | null;
  slot_14: string | null;
};

type Item = { str: string; x: number; y: number };
type Cell = { x: number; text: string };

function groupRows(items: Item[], yTol = 4): Item[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= yTol) last.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

function mergeCells(row: Item[], gap = 6): Cell[] {
  if (row.length === 0) return [];
  const out: Cell[] = [{ x: row[0].x, text: row[0].str }];
  for (let i = 1; i < row.length; i++) {
    const prev = out[out.length - 1];
    const cur = row[i];
    if (cur.x - (prev.x + prev.text.length * 3) < gap) {
      prev.text += " " + cur.str;
    } else {
      out.push({ x: cur.x, text: cur.str });
    }
  }
  return out.map((c) => ({ x: c.x, text: c.text.trim() }));
}

function parseTitle(rows: Cell[][]): { year: number; month: number } | null {
  for (const r of rows.slice(0, 5)) {
    const joined = r.map((c) => c.text).join(" ");
    const m = joined.match(/([A-Za-z]+)\s+(\d{4})/);
    if (m) {
      const monthIdx = new Date(`${m[1]} 1, 2000`).getMonth();
      if (!isNaN(monthIdx)) return { year: parseInt(m[2], 10), month: monthIdx };
    }
  }
  return null;
}

export async function parseMonitoringPdf(file: File, persons: string[]): Promise<ParsedEntry[]> {
  const pdfjsLib = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const allRows: Cell[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items: Item[] = tc.items
      .filter((it: any) => typeof it.str === "string" && it.str.trim().length > 0)
      .map((it: any) => ({ str: it.str, x: it.transform[4], y: it.transform[5] }));
    const rows = groupRows(items).map((r) => mergeCells(r));
    allRows.push(...rows);
  }

  const title = parseTitle(allRows);
  if (!title) throw new Error("PDF থেকে month/year পাওয়া যায়নি");
  const { year, month } = title;

  // Find row that includes known person names (header row 1)
  let personRow: Cell[] | null = null;
  for (const r of allRows) {
    const texts = r.map((c) => c.text);
    const matched = persons.filter((p) => texts.includes(p));
    if (matched.length >= Math.min(2, persons.length)) {
      personRow = r;
      break;
    }
  }
  if (!personRow) throw new Error("Person header row পাওয়া যায়নি");

  const personPositions = persons
    .map((p) => {
      const cell = personRow!.find((c) => c.text === p);
      return cell ? { name: p, x: cell.x } : null;
    })
    .filter((v): v is { name: string; x: number } => !!v)
    .sort((a, b) => a.x - b.x);

  if (personPositions.length === 0) throw new Error("Person column পাওয়া যায়নি");

  // Sub-header row with Location + slot labels
  const slotLabels: string[] = SLOTS.map((s) => s.label);
  let subHeader: Cell[] | null = null;
  for (const r of allRows) {
    const texts = r.map((c) => c.text);
    if (texts.includes("Location") && slotLabels.every((l) => texts.includes(l))) {
      subHeader = r;
      break;
    }
  }

  type PersonCols = {
    name: string;
    cols: { key: "location" | "slot_10" | "slot_11" | "slot_14"; x: number }[];
  };
  const personCols: PersonCols[] = [];

  if (subHeader) {
    const subCells = subHeader.filter(
      (c) => c.text === "Location" || slotLabels.includes(c.text),
    );
    for (let i = 0; i < personPositions.length; i++) {
      const chunk = subCells.slice(i * 4, i * 4 + 4);
      if (chunk.length !== 4) break;
      personCols.push({
        name: personPositions[i].name,
        cols: [
          { key: "location", x: chunk[0].x },
          { key: "slot_10", x: chunk[1].x },
          { key: "slot_11", x: chunk[2].x },
          { key: "slot_14", x: chunk[3].x },
        ],
      });
    }
  } else {
    for (let i = 0; i < personPositions.length; i++) {
      const startX = personPositions[i].x;
      const endX = personPositions[i + 1]?.x ?? startX + 200;
      const step = (endX - startX) / 4;
      personCols.push({
        name: personPositions[i].name,
        cols: [
          { key: "location", x: startX + step * 0.5 },
          { key: "slot_10", x: startX + step * 1.5 },
          { key: "slot_11", x: startX + step * 2.5 },
          { key: "slot_14", x: startX + step * 3.5 },
        ],
      });
    }
  }

  const statusSet = new Set<string>(STATUSES);
  const dateRe = /^(\d{1,2})\s+([A-Za-z]{3})$/;
  const results: ParsedEntry[] = [];

  for (const row of allRows) {
    if (row.length === 0) continue;
    const first = row[0];
    const m = first.text.match(dateRe);
    if (!m) continue;
    const day = parseInt(m[1], 10);
    if (isNaN(day) || day < 1 || day > 31) continue;
    const entry_date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    for (const pc of personCols) {
      const findNearest = (targetX: number): string | null => {
        let best: Cell | null = null;
        let bestDist = Infinity;
        for (const cell of row) {
          const d = Math.abs(cell.x - targetX);
          if (d < bestDist && d < 40) {
            best = cell;
            bestDist = d;
          }
        }
        return best ? best.text : null;
      };

      const locRaw = findNearest(pc.cols[0].x);
      const s10 = findNearest(pc.cols[1].x);
      const s11 = findNearest(pc.cols[2].x);
      const s14 = findNearest(pc.cols[3].x);

      const normStatus = (v: string | null) =>
        v && statusSet.has(v) ? v : null;

      // Location: exclude if it's actually a status
      const location = locRaw && !statusSet.has(locRaw) ? locRaw : null;
      const slot_10 = normStatus(s10);
      const slot_11 = normStatus(s11);
      const slot_14 = normStatus(s14);

      if (!location && !slot_10 && !slot_11 && !slot_14) continue;
      results.push({
        entry_date,
        person: pc.name,
        location,
        slot_10,
        slot_11,
        slot_14,
      });
    }
  }

  return results;
}
