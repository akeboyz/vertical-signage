#!/usr/bin/env node
/**
 * Match each funding record to a shareholder row in account_v3.xlsx and
 * write its fundingNumber into the Payment Ref column (col H) — in place.
 *
 * Match rule: same date + same absolute amount + vendor contains "shareholders".
 * Duplicates on same day (e.g. two 30,000 entries on 28-Aug-25) are matched
 * in the order they appear in the xlsx, paired with funding records sorted
 * by fundingNumber (so FND-2508-002 → first row, FND-2508-003 → second).
 *
 * Won't overwrite existing values; appends with ", " separator instead.
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

  // ── 1. Pull all funding records ────────────────────────────────────────
  const fundings = await client.fetch<any[]>(
    `*[_type=="funding" && !(_id in path("drafts.**"))]{
      _id, fundingNumber, fundingType, direction, date, amount,
      bankReference,
      "partyName": party->legalName_en,
      "bankCode":  bankAccount->code
    } | order(fundingNumber asc)`,
  )
  console.log(`Funding records pulled: ${fundings.length}`)

  // ── 2. Read xlsx ────────────────────────────────────────────────────────
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  // Find Payment Ref column
  const headerRow: any[] = aoa[0] ?? []
  let paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')
  if (paymentRefCol < 0) paymentRefCol = headerRow.length
  console.log(`Payment Ref col at ${XLSX.utils.encode_col(paymentRefCol)}`)

  // ── 3. Build list of shareholder rows (date, amount, rowIdx) ────────────
  interface SHRow { rowIdx: number; date: string; amount: number; vendor: string }
  const shRows: SHRow[] = []
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const date = parseDate(r[0])
    const amt  = parseAmount(r[1])
    const vendor = String(r[2] ?? '').toLowerCase()
    if (date == null || amt == null) continue
    if (!vendor.includes('shareholder')) continue
    shRows.push({ rowIdx: i, date, amount: amt, vendor })
  }
  console.log(`xlsx shareholder rows: ${shRows.length}`)

  // ── 4. Match: for each funding record, find an xlsx shareholder row ─────
  // Same date + same |amount| + matching direction. Mark matched xlsx rows
  // so duplicates on same day pair up in order.
  const matched: Record<number, string[]> = {}    // xlsx rowIdx → [FND...]
  const usedFundingIds = new Set<string>()
  const unmatchedFundings: any[] = []

  // Build a copy we can mutate (mark used xlsx rows)
  const remaining = shRows.map(r => ({ ...r, claimed: false }))

  for (const f of fundings) {
    const wantPositive = f.direction === 'inflow'
    const target = remaining.find(r =>
      !r.claimed &&
      r.date === f.date &&
      Math.abs(r.amount) === Math.abs(Number(f.amount)) &&
      ((wantPositive && r.amount > 0) || (!wantPositive && r.amount < 0))
    )
    if (target) {
      target.claimed = true
      matched[target.rowIdx] = matched[target.rowIdx] ?? []
      matched[target.rowIdx].push(f.fundingNumber)
      usedFundingIds.add(f._id)
    } else {
      unmatchedFundings.push(f)
    }
  }

  console.log(`\nMatched: ${usedFundingIds.size} / ${fundings.length}`)
  for (const [rowIdx, refs] of Object.entries(matched)) {
    const r = aoa[Number(rowIdx)]
    console.log(`  row ${Number(rowIdx) + 1}  ${r[0]}  ${r[1]}  ${r[2]}  → ${refs.join(', ')}`)
  }
  if (unmatchedFundings.length) {
    console.log(`\nUnmatched fundings:`)
    for (const f of unmatchedFundings) {
      console.log(`  ${f.fundingNumber}  ${f.date}  ${f.direction}  ${f.amount}  ${f.partyName}`)
    }
  }

  // ── 5. Write Payment Ref cells (append if existing value) ───────────────
  console.log(`\nWriting cells…`)
  let written = 0
  for (const [rowIdxStr, refs] of Object.entries(matched)) {
    const rowIdx = Number(rowIdxStr)
    const refStr = refs.join(', ')
    const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: paymentRefCol })
    const existing = ws[cellAddr]?.v
    if (existing && String(existing).trim()) {
      // Append, but only if not already present
      if (!String(existing).includes(refStr)) {
        ws[cellAddr] = { t: 's', v: `${existing}, ${refStr}` }
        console.log(`  ${cellAddr}  appended "${refStr}" (was: "${existing}")`)
        written++
      } else {
        console.log(`  ${cellAddr}  already contains "${refStr}" — skip`)
      }
    } else {
      ws[cellAddr] = { t: 's', v: refStr }
      console.log(`  ${cellAddr}  set "${refStr}"`)
      written++
    }
  }

  // Ensure header
  const headerAddr = XLSX.utils.encode_cell({ r: 0, c: paymentRefCol })
  if (!ws[headerAddr]) ws[headerAddr] = { t: 's', v: 'Payment Ref' }
  if (paymentRefCol > range.e.c) {
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: paymentRefCol } })
  }

  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`\n✓ Updated ${XLSX_FILE} in-place  (${written} cells written)`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
