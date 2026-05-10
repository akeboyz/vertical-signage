#!/usr/bin/env node
/**
 * createServiceContractPayment.ts
 *
 * Programmatically creates a Service Contract Payment document in Sanity and
 * appends a billing entry back to the linked Service Contract.
 *
 * Use this when Chrome DevTools Protocol file restrictions block Studio
 * automation, or to batch-create historic payments from a CSV.
 *
 * ── Single payment ──────────────────────────────────────────────────────────
 * npx tsx scripts/createServiceContractPayment.ts \
 *   --vendorContractNo "8806513068" \
 *   --grossAmount 499 \
 *   --vatAmount 34.93 \
 *   --vatType exclusive \
 *   --paymentDate 2026-03-05 \
 *   --invoiceNo "W-CS-1179-6903-10000204" \
 *   --bankAccount "110211" \
 *   [--paymentType transfer] \
 *   [--notes "optional note"] \
 *   [--periodStart 2026-03-01] \
 *   [--periodEnd 2026-03-31]
 *
 * ── Batch from CSV ──────────────────────────────────────────────────────────
 * npx tsx scripts/createServiceContractPayment.ts --csv /path/to/payments.csv
 *
 * CSV columns (header row required, order doesn't matter):
 *   vendorContractNo, grossAmount, vatAmount, vatType, paymentDate,
 *   invoiceNo, bankAccount, paymentType, notes, periodStart, periodEnd
 *
 * ── Environment ─────────────────────────────────────────────────────────────
 * SANITY_WRITE_TOKEN  set in .env.local or exported before running
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 * Checked by: paymentMethodDetails == invoiceNo AND same vendor.
 * Running twice for the same invoiceNo returns the existing paymentId and
 * skips all mutations.
 *
 * ── Follow-up ───────────────────────────────────────────────────────────────
 * After this script, attach receipts with:
 *   npx tsx scripts/uploadReceiptToPayment.ts --payment <paymentId> ...
 */

import { createClient }  from '@sanity/client'
import * as fs           from 'fs'
import * as path         from 'path'
import * as crypto       from 'crypto'

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

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECT_ID  = 'awjj9g8u'
const DATASET     = 'production'
const API_VERSION = '2024-01-01'

// paymentType values in the payment schema (differs from SC's paymentMethod)
const PAYMENT_TYPE_MAP: Record<string, string> = {
  bank_transfer: 'transfer',
  transfer:      'transfer',
  cheque:        'cheque',
  cash:          'cash',
  swift:         'swift',
}

const VAT_TYPES = ['exclusive', 'inclusive', 'zero', 'none'] as const
type VatType = typeof VAT_TYPES[number]

// ── Helpers ──────────────────────────────────────────────────────────────────

function randomKey(len = 8): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

