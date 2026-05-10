/**
 * BillingPeriodsInput
 *
 * Reads contract start date, end date, rental amount, and electricity rate
 * directly from the document's dynamicFields (Contract Fields tab) and the
 * linked contract type's fieldDefinitions — so the user never has to type
 * those values again.
 *
 * "Generate All" creates every period for the full contract duration at once.
 * "Generate Next" extends by one month when needed.
 */

import { useState, useEffect }           from 'react'
import type { ArrayOfObjectsInputProps } from 'sanity'
import { useClient, useFormValue }       from 'sanity'
import { Stack, Card, Flex, Text, Button, Box, Badge } from '@sanity/ui'
import { fmtDate } from '../utils/dateFormat'

// ── Date helpers ──────────────────────────────────────────────────────────────
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addOneMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + 1)
  return localDateStr(d)
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return localDateStr(d)
}
function monthsBetween(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end   + 'T00:00:00')
  // +1 because end is the last day of the final month, not the first day of the next
  return Math.max(1, (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1)
}
function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function calcDays(start?: string, end?: string): number | null {
  if (!start || !end) return null
  return Math.round((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86_400_000) + 1
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_ICON: Record<string, string>  = { upcoming: '🕐', due: '🔴', overdue: '🚨', paid: '✅' }
const STATUS_TONE: Record<string, string>  = { upcoming: 'default', due: 'caution', overdue: 'critical', paid: 'positive' }
const STATUS_LABEL: Record<string, string> = { upcoming: 'Upcoming', due: 'Due', overdue: 'Overdue', paid: 'Paid' }

// ── Sub-components ────────────────────────────────────────────────────────────
function Row({ label, amount, muted, bold, indent }: {
  label: string; amount: number | null; muted?: boolean; bold?: boolean; indent?: boolean
}) {
  return (
    <Flex justify="space-between" align="center" gap={3} style={indent ? { paddingLeft: 20 } : undefined}>
      <Text size={1} muted={muted} weight={bold ? 'semibold' : undefined}>{label}</Text>
      <Text size={1} muted={muted} weight={bold ? 'semibold' : undefined}
            style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {amount != null ? fmt(amount) : '—'}
      </Text>
    </Flex>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 3,
  border: '1px solid var(--card-border-color)',
  background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
  fontSize: 13, width: '100%',
}

// ── Main component ────────────────────────────────────────────────────────────
export function BillingPeriodsInput(props: ArrayOfObjectsInputProps) {
  const client        = useClient({ apiVersion: '2024-01-01' })
  const rawDocId      = useFormValue(['_id'])                     as string | undefined
  const contractStart = useFormValue(['startingDate'])            as string | undefined
  const contractEnd   = useFormValue(['endingDate'])              as string | undefined
  const ctRef         = useFormValue(['contractType', '_ref'])    as string | undefined
  const rawDyn        = useFormValue(['dynamicFields'])           as string | undefined

  const draftId = rawDocId
    ? (rawDocId.startsWith('drafts.') ? rawDocId : `drafts.${rawDocId}`)
    : undefined

  const periods       = (props.value ?? []) as any[]
  const last          = periods[periods.length - 1]
  const hasAny        = periods.length > 0
  const expectedTotal = (contractStart && contractEnd) ? monthsBetween(contractStart, contractEnd) : null
  const allGenerated  = expectedTotal != null && periods.length >= expectedTotal

  // ── Load contract type field definitions ──────────────────────────────────
  const [fieldDefs, setFieldDefs] = useState<any[]>([])
  useEffect(() => {
    if (!ctRef) return
    client
      .fetch(`coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){ fieldDefinitions }`, { id: ctRef })
      .then((ct: any) => setFieldDefs(ct?.fieldDefinitions ?? []))
      .catch(() => {})
  }, [ctRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Parse dynamic field values ────────────────────────────────────────────
  const dynValues: Record<string, string> = rawDyn
    ? (() => { try { return JSON.parse(rawDyn) } catch { return {} } })()
    : {}

  const rentalField = fieldDefs.find(
    f => f.fieldType === 'number' && /rent/i.test(f.key + ' ' + (f.label ?? ''))
  )
  const elecField = fieldDefs.find(
    f => f.fieldType === 'number' && /electric|elec/i.test(f.key + ' ' + (f.label ?? ''))
  )

  const dynRental = rentalField ? Number(dynValues[rentalField.key]) || undefined : undefined
  const dynRate   = elecField   ? Number(dynValues[elecField.key])   || undefined : undefined

  // ── Auto-derive bulk generation defaults ──────────────────────────────────
  const defaultStart  = hasAny
    ? (last?.periodEnd ? addDays(last.periodEnd, 1) : (contractStart ?? ''))
    : (contractStart ?? '')

  const defaultMonths = (defaultStart && contractEnd && defaultStart < contractEnd)
    ? String(monthsBetween(defaultStart, contractEnd))
    : '12'

  // Prefer last existing period's values (actual agreed), fall back to dynamic fields
  const defaultRental = String(last?.rentalAmount    ?? dynRental ?? '')
  const defaultRate   = String(last?.electricityRate ?? dynRate   ?? '')

  const [generating, setGenerating] = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [bulkStart,  setBulkStart]  = useState(defaultStart)
  const [bulkMonths, setBulkMonths] = useState(defaultMonths)
  const [bulkRental, setBulkRental] = useState(defaultRental)
  const [bulkRate,   setBulkRate]   = useState(defaultRate)

  // Re-sync rental/rate inputs once field defs arrive (async)
  useEffect(() => {
    if (dynRental && !bulkRental) setBulkRental(String(dynRental))
  }, [dynRental]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (dynRate && !bulkRate) setBulkRate(String(dynRate))
  }, [dynRate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Next single period ────────────────────────────────────────────────────
  const nextStart = last?.periodEnd
    ? addDays(last.periodEnd, 1)
    : (contractStart ?? new Date().toISOString().slice(0, 8) + '01')
  const nextEnd = addDays(addOneMonth(nextStart), -1)

  // ── Ensure draft exists (create from published if needed) ────────────────
  const ensureDraft = async (dId: string) => {
    const contractId = dId.replace(/^drafts\./, '')
    const base = await client.fetch(
      `coalesce(*[_id == $dId][0], *[_id == $id][0])`,
      { dId, id: contractId },
    )
    if (base && base._id !== dId) {
      await client.createIfNotExists({ ...base, _id: dId })
    }
  }

  // ── Generate all ──────────────────────────────────────────────────────────
  const handleGenerateAll = async () => {
    if (!draftId) { setError('Save the document first.'); return }
    const months = parseInt(bulkMonths, 10)
    const rental = parseFloat(bulkRental)
    const rate   = parseFloat(bulkRate)
    if (!bulkStart)            { setError('Start date is required.'); return }
    if (!months || months < 1) { setError('Number of months is required.'); return }
    if (!rental || rental < 1) { setError('Monthly rental amount is required.'); return }

    setGenerating(true)
    setError(null)
    try {
      await ensureDraft(draftId)
      const baseNumber = periods.length  // existing count → next is baseNumber + 1
      const items: any[] = []
      let start = bulkStart
      for (let i = 0; i < months; i++) {
        const end  = addDays(addOneMonth(start), -1)
        const item: Record<string, any> = {
          _type: 'billingPeriod', _key: Math.random().toString(36).slice(2, 10),
          periodNumber: baseNumber + i + 1,
          periodStart: start, periodEnd: end, accrualStatus: 'upcoming',
          rentalAmount: rental,
        }
        if (!isNaN(rate) && rate > 0) item.electricityRate = rate
        if (i === 0 && last?.meterEnd != null) item.meterStart = last.meterEnd
        items.push(item)
        start = addDays(end, 1)
      }
      await client
        .patch(draftId)
        .setIfMissing({ billingPeriods: [] })
        .append('billingPeriods', items)
        .commit({ autoGenerateArrayKeys: true })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate periods.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Generate next single ──────────────────────────────────────────────────
  const handleGenerateNext = async () => {
    if (!draftId) { setError('Save the document first.'); return }
    setGenerating(true)
    setError(null)
    try {
      await ensureDraft(draftId)
      const item: Record<string, any> = {
        _type: 'billingPeriod', _key: Math.random().toString(36).slice(2, 10),
        periodNumber: periods.length + 1,
        periodStart: nextStart, periodEnd: nextEnd, accrualStatus: 'upcoming',
      }
      if (last?.rentalAmount    != null) item.rentalAmount    = last.rentalAmount
      if (last?.electricityRate != null) item.electricityRate = last.electricityRate
      if (last?.meterEnd        != null) item.meterStart      = last.meterEnd
      await client
        .patch(draftId).setIfMissing({ billingPeriods: [] })
        .append('billingPeriods', [item])
        .commit({ autoGenerateArrayKeys: true })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to generate period.')
    } finally {
      setGenerating(false)
    }
  }

  // ── Summary rows ──────────────────────────────────────────────────────────
  const rows = periods.map((p: any, i: number) => {
    const rental   = p.rentalAmount    != null ? Number(p.rentalAmount)    : null
    const meterS   = p.meterStart      != null ? Number(p.meterStart)      : null
    const meterE   = p.meterEnd        != null ? Number(p.meterEnd)        : null
    const rate     = p.electricityRate != null ? Number(p.electricityRate) : null
    const units    = (meterS != null && meterE != null) ? Math.max(0, meterE - meterS) : null
    const elecCost = (units  != null && rate   != null) ? units * rate : null
    const total    = rental != null ? rental + (elecCost ?? 0) : null
    const days     = calcDays(p.periodStart, p.periodEnd)
    const today    = localDateStr(new Date())
    const status   = p.accrualStatus === 'paid'
      ? 'paid'
      : !p.periodStart || p.periodStart > today
        ? 'upcoming'
        : p.periodEnd && p.periodEnd < today
          ? 'overdue'
          : 'due'
    const num      = p.periodNumber ?? (i + 1)
    const label    = `${STATUS_ICON[status] ?? '🕐'} Period ${num}  ·  ${fmtDate(p.periodStart)} → ${fmtDate(p.periodEnd)}`
    return { label, rental, meterS, meterE, units, elecCost, rate, total, days, status }
  })
  const grandTotal   = rows.reduce((sum, r) => sum + (r.total ?? 0), 0)
  const statusTotals = rows.reduce((acc, r) => {
    const s = r.status in STATUS_ICON ? r.status : 'upcoming'
    if (!acc[s]) acc[s] = { count: 0, amount: 0 }
    acc[s].count  += 1
    acc[s].amount += r.total ?? 0
    return acc
  }, {} as Record<string, { count: number; amount: number }>)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Stack space={4}>

      {/* ── Generate All Periods ──────────────────────────────────────────── */}
      <Card padding={3} radius={2} border tone="primary">
        <Stack space={3}>
          <Text size={1} weight="semibold">Generate All Billing Periods</Text>

          {(contractStart || contractEnd || dynRental || dynRate) && (
            <Flex gap={2} align="center" wrap="wrap">
              <Badge tone="positive" mode="outline" fontSize={0}>Auto-filled</Badge>
              <Text size={0} muted>
                {contractStart ? `Start ${fmtDate(contractStart)}` : ''}
                {contractEnd   ? ` · end ${fmtDate(contractEnd)}` : ''}
                {contractEnd && contractStart
                  ? ` · ${monthsBetween(hasAny && last?.periodEnd ? addDays(last.periodEnd, 1) : contractStart, contractEnd)} months remaining`
                  : ''}
                {dynRental ? ` · ฿${Number(dynRental).toLocaleString()} rent` : ''}
                {dynRate   ? ` · ฿${dynRate}/unit elec` : ''}
              </Text>
            </Flex>
          )}

          <Flex gap={2} wrap="wrap">
            <Stack space={1} style={{ flex: '1 1 140px' }}>
              <Text size={0} muted weight="semibold">Start Date</Text>
              <input type="date" value={bulkStart}  onChange={e => setBulkStart(e.target.value)}  style={inputStyle} />
            </Stack>
            <Stack space={1} style={{ flex: '0 0 90px' }}>
              <Text size={0} muted weight="semibold">Months</Text>
              <input type="number" min={1} max={240} value={bulkMonths} onChange={e => setBulkMonths(e.target.value)} style={inputStyle} />
            </Stack>
            <Stack space={1} style={{ flex: '1 1 120px' }}>
              <Text size={0} muted weight="semibold">Monthly Rental (฿)</Text>
              <input type="number" min={0} value={bulkRental} placeholder="e.g. 9000" onChange={e => setBulkRental(e.target.value)} style={inputStyle} />
            </Stack>
            <Stack space={1} style={{ flex: '1 1 120px' }}>
              <Text size={0} muted weight="semibold">Electricity Rate (฿/unit)</Text>
              <input type="number" min={0} value={bulkRate} placeholder="e.g. 5" onChange={e => setBulkRate(e.target.value)} style={inputStyle} />
            </Stack>
          </Flex>

          {allGenerated ? (
            <Flex align="center" gap={2}>
              <Badge tone="positive" fontSize={0}>✅ All {expectedTotal} periods generated</Badge>
              <Text size={0} muted>Use "Generate Next Period" below to extend if needed.</Text>
            </Flex>
          ) : hasAny ? (
            <Text size={0} muted>
              {periods.length} of {expectedTotal ?? '?'} period(s) exist. This will append {parseInt(bulkMonths, 10) || '?'} more starting {bulkStart || '(set date)'}.
            </Text>
          ) : null}

          <Box>
            <Button
              text={generating
                ? 'Generating…'
                : allGenerated
                  ? `✅ All ${expectedTotal} Periods Generated`
                  : `Generate ${parseInt(bulkMonths, 10) > 0 ? parseInt(bulkMonths, 10) : ''} Periods`}
              tone={allGenerated ? 'positive' : 'primary'}
              fontSize={1}
              padding={3}
              disabled={generating || allGenerated || !draftId || !bulkStart || !bulkMonths || !bulkRental}
              onClick={handleGenerateAll}
            />
          </Box>
        </Stack>
      </Card>

      {/* ── Generate Next (one more) ──────────────────────────────────────── */}
      {hasAny && (
        <Flex align="center" gap={3} wrap="wrap">
          <Button
            text={generating ? 'Generating…' : '+ Generate Next Period'}
            tone="primary" mode="ghost" fontSize={1} padding={2}
            disabled={generating || !draftId}
            onClick={handleGenerateNext}
          />
          <Text size={0} muted>{fmtDate(nextStart)}  →  {fmtDate(nextEnd)}</Text>
        </Flex>
      )}

      {error && (
        <Text size={0} style={{ color: 'var(--card-critical-fg-color)' }}>{error}</Text>
      )}

      {/* ── Billing Summary ───────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <Card padding={4} radius={2} border tone="primary">
          <Stack space={3}>
            <Text size={1} weight="semibold"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>
              Billing Summary (THB)
            </Text>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px 16px', alignItems: 'center' }}>
              <Text size={0} muted weight="semibold">Status</Text>
              <Text size={0} muted weight="semibold" style={{ textAlign: 'right' }}>Periods</Text>
              <Text size={0} muted weight="semibold" style={{ textAlign: 'right' }}>Amount (THB)</Text>
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--card-border-color)' }} />
              {(['overdue', 'due', 'paid', 'upcoming'] as const).map(s => {
                const b = statusTotals[s]
                if (!b) return null
                return [
                  <Flex key={`${s}-label`} align="center" gap={2}>
                    <Text size={1}>{STATUS_ICON[s]}</Text>
                    <Text size={1}>{STATUS_LABEL[s]}</Text>
                  </Flex>,
                  <Text key={`${s}-count`} size={1} muted style={{ textAlign: 'right' }}>{b.count}</Text>,
                  <Text key={`${s}-amount`} size={1} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(b.amount)}
                  </Text>,
                ]
              })}
              <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--card-border-color)' }} />
              <Text size={1} weight="semibold">Total</Text>
              <Text size={1} weight="semibold" muted style={{ textAlign: 'right' }}>{rows.length}</Text>
              <Text size={1} weight="semibold" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(grandTotal)}
              </Text>
            </div>
          </Stack>
        </Card>
      )}

      {/* ── Period rows (Sanity array editor) ─────────────────────────────── */}
      {props.members.length === 0 ? (
        <Card padding={3} radius={2} border tone="caution">
          <Text size={1}>No billing periods yet. Use "Generate All Billing Periods" above.</Text>
        </Card>
      ) : (
        props.renderDefault(props)
      )}

      {/* ── Per-period billing calculation ────────────────────────────────── */}
      {rows.length > 0 && (
        <Card padding={4} radius={2} border>
          <Stack space={2}>
            {rows.map((r, i) => (
              <Stack key={i} space={2} style={r.status === 'upcoming' ? { opacity: 0.45 } : undefined}>
                <Flex justify="space-between" align="center" gap={2}>
                  <Flex align="center" gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Badge tone={STATUS_TONE[r.status] as any ?? 'default'} mode="outline" fontSize={0}>
                      {STATUS_ICON[r.status] ?? '🕐'} {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                    <Text size={1} weight={r.total != null ? 'semibold' : undefined}>
                      {r.label.replace(/^[🕐🔴🚨✅⛔📤]\s*/, '')}
                    </Text>
                  </Flex>
                  <Text size={1} weight={r.total != null ? 'semibold' : undefined}
                        style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {r.total != null ? fmt(r.total) : '—'}
                  </Text>
                </Flex>
                {r.days != null && (
                  <Flex justify="space-between" align="center" gap={3} style={{ paddingLeft: 20 }}>
                    <Text size={1} muted>Duration</Text>
                    <Text size={1} muted style={{ fontVariantNumeric: 'tabular-nums' }}>{r.days} days</Text>
                  </Flex>
                )}
                <Row label="Rental" amount={r.rental} muted indent />
                {r.elecCost != null ? (
                  <Row label={`Electricity · ${r.units} units × ฿${r.rate}/unit`} amount={r.elecCost} muted indent />
                ) : (
                  <Flex justify="space-between" align="center" gap={3} style={{ paddingLeft: 20 }}>
                    <Text size={1} muted style={{ fontStyle: 'italic' }}>
                      {(r.meterS != null || r.meterE != null)
                        ? 'Electricity · meter incomplete'
                        : 'Electricity · enter meter end when due'}
                    </Text>
                    <Text size={1} muted>—</Text>
                  </Flex>
                )}
              </Stack>
            ))}
            <Box style={{ borderTop: '1px solid var(--card-border-color)', paddingTop: 4 }}>
              <Row label="Grand Total" amount={grandTotal} bold />
            </Box>
            <Flex gap={2} align="center">
              <Badge tone="positive" mode="outline" fontSize={0}>Auto</Badge>
              <Text size={0} muted>Calculated from billing period fields above</Text>
            </Flex>
          </Stack>
        </Card>
      )}

    </Stack>
  )
}
