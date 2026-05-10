/**
 * DepreciationScheduleInput
 *
 * Placed on asset.depreciationSchedule (readOnly string field).
 * Reads form values to show a summary + generate depreciation journal entries.
 *
 * Trigger: "Generate Entries" button with from/to month picker.
 * Output:  one journalEntry DRAFT per month in range (skips already-generated months).
 *          DR depreciationExpenseAccount  / CR accumulatedDepreciationAccount
 * Links:   created entry base IDs are appended to asset.depreciationEntries[].
 */

import { useEffect, useState, useCallback } from 'react'
import { useFormValue, useClient }           from 'sanity'
import { Card, Stack, Flex, Text, Badge, Button, Spinner, Box } from '@sanity/ui'

const fmt  = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const genK = () => Math.random().toString(36).slice(2, 10)

function monthsInRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return []
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ey, em] = to.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

function lastDayOf(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0).getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function nowYM(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function DepreciationScheduleInput(_props: any) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const rawId       = useFormValue(['_id'])          as string | undefined
  const assetTag    = useFormValue(['assetTag'])      as string | undefined
  const unitCost    = useFormValue(['unitCost'])      as number | undefined
  const additionalCostSources = useFormValue(['additionalCostSources']) as Array<{ allocatedCost?: number }> | undefined
  const usefulLife  = useFormValue(['usefulLifeMonths']) as number | undefined
  const method      = useFormValue(['depreciationMethod']) as string | undefined
  const receivedDate = useFormValue(['receivedDate']) as string | undefined
  const expAcct     = useFormValue(['depreciationExpenseAccount'])    as { _ref?: string } | undefined
  const accumAcct   = useFormValue(['accumulatedDepreciationAccount']) as { _ref?: string } | undefined
  const entryRefs   = useFormValue(['depreciationEntries']) as Array<{ _ref?: string }> | undefined

  const assetId = rawId?.replace(/^drafts\./, '') ?? ''
  const patchTargetId = rawId ?? assetId

  const additionalTotal = (additionalCostSources ?? []).reduce((s, c) => s + (c.allocatedCost ?? 0), 0)
  const totalCost = (unitCost ?? 0) + additionalTotal

  const monthlyAmt = (totalCost > 0 && usefulLife && usefulLife > 0)
    ? Math.round((totalCost / usefulLife) * 100) / 100
    : null

  const startYM = receivedDate ? receivedDate.slice(0, 7) : null
  const endYM   = (startYM && usefulLife)
    ? (() => {
        let [y, m] = startYM.split('-').map(Number)
        m += usefulLife - 1
        while (m > 12) { m -= 12; y++ }
        return `${y}-${String(m).padStart(2, '0')}`
      })()
    : null

  const [fromMonth,      setFromMonth]      = useState('')
  const [toMonth,        setToMonth]        = useState('')
  const [generating,     setGenerating]     = useState(false)
  const [error,          setError]          = useState('')
  const [success,        setSuccess]        = useState('')
  const [coveredPeriods, setCoveredPeriods] = useState<Set<string>>(new Set())
  const [entryRows,      setEntryRows]      = useState<Array<{ id: string; period: string; status: string; ref?: string }>>([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  // Initialise pickers
  useEffect(() => {
    const ym = nowYM()
    if (!fromMonth) setFromMonth(startYM ?? ym)
    if (!toMonth)   setToMonth(ym)
  }, [startYM]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch existing entry details
  const baseIds = (entryRefs ?? []).map(r => r._ref).filter(Boolean) as string[]
  useEffect(() => {
    if (baseIds.length === 0) { setCoveredPeriods(new Set()); setEntryRows([]); return }
    setLoadingEntries(true)
    const allIds = [...baseIds, ...baseIds.map(id => `drafts.${id}`)]
    client
      .fetch<Array<{ _id: string; date?: string; journalEntryNumber?: string; glStatus?: string }>>(
        `*[_id in $ids]{ _id, date, journalEntryNumber, "glStatus": accountingEntry.glStatus }`,
        { ids: allIds },
      )
      .then(docs => {
        // Deduplicate: prefer draft over published
        const byBase = new Map<string, typeof docs[0]>()
        for (const d of docs) {
          const base = d._id.replace(/^drafts\./, '')
          const existing = byBase.get(base)
          if (!existing || d._id.startsWith('drafts.')) byBase.set(base, d)
        }
        const rows = [...byBase.values()]
          .map(d => ({
            id:     d._id.replace(/^drafts\./, ''),
            period: d.date?.slice(0, 7) ?? '?',
            status: d._id.startsWith('drafts.') ? 'draft' : (d.glStatus ?? 'draft'),
            ref:    d.journalEntryNumber,
          }))
          .sort((a, b) => a.period.localeCompare(b.period))
        setEntryRows(rows)
        setCoveredPeriods(new Set(rows.map(r => r.period)))
      })
      .catch(() => {})
      .finally(() => setLoadingEntries(false))
  }, [baseIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const canGenerate =
    !!monthlyAmt &&
    !!expAcct?._ref &&
    !!accumAcct?._ref &&
    !!fromMonth &&
    !!toMonth &&
    fromMonth <= toMonth

  const handleGenerate = useCallback(async () => {
    if (!canGenerate || !expAcct?._ref || !accumAcct?._ref) return
    setGenerating(true)
    setError('')
    setSuccess('')

    try {
      const months    = monthsInRange(fromMonth, toMonth)
      const newMonths = months.filter(m => !coveredPeriods.has(m))

      if (newMonths.length === 0) {
        setSuccess('All months in range already have entries.')
        return
      }

      const label   = assetTag ?? assetId
      const newRefs: Array<{ _key: string; _type: string; _ref: string; _weak: boolean }> = []

      for (const ym of newMonths) {
        const baseId  = crypto.randomUUID()
        const draftId = `drafts.${baseId}`
        const date    = lastDayOf(ym)
        const memo    = `Depreciation — ${label} · ${ym}`

        await client.create({
          _id:          draftId,
          _type:        'journalEntry',
          journalType:  'depreciation',
          date,
          memo,
          accountingEntry: {
            glStatus: 'draft',
            lines: [
              {
                _key:         genK(),
                accountCode:  { _type: 'reference', _ref: expAcct._ref,   _weak: true },
                description:  memo,
                debitAmount:  monthlyAmt!,
                creditAmount: 0,
              },
              {
                _key:         genK(),
                accountCode:  { _type: 'reference', _ref: accumAcct._ref, _weak: true },
                description:  `Accumulated Depreciation — ${label} · ${ym}`,
                debitAmount:  0,
                creditAmount: monthlyAmt!,
              },
            ],
          },
        })

        newRefs.push({ _key: genK(), _type: 'reference', _ref: baseId, _weak: true })
      }

      // Append refs to asset.depreciationEntries
      await client
        .patch(patchTargetId)
        .setIfMissing({ depreciationEntries: [] })
        .append('depreciationEntries', newRefs)
        .commit()

      setSuccess(`Generated ${newMonths.length} draft entr${newMonths.length === 1 ? 'y' : 'ies'}. Review in Journal Entries before posting.`)
      setCoveredPeriods(prev => new Set([...prev, ...newMonths]))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to generate entries')
    } finally {
      setGenerating(false)
    }
  }, [canGenerate, fromMonth, toMonth, coveredPeriods, monthlyAmt, expAcct, accumAcct, assetId, assetTag, patchTargetId, client])

  if (method === 'immediate') return (
    <Text size={1} muted>Immediate expense method — no periodic depreciation entries.</Text>
  )

  // ── Readiness checks ──────────────────────────────────────────────────────
  const missing: string[] = []
  if (!unitCost)       missing.push('1.10 · Primary Acquisition Cost')
  if (!usefulLife)     missing.push('1.12 · Useful Life (months)')
  if (!receivedDate)   missing.push('1.5 · Received Date')
  if (!expAcct?._ref)  missing.push('3.3 · Depreciation Expense Account')
  if (!accumAcct?._ref) missing.push('3.4 · Accumulated Depreciation Account')

  const inRange      = fromMonth && toMonth ? monthsInRange(fromMonth, toMonth) : []
  const pendingCount = inRange.filter(m => !coveredPeriods.has(m)).length

  return (
    <Stack space={4}>

      {/* Summary */}
      {monthlyAmt != null && usefulLife && startYM && (
        <Card padding={3} radius={2} tone="transparent" border>
          <Flex gap={4} wrap="wrap">
            <Stack space={1}>
              <Text size={0} muted>Total Cost</Text>
              <Text size={1} weight="semibold" style={{ fontFamily: 'monospace' }}>{fmt(totalCost)} THB</Text>
            </Stack>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--card-border-color)' }} />
            <Stack space={1}>
              <Text size={0} muted>Monthly Amount</Text>
              <Text size={1} weight="semibold" style={{ fontFamily: 'monospace' }}>{fmt(monthlyAmt)} THB</Text>
            </Stack>
            <Stack space={1}>
              <Text size={0} muted>Useful Life</Text>
              <Text size={1} weight="semibold">{usefulLife} months</Text>
            </Stack>
            <Stack space={1}>
              <Text size={0} muted>Start</Text>
              <Text size={1} weight="semibold">{startYM}</Text>
            </Stack>
            {endYM && (
              <Stack space={1}>
                <Text size={0} muted>End</Text>
                <Text size={1} weight="semibold">{endYM}</Text>
              </Stack>
            )}
            <Stack space={1}>
              <Text size={0} muted>Generated</Text>
              <Text size={1} weight="semibold">{coveredPeriods.size} / {usefulLife} periods</Text>
            </Stack>
          </Flex>
        </Card>
      )}

      {/* Missing fields warning */}
      {missing.length > 0 && (
        <Card padding={3} radius={2} tone="caution" border>
          <Stack space={2}>
            <Text size={1} weight="semibold">Set these fields before generating:</Text>
            {missing.map(f => <Text key={f} size={1} muted>· {f}</Text>)}
          </Stack>
        </Card>
      )}

      {/* Generator */}
      {missing.length === 0 && (
        <Card padding={3} radius={2} border>
          <Stack space={3}>
            <Text size={1} weight="semibold">Generate Depreciation Entries</Text>

            <Flex gap={3} align="flex-end" wrap="wrap">
              <Stack space={1}>
                <Text size={0} muted>From</Text>
                <input
                  type="month"
                  value={fromMonth}
                  min={startYM ?? undefined}
                  max={endYM ?? undefined}
                  onChange={e => setFromMonth(e.target.value)}
                  style={{
                    padding: '5px 8px', borderRadius: 4, fontSize: 13,
                    border: '1px solid var(--card-border-color)',
                    background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
                  }}
                />
              </Stack>
              <Stack space={1}>
                <Text size={0} muted>To</Text>
                <input
                  type="month"
                  value={toMonth}
                  min={fromMonth || (startYM ?? undefined)}
                  max={endYM ?? undefined}
                  onChange={e => setToMonth(e.target.value)}
                  style={{
                    padding: '5px 8px', borderRadius: 4, fontSize: 13,
                    border: '1px solid var(--card-border-color)',
                    background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
                  }}
                />
              </Stack>
              <Button
                text={generating ? 'Generating…' : `Generate ${pendingCount > 0 ? `${pendingCount} ` : ''}Entr${pendingCount === 1 ? 'y' : 'ies'}`}
                tone="primary"
                mode="default"
                fontSize={1}
                padding={3}
                disabled={!canGenerate || generating || pendingCount === 0}
                onClick={handleGenerate}
              />
            </Flex>

            {pendingCount === 0 && inRange.length > 0 && (
              <Badge tone="positive" mode="outline" fontSize={0}>All months in range already generated</Badge>
            )}

            {error   && <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>{error}</Text>}
            {success && <Badge tone="positive" mode="outline" fontSize={1}>{success}</Badge>}
          </Stack>
        </Card>
      )}

      {/* Generated entries list */}
      {loadingEntries && <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading entries…</Text></Flex>}

      {!loadingEntries && entryRows.length > 0 && (
        <Stack space={2}>
          <Text size={1} weight="semibold">Generated Entries</Text>
          <Box style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--card-muted-bg-color)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--card-border-color)' }}>Period</th>
                  <th style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--card-border-color)' }}>Amount</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--card-border-color)' }}>Reference</th>
                  <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--card-border-color)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {entryRows.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--card-border-color)' }}>
                    <td style={{ padding: '5px 10px' }}>{row.period}</td>
                    <td style={{ padding: '5px 10px', textAlign: 'right', fontFamily: 'monospace' }}>
                      {monthlyAmt != null ? fmt(monthlyAmt) : '—'}
                    </td>
                    <td style={{ padding: '5px 10px', color: 'var(--card-muted-fg-color)' }}>
                      {row.ref ?? '(draft — no number yet)'}
                    </td>
                    <td style={{ padding: '5px 10px' }}>
                      {row.status === 'posted'
                        ? <span style={{ color: 'var(--card-positive-fg-color)' }}>✅ Posted</span>
                        : <span style={{ color: 'var(--card-caution-fg-color)' }}>📝 Draft</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Stack>
      )}

    </Stack>
  )
}
