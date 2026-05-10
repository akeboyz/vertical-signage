import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useClient }      from 'sanity'
import { IntentLink }     from 'sanity/router'
import { Card, Stack, Text, Flex, Button, Spinner, Box } from '@sanity/ui'
import { useFiscalYears } from '../hooks/useFiscalYears'

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function toCSV(rows: string[][]): string {
  return rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
}
function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

interface DeprEntry {
  glStatus:  string | null
  entryDate: string | null
  lines:     Array<{ cr: number }>
}

interface AssetRow {
  _id:                string
  assetTag:           string | null
  brand:              string | null
  model:              string | null
  assetType:          string | null
  receivedDate:       string | null
  status:             string | null
  depreciationMethod: string | null
  usefulLifeMonths:   number | null
  unitCost:           number
  additionalCostTotal: number
  glCode:             string | null
  glName:             string | null
  accountCodeRef:     string | null
  currentSite:        string | null
  deprEntries:        DeprEntry[] | null
}

const QUERY = `
  *[_type == "asset" && !(_id in path("drafts.**"))] | order(assetTag asc) {
    _id,
    assetTag,
    brand,
    model,
    assetType,
    receivedDate,
    status,
    depreciationMethod,
    usefulLifeMonths,
    "unitCost":           coalesce(unitCost, 0),
    "additionalCostTotal": coalesce(math::sum(additionalCostSources[].allocatedCost), 0),
    "glCode":                accountCode->code,
    "glName":                coalesce(accountCode->nameTh, accountCode->nameEn),
    "accountCodeRef":        accountCode._ref,
    "currentSite":           utilization[!defined(endDate)][0].projectSite->projectEn,
    "deprEntries":           depreciationEntries[]->{
      "glStatus":  accountingEntry.glStatus,
      "entryDate": accountingEntry.entryDate,
      "lines":     accountingEntry.lines[]{ "cr": coalesce(creditAmount, 0) }
    }
  }
`

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  in_storage:     { label: '📦 In Storage',     color: '#6B7280' },
  installed:      { label: '✅ Installed',       color: '#22C55E' },
  under_repair:   { label: '🔧 Under Repair',   color: '#F97316' },
  decommissioned: { label: '⛔ Decommissioned', color: '#EF4444' },
  returned:       { label: '↩️ Returned',        color: '#6B7280' },
}

const DEPR_LABEL: Record<string, string> = {
  straight_line: 'Straight-line',
  immediate:     'Immediate',
}

