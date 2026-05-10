/**
 * PipelineStatusTimeline
 *
 * Generic status timeline for any schema that has a Process Setup link.
 * Reads Pipeline Steps from the linked Process Setup and highlights the
 * current step. Matches the visual style of ContractStatusTimeline and
 * ProjectSiteStatusTimeline.
 *
 * Usage in DocumentOverview:
 *   <PipelineStatusTimeline
 *     contractTypeRef={doc.contractType?._ref}
 *     currentStatus={doc.procurementStatus}
 *     title="Procurement Status"
 *   />
 */

import { useEffect, useState }  from 'react'
import { Box, Flex, Text, Stack, Spinner } from '@sanity/ui'
import { useClient }             from 'sanity'
import { derivePaymentStatusFromDoc } from './AutoPaymentStatusInput'

interface PipelineStep {
  key:   string
  label: string
  tone?: string
}

interface Props {
  contractTypeRef?: string
  currentStatus?:  string
  title?:          string
}

type StepState = 'done' | 'current' | 'future'

const DOT_SIZE = 14

const TONE_COLOR: Record<string, string> = {
  positive: '#22C55E',
  caution:  '#F97316',
  critical:  '#EF4444',
  default:  '#6B7280',
}

const STATE_COLOR: Record<StepState, { dot: string; border: string }> = {
  done:    { dot: '#6B7280', border: '#6B7280' },
  current: { dot: '#22C55E', border: '#22C55E' },
  future:  { dot: '#FFFFFF', border: '#D1D5DB' },
}

function fmtDate(iso: string | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function PipelineStatusTimeline({ contractTypeRef, currentStatus, title = 'Pipeline Status' }: Props) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [steps,   setSteps]   = useState<PipelineStep[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!contractTypeRef) { setSteps([]); return }
    setLoading(true)
    client
      .fetch<{ steps?: PipelineStep[] }>(
        `*[_type == "contractType" && _id == $id][0]{ steps[]{ key, label, tone } }`,
        { id: contractTypeRef },
      )
      .then(ct => setSteps(ct?.steps ?? []))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false))
  }, [contractTypeRef, client])

  if (!contractTypeRef || loading) {
    return loading ? (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading pipeline…</Text>
      </Flex>
    ) : null
  }

  if (steps.length === 0) return null

  const currentIdx   = steps.findIndex(s => s.key === currentStatus)
  const activeIdx    = currentIdx < 0 ? 0 : currentIdx
  const currentStep  = steps[activeIdx]
  const toneColor    = TONE_COLOR[currentStep?.tone ?? 'default'] ?? '#6B7280'

  const totalSlots   = steps.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  const states: StepState[] = steps.map((_, i) =>
    i < activeIdx ? 'done' : i === activeIdx ? 'current' : 'future'
  )

  return (
    <Box padding={4} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
      <Stack space={4}>

        {/* ── Status badge ── */}
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>{title}</Text>
          <Box
            padding={2}
            style={{
              background:   toneColor + '1A',
              border:       `1px solid ${toneColor}40`,
              borderRadius: 6,
            }}
          >
            <Text size={1} weight="semibold" style={{ color: toneColor }}>
              {currentStep?.label ?? '—'}
            </Text>
          </Box>
        </Flex>

        {/* ── Timeline ── */}
        <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>

          {/* Grey background line */}
          <Box style={{
            position:   'absolute',
            top:        DOT_SIZE / 2,
            left:       `${slotPct / 2}%`,
            right:      `${slotPct / 2}%`,
            height:     2,
            background: '#E5E7EB',
            zIndex:     0,
          }} />

          {/* Filled line */}
          <Box style={{
            position:   'absolute',
            top:        DOT_SIZE / 2,
            left:       `${slotPct / 2}%`,
            width:      `calc((100% - ${slotPct}%) * ${fillFraction})`,
            height:     2,
            background: '#6B7280',
            zIndex:     0,
            transition: 'width 0.3s',
          }} />

          {/* Dots + labels */}
          <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
            {steps.map((step, i) => {
              const state    = states[i]
              const colors   = STATE_COLOR[state]
              const isActive = state === 'current'

              return (
                <Flex key={step.key} direction="column" align="center" gap={2} style={{ flex: 1 }}>
                  <Box style={{
                    width:        DOT_SIZE,
                    height:       DOT_SIZE,
                    borderRadius: '50%',
                    background:   isActive ? toneColor : colors.dot,
                    border:       `2px solid ${isActive ? toneColor : colors.border}`,
                    boxShadow:    isActive ? `0 0 0 4px ${toneColor}30` : undefined,
                    flexShrink:   0,
                    transition:   'all 0.2s',
                  }} />
                  <Text
                    size={0}
                    weight={isActive ? 'semibold' : 'regular'}
                    style={{
                      color:     isActive ? '#111827' : state === 'done' ? '#6B7280' : '#9CA3AF',
                      textAlign: 'center',
                    }}
                  >
                    {step.label}
                  </Text>
                </Flex>
              )
            })}
          </Flex>
        </Box>

      </Stack>
    </Box>
  )
}

