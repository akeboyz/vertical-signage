#!/usr/bin/env node
/**
 * Investigate whether any Sanity payments could match the 16-Dec-25 AWN
 * entries in xlsx (1,655.40 / 602.83 / 568.37 / 1.00).
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

  // 1. Any payment around Dec 16, 2025 (±15 days)
  console.log('=== Payments dated 2025-12-01 to 2025-12-31 ===')
  const decPayments = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))
        && paymentDate >= "2025-12-01"
        && paymentDate <= "2025-12-31"
      ]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, whtAmount, vatType, paymentMode,
      "vendor": vendor->shortName,
      "vendorEn": vendor->legalName_en,
      "scName": linkedServiceContract->serviceName,
      paymentMethodDetails
    } | order(paymentDate asc)`,
  )
  console.log(`Found ${decPayments.length}`)
  for (const p of decPayments) {
    const gross = Number(p.paidAmount ?? 0)
    const vat   = Number(p.vatAmount ?? 0)
    const wht   = Number(p.whtAmount ?? 0)
    const exclVat = p.vatType === 'exclusive' ? vat : 0
    const net = Math.round((gross + exclVat - wht) * 100) / 100
    console.log(`  ${p.paymentNumber}  ${p.paymentDate}  ${p.vendor ?? p.vendorEn ?? '?'}  ${p.scName ?? p.paymentMode}  paid=${gross}  vat=${vat}  wht=${wht}  net=${net}  inv=${p.paymentMethodDetails ?? '-'}`)
  }

  // 2. Any AWN/AIS-related payments with date null or pre-Jan-2026
  console.log('\n=== ALL AWN/AIS payments (any date) ===')
  const awnPayments = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))
        && (
          vendor->legalName_en match "*Wireless*" ||
          vendor->shortName == "AIS" ||
          vendor->legalName_th match "*แอดวานซ์*"
        )
      ]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, whtAmount, vatType,
      "vendor": vendor->shortName,
      "scName": linkedServiceContract->serviceName,
      paymentMethodDetails
    } | order(paymentDate asc)`,
  )
  console.log(`Found ${awnPayments.length} AWN/AIS payments`)
  for (const p of awnPayments) {
    const gross = Number(p.paidAmount ?? 0)
    const vat   = Number(p.vatAmount ?? 0)
    const wht   = Number(p.whtAmount ?? 0)
    const exclVat = p.vatType === 'exclusive' ? vat : 0
    const net = Math.round((gross + exclVat - wht) * 100) / 100
    console.log(`  ${p.paymentNumber}  ${p.paymentDate ?? '(null)'}  ${p.vendor}  ${p.scName ?? '?'}  net=${net}  inv=${p.paymentMethodDetails ?? '-'}`)
  }

  // 3. Search by exact amounts (1655.40, 602.83, 568.37, 1.00 — any combination/close)
  console.log('\n=== Payments with amounts near xlsx 16-Dec-25 entries ===')
  const targetAmounts = [1655.40, 602.83, 568.37, 1.00]
  for (const target of targetAmounts) {
    const lo = target - 1
    const hi = target + 1
    const matches = await client.fetch<any[]>(
      `*[_type=="payment" && !(_id in path("drafts.**")) && paidAmount >= $lo && paidAmount <= $hi]{
        _id, paymentNumber, paymentDate, paidAmount, vatAmount, whtAmount,
        "vendor": vendor->shortName,
        "scName": linkedServiceContract->serviceName
      }`,
      { lo, hi },
    )
    console.log(`  Target ${target}:  ${matches.length} match(es)`)
    for (const p of matches) {
      console.log(`     ${p.paymentNumber}  ${p.paymentDate ?? '(null)'}  ${p.vendor}  paid=${p.paidAmount}  ${p.scName ?? '?'}`)
    }
  }

  // 4. Same but check NET (gross + exclusive vat - wht)
  console.log('\n=== Payments with NET amount near xlsx targets ===')
  const allPayments = await client.fetch<any[]>(
    `*[_type=="payment" && !(_id in path("drafts.**"))]{
      _id, paymentNumber, paymentDate, paidAmount, vatAmount, whtAmount, vatType,
      "vendor": vendor->shortName,
      "scName": linkedServiceContract->serviceName
    }`,
  )
  for (const target of targetAmounts) {
    for (const p of allPayments) {
      const gross = Number(p.paidAmount ?? 0)
      const vat   = Number(p.vatAmount ?? 0)
      const wht   = Number(p.whtAmount ?? 0)
      const exclVat = p.vatType === 'exclusive' ? vat : 0
      const net = Math.round((gross + exclVat - wht) * 100) / 100
      if (Math.abs(net - target) < 1) {
        console.log(`  NET ${net} ≈ target ${target}:  ${p.paymentNumber}  ${p.paymentDate ?? '(null)'}  ${p.vendor}  ${p.scName ?? '?'}`)
      }
    }
  }
}

main().catch(err => { console.error('FAIL:', err.message); process.exit(1) })
