#!/usr/bin/env node
/**
 * Create 2 Payment records for ธนา เข็มทอง installation work, then write
 * paymentNumber back into account_v3.xlsx Payment Ref column.
 *
 *   17-Jan-26  -2,500  Account 1 (10211)  installation  The Room Sukhumvit 21
 *   26-Feb-26  -6,000  Account 2 (10212)  installation  Noble B19
 *
 * Mode: direct_expense (one-off installation labour)
 * GL:   Auto-detect "Electrical & Wiring" expense account (used for the
 *       three existing ธนา เข็มทอง payments already in Sanity)
 * WHT:  None (matching existing ธนา เข็มทอง pattern in Sanity — adjust
 *       in Studio if 3% should apply)
 */

import * as XLSX from 'xlsx'
import { createClient } from '@sanity/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

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

const ACCT       = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const XLSX_FILE  = `${ACCT}/account_v3.xlsx`

const BANK_10211 = 'xe1H5tZ2tAHPuL66DPdKqF'   // KBANK-4222730983
const BANK_10212 = 'rxxWf9x75mxHsS6RdORjnd'   // KBANK-2198618716

interface NewPayment {
  date:           string                      // YYYY-MM-DD
  amount:         number
  bankRef:        string
  projectSiteHint: string                     // search term for projectSite
  notes:          string
  xlsxDate:       string                      // d-MMM-yy for xlsx row match
}

const TARGETS: NewPayment[] = [
  {
    date:            '2026-01-17',
    amount:          2500,
    bankRef:         BANK_10211,
    projectSiteHint: 'Room Sukhumvit 21',
    notes:           'Installation labour for The Room Sukhumvit 21 project.',
    xlsxDate:        '17-Jan-26',
  },
  {
    date:            '2026-02-26',
    amount:          6000,
    bankRef:         BANK_10212,
    projectSiteHint: 'Noble B19',
    notes:           'Installation labour for Noble B19 project.',
    xlsxDate:        '26-Feb-26',
  },
]

