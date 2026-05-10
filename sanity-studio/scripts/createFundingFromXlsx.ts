#!/usr/bin/env node
/**
 * Create 2 Shareholder party docs (dummy names) and 12 Funding records
 * derived from the shareholder rows in account_v3.xlsx.
 *
 * Idempotent:
 *  - Parties: matched by exact legalName_en. Reused if exist.
 *  - Funding: matched by date + amount + party + fundingType. Skipped if exist.
 */

import { createClient } from '@sanity/client'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

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

// ── References (from discovery) ─────────────────────────────────────────────
const BANK_ACCT1_4222730983 = 'xe1H5tZ2tAHPuL66DPdKqF'   // 10211
const BANK_ACCT2_2198618716 = 'rxxWf9x75mxHsS6RdORjnd'   // 10212
const EQUITY_CALLEDUP       = 'N14pklU3DF6lmMiukUeZmu'   // 11000 Called-up capital
const LIAB_SHAREHOLDER_LOAN = 'xe1H5tZ2tAHPuL66DPyRGB'   // 11200 Loans from shareholders

interface FundingRow {
  date: string                  // YYYY-MM-DD
  amount: number                // positive
  fundingType: 'loan_repayment' | 'equity_injection'
  bankRef: string               // BANK_ACCT1 or BANK_ACCT2
  partyTag: 'SH1' | 'SH2'       // resolved at runtime to actual party _id
  bankReference?: string        // optional cheque ref like "BBL X6895"
  notes?: string
}

