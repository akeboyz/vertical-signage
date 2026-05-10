#!/usr/bin/env node
/**
 * Discover all paymentMode values and counts in Sanity, plus list every
 * non-SC payment so we can match them too.
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

  // Mode counts (published only)
  const modes = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))]{ paymentMode } | { "modes": *[_type=="payment" && !(_id in path("drafts.**"))].paymentMode }`,
  )

  // Simpler — list all payments
  const allPayments = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, paymentMode,
      "vendorName": vendor->shortName,
      "vendorEn": vendor->legalName_en,
      "scName": linkedServiceContract->serviceName,
      "rentContractId": linkedRentContract._ref,
      "procurementId":  linkedProcurement._ref,
      paymentMethodDetails,
      executionNotes
    } | order(paymentDate asc)`,
  )

  console.log(`Total published payments: ${allPayments.length}`)

  const byMode: Record<string, any[]> = {}
  for (const p of allPayments) {
    const m = p.paymentMode ?? '(unset)'
    byMode[m] = byMode[m] || []
    byMode[m].push(p)
  }

  console.log(`\n=== Payments by mode ===`)
  for (const [mode, list] of Object.entries(byMode)) {
    console.log(`\n  ${mode}: ${list.length}`)
    for (const p of list) {
      const t = (Number(p.paidAmount ?? 0) + Number(p.vatAmount ?? 0)).toFixed(2)
      const vendor = p.vendorName ?? p.vendorEn ?? '?'
      const linked = p.scName ?? (p.rentContractId ? `rent:${p.rentContractId}` : '') ?? (p.procurementId ? `proc:${p.procurementId}` : '')
      console.log(`    ${p.paymentNumber}  ${p.paymentDate}  ${vendor}  total=${t}  link=${linked}  inv=${p.paymentMethodDetails ?? '-'}`)
    }
  }

  // Drafts too — in case there are payment drafts that haven't been published
  const drafts = await client.fetch<any[]>(
    `*[_type=="payment" && _id in path("drafts.**")]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, paymentMode
    }`,
  )
  console.log(`\n=== Draft payments: ${drafts.length} ===`)
  for (const d of drafts) {
    console.log(`  ${d._id}  ${d.paymentNumber ?? '(no#)'}  ${d.paymentDate}  mode=${d.paymentMode}  paid=${d.paidAmount}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
