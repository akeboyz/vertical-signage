#!/usr/bin/env node
/**
 * Create a Payment doc in Sanity for the Lumpini 24 security deposit:
 *   9-Jul-2025  9,000 THB  to Lumpini 24 juristic person
 *
 * Mode: direct_expense (since the deposit is a balance-sheet asset, not a
 * recurring rental — pairing rent_payment mode with an asset GL would
 * pollute rent reporting).
 *
 * GL: code 14000 Deposit / เงินมัดจำ (asset, recoverable on contract end)
 *
 * Then writes the new paymentNumber back into account_v3.xlsx row that has
 * date "9-Jul-25", amount -9,000, vendor "lumpini 24", category "deposit"
 * (after the recent label-swap).
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

const ACCT      = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const XLSX_FILE = `${ACCT}/account_v3.xlsx`

const LUMPINI_PARTY_ID = 'Q3uyLhmHndK2MusL6vlm7J'      // The Lumpini 24 Condominium Juristic Person
const BANK_ACCT_10211  = 'xe1H5tZ2tAHPuL66DPdKqF'      // KBANK 4222730983
const DEPOSIT_GL       = 'xe1H5tZ2tAHPuL66DPQFGh'      // code 14000 Deposit / เงินมัดจำ (asset)

const PAYMENT_DATE   = '2025-07-09'
const AMOUNT         = 9000
const NOTES = [
  'Security deposit for Lumpini 24 rental (เงินค้ำประกันการใช้พื้นที่ส่วนกลาง ก.ค.68).',
  'LPP receipt #6807000052 (issued 09/07/2568).',
  'Per K+ slip in LINE_NOTE_260427_2.jpg (transfer from KBANK 9937 → SCB 5147).',
  'Refundable upon contract termination — booked as asset (GL 14000).',
].join('\n')

function randomKey(len = 16): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function generatePaymentNumber(client: ReturnType<typeof createClient>, dateStr: string): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix    = `PMT-${yearMonth}-`
  const existing  = await client.fetch<string[]>(`*[_type=="payment" && defined(paymentNumber)].paymentNumber`)
  const taken = new Set(existing ?? [])
  let seq = 1
  while (taken.has(`${prefix}${String(seq).padStart(3, '0')}`)) seq++
  return `${prefix}${String(seq).padStart(3, '0')}`
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

  // ── 1. Idempotency ─────────────────────────────────────────────────────
  const existing = await client.fetch<any>(
    `*[_type=="payment" && !(_id in path("drafts.**"))
        && paymentDate==$date
        && paidAmount==$amount
        && vendor._ref==$vendorId
        && accountCode._ref==$glId
      ][0]{ _id, paymentNumber }`,
    { date: PAYMENT_DATE, amount: AMOUNT, vendorId: LUMPINI_PARTY_ID, glId: DEPOSIT_GL },
  )
  let paymentId: string
  let paymentNumber: string
  if (existing) {
    console.log(`✓ existing payment found: ${existing.paymentNumber}  id=${existing._id}  — skip create`)
    paymentId = existing._id
    paymentNumber = existing.paymentNumber
  } else {
    paymentNumber = await generatePaymentNumber(client, PAYMENT_DATE)
    const doc = {
      _type: 'payment',
      _id: randomKey(16),
      paymentNumber,
      paymentMode:           'direct_expense',
      paymentStatus:         'created',
      vendor:                { _type: 'reference', _ref: LUMPINI_PARTY_ID },
      accountCode:           { _type: 'reference', _ref: DEPOSIT_GL },
      bankAccount:           { _type: 'reference', _ref: BANK_ACCT_10211 },
      paymentDate:           PAYMENT_DATE,
      paymentAmount:         AMOUNT,
      paidAmount:            AMOUNT,
      currency:              'THB',
      vatType:               'none',
      vatAmount:             0,
      withholdingTaxRate:    'none',
      paymentType:           'transfer',
      paymentMethodDetails:  'LPP receipt #6807000052',
      executionNotes:        NOTES,
      receipts:              [],
      conditionMet:          false,
      isSettled:             false,
    }
    const created = await client.create(doc as any)
    paymentId = created._id
    console.log(`+ Created Payment: ${paymentNumber}  id=${paymentId}`)
  }

  // ── 2. Update xlsx ─────────────────────────────────────────────────────
  console.log(`\nReading ${XLSX_FILE}…`)
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  const headerRow: any[] = aoa[0] ?? []
  let paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')
  if (paymentRefCol < 0) paymentRefCol = headerRow.length
  console.log(`Payment Ref col at ${XLSX.utils.encode_col(paymentRefCol)}`)

  // Find target row: 9-Jul-25, lumpini 24, deposit (after label swap)
  let targetRow = -1
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const date     = String(r[0] ?? '').trim()
    const vendor   = String(r[2] ?? '').trim().toLowerCase()
    const category = String(r[3] ?? '').trim().toLowerCase()
    if (date === '9-Jul-25' && vendor === 'lumpini 24' && category === 'deposit') {
      targetRow = i
      break
    }
  }
  if (targetRow < 0) { console.error(`✗ ABORT — target row 9-Jul-25 lumpini deposit not found`); process.exit(1) }
  console.log(`Found target row ${targetRow + 1}: ${JSON.stringify(aoa[targetRow])}`)

  const cellAddr = XLSX.utils.encode_cell({ r: targetRow, c: paymentRefCol })
  const existingVal = ws[cellAddr]?.v
  if (existingVal && String(existingVal).includes(paymentNumber)) {
    console.log(`  ${cellAddr} already contains "${paymentNumber}" — skip`)
  } else if (existingVal && String(existingVal).trim()) {
    ws[cellAddr] = { t: 's', v: `${existingVal}, ${paymentNumber}` }
    console.log(`  ${cellAddr}  appended "${paymentNumber}" (was: "${existingVal}")`)
  } else {
    ws[cellAddr] = { t: 's', v: paymentNumber }
    console.log(`  ${cellAddr}  set "${paymentNumber}"`)
  }

  if (paymentRefCol > range.e.c) {
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: paymentRefCol } })
  }

  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`\n✓ Saved ${XLSX_FILE}`)

  console.log(`\n=== DONE ===`)
  console.log(`  Payment: ${paymentNumber}  id=${paymentId}`)
  console.log(`  xlsx row: ${targetRow + 1}, col ${XLSX.utils.encode_col(paymentRefCol)}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
