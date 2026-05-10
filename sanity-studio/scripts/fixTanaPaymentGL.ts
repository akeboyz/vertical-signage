#!/usr/bin/env node
/**
 * Patch the 2 new ธนา เข็มทอง payments to use the correct GL:
 *   PMT-2601-009 + PMT-2602-003 → accountCode = 115101 Signage devices (cost)
 * (matching the existing PMT-2508-001 / 2511-002 / 2511-007 pattern)
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

const SIGNAGE_DEVICES_COST_GL = 'N14pklU3DF6lmMiukU7ay8'   // 115101 / 15101 stored

const TARGETS = ['PMT-2601-009', 'PMT-2602-003']

async function main() {
  const token = process.env.SANITY_WRITE_TOKEN!
  const client = createClient({
    projectId: 'awjj9g8u', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false,
  })

  // Verify the GL exists
  const gl = await client.fetch<any>(
    `*[_id==$id][0]{ _id, code, nameEn, type }`,
    { id: SIGNAGE_DEVICES_COST_GL },
  )
  if (!gl) { console.error(`GL ${SIGNAGE_DEVICES_COST_GL} not found`); process.exit(1) }
  console.log(`Target GL: ${gl.code}  ${gl.nameEn}  (${gl.type})  id=${gl._id}`)

  for (const num of TARGETS) {
    const docs = await client.fetch<any[]>(
      `*[_type=="payment" && paymentNumber==$num]{ _id, "currentGL": accountCode->code }`,
      { num },
    )
    console.log(`\n${num}: ${docs.length} doc(s)`)
    for (const d of docs) {
      console.log(`  ${d._id}  current GL=${d.currentGL}`)
      await client.patch(d._id).set({
        accountCode: { _type: 'reference', _ref: SIGNAGE_DEVICES_COST_GL },
      }).commit()
      console.log(`  ✓ patched to ${gl.code}`)
    }
  }

  // Final verify
  console.log('\n=== Final verify ===')
  const after = await client.fetch<any[]>(
    `*[_type=="payment" && paymentNumber in $nums]{
      paymentNumber, "glCode": accountCode->code, "glName": accountCode->nameEn
    } | order(paymentNumber asc)`,
    { nums: TARGETS },
  )
  for (const a of after) console.log(`  ${a.paymentNumber}  gl=${a.glCode} ${a.glName}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
