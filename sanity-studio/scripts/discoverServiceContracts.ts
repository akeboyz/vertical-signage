#!/usr/bin/env node
/**
 * Discovery script — dump existing Service Contracts that may serve as templates
 * for creating the missing ones (0855544234 TRUE Mobile, 0657278851 AIS).
 *
 * Usage: npx tsx scripts/discoverServiceContracts.ts
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

  const targets = ['0632696849', '9609113543', '0953625487', '8806489507', '8806513068', '0855544234', '0657278851']
  const docs = await client.fetch<any[]>(
    `*[_type=="serviceContract" && vendorContractNo in $nos]{
      _id,
      vendorContractNo,
      serviceName,
      serviceType,
      serviceSpecFields,
      "vendor": vendor->{_id, shortName, legalName_en, legalName_th},
      vendorContractNo,
      startDate,
      endDate,
      paymentFrequency,
      amountPerPeriod,
      vatNote,
      paymentMethod,
      autoRenewal,
      noticePeriodDays,
      "glAccount": glAccount->{_id, code, accountName_en, accountName_th},
      isSuspended,
      "billingCount": count(payments),
    }`,
    { nos: targets }
  )

  console.log('=== Service Contracts found ===')
  console.log(JSON.stringify(docs, null, 2))

  console.log('\n=== Already exists for new IDs? ===')
  console.log('0855544234:', docs.find((d: any) => d.vendorContractNo === '0855544234') || 'NOT FOUND')
  console.log('0657278851:', docs.find((d: any) => d.vendorContractNo === '0657278851') || 'NOT FOUND')
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
