#!/usr/bin/env node
/**
 * Match xlsx outflow rows to ANY Sanity payment (all modes), via subset-sum
 * within a date window. Annotates "Payment Ref" column in account_matched.xlsx.
 *
 * Two-pass:
 *   Pass A: dated Sanity payments, subset-sum within ±5 days
 *   Pass B: undated Sanity payments, exact 1:1 amount match (no subset)
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
const DST  = `${ACCT}/account_v2.xlsx`

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

  // 1. Read xlsx
  console.log(`Reading ${SRC}…`)
  const wb = XLSX.readFile(SRC, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)

  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  // 2. Parse outflow rows
  interface XRow { rowIndex: number; date: string; amount: number; vendor: string }
  const outflow: XRow[] = []
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const date = parseDate(r[0])
    const amt  = parseAmount(r[1])
    if (date == null || amt == null || amt >= 0) continue
    outflow.push({ rowIndex: i, date, amount: -amt, vendor: String(r[2] ?? '') })
  }
  console.log(`xlsx outflow rows: ${outflow.length}`)

  // 3. Query ALL Sanity payments (any mode)
  const payments = await client.fetch<SanityPayment[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, paymentMode,
      "vendorName": coalesce(vendor->shortName, vendor->legalName_en, "?"),
      "scName": linkedServiceContract->serviceName
    }`,
  )
  console.log(`Sanity payments (all modes): ${payments.length}`)

  const dated   = payments.filter(p => p.paymentDate)
  const undated = payments.filter(p => !p.paymentDate)
  console.log(`  dated: ${dated.length}   undated: ${undated.length}`)

  // 4. Pass A — subset-sum on dated payments within ±5 days
  const TOL_DAYS = 5
  const dayMs = 86400 * 1000
  const dayDiff = (a: string, b: string) => Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / dayMs)

  const claimed = new Set<string>()
  const matchByXlsxRow: Record<number, SanityPayment[]> = {}

  // Sort outflow by date so we match earliest first (more deterministic)
  const sortedOutflow = [...outflow].sort((a, b) => a.date.localeCompare(b.date))

  for (const x of sortedOutflow) {
    const pool = dated.filter(p => !claimed.has(p._id) && dayDiff(p.paymentDate!, x.date) <= TOL_DAYS)
    if (pool.length === 0) continue
    const subset = findSubset(x.amount, pool)
    if (!subset) continue
    matchByXlsxRow[x.rowIndex] = subset
    for (const p of subset) claimed.add(p._id)
  }

  const passADated = claimed.size
  console.log(`Pass A — matched dated: ${passADated}`)

  // 5. Pass B — exact 1:1 amount match for undated payments
  for (const x of sortedOutflow) {
    if (matchByXlsxRow[x.rowIndex]) continue   // already matched
    for (const p of undated) {
      if (claimed.has(p._id)) continue
      if (Math.abs(payTotal(p) - x.amount) < TOL) {
        matchByXlsxRow[x.rowIndex] = [p]
        claimed.add(p._id)
        break
      }
    }
  }
  const passBUndated = claimed.size - passADated
  console.log(`Pass B — matched undated: ${passBUndated}`)

  // 6. Write Payment Ref column at H
  const newCol = 7
  ws[XLSX.utils.encode_cell({ r: 0, c: newCol })] = { t: 's', v: 'Payment Ref' }

  let written = 0
  for (let i = 1; i < aoa.length; i++) {
    const subset = matchByXlsxRow[i]
    if (!subset || subset.length === 0) continue
    const refStr = subset.map(p => p.paymentNumber ?? `(no# ${p._id.slice(0, 6)})`).join(', ')
    ws[XLSX.utils.encode_cell({ r: i, c: newCol })] = { t: 's', v: refStr }
    written++
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: newCol } })

  XLSX.writeFile(wb, DST)
  console.log(`Wrote ${DST}  (${written} rows annotated)`)

  // 7. Build diagnostic report (write to JSON to avoid Thai/console encoding issues)
  const unmatchedSanity = payments.filter(p => !claimed.has(p._id)).map(p => ({
    paymentNumber: p.paymentNumber,
    paymentDate:   p.paymentDate,
    vendorName:    p.vendorName,
    paymentMode:   p.paymentMode,
    total:         payTotal(p),
    scName:        p.scName,
    _id:           p._id,
  }))
  const unmatchedXlsx = outflow.filter(x => !matchByXlsxRow[x.rowIndex]).map(x => ({
    rowIndex: x.rowIndex,
    date:     x.date,
    vendor:   x.vendor,
    amount:   x.amount,
  }))
  const matched = Object.entries(matchByXlsxRow).map(([row, subset]) => ({
    rowIndex: Number(row),
    paymentNumbers: subset.map(p => p.paymentNumber ?? `(no# ${p._id.slice(0, 6)})`),
    paymentIds:     subset.map(p => p._id),
  }))

  const report = {
    summary: {
      xlsxOutflowRows: outflow.length,
      sanityPaymentsTotal: payments.length,
      sanityDated: dated.length,
      sanityUndated: undated.length,
      passADated: passADated,
      passBUndated: passBUndated,
      xlsxRowsAnnotated: written,
      sanityMatched: claimed.size,
      sanityUnmatchedCount: unmatchedSanity.length,
    },
    unmatchedSanityPayments: unmatchedSanity,
    unmatchedXlsxRows: unmatchedXlsx,
    matched,
  }
  const REPORT_FILE = `${ACCT}/match_report.json`
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), 'utf8')
  console.log(`Wrote diagnostic report: ${REPORT_FILE}`)

  // 8. Plain ASCII summary to stdout
  console.log(`Summary:`)
  console.log(`  xlsx outflow rows  : ${outflow.length}`)
  console.log(`  xlsx annotated     : ${written}`)
  console.log(`  sanity matched     : ${claimed.size} / ${payments.length}`)
  console.log(`  sanity unmatched   : ${unmatchedSanity.length}`)
  console.log(`See match_report.json for details`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
