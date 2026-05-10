#!/usr/bin/env node
/**
 * Atomically record AIS WIFI 8806489507 receipt W-CS-1179-6903-10001288
 * (Feb/Mar 2026 cycle, 499 + VAT 7% = 533.93).
 *
 * Steps:
 *   1. Idempotency: refuse if any payment already references this invoice.
 *   2. Look up SC for 8806489507.
 *   3. Generate paymentNumber (PMT-YYMM-NNN).
 *   4. Look up bank account 110211.
 *   5. Create published payment.
 *   6. Append billing entry to SC.
 *   7. Upload receipt asset (S__9920516.jpg).
 *   8. Add receipt to draft, then publish (replacing the published version).
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

const VCN          = '8806489507'
const INVOICE      = 'W-CS-1179-6903-10001288'
const RECEIPT_FILE = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account/S__9920516.jpg'
const RECEIPT_DATE = '2026-03-31'
const PERIOD_START = '2026-02-24'
const PERIOD_END   = '2026-03-23'
const GROSS_AMOUNT = 499
const VAT_AMOUNT   = 34.93
const VAT_TYPE     = 'exclusive'
const PAYMENT_TYPE = 'transfer'
const BANK_CODE    = '110211'
const NOTES        = 'Period 24/02/2026-23/03/2026 (Feb/Mar AIS WIFI)'

function randomKey(len = 8): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function generatePaymentNumber(client: ReturnType<typeof createClient>, dateStr: string): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix    = `PMT-${yearMonth}-`
  const existing  = await client.fetch<string[]>(`*[_type == "payment" && defined(paymentNumber)].paymentNumber`)
  const taken = new Set((existing ?? []).filter(n => n.startsWith(prefix)).map(n => parseInt(n.slice(prefix.length), 10)).filter(n => !isNaN(n)))
  let seq = 1
  while (taken.has(seq)) seq++
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

  // 1. Idempotency — search drafts + published for this invoice anywhere
  const existing = await client.fetch<any[]>(
    `*[_type=="payment" && (
        paymentMethodDetails == $inv ||
        $inv in receipts[].invoiceNumber
      )]{
      _id, paymentNumber, paymentDate, paymentMethodDetails
    }`,
    { inv: INVOICE },
  )
  if (existing.length > 0) {
    console.log(`✗ ABORT — invoice "${INVOICE}" already referenced by ${existing.length} payment(s):`)
    for (const e of existing) console.log(`   ${e.paymentNumber}  id=${e._id}  field=${e.paymentMethodDetails}`)
    process.exit(1)
  }
  console.log(`✓ No existing payment with invoice ${INVOICE}`)

  // 2. Look up SC
  const sc = await client.fetch<any>(
    `*[_type=="serviceContract" && vendorContractNo==$no && !(_id in path("drafts.**"))][0]{
      _id, "vendorRef": vendor._ref, "glRef": glAccount._ref, serviceName
    }`,
    { no: VCN },
  )
  if (!sc) {
    console.error(`✗ ABORT — SC for ${VCN} not found`)
    process.exit(1)
  }
  console.log(`✓ SC found: ${sc._id} (${sc.serviceName})  vendor=${sc.vendorRef}  gl=${sc.glRef ?? 'null'}`)

  // 3. paymentNumber
  const paymentNumber = await generatePaymentNumber(client, RECEIPT_DATE)
  console.log(`✓ paymentNumber generated: ${paymentNumber}`)

  // 4. Bank account
  const storedBank = BANK_CODE.length === 6 ? BANK_CODE.slice(1) : BANK_CODE
  const bank = await client.fetch<any>(
    `*[_type == "accountCode" && !(_id in path("drafts.**")) && type == "asset" && code == $code && isActive != false][0]{ _id, code }`,
    { code: storedBank },
  )
  if (!bank) {
    console.error(`✗ ABORT — bank account ${BANK_CODE} not found`)
    process.exit(1)
  }
  console.log(`✓ bank: ${bank._id} (code ${bank.code})`)

  // 5. Build + create payment doc (published)
  const executionNotes = [NOTES, `Vendor invoice: ${INVOICE}`].filter(Boolean).join('\n')
  const paymentDoc: Record<string, unknown> = {
    _type: 'payment',
    paymentMode: 'service_contract_payment',
    paymentNumber,
    paymentStatus: 'created',
    linkedServiceContract: { _type: 'reference', _ref: sc._id },
    vendor: { _type: 'reference', _ref: sc.vendorRef },
    currency: 'THB',
    vatType: VAT_TYPE,
    vatAmount: VAT_AMOUNT,
    paymentType: PAYMENT_TYPE,
    paymentAmount: GROSS_AMOUNT,
    paidAmount: GROSS_AMOUNT,
    paymentDate: RECEIPT_DATE,
    paymentMethodDetails: INVOICE,
    executionNotes,
    receipts: [],
    withholdingTaxRate: 'none',
    conditionMet: false,
    isSettled: false,
    bankAccount: { _type: 'reference', _ref: bank._id },
  }
  if (sc.glRef) paymentDoc.accountCode = { _type: 'reference', _ref: sc.glRef }

  const created = await client.create(paymentDoc as any)
  const paymentId = created._id
  console.log(`✓ Payment created (published): ${paymentNumber}  id=${paymentId}`)

  // 6. Append billing entry to SC
  const billingEntry = {
    _key: randomKey(),
    _type: 'billingEntry',
    payment: { _type: 'reference', _ref: paymentId },
    servicePeriodStart: PERIOD_START,
    servicePeriodEnd: PERIOD_END,
  }
  await client.patch(sc._id).setIfMissing({ payments: [] }).append('payments', [billingEntry]).commit({ autoGenerateArrayKeys: false })
  console.log(`✓ Billing entry appended to SC ${sc._id} (period ${PERIOD_START} – ${PERIOD_END})`)

  // 7. Upload receipt asset
  if (!fs.existsSync(RECEIPT_FILE)) {
    console.error(`✗ Receipt file not found: ${RECEIPT_FILE}`)
    console.error(`  Payment was created but no receipt attached. You can run uploadReceiptToPayment.ts later.`)
    process.exit(1)
  }
  console.log(`Uploading ${path.basename(RECEIPT_FILE)}…`)
  const asset = await client.assets.upload(
    'image',
    fs.createReadStream(RECEIPT_FILE),
    { filename: path.basename(RECEIPT_FILE), contentType: 'image/jpeg' },
  )
  console.log(`✓ Asset uploaded: ${asset._id}`)

  // 8. Append receipt to draft
  const draftId = `drafts.${paymentId}`
  // create draft from published
  const { _rev, _updatedAt, _createdAt, ...rest } = (await client.getDocument<any>(paymentId)) as any
  void _rev; void _updatedAt; void _createdAt
  await client.createOrReplace({ ...rest, _id: draftId })
  await client.patch(draftId).setIfMissing({ receipts: [] }).append('receipts', [{
    _key: randomKey(),
    _type: 'receipt',
    file: { _type: 'file', asset: { _type: 'reference', _ref: asset._id } },
    receiptDate: RECEIPT_DATE,
    invoiceNumber: INVOICE,
  }]).commit({ autoGenerateArrayKeys: false })
  console.log(`✓ Receipt added to draft`)

  // Publish: copy draft → published, drop draft
  const updated = await client.getDocument<any>(draftId) as any
  const { _rev: r2, _updatedAt: u2, _createdAt: c2, _id: _ig, ...rest2 } = updated
  void r2; void u2; void c2
  await client.transaction()
    .createOrReplace({ ...rest2, _id: paymentId })
    .delete(draftId)
    .commit()
  console.log(`✓ Published`)

  // Final summary
  console.log(`\n=== DONE ===`)
  console.log(`paymentNumber: ${paymentNumber}`)
  console.log(`paymentId    : ${paymentId}`)
  console.log(`invoice      : ${INVOICE}`)
  console.log(`receipt asset: ${asset._id}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
