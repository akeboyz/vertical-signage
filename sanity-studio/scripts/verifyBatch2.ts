#!/usr/bin/env node
/**
 * Verify state of batch 2 receipts after stuck run.
 */

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

  const targets = [
    { id: '9920519', invoice: 'RFTKBKO29122025000007497', expectedPaymentId: 'Aw0ws0oWa8IaFM3iIfKwZC' },
    { id: '9920523', invoice: 'B041210002A4499-9543',     expectedPaymentId: 'iG7LJCIXmUyigSDTD0eGGe' },
    { id: '9920525', invoice: 'B041210002A4499-RnC203015', expectedPaymentId: null },
  ]

  console.log('=== Batch 2 status ===\n')
  for (const t of targets) {
    console.log(`--- ${t.id} (${t.invoice}) ---`)
    // Search by invoice in paymentMethodDetails or receipts.invoiceNumber
    const matches = await client.fetch<any[]>(
      `*[_type=="payment" && (paymentMethodDetails == $inv || $inv in receipts[].invoiceNumber)]{
        _id,
        paymentNumber,
        paymentDate,
        paymentMethodDetails,
        "receiptCount": count(receipts),
        "receipts": receipts[]{ invoiceNumber, "asset": file.asset._ref }
      }`,
      { inv: t.invoice },
    )
    console.log(`  Found ${matches.length} payment(s):`)
    for (const m of matches) {
      const isDraft = String(m._id).startsWith('drafts.')
      console.log(`    ${isDraft ? '⚠ DRAFT' : '✓ pub'}  ${m.paymentNumber}  id=${m._id}  receipts=${m.receiptCount}`)
      for (const r of (m.receipts ?? [])) {
        console.log(`       · inv=${r.invoiceNumber}  asset=${r.asset}`)
      }
    }
    if (t.expectedPaymentId) {
      const draft = await client.getDocument<any>(`drafts.${t.expectedPaymentId}`)
      const pub   = await client.getDocument<any>(t.expectedPaymentId)
      console.log(`  Expected paymentId ${t.expectedPaymentId}:  draft=${draft ? 'yes' : 'no'}  pub=${pub ? 'yes' : 'no'}`)
    }
  }

  // Also check SC billing entries
  console.log('\n=== SC billing entries ===')
  for (const vcn of ['0953625487', '9609113543']) {
    const sc = await client.fetch<any>(
      `*[_type=="serviceContract" && vendorContractNo==$no && !(_id in path("drafts.**"))][0]{
        _id, serviceName, "billingCount": count(payments),
        "billings": payments[]{
          servicePeriodStart, servicePeriodEnd,
          "paymentNumber": payment->paymentNumber,
          "paymentInv":    payment->paymentMethodDetails
        }
      }`,
      { no: vcn },
    )
    console.log(`\n  ${vcn} → ${sc?._id}  (${sc?.serviceName})  billings=${sc?.billingCount}`)
    for (const b of (sc?.billings ?? [])) {
      console.log(`    · ${b.servicePeriodStart} – ${b.servicePeriodEnd}  ${b.paymentNumber}  inv=${b.paymentInv}`)
    }
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
