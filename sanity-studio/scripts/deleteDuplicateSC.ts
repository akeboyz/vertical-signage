#!/usr/bin/env node
/**
 * Delete the duplicate Service Contract for TRUE SIM 0953625487:
 *   _id = 4929e1ea-34ad-46ca-804f-9a4cf7e2b4d4
 *
 * Safety procedure (refuses to delete if anything is found referencing it):
 *   1. Check for any document referencing this _id (uses GROQ references()).
 *   2. Check for the draft cousin drafts.4929e1ea-34ad-46ca-804f-9a4cf7e2b4d4.
 *   3. Re-confirm the duplicate has 0 billing entries (no payments[] array).
 *   4. Confirm the OTHER SC (the one we keep) still exists and has its
 *      billing entry to PMT-2603-009 intact.
 *   5. Delete bare + draft (if present).
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

const TARGET_ID = '4929e1ea-34ad-46ca-804f-9a4cf7e2b4d4'
const DRAFT_ID  = `drafts.${TARGET_ID}`
const KEEP_ID   = '202c03a3-dd8e-4596-a653-359edcf3228b'

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

  // ── 1. Confirm target exists and has 0 billing entries ─────────────────
  const target = await client.getDocument<any>(TARGET_ID)
  if (!target) {
    console.error(`Target ${TARGET_ID} not found — already deleted?`)
    process.exit(1)
  }
  console.log(`Target found: ${target._id}  vendorContractNo=${target.vendorContractNo}`)
  const billingCount = Array.isArray(target.payments) ? target.payments.length : 0
  console.log(`  billing entries on target: ${billingCount}`)
  if (billingCount > 0) {
    console.error(`✗ ABORT — target has ${billingCount} billing entries; refusing to delete.`)
    process.exit(1)
  }

  // ── 2. Confirm the SC we keep is intact ─────────────────────────────────
  const keep = await client.getDocument<any>(KEEP_ID)
  if (!keep) {
    console.error(`✗ ABORT — KEEP SC ${KEEP_ID} is missing! Aborting to avoid losing both.`)
    process.exit(1)
  }
  const keepBilling = Array.isArray(keep.payments) ? keep.payments.length : 0
  console.log(`Keep SC ${KEEP_ID}: vendorContractNo=${keep.vendorContractNo}  billing entries=${keepBilling}`)
  if (keepBilling < 1) {
    console.error(`✗ ABORT — Keep SC has no billing entries (expected 1+). Refusing to delete the duplicate.`)
    process.exit(1)
  }

  // ── 3. References check (any doc anywhere referencing TARGET_ID) ───────
  // Sanity's references() finds direct or indirect refs by _id.
  const refs = await client.fetch<any[]>(
    `*[references($id)]{ _id, _type }`,
    { id: TARGET_ID },
  )
  console.log(`\nDocuments referencing ${TARGET_ID}: ${refs.length}`)
  for (const r of refs) console.log(`  - ${r._id}  (${r._type})`)
  if (refs.length > 0) {
    console.error(`\n✗ ABORT — target is referenced by ${refs.length} document(s); refusing to delete.`)
    process.exit(1)
  }

  // ── 4. Check draft cousin ──────────────────────────────────────────────
  const draft = await client.getDocument<any>(DRAFT_ID)
  console.log(`\nDraft cousin ${DRAFT_ID}: ${draft ? 'EXISTS' : 'absent'}`)
  if (draft) {
    const draftBilling = Array.isArray(draft.payments) ? draft.payments.length : 0
    console.log(`  draft billing entries: ${draftBilling}`)
    if (draftBilling > 0) {
      console.error(`✗ ABORT — draft cousin has billing entries. Refusing to delete.`)
      process.exit(1)
    }
    // References to draft id specifically
    const draftRefs = await client.fetch<any[]>(
      `*[references($id)]{ _id, _type }`,
      { id: DRAFT_ID },
    )
    if (draftRefs.length > 0) {
      console.error(`✗ ABORT — draft cousin referenced by ${draftRefs.length} doc(s).`)
      process.exit(1)
    }
  }

  // ── 5. Delete (bare first, then draft if present) ───────────────────────
  console.log(`\nDeleting ${TARGET_ID}…`)
  const tx = client.transaction()
  tx.delete(TARGET_ID)
  if (draft) tx.delete(DRAFT_ID)
  const res = await tx.commit()
  console.log(`✓ Transaction committed: ${res.transactionId}`)

  // ── 6. Verify deletion ──────────────────────────────────────────────────
  const after = await client.getDocument<any>(TARGET_ID)
  const afterDraft = await client.getDocument<any>(DRAFT_ID)
  console.log(`\nAfter delete:`)
  console.log(`  ${TARGET_ID}: ${after ? 'STILL EXISTS' : 'gone ✓'}`)
  console.log(`  ${DRAFT_ID}: ${afterDraft ? 'STILL EXISTS' : 'gone ✓'}`)

  // ── 7. Re-query SCs for vendorContractNo 0953625487 ────────────────────
  const remaining = await client.fetch<any[]>(
    `*[_type=="serviceContract" && vendorContractNo=="0953625487"]{
      _id, _createdAt, "billingCount": count(payments)
    } | order(_createdAt asc)`,
  )
  console.log(`\nRemaining SCs for 0953625487: ${remaining.length}`)
  for (const r of remaining) console.log(`  - ${r._id}  created=${r._createdAt}  billingCount=${r.billingCount}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
