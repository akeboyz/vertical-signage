#!/usr/bin/env node
/**
 * Investigate duplicate Service Contracts for TRUE SIM 0953625487.
 * Read-only — does NOT modify data.
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

  const VCN = '0953625487'

  // 1. All SC docs (drafts + published) with this vendorContractNo
  const docs = await client.fetch<any[]>(
    `*[_type=="serviceContract" && vendorContractNo==$no] | order(_createdAt asc){
      _id,
      _createdAt,
      _updatedAt,
      _rev,
      vendorContractNo,
      serviceName,
      serviceType,
      serviceSpecFields,
      "vendor": vendor->{_id, shortName, legalName_en},
      startDate,
      endDate,
      paymentFrequency,
      paymentMethod,
      amountPerPeriod,
      vatNote,
      autoRenewal,
      isSuspended,
      "glAccount": glAccount->{_id, code},
      "billingEntries": payments[]{
        _key,
        servicePeriodStart,
        servicePeriodEnd,
        "payment": payment->{_id, paymentNumber, paymentDate, paymentMethodDetails}
      },
      "billingCount": count(payments),
      "customFields": customFields[]{ key, value }
    }`,
    { no: VCN },
  )

  console.log(`\n=== Service Contracts with vendorContractNo == "${VCN}" ===`)
  console.log(`Found: ${docs.length}\n`)
  console.log(JSON.stringify(docs, null, 2))

  // 2. For each SC, find Payments that reference it via serviceContract ref
  console.log(`\n\n=== Payments referencing each SC (via serviceContract._ref) ===`)
  for (const sc of docs) {
    const bareId = String(sc._id).replace(/^drafts\./, '')
    const refingPayments = await client.fetch<any[]>(
      `*[_type=="payment" && serviceContract._ref==$id]{
        _id, paymentNumber, paymentDate, paymentMethodDetails, _createdAt
      } | order(paymentDate asc)`,
      { id: bareId },
    )
    console.log(`\n  ${sc._id}  →  ${refingPayments.length} payments`)
    for (const p of refingPayments) {
      console.log(`     ${p.paymentNumber}  ${p.paymentDate}  inv=${p.paymentMethodDetails}  paymentId=${p._id}`)
    }
  }

  // 3. Cross-check: were ANY SCs created/updated in the recent session window?
  //    The session created SCs for 0855544234 and 0657278851 (NOT 0953625487).
  //    Show recent SC creation timestamps for the whole project to spot anything.
  console.log(`\n\n=== Recent SC creations (last 7 days) ===`)
  const recent = await client.fetch<any[]>(
    `*[_type=="serviceContract" && _createdAt > now() - 60*60*24*7]
       | order(_createdAt desc)
       [0...20]{
      _id, _createdAt, vendorContractNo, serviceName
    }`,
  )
  console.log(JSON.stringify(recent, null, 2))
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