// ── Hardcoded variant for Procurement (8 fixed statuses) ─────────────────────

// The 3 delivered states share one slot in the linear bar; tone changes per outcome
const PROCUREMENT_STEPS: { key: string; label: string; color: string }[] = [
  { key: 'created',            label: 'Created',      color: '#6B7280' },
  { key: 'processing',         label: 'Processing',   color: '#3B82F6' },
  { key: 'approved',           label: 'Approved',     color: '#22C55E' },
  { key: 'order_placed',       label: 'Order Placed', color: '#F97316' },
  { key: 'order_shipped',      label: 'Shipped',      color: '#8B5CF6' },
  { key: 'delivered_accepted', label: 'Delivered',    color: '#22C55E' },
]

// Derive procurement status from raw document fields — delivery status is derived
// asynchronously in AutoProcurementStatusInput by querying linked Asset docs.
export function deriveProcurementStatus(doc: {
  orderShippedDate?: string
  trackingNumber?:   string
  orderPlacedDate?:  string
  approvalStatus?:   string
  comparisonItems?:  unknown[]
}): string {
  if (doc.orderShippedDate || doc.trackingNumber) return 'order_shipped'
  if (doc.orderPlacedDate)               return 'order_placed'
  if (doc.approvalStatus === 'approved') return 'approved'
  if ((doc.comparisonItems ?? []).length > 0) return 'processing'
  return 'created'
}

// Map the three delivered variants back to slot index 5
function procurementActiveIdx(status: string): number {
  if (status === 'delivered_partial' || status === 'delivered_rejected') return 5
  const idx = PROCUREMENT_STEPS.findIndex(s => s.key === status)
  return idx < 0 ? 0 : idx
}

function procurementTone(status: string): string {
  if (status === 'delivered_accepted') return '#22C55E'
  if (status === 'delivered_partial')  return '#F97316'
  if (status === 'delivered_rejected') return '#EF4444'
  return PROCUREMENT_STEPS[procurementActiveIdx(status)]?.color ?? '#6B7280'
}

function procurementBadgeLabel(status: string): string {
  const map: Record<string, string> = {
    created:            'Created',
    processing:         'Processing',
    approved:           'Approved',
    order_placed:       'Order Placed',
    order_shipped:      'Shipped',
    delivered_accepted: 'Delivered — Accepted',
    delivered_partial:  'Delivered — Partial',
    delivered_rejected: 'Delivered — Rejected',
  }
  return map[status] ?? '—'
}

export interface ProcurementDoc {
  orderShippedDate?: string
  trackingNumber?:   string
  orderPlacedDate?:  string
  approvalStatus?:   string
  comparisonItems?:  unknown[]
  approvedAt?:       string
}

