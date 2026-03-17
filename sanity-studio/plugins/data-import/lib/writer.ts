/**
 * writer.ts — write validated rows to Sanity using @sanity/client.
 *
 * Uses SANITY_STUDIO_WRITE_TOKEN (automatically exposed to the Studio
 * bundle via Sanity's Vite build for SANITY_STUDIO_* prefixed vars).
 *
 * Exports:
 *   runImport(rows, target, dryRun, onProgress): Promise<ImportSummary>
 */

import { createClient } from '@sanity/client'
import type { ImportResult, ImportSummary, MappedRow, SchemaTarget } from '../types'
import { getIdentifierField } from './fieldDefs'

const PROJECT_ID  = 'awjj9g8u'
const DATASET     = 'production'
const API_VERSION = '2024-01-01'

// SANITY_STUDIO_* vars are injected by Sanity's Vite build at bundle time
const WRITE_TOKEN = (process.env.SANITY_STUDIO_WRITE_TOKEN ?? '').trim()

let _client: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!_client) {
    if (!WRITE_TOKEN) {
      throw new Error(
        'SANITY_STUDIO_WRITE_TOKEN is not set. ' +
        'Add it to your .env file in the sanity-studio directory.',
      )
    }
    _client = createClient({
      projectId:  PROJECT_ID,
      dataset:    DATASET,
      apiVersion: API_VERSION,
      useCdn:     false,
      token:      WRITE_TOKEN,
    })
  }
  return _client
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runImport(
  rows: MappedRow[],
  target: SchemaTarget,
  dryRun: boolean,
  onProgress: (done: number, total: number) => void,
): Promise<ImportSummary> {
  const client     = getClient()
  const idField    = getIdentifierField(target)
  const results:   ImportResult[] = []
  let created = 0, updated = 0, failed = 0

  // ── Pre-flight: batch-resolve existing document IDs ───────────────────────

  // Collect all identifier values from valid rows
  const identifiers = rows
    .map(r => String(r.data[idField.name] ?? '').trim())
    .filter(Boolean)

  // Fetch all existing docs matching these identifiers in ONE query
  const existingDocs = await client.fetch<{ _id: string; [key: string]: string }[]>(
    `*[_type == $type && ${idField.name} in $ids]{ _id, ${idField.name} }`,
    { type: target, ids: identifiers },
  )

  const existingIdMap = new Map<string, string>(
    existingDocs.map(d => [String(d[idField.name]), d._id]),
  )

  // ── For contracts: batch-resolve projectSite references ──────────────────

  let projectSiteMap = new Map<string, string>()
  if (target === 'contract') {
    const projectNames = [
      ...new Set(
        rows
          .map(r => String(r.data['_projectName'] ?? '').trim())
          .filter(Boolean),
      ),
    ]
    if (projectNames.length > 0) {
      const sites = await client.fetch<{ _id: string; projectName: string }[]>(
        `*[_type == "projectSite" && projectName in $names]{ _id, projectName }`,
        { names: projectNames },
      )
      projectSiteMap = new Map(sites.map(s => [s.projectName, s._id]))
    }
  }

  // ── Write rows one by one ─────────────────────────────────────────────────

  for (let i = 0; i < rows.length; i++) {
    const row        = rows[i]
    const identifier = String(row.data[idField.name] ?? '').trim()

    onProgress(i, rows.length)

    // Skip rows that have validation errors (they were shown in preview)
    if (row.errors.length > 0) {
      results.push({
        rowIndex:   row._rowIndex,
        identifier,
        status:     'error',
        error:      row.errors.map(e => e.message).join('; '),
      })
      failed++
      continue
    }

    try {
      // Build the payload — strip undefined values and synthetic fields
      const payload = buildPayload(row.data, target, projectSiteMap)

      if (dryRun) {
        // Simulate without writing
        const existingId = existingIdMap.get(identifier)
        results.push({
          rowIndex:   row._rowIndex,
          identifier,
          status:     'dry-run',
          error:      existingId ? `Would update ${existingId}` : 'Would create new document',
        })
        continue
      }

      const existingId = existingIdMap.get(identifier)

      if (existingId) {
        // Update existing document
        await client.patch(existingId).set(payload).commit()
        results.push({ rowIndex: row._rowIndex, identifier, status: 'updated' })
        updated++
      } else {
        // Create new document
        await client.create({ _type: target, ...payload })
        results.push({ rowIndex: row._rowIndex, identifier, status: 'created' })
        created++
        // Cache the new ID for subsequent duplicate rows in the same batch
        existingIdMap.set(identifier, identifier)
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ rowIndex: row._rowIndex, identifier, status: 'error', error: msg })
      failed++
    }
  }

  onProgress(rows.length, rows.length)

  return {
    total:   rows.length,
    created: dryRun ? 0 : created,
    updated: dryRun ? 0 : updated,
    failed,
    dryRun,
    results,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build the Sanity document payload from a MappedRow's data object.
 * - Strips undefined values (don't overwrite existing fields with blank)
 * - Strips synthetic _projectName field
 * - Injects projectSite reference for contracts
 */
function buildPayload(
  data: Record<string, unknown>,
  target: SchemaTarget,
  projectSiteMap: Map<string, string>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    // Skip undefined / empty and internal synthetic fields
    if (value === undefined || value === null || String(value).trim() === '') continue
    if (key === '_projectName') continue
    payload[key] = value
  }

  // Inject projectSite reference for contracts
  if (target === 'contract') {
    const projectName = String(data['_projectName'] ?? '').trim()
    if (projectName) {
      const siteId = projectSiteMap.get(projectName)
      if (siteId) {
        payload['projectSite'] = { _type: 'reference', _ref: siteId }
      }
      // If not found, the validator already added an error; row would have been skipped above
    }
  }

  return payload
}
