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

  const TANA_PARTY_ID = '0e55dbcd-48c8-4cd9-bced-afea23d2f4b0'
  const payments = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**")) && vendor._ref==$id]{
      _id, paymentNumber, paymentDate, paidAmount, paymentMode,
      "glCode": accountCode->code,
      "glName": accountCode->nameEn,
      "bankCode": bankAccount->code
    } | order(paymentDate asc)`,
    { id: TANA_PARTY_ID },
  )
  console.log(`=== ธนา เข็มทอง payments (${payments.length}) ===`)
  for (const p of payments) {
    console.log(`  ${p.paymentNumber}  ${p.paymentDate}  ${p.paidAmount}  bank=${p.bankCode}  gl=${p.glCode} ${p.glName}`)
  }

  // Also list all expense GL accounts to see what should be used
  console.log(`\n=== All expense GL accounts ===`)
  const expenses = await client.fetch<any[]>(
    `*[_type=="accountCode" && !(_id in path("drafts.**")) && type=="expense" && isActive!=false]{
      _id, code, nameEn, nameTh
    } | order(code asc)`,
  )
  for (const e of expenses) console.log(`  ${e.code}  ${e.nameEn} / ${e.nameTh}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
