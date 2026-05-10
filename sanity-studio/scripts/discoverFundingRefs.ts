#!/usr/bin/env node
/**
 * Discovery for funding record creation:
 *   1. Existing party docs that could match Shareholder 1 / 2
 *   2. Bank GL accounts (type=asset) — try to match xlsx 4222730983 / 2198618716
 *   3. Equity GL accounts (Paid-up Capital, etc.)
 *   4. Liability GL accounts for shareholder loans
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

  // 1. Existing parties with shareholder-ish info
  console.log('=== Parties (potential shareholders) ===')
  const parties = await client.fetch<any[]>(
    `*[_type=="party" && !(_id in path("drafts.**")) && (
        "shareholder" in partyRole ||
        legalName_en match "*hareholder*" ||
        legalName_th match "*ผู้ถือหุ้น*" ||
        legalName_en match "*akchai*" ||
        legalName_en match "*aksorn*"
      )]{ _id, legalName_th, legalName_en, identityType, partyRole }`,
  )
  console.log(JSON.stringify(parties, null, 2))

  // 2. Bank accounts (type=asset)
  console.log('\n\n=== Bank GL Accounts (type=asset) ===')
  const banks = await client.fetch<any[]>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="asset" && isActive!=false]{
      _id, code, nameTh, nameEn, normalBalance,
      "parentCode": parentCode->code,
      "parentName": parentCode->nameEn
    } | order(code asc)`,
  )
  console.log(`Found ${banks.length} asset accounts`)
  for (const b of banks) {
    console.log(`  code=${b.code}  ${b.nameEn ?? '?'}  /  ${b.nameTh ?? '?'}  parent=${b.parentCode ?? '-'}  id=${b._id}`)
  }

  // 3. Equity GL accounts
  console.log('\n\n=== Equity GL Accounts (type=equity) ===')
  const equity = await client.fetch<any[]>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="equity" && isActive!=false]{
      _id, code, nameTh, nameEn, normalBalance,
      "parentCode": parentCode->code
    } | order(code asc)`,
  )
  console.log(`Found ${equity.length} equity accounts`)
  for (const e of equity) {
    console.log(`  code=${e.code}  ${e.nameEn ?? '?'}  /  ${e.nameTh ?? '?'}  parent=${e.parentCode ?? '-'}  id=${e._id}`)
  }

  // 4. Liability GL accounts (for shareholder loans)
  console.log('\n\n=== Liability GL Accounts (type=liability) ===')
  const liabilities = await client.fetch<any[]>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="liability" && isActive!=false]{
      _id, code, nameTh, nameEn, normalBalance,
      "parentCode": parentCode->code
    } | order(code asc)`,
  )
  console.log(`Found ${liabilities.length} liability accounts`)
  for (const l of liabilities) {
    console.log(`  code=${l.code}  ${l.nameEn ?? '?'}  /  ${l.nameTh ?? '?'}  parent=${l.parentCode ?? '-'}  id=${l._id}`)
  }

  // 5. Output JSON file for easy parsing
  const dump = {
    parties,
    banks,
    equity,
    liabilities,
  }
  const outPath = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account/funding_refs.json'
  fs.writeFileSync(outPath, JSON.stringify(dump, null, 2), 'utf8')
  console.log(`\n✓ Wrote ${outPath}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
