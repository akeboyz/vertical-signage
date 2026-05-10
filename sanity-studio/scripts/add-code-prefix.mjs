import { createClient } from '@sanity/client'

const client = createClient({
  projectId: 'awjj9g8u',
  dataset:   'production',
  apiVersion: '2024-01-01',
  token: 'skrGApr753oJXBj9vIy8wPIgBYPoDuGWz2IjlReGIfA7ynwC7uANThFSg9EiypcelIgid1FD9uQxIRJlwgsiY2n8E2MTI8umU7ACh57dHb52AtKKCmLoQLw7CAKXkzPD0olBFmeqPjROMJDcqwb95eRblbBfap3JRU03KurjvtybgipfOpho',
  useCdn: false,
})

const PREFIX = { asset: '1', liability: '2', equity: '3', revenue: '4', expense: '5' }

const codes = await client.fetch(
  `*[_type == "accountCode" && defined(code) && defined(type)]{ _id, code, type }`
)

console.log(`Updating ${codes.length} account codes...`)

const mutations = codes.map(ac => ({
  patch: {
    id: ac._id,
    set: { code: `${PREFIX[ac.type] ?? ''}${ac.code}` },
  }
}))

const BATCH = 100
for (let i = 0; i < mutations.length; i += BATCH) {
  const result = await client.mutate(mutations.slice(i, i + BATCH))
  console.log(`Batch ${Math.floor(i / BATCH) + 1}: updated ${result.results.length} docs`)
}

console.log('Done.')
