import { useEffect, useState }        from 'react'
import { Card, Text }                  from '@sanity/ui'
import { set }                         from 'sanity'
import type { StringInputProps }       from 'sanity'
import { useFormValue, useClient }     from 'sanity'
import { deriveProcurementStatus }     from './PipelineStatusTimeline'

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

export function AutoProcurementStatusInput(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const doc    = useFormValue([]) as any
  const docId  = useFormValue(['_id']) as string | undefined

  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null)

  const procId = docId?.replace(/^drafts\./, '')

  // Derive delivered_* status from linked Asset Registration docs
  useEffect(() => {
    if (!procId) return
    client
      .fetch<{ receivedStatus?: string; receivedQty?: number }[]>(
        `*[_type == "asset" && $procId in costSources[]._ref && !(_id in path("drafts.**"))]{
           receivedStatus, receivedQty
         }`,
        { procId },
      )
      .then(assets => {
        if (!assets || assets.length === 0) { setDeliveryStatus(null); return }
        const hasAccepted = assets.some(a => a.receivedStatus === 'accepted')
        const hasPartial  = assets.some(a => a.receivedStatus === 'partial')
        const allRejected = assets.every(a => a.receivedStatus === 'rejected')
        if (allRejected)               setDeliveryStatus('delivered_rejected')
        else if (hasAccepted && !hasPartial) setDeliveryStatus('delivered_accepted')
        else                           setDeliveryStatus('delivered_partial')
      })
      .catch(() => setDeliveryStatus(null))
  }, [procId]) // eslint-disable-line react-hooks/exhaustive-deps

  const baseStatus = deriveProcurementStatus(doc)
  const status     = deliveryStatus ?? baseStatus

  useEffect(() => {
    if (props.value !== status) props.onChange(set(status))
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Text size={2} weight="semibold">{STATUS_LABELS[status] ?? status}</Text>
      <Text size={1} muted style={{ marginTop: 4 }}>
        Auto-derived from completed steps and linked asset registrations.
      </Text>
    </Card>
  )
}
