/**
 * parser.ts — parse a CSV or Excel file into headers + raw string rows.
 *
 * Exports:
 *   parseFile(file: File): Promise<ParseResult>
 */

import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { ParseResult, RawRow } from '../types'

/** Parse a CSV or Excel (.xlsx/.xls) File into a flat array of string records. */
export async function parseFile(file: File): Promise<ParseResult> {
  try {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    if (ext === 'csv' || file.type === 'text/csv') {
      return parseCsv(file)
    }

    if (ext === 'xlsx' || ext === 'xls') {
      return parseExcel(file)
    }

    return { headers: [], rows: [], error: `Unsupported file type: .${ext}. Please upload a .csv or .xlsx file.` }
  } catch (err: unknown) {
    return { headers: [], rows: [], error: String(err) }
  }
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function parseCsv(file: File): Promise<ParseResult> {
  return new Promise(resolve => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      transform: (value: string) => value.trim(),
      complete(results) {
        const headers = results.meta.fields ?? []
        resolve({ headers, rows: results.data })
      },
      error(err) {
        resolve({ headers: [], rows: [], error: err.message })
      },
    })
  })
}

// ── Excel ─────────────────────────────────────────────────────────────────────

async function parseExcel(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })

  // Use the first sheet
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { headers: [], rows: [], error: 'Excel file contains no sheets.' }
  }

  const sheet = workbook.Sheets[sheetName]

  // Get raw values as array-of-arrays so we can control header extraction
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  if (raw.length === 0) {
    return { headers: [], rows: [], error: 'The sheet appears to be empty.' }
  }

  // First row = headers
  const headers = (raw[0] as unknown[]).map(h => String(h ?? '').trim()).filter(Boolean)

  const rows: RawRow[] = []
  for (let i = 1; i < raw.length; i++) {
    const rowArr = raw[i] as unknown[]
    // Skip entirely empty rows
    if (rowArr.every(cell => String(cell ?? '').trim() === '')) continue

    const row: RawRow = {}
    headers.forEach((header, idx) => {
      row[header] = String(rowArr[idx] ?? '').trim()
    })
    rows.push(row)
  }

  return { headers, rows }
}
