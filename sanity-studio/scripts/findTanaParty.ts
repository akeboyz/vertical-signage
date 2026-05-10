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
  const token = process.env.SANITY_WRITE_TOKEN!
  const client = createClient({
    projectId: 'awjj9g8u', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false,
  })

  console.log('=== Search by ธนา (Thai) ===')
  const r1 = await client.fetch<any[]>(
    `*[_type=="party" && !(_id in path("drafts.**")) && (
        legalName_th match "*ธนา*" ||
        legalName_en match "*ธนา*" ||
        firstName    match "*ธนา*" ||
        lastName     match "*ธนา*" ||
        shortName    match "*ธนา*"
      )]{ _id, legalName_th, legalName_en, firstName, lastName, shortName, identityType, partyRole }`,
  )
  console.log(JSON.stringify(r1, null, 2))

  console.log('\n=== Search by เข็มทอง ===')
  const r2 = await client.fetch<any[]>(
    `*[_type=="party" && !(_id in path("drafts.**")) && (
        legalName_th match "*เข็มทอง*" ||
        legalName_en match "*เข็มทอง*" ||
        lastName     match "*เข็มทอง*"
      )]{ _id, legalName_th, legalName_en, firstName, lastName, shortName }`,
  )
  console.log(JSON.stringify(r2, null, 2))

  console.log('\n=== Find party from existing payments with vendorName="ธนา เข็มทอง" ===')
  const r3 = await client.fetch<any[]>(
    `*[_type=="payment" && vendorName=="ธนา เข็มทอง"][0..3]{
      _id, paymentNumber, vendorName,
      "vendorRef": vendor._ref,
      "vendor": vendor->{_id, legalName_th, legalName_en, firstName, lastName, shortName, identityType}
    }`,
  )
  console.log(JSON.stringify(r3, null, 2))

  // Also search payments by paidAmount near 6000 around 26-Feb-26 to verify xlsx data
  console.log('\n=== xlsx-side: payments dated 2026-02-26 ===')
  const feb26 = await client.fetch<any[]>(
    `*[_type=="payment" && paymentDate=="2026-02-26"]{
      _id, paymentNumber, paidAmount, "vendor": vendor->{_id, legalName_th, firstName, lastName}
    }`,
  )
  console.log(JSON.stringify(feb26, null, 2))
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
