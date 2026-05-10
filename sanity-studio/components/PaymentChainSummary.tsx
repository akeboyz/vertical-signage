/**
 * PaymentChainSummary
 *
 * Shows the full installment chain for a payment series.
 * Reads siblings from the DB (payments sharing the same root),
 * adds the current form's paidAmount live, and displays:
 *   - Total obligation (root paymentAmount)
 *   - Each installment with status + date
 *   - Outstanding balance (auto-updated as paidAmount is typed)
 *
 * Also patches `isSettled` onto the published ROOT document whenever
 * the calculated value changes, so the parentPayment reference filter
 * can hide fully-settled roots without a subquery.
 *
 * Root = parentPayment._ref if set, otherwise this document itself.
 */

import { useEffect, useState }           from 'react'
import { useFormValue, useClient }        from 'sanity'
import { Card, Stack, Flex, Text, Box, Badge, Spinner } from '@sanity/ui'

interface ChainEntry {
  _id:            string
  paymentNumber?: string
  paidAmount?:    number
  paymentDate?:   string
  paymentStatus?: string
  isCurrent?:     boolean
}

const STATUS_TONE: Record<string, 'positive' | 'caution' | 'default' | 'critical'> = {
  complete:      'positive',
  paid:          'positive',
  processing:    'caution',
  condition_met: 'caution',
  approved:      'caution',
  submitted:     'default',
  created:       'default',
  rejected:      'critical',
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(iso?: string) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function PaymentChainSummary(_props: any) {
  const client        = useClient({ apiVersion: '2024-01-01' })
  const docId         = useFormValue(['_id'])            as string | undefined
  const parentRef     = useFormValue(['parentPayment'])  as { _ref?: string } | undefined
  const paidNow       = useFormValue(['paidAmount'])     as number | undefined
  const paymentAmount = useFormValue(['paymentAmount'])  as number | undefined

  const [loading,         setLoading]         = useState(false)
  const [totalObligation, setTotalObligation] = useState<number | null>(null)
  const [siblings,        setSiblings]        = useState<ChainEntry[]>([])

  const currentId = docId?.replace(/^drafts\./, '')
  const rootId    = parentRef?._ref ?? currentId

  useEffect(() => {
    if (!rootId) return
    setLoading(true)

    Promise.all([
      client.fetch<{ paymentAmount?: number }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){ paymentAmount }`,
        { id: rootId },
      ),
      client.fetch<ChainEntry[]>(
        `*[_type == "payment" &&
          (_id == $rootId || parentPayment._ref == $rootId) &&
          !(_id in path("drafts.**")) &&
          _id != $currentId
        ] | order(_createdAt asc) {
          _id, paymentNumber, paidAmount, paymentDate, paymentStatus
        }`,
        { rootId, currentId: currentId ?? '' },
      ),
    ])
      .then(([root, sibs]) => {
        setTotalObligation(root?.paymentAmount ?? null)
        setSiblings(sibs ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [rootId, currentId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Balance calculation (before early returns so useEffect can reference it) ──
  const obligation   = totalObligation ?? paymentAmount ?? 0
  const paidByOthers = siblings.reduce((s, e) => s + (e.paidAmount ?? 0), 0)
  const paidThisForm = paidNow ?? 0
  const totalPaid    = paidByOthers + paidThisForm
  const outstanding  = obligation - totalPaid
  const isSettled    = outstanding <= 0

  // ── Patch isSettled onto the published root doc (proper useEffect, not render body) ──
  // Uses the live form values (including unsaved draft paidAmount) so it's always current.
  useEffect(() => {
    if (loading || !rootId || !obligation) return
    client.patch(rootId).set({ isSettled }).commit().catch(() => {})
  }, [isSettled, rootId, loading, obligation]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Early returns ─────────────────────────────────────────────────────────────
  if (!paymentAmount && !totalObligation) return null

  if (loading) {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading payment chain…</Text>
      </Flex>
    )
  }

  const allEntries: ChainEntry[] = [
    ...siblings,
    { _id: currentId ?? 'current', paymentNumber: '(this payment)', paidAmount: paidThisForm, isCurrent: true },
  ]

  return (
    <Card padding={3} radius={2} tone={isSettled ? 'positive' : 'caution'} border>
      <Stack space={3}>

        {/* Header */}
        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Payment Chain</Text>
          {isSettled
            ? <Badge tone="positive" mode="outline" fontSize={0}>✅ Fully Settled</Badge>
            : <Badge tone="caution"  mode="outline" fontSize={0}>⏳ Outstanding</Badge>
          }
        </Flex>

        {/* Total obligation */}
        <Flex justify="space-between">
          <Text size={1} muted>Total Obligation</Text>
          <Text size={1} weight="semibold">{fmt(obligation)} THB</Text>
        </Flex>

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        {/* Each installment */}
        {allEntries.map((e, i) => (
          <Flex key={e._id} justify="space-between" align="center" gap={2}>
            <Flex align="center" gap={2}>
              <Text size={0} muted>#{i + 1}</Text>
              <Text size={0} style={{ opacity: e.isCurrent ? 1 : 0.7 }}>
                {e.isCurrent ? '(this payment)' : (e.paymentNumber ?? '—')}
              </Text>
              {e.paymentDate && !e.isCurrent && (
                <Text size={0} muted>{shortDate(e.paymentDate)}</Text>
              )}
            </Flex>
            <Flex align="center" gap={2}>
              {!e.isCurrent && e.paymentStatus && (
                <Badge tone={STATUS_TONE[e.paymentStatus] ?? 'default'} mode="outline" fontSize={0}>
                  {e.paymentStatus}
                </Badge>
              )}
              <Text size={1} weight={e.isCurrent ? 'semibold' : 'regular'}>
                {e.paidAmount != null ? fmt(e.paidAmount) : '—'} THB
              </Text>
            </Flex>
          </Flex>
        ))}

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        {/* Outstanding balance */}
        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Outstanding Balance</Text>
          <Text
            size={2}
            weight="semibold"
            style={{ color: isSettled ? 'var(--card-positive-fg-color)' : 'var(--card-caution-fg-color)' }}
          >
            {fmt(Math.max(0, outstanding))} THB
          </Text>
        </Flex>

      </Stack>
    </Card>
  )
}
