#!/usr/bin/env node
/**
 * Reverse-direction matching:
 *   1. Read account_v3.xlsx + extract existing Payment Ref values
 *   2. Pull ALL Sanity docs (payments, receipts, funding) — find ones NOT
 *      already referenced in xlsx
 *   3. For each xlsx row WITHOUT Payment Ref → try subset-sum matching against
 *      remaining Sanity docs (within ±5 days, |amount| match)
 *   4. Write any new matches to xlsx Payment Ref column (in-place)
 *   5. Report unmatched on both sides
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

const ACCT      = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const XLSX_FILE = `${ACCT}/account_v3.xlsx`

function parseAmount(s: any): number | null {
  if (s == null) return null
  const trimmed = String(s).trim()
  const isNeg = trimmed.startsWith('(') && trimmed.endsWith(')')
  const stripped = trimmed.replace(/[(),\s]/g, '')
  const n = parseFloat(stripped)
  if (isNaN(n)) return null
  return isNeg ? -n : n
}

function parseDate(s: any): string | null {
  if (s == null) return null
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

interface SanityDoc {
  _id: string
  ref: string             // PMT-XXX, RCT-XXX, FND-XXX
  type: string            // payment | receipt | funding
  date: string | null
  totalAmount: number     // gross + vat (for payments), totalAmount (receipts), amount (funding)
  direction: 'inflow' | 'outflow'
  scope: string
}

const TOL = 0.01

function pickSubset(target: number, pool: SanityDoc[], size: number, startIdx: number, picked: SanityDoc[]): SanityDoc[] | null {
  if (size === 0) return Math.abs(target) < TOL ? picked.slice() : null
  for (let i = startIdx; i <= pool.length - size; i++) {
    const t = pool[i].totalAmount
    if (t > target + TOL) continue
    picked.push(pool[i])
    const r = pickSubset(target - t, pool, size - 1, i + 1, picked)
    if (r) return r
    picked.pop()
  }
  return null
}

function findSubset(target: number, pool: SanityDoc[]): SanityDoc[] | null {
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

  // ── 1. Read xlsx + existing Payment Ref column ─────────────────────────
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  const headerRow: any[] = aoa[0] ?? []
  let paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')
  if (paymentRefCol < 0) paymentRefCol = headerRow.length
  console.log(`Payment Ref col at ${XLSX.utils.encode_col(paymentRefCol)}`)

  // Existing Payment Ref values + which Sanity refs are already in xlsx
  const existingRefStrings = new Set<string>()
  for (let i = 1; i < aoa.length; i++) {
    const v = aoa[i]?.[paymentRefCol]
    if (!v) continue
    String(v).split(',').map(s => s.trim()).filter(Boolean).forEach(r => existingRefStrings.add(r))
  }
  console.log(`Existing refs in xlsx Payment Ref column: ${existingRefStrings.size}`)

  // ── 2. Parse outflow rows + identify unmatched (no Payment Ref) ────────
  interface XRow { rowIdx: number; date: string; amount: number; vendor: string; existingRef: string | null }
  const allRows: XRow[] = []
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const date = parseDate(r[0])
    const amt  = parseAmount(r[1])
    if (date == null || amt == null) continue
    allRows.push({
      rowIdx: i,
      date,
      amount: amt,
      vendor: String(r[2] ?? ''),
      existingRef: r[paymentRefCol] ? String(r[paymentRefCol]).trim() : null,
    })
  }
  const unmatchedRows = allRows.filter(r => !r.existingRef)
  console.log(`xlsx data rows: ${allRows.length}  (with refs: ${allRows.length - unmatchedRows.length}, without: ${unmatchedRows.length})`)

  // ── 3. Pull all Sanity docs ─────────────────────────────────────────────
  const payments = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, vatType, whtAmount, paymentMode,
      "vendorName": vendor->shortName
    }`,
  )
  const receipts = await client.fetch<any[]>(
    `*[_type=="receipt" && !(_id in path("drafts.**"))]{
      _id, receiptNumber, issueDate, totalAmount,
      "payerName": payer->legalName_en
    }`,
  )
  const fundings = await client.fetch<any[]>(
    `*[_type=="funding" && !(_id in path("drafts.**"))]{
      _id, fundingNumber, date, amount, direction, fundingType,
      "partyName": party->legalName_en
    }`,
  )

  console.log(`Sanity: ${payments.length} payments + ${receipts.length} receipts + ${fundings.length} fundings = ${payments.length + receipts.length + fundings.length}`)

  // Build unified pool — payments=outflow, receipts=inflow, funding=both
  const pool: SanityDoc[] = []
  for (const p of payments) {
    if (!p.paymentNumber) continue
    // Net payable = gross + exclusive VAT − WHT  (matches actual bank cash flow)
    const gross = Number(p.paidAmount ?? 0)
    const vat   = Number(p.vatAmount ?? 0)
    const wht   = Number(p.whtAmount ?? 0)
    const exclusiveVat = p.vatType === 'exclusive' ? vat : 0
    const netPayable = Math.round((gross + exclusiveVat - wht) * 100) / 100
    pool.push({
      _id:         p._id,
      ref:         p.paymentNumber,
      type:        'payment',
      date:        p.paymentDate,
      totalAmount: netPayable,
      direction:   'outflow',
      scope:       p.paymentMode ?? '',
    })
  }
  for (const r of receipts) {
    if (!r.receiptNumber) continue
    pool.push({
      _id:         r._id,
      ref:         r.receiptNumber,
      type:        'receipt',
      date:        r.issueDate,
      totalAmount: Math.round(Number(r.totalAmount ?? 0) * 100) / 100,
      direction:   'inflow',
      scope:       'receipt',
    })
  }
  for (const f of fundings) {
    if (!f.fundingNumber) continue
    pool.push({
      _id:         f._id,
      ref:         f.fundingNumber,
      type:        'funding',
      date:        f.date,
      totalAmount: Math.round(Number(f.amount ?? 0) * 100) / 100,
      direction:   f.direction === 'inflow' ? 'inflow' : 'outflow',
      scope:       f.fundingType ?? '',
    })
  }

  // ── 4. Filter unmatched Sanity docs (not yet in xlsx) ──────────────────
  const unclaimedSanity = pool.filter(d => !existingRefStrings.has(d.ref))
  console.log(`Sanity docs already in xlsx: ${pool.length - unclaimedSanity.length}`)
  console.log(`Sanity docs NOT yet in xlsx: ${unclaimedSanity.length}`)

  // ── 5. Match unmatched xlsx rows ↔ unclaimed Sanity ─────────────────────
  const TOL_DAYS = 5
  const dayMs = 86400 * 1000
  const dayDiff = (a: string, b: string) => Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / dayMs)

  const claimed = new Set<string>()
  const matchedRowToRefs: Record<number, SanityDoc[]> = {}

  // Sort xlsx unmatched by date for deterministic matching
  const sortedUnmatched = [...unmatchedRows].sort((a, b) => a.date.localeCompare(b.date))

  for (const x of sortedUnmatched) {
    const wantPositive = x.amount > 0
    const target = Math.abs(x.amount)
    const pool = unclaimedSanity.filter(d =>
      !claimed.has(d._id) &&
      d.date != null &&
      dayDiff(d.date, x.date) <= TOL_DAYS &&
      ((wantPositive && d.direction === 'inflow') || (!wantPositive && d.direction === 'outflow'))
    )
    if (pool.length === 0) continue
    const subset = findSubset(target, pool)
    if (!subset) continue
    matchedRowToRefs[x.rowIdx] = subset
    for (const s of subset) claimed.add(s._id)
  }

  console.log(`\n=== New matches found: ${Object.keys(matchedRowToRefs).length} xlsx rows ===`)
  for (const [rowIdxStr, refs] of Object.entries(matchedRowToRefs)) {
    const rowIdx = Number(rowIdxStr)
    const r = aoa[rowIdx]
    console.log(`  row ${rowIdx + 1}  ${r[0]}  ${r[1]}  ${r[2]}  → ${refs.map(s => s.ref).join(', ')}`)
  }

  // ── 6. Write the new refs to xlsx ──────────────────────────────────────
  let written = 0
  for (const [rowIdxStr, refs] of Object.entries(matchedRowToRefs)) {
    const rowIdx = Number(rowIdxStr)
    const refStr = refs.map(s => s.ref).join(', ')
    const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: paymentRefCol })
    ws[cellAddr] = { t: 's', v: refStr }
    written++
  }

  const headerAddr = XLSX.utils.encode_cell({ r: 0, c: paymentRefCol })
  if (!ws[headerAddr]) ws[headerAddr] = { t: 's', v: 'Payment Ref' }
  if (paymentRefCol > range.e.c) {
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: paymentRefCol } })
  }

  if (written > 0) {
    XLSX.writeFile(wb, XLSX_FILE)
    console.log(`\n✓ Wrote ${written} new cells to ${XLSX_FILE}`)
  } else {
    console.log(`\n(no new cells to write)`)
  }

  // ── 7. Final report ────────────────────────────────────────────────────
  const stillUnmatchedSanity = unclaimedSanity.filter(d => !claimed.has(d._id))
  const stillUnmatchedXlsx = unmatchedRows.filter(x => !matchedRowToRefs[x.rowIdx])

  console.log(`\n=== Final state ===`)
  console.log(`  xlsx data rows                        : ${allRows.length}`)
  console.log(`  xlsx rows with ref (after this run)   : ${allRows.length - stillUnmatchedXlsx.length}`)
  console.log(`  xlsx rows STILL without ref           : ${stillUnmatchedXlsx.length}`)
  console.log(`  Sanity docs in xlsx (after this run)  : ${pool.length - stillUnmatchedSanity.length}`)
  console.log(`  Sanity docs STILL NOT in xlsx         : ${stillUnmatchedSanity.length}`)

  if (stillUnmatchedSanity.length > 0) {
    console.log(`\nSanity docs still not linked to any xlsx row:`)
    for (const d of stillUnmatchedSanity) {
      console.log(`  ${d.ref}  type=${d.type}  date=${d.date}  total=${d.totalAmount.toLocaleString()}  dir=${d.direction}  scope=${d.scope}`)
    }
  }

  // Write detailed JSON report
  const report = {
    summary: {
      xlsxDataRows: allRows.length,
      xlsxRowsWithRefBefore: allRows.length - unmatchedRows.length,
      xlsxRowsWithRefAfter:  allRows.length - stillUnmatchedXlsx.length,
      newCellsWritten: written,
      sanityDocsTotal: pool.length,
      sanityDocsInXlsxBefore: pool.length - unclaimedSanity.length,
      sanityDocsInXlsxAfter:  pool.length - stillUnmatchedSanity.length,
      sanityDocsStillNotInXlsx: stillUnmatchedSanity.length,
    },
    newMatches: Object.entries(matchedRowToRefs).map(([rowIdxStr, refs]) => {
      const rowIdx = Number(rowIdxStr)
      const r = aoa[rowIdx]
      return { rowIndex: rowIdx + 1, date: r[0], amount: r[1], vendor: r[2], refs: refs.map(s => s.ref) }
    }),
    stillUnmatchedSanity: stillUnmatchedSanity.map(d => ({
      ref: d.ref, type: d.type, date: d.date, total: d.totalAmount, direction: d.direction, scope: d.scope, _id: d._id,
    })),
    stillUnmatchedXlsx: stillUnmatchedXlsx.map(x => ({
      rowIndex: x.rowIdx + 1, date: x.date, amount: x.amount, vendor: x.vendor,
    })),
  }
  fs.writeFileSync(`${ACCT}/fill_unmatched_report.json`, JSON.stringify(report, null, 2), 'utf8')
  console.log(`\n✓ Report: ${ACCT}/fill_unmatched_report.json`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
