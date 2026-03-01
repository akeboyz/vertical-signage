#!/usr/bin/env node
/**
 * migrate.mjs — One-time Sanity data migration
 *
 * Steps:
 *  1. media: copy enabled → isActive (default true if missing), unset old field
 *  2. offer: rename category enum  rent→forRent, sale→forSale, building-updates→buildingUpdates
 *  3. media: same category rename (legacy field, in case any docs still have it)
 *  4. playlistItem: rename touchExploreCategory enum values
 *  5. categoryConfig: rename categories[].id enum values
 *  6. categoryConfig: convert subcategories [{id,label,order}] → [string] (label.en)
 *
 * Usage: node migrate.mjs
 */

const SANITY_PROJECT_ID = 'awjj9g8u'
const SANITY_DATASET    = 'production'
const SANITY_API_VER    = '2024-01-01'
// ⚠️  Must be a token with WRITE permission (editor or administrator role).
// Get one from: https://sanity.io/manage → project → API → Tokens → Add API token
// The read-only token in build.mjs will NOT work here.
const SANITY_TOKEN      = process.env.SANITY_WRITE_TOKEN ?? 'REPLACE_WITH_WRITE_TOKEN'

const REMAP = { 'rent': 'forRent', 'sale': 'forSale', 'building-updates': 'buildingUpdates' }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function query(groq) {
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VER}/data/query/${SANITY_DATASET}`
            + `?query=${encodeURIComponent(groq)}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  if (!r.ok) throw new Error(`Query ${r.status}: ${await r.text()}`)
  return (await r.json()).result ?? []
}

async function mutate(mutations) {
  if (!mutations.length) return { transactionId: null }
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VER}/data/mutate/${SANITY_DATASET}`
  const r = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${SANITY_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ mutations }),
  })
  if (!r.ok) throw new Error(`Mutate ${r.status}: ${await r.text()}`)
  return r.json()
}

async function apply(mutations, label) {
  if (!mutations.length) { console.log(`  ✓  ${label}: nothing to update`); return }
  const BATCH = 100
  for (let i = 0; i < mutations.length; i += BATCH) {
    await mutate(mutations.slice(i, i + BATCH))
  }
  console.log(`  ✓  ${label}: updated ${mutations.length} document(s)`)
}

// ── 1. media.enabled → media.isActive ────────────────────────────────────────

console.log('\n── Step 1: media.enabled → media.isActive ──')
const mediaDocs = await query(`*[_type == "media"]{ _id, enabled, isActive }`)
await apply(
  mediaDocs
    .filter(d => d.enabled !== undefined || d.isActive === undefined)
    .map(d => ({
      patch: {
        id:    d._id,
        set:   { isActive: d.enabled ?? true },
        unset: ['enabled'],
      },
    })),
  'media'
)

// ── 2. offer.category enum rename ─────────────────────────────────────────────

console.log('\n── Step 2: offer.category enum rename ──')
const offerDocs = await query(`*[_type == "offer"]{ _id, category }`)
await apply(
  offerDocs
    .filter(d => REMAP[d.category])
    .map(d => ({ patch: { id: d._id, set: { category: REMAP[d.category] } } })),
  'offer'
)

// ── 3. media.category enum rename (legacy field) ──────────────────────────────

console.log('\n── Step 3: media.category enum rename (legacy field) ──')
const mediaCat = await query(`*[_type == "media" && defined(category)]{ _id, category }`)
await apply(
  mediaCat
    .filter(d => REMAP[d.category])
    .map(d => ({ patch: { id: d._id, set: { category: REMAP[d.category] } } })),
  'media (category)'
)

// ── 4. playlistItem.touchExploreCategory enum rename ─────────────────────────

console.log('\n── Step 4: playlistItem.touchExploreCategory enum rename ──')
const piDocs = await query(`*[_type == "playlistItem" && defined(touchExploreCategory)]{ _id, touchExploreCategory }`)
await apply(
  piDocs
    .filter(d => REMAP[d.touchExploreCategory])
    .map(d => ({ patch: { id: d._id, set: { touchExploreCategory: REMAP[d.touchExploreCategory] } } })),
  'playlistItem'
)

// ── 5. categoryConfig.categories[].id enum rename ────────────────────────────

console.log('\n── Step 5: categoryConfig categories[].id enum rename ──')
const cfgDocs = await query(`*[_type == "categoryConfig"]{ _id, categories[] }`)
await apply(
  cfgDocs
    .filter(d => d.categories?.some(c => REMAP[c.id]))
    .map(d => ({
      patch: {
        id:  d._id,
        set: {
          categories: d.categories.map(cat => ({
            ...cat,
            id: REMAP[cat.id] ?? cat.id,
          })),
        },
      },
    })),
  'categoryConfig (id)'
)

// ── 6. categoryConfig subcategories [{id,label,order}] → [string] ────────────

console.log('\n── Step 6: categoryConfig subcategories object[] → string[] ──')
const cfgDocs2 = await query(`*[_type == "categoryConfig"]{ _id, categories[] }`)
await apply(
  cfgDocs2
    .filter(d =>
      d.categories?.some(
        cat => cat.subcategories?.length && typeof cat.subcategories[0] === 'object'
      )
    )
    .map(d => ({
      patch: {
        id:  d._id,
        set: {
          categories: d.categories.map(cat => {
            if (!cat.subcategories?.length || typeof cat.subcategories[0] !== 'object')
              return cat
            const sorted = [...cat.subcategories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            return {
              ...cat,
              // Rename fallbackSubcategoryId → defaultSubcategory while we're here
              defaultSubcategory:    cat.fallbackSubcategoryId ?? cat.defaultSubcategory,
              fallbackSubcategoryId: undefined,
              subcategories: sorted.map(s => s.label?.en ?? s.label?.th ?? s.id ?? String(s)),
            }
          }),
        },
      },
    })),
  'categoryConfig (subcategories)'
)

console.log('\n✅  Migration complete.\n')
