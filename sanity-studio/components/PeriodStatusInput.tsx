/**
 * PeriodStatusInput
 *
 * Read-only status display inside a billingPeriod array item on Rent Space.
 * Derives status from date + linked Payment document — no manual input.
 * Auto-patches the hidden accrualStatus field so the array preview stays accurate.
 *
 * Status logic:
 *   no linkedPayment + periodStart > today          → upcoming
 *   no linkedPayment + periodStart ≤ today          → due
 *   no linkedPayment + periodEnd < today            → overdue
 *   payment: created/submitted/approved/processing  → invoiced
 *   payment: paid/complete                          → paid
 */

import { useEffect, useRef, useState } from 'react'
import { useFormValue, useClient }      from 'sanity'
import { Card, Flex, Text, Badge, Button, Spinner } from '@sanity/ui'
import type { SanityClient } from '@sanity/client'
import { fmtDate } from '../utils/dateFormat'

async function ensureDraft(client: SanityClient, dId: string) {
  const contractId = dId.replace(/^drafts\./, '')
  const base = await client.fetch(
    `coalesce(*[_id == $dId][0], *[_id == $id][0])`,
    { dId, id: contractId },
  )
  if (base && base._id !== dId) {
    await client.createIfNotExists({ ...base, _id: dId })
  }
}

const PAYMENT_NAV = (id: string) => `/structure/finance;payment;${id}%2Cview%3Dedit`

const PAID_STATUSES = new Set(['paid', 'complete'])

function deriveAccrualStatus(
  paymentStatus?: string,
  periodStart?:   string,
  periodEnd?:     string,
): string {
  if (paymentStatus && PAID_STATUSES.has(paymentStatus)) return 'paid'
  if (!periodStart) return 'upcoming'
  const today = new Date().toISOString().slice(0, 10)
  if (periodStart > today)            return 'upcoming'
  if (periodEnd && periodEnd < today) return 'overdue'
  return 'due'
}

export function PeriodStatusInput(props: any) {
  const client     = useClient({ apiVersion: '2024-01-01' })
  const rawDocId   = useFormValue(['_id'])            as string | undefined
  const allPeriods = useFormValue(['billingPeriods']) as any[] | undefined

  const itemKey      = (props.path?.[1] as any)?._key as string | undefined
  const item         = allPeriods?.find((p: any) => p._key === itemKey)
  const paymentRef   = item?.linkedPayment?._ref as string | undefined
  const periodStart  = item?.periodStart  as string | undefined
  const periodEnd    = item?.periodEnd    as string | undefined

  const contractDraftId = rawDocId
    ? (rawDocId.startsWith('drafts.') ? rawDocId : `drafts.${rawDocId}`)
    : undefined

  const [paymentStatus, setPaymentStatus] = useState<string | undefined>(undefined)
  const [paymentNumber, setPaymentNumber] = useState<string | undefined>(undefined)
  const [loading,       setLoading]       = useState(false)

  useEffect(() => {
    if (!paymentRef) {
      setPaymentStatus(undefined)
      setPaymentNumber(undefined)
      return
    }
    setLoading(true)
    client
      .fetch<{ paymentStatus?: string; paymentNumber?: string }>(
        `*[_id == $id || _id == $draftId][0]{ paymentStatus, paymentNumber }`,
        { id: paymentRef, draftId: `drafts.${paymentRef}` },
      )
      .then(doc => {
        setPaymentStatus(doc?.paymentStatus)
        setPaymentNumber(doc?.paymentNumber)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [paymentRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const accrualStatus = deriveAccrualStatus(
    paymentRef ? paymentStatus : undefined,
    periodStart,
    periodEnd,
  )

  // Auto-patch hidden accrualStatus for array item preview
  const prevKeyRef = useRef('')
  useEffect(() => {
    if (!contractDraftId || !itemKey) return
    const key = `${paymentRef ?? ''}|${paymentStatus ?? ''}|${periodStart ?? ''}|${periodEnd ?? ''}`
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key
    ensureDraft(client, contractDraftId).then(() =>
      client
        .patch(contractDraftId)
        .set({ [`billingPeriods[_key == "${itemKey}"].accrualStatus`]: accrualStatus })
        .commit({ autoGenerateArrayKeys: true })
    ).catch(() => {})
  }, [accrualStatus, contractDraftId, itemKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading payment…</Text>
      </Flex>
    )
  }

  const TONE: Record<string, any>   = { upcoming: 'default', due: 'caution', overdue: 'critical', paid: 'positive' }
  const LABEL: Record<string, string> = { upcoming: '🕐 Upcoming', due: '🔴 Due', overdue: '🚨 Overdue', paid: '✅ Paid' }
  const DESC: Record<string, string>  = {
    upcoming: `Period starts ${fmtDate(periodStart)}`,
    due:      'Enter meter end and record payment',
    overdue:  `Period ended ${fmtDate(periodEnd)} — no payment recorded`,
    paid:     paymentNumber ? `Payment ${paymentNumber}` : 'Payment recorded',
  }

  const tone = TONE[accrualStatus] ?? 'default'

  return (
    <Card padding={3} radius={2} border tone={tone}>
      <Flex align="center" justify="space-between" gap={2}>
        <Flex align="center" gap={3}>
          <Badge tone={tone} mode="outline" fontSize={0}>{LABEL[accrualStatus] ?? accrualStatus}</Badge>
          <Text size={1} muted>{DESC[accrualStatus] ?? ''}</Text>
        </Flex>
        {paymentRef && (
          <Button
            text="Open Payment"
            mode="ghost"
            fontSize={0}
            padding={2}
            onClick={() => { window.location.href = PAYMENT_NAV(paymentRef) }}
          />
        )}
      </Flex>
    </Card>
  )
}
