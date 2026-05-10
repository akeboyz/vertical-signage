#!/usr/bin/env node
/**
 * uploadReceiptToPayment.ts
 *
 * CLI workaround for Chrome DevTools Protocol file-upload restrictions.
 * Uploads a receipt file directly from disk to Sanity and appends it to a
 * Payment document's receipts[] array.
 *
 * Usage (from sanity-studio/):
 *   npx tsx scripts/uploadReceiptToPayment.ts \
 *     --payment <paymentId>          (e.g. abc123 or drafts.abc123) \
 *     --file    <absolute-path>      (e.g. /Users/you/receipt.pdf) \
 *     --receiptDate <YYYY-MM-DD>     (e.g. 2026-04-28) \
 *     --invoiceNo   <string>         (e.g. W-CS-xxx-10000785)
 *
 * Environment (loaded from .env.local or process.env):
 *   SANITY_WRITE_TOKEN  — Sanity API token with write access
 */

import { createClient } from '@sanity/client'
import * as fs   from 'fs'
import * as path from 'path'

// ── Env loader ───────────────────────────────────────────────────────────────

function loadEnvFile(filePath: string): void {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx === -1) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const raw = trimmed.slice(eqIdx + 1).trim()
      // Strip surrounding quotes
      const value = raw.replace(/^["']|["']$/g, '')
      if (key && !(key in process.env)) process.env[key] = value
    }
  } catch {
    // .env.local is optional — ignore if absent
  }
}

// Load .env.local from the studio root (parent of scripts/)
loadEnvFile(path.resolve(__dirname, '..', '.env.local'))
// Also try cwd in case the script is run from a different location
loadEnvFile(path.resolve(process.cwd(), '.env.local'))

// ── Arg parser ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      result[argv[i].slice(2)] = argv[i + 1]
      i++
    }
  }
  return result
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    '.pdf':  'application/pdf',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png':  'image/png',
    '.gif':  'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
  }
  return map[ext] ?? 'application/octet-stream'
}

function randomKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // ── Validate required args ─────────────────────────────────────────────────
  const missingArgs: string[] = []
  if (!args.payment)     missingArgs.push('--payment')
  if (!args.file)        missingArgs.push('--file')
  if (!args.receiptDate) missingArgs.push('--receiptDate')
  if (!args.invoiceNo)   missingArgs.push('--invoiceNo')

  if (missingArgs.length > 0) {
    console.error(`\nMissing required argument(s): ${missingArgs.join(', ')}`)
    console.error(`
Usage:
  npx tsx scripts/uploadReceiptToPayment.ts \\
    --payment    <paymentId>      (bare ID, not drafts. prefix) \\
    --file       <absolute-path>  (local file to upload) \\
    --receiptDate <YYYY-MM-DD> \\
    --invoiceNo  <string>
`)
    process.exit(1)
  }

  // Normalise paymentId — strip drafts. prefix so we always work with the bare ID
  const paymentId = args.payment.replace(/^drafts\./, '')
  const draftId   = `drafts.${paymentId}`
  const filePath  = path.resolve(args.file)
  const receiptDate = args.receiptDate
  const invoiceNo   = args.invoiceNo

  // ── Validate date format ───────────────────────────────────────────────────
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) {
    console.error(`\nInvalid --receiptDate "${receiptDate}". Expected YYYY-MM-DD.`)
    process.exit(1)
  }

  // ── Validate file exists ───────────────────────────────────────────────────
  if (!fs.existsSync(filePath)) {
    console.error(`\nFile not found: ${filePath}`)
    process.exit(1)
  }

  // ── Validate token ─────────────────────────────────────────────────────────
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) {
    console.error(`
SANITY_WRITE_TOKEN is not set.
Set it in .env.local (in the sanity-studio/ directory) or export it before running:
  export SANITY_WRITE_TOKEN=skXXXXX
`)
    process.exit(1)
  }

  // ── Create Sanity client ───────────────────────────────────────────────────
  const client = createClient({
    projectId:  'awjj9g8u',
    dataset:    'production',
    apiVersion: '2024-01-01',
    token,
    useCdn:     false,
  })

  // ── Fetch payment (draft + published) ─────────────────────────────────────
  console.log(`\nLooking up payment ${paymentId}…`)

  const [draft, published] = await Promise.all([
    client.getDocument<any>(draftId),
    client.getDocument<any>(paymentId),
  ])

  if (!draft && !published) {
    console.error(`\nPayment not found: ${paymentId}`)
    process.exit(1)
  }

  // ── Idempotency check ──────────────────────────────────────────────────────
  // Check both draft and published to guard against double-runs
  const allReceipts = [
    ...((draft?.receipts as any[]) ?? []),
    ...((published?.receipts as any[]) ?? []),
  ]
  const alreadyLinked = allReceipts.some(
    (r: any) => r?.invoiceNumber === invoiceNo
  )

  if (alreadyLinked) {
    console.log(`\n✓ Receipt with invoiceNo "${invoiceNo}" is already linked to this payment.`)
    console.log('  Nothing to do — exiting.')
    process.exit(0)
  }

  // ── Upload asset ───────────────────────────────────────────────────────────
  const filename  = path.basename(filePath)
  const mime      = mimeType(filePath)
  const assetKind = mime === 'application/pdf' ? 'file' : 'image'

  console.log(`\nUploading ${filename} (${mime})…`)

  const asset = await client.assets.upload(
    assetKind as 'file' | 'image',
    fs.createReadStream(filePath),
    { filename, contentType: mime }
  )

  console.log(`  Asset uploaded: ${asset._id}`)

  // ── Ensure draft exists ────────────────────────────────────────────────────
  if (!draft) {
    // No draft yet — create one from the published document so we don't lose data
    console.log('\nNo draft found — creating draft from published document…')
    // Strip Sanity-managed system fields before createOrReplace
    const { _rev, _updatedAt, _createdAt, ...rest } = published as any
    void _rev; void _updatedAt; void _createdAt
    await client.createOrReplace({ ...rest, _id: draftId })
  }

  // ── Append receipt to draft ────────────────────────────────────────────────
  const newReceipt = {
    _key:          randomKey(),
    _type:         'receipt',
    file: {
      _type:  'file',
      asset:  { _type: 'reference', _ref: asset._id },
    },
    receiptDate,
    invoiceNumber: invoiceNo,
  }

  console.log('\nAppending receipt to payment draft…')

  await client
    .patch(draftId)
    .setIfMissing({ receipts: [] })
    .append('receipts', [newReceipt])
    .commit({ autoGenerateArrayKeys: false })

  // ── Success ────────────────────────────────────────────────────────────────
  console.log(`
✓ Receipt linked successfully
  Payment ID : ${paymentId}
  Asset ID   : ${asset._id}
  Invoice No : ${invoiceNo}
  Date       : ${receiptDate}
  File       : ${filename}

Open the payment in Sanity Studio → Edit → 2.10 Receipts to verify.
`)
}

main().catch(err => {
  console.error('\nFatal error:', err?.message ?? err)
  process.exit(1)
})
