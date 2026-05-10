#!/usr/bin/env node
/**
 * Match xlsx cash rows to Sanity SC payments (subset-sum within date window)
 * and write the matched paymentNumber(s) into a new "Payment Ref" column.
 *
 * Output: account_matched.xlsx (original account.xlsx preserved untouched).
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
const SRC  = `${ACCT}/account.xlsx`
const DST  = `${ACCT}/account_matched.xlsx`

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
  paymentNumber: string
  paymentDate: string
  paidAmount: number
  vatAmount: number | null
  scName: string | null
}

function payTotal(p: SanityPayment): number {
  const gross = Number(p.paidAmount ?? 0)
  const vat   = Number(p.vatAmount ?? 0)
  return Math.round((gross + vat) * 100) / 100
}

const TOL = 0.01  // tolerance in baht for subset sum

/** Find a subset of `pool` whose totals (paid+vat) sum to `target` ± TOL.
 *  Returns the subset, or null if none found. Prefers smallest subset.
 */
function findSubset(target: number, pool: SanityPayment[]): SanityPayment[] | null {
  // Try increasing subset size
  for (let size = 1; size <= pool.length; size++) {
    const result = pickSubset(target, pool, size, 0, [])
    if (result) return result
  }
  return null
}

function pickSubset(target: number, pool: SanityPayment[], size: number, startIdx: number, picked: SanityPayment[]): SanityPayment[] | null {
  if (size === 0) {
    return Math.abs(target) < TOL ? picked.slice() : null
  }
  for (let i = startIdx; i <= pool.length - size; i++) {
    const p = pool[i]
    const t = payTotal(p)
    if (t > target + TOL) continue   // overshoot — skip (assumes positive amounts)
    picked.push(p)
    const r = pickSubset(target - t, pool, size - 1, i + 1, picked)
    if (r) return r
    picked.pop()
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

  // 1. Read xlsx
  console.log(`Reading ${SRC}…`)
  const wb = XLSX.readFile(SRC, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  console.log(`Sheet "${sheetName}" range: ${ws['!ref']}  rows=${range.e.r + 1}`)

  // 2. Read all rows as array (header at row 0)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]
  const NUM_DATA_ROWS = aoa.length

  // 3. Parse outflow rows with date+amount
  interface XRow { rowIndex: number; date: string; amount: number; vendor: string; category: string }
  const outflow: XRow[] = []
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const date = parseDate(r[0])
    const amt  = parseAmount(r[1])
    if (date == null || amt == null) continue
    if (amt >= 0) continue  // outflow only
    outflow.push({
      rowIndex: i,
      date,
      amount: -amt,                          // make positive
      vendor:   String(r[2] ?? ''),
      category: String(r[3] ?? ''),
    })
  }
  console.log(`xlsx outflow rows with dates: ${outflow.length}`)

  // 4. Query Sanity SC payments
  const payments = await client.fetch<SanityPayment[]>(
    `*[_type=="payment" && !(_id in path("drafts.**")) && paymentMode=="service_contract_payment"]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount,
      "scName": linkedServiceContract->serviceName
    }`,
  )
  console.log(`Sanity SC payments: ${payments.length}`)

  // 5. Match. Subset-sum within ±5 days of xlsx date. Prevent double-claiming.
  const claimed = new Set<string>()
  const matchByXlsxRow: Record<number, SanityPayment[]> = {}
  const TOL_DAYS = 5
  const dayMs = 86400 * 1000
  const dayDiff = (a: string, b: string) => Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / dayMs)

  for (const x of outflow) {
    const pool = payments.filter(p => !claimed.has(p._id) && dayDiff(p.paymentDate, x.date) <= TOL_DAYS)
    if (pool.length === 0) continue

    const subset = findSubset(x.amount, pool)
    if (!subset) continue
    matchByXlsxRow[x.rowIndex] = subset
    for (const p of subset) claimed.add(p._id)
  }

  // 6. Mutate the existing sheet to add a "Payment Ref" column at the right of existing data
  const newCol = range.e.c + 1   // first empty column
  const newColLetter = XLSX.utils.encode_col(newCol)
  console.log(`Adding "Payment Ref" column at ${newColLetter} (col index ${newCol})`)

  // Header
  ws[XLSX.utils.encode_cell({ r: 0, c: newCol })] = { t: 's', v: 'Payment Ref' }

  // Per-row values
  let written = 0
  for (let i = 1; i < NUM_DATA_ROWS; i++) {
    const subset = matchByXlsxRow[i]
    if (!subset || subset.length === 0) continue
    const refStr = subset.map(p => p.paymentNumber).join(', ')
    ws[XLSX.utils.encode_cell({ r: i, c: newCol })] = { t: 's', v: refStr }
    written++
  }

  // Extend sheet range
  const newRange = { s: range.s, e: { r: range.e.r, c: newCol } }
  ws['!ref'] = XLSX.utils.encode_range(newRange)

  // 7. Save
  XLSX.writeFile(wb, DST)
  console.log(`✓ Wrote ${DST}  (${written} rows annotated)`)

  // 8. Summary
  const matchedSanity = claimed.size
  const unmatchedSanity = payments.length - matchedSanity
  const matchedXlsxRows = Object.keys(matchByXlsxRow).length
  console.log(`\n=== Summary ===`)
  console.log(`  xlsx rows annotated   : ${matchedXlsxRows}`)
  console.log(`  Sanity payments used  : ${matchedSanity} / ${payments.length}`)
  console.log(`  Sanity payments left  : ${unmatchedSanity}`)
  if (unmatchedSanity > 0) {
    console.log(`\nUnmatched Sanity payments:`)
    for (const p of payments) {
      if (!claimed.has(p._id)) {
        console.log(`  ${p.paymentNumber}  ${p.paymentDate}  ${p.scName}  total=${payTotal(p).toFixed(2)}  id=${p._id}`)
      }
    }
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
