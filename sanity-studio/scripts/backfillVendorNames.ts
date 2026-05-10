#!/usr/bin/env node
/**
 * backfillVendorNames.ts
 *
 * Populates the hidden `vendorName` scalar on every published Payment document
 * that has a vendor reference but no vendorName yet.
 *
 * This is needed once because VendorWithNameCacheInput only patches the draft,
 * so all payments created before the field was added have vendorName = undefined,
 * making vendor-name search return no results.
 *
 * After running this script, the Payment list search will find documents by
 * vendor name (e.g. "Advanced" matches "Advanced Wireless Network").
 *
 * ── Run ──────────────────────────────────────────────────────────────────────
 * npx tsx scripts/backfillVendorNames.ts
 *
 * Optional flags:
 *   --dry-run   Print what would be patched without writing anything
 *   --force     Re-patch even documents that already have vendorName
 *
 * ── Environment ──────────────────────────────────────────────────────────────
 * SANITY_WRITE_TOKEN  set in .env.local or exported before running
 */

import { createClient } from '@sanity/client'
import * as fs          from 'fs'
import * as path        from 'path'

// ── Env loader ───────────────────────────────────────────────────────────────

function loadEnvFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key   = trimmed.slice(0, eqIdx).trim()
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = value
    }
  } catch { /* optional */ }
}

loadEnvFile(path.resolve(__dirname, '..', '.env.local'))
loadEnvFile(path.resolve(process.cwd(), '.env.local'))

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv   = process.argv.slice(2)
  const dryRun = argv.includes('--dry-run')
  const force  = argv.includes('--force')

  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) {
    console.error(`
SANITY_WRITE_TOKEN is not set.
Add it to .env.local or: export SANITY_WRITE_TOKEN=skXXXXX
`)
    process.exit(1)
  }

  const client = createClient({
    projectId:  'awjj9g8u',
    dataset:    'production',
    apiVersion: '2024-01-01',
    token,
    useCdn:     false,
  })

  if (dryRun) console.log('\n[DRY RUN] No changes will be written.\n')

  // ── Fetch all published payments with a vendor ref ────────────────────────

  const filter = force
    ? `*[_type == "payment" && !(_id in path("drafts.**")) && defined(vendor._ref)]`
    : `*[_type == "payment" && !(_id in path("drafts.**")) && defined(vendor._ref) && !defined(vendorName)]`

  type PaymentRow = { _id: string; vendorRef: string }
  const payments = await client.fetch<PaymentRow[]>(
    `${filter}{ _id, "vendorRef": vendor._ref }`
  )

  console.log(`Found ${payments.length} payment(s) to backfill.\n`)

  if (payments.length === 0) {
    console.log('Nothing to do.')
    return
  }

  // ── Collect all unique party IDs ──────────────────────────────────────────

  const partyIds = [...new Set(payments.map(p => p.vendorRef))]

  type PartyRow = { _id: string; shortName?: string; legalName_en?: string; legalName_th?: string }
  const parties = await client.fetch<PartyRow[]>(
    `*[_id in $ids]{ _id, shortName, legalName_en, legalName_th }`,
    { ids: partyIds }
  )

  const nameMap = new Map<string, string>()
  for (const p of parties) {
    const name = p.shortName ?? p.legalName_en ?? p.legalName_th
    if (name) nameMap.set(p._id, name)
  }

  // ── Patch each payment ────────────────────────────────────────────────────

  let patched   = 0
  let skipped   = 0
  let errors    = 0

  for (const pmt of payments) {
    const name = nameMap.get(pmt.vendorRef)
    if (!name) {
      console.log(`  ↩  ${pmt._id}  (party ${pmt.vendorRef} has no name — skipped)`)
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`  ~  ${pmt._id}  → vendorName = "${name}"`)
      patched++
      continue
    }

    try {
      // Patch the published document directly (not the draft) so the search
      // index sees the value without requiring a re-publish.
      await client.patch(pmt._id).set({ vendorName: name }).commit()

      // Also patch the draft if one exists, so sort/search stays consistent
      // before the user re-publishes.
      const draftId = `drafts.${pmt._id}`
      const draft   = await client.getDocument(draftId)
      if (draft) {
        await client.patch(draftId).set({ vendorName: name }).commit()
      }

      console.log(`  ✓  ${pmt._id}  → "${name}"`)
      patched++
    } catch (err: any) {
      console.error(`  ✗  ${pmt._id}  — ${err?.message ?? err}`)
      errors++
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`
── Result ──────────────────────────────────────
   Patched : ${patched}${dryRun ? '  (dry run)' : ''}
   Skipped : ${skipped}  (party has no name)
   Errors  : ${errors}
────────────────────────────────────────────────`)

  if (errors > 0) process.exit(1)
}

main().catch(err => {
  console.error('\nFatal error:', err?.message ?? err)
  process.exit(1)
})
