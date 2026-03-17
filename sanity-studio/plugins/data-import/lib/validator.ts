/**
 * validator.ts — validate mapped rows and attach RowErrors.
 *
 * Exports:
 *   validateRows(rows, fields): MappedRow[]   (returns new array, no mutation)
 */

import type { FieldDef, MappedRow, RowError } from '../types'

export function validateRows(rows: MappedRow[], fields: FieldDef[]): MappedRow[] {
  // Detect duplicate identifiers within the batch
  const identifierField = fields.find(f => f.isIdentifier)
  const identifierCounts = new Map<string, number>()
  if (identifierField) {
    for (const row of rows) {
      const val = String(row.data[identifierField.name] ?? '')
      if (val) identifierCounts.set(val, (identifierCounts.get(val) ?? 0) + 1)
    }
  }

  return rows.map(row => {
    const errors: RowError[] = []

    for (const field of fields) {
      // Skip synthetic relationship-key fields from content validation
      if (field.isRelationshipKey) continue

      const value = row.data[field.name]
      const isEmpty = value === undefined || value === null || String(value).trim() === ''

      // Required field check
      if (field.required && isEmpty) {
        errors.push({ field: field.name, message: `${field.label} is required` })
        continue
      }

      if (isEmpty) continue  // optional and empty — fine

      // Type-specific checks
      if (field.type === 'number') {
        const n = Number(value)
        if (isNaN(n)) {
          errors.push({ field: field.name, message: `${field.label}: "${value}" is not a valid number` })
        }
      }

      if (field.type === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
          errors.push({ field: field.name, message: `${field.label}: "${value}" is not a valid date (expected YYYY-MM-DD)` })
        }
      }

      if (field.type === 'url') {
        try {
          new URL(String(value))
        } catch {
          errors.push({ field: field.name, message: `${field.label}: "${value}" is not a valid URL` })
        }
      }
    }

    // Warn about duplicate identifiers
    if (identifierField) {
      const val = String(row.data[identifierField.name] ?? '')
      if (val && (identifierCounts.get(val) ?? 0) > 1) {
        errors.push({
          field: identifierField.name,
          message: `Duplicate identifier "${val}" in this file — last row wins`,
        })
      }
    }

    return { ...row, errors }
  })
}
