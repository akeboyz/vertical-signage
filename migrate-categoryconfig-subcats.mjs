#!/usr/bin/env node
/**
 * migrate-categoryconfig-subcats.mjs
 *
 * Converts categoryConfig-global subcategories from string[] → object[]{id, label{en,th}}
 * and renames defaultSubcategory → defaultSubcategoryId.
 * Also sets the canonical subcategory lists with correct Thai translations.
 *
 * Usage (PowerShell):
 *   $env:SANITY_WRITE_TOKEN="sk..."; node migrate-categoryconfig-subcats.mjs
 */

const SANITY_PROJECT_ID = 'awjj9g8u'
const SANITY_DATASET    = 'production'
const SANITY_API_VER    = '2024-01-01'
const SANITY_TOKEN      = process.env.SANITY_WRITE_TOKEN ?? 'REPLACE_WITH_WRITE_TOKEN'

// ── Canonical subcategory data ─────────────────────────────────────────────────

const CANONICAL = [
  {
    id: 'food',
    defaultSubcategoryId: 'recommended',
    subcategories: [
      { id: 'dine-in',      en: 'Dine-in',      th: 'ทานที่ร้าน'   },
      { id: 'delivery',     en: 'Delivery',      th: 'เดลิเวอรี่'   },
      { id: 'recommended',  en: 'Recommended',   th: 'แนะนำ'        },
      { id: 'thai-cuisine', en: 'Thai Cuisine',  th: 'อาหารไทย'     },
      { id: 'vegan',        en: 'Vegan',         th: 'วีแกน'        },
      { id: 'coffee',       en: 'Coffee',        th: 'กาแฟ'         },
      { id: 'dessert',      en: 'Dessert',       th: 'ของหวาน'      },
      { id: 'promotions',   en: 'Promotions',    th: 'โปรโมชัน'     },
    ],
  },
  {
    id: 'groceries',
    defaultSubcategoryId: 'fresh-produce',
    subcategories: [
      { id: 'fresh-produce', en: 'Fresh Produce',  th: 'ผักผลไม้สด'        },
      { id: 'dairy-eggs',    en: 'Dairy & Eggs',   th: 'นมและไข่'           },
      { id: 'meat-seafood',  en: 'Meat & Seafood', th: 'เนื้อและซีฟู้ด'    },
      { id: 'snack-drinks',  en: 'Snack & Drinks', th: 'ขนมและเครื่องดื่ม' },
      { id: 'ready-to-eat',  en: 'Ready-to-Eat',   th: 'อาหารพร้อมทาน'     },
      { id: 'household',     en: 'Household',      th: 'ของใช้ในบ้าน'       },
      { id: 'organic',       en: 'Organic',        th: 'ออร์แกนิก'          },
      { id: 'drug-store',    en: 'Drug Store',     th: 'ร้านขายยา'          },
      { id: 'promotions',    en: 'Promotions',     th: 'โปรโมชัน'           },
      { id: '24hr-store',    en: '24-hr Store',    th: '24 ชั่วโมง'         },
    ],
  },
  {
    id: 'services',
    defaultSubcategoryId: 'cleaning',
    subcategories: [
      { id: 'cleaning',            en: 'Cleaning',              th: 'ทำความสะอาด'          },
      { id: 'repair-maintenance',  en: 'Repair & Maintenance',  th: 'ซ่อมแซมและบำรุงรักษา' },
      { id: 'renovation-interior', en: 'Renovation & Interior', th: 'รีโนเวทและตกแต่ง'     },
      { id: 'moving-delivery',     en: 'Moving & Delivery',     th: 'ขนย้ายและส่งของ'       },
      { id: 'laundry-dry-clean',   en: 'Laundry & Dry Clean',   th: 'ซักรีด'               },
      { id: 'pet-services',        en: 'Pet Services',          th: 'บริการสัตว์เลี้ยง'    },
    ],
  },
  {
    id: 'forRent',
    defaultSubcategoryId: 'most-recent',
    subcategories: [
      { id: 'most-recent', en: 'Most recent',    th: 'ล่าสุด'           },
      { id: 'good-deal',   en: 'Good deal',      th: 'ราคาดี'           },
      { id: 'one-bed',     en: 'One-Bed',        th: '1 ห้องนอน'        },
      { id: 'two-bed-up',  en: 'Two-Bed and up', th: '2 ห้องนอนขึ้นไป' },
    ],
  },
  {
    id: 'forSale',
    defaultSubcategoryId: 'most-recent',
    subcategories: [
      { id: 'most-recent', en: 'Most recent',    th: 'ล่าสุด'           },
      { id: 'good-deal',   en: 'Good deal',      th: 'ราคาดี'           },
      { id: 'one-bed',     en: 'One-Bed',        th: '1 ห้องนอน'        },
      { id: 'two-bed-up',  en: 'Two-Bed and up', th: '2 ห้องนอนขึ้นไป' },
    ],
  },
  {
    id: 'buildingUpdates',
    defaultSubcategoryId: 'most-recent',
    subcategories: [
      { id: 'most-recent', en: 'Most recent', th: 'ล่าสุด'    },
      { id: 'alert',       en: 'Alert',       th: 'แจ้งเตือน' },
    ],
  },
]