function shortDate(iso: string | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

export function ProcurementStatusTimeline({ doc, currentStatus: statusOverride }: { doc?: ProcurementDoc; currentStatus?: string }) {
  const currentStatus = statusOverride ?? (doc ? deriveProcurementStatus(doc) : 'created')
  const activeIdx    = procurementActiveIdx(currentStatus)
  const toneColor    = procurementTone(currentStatus)
  const totalSlots   = PROCUREMENT_STEPS.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  // Date for each step slot (index-aligned with PROCUREMENT_STEPS)
  const stepDates: (string | null)[] = [
    null,                                        // 0 created
    null,                                        // 1 processing
    shortDate(doc?.approvedAt),                  // 2 approved
    shortDate(doc?.orderPlacedDate),             // 3 order_placed
    shortDate(doc?.orderShippedDate),            // 4 order_shipped
    null,                                        // 5 delivered (date is on Asset Registration)
  ]

  return (
    <Box padding={4} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
      <Stack space={4}>

        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Procurement Status</Text>
          <Box padding={2} style={{ background: toneColor + '1A', border: `1px solid ${toneColor}40`, borderRadius: 6 }}>
            <Text size={1} weight="semibold" style={{ color: toneColor }}>{procurementBadgeLabel(currentStatus ?? '')}</Text>
          </Box>
        </Flex>

        <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, right: `${slotPct / 2}%`, height: 2, background: '#E5E7EB', zIndex: 0 }} />
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, width: `calc((100% - ${slotPct}%) * ${fillFraction})`, height: 2, background: '#6B7280', zIndex: 0, transition: 'width 0.3s' }} />
          <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
            {PROCUREMENT_STEPS.map((step, i) => {
              const isActive = i === activeIdx
              const isDone   = i < activeIdx
              const dotColor = isActive ? toneColor : isDone ? '#6B7280' : '#FFFFFF'
              const bdrColor = isActive ? toneColor : isDone ? '#6B7280' : '#D1D5DB'
              const date     = stepDates[i]
              return (
                <Flex key={step.key} direction="column" align="center" gap={1} style={{ flex: 1 }}>
                  <Box style={{
                    width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%',
                    background: dotColor, border: `2px solid ${bdrColor}`,
                    boxShadow: isActive ? `0 0 0 4px ${toneColor}30` : undefined,
                    flexShrink: 0, transition: 'all 0.2s',
                  }} />
                  <Text size={0} weight={isActive ? 'semibold' : 'regular'}
                    style={{ color: isActive ? '#111827' : isDone ? '#6B7280' : '#9CA3AF', textAlign: 'center' }}>
                    {step.label}
                  </Text>
                  {(isDone || isActive) && date && (
                    <Text size={0} style={{ color: '#9CA3AF', textAlign: 'center', fontSize: 9 }}>
                      {date}
                    </Text>
                  )}
                </Flex>
              )
            })}
          </Flex>
        </Box>

      </Stack>
    </Box>
  )
}

// ── Hardcoded variant for Payment (7 fixed statuses) ─────────────────────────

// `rejected` shares the `approved` slot with a red tone
const PAYMENT_STEPS: { key: string; label: string; color: string }[] = [
  { key: 'created',       label: 'Created',    color: '#6B7280' },
  { key: 'submitted',     label: 'Submitted',  color: '#3B82F6' },
  { key: 'approved',      label: 'Approved',   color: '#22C55E' },
  { key: 'condition_met', label: 'Cond. Met',  color: '#F97316' },
  { key: 'processing',    label: 'Processing', color: '#8B5CF6' },
  { key: 'paid',          label: 'Paid',       color: '#22C55E' },
  { key: 'complete',      label: 'Complete',   color: '#22C55E' },
]

function paymentActiveIdx(status: string): number {
  if (status === 'rejected') return 2  // sits at Approved slot, red tone
  const idx = PAYMENT_STEPS.findIndex(s => s.key === status)
  return idx < 0 ? 0 : idx
}

function paymentTone(status: string): string {
  if (status === 'rejected') return '#EF4444'
  return PAYMENT_STEPS[paymentActiveIdx(status)]?.color ?? '#6B7280'
}

