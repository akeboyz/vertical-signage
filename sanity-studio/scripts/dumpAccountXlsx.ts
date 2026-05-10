#!/usr/bin/env node
/**
 * Read account.xlsx on the user's PC (where the file is fully present, not
 * an OneDrive stub) and dump every sheet to a JSON file the sandbox can read.
 */

import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

const SRC = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account/account.xlsx'
const DST = 'C:/Users/Lenovo/OneDrive - MBK Group/Documents/AquaMx/Account/account_dump.json'

function main() {
  if (!fs.existsSync(SRC)) {
    console.error(`✗ Source not found: ${SRC}`)
    process.exit(1)
  }
  console.log(`Reading ${SRC}…`)
  const wb = XLSX.readFile(SRC, { cellDates: true })
  console.log(`Sheets: ${JSON.stringify(wb.SheetNames)}`)

  const out: Record<string, any> = { sheets: {}, source: SRC, dumpedAt: new Date().toISOString() }
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn]
    const range = ws['!ref'] ?? '(empty)'
    const aoa  = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as any[][]
    const json = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false }) as any[]
    out.sheets[sn] = { range, rowCount: aoa.length, headers: aoa[0] ?? [], rowsAsArray: aoa, rowsAsJson: json }
    console.log(`  ${sn}: ${aoa.length} rows, range=${range}`)
  }

  fs.writeFileSync(DST, JSON.stringify(out, null, 2), 'utf8')
  console.log(`✓ Wrote ${DST}`)
}

main()
