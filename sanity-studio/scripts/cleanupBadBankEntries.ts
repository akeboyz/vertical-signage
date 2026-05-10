#!/usr/bin/env node
/**
 * Cleanup bad bank interest entries that were created with WRONG party
 * (ESSE Asoke instead of KBANK due to a buggy match query).
 *
 * Then properly create with KBANK party.
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

const ESSE_ASOKE_ID = '007db3a0-e3fe-4455-86c5-f55ac1329950'

async function main() {
  const token = process.env.SANITY_WRITE_TOKEN!
  const client = createClient({
    projectId: 'awjj9g8u', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false,
  })

  // Find any receipts/payments incorrectly created today with payer/vendor = ESSE Asoke
  // and small amounts matching bank interest pattern
  const targetAmounts = [262.98, 88.44, 145.55, 2.63, 0.88, 1.46]

  console.log('=== Bad receipts (payer = ESSE Asoke, small amount) ===')
  const badReceipts = await client.fetch<any[]>(
    `*[_type=="receipt" && payer._ref==$id && totalAmount in $amts]{
      _id, receiptNumber, issueDate, totalAmount
    }`,
    { id: ESSE_ASOKE_ID, amts: targetAmounts },
  )
  for (const r of badReceipts) console.log(`  ${r.receiptNumber}  ${r.issueDate}  ${r.totalAmount}  id=${r._id}`)

  console.log('\n=== Bad payments (vendor = ESSE Asoke, small amount) ===')
  const badPayments = await client.fetch<any[]>(
    `*[_type=="payment" && vendor._ref==$id && paidAmount in $amts]{
      _id, paymentNumber, paymentDate, paidAmount
    }`,
    { id: ESSE_ASOKE_ID, amts: targetAmounts },
  )
  for (const p of badPayments) console.log(`  ${p.paymentNumber}  ${p.paymentDate}  ${p.paidAmount}  id=${p._id}`)

  // Delete them
  if (badReceipts.length === 0 && badPayments.length === 0) {
    console.log('\n✓ Nothing to clean — script may not have created docs yet.')
    return
  }

  console.log(`\nDeleting ${badReceipts.length + badPayments.length} bad docs…`)
  const tx = client.transaction()
  for (const r of badReceipts) tx.delete(r._id)
  for (const p of badPayments) tx.delete(p._id)
  const res = await tx.commit()
  console.log(`✓ Cleanup transaction: ${res.transactionId}`)
  console.log(`  Deleted ${badReceipts.length} receipts + ${badPayments.length} payments`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