function fmtType(t: string | null): string {
  if (!t) return '(Unknown)'
  return t.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

const AR_FILTER_KEY         = 'ar:periodFilter'
const AR_ACCOUNT_FILTER_KEY = 'ar:accountFilter'

function getInitialPeriod() {
  try {
    const raw = localStorage.getItem(AR_FILTER_KEY)
    if (raw) {
      localStorage.removeItem(AR_FILTER_KEY)
      const h = JSON.parse(raw) as { from?: string; to?: string; activeId?: string }
      if (h.from || h.to) return { from: h.from ?? '', to: h.to ?? '', activeId: h.activeId ?? '' }
    }
  } catch {}
  return { from: '', to: '', activeId: '' }
}

function getInitialAccountFilter(): string | null {
  try {
    const raw = localStorage.getItem(AR_ACCOUNT_FILTER_KEY)
    if (raw) {
      localStorage.removeItem(AR_ACCOUNT_FILTER_KEY)
      const h = JSON.parse(raw) as { accountCodeRef?: string }
      return h.accountCodeRef ?? null
    }
  } catch {}
  return null
}

export function AssetRegisterView(_props: any) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const fyYears = useFiscalYears()

  const ALL_STATUSES    = ['in_storage', 'installed', 'under_repair', 'decommissioned', 'returned']
  const ACTIVE_STATUSES = new Set(['in_storage', 'installed', 'under_repair'])

  const [{ from: initFrom, to: initTo, activeId: initActiveId }] = useState(getInitialPeriod)
  const [activeId,           setActiveId]           = useState(initActiveId)
  const [from,               setFrom]               = useState(initFrom)
  const [to,                 setTo]                 = useState(initTo)
  const [assets,             setAssets]             = useState<AssetRow[]>([])
  const [loading,            setLoading]            = useState(true)
  const [selectedStatuses,   setSelectedStatuses]   = useState<Set<string>>(new Set(ACTIVE_STATUSES))
  const [accountCodeFilterRef, setAccountCodeFilterRef] = useState<string | null>(getInitialAccountFilter)
  const [accountCodes,         setAccountCodes]         = useState<{ _id: string; parentId: string | null; code: string | null; nameTh: string | null; nameEn: string | null }[]>([])

  const toggleStatus = (s: string) =>
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s); else next.add(s)
      return next
    })
  const isAllSelected    = ALL_STATUSES.every(s => selectedStatuses.has(s))
  const isActiveSelected = ['in_storage','installed','under_repair'].every(s => selectedStatuses.has(s)) &&
                           !selectedStatuses.has('decommissioned') && !selectedStatuses.has('returned')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await client.fetch<AssetRow[]>(QUERY)
      setAssets(data ?? [])
    } finally {
      setLoading(false)
    }
  }, [client]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
    const sub = client
      .listen('*[_type in ["asset", "journalEntry"] && !(_id in path("drafts.**"))]')
      .subscribe(event => { if (event.type === 'mutation') load() })
    return () => sub.unsubscribe()
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    client
      .fetch<{ _id: string; parentId: string | null; code: string | null; nameTh: string | null; nameEn: string | null }[]>(
        `*[_type == "accountCode" && !(_id in path("drafts.**"))] { _id, "parentId": parentCode._ref, code, nameTh, nameEn }`
      )
      .then(data => setAccountCodes(data ?? []))
      .catch(() => {})
  }, [client])

  // ── Computed helpers ──────────────────────────────────────────────────────

  const totalCost = (a: AssetRow) => a.unitCost + (a.additionalCostTotal ?? 0)

  const accumDepr = (a: AssetRow) => {
    if (a.depreciationMethod === 'immediate') return totalCost(a)
    return (a.deprEntries ?? [])
      .filter(e => e != null && e.glStatus === 'posted' && (!to || !e.entryDate || e.entryDate <= to))
      .reduce((s, e) => s + (e.lines ?? []).reduce((ls, l) => ls + l.cr, 0), 0)
  }

  const nbv = (a: AssetRow) => totalCost(a) - accumDepr(a)

  const periodDepr = (a: AssetRow): number | null => {
    if (!from && !to) return null
    return (a.deprEntries ?? [])
      .filter(e => e != null && e.glStatus === 'posted' &&
        (!from || !e.entryDate || e.entryDate >= from) &&
        (!to   || !e.entryDate || e.entryDate <= to))
      .reduce((s, e) => s + (e.lines ?? []).reduce((ls, l) => ls + l.cr, 0), 0)
  }

  // ── Filter & group ────────────────────────────────────────────────────────

  // ── Descendant account set for group-aware filtering ─────────────────────

  const descendantSet = useMemo<Set<string> | null>(() => {
    if (!accountCodeFilterRef) return null
    const children: Record<string, string[]> = {}
    for (const ac of accountCodes) {
      if (ac.parentId) {
        if (!children[ac.parentId]) children[ac.parentId] = []
        children[ac.parentId].push(ac._id)
      }
    }
    const result = new Set<string>()
    const walk = (id: string) => {
      result.add(id)
      for (const child of (children[id] ?? [])) walk(child)
    }
    walk(accountCodeFilterRef)
    return result
  }, [accountCodeFilterRef, accountCodes])

  // ── Filter & group ────────────────────────────────────────────────────────

  const filtered = assets.filter(a =>
    selectedStatuses.has(a.status ?? 'in_storage') &&
    (!to || !a.receivedDate || a.receivedDate <= to) &&
    (!descendantSet || descendantSet.has(a.accountCodeRef ?? ''))
  )

  const accountFilterCode = accountCodeFilterRef
    ? accountCodes.find(ac => ac._id === accountCodeFilterRef)
    : null

  const fmtDate = (s: string) => {
    if (!s) return ''
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }

  const filterSegments: string[] = []
  if (from || to) {
    const parts = [from ? fmtDate(from) : '…', to ? fmtDate(to) : '…']
    filterSegments.push(`Period [${parts.join(' – ')}]`)
  }
  if (!isAllSelected) {
    filterSegments.push(`Status [${isActiveSelected ? 'Active' : `${selectedStatuses.size} selected`}]`)
  }
  if (accountCodeFilterRef && accountFilterCode) {
    const glLabel = [accountFilterCode.code, accountFilterCode.nameTh ?? accountFilterCode.nameEn].filter(Boolean).join(' ')
    const subNote = descendantSet && descendantSet.size > 1
      ? ` (incl. ${descendantSet.size - 1} sub-account${descendantSet.size - 1 !== 1 ? 's' : ''})`
      : ''
    filterSegments.push(`GL [${glLabel}]${subNote}`)
  }

  const groups = filtered.reduce<Record<string, AssetRow[]>>((acc, a) => {
    const key = a.assetType ?? '(Unknown)'
    if (!acc[key]) acc[key] = []
    acc[key].push(a)
    return acc
  }, {})

  const grandCost       = filtered.reduce((s, a) => s + totalCost(a), 0)
  const grandDepr       = filtered.reduce((s, a) => s + accumDepr(a), 0)
  const grandNBV        = filtered.reduce((s, a) => s + nbv(a), 0)
  const grandPeriodDepr = (!from && !to) ? null : filtered.reduce((s, a) => s + (periodDepr(a) ?? 0), 0)

  // ── CSV Export ────────────────────────────────────────────────────────────

  const exportCSV = () => {
    const header = [
      'Asset Tag', 'Brand', 'Model', 'Type', 'GL Account',
      'Received Date', 'Total Cost (THB)', 'Method', 'Useful Life (mo.)',
      'Accum. Depr. (THB)', 'Depr. (Period) (THB)', 'NBV (THB)', 'Status', 'Location',
    ]
    const rows: string[][] = [header]

    for (const [type, typeAssets] of Object.entries(groups)) {
      rows.push([`--- ${fmtType(type)} ---`, '', '', '', '', '', '', '', '', '', '', '', '', ''])
      for (const a of typeAssets) {
        const cost   = totalCost(a)
        const depr   = accumDepr(a)
        const pDepr  = periodDepr(a)
        const value  = nbv(a)
        rows.push([
          a.assetTag ?? '',
          a.brand ?? '',
          a.model ?? '',
          fmtType(a.assetType),
          a.glCode ? `${a.glCode} ${a.glName ?? ''}`.trim() : '',
          a.receivedDate ?? '',
          String(cost),
          DEPR_LABEL[a.depreciationMethod ?? ''] ?? a.depreciationMethod ?? '',
          a.usefulLifeMonths != null ? String(a.usefulLifeMonths) : '',
          String(depr),
          pDepr !== null ? String(pDepr) : '—',
          String(value),
          STATUS_LABEL[a.status ?? '']?.label ?? a.status ?? '',
          a.currentSite ?? '',
        ])
      }
      const gCost  = typeAssets.reduce((s, a) => s + totalCost(a), 0)
      const gDepr  = typeAssets.reduce((s, a) => s + accumDepr(a), 0)
      const gNBV   = typeAssets.reduce((s, a) => s + nbv(a), 0)
      const gPDepr = (!from && !to) ? null : typeAssets.reduce((s, a) => s + (periodDepr(a) ?? 0), 0)
      rows.push(['', `Subtotal — ${fmtType(type)}`, '', '', '', '', String(gCost), '', '', String(gDepr), gPDepr !== null ? String(gPDepr) : '—', String(gNBV), '', ''])
    }
    rows.push(['', 'Grand Total', '', '', '', '', String(grandCost), '', '', String(grandDepr), grandPeriodDepr !== null ? String(grandPeriodDepr) : '—', String(grandNBV), '', ''])
    downloadCSV(toCSV(rows), `asset-register_as-of_${to || 'all'}.csv`)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const th = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '7px 10px', textAlign: align, fontSize: 11, fontWeight: 700,
    background: 'var(--card-muted-bg-color)', borderBottom: '2px solid var(--card-border-color)',
    whiteSpace: 'nowrap', letterSpacing: '0.04em', textTransform: 'uppercase',
  })
  const td = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '5px 10px', fontSize: 12, textAlign: align,
    borderBottom: '1px solid var(--card-border-color)', verticalAlign: 'middle',
  })
  const tdGroup = (): React.CSSProperties => ({
    padding: '6px 10px', fontSize: 12, fontWeight: 700,
    background: 'var(--card-muted-bg-color)',
    borderBottom: '1px solid var(--card-border-color)',
    borderLeft: '3px solid var(--card-border-color)',
  })
  const tdSub = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '5px 10px', fontSize: 12, fontWeight: 600, textAlign: align,
    background: 'var(--card-muted-bg-color)',
    borderTop: '2px solid var(--card-border-color)',
    borderBottom: '2px solid var(--card-border-color)',
  })
  const tdGrand = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    padding: '6px 10px', fontSize: 13, fontWeight: 700, textAlign: align,
    background: 'var(--card-muted-bg-color)',
    borderTop: '3px double var(--card-border-color)',
    borderBottom: '3px double var(--card-border-color)',
  })

  const inputStyle: React.CSSProperties = {
    padding: '5px 10px', borderRadius: 4, fontSize: 12,
    border: '1px solid var(--card-border-color)',
    background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card padding={4} tone="default">
      <Stack space={4}>

        {/* ── Period selector ── */}
        <Card padding={3} radius={2} border>
          <Stack space={2}>
            {fyYears.length > 0 && (
              <Flex gap={2} wrap="wrap" align="center">
                <Text size={0} muted>Fiscal Year</Text>
                {fyYears.map(fy => (
                  <Button key={fy.id} text={fy.label}
                    mode={activeId === fy.id ? 'default' : 'ghost'}
                    tone={activeId === fy.id ? 'primary' : 'default'}
                    fontSize={1} padding={2}
                    onClick={() => { setActiveId(fy.id); setFrom(fy.from); setTo(fy.to) }}
                  />
                ))}
              </Flex>
            )}
            <Flex gap={3} align="center" wrap="wrap">
              <Flex align="center" gap={2}>
                <Text size={1} muted>From</Text>
                <input type="date" value={from}
                  onChange={e => { setActiveId(''); setFrom(e.target.value) }}
                  style={inputStyle}
                />
              </Flex>
              <Flex align="center" gap={2}>
                <Text size={1} muted>To</Text>
                <input type="date" value={to}
                  onChange={e => { setActiveId(''); setTo(e.target.value) }}
                  style={inputStyle}
                />
              </Flex>
              {(from || to) && (
                <Button mode="ghost" tone="critical" text="Clear" padding={2} fontSize={1}
                  onClick={() => { setActiveId(''); setFrom(''); setTo('') }}
                />
              )}
            </Flex>
          </Stack>
        </Card>

        {/* ── Status toolbar ── */}
        <Card padding={3} radius={2} border>
          <Flex gap={3} align="center" wrap="wrap" justify="space-between">
            <Flex gap={3} align="center" wrap="wrap">
              <Button text="Active" fontSize={1} padding={2}
                mode={isActiveSelected ? 'default' : 'ghost'}
                tone={isActiveSelected ? 'primary' : 'default'}
                onClick={() => setSelectedStatuses(new Set(ACTIVE_STATUSES))}
              />
              <Button text="All" fontSize={1} padding={2}
                mode={isAllSelected ? 'default' : 'ghost'}
                tone={isAllSelected ? 'primary' : 'default'}
                onClick={() => setSelectedStatuses(new Set(ALL_STATUSES))}
              />
              <div style={{ width: 1, height: 20, background: 'var(--card-border-color)' }} />
              {ALL_STATUSES.map(s => {
                const badge = STATUS_LABEL[s]
                const on = selectedStatuses.has(s)
                return (
                  <Button key={s}
                    text={badge.label}
                    fontSize={1} padding={2}
                    mode={on ? 'default' : 'ghost'}
                    tone={on ? 'primary' : 'default'}
                    onClick={() => toggleStatus(s)}
                  />
                )
              })}
            </Flex>
            <Flex gap={2} align="center">
              {loading && <Spinner muted />}
              <Button text="⬇ Export CSV" mode="ghost" tone="default" fontSize={1} padding={2}
                disabled={loading || filtered.length === 0}
                onClick={exportCSV}
              />
            </Flex>
          </Flex>
        </Card>

        {/* ── Active filter banner ── */}
        {filterSegments.length > 0 && (
          <Card padding={3} radius={2} border tone="caution">
            <Flex align="center" gap={3} justify="space-between">
              <Text size={1}>
                {'🔍 Filtered: '}
                {filterSegments.join(' · ')}
                {' · Showing '}
                <strong>{filtered.length}</strong>
                {' of '}
                <strong>{assets.length}</strong>
                {' assets'}
              </Text>
              {accountCodeFilterRef && (
                <Button
                  text="Clear GL filter"
                  mode="ghost"
                  tone="default"
                  fontSize={1}
                  padding={2}
                  onClick={() => setAccountCodeFilterRef(null)}
                />
              )}
            </Flex>
          </Card>
        )}

        {/* ── Summary chips ── */}
        {!loading && filtered.length > 0 && (
          <Flex gap={3} wrap="wrap">
            {([
              { label: 'Total Assets',          value: String(filtered.length),                              color: '#6B7280' },
              { label: 'Total Cost',            value: fmt(grandCost),                                       color: '#3B82F6' },
              { label: 'Accum. Depr.',          value: fmt(grandDepr),                                       color: '#F97316' },
              { label: 'Depreciation for Period', value: grandPeriodDepr !== null ? fmt(grandPeriodDepr) : '—', color: '#A855F7' },
              { label: 'Net Book Value',        value: fmt(grandNBV),                                        color: '#22C55E' },
            ] as { label: string; value: string; color: string }[]).map(chip => (
              <Box key={chip.label} padding={3} style={{
                background: chip.color + '12',
                border: `1px solid ${chip.color}30`,
                borderRadius: 8, minWidth: 150,
              }}>
                <Stack space={1}>
                  <Text size={0} muted>{chip.label}</Text>
                  <Text size={2} weight="semibold" style={{ color: chip.color }}>{chip.value}</Text>
                </Stack>
              </Box>
            ))}
          </Flex>
        )}

        {/* ── Table ── */}
        {loading ? (
          <Flex justify="center" padding={6}><Spinner /></Flex>
        ) : filtered.length === 0 ? (
          <Card padding={4} border radius={2} tone="transparent">
            <Text size={1} muted align="center">No assets found.</Text>
          </Card>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr>
                  <th style={th()}>Asset Tag</th>
                  <th style={th()}>Description</th>
                  <th style={th()}>GL Account</th>
                  <th style={th()}>Received</th>
                  <th style={th('right')}>Total Cost</th>
                  <th style={th()}>Method</th>
                  <th style={th('right')}>Life (mo.)</th>
                  <th style={th('right')}>Accum. Depr.</th>
                  <th style={th('right')}>Depr. (Period)</th>
                  <th style={th('right')}>NBV</th>
                  <th style={th()}>Status</th>
                  <th style={th()}>Location</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(groups).map(([type, typeAssets]) => {
                  const gCost  = typeAssets.reduce((s, a) => s + totalCost(a), 0)
                  const gDepr  = typeAssets.reduce((s, a) => s + accumDepr(a), 0)
                  const gNBV   = typeAssets.reduce((s, a) => s + nbv(a), 0)
                  const gPDepr = (!from && !to) ? null : typeAssets.reduce((s, a) => s + (periodDepr(a) ?? 0), 0)

                  return (
                    <React.Fragment key={type}>
                      <tr>
                        <td colSpan={12} style={tdGroup()}>
                          {fmtType(type)}
                          <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--card-muted-fg-color)' }}>
                            {typeAssets.length} asset{typeAssets.length !== 1 ? 's' : ''}
                          </span>
                        </td>
                      </tr>

                      {typeAssets.map(a => {
                        const cost   = totalCost(a)
                        const depr   = accumDepr(a)
                        const pDepr  = periodDepr(a)
                        const value  = nbv(a)
                        const badge  = STATUS_LABEL[a.status ?? ''] ?? { label: a.status ?? '—', color: '#6B7280' }
                        const isImmediate = a.depreciationMethod === 'immediate'

                        return (
                          <tr key={a._id}>
                            <td style={td()}>
                              <IntentLink intent="edit" params={{ id: a._id, type: 'asset' }}
                                style={{ color: 'var(--card-link-fg-color, #2276fc)', textDecoration: 'none', fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}
                              >
                                {a.assetTag ?? '—'}
                              </IntentLink>
                            </td>
                            <td style={td()}>
                              {[a.brand, a.model].filter(Boolean).join(' ') || <span style={{ color: 'var(--card-muted-fg-color)' }}>—</span>}
                            </td>
                            <td style={td()}>
                              {a.glCode
                                ? <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                                    {a.glCode}{' '}
                                    <span style={{ color: 'var(--card-muted-fg-color)' }}>{a.glName}</span>
                                  </span>
                                : <span style={{ color: 'var(--card-muted-fg-color)' }}>—</span>
                              }
                            </td>
                            <td style={{ ...td(), whiteSpace: 'nowrap', color: 'var(--card-muted-fg-color)' }}>
                              {a.receivedDate ?? '—'}
                            </td>
                            <td style={{ ...td('right'), fontFamily: 'monospace' }}>
                              {fmt(cost)}
                            </td>
                            <td style={{ ...td(), color: 'var(--card-muted-fg-color)', fontSize: 11 }}>
                              {DEPR_LABEL[a.depreciationMethod ?? ''] ?? '—'}
                            </td>
                            <td style={{ ...td('right'), color: 'var(--card-muted-fg-color)' }}>
                              {isImmediate ? '—' : (a.usefulLifeMonths ?? '—')}
                            </td>
                            <td style={{ ...td('right'), fontFamily: 'monospace', color: depr > 0 ? '#F97316' : 'var(--card-muted-fg-color)' }}>
                              {depr > 0 ? fmt(depr) : '—'}
                            </td>
                            <td style={{ ...td('right'), fontFamily: 'monospace', color: pDepr !== null && pDepr > 0 ? '#A855F7' : 'var(--card-muted-fg-color)' }}>
                              {pDepr !== null && pDepr > 0 ? fmt(pDepr) : '—'}
                            </td>
                            <td style={{ ...td('right'), fontFamily: 'monospace', fontWeight: 600, color: value < cost * 0.1 ? '#EF4444' : undefined }}>
                              {fmt(value)}
                            </td>
                            <td style={td()}>
                              <span style={{ fontSize: 11, color: badge.color }}>{badge.label}</span>
                            </td>
                            <td style={{ ...td(), color: 'var(--card-muted-fg-color)', fontSize: 11 }}>
                              {a.currentSite ?? '—'}
                            </td>
                          </tr>
                        )
                      })}

                      <tr>
                        <td colSpan={4} style={tdSub()}>Subtotal — {fmtType(type)}</td>
                        <td style={tdSub('right')}>{fmt(gCost)}</td>
                        <td colSpan={2} style={tdSub()} />
                        <td style={tdSub('right')}>{fmt(gDepr)}</td>
                        <td style={{ ...tdSub('right'), color: gPDepr !== null && gPDepr > 0 ? '#A855F7' : undefined }}>
                          {gPDepr !== null ? fmt(gPDepr) : '—'}
                        </td>
                        <td style={tdSub('right')}>{fmt(gNBV)}</td>
                        <td colSpan={2} style={tdSub()} />
                      </tr>
                    </React.Fragment>
                  )
                })}

                <tr>
                  <td colSpan={4} style={tdGrand()}>Grand Total</td>
                  <td style={tdGrand('right')}>{fmt(grandCost)}</td>
                  <td colSpan={2} style={tdGrand()} />
                  <td style={{ ...tdGrand('right'), color: '#F97316' }}>{fmt(grandDepr)}</td>
                  <td style={{ ...tdGrand('right'), color: grandPeriodDepr !== null && grandPeriodDepr > 0 ? '#A855F7' : undefined }}>
                    {grandPeriodDepr !== null ? fmt(grandPeriodDepr) : '—'}
                  </td>
                  <td style={{ ...tdGrand('right'), color: '#22C55E' }}>{fmt(grandNBV)}</td>
                  <td colSpan={2} style={tdGrand()} />
                </tr>
              </tbody>
            </table>
          </div>
        )}

      </Stack>
    </Card>
  )
}