// ── Sanity helpers ─────────────────────────────────────────────────────────────

async function query(groq) {
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VER}/data/query/${SANITY_DATASET}`
            + `?query=${encodeURIComponent(groq)}`
  const r = await fetch(url, { headers: { Authorization: `Bearer ${SANITY_TOKEN}` } })
  if (!r.ok) throw new Error(`Query ${r.status}: ${await r.text()}`)
  return (await r.json()).result
}

async function mutate(mutations) {
  const url = `https://${SANITY_PROJECT_ID}.api.sanity.io/v${SANITY_API_VER}/data/mutate/${SANITY_DATASET}`
  const r = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${SANITY_TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ mutations }),
  })
  if (!r.ok) throw new Error(`Mutate ${r.status}: ${await r.text()}`)
  return r.json()
}

// ── Main ───────────────────────────────────────────────────────────────────────

console.log('\n── Fetching categoryConfig-global ──')
const existing = await query(`*[_id == "categoryConfig-global"][0]{ _id, categories[] }`)

if (!existing) {
  console.log('  Doc not found — will create fresh singleton.')
}

console.log('\n── Building new categories array ──')
const newCategories = CANONICAL.map(canonical => {
  const existingCat = existing?.categories?.find(c => c.id === canonical.id)

  return {
    _type: 'categoryEntry',
    // Preserve existing _key so Sanity doesn't treat it as a new array item
    _key:  existingCat?._key ?? canonical.id,
    id:    canonical.id,
    // Preserve any label / ctaItem already set by editors
    label:   existingCat?.label   ?? {},
    ctaItem: existingCat?.ctaItem ?? {},
    defaultSubcategoryId: canonical.defaultSubcategoryId,
    subcategories: canonical.subcategories.map(sub => ({
      _type: 'subcategoryEntry',
      _key:  sub.id,
      id:    sub.id,
      label: { en: sub.en, th: sub.th },
    })),
  }
})

console.log(`  Built ${newCategories.length} categories:`, newCategories.map(c => c.id).join(', '))

console.log('\n── Patching Sanity document ──')
await mutate([
  // Ensure doc exists
  {
    createIfNotExists: {
      _id:        'categoryConfig-global',
      _type:      'categoryConfig',
      categories: [],
    },
  },
  // Set the new canonical categories (replaces old string[] subcategories)
  {
    patch: {
      id:  'categoryConfig-global',
      set: { categories: newCategories },
    },
  },
])

console.log('\n✅  Migration complete.')
console.log('   Each category now has subcategories as [{id, label{en,th}}].')
console.log('   defaultSubcategoryId is set per category.')
console.log('   Old label/ctaItem values are preserved.\n')
