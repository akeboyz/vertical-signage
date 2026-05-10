#!/usr/bin/env node
/**
 * Final verification — print published state of all 14 payments touched in
 * Steps 1–6, plus the 2 service contracts created in Step 2.
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

  const allIds = [
    // Step 1 (9)
    'OE33piSrLEszcsMfQL0NNp', 'iG7LJCIXmUyigSDTCzZwni', 'iG7LJCIXmUyigSDTCzZxhq',
    'OE33piSrLEszcsMfQL0Z0R', 'OE33piSrLEszcsMfQL0bsZ', 'OE33piSrLEszcsMfQL0cvL',
    'iG7LJCIXmUyigSDTCza0Uu', 'iG7LJCIXmUyigSDTCza1IU', '6l24C1m7XGGg4Nx1XQCbYO',
    // Step 3+5 (4)
    'OE33piSrLEszcsMfQMOQF9', 'Aw0ws0oWa8IaFM3iIbvtw2',
    'OE33piSrLEszcsMfQMOVb7', 'iG7LJCIXmUyigSDTCzuT5a',
    // Step 6
    '4a2c38ab-90c7-423c-a321-df35a3723d22',
  ]

  const payments = await client.fetch<any[]>(
    `*[_id in $ids]{
      _id,
      _type,
      paymentNumber,
      grossAmount,
      paymentDate,
      "receiptCount": count(receipts),
      "receipts": receipts[]{ receiptDate, invoiceNumber, "asset": file.asset._ref }
    } | order(paymentNumber asc)`,
    { ids: allIds },
  )

  console.log('=== PAYMENTS (published) ===')
  console.log(`Found ${payments.length} of ${allIds.length} expected`)
  for (const p of payments) {
    const isDraft = String(p._id).startsWith('drafts.')
    console.log(`\n${isDraft ? '⚠ DRAFT' : '✓ pub'}  ${p.paymentNumber ?? '(no#)'}  id=${p._id}  amt=${p.grossAmount}  date=${p.paymentDate}  receipts=${p.receiptCount}`)
    for (const r of (p.receipts ?? [])) {
      console.log(`     · ${r.receiptDate}  inv=${r.invoiceNumber}  asset=${r.asset}`)
    }
  }

  // Drafts that should not exist
  const drafts = await client.fetch<any[]>(
    `*[_id in $draftIds]{ _id, paymentNumber }`,
    { draftIds: allIds.map(id => `drafts.${id}`) },
  )
  console.log(`\n=== Lingering drafts: ${drafts.length} ===`)
  for (const d of drafts) console.log(`  - ${d._id}  (${d.paymentNumber})`)

  // Service contracts
  const scs = await client.fetch<any[]>(
    `*[_type=="serviceContract" && vendorContractNo in ["0855544234","0657278851"]]{
      _id, vendorContractNo, serviceName, amountPerPeriod, startDate
    }`
  )
  console.log(`\n=== Service Contracts (Step 2): ${scs.length} ===`)
  for (const sc of scs) {
    const isDraft = String(sc._id).startsWith('drafts.')
    console.log(`${isDraft ? '⚠ DRAFT' : '✓ pub'}  ${sc.vendorContractNo}  ${sc.serviceName}  amt=${sc.amountPerPeriod}  start=${sc.startDate}  id=${sc._id}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
