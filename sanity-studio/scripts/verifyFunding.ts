#!/usr/bin/env node
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

  const fundings = await client.fetch<any[]>(
    `*[_type=="funding" && !(_id in path("drafts.**"))]{
      _id, fundingNumber, fundingType, direction, status, date, amount,
      "partyName": party->legalName_en,
      "bankCode":  bankAccount->code,
      "glCode":    accountCode->code,
      bankReference
    } | order(date asc)`,
  )

  console.log(`=== Funding records: ${fundings.length} ===\n`)
  for (const f of fundings) {
    console.log(`  ${f.fundingNumber}  ${f.date}  ${f.direction}  ${f.fundingType}  ${Number(f.amount).toLocaleString()}  party=${f.partyName}  bank=${f.bankCode}  gl=${f.glCode}  ref=${f.bankReference ?? '-'}`)
  }

  // Also list shareholder parties
  const parties = await client.fetch<any[]>(
    `*[_type=="party" && !(_id in path("drafts.**")) && "shareholder" in partyRole]{
      _id, legalName_en, partyRole, identityType
    }`,
  )
  console.log(`\n=== Shareholder parties: ${parties.length} ===`)
  for (const p of parties) console.log(`  ${p._id}  ${p.legalName_en}  roles=${JSON.stringify(p.partyRole)}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
