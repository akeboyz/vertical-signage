#!/usr/bin/env node
/**
 * Atomically record 3 receipts (batch 2):
 *   1. S__9920519.jpg — TRUE SIM 0953625487 — Nov+Dec 2025
 *   2. S__9920523.jpg — TRUE SIM 0953625487 — Jan+Feb 2026
 *   3. S__9920525.jpg — TRUE WIFI 9609113543 — Feb 2026
 *
 * Each: idempotency check → create payment → append billing → upload → publish.
 */

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

const ACCT = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'

interface Target {
  id: string
  vcn: string
  invoice: string
  file: string
  receiptDate: string
  periodStart: string
  periodEnd: string
  grossAmount: number
  vatAmount: number
  notes: string
}

const TARGETS: Target[] = [
  {
    id:           '9920519',
    vcn:          '0953625487',
    invoice:      'RFTKBKO29122025000007497',
    file:         `${ACCT}/S__9920519.jpg`,
    receiptDate:  '2025-12-29',
    periodStart:  '2025-11-01',
    periodEnd:    '2025-12-31',
    grossAmount:  924.48,
    vatAmount:    64.71,
    notes:        'Period Nov + Dec 2025 (combined billing). Paid via TrueMoney - Kasikorn Bank, total 989.19 incl VAT.',
  },
  {
    id:           '9920523',
    vcn:          '0953625487',
    invoice:      'B041210002A4499-9543',
    file:         `${ACCT}/S__9920523.jpg`,
    receiptDate:  '2026-03-05',
    periodStart:  '2026-01-01',
    periodEnd:    '2026-02-28',
    grossAmount:  1398.00,
    vatAmount:    97.86,
    notes:        'Period Jan + Feb 2026 (combined billing). Paid via credit card ending 4300, total 1495.86 incl VAT. Receipt slip B041210002A4499 #9543 (ทพC205338).',
  },
  {
    id:           '9920525',
    vcn:          '9609113543',
    invoice:      'B041210002A4499-RnC203015',
    file:         `${ACCT}/S__9920525.jpg`,
    receiptDate:  '2026-03-05',
    periodStart:  '2026-02-01',
    periodEnd:    '2026-02-28',
    grossAmount:  656.97,
    vatAmount:    45.99,
    notes:        'Period Feb 2026. Paid via credit card ending 4300, total 702.96 incl VAT. Receipt slip B041210002A4499 #9544.',
  },
]

const VAT_TYPE     = 'exclusive'
const PAYMENT_TYPE = 'transfer'
const BANK_CODE    = '110211'

