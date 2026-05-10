#!/usr/bin/env node
/**
 * Step 2: Create the 2 missing Service Contracts as PUBLISHED documents.
 *  - TRUE Mobile 0855544234 (vendor: True Move H)
 *  - AIS 0657278851       (vendor: Advanced Wireless Network)
 *
 * Idempotent: if a published SC with that vendorContractNo already exists, it
 * is reported and skipped.
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

const PROJECT_ID = 'awjj9g8u'
const DATASET = 'production'
const API_VERSION = '2024-01-01'

const TRUE_VENDOR_ID = '095775a0-8a98-4e03-b42f-ed497dd2979e'
const AIS_VENDOR_ID  = '7da8c6df-4c20-4fea-8333-2e283ee363cb'

interface NewSC {
  vendorContractNo: string
  vendorRef: string
  startDate: string
  serviceName: string
  notes: string
}

const targets: NewSC[] = [
  {
    vendorContractNo: '0855544234',
    vendorRef: TRUE_VENDOR_ID,
    startDate: '2026-04-01',
    serviceName: 'TRUE Mobile 0855544234 (test phone)',
    notes: 'Test phone — added retroactively from receipt batch.',
  },
  {
    vendorContractNo: '0657278851',
    vendorRef: AIS_VENDOR_ID,
    startDate: '2025-07-15',
    serviceName: 'AIS Mobile 0657278851 (test phone)',
    notes: 'Test phone — added retroactively from receipt batch (2025-07 to 2025-10).',
  },
]

function randomKey(len = 16): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function main() {
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) { console.error('NO TOKEN'); process.exit(1) }

  const client = createClient({
    projectId: PROJECT_ID,
    dataset: DATASET,
    apiVersion: API_VERSION,
    token,
    useCdn: false,
  })

  const created: { vendorContractNo: string; _id: string; status: string }[] = []

  for (const t of targets) {
    // Idempotency: published SC for this vendorContractNo?
    const existing = await client.fetch<{ _id: string } | null>(
      `*[_type=="serviceContract"
          && vendorContractNo==$no
          && !(_id in path("drafts.**"))
        ][0]{ _id }`,
      { no: t.vendorContractNo },
    )

    if (existing) {
      console.log(`✓ ${t.vendorContractNo} already exists: ${existing._id} (skip)`)
      created.push({ vendorContractNo: t.vendorContractNo, _id: existing._id, status: 'skipped' })
      continue
    }

    // Create as PUBLISHED (no drafts. prefix)
    const _id = randomKey(16)
    const doc: any = {
      _id,
      _type: 'serviceContract',
      vendor: { _type: 'reference', _ref: t.vendorRef },
      vendorContractNo: t.vendorContractNo,
      serviceName: t.serviceName,
      serviceType: 'internet',
      paymentFrequency: 'monthly',
      paymentMethod: 'bank_transfer',
      amountPerPeriod: 699,
      autoRenewal: false,
      isSuspended: false,
      startDate: t.startDate,
      customFields: [
        {
          _key: crypto.randomBytes(4).toString('hex'),
          _type: 'customField',
          key: 'note',
          value: t.notes,
        },
      ],
    }

    const r = await client.create(doc)
    console.log(`+ Created ${t.vendorContractNo}: ${r._id}`)
    created.push({ vendorContractNo: t.vendorContractNo, _id: r._id, status: 'created' })
  }

  console.log('\n=== RESULT ===')
  console.log(JSON.stringify(created, null, 2))
}

main().catch(err => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
