#!/usr/bin/env node
/**
 * Insert 2 new bank statement entries (22-Apr-26) into the xlsx and re-run
 * the full matching pass. Writes account_v3.xlsx.
 *
 *   Account 1 (4222730983): 22-Apr-26 -533.93 → AWN, X4225, balance 316.94
 *   Account 2 (2198618716): 22-Apr-26 -1,123.47 → ศักดิ์ชัย, X6895, balance 290,884.92
 */

import * as XLSX from 'xlsx'
import { createClient } from '@sanity/client'
import * as fs from 'fs'
import * as path from 'path'

function loadEnvFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = value
    }
  } catch {}
}

loadEnvFile(path.resolve(__dirname, '..', '.env.local'))
loadEnvFile(path.resolve(process.cwd(), '.env.local'))

const ACCT = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const SRC  = `${ACCT}/account_v2.xlsx`     // updated source — preserves any user edits
const DST  = `${ACCT}/account_v3.xlsx`

function parseAmount(s: string | null): number | null {
  if (!s) return null
  const trimmed = String(s).trim()
  const isNeg = trimmed.startsWith('(') && trimmed.endsWith(')')
  const stripped = trimmed.replace(/[(),\s]/g, '')
  const n = parseFloat(stripped)
  if (isNaN(n)) return null
  return isNeg ? -n : n
}

function parseDate(s: string | null): string | null {
  if (!s) return null
  const m = String(s).match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const months: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }
  const mon = months[m[2].toLowerCase()]
  if (!mon) return null
  let yr = parseInt(m[3], 10)
  if (yr < 100) yr += yr < 50 ? 2000 : 1900
  return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface SanityPayment {
  _id: string
  paymentNumber: string | null
  paymentDate: string | null
  paidAmount: number | null
  vatAmount: number | null
  paymentMode: string | null
  vendorName: string | null
  scName: string | null
}

function payTotal(p: SanityPayment): number {
  const gross = Number(p.paidAmount ?? 0)
  const vat   = Number(p.vatAmount ?? 0)
  return Math.round((gross + vat) * 100) / 100
}

const TOL = 0.01

function pickSubset(target: number, pool: SanityPayment[], size: number, startIdx: number, picked: SanityPayment[]): SanityPayment[] | null {
  if (size === 0) return Math.abs(target) < TOL ? picked.slice() : null
  for (let i = startIdx; i <= pool.length - size; i++) {
    const t = payTotal(pool[i])
    if (t > target + TOL) continue
    picked.push(pool[i])
    const r = pickSubset(target - t, pool, size - 1, i + 1, picked)
    if (r) return r
    picked.pop()
  }
  return null
}

function findSubset(target: number, pool: SanityPayment[]): SanityPayment[] | null {
  for (let size = 1; size <= Math.min(pool.length, 6); size++) {
    const r = pickSubset(target, pool, size, 0, [])
    if (r) return r
  }
  return null
}

