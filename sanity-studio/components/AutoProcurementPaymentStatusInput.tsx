/**
 * AutoProcurementPaymentStatusInput
 *
 * Reads the linked payments[] array on a Procurement document,
 * fetches each payment's paymentStatus, then derives:
 *   - All paid/complete          → "paid"
 *   - Some paid/complete         → "partial"
 *   - None paid/complete (or no payments linked) → "unpaid"
 *
 * Auto-patches the paymentStatus field on change.
 */

import { useEffect, useState }    from 'react'
import { Box, Text, Stack, Flex, Spinner } from '@sanity/ui'
import { set }                   from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue, useClient } from 'sanity'
import { derivePaymentStatusFromDoc } from './AutoPaymentStatusInput'

const PAID_STATUSES = new Set(['paid', 'complete'])

function derivePaymentStatus(statuses: string[]): 'unpaid' | 'partial' | 'paid' {
  if (statuses.length === 0) return 'unpaid'
  const paidCount = statuses.filter(s => PAID_STATUSES.has(s)).length
  if (paidCount === 0)               return 'unpaid'
  if (paidCount === statuses.length) return 'paid'
  return 'partial'
}

const DOT_SIZE = 14

const PAYMENT_STEPS: { key: 'unpaid' | 'partial' | 'paid'; label: string; color: string }[] = [
  { key: 'unpaid',  label: 'Unpaid',  color: '#EF4444' },
  { key: 'partial', label: 'Partial', color: '#F97316' },
  { key: 'paid',    label: 'Paid',    color: '#22C55E' },
]

export function AutoProcurementPaymentStatusInput(props: StringInputProps) {
  const client          = useClient({ apiVersion: '2024-01-01' })
  const rawId           = useFormValue(['_id'])          as string | undefined
  const contractTypeRef = useFormValue(['contractType']) as { _ref?: string } | undefined

  const docId = rawId?.replace(/^drafts\./, '')

  const [enabled,      setEnabled]      = useState<boolean | null>(null)  // null = loading
  const [linkedCount,  setLinkedCount]  = useState(0)

  // Check toggle from Process Setup
  useEffect(() => {
    const ref = contractTypeRef?._ref
    if (!ref) { setEnabled(false); return }
    client
      .fetch<{ usePaymentStatus?: boolean }>(`*[_id == $id][0]{ usePaymentStatus }`, { id: ref })
      .then(ct => setEnabled(ct?.usePaymentStatus === true))
      .catch(() => setEnabled(false))
  }, [contractTypeRef?._ref]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-derive and patch when enabled — query payments that reference this procurement
  useEffect(() => {
    if (!enabled || !docId) return
    client
      .fetch<Array<{ _id: string; receipts?: unknown[]; paymentDate?: string; conditionMet?: boolean; approvalStatus?: string; submittedDate?: string; submittedBy?: string }>>(
        `*[_type == "payment" && references($id)]{ _id, receipts, paymentDate, conditionMet, approvalStatus, submittedDate, submittedBy }`,
        { id: docId },
      )
      .then(docs => {
        const seen = new Map<string, string>()
        for (const d of docs ?? []) {
          const baseId = (d._id ?? '').replace(/^drafts\./, '')
          if (!seen.has(baseId)) seen.set(baseId, derivePaymentStatusFromDoc(d))
        }
        setLinkedCount(seen.size)
        const derived = derivePaymentStatus(Array.from(seen.values()))
        if (props.value !== derived) props.onChange(set(derived))
      })
      .catch(() => {/* ignore */})
  }, [enabled, docId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle not yet loaded
  if (enabled === null) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading…</Text>
      </Flex>
    )
  }

  // Toggle off → standard manual radio buttons
  if (!enabled) return props.renderDefault(props)

  // Toggle on → status bar
  const currentStatus = (props.value as string) ?? 'unpaid'
  const activeIdx     = PAYMENT_STEPS.findIndex(s => s.key === currentStatus)
  const safeIdx       = activeIdx < 0 ? 0 : activeIdx
  const toneColor     = PAYMENT_STEPS[safeIdx]?.color ?? '#6B7280'
  const totalSlots    = PAYMENT_STEPS.length
  const slotPct       = 100 / totalSlots
  const fillFraction  = safeIdx <= 0 ? 0 : safeIdx / (totalSlots - 1)
  const isEmpty       = linkedCount === 0

  return (
    <Box padding={4} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
      <Stack space={4}>

        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Payment Status</Text>
          <Box padding={2} style={{ background: toneColor + '1A', border: `1px solid ${toneColor}40`, borderRadius: 6 }}>
            <Text size={1} weight="semibold" style={{ color: toneColor }}>
              {PAYMENT_STEPS[safeIdx]?.label ?? '—'}
            </Text>
          </Box>
        </Flex>

        <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, right: `${slotPct / 2}%`, height: 2, background: '#E5E7EB', zIndex: 0 }} />
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, width: `calc((100% - ${slotPct}%) * ${fillFraction})`, height: 2, background: '#6B7280', zIndex: 0, transition: 'width 0.3s' }} />
          <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
            {PAYMENT_STEPS.map((step, i) => {
              const isActive = i === safeIdx
              const isDone   = i < safeIdx
              return (
                <Flex key={step.key} direction="column" align="center" gap={2} style={{ flex: 1 }}>
                  <Box style={{
                    width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%',
                    background:  isActive ? toneColor : isDone ? '#6B7280' : '#FFFFFF',
                    border:      `2px solid ${isActive ? toneColor : isDone ? '#6B7280' : '#D1D5DB'}`,
                    boxShadow:   isActive ? `0 0 0 4px ${toneColor}30` : undefined,
                    flexShrink:  0, transition: 'all 0.2s',
                  }} />
                  <Text size={0} weight={isActive ? 'semibold' : 'regular'}
                    style={{ color: isActive ? '#111827' : isDone ? '#6B7280' : '#9CA3AF', textAlign: 'center' }}>
                    {step.label}
                  </Text>
                </Flex>
              )
            })}
          </Flex>
        </Box>

        <Text size={0} muted>
          {isEmpty
            ? 'No payments linked yet. Link this Procurement from a Payment document.'
            : `Auto · derived from ${linkedCount} linked payment${linkedCount > 1 ? 's' : ''}.`}
        </Text>

      </Stack>
    </Box>
  )
}
