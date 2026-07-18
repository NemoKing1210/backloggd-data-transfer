/**
 * Minimal RFC4180-style CSV parser (comma, quotes, CRLF).
 * @param {string} text
 * @returns {{ headers: string[], rows: Record<string, string>[], rowCount: number }}
 */
export function parseCsv(text) {
  const raw = String(text || '').replace(/^\uFEFF/, '');
  const records = parseCsvRecords(raw);
  if (!records.length) {
    return { headers: [], rows: [], rowCount: 0 };
  }

  const headers = records[0].map((h) => String(h || '').trim());
  const rows = [];

  for (let i = 1; i < records.length; i += 1) {
    const cells = records[i];
    if (!cells.length || cells.every((c) => String(c || '').trim() === '')) {
      continue;
    }
    /** @type {Record<string, string>} */
    const row = {};
    for (let c = 0; c < headers.length; c += 1) {
      const key = headers[c] || `column_${c + 1}`;
      row[key] = cells[c] == null ? '' : String(cells[c]);
    }
    rows.push(row);
  }

  return { headers, rows, rowCount: rows.length };
}

/**
 * @param {string} text
 * @returns {string[][]}
 */
function parseCsvRecords(text) {
  /** @type {string[][]} */
  const records = [];
  /** @type {string[]} */
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }

    if (ch === '\n') {
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
      continue;
    }

    if (ch === '\r') {
      if (next === '\n') continue;
      row.push(cell);
      records.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell.length || row.length) {
    row.push(cell);
    records.push(row);
  }

  return records;
}
