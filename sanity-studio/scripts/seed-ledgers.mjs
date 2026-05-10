import { createClient } from '@sanity/client'

const client = createClient({
  projectId: 'awjj9g8u',
  dataset:   'production',
  apiVersion: '2024-01-01',
  token: 'skrGApr753oJXBj9vIy8wPIgBYPoDuGWz2IjlReGIfA7ynwC7uANThFSg9EiypcelIgid1FD9uQxIRJlwgsiY2n8E2MTI8umU7ACh57dHb52AtKKCmLoQLw7CAKXkzPD0olBFmeqPjROMJDcqwb95eRblbBfap3JRU03KurjvtybgipfOpho',
  useCdn: false,
})

const accountCodes = await client.fetch(
  `*[_type == "accountCode" && defined(code) && defined(type)]{ _id, code, nameTh, type } | order(type asc, code asc)`
)

const existing = await client.fetch(
  `*[_type == "ledger"]{ "accountId": accountCode._ref }`
)
const existingIds = new Set(existing.map(e => e.accountId))

const toCreate = accountCodes.filter(ac => !existingIds.has(ac._id))

console.log(`Account codes: ${accountCodes.length}  |  Already have ledger: ${existingIds.size}  |  Creating: ${toCreate.length}`)

const mutations = toCreate.map(ac => ({
  create: {
    _type: 'ledger',
    accountCode: { _type: 'reference', _ref: ac._id, _weak: true },
  }
}))

// Sanity allows up to 100 mutations per request — batch if needed
const BATCH = 100
for (let i = 0; i < mutations.length; i += BATCH) {
  const batch = mutations.slice(i, i + BATCH)
  const result = await client.mutate(batch)
  console.log(`Batch ${Math.floor(i / BATCH) + 1}: created ${result.results.length} ledger docs`)
}

console.log('Done.')