function paymentBadgeLabel(status: string): string {
  const map: Record<string, string> = {
    created:       'Created',
    submitted:     'Submitted',
    approved:      'Approved',
    rejected:      'Rejected',
    condition_met: 'Condition Met',
    processing:    'Processing',
    paid:          'Paid',
    complete:      'Complete',
  }
  return map[status] ?? '—'
}

export function PaymentStatusTimeline({ currentStatus, doc }: { currentStatus?: string; doc?: Record<string, any> }) {
  const status       = doc ? derivePaymentStatusFromDoc(doc) : (currentStatus ?? 'created')
  const activeIdx    = paymentActiveIdx(status)
  const toneColor    = paymentTone(status)
  const totalSlots   = PAYMENT_STEPS.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  return (
    <Box padding={4} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
      <Stack space={4}>

        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Payment Status</Text>
          <Box padding={2} style={{ background: toneColor + '1A', border: `1px solid ${toneColor}40`, borderRadius: 6 }}>
            <Text size={1} weight="semibold" style={{ color: toneColor }}>{paymentBadgeLabel(status)}</Text>
          </Box>
        </Flex>

        <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, right: `${slotPct / 2}%`, height: 2, background: '#E5E7EB', zIndex: 0 }} />
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, width: `calc((100% - ${slotPct}%) * ${fillFraction})`, height: 2, background: '#6B7280', zIndex: 0, transition: 'width 0.3s' }} />
          <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
            {PAYMENT_STEPS.map((step, i) => {
              const isActive = i === activeIdx
              const isDone   = i < activeIdx
              const dotColor = isActive ? toneColor : isDone ? '#6B7280' : '#FFFFFF'
              const bdrColor = isActive ? toneColor : isDone ? '#6B7280' : '#D1D5DB'
              return (
                <Flex key={step.key} direction="column" align="center" gap={2} style={{ flex: 1 }}>
                  <Box style={{
                    width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%',
                    background: dotColor, border: `2px solid ${bdrColor}`,
                    boxShadow: isActive ? `0 0 0 4px ${toneColor}30` : undefined,
                    flexShrink: 0, transition: 'all 0.2s',
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

      </Stack>
    </Box>
  )
}

// ── Hardcoded variant for Install & Activate (no Process Setup ref) ───────────

const INSTALL_STEPS: { key: string; label: string; color: string }[] = [
  { key: 'item_setup',            label: 'Item Setup',       color: '#6B7280' },
  { key: 'electricity_installed', label: 'Electrical',       color: '#F97316' },
  { key: 'wifi_installed',        label: 'Wifi',             color: '#3B82F6' },
  { key: 'app_installed',         label: 'Apps',             color: '#8B5CF6' },
  { key: 'live',                  label: 'Live ✅',           color: '#22C55E' },
]

export function InstallationStatusTimeline({ currentStatus }: { currentStatus?: string }) {
  const activeIdx    = Math.max(0, INSTALL_STEPS.findIndex(s => s.key === currentStatus))
  const currentStep  = INSTALL_STEPS[activeIdx]
  const toneColor    = currentStep?.color ?? '#6B7280'
  const totalSlots   = INSTALL_STEPS.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  return (
    <Box padding={4} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
      <Stack space={4}>

        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Installation Status</Text>
          <Box padding={2} style={{ background: toneColor + '1A', border: `1px solid ${toneColor}40`, borderRadius: 6 }}>
            <Text size={1} weight="semibold" style={{ color: toneColor }}>{currentStep?.label ?? '—'}</Text>
          </Box>
        </Flex>

        <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, right: `${slotPct / 2}%`, height: 2, background: '#E5E7EB', zIndex: 0 }} />
          <Box style={{ position: 'absolute', top: DOT_SIZE / 2, left: `${slotPct / 2}%`, width: `calc((100% - ${slotPct}%) * ${fillFraction})`, height: 2, background: '#6B7280', zIndex: 0, transition: 'width 0.3s' }} />
          <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
            {INSTALL_STEPS.map((step, i) => {
              const isActive = i === activeIdx
              const isDone   = i < activeIdx
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

      </Stack>
    </Box>
  )
}