function randomKey(len = 16): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function generatePaymentNumber(client: ReturnType<typeof createClient>, dateStr: string, taken: Set<string>): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix    = `PMT-${yearMonth}-`
  let seq = 1
  while (true) {
    const candidate = `${prefix}${String(seq).padStart(3, '0')}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
    seq++
  }
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

  // ── 1. ธนา เข็มทอง party (known _id) ──────────────────────────────────
  const TANA_PARTY_ID = '0e55dbcd-48c8-4cd9-bced-afea23d2f4b0'
  const tana = await client.fetch<any>(
    `*[_id==$id][0]{ _id, firstName, lastName, shortName }`,
    { id: TANA_PARTY_ID },
  )
  if (!tana) { console.error(`✗ ABORT — ธนา เข็มทอง party ${TANA_PARTY_ID} not found`); process.exit(1) }
  console.log(`✓ Vendor: ${tana.shortName ?? `${tana.firstName ?? ''} ${tana.lastName ?? ''}`.trim()}  id=${tana._id}`)

  // ── 2. Find "Electrical & Wiring" GL ─────────────────────────────────
  const gl = await client.fetch<any>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="expense" && (
        nameEn match "*lectrical*" || nameEn match "*iring*" || nameTh match "*ไฟฟ้า*"
      )][0]{ _id, code, nameEn, nameTh }`,
  )
  if (!gl) {
    // Fall back to inspecting existing ธนา payments to copy their GL
    const sample = await client.fetch<any>(
      `*[_type=="payment" && !(_id in path("drafts.**")) && vendor._ref==$id && defined(accountCode._ref)][0]{
        "glRef": accountCode._ref,
        "glCode": accountCode->code,
        "glNameEn": accountCode->nameEn
      }`,
      { id: tana._id },
    )
    if (!sample?.glRef) { console.error(`✗ ABORT — no GL found for installation expense`); process.exit(1) }
    console.log(`✓ GL (from existing ธนา payment): ${sample.glCode} ${sample.glNameEn}  id=${sample.glRef}`)
    ;(gl as any) = { _id: sample.glRef, code: sample.glCode, nameEn: sample.glNameEn }
  } else {
    console.log(`✓ GL: ${gl.code} ${gl.nameEn}  id=${gl._id}`)
  }

  // ── 3. Pre-fetch payment numbers ────────────────────────────────────────
  const existingNumbers = await client.fetch<string[]>(`*[_type=="payment" && defined(paymentNumber)].paymentNumber`)
  const takenNumbers = new Set(existingNumbers ?? [])

  // ── 4. Process each target ─────────────────────────────────────────────
  const results: { date: string; amount: number; paymentNumber: string; paymentId: string; xlsxRow?: number }[] = []

  for (const t of TARGETS) {
    console.log(`\n--- Processing ${t.date}  ${t.amount}  (${t.projectSiteHint}) ---`)

    // Find projectSite (optional)
    const projectSite = await client.fetch<any>(
      `*[_type=="projectSite" && !(_id in path("drafts.**")) && (
          projectEn match $hint || projectTh match $hint
        )][0]{ _id, projectEn, projectTh }`,
      { hint: `*${t.projectSiteHint}*` },
    )
    if (projectSite) {
      console.log(`  ✓ projectSite: ${projectSite.projectEn ?? projectSite.projectTh}  id=${projectSite._id}`)
    } else {
      console.log(`  ⚠ projectSite for "${t.projectSiteHint}" not found — leaving unset`)
    }

    // Idempotency check
    const existing = await client.fetch<any>(
      `*[_type=="payment" && !(_id in path("drafts.**"))
          && paymentDate==$date
          && paidAmount==$amount
          && vendor._ref==$vendorId
        ][0]{ _id, paymentNumber }`,
      { date: t.date, amount: t.amount, vendorId: tana._id },
    )
    let paymentNumber: string, paymentId: string
    if (existing) {
      paymentNumber = existing.paymentNumber
      paymentId = existing._id
      console.log(`  ✓ existing payment: ${paymentNumber}  id=${paymentId}  — skip create`)
    } else {
      paymentNumber = await generatePaymentNumber(client, t.date, takenNumbers)
      const doc: Record<string, unknown> = {
        _type:                'payment',
        _id:                  randomKey(16),
        paymentNumber,
        paymentMode:          'direct_expense',
        paymentStatus:        'created',
        vendor:               { _type: 'reference', _ref: tana._id },
        accountCode:          { _type: 'reference', _ref: gl._id },
        bankAccount:          { _type: 'reference', _ref: t.bankRef },
        paymentDate:          t.date,
        paymentAmount:        t.amount,
        paidAmount:           t.amount,
        currency:             'THB',
        vatType:              'none',
        vatAmount:            0,
        whtAmount:            0,
        withholdingTaxRate:   'none',
        paymentType:          'transfer',
        executionNotes:       t.notes,
        receipts:             [],
        conditionMet:         false,
        isSettled:            false,
      }
      if (projectSite) doc.projectSite = { _type: 'reference', _ref: projectSite._id }
      const created = await client.create(doc as any)
      paymentNumber = paymentNumber
      paymentId = created._id
      console.log(`  + created: ${paymentNumber}  id=${paymentId}`)
    }

    results.push({ date: t.date, amount: t.amount, paymentNumber, paymentId })
  }

  // ── 5. Update xlsx ─────────────────────────────────────────────────────
  console.log(`\n=== Update xlsx ===`)
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  const headerRow: any[] = aoa[0] ?? []
  let paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')
  if (paymentRefCol < 0) paymentRefCol = headerRow.length

  for (let idx = 0; idx < TARGETS.length; idx++) {
    const t = TARGETS[idx]
    const r = results[idx]
    // Find xlsx row matching date+amount+vendor-contains-tana-or-vendor
    let matchedRow = -1
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i]
      if (!row) continue
      const date = String(row[0] ?? '').trim()
      const cash = String(row[1] ?? '').trim()
      const vendor = String(row[2] ?? '').trim().toLowerCase()
      if (date !== t.xlsxDate) continue
      // Match by absolute amount
      const amtRegex = new RegExp(`\\(?${t.amount.toLocaleString()}(\\.0+)?\\)?`)
      if (!amtRegex.test(cash)) continue
      // Vendor must mention ธนา or "vendor"
      if (!vendor.includes('ธนา') && !vendor.includes('vendor') && !vendor.includes('เข้ม') && !vendor.includes('เข็มทอง')) continue
      matchedRow = i
      break
    }
    if (matchedRow < 0) {
      console.log(`  ⚠ ${r.paymentNumber}: xlsx row not found for ${t.xlsxDate} ${t.amount}`)
      continue
    }
    const cellAddr = XLSX.utils.encode_cell({ r: matchedRow, c: paymentRefCol })
    const existingVal = ws[cellAddr]?.v
    if (existingVal && String(existingVal).includes(r.paymentNumber)) {
      console.log(`  ✓ ${cellAddr}  already has "${r.paymentNumber}" — skip`)
    } else if (existingVal && String(existingVal).trim()) {
      ws[cellAddr] = { t: 's', v: `${existingVal}, ${r.paymentNumber}` }
      console.log(`  + ${cellAddr}  appended "${r.paymentNumber}" (was: "${existingVal}")`)
    } else {
      ws[cellAddr] = { t: 's', v: r.paymentNumber }
      console.log(`  + ${cellAddr}  set "${r.paymentNumber}"`)
    }
    results[idx].xlsxRow = matchedRow + 1
  }

  if (paymentRefCol > range.e.c) {
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: paymentRefCol } })
  }
  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`\n✓ Saved ${XLSX_FILE}`)

  console.log(`\n=== DONE ===`)
  for (const r of results) {
    console.log(`  ${r.paymentNumber}  ${r.date}  ${r.amount.toLocaleString()}  xlsx_row=${r.xlsxRow ?? '?'}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
