#!/usr/bin/env node
/**
 * Create one Receipt for the 2-Mar-26 +2,397 transaction in account_v3.xlsx
 * (advertising income from ชาญณรงค์ คุ้ม), then write the new receiptNumber
 * back into account_v3.xlsx's Payment Ref column for that row (in-place).
 *
 * No PDF uploads — user will attach receiptFile manually in Studio.
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

const ACCT     = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const XLSX_FILE = `${ACCT}/account_v3.xlsx`

// Receipt input data
const PAYER_LEGAL_TH    = 'ชาญณรงค์ คุ้ม'
const PAYER_LEGAL_EN    = 'Channarong Khoom'
const RECEIPT_DATE      = '2026-03-02'
const PERIOD_LABEL      = 'March 2026'
const BANK_REF          = 'X9205'
const AMOUNT            = 2397
const VAT_TYPE          = 'none'
const RECEIPT_TYPE      = 'combined'
const STATUS            = 'issued'
const LINE_DESCRIPTION_TH = 'รายได้ค่าโฆษณา'
const LINE_DESCRIPTION_EN = 'Advertising Revenue'
const INTERNAL_NOTES = [
  'Contract: CON-2026-03-01.pdf',
  'Receipt PDF: RPT-2026-03-01.pdf (upload manually in Studio)',
  `Bank: KBANK 2198618716, Ref ${BANK_REF}`,
].join('\n')

function randomKey(len = 16): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function generateReceiptNumber(client: ReturnType<typeof createClient>, dateStr: string): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix    = `RCT-${yearMonth}-`
  const existing  = await client.fetch<string[]>(`*[_type=="receipt" && defined(receiptNumber)].receiptNumber`)
  const taken = new Set(existing ?? [])
  let seq = 1
  while (taken.has(`${prefix}${String(seq).padStart(3, '0')}`)) seq++
  return `${prefix}${String(seq).padStart(3, '0')}`
}

async function ensureParty(client: ReturnType<typeof createClient>): Promise<string> {
  const existing = await client.fetch<any>(
    `*[_type=="party" && !(_id in path("drafts.**"))
        && (legalName_th==$th || legalName_en==$en)
      ][0]{ _id, legalName_th, legalName_en }`,
    { th: PAYER_LEGAL_TH, en: PAYER_LEGAL_EN },
  )
  if (existing) {
    console.log(`  ✓ existing party: ${existing.legalName_th ?? existing.legalName_en}  id=${existing._id}`)
    return existing._id
  }
  const created = await client.create({
    _type: 'party',
    _id: randomKey(16),
    legalName_th:  PAYER_LEGAL_TH,
    legalName_en:  PAYER_LEGAL_EN,
    identityType:  'individual',
    partyRole:    ['advertiser'],
  } as any)
  console.log(`  + created party: ${PAYER_LEGAL_TH}  id=${created._id}`)
  return created._id
}

async function findRevenueGL(client: ReturnType<typeof createClient>): Promise<{ _id: string; code: string; nameEn?: string } | null> {
  const accounts = await client.fetch<any[]>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="revenue" && isActive!=false]{
      _id, code, nameEn, nameTh
    } | order(code asc)`,
  )
  console.log(`  revenue accounts available: ${accounts.length}`)
  for (const a of accounts) console.log(`    code=${a.code}  ${a.nameEn ?? '?'}  /  ${a.nameTh ?? '?'}  id=${a._id}`)
  if (accounts.length === 0) return null
  // Prefer "advertising" or "โฆษณา" match
  const adMatch = accounts.find(a =>
    /advert/i.test(a.nameEn ?? '') || /โฆษณา/.test(a.nameTh ?? '')
  )
  return adMatch ?? accounts[0]
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

  console.log('=== Step 1: Party ===')
  const payerId = await ensureParty(client)

  console.log('\n=== Step 2: Revenue GL Account ===')
  const revenueGL = await findRevenueGL(client)
  if (!revenueGL) {
    console.log('  ⚠ no revenue accountCode found — Receipt will be created without GL on the line item.')
  } else {
    console.log(`  using GL: code=${revenueGL.code}  ${revenueGL.nameEn ?? '?'}  id=${revenueGL._id}`)
  }

  console.log('\n=== Step 3: Idempotency check ===')
  // Match by issueDate + payer + totalAmount
  const existing = await client.fetch<any>(
    `*[_type=="receipt" && !(_id in path("drafts.**"))
        && issueDate==$date
        && payer._ref==$payer
        && totalAmount==$amount
      ][0]{ _id, receiptNumber }`,
    { date: RECEIPT_DATE, payer: payerId, amount: AMOUNT },
  )
  let receiptNumber: string
  let receiptId: string
  if (existing) {
    console.log(`  ✓ existing receipt: ${existing.receiptNumber}  id=${existing._id}  — skip create`)
    receiptNumber = existing.receiptNumber
    receiptId = existing._id
  } else {
    receiptNumber = await generateReceiptNumber(client, RECEIPT_DATE)
    const lineItem: any = {
      _key: randomKey(8),
      _type: 'lineItem',
      sourceChargeKey: '',
      description_en: LINE_DESCRIPTION_EN,
      description_th: LINE_DESCRIPTION_TH,
      quantity:       1,
      unitPrice:      AMOUNT,
      vatType:        VAT_TYPE,
      lineTotal:      AMOUNT,
    }
    if (revenueGL) lineItem.accountCode = { _type: 'reference', _ref: revenueGL._id }

    const doc: Record<string, unknown> = {
      _type: 'receipt',
      _id: randomKey(16),
      receiptNumber,
      receiptType:   RECEIPT_TYPE,
      status:        STATUS,
      issueDate:     RECEIPT_DATE,
      payer:         { _type: 'reference', _ref: payerId },
      billingPeriod: PERIOD_LABEL,
      lineItems:     [lineItem],
      subtotal:      AMOUNT,
      vatAmount:     0,
      totalAmount:   AMOUNT,
      currency:      'THB',
      paymentMethod: 'transfer',
      paymentDate:   RECEIPT_DATE,
      bankReference: BANK_REF,
      internalNotes: INTERNAL_NOTES,
    }
    const created = await client.create(doc as any)
    receiptId = created._id
    console.log(`  + created Receipt: ${receiptNumber}  id=${receiptId}`)
  }

  console.log('\n=== Step 4: Update account_v3.xlsx Payment Ref column ===')
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  // Find Payment Ref column index
  const headerRow = aoa[0] ?? []
  let paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')
  if (paymentRefCol < 0) {
    paymentRefCol = headerRow.length
    console.log(`  Payment Ref column not found — adding at col ${XLSX.utils.encode_col(paymentRefCol)}`)
  } else {
    console.log(`  Payment Ref column at col ${XLSX.utils.encode_col(paymentRefCol)}`)
  }

  // Find the 2-Mar-26 +2,397 row
  let targetRow = -1
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const date = String(r[0] ?? '').trim()
    const amt  = String(r[1] ?? '').trim()
    if (date === '2-Mar-26' && /2,?397(\.0+)?\s*$/.test(amt)) {
      targetRow = i
      break
    }
  }
  if (targetRow < 0) { console.error(`  ✗ ABORT — target row 2-Mar-26 +2,397 not found`); process.exit(1) }
  console.log(`  found target row at index ${targetRow}: ${JSON.stringify(aoa[targetRow])}`)

  // Write the receipt number into the Payment Ref cell
  const cellAddr = XLSX.utils.encode_cell({ r: targetRow, c: paymentRefCol })
  const existingVal = ws[cellAddr]?.v
  if (existingVal && !String(existingVal).includes(receiptNumber)) {
    // Append
    ws[cellAddr] = { t: 's', v: `${existingVal}, ${receiptNumber}` }
    console.log(`  appended ${receiptNumber} to existing value "${existingVal}"`)
  } else {
    ws[cellAddr] = { t: 's', v: receiptNumber }
    console.log(`  set cell ${cellAddr} = "${receiptNumber}"`)
  }

  // Ensure header
  const headerAddr = XLSX.utils.encode_cell({ r: 0, c: paymentRefCol })
  if (!ws[headerAddr]) ws[headerAddr] = { t: 's', v: 'Payment Ref' }

  // Extend range if needed
  if (paymentRefCol > range.e.c) {
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: paymentRefCol } })
  }

  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`✓ Updated ${XLSX_FILE} in-place`)

  console.log('\n=== DONE ===')
  console.log(`  Receipt: ${receiptNumber} (id ${receiptId})`)
  console.log(`  xlsx row: ${targetRow + 1}, col ${XLSX.utils.encode_col(paymentRefCol)}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
