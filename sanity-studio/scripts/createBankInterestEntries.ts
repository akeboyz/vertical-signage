#!/usr/bin/env node
/**
 * Record bank interest + WHT entries from xlsx into Sanity.
 *
 * 3 interest + 3 WHT pairs:
 *   20-Jun-25  Acct 1  +262.98 interest  /  -2.63 WHT
 *   19-Dec-25  Acct 1  +88.44  interest  /  -0.88 WHT
 *   19-Dec-25  Acct 2  +145.55 interest  /  -1.46 WHT
 *
 * Each event → 1 Receipt (gross interest) + 1 Payment (WHT deduction).
 * Then writes both refs into the corresponding xlsx rows.
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

const BANK_10211 = 'xe1H5tZ2tAHPuL66DPdKqF'
const BANK_10212 = 'rxxWf9x75mxHsS6RdORjnd'

interface Event {
  date:        string    // YYYY-MM-DD
  xlsxDate:    string    // d-MMM-yy
  bankAccount: string
  interest:    number
  wht:         number
}

const EVENTS: Event[] = [
  { date: '2025-06-20', xlsxDate: '20-Jun-25', bankAccount: BANK_10211, interest: 262.98, wht: 2.63 },
  { date: '2025-12-19', xlsxDate: '19-Dec-25', bankAccount: BANK_10211, interest: 88.44,  wht: 0.88 },
  { date: '2025-12-19', xlsxDate: '19-Dec-25', bankAccount: BANK_10212, interest: 145.55, wht: 1.46 },
]

function randomKey(len = 16): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function generateNumber(client: ReturnType<typeof createClient>, type: 'payment' | 'receipt', dateStr: string, taken: Set<string>): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix = type === 'receipt' ? `RCT-${yearMonth}-` : `PMT-${yearMonth}-`
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
  const token = process.env.SANITY_WRITE_TOKEN!
  const client = createClient({
    projectId: 'awjj9g8u', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false,
  })

  // ── 1. KBANK party — exact-match lookup (no fuzzy match) ────────────────
  console.log('=== Step 1: KBANK party ===')
  let kbank = await client.fetch<any>(
    `*[_type=="party" && !(_id in path("drafts.**")) && (
        shortName == "KBANK" ||
        legalName_en == "KASIKORNBANK Public Company Limited" ||
        legalName_th == "ธนาคารกสิกรไทย จำกัด (มหาชน)"
      )][0]{ _id, legalName_en, shortName }`,
  )
  if (kbank) {
    console.log(`  ✓ existing: ${kbank.legalName_en} (${kbank.shortName})  id=${kbank._id}`)
  } else {
    const created = await client.create({
      _type: 'party',
      _id: randomKey(16),
      identityType: 'corporate',
      legalName_en: 'KASIKORNBANK Public Company Limited',
      legalName_th: 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
      shortName:    'KBANK',
      partyRole:    ['lender'],
    } as any)
    kbank = created
    console.log(`  + created: ${kbank.legalName_en}  id=${kbank._id}`)
  }

  // ── 2. GL accounts ─────────────────────────────────────────────────────
  console.log('\n=== Step 2: GL accounts ===')
  const allCodes = await client.fetch<any[]>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && isActive!=false]{
      _id, code, nameEn, nameTh, type
    }`,
  )

  const interestGL = allCodes.find(c =>
    c.type === 'revenue' && (/interest/i.test(c.nameEn ?? '') || /ดอกเบี้ย/.test(c.nameTh ?? ''))
  )
  if (!interestGL) { console.error('✗ ABORT — interest income GL not found'); process.exit(1) }
  console.log(`  ✓ Interest income GL: ${interestGL.code}  ${interestGL.nameEn}  id=${interestGL._id}`)

  // WHT receivable — search asset accounts for "WHT"/"withholding"/"ภาษีถูกหัก"
  // Fallback: expense Tax account
  let whtGL = allCodes.find(c =>
    c.type === 'asset' && (
      /withhold/i.test(c.nameEn ?? '') ||
      /WHT/i.test(c.nameEn ?? '') ||
      /ภาษีถูกหัก/.test(c.nameTh ?? '') ||
      /ภาษีหัก/.test(c.nameTh ?? '')
    )
  )
  if (!whtGL) {
    // Fallback: any asset with "tax" in name
    whtGL = allCodes.find(c =>
      c.type === 'asset' && (/tax/i.test(c.nameEn ?? '') || /ภาษี/.test(c.nameTh ?? ''))
    )
  }
  if (!whtGL) {
    // Fallback: expense Tax
    whtGL = allCodes.find(c =>
      c.type === 'expense' && (/^tax$/i.test((c.nameEn ?? '').trim()) || /^ค่าภาษี$/.test((c.nameTh ?? '').trim()))
    )
  }
  if (!whtGL) { console.error('✗ ABORT — WHT GL not found (no asset receivable, no expense Tax)'); process.exit(1) }
  console.log(`  ✓ WHT GL: ${whtGL.code}  ${whtGL.nameEn}  (${whtGL.type})  id=${whtGL._id}`)

  // ── 3. Pre-fetch numbers ──────────────────────────────────────────────
  const existingP = await client.fetch<string[]>(`*[_type=="payment" && defined(paymentNumber)].paymentNumber`)
  const existingR = await client.fetch<string[]>(`*[_type=="receipt" && defined(receiptNumber)].receiptNumber`)
  const takenP = new Set(existingP ?? [])
  const takenR = new Set(existingR ?? [])

  // ── 4. Create docs for each event ──────────────────────────────────────
  console.log('\n=== Step 3: Create docs ===')
  interface Result { event: Event; receiptNumber: string; receiptId: string; paymentNumber: string; paymentId: string }
  const results: Result[] = []

  for (const ev of EVENTS) {
    console.log(`\n--- ${ev.date}  bank=${ev.bankAccount===BANK_10211?'10211':'10212'}  interest=${ev.interest}  wht=${ev.wht} ---`)

    // Receipt for interest
    let receiptId: string, receiptNumber: string
    const dupR = await client.fetch<any>(
      `*[_type=="receipt" && !(_id in path("drafts.**"))
          && issueDate==$date && totalAmount==$amt && payer._ref==$pid
        ][0]{ _id, receiptNumber }`,
      { date: ev.date, amt: ev.interest, pid: kbank._id },
    )
    if (dupR) {
      receiptId = dupR._id
      receiptNumber = dupR.receiptNumber
      console.log(`  ✓ receipt exists: ${receiptNumber}`)
    } else {
      receiptNumber = await generateNumber(client, 'receipt', ev.date, takenR)
      const rDoc = {
        _type: 'receipt', _id: randomKey(16),
        receiptNumber,
        receiptType:   'receipt_only',
        status:        'issued',
        issueDate:     ev.date,
        payer:         { _type: 'reference', _ref: kbank._id },
        billingPeriod: 'Bank interest credit',
        lineItems: [{
          _key: randomKey(8),
          _type: 'lineItem',
          description_en: 'Bank interest income',
          description_th: 'ดอกเบี้ยรับธนาคาร',
          accountCode: { _type: 'reference', _ref: interestGL._id },
          quantity: 1,
          unitPrice: ev.interest,
          vatType: 'none',
          lineTotal: ev.interest,
        }],
        subtotal:      ev.interest,
        vatAmount:     0,
        totalAmount:   ev.interest,
        currency:      'THB',
        paymentMethod: 'transfer',
        paymentDate:   ev.date,
        bankReference: `Auto-credited by bank, WHT ${ev.wht} deducted separately`,
        internalNotes: `Bank interest credit on ${ev.date}. Gross ${ev.interest}, WHT ${ev.wht} deducted (recorded separately as Payment).`,
      }
      const created = await client.create(rDoc as any)
      receiptId = created._id
      console.log(`  + receipt: ${receiptNumber}  id=${receiptId}`)
    }

    // Payment for WHT deduction
    let paymentId: string, paymentNumber: string
    const dupP = await client.fetch<any>(
      `*[_type=="payment" && !(_id in path("drafts.**"))
          && paymentDate==$date && paidAmount==$amt && vendor._ref==$pid
          && accountCode._ref==$gl
        ][0]{ _id, paymentNumber }`,
      { date: ev.date, amt: ev.wht, pid: kbank._id, gl: whtGL._id },
    )
    if (dupP) {
      paymentId = dupP._id
      paymentNumber = dupP.paymentNumber
      console.log(`  ✓ WHT payment exists: ${paymentNumber}`)
    } else {
      paymentNumber = await generateNumber(client, 'payment', ev.date, takenP)
      const pDoc = {
        _type: 'payment', _id: randomKey(16),
        paymentNumber,
        paymentMode:   'direct_expense',
        paymentStatus: 'created',
        vendor:        { _type: 'reference', _ref: kbank._id },
        accountCode:   { _type: 'reference', _ref: whtGL._id },
        bankAccount:   { _type: 'reference', _ref: ev.bankAccount },
        paymentDate:   ev.date,
        paymentAmount: ev.wht,
        paidAmount:    ev.wht,
        currency:      'THB',
        vatType:       'none',
        vatAmount:     0,
        whtAmount:     0,
        withholdingTaxRate: 'none',
        paymentType:   'transfer',
        executionNotes: `WHT deducted by bank from interest income (1% of ${ev.interest} ≈ ${ev.wht}). Pair with Receipt for the same date.`,
        receipts:      [],
        conditionMet:  false,
        isSettled:     false,
      }
      const created = await client.create(pDoc as any)
      paymentId = created._id
      console.log(`  + WHT payment: ${paymentNumber}  id=${paymentId}`)
    }

    results.push({ event: ev, receiptNumber, receiptId, paymentNumber, paymentId })
  }

  // ── 5. Update xlsx ─────────────────────────────────────────────────────
  console.log('\n=== Step 4: xlsx ===')
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref']!)
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  const headerRow: any[] = aoa[0] ?? []
  let paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')
  if (paymentRefCol < 0) paymentRefCol = headerRow.length

  function setCell(rowIdx: number, value: string) {
    const cellAddr = XLSX.utils.encode_cell({ r: rowIdx, c: paymentRefCol })
    const ev = ws[cellAddr]?.v
    if (ev && String(ev).includes(value)) {
      console.log(`  ✓ ${cellAddr} already has "${value}" — skip`)
    } else if (ev && String(ev).trim()) {
      ws[cellAddr] = { t: 's', v: `${ev}, ${value}` }
      console.log(`  + ${cellAddr}  appended "${value}"`)
    } else {
      ws[cellAddr] = { t: 's', v: value }
      console.log(`  + ${cellAddr}  set "${value}"`)
    }
  }

  function findRow(xlsxDate: string, signedAmount: number, vendorMustInclude: string): number {
    const want = Math.abs(signedAmount)
    const isOutflow = signedAmount < 0
    const wantStr = want.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i]
      if (!row) continue
      const date = String(row[0] ?? '').trim()
      const cash = String(row[1] ?? '').trim()
      const vendor = String(row[2] ?? '').trim().toLowerCase()
      const cat    = String(row[3] ?? '').trim().toLowerCase()
      if (date !== xlsxDate) continue
      if (!cash.includes(wantStr)) continue
      if (isOutflow && !cash.startsWith('(')) continue
      if (!isOutflow && cash.startsWith('(')) continue
      if (!vendor.includes(vendorMustInclude) && !cat.includes(vendorMustInclude)) continue
      return i
    }
    return -1
  }

  for (const r of results) {
    // Interest row (positive) — vendor=bank, category=interest
    const interestRow = findRow(r.event.xlsxDate, +r.event.interest, 'bank')
    if (interestRow < 0) {
      console.log(`  ⚠ ${r.receiptNumber}: xlsx interest row not found`)
    } else {
      setCell(interestRow, r.receiptNumber)
    }
    // WHT row (negative) — vendor=bank, category=withholding
    const whtRow = findRow(r.event.xlsxDate, -r.event.wht, 'bank')
    if (whtRow < 0) {
      console.log(`  ⚠ ${r.paymentNumber}: xlsx WHT row not found`)
    } else {
      setCell(whtRow, r.paymentNumber)
    }
  }

  if (paymentRefCol > range.e.c) {
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: paymentRefCol } })
  }
  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`\n✓ Saved ${XLSX_FILE}`)

  console.log(`\n=== DONE ===`)
  for (const r of results) {
    console.log(`  ${r.event.xlsxDate}  ${r.event.bankAccount===BANK_10211?'10211':'10212'}  R=${r.receiptNumber}  P=${r.paymentNumber}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
