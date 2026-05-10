#!/usr/bin/env node
/**
 * Create Party (Chaiyasit Sritawat Na Ayudaya, individual, agent role) +
 * 3 commission Payment records, then update account_v3.xlsx.
 *
 *   29-Aug-25  -4,500   Account 1  commission
 *   8-Jan-26   -15,000  Account 1  commission
 *   19-Feb-26  -3,880   Account 2  commission  (bankRef X6001)
 *
 * No WHT applied (matches xlsx net cash directly). Adjust in Studio if
 * 3% or 5% WHT should be split out.
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

interface Pmt {
  date:     string
  amount:   number
  bank:     string
  bankRef?: string
  xlsxDate: string
  notes:    string
}

const TARGETS: Pmt[] = [
  { date: '2025-08-29', amount: 4500,  bank: BANK_10211, xlsxDate: '29-Aug-25', notes: 'Commission paid to Chaiyasit Sritawat Na Ayudaya.' },
  { date: '2026-01-08', amount: 15000, bank: BANK_10211, xlsxDate: '8-Jan-26',  notes: 'Commission paid to Chaiyasit Sritawat Na Ayudaya.' },
  { date: '2026-02-19', amount: 3880,  bank: BANK_10212, bankRef: 'X6001', xlsxDate: '19-Feb-26', notes: 'Commission paid to Chaiyasit Sritawat Na Ayudaya. Bank ref X6001.' },
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
  const token = process.env.SANITY_WRITE_TOKEN!
  const client = createClient({
    projectId: 'awjj9g8u', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false,
  })

  // ── 1. Create or find party ───────────────────────────────────────────
  console.log('=== Step 1: Party ===')
  let party = await client.fetch<any>(
    `*[_type=="party" && !(_id in path("drafts.**")) && (
        legalName_en match "*haiyasit*" || firstName match "Chaiyasit*" || shortName match "Chaiyasit*"
      )][0]{ _id, legalName_en, firstName, lastName }`,
  )
  if (party) {
    console.log(`  ✓ existing party: ${party.legalName_en ?? party.firstName + ' ' + party.lastName}  id=${party._id}`)
  } else {
    const newParty = {
      _type: 'party',
      _id:   randomKey(16),
      identityType: 'individual',
      firstName:    'Chaiyasit',
      lastName:     'Sritawat Na Ayudaya',
      legalName_en: 'Chaiyasit Sritawat Na Ayudaya',
      shortName:    'Chaiyasit',
      partyRole:    ['agent'],
    }
    const created = await client.create(newParty as any)
    party = created
    console.log(`  + created party: Chaiyasit Sritawat Na Ayudaya  id=${party._id}`)
  }
  const partyId = party._id

  // ── 2. Find GL 512000 Commission expenses ─────────────────────────────
  console.log('\n=== Step 2: GL ===')
  // Find by name — code field varies (might be stored as "12000" or "512000")
  const expenses = await client.fetch<any[]>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="expense" && isActive!=false]{
      _id, code, nameEn, nameTh
    }`,
  )
  const gl = expenses.find(e =>
    /commission/i.test(String(e.nameEn ?? '')) || /นายหน้า/.test(String(e.nameTh ?? ''))
  )
  if (!gl) {
    console.error('✗ ABORT — Commission expense GL not found. Available expense GLs:')
    for (const e of expenses) console.error(`   ${e.code}  ${e.nameEn} / ${e.nameTh}`)
    process.exit(1)
  }
  console.log(`  ✓ GL: ${gl.code}  ${gl.nameEn}  id=${gl._id}`)

  // ── 3. Pre-fetch payment numbers ──────────────────────────────────────
  const existing = await client.fetch<string[]>(`*[_type=="payment" && defined(paymentNumber)].paymentNumber`)
  const taken = new Set(existing ?? [])

  // ── 4. Create 3 payments (idempotent) ─────────────────────────────────
  console.log('\n=== Step 3: Payments ===')
  const results: { date: string; amount: number; paymentNumber: string; paymentId: string }[] = []
  for (const t of TARGETS) {
    const dup = await client.fetch<any>(
      `*[_type=="payment" && !(_id in path("drafts.**"))
          && paymentDate==$date && paidAmount==$amt && vendor._ref==$pid
        ][0]{ _id, paymentNumber }`,
      { date: t.date, amt: t.amount, pid: partyId },
    )
    if (dup) {
      console.log(`  ✓ skip — exists: ${dup.paymentNumber}  id=${dup._id}`)
      results.push({ date: t.date, amount: t.amount, paymentNumber: dup.paymentNumber, paymentId: dup._id })
      continue
    }
    const num = await generatePaymentNumber(client, t.date, taken)
    const doc: Record<string, unknown> = {
      _type: 'payment',
      _id:   randomKey(16),
      paymentNumber:        num,
      paymentMode:          'direct_expense',
      paymentStatus:        'created',
      vendor:               { _type: 'reference', _ref: partyId },
      accountCode:          { _type: 'reference', _ref: gl._id },
      bankAccount:          { _type: 'reference', _ref: t.bank },
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
      ...(t.bankRef ? { paymentMethodDetails: t.bankRef } : {}),
    }
    const created = await client.create(doc as any)
    console.log(`  + ${num}  ${t.date}  ${t.amount.toLocaleString()}  bank=${t.bank===BANK_10211?'10211':'10212'}  id=${created._id}`)
    results.push({ date: t.date, amount: t.amount, paymentNumber: num, paymentId: created._id })
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

  for (let idx = 0; idx < TARGETS.length; idx++) {
    const t = TARGETS[idx]
    const r = results[idx]
    let matched = -1
    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i]
      if (!row) continue
      const date = String(row[0] ?? '').trim()
      const cash = String(row[1] ?? '').trim()
      const vendor = String(row[2] ?? '').trim().toLowerCase()
      if (date !== t.xlsxDate) continue
      const amtRegex = new RegExp(`\\(?${t.amount.toLocaleString()}(\\.0+)?\\)?`)
      if (!amtRegex.test(cash)) continue
      if (!vendor.includes('chaiyasit')) continue
      matched = i; break
    }
    if (matched < 0) { console.log(`  ⚠ ${r.paymentNumber}: xlsx row not found`); continue }
    const cellAddr = XLSX.utils.encode_cell({ r: matched, c: paymentRefCol })
    const ev = ws[cellAddr]?.v
    if (ev && String(ev).includes(r.paymentNumber)) {
      console.log(`  ✓ ${cellAddr} already has "${r.paymentNumber}" — skip`)
    } else if (ev && String(ev).trim()) {
      ws[cellAddr] = { t: 's', v: `${ev}, ${r.paymentNumber}` }
      console.log(`  + ${cellAddr}  appended "${r.paymentNumber}"`)
    } else {
      ws[cellAddr] = { t: 's', v: r.paymentNumber }
      console.log(`  + ${cellAddr}  set "${r.paymentNumber}"`)
    }
  }

  if (paymentRefCol > range.e.c) {
    ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: paymentRefCol } })
  }
  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`\n✓ Saved ${XLSX_FILE}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
