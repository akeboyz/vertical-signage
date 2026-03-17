/**
 * types.ts — shared TypeScript interfaces for the Data Import plugin.
 * All other modules import from here.
 */

export type SchemaTarget = 'projectSite' | 'contract'

export type FieldType = 'string' | 'text' | 'number' | 'date' | 'url'

export interface FieldDef {
  name: string               // Sanity field name, e.g. 'projectName'
  label: string              // Human-readable label, e.g. 'Project Name'
  type: FieldType
  required: boolean
  isIdentifier: boolean      // true for the upsert key field
  isRelationshipKey?: boolean // true for synthetic fields used only for lookup (contract → projectSite)
}

/** Raw row straight from the file parser — all values are strings */
export type RawRow = Record<string, string>

export interface RowError {
  field: string
  message: string
}

export interface MappedRow {
  _rowIndex: number
  data: Record<string, unknown>   // field name → coerced typed value
  errors: RowError[]
}

/**
 * Maps each CSV/Excel column header to a Sanity field name.
 * null means "skip this column".
 */
export type ColumnMap = Record<string, string | null>

export interface ParseResult {
  headers: string[]
  rows: RawRow[]
  error?: string
}

export type ImportStatus = 'created' | 'updated' | 'skipped' | 'error' | 'dry-run'

export interface ImportResult {
  rowIndex: number
  identifier: string
  status: ImportStatus
  error?: string
}

export interface ImportSummary {
  total: number
  created: number
  updated: number
  failed: number
  dryRun: boolean
  results: ImportResult[]
}
