#!/usr/bin/env node
/**
 * batchPublishDrafts.ts
 *
 * Publishes one or more Sanity draft documents without opening Studio.
 * Publishing = copy drafts.{id} → {id} and delete the draft.
 *
 * ── Positional IDs ───────────────────────────────────────────────────────────
 * npx tsx scripts/batchPublishDrafts.ts abc123 def456 ghi789
 * (bare IDs or drafts. prefixed — both accepted)
 *
 * ── CSV with id column ───────────────────────────────────────────────────────
 * npx tsx scripts/batchPublishDrafts.ts --csv /path/to/ids.csv
 * CSV must have a header row containing an "id" column.
 *
 * ── Environment ─────────────────────────────────────────────────────────────
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

// ── CSV id extractor ─────────────────────────────────────────────────────────

function idsFromCSV(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines   = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const idCol   = headers.indexOf('id')
  if (idCol === -1) {
    console.error('CSV must contain an "id" column header.')
    process.exit(1)
  }
  return lines.slice(1).map(line => {
    const cols = line.split(',')
    return (cols[idCol] ?? '').trim().replace(/^"|"$/g, '')
  }).filter(Boolean)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2)

  // ── Token ──────────────────────────────────────────────────────────────────
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

  // ── Collect IDs ────────────────────────────────────────────────────────────
  let rawIds: string[] = []

  const csvFlag = argv.indexOf('--csv')
  if (csvFlag !== -1) {
    const csvPath = argv[csvFlag + 1]
    if (!csvPath || csvPath.startsWith('--')) {
      console.error('--csv requires a file path argument.')
      process.exit(1)
    }
    const resolved = path.resolve(csvPath)
    if (!fs.existsSync(resolved)) {
      console.error(`CSV not found: ${resolved}`)
      process.exit(1)
    }
    rawIds = idsFromCSV(resolved)
  } else {
    // Positional args — skip any --flag and its value
    for (let i = 0; i < argv.length; i++) {
      if (argv[i].startsWith('--')) { i++; continue }
      rawIds.push(argv[i])
    }
  }

  if (rawIds.length === 0) {
    console.error(`
Usage:
  npx tsx scripts/batchPublishDrafts.ts <id1> [id2] [id3] ...
  npx tsx scripts/batchPublishDrafts.ts --csv /path/to/ids.csv
`)
    process.exit(1)
  }

  // Normalise: strip drafts. prefix so we always work with bare IDs
  const ids = [...new Set(rawIds.map(id => id.replace(/^drafts\./, '')))]
  console.log(`\nPublishing ${ids.length} document(s)…\n`)

  // ── Publish each ───────────────────────────────────────────────────────────
  let published = 0
  let skipped   = 0
  let errors    = 0

  for (const bareId of ids) {
    const draftId = `drafts.${bareId}`

    try {
      const draft = await client.getDocument<Record<string, unknown>>(draftId)

      if (!draft) {
        console.log(`  ↩  ${bareId}  (no draft — skipped)`)
        skipped++
        continue
      }

      // Strip Sanity-managed system fields before writing as published
      const { _rev, _updatedAt, _createdAt, _id: _ignoredId, ...rest } = draft
      void _rev; void _updatedAt; void _createdAt

      await client.transaction()
        .createOrReplace({ ...rest, _id: bareId })
        .delete(draftId)
        .commit()

      console.log(`  ✓  ${bareId}  (_type: ${rest._type ?? '?'})`)
      published++

    } catch (err: any) {
      console.error(`  ✗  ${bareId}  — ${err?.message ?? err}`)
      errors++
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
── Result ──────────────────────────────────────
   Published : ${published}
   Skipped   : ${skipped}  (no draft found)
   Errors    : ${errors}
────────────────────────────────────────────────`)

  process.exit(errors > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('\nFatal error:', err?.message ?? err)
  process.exit(1)
})
