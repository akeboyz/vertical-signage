/**
 * cleanup-projects.mjs
 *
 * Fixes three issues:
 * 1. Deletes 2 misassigned playlist items blocking deletion of
 *    "The Room Sukhumvit 21 — Rental Contract" (project-AgSw906H5N3BHcJxZ9hIv7)
 * 2. Moves any playlist items from the duplicate "Noble BE19 — Rental Contract"
 *    (project-AgSw906H5N3BHcJxZ9hKMX) to the real one (project-1aac10ef-...)
 *    so the duplicate can also be deleted.
 * 3. Marks all 5 rental-contract projects as isActive: false so they are no
 *    longer built and deployed to GitHub.
 *
 * Run: node --env-file=../.env cleanup-projects.mjs   (from sanity-studio/)
 */

import { createClient } from '@sanity/client'

const client = createClient({
  projectId: 'awjj9g8u',
  dataset:   'production',
  token:     process.env.SANITY_TOKEN,
  apiVersion: '2024-01-01',
  useCdn:    false,
})

// ── IDs ───────────────────────────────────────────────────────────────────────

const ROOM_RENTAL_PROJECT_ID  = 'project-AgSw906H5N3BHcJxZ9hIv7'
const NOBLE_DUPLICATE_ID      = 'project-AgSw906H5N3BHcJxZ9hKMX'
const NOBLE_REAL_ID           = 'project-1aac10ef-7bd9-4ec4-9813-3f13dc567482'

const RENTAL_CONTRACT_PROJECT_IDS = [
  'project-1aac10ef-7bd9-4ec4-9813-3f13dc567482',  // Noble BE19 — Rental Contract (real)
  'project-678af396-b6a9-4b88-ac81-a4f8413a3c49',  // The Lumpini 24 — Rental Contract
  'project-695ab153-858b-4f11-8e6c-5f42a89fcbdc',  // Mahogany Tower — Rental Contract
  'project-AgSw906H5N3BHcJxZ9hIv7',               // The Room SKV21 — Rental Contract
  'project-AgSw906H5N3BHcJxZ9hKMX',               // Noble BE19 — Rental Contract (duplicate)
]

const MISASSIGNED_ITEMS = [
  // The Room SKV21 — misassigned items (published + drafts)
  '18238977-6562-4f33-9b9f-52183d3aa495',
  'c5b6c474-5060-4ba4-84fe-c2a5f56bae33',
  'drafts.18238977-6562-4f33-9b9f-52183d3aa495',
  'drafts.c5b6c474-5060-4ba4-84fe-c2a5f56bae33',
  // Noble BE19 rental contract — duplicate items (already exist in real noble-be19 playlist)
  '16854506-7e7c-4d8d-8c92-67a787b36423',  // ห้ามดูดบุหรี่ภายในห้องชุด
  '4eb51325-4f4f-4cda-9272-117db85de418',  // de Icon Salon
  'b0c6c135-c948-4d16-b6e6-cf399fa79c82',  // Jamm, Premium Jam
]

async function run() {
  console.log('\n── Step 1: Delete misassigned playlist items ────────────────')
  for (const id of MISASSIGNED_ITEMS) {
    try {
      await client.delete(id)
      console.log(`  ✓ Deleted ${id}`)
    } catch (e) {
      console.error(`  ✗ Failed to delete ${id}:`, e.message)
    }
  }

  console.log('\n── Step 2: Find playlist items under duplicate Noble project ─')
  const nobleItems = await client.fetch(
    `*[_type == "playlistItem" && project._ref == $id]{ _id, order, "title": media->title }`,
    { id: NOBLE_DUPLICATE_ID }
  )
  console.log(`  Found ${nobleItems.length} item(s) under duplicate Noble project`)

  if (nobleItems.length > 0) {
    console.log('\n── Step 3: Move them to the real Noble project ──────────────')
    for (const item of nobleItems) {
      try {
        await client.patch(item._id)
          .set({ project: { _type: 'reference', _ref: NOBLE_REAL_ID } })
          .commit()
        console.log(`  ✓ Moved item ${item.order}. ${item.title ?? item._id}`)
      } catch (e) {
        console.error(`  ✗ Failed to move ${item._id}:`, e.message)
      }
    }
  }

  console.log('\n── Step 4: Deactivate all rental-contract projects ──────────')
  for (const id of RENTAL_CONTRACT_PROJECT_IDS) {
    try {
      await client.patch(id).set({ isActive: false }).commit()
      console.log(`  ✓ Deactivated ${id}`)
    } catch (e) {
      console.error(`  ✗ Failed to deactivate ${id}:`, e.message)
    }
  }

  console.log('\n── Done ─────────────────────────────────────────────────────')
  console.log('  Rental contract projects are now inactive — excluded from builds.')
  console.log('  You can delete these two in Sanity Studio when ready:')
  console.log(`  • ${ROOM_RENTAL_PROJECT_ID}  (The Room SKV21 Rental Contract)`)
  console.log(`  • ${NOBLE_DUPLICATE_ID}       (Noble BE19 Rental Contract — duplicate)`)
  console.log('\n  Open each in Studio → ••• menu → Delete\n')
}

run().catch(console.error)
