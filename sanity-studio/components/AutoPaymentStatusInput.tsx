/**
 * AutoPaymentStatusInput
 *
 * Auto-derives paymentStatus from the Payment document's own fields:
 *   receipts[]        → complete
 *   paymentDate       → paid
 *   conditionMet      → condition_met
 *   approvalStatus === 'approved' → approved
 *   approvalStatus === 'rejected' → rejected
 *   submittedDate / submittedBy   → submitted
 *   else                          → created
 *
 * Patches the paymentStatus field automatically. Never shows radio buttons.
 */

import { useEffect }             from 'react'
import { Card, Text }            from '@sanity/ui'
import { set }                   from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue }          from 'sanity'

export function derivePaymentStatusFromDoc(doc: {
  receipts?:       unknown[]
  paymentDate?:    string
  conditionMet?:   boolean
  approvalStatus?: string
  submittedDate?:  string
  submittedBy?:    string
}): string {
  if ((doc.receipts ?? []).length > 0)    return 'complete'
  if (doc.paymentDate)                    return 'paid'
  if (doc.conditionMet === true)          return 'condition_met'
  if (doc.approvalStatus === 'approved')  return 'approved'
  if (doc.approvalStatus === 'rejected')  return 'rejected'
  if (doc.submittedDate || doc.submittedBy) return 'submitted'
  return 'created'
}

const STATUS_LABELS: Record<string, string> = {
  created:       '📝 Created',
  submitted:     '📤 Submitted',
  approved:      '✅ Approved',
  rejected:      '❌ Rejected',
  condition_met: '🔍 Condition Met',
  processing:    '🔄 Processing',
  paid:          '💳 Paid',
  complete:      '🧾 Receipt Collected',
}

export function AutoPaymentStatusInput(props: StringInputProps) {
  const doc    = useFormValue([]) as any
  const status = derivePaymentStatusFromDoc(doc)

  useEffect(() => {
    if (props.value === status || props.readOnly) return
    try { props.onChange(set(status)) } catch { /* document is read-only or approval-locked */ }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Text size={2} weight="semibold">{STATUS_LABELS[status] ?? status}</Text>
      <Text size={1} muted style={{ marginTop: 4 }}>
        Auto-derived from completed steps. Updates when you save.
      </Text>
    </Card>
  )
}
