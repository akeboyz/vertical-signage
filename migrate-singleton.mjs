#!/usr/bin/env node
/**
 * migrate-singleton.mjs — Convert categoryConfig to global singleton
 *
 * What it does:
 *  1. Fetches all categoryConfig documents.
 *  2. Creates/replaces the singleton doc (_id = "categoryConfig-global")
 *     using the categories data from the first existing doc.
 *  3. Deletes all old docs whose _id ≠ "categoryConfig-global".
 *
 * Usage:
 *   $env:SANITY_WRITE_TOKEN="sk..."; node migrate-singleton.mjs
 */

const SANITY_PROJECT_ID = 'awjj9g8u'
const SANITY_DATASET    = 'production'
const SANITY_API_VER    = '2024-01-01'
const SANITY_TOKEN      = process.env.SANITY_WRITE_TOKEN ?? 'REPLACE_WITH_WRITE_TOKEN'

async function query(groq) {
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VER}/data/query/${SANITY_DATASET}`
            + `?query=${encodeURIComponent(groq)}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  if (!r.ok) throw new Error(`Query ${r.status}: ${await r.text()}`)
  return (await r.json()).result ?? []
}

async function mutate(mutations) {
  if (!mutations.length) return
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VER}/data/mutate/${SANITY_DATASET}`
  const r = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${SANITY_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ mutations }),
  })
  if (!r.ok) throw new Error(`Mutate ${r.status}: ${await r.text()}`)
  return r.json()
}

console.log('\n── Fetching all categoryConfig docs ──')
const docs = await query(`*[_type == "categoryConfig"]{ _id, categories }`)
console.log(`  Found ${docs.length} doc(s): ${docs.map(d => d._id).join(', ') || '(none)'}`)

// ── Step 1: Create or replace the singleton ────────────────────────────────
const existing = docs.find(d => d._id === 'categoryConfig-global')
const source   = existing ?? docs[0]

if (!source) {
  console.log('\n  No existing categoryConfig found.')
  console.log('  Creating empty singleton — fill it in via Studio.')
  await mutate([{
    createOrReplace: {
      _id:        'categoryConfig-global',
      _type:      'categoryConfig',
      categories: [],
    },
  }])
} else if (!existing) {
  console.log(`\n  Copying categories from ${source._id} → categoryConfig-global`)
  await mutate([{
    createOrReplace: {
      _id:        'categoryConfig-global',
      _type:      'categoryConfig',
      categories: source.categories ?? [],
    },
  }])
} else {
  console.log('\n  Singleton already exists — no copy needed.')
}

// ── Step 2: Delete all old docs that are not the singleton ─────────────────
const toDelete = docs.filter(d => d._id !== 'categoryConfig-global')
if (toDelete.length) {
  console.log(`\n  Deleting ${toDelete.length} old doc(s): ${toDelete.map(d => d._id).join(', ')}`)
  await mutate(toDelete.map(d => ({ delete: { id: d._id } })))
} else {
  console.log('  No old docs to delete.')
}

console.log('\n✅  Singleton migration complete.\n')