function randomKey(len = 8): string {
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

async function processOne(client: ReturnType<typeof createClient>, t: Target, takenNumbers: Set<string>, bankRef: string): Promise<{ paymentNumber: string; paymentId: string } | null> {
  console.log(`\n--- Processing ${t.id} (${t.invoice}) ---`)

  // 1. Idempotency by invoice
  const byInvoice = await client.fetch<any[]>(
    `*[_type=="payment" && (paymentMethodDetails == $inv || $inv in receipts[].invoiceNumber)]{ _id, paymentNumber }`,
    { inv: t.invoice },
  )
  if (byInvoice.length > 0) {
    console.log(`  ✗ SKIP — invoice already exists:`)
    for (const e of byInvoice) console.log(`     ${e.paymentNumber}  id=${e._id}`)
    return null
  }

  // 2. Look up SC
  const sc = await client.fetch<any>(
    `*[_type=="serviceContract" && vendorContractNo==$no && !(_id in path("drafts.**"))][0]{
      _id, "vendorRef": vendor._ref, "glRef": glAccount._ref, serviceName
    }`,
    { no: t.vcn },
  )
  if (!sc) {
    console.error(`  ✗ ABORT — SC for ${t.vcn} not found`)
    return null
  }
  console.log(`  ✓ SC: ${sc._id} (${sc.serviceName})`)

  // 3. Fingerprint check (same SC + same date + same amount)
  const fingerprint = await client.fetch<any[]>(
    `*[_type=="payment" && linkedServiceContract._ref==$scId && paymentDate==$date && paidAmount==$amount]{
      _id, paymentNumber, paymentMethodDetails
    }`,
    { scId: sc._id, date: t.receiptDate, amount: t.grossAmount },
  )
  if (fingerprint.length > 0) {
    console.log(`  ✗ SKIP — payment with same SC+date+amount already exists:`)
    for (const e of fingerprint) console.log(`     ${e.paymentNumber}  id=${e._id}  inv=${e.paymentMethodDetails}`)
    return null
  }

  // 4. paymentNumber
  const paymentNumber = await generatePaymentNumber(client, t.receiptDate, takenNumbers)
  console.log(`  ✓ paymentNumber: ${paymentNumber}`)

  // 5. Build payment
  const executionNotes = [t.notes, `Vendor invoice: ${t.invoice}`].filter(Boolean).join('\n')
  const paymentDoc: Record<string, unknown> = {
    _type: 'payment',
    paymentMode: 'service_contract_payment',
    paymentNumber,
    paymentStatus: 'created',
    linkedServiceContract: { _type: 'reference', _ref: sc._id },
    vendor: { _type: 'reference', _ref: sc.vendorRef },
    currency: 'THB',
    vatType: VAT_TYPE,
    vatAmount: t.vatAmount,
    paymentType: PAYMENT_TYPE,
    paymentAmount: t.grossAmount,
    paidAmount: t.grossAmount,
    paymentDate: t.receiptDate,
    paymentMethodDetails: t.invoice,
    executionNotes,
    receipts: [],
    withholdingTaxRate: 'none',
    conditionMet: false,
    isSettled: false,
    bankAccount: { _type: 'reference', _ref: bankRef },
  }
  if (sc.glRef) paymentDoc.accountCode = { _type: 'reference', _ref: sc.glRef }

  const created = await client.create(paymentDoc as any)
  const paymentId = created._id
  console.log(`  ✓ Created: ${paymentId}`)

  // 6. Append billing entry
  await client.patch(sc._id).setIfMissing({ payments: [] }).append('payments', [{
    _key: randomKey(),
    _type: 'billingEntry',
    payment: { _type: 'reference', _ref: paymentId },
    servicePeriodStart: t.periodStart,
    servicePeriodEnd: t.periodEnd,
  }]).commit({ autoGenerateArrayKeys: false })
  console.log(`  ✓ Billing entry appended (${t.periodStart} – ${t.periodEnd})`)

  // 7. Upload + receipt
  if (!fs.existsSync(t.file)) {
    console.error(`  ✗ Receipt file not found: ${t.file}`)
    return { paymentNumber, paymentId }
  }
  console.log(`  Uploading ${path.basename(t.file)}…`)
  const asset = await client.assets.upload(
    'image',
    fs.createReadStream(t.file),
    { filename: path.basename(t.file), contentType: 'image/jpeg' },
  )
  console.log(`  ✓ Asset: ${asset._id}`)

  const draftId = `drafts.${paymentId}`
  const { _rev, _updatedAt, _createdAt, ...rest } = (await client.getDocument<any>(paymentId)) as any
  void _rev; void _updatedAt; void _createdAt
  await client.createOrReplace({ ...rest, _id: draftId })
  await client.patch(draftId).setIfMissing({ receipts: [] }).append('receipts', [{
    _key: randomKey(),
    _type: 'receipt',
    file: { _type: 'file', asset: { _type: 'reference', _ref: asset._id } },
    receiptDate: t.receiptDate,
    invoiceNumber: t.invoice,
  }]).commit({ autoGenerateArrayKeys: false })
  const updated = await client.getDocument<any>(draftId) as any
  const { _rev: r2, _updatedAt: u2, _createdAt: c2, _id: _ig, ...rest2 } = updated
  void r2; void u2; void c2
  await client.transaction()
    .createOrReplace({ ...rest2, _id: paymentId })
    .delete(draftId)
    .commit()
  console.log(`  ✓ Published`)

  return { paymentNumber, paymentId }
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

  // Bank account once
  const storedBank = BANK_CODE.length === 6 ? BANK_CODE.slice(1) : BANK_CODE
  const bank = await client.fetch<any>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="asset" && code==$code && isActive!=false][0]{ _id, code }`,
    { code: storedBank },
  )
  if (!bank) { console.error(`✗ ABORT — bank account ${BANK_CODE} not found`); process.exit(1) }
  console.log(`Bank: ${bank._id} (code ${bank.code})`)

  // Pre-fetch all existing payment numbers to avoid collision when generating
  const existingNumbers = await client.fetch<string[]>(`*[_type=="payment" && defined(paymentNumber)].paymentNumber`)
  const takenNumbers = new Set(existingNumbers ?? [])
  console.log(`Existing payment numbers: ${takenNumbers.size}`)

  const results: { id: string; status: string; paymentNumber?: string; paymentId?: string }[] = []
  for (const t of TARGETS) {
    try {
      const r = await processOne(client, t, takenNumbers, bank._id)
      if (r) {
        results.push({ id: t.id, status: 'created', ...r })
      } else {
        results.push({ id: t.id, status: 'skipped' })
      }
    } catch (err: any) {
      console.error(`  ✗ FAIL: ${err.message}`)
      results.push({ id: t.id, status: 'error' })
    }
  }

  console.log(`\n=== SUMMARY ===`)
  for (const r of results) {
    console.log(`  ${r.id}: ${r.status}${r.paymentNumber ? `  ${r.paymentNumber} (${r.paymentId})` : ''}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
