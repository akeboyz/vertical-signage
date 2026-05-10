#!/usr/bin/env node
/**
 * Match cashbook rows in account.xlsx (via account_dump.json) against
 * Service Contract Payments in Sanity. Reports:
 *   - xlsx internet rows with no Sanity match
 *   - Sanity payments with no xlsx match
 *   - Matches (total cash = paidAmount + vatAmount, ±0.50 tolerance)
 */

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

const DUMP = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account/account_dump.json'

// Heuristic: rows whose vendor or category mentions internet/AIS/TRUE/AWN
const INTERNET_KEYWORDS = ['ais', 'aws', 'awn', 'advance wireless', 'true', 'wire & wireless', 'wire&wireless', 'internet']

function parseAmount(s: string | null): number | null {
  if (!s) return null
  // Examples: " (107,187.56)", " 207,187.56 ", " 989.19 "
  const trimmed = s.trim()
  const isNeg = trimmed.startsWith('(') && trimmed.endsWith(')')
  const stripped = trimmed.replace(/[(),\s]/g, '')
  const n = parseFloat(stripped)
  if (isNaN(n)) return null
  return isNeg ? -n : n
}

function parseDate(s: string | null): string | null {
  if (!s) return null
  // Format: "5-Mar-25" → 2025-03-05  (assume YY+2000 if YY < 50, else 1900)
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const monStr = m[2].toLowerCase()
  const months: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 }
  const mon = months[monStr]
  if (!mon) return null
  let yr = parseInt(m[3], 10)
  if (yr < 100) yr += yr < 50 ? 2000 : 1900
  return `${yr}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

interface XlsxRow {
  rowIndex: number
  date: string | null
  vendor: string | null
  category: string | null
  amount: number   // negative for outflow
  ref: string | null
  doc: string | null
}

interface SanityPayment {
  _id: string
  paymentNumber: string
  paymentDate: string
  paidAmount: number
  vatAmount: number | null
  scVcn: string | null
  scName: string | null
  vendorName: string | null
  paymentMethodDetails: string | null
}

function isInternetRow(vendor: string | null, category: string | null): boolean {
  const txt = `${vendor ?? ''} ${category ?? ''}`.toLowerCase()
  return INTERNET_KEYWORDS.some(k => txt.includes(k))
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

  // 1. Load xlsx dump
  const dump = JSON.parse(fs.readFileSync(DUMP, 'utf8'))
  const sheet = dump.sheets.Sheet1
  const rowsAsArray: any[][] = sheet.rowsAsArray

  // Walk every row that has a date + amount; classify by vendor/category
  const xlsxRows: XlsxRow[] = []
  for (let i = 0; i < rowsAsArray.length; i++) {
    const r = rowsAsArray[i]
    if (!r) continue
    const [date, cash, vendor, category, ref, _balance, doc] = r
    const dateNorm = parseDate(date as any)
    const amt = parseAmount(cash as any)
    if (dateNorm == null || amt == null) continue
    xlsxRows.push({
      rowIndex: i + 1,  // 1-based for human readability
      date: dateNorm,
      vendor: vendor ?? null,
      category: category ?? null,
      amount: amt,
      ref: ref ?? null,
      doc: doc ?? null,
    })
  }

  const internetRows = xlsxRows.filter(r => r.amount < 0 && isInternetRow(r.vendor, r.category))
  console.log(`xlsx total dated rows : ${xlsxRows.length}`)
  console.log(`xlsx internet outflow : ${internetRows.length}\n`)

  // 2. Query all Sanity SC payments
  const payments = await client.fetch<SanityPayment[]>(
    `*[_type=="payment" && !(_id in path("drafts.**")) && paymentMode=="service_contract_payment"]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount,
      paymentMethodDetails,
      "scVcn":     linkedServiceContract->vendorContractNo,
      "scName":    linkedServiceContract->serviceName,
      "vendorName": vendor->shortName
    } | order(paymentDate asc)`,
  )
  console.log(`Sanity SC payments    : ${payments.length}\n`)

  // 3. Compute total-with-VAT for each Sanity payment
  function payTotal(p: SanityPayment): number {
    const gross = Number(p.paidAmount ?? 0)
    const vat   = Number(p.vatAmount ?? 0)
    return Math.round((gross + vat) * 100) / 100
  }

  // 4. Match: for each xlsx internet row, find candidate Sanity payments
  //    where  abs(payTotal - |xlsx.amount|) < 0.50  AND date within ±5 days
  const TOL_AMOUNT = 0.50
  const TOL_DAYS   = 5
  const dayMs = 86400 * 1000

  function dayDiff(a: string, b: string): number {
    return Math.round(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / dayMs)
  }

  const xlsxToPayments = new Map<number, SanityPayment[]>()
  const matchedPaymentIds = new Set<string>()

  for (const x of internetRows) {
    const want = Math.round(Math.abs(x.amount) * 100) / 100
    const candidates = payments.filter(p =>
      Math.abs(payTotal(p) - want) < TOL_AMOUNT &&
      dayDiff(p.paymentDate, x.date!) <= TOL_DAYS
    )
    xlsxToPayments.set(x.rowIndex, candidates)
    for (const c of candidates) matchedPaymentIds.add(c._id)
  }

  // 5. Reports
  console.log(`=== xlsx internet rows → Sanity match ===`)
  for (const x of internetRows) {
    const cands = xlsxToPayments.get(x.rowIndex) ?? []
    const want = Math.abs(x.amount).toFixed(2)
    const status = cands.length === 1 ? '✓ MATCH'
                : cands.length === 0 ? '✗ NO MATCH'
                :                       `⚠ ${cands.length} candidates`
    console.log(`\n  row ${x.rowIndex}  ${x.date}  ${x.vendor ?? ''}/${x.category ?? ''}  ${want}  → ${status}`)
    for (const c of cands) {
      console.log(`     · ${c.paymentNumber}  ${c.paymentDate}  ${c.scName ?? c.scVcn}  paid+vat=${payTotal(c).toFixed(2)}  inv=${c.paymentMethodDetails}`)
    }
  }

  console.log(`\n\n=== Sanity payments NOT found in xlsx (within ±${TOL_DAYS} days, ±${TOL_AMOUNT} amount) ===`)
  const unmatchedPayments = payments.filter(p => !matchedPaymentIds.has(p._id))
  console.log(`Count: ${unmatchedPayments.length}\n`)
  for (const p of unmatchedPayments) {
    console.log(`  ${p.paymentNumber}  ${p.paymentDate}  ${p.scName ?? p.scVcn}  paid+vat=${payTotal(p).toFixed(2)}  inv=${p.paymentMethodDetails}  id=${p._id}`)
  }

  // 6. Summary
  console.log(`\n\n=== Summary ===`)
  const oneToOne   = internetRows.filter(x => (xlsxToPayments.get(x.rowIndex)?.length ?? 0) === 1).length
  const noMatch    = internetRows.filter(x => (xlsxToPayments.get(x.rowIndex)?.length ?? 0) === 0).length
  const ambiguous  = internetRows.filter(x => (xlsxToPayments.get(x.rowIndex)?.length ?? 0) > 1).length
  console.log(`  xlsx rows matched 1:1     : ${oneToOne} / ${internetRows.length}`)
  console.log(`  xlsx rows unmatched       : ${noMatch}`)
  console.log(`  xlsx rows ambiguous       : ${ambiguous}`)
  console.log(`  Sanity payments matched   : ${matchedPaymentIds.size} / ${payments.length}`)
  console.log(`  Sanity payments unmatched : ${unmatchedPayments.length}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
