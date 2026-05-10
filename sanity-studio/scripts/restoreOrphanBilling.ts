#!/usr/bin/env node
/**
 * Restore the missing billing entry on SC 25860dbe (AIS WIFI 8806489507)
 * pointing back to PMT-2601-005 (id 187d62b8-c230-4a9f-9b5b-4170356a4e01),
 * with period 2025-11-20 → 2025-12-24.
 *
 * Pre-checks: payment exists, SC exists, payment.linkedServiceContract→SC,
 * SC doesn't already have a billing entry for this payment.
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

const PAYMENT_ID    = '187d62b8-c230-4a9f-9b5b-4170356a4e01'
const SC_ID         = '25860dbe-e7cc-4caa-9494-e0cffe319fb2'
const PERIOD_START  = '2025-11-20'
const PERIOD_END    = '2025-12-24'

function randomKey(len = 8): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
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

  // 1. Validate payment
  const payment = await client.getDocument<any>(PAYMENT_ID)
  if (!payment) { console.error(`✗ Payment ${PAYMENT_ID} not found`); process.exit(1) }
  console.log(`✓ Payment found: ${payment.paymentNumber}  date=${payment.paymentDate}  amount=${payment.paidAmount}`)
  if (payment.linkedServiceContract?._ref !== SC_ID) {
    console.error(`✗ Payment.linkedServiceContract = ${payment.linkedServiceContract?._ref ?? 'null'}, expected ${SC_ID}`)
    process.exit(1)
  }
  console.log(`✓ Payment links to SC ${SC_ID}`)

  // 2. Validate SC + check current state
  const sc = await client.getDocument<any>(SC_ID)
  if (!sc) { console.error(`✗ SC ${SC_ID} not found`); process.exit(1) }
  console.log(`✓ SC: ${sc.serviceName}  vendorContractNo=${sc.vendorContractNo}`)

  const existingBillings: any[] = sc.payments ?? []
  console.log(`  current billing entries: ${existingBillings.length}`)
  for (const b of existingBillings) {
    console.log(`    - ${b.servicePeriodStart} – ${b.servicePeriodEnd}  paymentRef=${b.payment?._ref}`)
  }

  // 3. Idempotency
  const alreadyLinked = existingBillings.some(b => b?.payment?._ref === PAYMENT_ID)
  if (alreadyLinked) {
    console.log(`\n✓ Already restored — no action needed.`)
    process.exit(0)
  }

  // 4. Append billing entry
  const billingEntry = {
    _key: randomKey(),
    _type: 'billingEntry',
    payment: { _type: 'reference', _ref: PAYMENT_ID },
    servicePeriodStart: PERIOD_START,
    servicePeriodEnd:   PERIOD_END,
  }
  console.log(`\nAppending billing entry to SC ${SC_ID}…`)
  console.log(`  period: ${PERIOD_START} – ${PERIOD_END}`)
  console.log(`  payment ref: ${PAYMENT_ID}`)

  await client.patch(SC_ID).setIfMissing({ payments: [] }).append('payments', [billingEntry]).commit({ autoGenerateArrayKeys: false })

  // Also patch SC draft if one exists, so Studio shows the entry
  const draftId = `drafts.${SC_ID}`
  const draft = await client.getDocument<any>(draftId)
  if (draft) {
    console.log(`Draft SC exists — also patching draft.`)
    await client.patch(draftId).setIfMissing({ payments: [] }).append('payments', [{ ...billingEntry, _key: randomKey() }]).commit({ autoGenerateArrayKeys: false })
  }

  // 5. Verify
  const after = await client.getDocument<any>(SC_ID)
  const newBillings: any[] = after.payments ?? []
  console.log(`\n✓ Done. Billing entries now: ${newBillings.length}`)
  for (const b of newBillings) {
    const isNew = b?.payment?._ref === PAYMENT_ID ? '  ← new' : ''
    console.log(`    - ${b.servicePeriodStart} – ${b.servicePeriodEnd}  paymentRef=${b.payment?._ref}${isNew}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
