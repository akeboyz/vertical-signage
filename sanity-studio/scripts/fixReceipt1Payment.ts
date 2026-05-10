#!/usr/bin/env node
/**
 * Step 6: Fix Receipt 1 (PMT-2604-006).
 *
 * Procedure:
 *   1. Inspect current receipts on payment 4a2c38ab-90c7-423c-a321-df35a3723d22.
 *   2. Upload S__9895951.jpg as a new asset and append a correct receipt entry
 *      (invoiceNo W-CS-1179-6901-10000785, date 2026-01-20).
 *   3. Remove the bad receipt entries — those whose:
 *        receiptDate starts with "0" (e.g. "0002-01-20") OR
 *        invoiceNumber is exactly "S" or empty/undefined.
 *      The good receipt added in step 2 is preserved by matching on the new
 *      asset id.
 *   4. Publish the resulting draft (draft → published, drop draft).
 *
 * Idempotent: if a receipt with the correct invoiceNo already exists, the
 * upload step is skipped. Cleanup still runs.
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

const PAYMENT_ID    = '4a2c38ab-90c7-423c-a321-df35a3723d22'
const FILE_PATH     = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account/S__9895951.jpg'
const RECEIPT_DATE  = '2026-01-20'
const INVOICE_NO    = 'W-CS-1179-6901-10000785'

function randomKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

function isBadReceipt(r: any): boolean {
  if (!r) return false
  const date = String(r.receiptDate ?? '')
  const inv  = String(r.invoiceNumber ?? '').trim()
  // receiptDate that starts with "0" (year 0xxx) is clearly bad
  const badDate = /^0\d{3}-/.test(date)
  // invoiceNumber that's empty or just "S"
  const badInv  = inv === '' || inv === 'S'
  return badDate || badInv
}

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

  const draftId = `drafts.${PAYMENT_ID}`

  // ── 1. Fetch payment (draft + published) ─────────────────────────────────
  const [draft, published] = await Promise.all([
    client.getDocument<any>(draftId),
    client.getDocument<any>(PAYMENT_ID),
  ])

  if (!draft && !published) {
    console.error(`Payment not found: ${PAYMENT_ID}`)
    process.exit(1)
  }

  console.log('Published payment:', published?._id ?? '(none)')
  console.log('Draft payment:    ', draft?._id ?? '(none)')

  const currentReceipts = (draft?.receipts ?? published?.receipts ?? []) as any[]
  console.log(`\nCurrent receipts on payment (${currentReceipts.length}):`)
  for (const r of currentReceipts) {
    console.log(`  - _key=${r._key}  date=${r.receiptDate}  inv=${r.invoiceNumber}  asset=${r.file?.asset?._ref}`)
  }

  // ── 2. Idempotency: already has correct receipt? ─────────────────────────
  const goodAlready = currentReceipts.some((r: any) => r?.invoiceNumber === INVOICE_NO)

  let assetId: string | null = null
  if (!goodAlready) {
    if (!fs.existsSync(FILE_PATH)) {
      console.error(`\nFile not found: ${FILE_PATH}`)
      process.exit(1)
    }
    console.log(`\nUploading ${path.basename(FILE_PATH)}…`)
    const asset = await client.assets.upload(
      'image',
      fs.createReadStream(FILE_PATH),
      { filename: path.basename(FILE_PATH), contentType: 'image/jpeg' },
    )
    assetId = asset._id
    console.log(`  Asset uploaded: ${assetId}`)
  } else {
    console.log(`\n✓ Correct receipt already exists for invoiceNo "${INVOICE_NO}" — skipping upload`)
  }

  // ── 3. Build the new receipts array ──────────────────────────────────────
  // - Drop bad entries
  // - Keep good ones
  // - Append our new one if not already present
  const cleaned: any[] = []
  for (const r of currentReceipts) {
    if (isBadReceipt(r)) {
      console.log(`  ✗ Removing bad receipt: _key=${r._key}  date=${r.receiptDate}  inv=${r.invoiceNumber}`)
      continue
    }
    cleaned.push(r)
  }

  if (!goodAlready && assetId) {
    cleaned.push({
      _key: randomKey(),
      _type: 'receipt',
      file: { _type: 'file', asset: { _type: 'reference', _ref: assetId } },
      receiptDate: RECEIPT_DATE,
      invoiceNumber: INVOICE_NO,
    })
    console.log(`  + Adding new receipt: date=${RECEIPT_DATE}  inv=${INVOICE_NO}`)
  }

  // ── 4. Apply via DRAFT then publish ─────────────────────────────────────
  // Ensure draft exists
  if (!draft) {
    const { _rev, _updatedAt, _createdAt, ...rest } = published as any
    void _rev; void _updatedAt; void _createdAt
    await client.createOrReplace({ ...rest, _id: draftId })
  }

  console.log(`\nWriting ${cleaned.length} receipt(s) to draft…`)
  await client.patch(draftId).set({ receipts: cleaned }).commit({ autoGenerateArrayKeys: false })

  // Read updated draft
  const updated = await client.getDocument<any>(draftId)
  const { _rev, _updatedAt, _createdAt, _id: _ignoredId, ...rest } = updated
  void _rev; void _updatedAt; void _createdAt

  console.log('Publishing draft…')
  await client
    .transaction()
    .createOrReplace({ ...rest, _id: PAYMENT_ID })
    .delete(draftId)
    .commit()

  console.log('\n✓ Done. Final receipts:')
  for (const r of cleaned) {
    console.log(`  - date=${r.receiptDate}  inv=${r.invoiceNumber}`)
  }
}

main().catch(err => {
  console.error('FAIL:', err.message)
  process.exit(1)
})
