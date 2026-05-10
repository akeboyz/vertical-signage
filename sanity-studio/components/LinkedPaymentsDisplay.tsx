/**
 * LinkedPaymentsDisplay
 *
 * Read-only component — works on any document type.
 * Auto-discovers Payment documents that reference the current document via
 * `references($id)` — no manual array needed on the parent side.
 *
 * Shows: payment number (clickable) · date · status badge · gross amount
 * Footer: total gross paid + payment count.
 */

import { useEffect, useState }    from 'react'
import { useFormValue, useClient } from 'sanity'
import type { StringInputProps }  from 'sanity'
import { IntentLink }             from 'sanity/router'
import { Box, Text, Stack, Flex, Spinner, Badge, Card } from '@sanity/ui'

interface LinkedPayment {
  _id:            string
  paymentNumber?: string
  paymentStatus?: string
  paymentAmount?: number
  paidAmount?:    number
  paymentDate?:   string
  currency?:      string
  vendor?:        { legalName_en?: string; legalName_th?: string }
}

const STATUS_LABEL: Record<string, string> = {
  created:       '📝 Created',
  submitted:     '📤 Submitted',
  approved:      '✅ Approved',
  rejected:      '❌ Rejected',
  condition_met: '🔍 Condition Met',
  processing:    '🔄 Processing',
  paid:          '💳 Paid',
  complete:      '🧾 Complete',
}

const STATUS_TONE: Record<string, 'default' | 'positive' | 'caution' | 'critical'> = {
  created:       'default',
  submitted:     'caution',
  approved:      'positive',
  rejected:      'critical',
  condition_met: 'caution',
  processing:    'caution',
  paid:          'positive',
  complete:      'positive',
}

const SETTLED = new Set(['paid', 'complete'])

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtAmount(n: number, currency = 'THB'): string {
  return `${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export function LinkedPaymentsDisplay(_props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const rawId  = useFormValue(['_id']) as string | undefined
  const docId  = rawId?.replace(/^drafts\./, '')

  const [payments, setPayments] = useState<LinkedPayment[]>([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    client
      .fetch<LinkedPayment[]>(
        `*[_type == "payment" && references($id)] | order(coalesce(paymentDate, _createdAt) asc) {
          _id, paymentNumber, paymentStatus, paymentAmount, paidAmount, paymentDate, currency,
          "vendor": vendor->{ legalName_en, legalName_th }
        }`,
        { id: docId },
      )
      .then(docs => {
        const seen = new Map<string, LinkedPayment>()
        for (const d of docs ?? []) {
          const baseId = d._id.replace(/^drafts\./, '')
          if (!seen.has(baseId)) seen.set(baseId, { ...d, _id: baseId })
        }
        setPayments(Array.from(seen.values()))
      })
      .catch(() => setPayments([]))
      .finally(() => setLoading(false))
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading linked payments…</Text>
      </Flex>
    )
  }

  if (payments.length === 0) {
    return (
      <Card padding={3} radius={2} tone="transparent" border>
        <Text size={1} muted>No payments linked yet. Use "+ Add item" below to create one.</Text>
      </Card>
    )
  }

  // Total settled gross amount
  const totalPaid = payments
    .filter(p => SETTLED.has(p.paymentStatus ?? ''))
    .reduce((s, p) => s + (p.paidAmount ?? p.paymentAmount ?? 0), 0)
  const settledCount = payments.filter(p => SETTLED.has(p.paymentStatus ?? '')).length

  return (
    <Stack space={2}>

      {payments.map(p => {
        const vendorName  = p.vendor?.legalName_en ?? p.vendor?.legalName_th ?? ''
        const displayAmt  = p.paidAmount ?? p.paymentAmount
        const statusKey   = p.paymentStatus ?? 'created'
        const isSettled   = SETTLED.has(statusKey)

        return (
          <Card
            key={p._id}
            padding={3}
            radius={2}
            tone={isSettled ? 'transparent' : 'caution'}
            border
          >
            <Flex align="center" justify="space-between" gap={3} wrap="wrap">

              {/* Left: number + vendor + date */}
              <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
                <IntentLink
                  intent="edit"
                  params={{ id: p._id, type: 'payment' }}
                  style={{ textDecoration: 'none' }}
                >
                  <Text size={1} weight="semibold" style={{ color: '#2563EB' }}>
                    {p.paymentNumber ?? '(no number)'}
                    {vendorName ? `  ·  ${vendorName}` : ''}
                  </Text>
                </IntentLink>
                <Text size={0} muted>
                  {p.paymentDate ? fmtDate(p.paymentDate) : '— no date'}
                </Text>
              </Stack>

              {/* Right: amount + status */}
              <Stack space={1} style={{ textAlign: 'right', flexShrink: 0 }}>
                {displayAmt != null && (
                  <Text size={1} weight="semibold">
                    {fmtAmount(displayAmt, p.currency)}
                  </Text>
                )}
                <Badge
                  tone={STATUS_TONE[statusKey] ?? 'default'}
                  mode="outline"
                  fontSize={0}
                >
                  {STATUS_LABEL[statusKey] ?? statusKey}
                </Badge>
              </Stack>

            </Flex>
          </Card>
        )
      })}

      {/* Footer summary */}
      <Card padding={3} radius={2} tone="primary" border>
        <Flex justify="space-between" align="center">
          <Text size={1} muted>
            {settledCount} of {payments.length} payment{payments.length !== 1 ? 's' : ''} settled
          </Text>
          {totalPaid > 0 && (
            <Text size={1} weight="semibold">
              Total paid: {fmtAmount(totalPaid)}
            </Text>
          )}
        </Flex>
      </Card>

    </Stack>
  )
}
