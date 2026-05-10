/**
 * cleanup-projects.mjs
 *
 * Fixes two issues:
 * 1. Deletes 2 misassigned playlist items blocking deletion of
 *    "The Room Sukhumvit 21 — Rental Contract" (project-AgSw906H5N3BHcJxZ9hIv7)
 * 2. Moves any playlist items from the duplicate "Noble BE19 — Rental Contract"
 *    (project-AgSw906H5N3BHcJxZ9hKMX) to the real one (project-1aac10ef-...)
 *    so the duplicate can also be deleted.
 *
 * Run: node --env-file=.env cleanup-projects.mjs
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

const ROOM_RENTAL_PROJECT_ID  = 'project-AgSw906H5N3BHcJxZ9hIv7'  // The Room SKV21 Rental Contract
const NOBLE_DUPLICATE_ID      = 'project-AgSw906H5N3BHcJxZ9hKMX'  // Noble BE19 Rental Contract (duplicate)
const NOBLE_REAL_ID           = 'project-1aac10ef-7bd9-4ec4-9813-3f13dc567482'  // Noble BE19 Rental Contract (real)

const MISASSIGNED_ITEMS = [
  '18238977-6562-4f33-9b9f-52183d3aa495',
  'c5b6c474-5060-4ba4-84fe-c2a5f56bae33',
  'drafts.18238977-6562-4f33-9b9f-52183d3aa495',
  'drafts.c5b6c474-5060-4ba4-84fe-c2a5f56bae33',
]

async function run() {
  console.log('\n── Step 1: Delete misassigned playlist items ────────────────')
  for (const id of MISASSIGNED_ITEMS) {
    try {
      await client.delete(id)
      console.log(`  ✓ Deleted playlist item ${id}`)
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

  console.log('\n── Done ─────────────────────────────────────────────────────')
  console.log('  You can now delete these two project documents in Sanity Studio:')
  console.log(`  • ${ROOM_RENTAL_PROJECT_ID}  (The Room SKV21 Rental Contract)`)
  console.log(`  • ${NOBLE_DUPLICATE_ID}       (Noble BE19 Rental Contract — duplicate)`)
  console.log('\n  Open each in Studio → ••• menu → Delete\n')
}

run().catch(console.error)
