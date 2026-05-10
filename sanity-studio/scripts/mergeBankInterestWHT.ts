#!/usr/bin/env node
/**
 * Now that Receipt schema supports whtAmount + whtRate, merge the 3 bank
 * interest events into single Receipts:
 *
 *   - Patch each Receipt: set whtAmount + whtRate, adjust totalAmount to NET
 *   - Delete the 3 separate WHT Payment docs (no longer needed)
 *   - Update xlsx: WHT rows now point to the same RCT- as the interest row
 *
 * Mapping:
 *   RCT-2506-001  +  PMT-2506-001  →  RCT-2506-001 (with WHT)
 *   RCT-2512-001  +  PMT-2512-003  →  RCT-2512-001 (with WHT)
 *   RCT-2512-002  +  PMT-2512-004  →  RCT-2512-002 (with WHT)
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

const ACCT       = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const XLSX_FILE  = `${ACCT}/account_v3.xlsx`

interface MergeOp {
  receiptNumber: string
  receiptId:     string
  paymentNumber: string         // WHT payment to delete
  paymentId:     string
  gross:         number
  whtAmount:     number
  net:           number
}

const MERGES: MergeOp[] = [
  { receiptNumber: 'RCT-2506-001', receiptId: '1816bc4b3b589b24', paymentNumber: 'PMT-2506-001', paymentId: '3f47ef54c3113ac9', gross: 262.98, whtAmount: 2.63, net: 260.35 },
  { receiptNumber: 'RCT-2512-001', receiptId: 'b8369e79a51a8316', paymentNumber: 'PMT-2512-003', paymentId: '5e9b1e0bdb8ae648', gross: 88.44,  whtAmount: 0.88, net: 87.56  },
  { receiptNumber: 'RCT-2512-002', receiptId: 'ee601563d3ac7f92', paymentNumber: 'PMT-2512-004', paymentId: 'e7ad89ecbb1b7af5', gross: 145.55, whtAmount: 1.46, net: 144.09 },
]

async function main() {
  const token = process.env.SANITY_WRITE_TOKEN!
  const client = createClient({
    projectId: 'awjj9g8u', dataset: 'production', apiVersion: '2024-01-01', token, useCdn: false,
  })

  // ── 1. Patch each Receipt + delete paired Payment ───────────────────────
  console.log('=== Step 1: Merge in Sanity ===')
  for (const m of MERGES) {
    console.log(`\n--- ${m.receiptNumber} ←→ ${m.paymentNumber} ---`)

    // Patch Receipt
    try {
      await client.patch(m.receiptId).set({
        whtRate:     '1',
        whtAmount:   m.whtAmount,
        totalAmount: m.net,
        internalNotes: `Bank interest ${m.gross}, WHT 1% (${m.whtAmount}) deducted at source. Net cash credited: ${m.net}. WHT is recoverable as tax credit on annual return.`,
      }).commit()
      console.log(`  ✓ patched ${m.receiptNumber}: whtAmount=${m.whtAmount}, totalAmount ${m.gross} → ${m.net}`)
    } catch (e: any) {
      console.error(`  ✗ patch failed: ${e.message}`)
      continue
    }

    // Delete paired Payment
    try {
      await client.delete(m.paymentId)
      console.log(`  ✓ deleted ${m.paymentNumber}`)
    } catch (e: any) {
      console.error(`  ✗ delete failed: ${e.message}`)
    }
  }

  // ── 2. Update xlsx: replace PMT- in WHT rows with RCT- ─────────────────
  console.log('\n=== Step 2: xlsx ===')
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  const headerRow: any[] = aoa[0] ?? []
  const paymentRefCol = headerRow.findIndex((h: any) => String(h ?? '').trim().toLowerCase() === 'payment ref')

  // Find each cell that contains a deleted PMT-xxx and replace with the
  // corresponding RCT-xxx
  let changed = 0
  for (let r = 1; r < aoa.length; r++) {
    const cellAddr = XLSX.utils.encode_cell({ r, c: paymentRefCol })
    const v = ws[cellAddr]?.v
    if (!v) continue
    let str = String(v)
    let originalStr = str
    for (const m of MERGES) {
      if (str.includes(m.paymentNumber)) {
        // Replace PMT-xxx with RCT-xxx, but if RCT already there, just remove PMT
        if (str.includes(m.receiptNumber)) {
          // Already has RCT — strip PMT (and surrounding ", ")
          str = str.replace(new RegExp(`,\\s*${m.paymentNumber}|${m.paymentNumber}\\s*,\\s*|${m.paymentNumber}`, 'g'), '').trim()
        } else {
          str = str.replace(m.paymentNumber, m.receiptNumber)
        }
      }
    }
    if (str !== originalStr) {
      ws[cellAddr] = { t: 's', v: str }
      console.log(`  ${cellAddr}  "${originalStr}" → "${str}"`)
      changed++
    }
  }
  console.log(`  changed: ${changed} cells`)

  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`\n✓ Saved ${XLSX_FILE}`)

  // ── 3. Verify ───────────────────────────────────────────────────────────
  console.log('\n=== Step 3: Verify ===')
  for (const m of MERGES) {
    const r = await client.getDocument<any>(m.receiptId)
    const p = await client.getDocument<any>(m.paymentId)
    console.log(`  ${m.receiptNumber}: subtotal=${r?.subtotal}  whtAmount=${r?.whtAmount}  totalAmount=${r?.totalAmount}  whtRate=${r?.whtRate}`)
    console.log(`  ${m.paymentNumber}: ${p ? 'STILL EXISTS ⚠' : 'deleted ✓'}`)
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
