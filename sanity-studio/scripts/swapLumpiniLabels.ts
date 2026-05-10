#!/usr/bin/env node
/**
 * Swap the category labels of two Lumpini 24 rows in account_v3.xlsx:
 *   3-Jul-25  lumpini 24  "deposit" → "rental"
 *   9-Jul-25  lumpini 24  "rental"  → "deposit"
 *
 * The original xlsx had the labels reversed compared to the actual LPP
 * receipts (#6807000026 dated 03/07/2568 = rental Jul; #6807000052 dated
 * 09/07/2568 = security deposit / เงินค้ำประกัน).
 */

import * as XLSX from 'xlsx'

const ACCT      = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account'
const XLSX_FILE = `${ACCT}/account_v3.xlsx`

async function main() {
  console.log(`Reading ${XLSX_FILE}…`)
  const wb = XLSX.readFile(XLSX_FILE, { cellDates: false })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]

  // Find both rows
  let rowJulRental: number = -1   // 3-Jul-25  currently labelled "deposit", needs "rental"
  let rowJulDeposit: number = -1  // 9-Jul-25  currently labelled "rental",  needs "deposit"

  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i]
    if (!r) continue
    const date     = String(r[0] ?? '').trim()
    const vendor   = String(r[2] ?? '').trim().toLowerCase()
    const category = String(r[3] ?? '').trim().toLowerCase()
    if (vendor !== 'lumpini 24') continue
    if (date === '3-Jul-25' && category === 'deposit') rowJulRental  = i
    if (date === '9-Jul-25' && category === 'rental')  rowJulDeposit = i
  }

  if (rowJulRental < 0 || rowJulDeposit < 0) {
    console.error(`✗ ABORT — could not find both rows.`)
    console.error(`  3-Jul-25/deposit row: ${rowJulRental >= 0 ? `Excel row ${rowJulRental + 1}` : 'NOT FOUND'}`)
    console.error(`  9-Jul-25/rental  row: ${rowJulDeposit >= 0 ? `Excel row ${rowJulDeposit + 1}` : 'NOT FOUND'}`)
    process.exit(1)
  }

  console.log(`Found:`)
  console.log(`  Excel row ${rowJulRental + 1}  3-Jul-25  current="deposit"  →  swap to "rental"`)
  console.log(`  Excel row ${rowJulDeposit + 1}  9-Jul-25  current="rental"   →  swap to "deposit"`)

  // Column D (index 3) holds the category
  const cellRental  = XLSX.utils.encode_cell({ r: rowJulRental,  c: 3 })
  const cellDeposit = XLSX.utils.encode_cell({ r: rowJulDeposit, c: 3 })

  console.log(`\nBefore:`)
  console.log(`  ${cellRental}  = "${ws[cellRental]?.v}"`)
  console.log(`  ${cellDeposit} = "${ws[cellDeposit]?.v}"`)

  ws[cellRental]  = { t: 's', v: 'rental' }
  ws[cellDeposit] = { t: 's', v: 'deposit' }

  console.log(`\nAfter:`)
  console.log(`  ${cellRental}  = "${ws[cellRental].v}"`)
  console.log(`  ${cellDeposit} = "${ws[cellDeposit].v}"`)

  XLSX.writeFile(wb, XLSX_FILE)
  console.log(`\n✓ Saved ${XLSX_FILE}`)
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
