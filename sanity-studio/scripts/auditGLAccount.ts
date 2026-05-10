#!/usr/bin/env node
/**
 * Audit GL Account propagation: for every payment created in this batch,
 * compare the SC's glAccount with the payment's accountCode.
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

  const ids = [
    'iG7LJCIXmUyigSDTCzZwni', // PMT-2603-003
    'iG7LJCIXmUyigSDTCzZxhq', // PMT-2603-004
    'OE33piSrLEszcsMfQL0Z0R', // PMT-2603-005
    'OE33piSrLEszcsMfQL0bsZ', // PMT-2603-006
    'OE33piSrLEszcsMfQL0cvL', // PMT-2603-007
    'iG7LJCIXmUyigSDTCza0Uu', // PMT-2603-008
    'iG7LJCIXmUyigSDTCza1IU', // PMT-2603-009
    '6l24C1m7XGGg4Nx1XQCbYO', // PMT-2603-010
    'OE33piSrLEszcsMfQL0NNp', // PMT-2604-007
  ]

  const rows = await client.fetch<any[]>(
    `*[_id in $ids]{
      _id,
      paymentNumber,
      paymentMethodDetails,
      "scId":          linkedServiceContract->_id,
      "scName":        linkedServiceContract->serviceName,
      "scVendorNo":    linkedServiceContract->vendorContractNo,
      "scGLAccount":   linkedServiceContract->glAccount->{_id, code},
      "paymentGLAccount": accountCode->{_id, code}
    } | order(paymentNumber asc)`,
    { ids },
  )

  console.log('=== Payment ↔ SC ↔ GL Account audit ===\n')
  console.log('PMT-No        SC vendorNo   SC name                 SC GL  →  Payment GL  match?')
  console.log('-'.repeat(110))
  for (const r of rows) {
    const scGL = r.scGLAccount?.code ?? '—'
    const pmGL = r.paymentGLAccount?.code ?? '—'
    const match = scGL === pmGL ? '✓' : '✗ MISMATCH'
    const num = (r.paymentNumber ?? '').padEnd(13)
    const v   = (r.scVendorNo ?? '').padEnd(13)
    const n   = (r.scName ?? '(unnamed)').padEnd(23)
    console.log(`${num} ${v} ${n} ${scGL.padEnd(6)} →  ${pmGL.padEnd(11)} ${match}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
