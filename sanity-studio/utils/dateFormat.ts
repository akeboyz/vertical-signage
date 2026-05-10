/**
 * Display-only date formatter. Storage stays ISO (YYYY-MM-DD).
 * Convert YYYY-MM-DD → DD-MM-YYYY for all user-facing text.
 */
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  if (!y || !m || !d) return dateStr
  return `${d}-${m}-${y}`
}
