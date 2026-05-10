/**
 * AutoPaymentProcurementStatusInput
 *
 * Reads the linked procurements[] array, fetches each procurement's raw
 * delivery fields, derives each status via deriveProcurementStatus(), then
 * sets procurementStatus to the least-advanced status across all of them
 * (i.e. overall status is only as good as the worst-case linked procurement).
 */

import { useEffect, useState }   from 'react'
import { Card, Text, Stack, Flex, Badge, Spinner } from '@sanity/ui'
import { set }                   from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue, useClient } from 'sanity'
import { deriveProcurementStatus } from './PipelineStatusTimeline'

// Ordered from least to most advanced — used to find the minimum
const STATUS_ORDER = [
  'created',
  'processing',
  'approved',
  'order_placed',
  'order_shipped',
  'delivered_partial',
  'delivered_rejected',
  'delivered_accepted',
]

const STATUS_LABELS: Record<string, string> = {
  created:            '📝 Created',
  processing:         '🔄 Processing',
  approved:           '✅ Approved',
  order_placed:       '📦 Order Placed',
  order_shipped:      '🚚 Order Shipped',
  delivered_accepted: '✅ Delivered — Accepted',
  delivered_partial:  '⚠️ Delivered — Partial',
  delivered_rejected: '❌ Delivered — Rejected',
}

function lowestStatus(statuses: string[]): string {
  if (statuses.length === 0) return 'created'
  let minIdx = STATUS_ORDER.length
  for (const s of statuses) {
    const idx = STATUS_ORDER.indexOf(s)
    if (idx !== -1 && idx < minIdx) minIdx = idx
  }
  return STATUS_ORDER[minIdx] ?? 'created'
}

export function AutoPaymentProcurementStatusInput(props: StringInputProps) {
  const client          = useClient({ apiVersion: '2024-01-01' })
  const procurements    = useFormValue(['procurements'])   as Array<{ _ref: string }> | undefined
  const contractTypeRef = useFormValue(['contractType'])   as { _ref?: string } | undefined

  const [enabled, setEnabled] = useState<boolean | null>(null)  // null = loading

  // Check toggle from Process Setup
  useEffect(() => {
    const ref = contractTypeRef?._ref
    if (!ref) { setEnabled(false); return }
    client
      .fetch<{ useProcurementStatus?: boolean }>(`*[_id == $id][0]{ useProcurementStatus }`, { id: ref })
      .then(ct => setEnabled(ct?.useProcurementStatus === true))
      .catch(() => setEnabled(false))
  }, [contractTypeRef?._ref]) // eslint-disable-line react-hooks/exhaustive-deps

  const refs = (procurements ?? []).map(p => p._ref).filter(Boolean)

  // Auto-derive and patch when enabled
  useEffect(() => {
    if (!enabled) return
    if (refs.length === 0) {
      if (props.value !== 'created') props.onChange(set('created'))
      return
    }
    client
      .fetch<Array<{
        receivedStatus?:   string
        orderShippedDate?: string
        trackingNumber?:   string
        orderPlacedDate?:  string
        approvalStatus?:   string
        comparisonItems?:  unknown[]
      }>>(
        `*[_id in $ids || _id in $draftIds]{
          receivedStatus, orderShippedDate, trackingNumber,
          orderPlacedDate, approvalStatus, comparisonItems
        }`,
        { ids: refs, draftIds: refs.map(r => `drafts.${r}`) },
      )
      .then(docs => {
        const seen = new Map<string, typeof docs[0]>()
        for (const d of docs ?? []) {
          const baseId = ((d as any)._id as string ?? '').replace(/^drafts\./, '')
          if (!seen.has(baseId)) seen.set(baseId, d)
        }
        const statuses = Array.from(seen.values()).map(d => deriveProcurementStatus(d))
        const overall  = lowestStatus(statuses)
        if (props.value !== overall) props.onChange(set(overall))
      })
      .catch(() => {/* ignore */})
  }, [enabled, JSON.stringify(refs)]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle not yet loaded
  if (enabled === null) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading…</Text>
      </Flex>
    )
  }

  // Toggle off → hide entirely (no manual fallback needed on Payment)
  if (!enabled) return null

  // Toggle on → auto-derive card
  const label   = STATUS_LABELS[props.value as string ?? ''] ?? '—'
  const isEmpty = refs.length === 0

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={2}>
        <Flex align="center" justify="space-between">
          <Text size={2} weight="semibold">{label}</Text>
          <Badge tone="primary" mode="outline" fontSize={0}>Auto</Badge>
        </Flex>
        <Text size={1} muted>
          {isEmpty
            ? 'Link Procurements above to derive status automatically.'
            : `Derived from ${refs.length} linked procurement${refs.length > 1 ? 's' : ''} (least-advanced status).`}
        </Text>
      </Stack>
    </Card>
  )
}
