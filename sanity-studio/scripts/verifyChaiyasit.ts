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

  const PARTY_ID = '795381172669adb2'
  const ps = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**")) && vendor._ref==$id]{
      _id, paymentNumber, paymentDate, paidAmount, "bank": bankAccount->code, "gl": accountCode->code, paymentMethodDetails
    } | order(paymentDate asc)`,
    { id: PARTY_ID },
  )
  console.log(`Chaiyasit payments: ${ps.length}`)
  for (const p of ps) {
    console.log(`  ${p.paymentNumber}  ${p.paymentDate}  ${p.paidAmount}  bank=${p.bank}  gl=${p.gl}  ref=${p.paymentMethodDetails ?? '-'}`)
  }
}
main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