async function main() {
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) { console.error('NO TOKEN'); process.exit(1) }

  const client = createClient({
    projectId: 'awjj9g8u',
    dataset: 'production',
    apiVersion: '2024-01-01',
    token,
    useCdn: false,
  })

  // ── 1. Read xlsx + parse rows ────────────────────────────────────────────
  console.log(`Reading ${SRC}…`)
  const wb = XLSX.readFile(SRC, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const aoaRaw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  // Drop existing 'Payment Ref' column if present (we'll re-add fresh after re-matching)
  const headerRow: any[] = aoaRaw[0] ?? []
  const lastColIdx = headerRow.length - 1
  const hasPaymentRefCol = String(headerRow[lastColIdx] ?? '').trim().toLowerCase() === 'payment ref'
  const aoa: any[][] = hasPaymentRefCol
    ? aoaRaw.map(r => r ? r.slice(0, lastColIdx) : r)
    : aoaRaw
  console.log(`  rows: ${aoa.length}  (existing 'Payment Ref' column ${hasPaymentRefCol ? 'detected — dropped, will re-add' : 'absent'})`)

  // ── 2. Locate Account 2 header + each account's last data row ───────────
  let acct2HeaderIdx = -1
  for (let i = 0; i < aoa.length; i++) {
    if (String(aoa[i]?.[0] ?? '').replace(/\s/g, '') === '2198618716') { acct2HeaderIdx = i; break }
  }
  if (acct2HeaderIdx < 0) { console.error(`✗ ABORT — Account 2 header not found`); process.exit(1) }

  let acct1LastIdx = acct2HeaderIdx - 1
  while (acct1LastIdx > 0 && (!aoa[acct1LastIdx] || aoa[acct1LastIdx].every((c: any) => c == null))) {
    acct1LastIdx--
  }
  let acct2LastIdx = aoa.length - 1
  while (acct2LastIdx > acct2HeaderIdx && (!aoa[acct2LastIdx] || aoa[acct2LastIdx].every((c: any) => c == null))) {
    acct2LastIdx--
  }
  console.log(`  Account 1 header at row 1 (0-based), last entry at row ${acct1LastIdx}`)
  console.log(`  Account 2 header at row ${acct2HeaderIdx}, last entry at row ${acct2LastIdx}`)
  console.log(`  Account 1 last entry: ${JSON.stringify(aoa[acct1LastIdx])}`)
  console.log(`  Account 2 last entry: ${JSON.stringify(aoa[acct2LastIdx])}`)

  // ── 3. New rows from bank statements (22-Apr-26) ────────────────────────
  // Format matches existing data style (leading/trailing spaces, parens for outflow, commas for thousands)
  const newAcct1: any[] = ['22-Apr-26', ' (533.93)',   'advance wireless network', 'internet', 'X4225', ' 316.94 ', '/']
  const newAcct2: any[] = ['22-Apr-26', ' (1,123.47)', 'ศักดิ์ชัย สุทธ',           null,        'X6895', ' 290,884.92 ', '/']

  // Insert in reverse order to preserve indices for the earlier insertion
  const newAoa = [...aoa]
  newAoa.splice(acct2LastIdx + 1, 0, newAcct2)
  newAoa.splice(acct1LastIdx + 1, 0, newAcct1)
  console.log(`  After insertion: ${newAoa.length} rows (was ${aoa.length})`)

  // ── 4. Parse outflow rows from new aoa ──────────────────────────────────
  interface XRow { rowIndex: number; date: string; amount: number; vendor: string }
  const outflow: XRow[] = []
  for (let i = 1; i < newAoa.length; i++) {
    const r = newAoa[i]
    if (!r) continue
    const date = parseDate(r[0])
    const amt  = parseAmount(r[1])
    if (date == null || amt == null || amt >= 0) continue
    outflow.push({ rowIndex: i, date, amount: -amt, vendor: String(r[2] ?? '') })
  }
  console.log(`  outflow rows: ${outflow.length}`)

  // ── 5. Query Sanity ──────────────────────────────────────────────────────
  const payments = await client.fetch<SanityPayment[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, paymentMode,
      "vendorName": coalesce(vendor->shortName, vendor->legalName_en, "?"),
      "scName": linkedServiceContract->serviceName
    }`,
  )
  const dated   = payments.filter(p => p.paymentDate)
  const undated = payments.filter(p => !p.paymentDate)
  console.log(`  Sanity payments: ${payments.length} (dated ${dated.length}, undated ${undated.length})`)

  // ── 6. Match (Pass A subset-sum, Pass B 1:1 undated) ────────────────────
  const TOL_DAYS = 5
  const dayMs = 86400 * 1000
  const dayDiff = (a: string, b: string) => Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / dayMs)
  const claimed = new Set<string>()
  const matchByXlsxRow: Record<number, SanityPayment[]> = {}

  const sortedOutflow = [...outflow].sort((a, b) => a.date.localeCompare(b.date))
  for (const x of sortedOutflow) {
    const pool = dated.filter(p => !claimed.has(p._id) && dayDiff(p.paymentDate!, x.date) <= TOL_DAYS)
    if (pool.length === 0) continue
    const subset = findSubset(x.amount, pool)
    if (!subset) continue
    matchByXlsxRow[x.rowIndex] = subset
    for (const p of subset) claimed.add(p._id)
  }
  const passA = claimed.size
  for (const x of sortedOutflow) {
    if (matchByXlsxRow[x.rowIndex]) continue
    for (const p of undated) {
      if (claimed.has(p._id)) continue
      if (Math.abs(payTotal(p) - x.amount) < TOL) {
        matchByXlsxRow[x.rowIndex] = [p]
        claimed.add(p._id)
        break
      }
    }
  }
  const passB = claimed.size - passA
  console.log(`  Pass A matched: ${passA}, Pass B matched: ${passB}, total: ${claimed.size}/${payments.length}`)

  // ── 7. Build new sheet (header + rows + Payment Ref column) ──────────────
  const NEW_HEADER_COL = 'Payment Ref'
  const finalAoa: any[][] = []
  for (let i = 0; i < newAoa.length; i++) {
    const row = (newAoa[i] ?? []).slice()
    if (i === 0) {
      row.push(NEW_HEADER_COL)
    } else {
      const subset = matchByXlsxRow[i]
      if (subset && subset.length > 0) {
        row.push(subset.map(p => p.paymentNumber ?? `(no# ${p._id.slice(0, 6)})`).join(', '))
      } else {
        row.push(null)
      }
    }
    finalAoa.push(row)
  }

  const newWs = XLSX.utils.aoa_to_sheet(finalAoa)
  wb.Sheets[sheetName] = newWs
  XLSX.writeFile(wb, DST)
  console.log(`✓ Wrote ${DST}`)

  // ── 8. Diagnostic JSON ───────────────────────────────────────────────────
  const unmatchedSanity = payments.filter(p => !claimed.has(p._id))
  const unmatchedXlsx = outflow.filter(x => !matchByXlsxRow[x.rowIndex])
  const report = {
    summary: {
      xlsxOutflowRows: outflow.length,
      sanityPaymentsTotal: payments.length,
      sanityMatched: claimed.size,
      sanityUnmatched: unmatchedSanity.length,
      xlsxUnmatched: unmatchedXlsx.length,
      newRowsInserted: 2,
      newRowsMatched: [matchByXlsxRow[acct1LastIdx + 1], matchByXlsxRow[acct2LastIdx + 2]]
        .map(s => s ? s.map(p => p.paymentNumber).join(', ') : null),
    },
    unmatchedSanityPayments: unmatchedSanity.map(p => ({
      paymentNumber: p.paymentNumber, paymentDate: p.paymentDate, total: payTotal(p),
      paymentMode: p.paymentMode, vendorName: p.vendorName, scName: p.scName, _id: p._id,
    })),
    unmatchedXlsxRows: unmatchedXlsx.map(x => ({
      rowIndex: x.rowIndex, date: x.date, vendor: x.vendor, amount: x.amount,
    })),
  }
  fs.writeFileSync(`${ACCT}/match_report_v3.json`, JSON.stringify(report, null, 2), 'utf8')
  console.log(`✓ Wrote match_report_v3.json`)

  console.log(`\nSummary:`)
  console.log(`  outflow rows         : ${outflow.length}`)
  console.log(`  sanity matched       : ${claimed.size} / ${payments.length}`)
  console.log(`  sanity unmatched     : ${unmatchedSanity.length}`)
  console.log(`  new rows inserted    : 2`)
  console.log(`  new rows matched     : Acct1 ${report.summary.newRowsMatched[0] ?? '(none)'},  Acct2 ${report.summary.newRowsMatched[1] ?? '(none)'}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
