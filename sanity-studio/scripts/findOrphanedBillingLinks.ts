#!/usr/bin/env node
/**
 * Find payments whose linkedServiceContract is set but the SC's payments[]
 * array (billing entries) doesn't contain a back-reference. Read-only.
 *
 * Reports both:
 *   - "broken" : payment.linkedServiceContract -> SC, but SC has no billing entry pointing back
 *   - "extra"  : SC has a billing entry pointing to a non-existent or unlinked payment
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

  // 1. All published SC payments with linkedServiceContract
  const payments = await client.fetch<any[]>(
    `*[_type=="payment"
        && !(_id in path("drafts.**"))
        && paymentMode=="service_contract_payment"
        && defined(linkedServiceContract._ref)
      ]{
      _id, paymentNumber, paymentDate, paymentMethodDetails,
      "scId": linkedServiceContract._ref,
      paidAmount
    } | order(paymentDate asc)`,
  )
  console.log(`Total SC payments: ${payments.length}\n`)

  // 2. All SCs with their billing entries (both bare + drafts so we can compare)
  const scs = await client.fetch<any[]>(
    `*[_type=="serviceContract"]{
      _id, vendorContractNo, serviceName,
      "isDraft": _id in path("drafts.**"),
      "billingPaymentRefs": payments[].payment._ref,
      "billings": payments[]{ _key, servicePeriodStart, servicePeriodEnd, "paymentRef": payment._ref }
    }`,
  )

  // Build lookup: SC bare-id  →  Set<paymentId> referenced in PUBLISHED billings
  const publishedSCBillings: Record<string, Set<string>> = {}
  const draftSCBillings:     Record<string, Set<string>> = {}
  const scInfo: Record<string, { vendorContractNo: string; serviceName: string }> = {}

  for (const sc of scs) {
    const bareId = String(sc._id).replace(/^drafts\./, '')
    const refs = new Set<string>((sc.billingPaymentRefs ?? []).filter((x: any) => x))
    if (sc.isDraft) draftSCBillings[bareId] = refs
    else            publishedSCBillings[bareId] = refs
    if (!sc.isDraft) scInfo[bareId] = { vendorContractNo: sc.vendorContractNo, serviceName: sc.serviceName }
  }

  // 3. Walk each payment, check whether its SC has a billing entry pointing back
  const broken: any[] = []
  const okPub: any[] = []
  for (const p of payments) {
    const scId = p.scId
    const pub  = publishedSCBillings[scId] ?? new Set()
    const drft = draftSCBillings[scId] ?? new Set()
    const inPub = pub.has(p._id)
    const inDraft = drft.has(p._id)
    if (!inPub) {
      broken.push({ ...p, scInfo: scInfo[scId] ?? null, inDraft })
    } else {
      okPub.push(p)
    }
  }

  console.log(`=== Orphaned Payments (no billing entry on PUBLISHED SC) ===`)
  console.log(`Found: ${broken.length}\n`)
  for (const b of broken) {
    console.log(`  ${b.paymentNumber ?? '(no#)'}  id=${b._id}  date=${b.paymentDate}  amount=${b.paidAmount}`)
    console.log(`     SC=${b.scId}  ${b.scInfo?.vendorContractNo ?? '?'}  ${b.scInfo?.serviceName ?? ''}`)
    console.log(`     invoice=${b.paymentMethodDetails}`)
    console.log(`     present-in-draft-SC: ${b.inDraft ? 'YES' : 'no'}`)
  }

  // 4. Also report extra billings (SC has billing entry pointing to non-existent or wrong-SC payment)
  console.log(`\n\n=== Stale billing entries (point to payment that doesn't link back) ===`)
  let staleCount = 0
  for (const sc of scs.filter((s: any) => !s.isDraft)) {
    const bareId = sc._id
    const billingRefs: string[] = sc.billingPaymentRefs ?? []
    const stale: string[] = []
    for (const ref of billingRefs) {
      if (!ref) continue
      const matchPayment = payments.find(p => p._id === ref)
      if (!matchPayment) {
        stale.push(`${ref} (payment doesn't exist or has different SC link)`)
        staleCount++
      } else if (matchPayment.scId !== bareId) {
        stale.push(`${ref} (links to different SC: ${matchPayment.scId})`)
        staleCount++
      }
    }
    if (stale.length > 0) {
      console.log(`  SC ${bareId}  ${sc.vendorContractNo}  ${sc.serviceName}:`)
      for (const s of stale) console.log(`     - ${s}`)
    }
  }
  if (staleCount === 0) console.log(`  (none)`)

  console.log(`\n=== Summary ===`)
  console.log(`  Total SC payments     : ${payments.length}`)
  console.log(`  OK (linked both ways) : ${okPub.length}`)
  console.log(`  Broken (orphan link)  : ${broken.length}`)
  console.log(`  Stale billing entries : ${staleCount}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
