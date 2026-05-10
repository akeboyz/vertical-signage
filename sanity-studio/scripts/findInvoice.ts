#!/usr/bin/env node
/**
 * Search globally across all payments (drafts + published) for any reference
 * to the invoice number provided as the only argument, AND for any payment
 * tied to the AIS WIFI 8806489507 contract.
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

  const INVOICE = 'W-CS-1179-6903-10001288'
  const VCN     = '8806489507'

  // 1. Any payment doc (draft or published) that mentions this invoice number?
  const byInvoice = await client.fetch<any[]>(
    `*[_type=="payment" && (
        paymentMethodDetails == $inv ||
        $inv in receipts[].invoiceNumber ||
        executionNotes match $invMatch
      )]{
      _id, paymentNumber, paymentDate, paymentMethodDetails,
      "receiptInvs": receipts[].invoiceNumber,
      executionNotes
    }`,
    { inv: INVOICE, invMatch: `*${INVOICE}*` },
  )

  console.log(`=== Search for invoice "${INVOICE}" ===`)
  console.log(`Found ${byInvoice.length} matching payment(s)\n`)
  console.log(JSON.stringify(byInvoice, null, 2))

  // 2. ALL payments tied to AIS WIFI 8806489507 (via linkedServiceContract)
  const sc = await client.fetch<any>(
    `*[_type=="serviceContract" && vendorContractNo==$no && !(_id in path("drafts.**"))][0]{ _id, serviceName }`,
    { no: VCN },
  )
  console.log(`\n=== All payments linked to AIS WIFI ${VCN} (SC ${sc?._id}) ===`)

  const byContract = await client.fetch<any[]>(
    `*[_type=="payment" && linkedServiceContract._ref==$scId]{
      _id, paymentNumber, paymentDate, paymentMethodDetails,
      "receiptInvs": receipts[].invoiceNumber
    } | order(paymentDate asc)`,
    { scId: sc?._id ?? '__none__' },
  )
  console.log(`Found ${byContract.length} payment(s)`)
  for (const p of byContract) {
    console.log(`  ${p.paymentNumber}  date=${p.paymentDate}  inv=${p.paymentMethodDetails}  receiptsInvs=${JSON.stringify(p.receiptInvs)}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