const ROWS: FundingRow[] = [
  // ── Account 1 (4222730983) ── default party = SH1 ───────────────────────
  { date: '2025-03-05', amount: 107187.56, fundingType: 'loan_repayment',  bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Loan repayment to shareholder (carry-forward loan)' },
  { date: '2025-05-15', amount: 10000.00,  fundingType: 'loan_repayment',  bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Loan repayment to shareholder' },
  { date: '2025-06-06', amount: 40000.00,  fundingType: 'equity_injection', bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Capital injection from shareholder' },
  { date: '2025-06-06', amount: 60000.00,  fundingType: 'loan_repayment',   bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Loan repayment to shareholder (corrected from xlsx)' },
  { date: '2025-06-06', amount: 30000.00,  fundingType: 'equity_injection', bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Capital injection from shareholder' },
  { date: '2025-08-27', amount: 40000.00,  fundingType: 'equity_injection', bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Capital injection from shareholder' },
  { date: '2025-08-28', amount: 30000.00,  fundingType: 'equity_injection', bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Capital injection from shareholder' },
  { date: '2025-08-28', amount: 30000.00,  fundingType: 'equity_injection', bankRef: BANK_ACCT1_4222730983, partyTag: 'SH1', notes: 'Capital injection from shareholder' },
  // ── Account 2 (2198618716) ──────────────────────────────────────────────
  { date: '2025-11-04', amount: 100000.00, fundingType: 'equity_injection', bankRef: BANK_ACCT2_2198618716, partyTag: 'SH1', bankReference: 'BBL X6895 SAKCHAI', notes: 'Capital injection — BBL X6895' },
  { date: '2025-11-05', amount: 25000.00,  fundingType: 'equity_injection', bankRef: BANK_ACCT2_2198618716, partyTag: 'SH1', bankReference: 'BBL X6895 SAKCHAI', notes: 'Capital injection — BBL X6895' },
  { date: '2025-11-05', amount: 150000.00, fundingType: 'equity_injection', bankRef: BANK_ACCT2_2198618716, partyTag: 'SH2', bankReference: 'BBL X3942 SAKSORN', notes: 'Capital injection — BBL X3942' },
  { date: '2025-11-07', amount: 225000.00, fundingType: 'equity_injection', bankRef: BANK_ACCT2_2198618716, partyTag: 'SH1', bankReference: 'BBL X6895 SAKCHAI', notes: 'Capital injection — BBL X6895' },
]

const INFLOW_TYPES  = new Set(['loan_drawdown', 'equity_injection', 'inter_company_loan'])
const OUTFLOW_TYPES = new Set(['loan_repayment', 'dividend_payment', 'inter_company_repay'])

function deriveDirection(t: string): 'inflow' | 'outflow' {
  if (INFLOW_TYPES.has(t))  return 'inflow'
  if (OUTFLOW_TYPES.has(t)) return 'outflow'
  throw new Error(`Unknown fundingType: ${t}`)
}

function gl(t: string): string {
  if (t === 'equity_injection') return EQUITY_CALLEDUP
  if (t === 'loan_repayment')   return LIAB_SHAREHOLDER_LOAN
  throw new Error(`No GL mapping for ${t}`)
}

function randomKey(len = 16): string {
  return crypto.randomBytes(len).toString('hex').slice(0, len)
}

async function generateFundingNumber(client: ReturnType<typeof createClient>, dateStr: string, taken: Set<string>): Promise<string> {
  const d = new Date(dateStr)
  const yearMonth = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  const prefix    = `FND-${yearMonth}-`
  let seq = 1
  while (true) {
    const candidate = `${prefix}${String(seq).padStart(3, '0')}`
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
    seq++
  }
}

async function ensureParty(client: ReturnType<typeof createClient>, legalName_en: string): Promise<string> {
  const existing = await client.fetch<any>(
    `*[_type=="party" && !(_id in path("drafts.**")) && legalName_en==$name][0]{ _id }`,
    { name: legalName_en },
  )
  if (existing) return existing._id

  const created = await client.create({
    _type: 'party',
    _id:   randomKey(16),
    legalName_en,
    identityType: 'individual',
    partyRole: ['shareholder'],
  } as any)
  console.log(`  + Created party: ${legalName_en}  id=${created._id}`)
  return created._id
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

  // ── 1. Ensure 2 shareholder parties ─────────────────────────────────────
  console.log('=== Step 1: Parties ===')
  const sh1Id = await ensureParty(client, 'Shareholder 1')
  const sh2Id = await ensureParty(client, 'Shareholder 2')
  console.log(`  SH1 = ${sh1Id}`)
  console.log(`  SH2 = ${sh2Id}`)

  // ── 2. Pre-fetch existing fundingNumbers to avoid collisions ────────────
  const existingNumbers = await client.fetch<string[]>(`*[_type=="funding" && defined(fundingNumber)].fundingNumber`)
  const takenNumbers = new Set(existingNumbers ?? [])
  console.log(`\nExisting fundingNumbers: ${takenNumbers.size}`)

  // ── 3. Create funding records ───────────────────────────────────────────
  console.log('\n=== Step 2: Funding records ===')
  const created: any[] = []
  const skipped: any[] = []

  for (const r of ROWS) {
    const partyId = r.partyTag === 'SH1' ? sh1Id : sh2Id

    // Idempotency check
    const existing = await client.fetch<any>(
      `*[_type=="funding"
          && !(_id in path("drafts.**"))
          && date == $date
          && amount == $amount
          && fundingType == $type
          && party._ref == $partyId
        ][0]{ _id, fundingNumber }`,
      { date: r.date, amount: r.amount, type: r.fundingType, partyId },
    )
    if (existing) {
      console.log(`  ✓ skip — already exists: ${existing.fundingNumber} (${existing._id})  for ${r.date} ${r.amount} ${r.fundingType}`)
      skipped.push({ ...r, existingId: existing._id, existingNumber: existing.fundingNumber })
      continue
    }

    const fundingNumber = await generateFundingNumber(client, r.date, takenNumbers)
    const direction     = deriveDirection(r.fundingType)
    const accountCodeId = gl(r.fundingType)

    const doc: Record<string, unknown> = {
      _type:           'funding',
      _id:             randomKey(16),
      fundingNumber,
      fundingType:     r.fundingType,
      direction,
      status:          'confirmed',
      date:            r.date,
      party:           { _type: 'reference', _ref: partyId },
      accountCode:     { _type: 'reference', _ref: accountCodeId },
      bankAccount:     { _type: 'reference', _ref: r.bankRef },
      amount:          r.amount,
      currency:        'THB',
      paymentMethod:   'transfer',
      ...(r.bankReference ? { bankReference: r.bankReference } : {}),
      ...(r.notes ? { internalNotes: r.notes } : {}),
    }

    const result = await client.create(doc as any)
    console.log(`  + ${fundingNumber}  ${r.date}  ${direction}  ${r.fundingType}  ${r.amount.toLocaleString()}  party=${r.partyTag}  id=${result._id}`)
    created.push({ ...r, fundingNumber, _id: result._id })
  }

  console.log(`\n=== Result ===`)
  console.log(`  parties: SH1=${sh1Id}, SH2=${sh2Id}`)
  console.log(`  created: ${created.length}`)
  console.log(`  skipped: ${skipped.length} (already existed)`)
  console.log(`  total rows: ${ROWS.length}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
