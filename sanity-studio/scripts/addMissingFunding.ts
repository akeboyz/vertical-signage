#!/usr/bin/env node
/**
 * Add the one missing funding record that was skipped by over-eager idempotency:
 *   2025-08-28 equity_injection 30,000 SH1 (the SECOND of two same-day entries)
 *
 * Refuses to add if there are already TWO matching records (idempotent).
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

const SH1_NAME              = 'Shareholder 1'
const BANK_ACCT1_4222730983 = 'xe1H5tZ2tAHPuL66DPdKqF'
const EQUITY_CALLEDUP       = 'N14pklU3DF6lmMiukUeZmu'

function randomKey(len = 16): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function generateFundingNumber(client: ReturnType<typeof createClient>, dateStr: string): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix    = `FND-${yearMonth}-`
  const existing  = await client.fetch<string[]>(`*[_type=="funding" && defined(fundingNumber)].fundingNumber`)
  const taken = new Set(existing ?? [])
  let seq = 1
  while (taken.has(`${prefix}${String(seq).padStart(3, '0')}`)) seq++
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

  // 1. Find Shareholder 1 party id
  const sh1 = await client.fetch<any>(
    `*[_type=="party" && legalName_en==$name][0]{ _id }`,
    { name: SH1_NAME },
  )
  if (!sh1) { console.error('Shareholder 1 not found'); process.exit(1) }
  const sh1Id = sh1._id

  // 2. Count existing matching records — refuse if already 2
  const existing = await client.fetch<any[]>(
    `*[_type=="funding"
        && !(_id in path("drafts.**"))
        && date == "2025-08-28"
        && amount == 30000
        && fundingType == "equity_injection"
        && party._ref == $partyId
      ]{ _id, fundingNumber }`,
    { partyId: sh1Id },
  )
  console.log(`Existing matching records: ${existing.length}`)
  for (const e of existing) console.log(`  ${e.fundingNumber}  ${e._id}`)
  if (existing.length >= 2) {
    console.log('✓ Already has 2+ records — nothing to add.')
    process.exit(0)
  }

  // 3. Create the second record
  const fundingNumber = await generateFundingNumber(client, '2025-08-28')
  const doc = {
    _type:          'funding',
    _id:            randomKey(16),
    fundingNumber,
    fundingType:    'equity_injection',
    direction:      'inflow',
    status:         'confirmed',
    date:           '2025-08-28',
    party:          { _type: 'reference', _ref: sh1Id },
    accountCode:    { _type: 'reference', _ref: EQUITY_CALLEDUP },
    bankAccount:    { _type: 'reference', _ref: BANK_ACCT1_4222730983 },
    amount:         30000,
    currency:       'THB',
    paymentMethod:  'transfer',
    internalNotes:  'Capital injection from shareholder (second of two same-day entries)',
  }

  const created = await client.create(doc as any)
  console.log(`+ Created ${fundingNumber}  id=${created._id}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
