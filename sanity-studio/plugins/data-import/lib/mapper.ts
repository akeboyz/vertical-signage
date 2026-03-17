/**
 * mapper.ts — apply a ColumnMap to raw string rows and coerce values
 * to the correct type for each Sanity field.
 *
 * Exports:
 *   applyMapping(rows, columnMap, fields): MappedRow[]
 *   autoSuggestMapping(headers, fields): ColumnMap
 */

import type { ColumnMap, FieldDef, MappedRow, RawRow } from '../types'

// ── Main mapping function ─────────────────────────────────────────────────────

/**
 * Convert raw string rows into typed MappedRows using the user's column map.
 * Errors are not populated here — that is the validator's job.
 */
export function applyMapping(
  rows: RawRow[],
  columnMap: ColumnMap,
  fields: FieldDef[],
): MappedRow[] {
  // Build a lookup from field name → FieldDef for fast access
  const fieldByName = new Map(fields.map(f => [f.name, f]))

  return rows.map((raw, index) => {
    const data: Record<string, unknown> = {}

    for (const [column, fieldName] of Object.entries(columnMap)) {
      // null means skip this column
      if (!fieldName) continue

      const rawValue = (raw[column] ?? '').trim()
      const field = fieldByName.get(fieldName)
      if (!field) continue

      // Skip empty strings for optional fields — leave undefined so they aren't
      // written to Sanity (avoids overwriting existing values with empty strings)
      if (rawValue === '') {
        data[fieldName] = undefined
        continue
      }

      data[fieldName] = coerce(rawValue, field)
    }

    return { _rowIndex: index, data, errors: [] }
  })
}

// ── Type coercion ─────────────────────────────────────────────────────────────

function coerce(value: string, field: FieldDef): unknown {
  switch (field.type) {
    case 'number': {
      // Strip common formatting (commas, % sign, currency symbols)
      const cleaned = value.replace(/[,%฿$]/g, '').trim()
      const n = parseFloat(cleaned)
      return isNaN(n) ? value : n   // keep raw string if unparseable — validator will catch it
    }

    case 'date': {
      // Accept YYYY-MM-DD directly
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

      // Accept DD/MM/YYYY (common Thai/EU format)
      const dmyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
      if (dmyMatch) {
        const [, d, m, y] = dmyMatch
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      }

      // Accept Excel serial date numbers
      const serial = parseFloat(value)
      if (!isNaN(serial) && serial > 1000 && serial < 100000) {
        return excelSerialToIso(serial)
      }

      return value  // keep raw — validator will flag invalid dates
    }

    case 'url': {
      // Prefix protocol if missing
      if (value && !/^https?:\/\//i.test(value)) {
        return `https://${value}`
      }
      return value
    }

    case 'string':
    case 'text':
    default:
      return value
  }
}

/** Convert an Excel date serial number to a YYYY-MM-DD string. */
function excelSerialToIso(serial: number): string {
  // Excel epoch: Dec 30, 1899 (with the famous Lotus 1-2-3 leap-year bug)
  const epoch = new Date(Date.UTC(1899, 11, 30))
  const ms = epoch.getTime() + serial * 86400000
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Auto-suggest mapping ──────────────────────────────────────────────────────

/**
 * Attempt to auto-map column headers to field names by normalizing both
 * to lowercase with spaces/underscores stripped.
 *
 * Returns a ColumnMap with high-confidence pre-fills.
 * The user can override any suggestion in the UI.
 */
export function autoSuggestMapping(headers: string[], fields: FieldDef[]): ColumnMap {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[\s_\-().\/]/g, '')

  const fieldByNorm = new Map(fields.map(f => [normalize(f.name), f.name]))
  const fieldByLabel = new Map(fields.map(f => [normalize(f.label), f.name]))

  const map: ColumnMap = {}
  for (const header of headers) {
    const norm = normalize(header)
    // Try exact name match first, then label match
    map[header] = fieldByNorm.get(norm) ?? fieldByLabel.get(norm) ?? null
  }
  return map
}
