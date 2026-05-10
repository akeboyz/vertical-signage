#!/usr/bin/env node
/**
 * List ALL Sanity docs (Payment + Receipt + Funding) whose ref does NOT
 * appear in account_v3.xlsx's Payment Ref column.
 *
 * Note: handles duplicate paymentNumbers correctly — counts a Sanity doc
 * as "in xlsx" only if at least N copies of its ref appear in xlsx, where
 * N = number of Sanity docs sharing that ref.
 */

import * as XLSX from 'xlsx'
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

const ACCT      = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const XLSX_FILE = `${ACCT}/account_v3.xlsx`

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

  // ── 1. Read xlsx Payment Ref column — count occurrences of each ref ────
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]
  const headerRow: any[] = aoa[0] ?? []
  let paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')

  const xlsxRefCounts = new Map<string, number>()
  for (let i = 1; i < aoa.length; i++) {
    const v = aoa[i]?.[paymentRefCol]
    if (!v) continue
    String(v).split(',').map(s => s.trim()).filter(Boolean).forEach(r => {
      xlsxRefCounts.set(r, (xlsxRefCounts.get(r) ?? 0) + 1)
    })
  }
  console.log(`xlsx unique refs: ${xlsxRefCounts.size}, total occurrences: ${[...xlsxRefCounts.values()].reduce((a,b)=>a+b,0)}`)

  // ── 2. Pull all Sanity docs ─────────────────────────────────────────────
  const payments = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, vatType, whtAmount, paymentMode,
      "vendor": coalesce(vendor->shortName, vendor->legalName_en, "?"),
      "scName": linkedServiceContract->serviceName,
      paymentMethodDetails
    } | order(paymentDate asc, paymentNumber asc)`,
  )
  const receipts = await client.fetch<any[]>(
    `*[_type=="receipt" && !(_id in path("drafts.**"))]{
      _id, receiptNumber, issueDate, totalAmount,
      "payerName": payer->legalName_en
    }`,
  )
  const fundings = await client.fetch<any[]>(
    `*[_type=="funding" && !(_id in path("drafts.**"))]{
      _id, fundingNumber, date, amount, direction, fundingType,
      "partyName": party->legalName_en
    }`,
  )

  // ── 3. Group Sanity docs by ref. For each ref, mark first N occurrences
  //       (= xlsxRefCounts[ref]) as "matched", rest as "orphan".
  interface Doc {
    _id: string
    ref: string
    type: string
    date: string | null
    total: number
    extra: string
  }
  function netForPayment(p: any): number {
    const gross = Number(p.paidAmount ?? 0)
    const vat   = Number(p.vatAmount ?? 0)
    const wht   = Number(p.whtAmount ?? 0)
    const exclVat = p.vatType === 'exclusive' ? vat : 0
    return Math.round((gross + exclVat - wht) * 100) / 100
  }
  const allDocs: Doc[] = []
  for (const p of payments) {
    allDocs.push({
      _id: p._id,
      ref: p.paymentNumber ?? '(no#)',
      type: `payment/${p.paymentMode ?? '?'}`,
      date: p.paymentDate,
      total: netForPayment(p),
      extra: `vendor=${p.vendor}  link=${p.scName ?? '-'}  inv=${p.paymentMethodDetails ?? '-'}`,
    })
  }
  for (const r of receipts) {
    allDocs.push({
      _id: r._id,
      ref: r.receiptNumber ?? '(no#)',
      type: 'receipt',
      date: r.issueDate,
      total: Math.round(Number(r.totalAmount ?? 0) * 100) / 100,
      extra: `payer=${r.payerName ?? '?'}`,
    })
  }
  for (const f of fundings) {
    allDocs.push({
      _id: f._id,
      ref: f.fundingNumber ?? '(no#)',
      type: `funding/${f.fundingType}`,
      date: f.date,
      total: Math.round(Number(f.amount ?? 0) * 100) / 100,
      extra: `direction=${f.direction}  party=${f.partyName ?? '?'}`,
    })
  }

  // Group by ref, sort by date so that older instances "consume" first
  const byRef: Record<string, Doc[]> = {}
  for (const d of allDocs) {
    byRef[d.ref] = byRef[d.ref] ?? []
    byRef[d.ref].push(d)
  }

  const orphans: Doc[] = []
  for (const [ref, docs] of Object.entries(byRef)) {
    const xlsxCount = xlsxRefCounts.get(ref) ?? 0
    // Sort by date asc (nulls last) so dated docs match first
    docs.sort((a, b) => {
      if (a.date && !b.date) return -1
      if (!a.date && b.date) return 1
      if (a.date && b.date)  return a.date.localeCompare(b.date)
      return 0
    })
    // First xlsxCount docs are considered "matched", rest are orphan
    for (let i = xlsxCount; i < docs.length; i++) orphans.push(docs[i])
  }

  // ── 4. Report ──────────────────────────────────────────────────────────
  console.log(`\n=== Sanity totals ===`)
  console.log(`  payments: ${payments.length}`)
  console.log(`  receipts: ${receipts.length}`)
  console.log(`  fundings: ${fundings.length}`)
  console.log(`  TOTAL   : ${payments.length + receipts.length + fundings.length}`)

  console.log(`\n=== Orphans — Sanity docs NOT linked to any xlsx row ===`)
  console.log(`Found: ${orphans.length}\n`)

  // Group orphans by category
  const byType: Record<string, Doc[]> = {}
  for (const d of orphans) {
    byType[d.type] = byType[d.type] ?? []
    byType[d.type].push(d)
  }
  for (const [type, list] of Object.entries(byType)) {
    console.log(`\n  [${type}]  count=${list.length}`)
    for (const d of list) {
      console.log(`    ${d.ref}  date=${d.date ?? '(null)'}  total=${d.total.toLocaleString()}  ${d.extra}`)
    }
  }

  // JSON dump
  const reportFile = `${ACCT}/orphan_sanity_docs.json`
  fs.writeFileSync(reportFile, JSON.stringify({
    summary: {
      sanityTotal: allDocs.length,
      sanityMatched: allDocs.length - orphans.length,
      sanityOrphans: orphans.length,
    },
    orphans: orphans.map(d => ({ ref: d.ref, type: d.type, date: d.date, total: d.total, extra: d.extra, _id: d._id })),
  }, null, 2), 'utf8')
  console.log(`\n✓ Report: ${reportFile}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