/** First and last day of the month containing the given YYYY-MM-DD date. */
function defaultPeriod(dateStr: string): { start: string; end: string } {
  const [y, m] = dateStr.split('-').map(Number)
  const start  = `${y}-${String(m).padStart(2, '0')}-01`
  const last   = new Date(y, m, 0).getDate()   // day 0 of next month = last day of current
  const end    = `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { start, end }
}

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

// ── CSV parser ───────────────────────────────────────────────────────────────
// Handles quoted fields containing commas or newlines.

function parseCSV(content: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuote = false

  for (let i = 0; i < content.length; i++) {
    const ch   = content[i]
    const next = content[i + 1]

    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i++ }
      else if (ch === '"')            { inQuote = false }
      else                            { field += ch }
    } else {
      if (ch === '"')                { inQuote = true }
      else if (ch === ',')           { row.push(field); field = '' }
      else if (ch === '\r' && next === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
      else if (ch === '\n' || ch === '\r')   { row.push(field); rows.push(row); row = []; field = '' }
      else                           { field += ch }
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }

  const headers = rows[0]?.map(h => h.trim()) ?? []
  return rows.slice(1)
    .filter(r => r.some(cell => cell.trim()))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])))
}

// ── Payment number generator ─────────────────────────────────────────────────
// Mirrors AutoNumberInput.generateLocally() for fixedPrefix = 'PMT'.

async function generatePaymentNumber(client: ReturnType<typeof createClient>, dateStr: string): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix    = `PMT-${yearMonth}-`

  const existing  = await client.fetch<string[]>(
    `*[_type == "payment" && defined(paymentNumber)].paymentNumber`,
  )
  const taken = new Set(
    (existing ?? [])
      .filter(n => n.startsWith(prefix))
      .map(n => parseInt(n.slice(prefix.length), 10))
      .filter(n => !isNaN(n)),
  )
  let seq = 1
  while (taken.has(seq)) seq++
  return `${prefix}${String(seq).padStart(3, '0')}`
}

// ── Bank account lookup ──────────────────────────────────────────────────────
// Accepts full display code (e.g. "110211") or stored code (e.g. "10211").
// BankAccountInput prepends "1" to the stored code for display — we reverse that.

async function findBankAccount(client: ReturnType<typeof createClient>, displayCode: string) {
  // Strip the leading type-prefix digit if 6 chars (full code like "110211" → "10211")
  const storedCode = displayCode.length === 6 ? displayCode.slice(1) : displayCode
  const doc = await client.fetch<{ _id: string; code: string; nameTh?: string; nameEn?: string } | null>(
    `*[_type == "accountCode"
        && !(_id in path("drafts.**"))
        && type == "asset"
        && code == $code
        && isActive != false
      ][0]{ _id, code, nameTh, nameEn }`,
    { code: storedCode },
  )
  return doc
}

// ── Core: create one payment ─────────────────────────────────────────────────

interface PaymentInput {
  vendorContractNo: string
  grossAmount:      number
  vatAmount:        number
  vatType:          VatType
  paymentDate:      string
  invoiceNo:        string
  bankAccount:      string
  paymentType:      string
  notes:            string
  periodStart?:     string
  periodEnd?:       string
}

interface CreateResult {
  status:    'created' | 'skipped' | 'error'
  paymentId: string | null
  paymentNo: string | null
  message:   string
}

async function createOne(
  client:    ReturnType<typeof createClient>,
  input:     PaymentInput,
  rowLabel:  string,
): Promise<CreateResult> {
  const {
    vendorContractNo, grossAmount, vatAmount, vatType,
    paymentDate, invoiceNo, bankAccount, paymentType, notes,
    periodStart, periodEnd,
  } = input

  // ── 1. Look up service contract ──────────────────────────────────────────
  const contract = await client.fetch<{
    _id: string
    vendor: { _ref: string }
    glAccount?: { _ref: string }
  } | null>(
    `*[_type == "serviceContract"
        && vendorContractNo == $no
        && !(_id in path("drafts.**"))
      ][0]{ _id, vendor, glAccount }`,
    { no: vendorContractNo },
  )

  if (!contract) {
    return {
      status:    'error',
      paymentId: null,
      paymentNo: null,
      message:   `${rowLabel} — Service contract with vendorContractNo "${vendorContractNo}" not found.`,
    }
  }

  const contractId = contract._id
  const vendorRef  = contract.vendor?._ref
  if (!vendorRef) {
    return {
      status:    'error',
      paymentId: null,
      paymentNo: null,
      message:   `${rowLabel} — Contract ${contractId} has no vendor set.`,
    }
  }

  // ── 2. Idempotency check ─────────────────────────────────────────────────
  // paymentMethodDetails stores the vendor invoice number on creation.
  const existing = await client.fetch<{ _id: string; paymentNumber?: string } | null>(
    `*[_type == "payment"
        && !(_id in path("drafts.**"))
        && paymentMode == "service_contract_payment"
        && vendor._ref == $vendorRef
        && paymentMethodDetails == $invoiceNo
      ][0]{ _id, paymentNumber }`,
    { vendorRef, invoiceNo },
  )

  if (existing) {
    return {
      status:    'skipped',
      paymentId: existing._id,
      paymentNo: existing.paymentNumber ?? null,
      message:   `${rowLabel} — Already exists: ${existing._id} (${existing.paymentNumber ?? 'no number'})`,
    }
  }

  // ── 3. Generate payment number ───────────────────────────────────────────
  const paymentNumber = await generatePaymentNumber(client, paymentDate)

  // ── 4. Look up bank account ──────────────────────────────────────────────
  let bankAccountRef: string | undefined
  if (bankAccount) {
    const bankDoc = await findBankAccount(client, bankAccount)
    if (!bankDoc) {
      return {
        status:    'error',
        paymentId: null,
        paymentNo: null,
        message:   `${rowLabel} — Bank account code "${bankAccount}" not found.`,
      }
    }
    bankAccountRef = bankDoc._id
  }

  // ── 5. Resolve payment type ──────────────────────────────────────────────
  const resolvedPaymentType = PAYMENT_TYPE_MAP[paymentType] ?? 'transfer'

  // ── 6. Billing period ────────────────────────────────────────────────────
  const period    = defaultPeriod(paymentDate)
  const pStart    = periodStart || period.start
  const pEnd      = periodEnd   || period.end

  // ── 7. Build execution notes ─────────────────────────────────────────────
  const executionNotes = [
    notes || null,
    `Vendor invoice: ${invoiceNo}`,
  ].filter(Boolean).join('\n')

  // ── 8. Create published payment document ─────────────────────────────────
  const paymentDoc: Record<string, unknown> = {
    _type:                'payment',
    paymentMode:          'service_contract_payment',
    paymentNumber,
    paymentStatus:        'created',
    linkedServiceContract: { _type: 'reference', _ref: contractId },
    vendor:               { _type: 'reference', _ref: vendorRef },
    currency:             'THB',
    vatType,
    vatAmount,
    paymentType:          resolvedPaymentType,
    paymentAmount:        grossAmount,   // Total Obligation
    paidAmount:           grossAmount,   // Gross Amount
    paymentDate,
    paymentMethodDetails: invoiceNo,     // Idempotency key + vendor invoice reference
    executionNotes,
    receipts:             [],
    withholdingTaxRate:   'none',
    conditionMet:         false,
    isSettled:            false,
  }

  if (contract.glAccount?._ref) {
    paymentDoc.accountCode = { _type: 'reference', _ref: contract.glAccount._ref }
  }
  if (bankAccountRef) {
    paymentDoc.bankAccount = { _type: 'reference', _ref: bankAccountRef }
  }

  const created   = await client.create(paymentDoc as any)
  const paymentId = created._id

  // ── 9. Append billing entry to service contract ──────────────────────────
  const billingEntry = {
    _key:               randomKey(),
    _type:              'billingEntry',
    payment:            { _type: 'reference', _ref: paymentId },
    servicePeriodStart: pStart,
    servicePeriodEnd:   pEnd,
  }

  // Patch the published SC
  await client
    .patch(contractId)
    .setIfMissing({ payments: [] })
    .append('payments', [billingEntry])
    .commit({ autoGenerateArrayKeys: false })

  // Also patch SC draft if one exists (so Studio shows the change immediately)
  const scDraftId = `drafts.${contractId}`
  const scDraft   = await client.getDocument<{ _id: string } | null>(scDraftId)
  if (scDraft) {
    await client
      .patch(scDraftId)
      .setIfMissing({ payments: [] })
      .append('payments', [{ ...billingEntry, _key: randomKey() }])
      .commit({ autoGenerateArrayKeys: false })
  }

  return {
    status:    'created',
    paymentId,
    paymentNo: paymentNumber,
    message:   `${rowLabel} — Created ${paymentNumber} (${paymentId})  ·  Period ${pStart} – ${pEnd}`,
  }
}

// ── Validation ───────────────────────────────────────────────────────────────

function validateInput(args: Record<string, string>, rowLabel: string): PaymentInput | string {
  const required = ['vendorContractNo', 'grossAmount', 'paymentDate', 'invoiceNo', 'bankAccount']
  const missing  = required.filter(k => !args[k])
  if (missing.length) return `${rowLabel} — Missing required field(s): ${missing.join(', ')}`

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.paymentDate))
    return `${rowLabel} — Invalid paymentDate "${args.paymentDate}". Expected YYYY-MM-DD.`

  const grossAmount = parseFloat(args.grossAmount)
  if (isNaN(grossAmount) || grossAmount < 0)
    return `${rowLabel} — Invalid grossAmount "${args.grossAmount}".`

  const vatAmount = args.vatAmount ? parseFloat(args.vatAmount) : 0
  if (isNaN(vatAmount))
    return `${rowLabel} — Invalid vatAmount "${args.vatAmount}".`

  const vatType = (args.vatType || 'exclusive') as VatType
  if (!VAT_TYPES.includes(vatType))
    return `${rowLabel} — Invalid vatType "${args.vatType}". Expected: ${VAT_TYPES.join(' | ')}.`

  if (args.periodStart && !/^\d{4}-\d{2}-\d{2}$/.test(args.periodStart))
    return `${rowLabel} — Invalid periodStart "${args.periodStart}". Expected YYYY-MM-DD.`

  if (args.periodEnd && !/^\d{4}-\d{2}-\d{2}$/.test(args.periodEnd))
    return `${rowLabel} — Invalid periodEnd "${args.periodEnd}". Expected YYYY-MM-DD.`

  return {
    vendorContractNo: args.vendorContractNo,
    grossAmount,
    vatAmount,
    vatType,
    paymentDate:  args.paymentDate,
    invoiceNo:    args.invoiceNo,
    bankAccount:  args.bankAccount,
    paymentType:  args.paymentType || 'transfer',
    notes:        args.notes || '',
    periodStart:  args.periodStart || undefined,
    periodEnd:    args.periodEnd   || undefined,
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2))

  // ── Token ──────────────────────────────────────────────────────────────────
  const token = process.env.SANITY_WRITE_TOKEN
  if (!token) {
    console.error(`
SANITY_WRITE_TOKEN is not set.
Add it to .env.local in the sanity-studio/ directory, or:
  export SANITY_WRITE_TOKEN=skXXXXX
`)
    process.exit(1)
  }

  const client = createClient({
    projectId:  PROJECT_ID,
    dataset:    DATASET,
    apiVersion: API_VERSION,
    token,
    useCdn:     false,
  })

  // ── Determine mode: CSV or single ──────────────────────────────────────────
  let rows: Array<Record<string, string>>

  if (args.csv) {
    const csvPath = path.resolve(args.csv)
    if (!fs.existsSync(csvPath)) {
      console.error(`\nCSV file not found: ${csvPath}`)
      process.exit(1)
    }
    rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))
    if (rows.length === 0) {
      console.error('\nCSV contains no data rows.')
      process.exit(1)
    }
    console.log(`\nProcessing ${rows.length} row(s) from ${path.basename(csvPath)}…\n`)
  } else {
    rows = [args]
  }

  // ── Process rows ───────────────────────────────────────────────────────────
  const results: CreateResult[] = []
  const width    = String(rows.length).length

  for (let i = 0; i < rows.length; i++) {
    const rowLabel = rows.length > 1 ? `Row ${String(i + 1).padStart(width)}/${rows.length}` : 'Payment'
    const validated = validateInput(rows[i], rowLabel)

    if (typeof validated === 'string') {
      results.push({ status: 'error', paymentId: null, paymentNo: null, message: validated })
      console.error(`✗ ${validated}`)
      continue
    }

    try {
      const result = await createOne(client, validated, rowLabel)
      results.push(result)
      const icon = result.status === 'created' ? '✓' : result.status === 'skipped' ? '↩' : '✗'
      console.log(`${icon} ${result.message}`)
    } catch (err: any) {
      const msg = `${rowLabel} — Unexpected error: ${err?.message ?? err}`
      results.push({ status: 'error', paymentId: null, paymentNo: null, message: msg })
      console.error(`✗ ${msg}`)
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  if (rows.length > 1) {
    const created = results.filter(r => r.status === 'created').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const errors  = results.filter(r => r.status === 'error').length
    console.log(`\n── Summary ─────────────────────────────────────────────`)
    console.log(`   Created : ${created}`)
    console.log(`   Skipped : ${skipped}  (already existed)`)
    console.log(`   Errors  : ${errors}`)
    console.log(`────────────────────────────────────────────────────────`)
  }

  // ── Print paymentIds for pipe/bash loop use ────────────────────────────────
  const created = results.filter(r => r.status === 'created' && r.paymentId)
  if (created.length > 0) {
    console.log('\nCreated payment IDs (for uploadReceiptToPayment):')
    created.forEach(r => console.log(`  ${r.paymentId}  (${r.paymentNo})`))
    console.log()
  }

  // Exit non-zero if any errors
  const hasErrors = results.some(r => r.status === 'error')
  process.exit(hasErrors ? 1 : 0)
}

main().catch(err => {
  console.error('\nFatal error:', err?.message ?? err)
  process.exit(1)
})
