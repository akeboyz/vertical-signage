import { Box, Flex, Text, Stack } from '@sanity/ui'

type StepState = 'done' | 'current' | 'future' | 'rejected' | 'reset'

interface Step {
  key:      string
  label:    string
  sub?:     string
  dateKey?: string   // which date prop to show under this step
}

const STEPS: Step[] = [
  { key: 'draft',              label: 'Draft',              sub: 'Document created'    },
  { key: 'quotation_pending',  label: 'Quotation Pending',  sub: 'Awaiting approval'   },
  { key: 'quotation_approved', label: 'Quotation Approved', sub: 'Quotation confirmed', dateKey: 'quotationApprovedAt' },
  { key: 'contract_pending',   label: 'Contract Pending',   sub: 'Awaiting approval'   },
  { key: 'contract_approved',  label: 'Contract Approved',  sub: 'Digitally approved',  dateKey: 'contractApprovedAt' },
  { key: 'signed',             label: 'Signed',             sub: 'Physically signed',   dateKey: 'signedAt'           },
]

const DOT_SIZE = 16

const COLOR: Record<StepState, { dot: string; border: string }> = {
  done:     { dot: '#6B7280', border: '#6B7280' },
  current:  { dot: '#22C55E', border: '#22C55E' },
  future:   { dot: '#FFFFFF', border: '#D1D5DB' },
  rejected: { dot: '#EF4444', border: '#EF4444' },
  reset:    { dot: '#F97316', border: '#F97316' },
}

const PHASE_DIVIDER_AFTER = 2  // steps 0-2 = Quotation, 3-5 = Contract

function fmtDate(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function resolveSteps(
  quotationApprovalStatus: string | undefined,
  contractApprovalStatus:  string | undefined,
  signedStatus:            string | undefined,
): StepState[] {
  if (signedStatus === 'signed')
    return ['done', 'done', 'done', 'done', 'done', 'current']

  if (contractApprovalStatus === 'approved')  return ['done', 'done', 'done', 'done', 'current', 'future']
  if (contractApprovalStatus === 'pending')   return ['done', 'done', 'done', 'current', 'future', 'future']
  if (contractApprovalStatus === 'rejected')  return ['done', 'done', 'done', 'rejected', 'future', 'future']
  if (contractApprovalStatus === 'reset')     return ['done', 'done', 'done', 'reset', 'future', 'future']

  if (quotationApprovalStatus === 'approved') return ['done', 'done', 'current', 'future', 'future', 'future']
  if (quotationApprovalStatus === 'pending')  return ['done', 'current', 'future', 'future', 'future', 'future']
  if (quotationApprovalStatus === 'rejected') return ['done', 'rejected', 'future', 'future', 'future', 'future']
  if (quotationApprovalStatus === 'reset')    return ['done', 'reset', 'future', 'future', 'future', 'future']

  return ['current', 'future', 'future', 'future', 'future', 'future']
}

function statusLabel(
  quotationApprovalStatus: string | undefined,
  contractApprovalStatus:  string | undefined,
  signedStatus:            string | undefined,
): { text: string; tone: string } {
  if (signedStatus === 'signed')              return { text: '✍️ Signed',               tone: '#22C55E' }
  if (contractApprovalStatus === 'approved')  return { text: '✓ Contract Approved',     tone: '#22C55E' }
  if (contractApprovalStatus === 'pending')   return { text: '⏳ Contract Pending',      tone: '#F97316' }
  if (contractApprovalStatus === 'rejected')  return { text: '✗ Contract Rejected',     tone: '#EF4444' }
  if (contractApprovalStatus === 'reset')     return { text: '⚠ Contract Reset',        tone: '#F97316' }
  if (quotationApprovalStatus === 'approved') return { text: '✓ Quotation Approved',    tone: '#22C55E' }
  if (quotationApprovalStatus === 'pending')  return { text: '⏳ Quotation Pending',     tone: '#F97316' }
  if (quotationApprovalStatus === 'rejected') return { text: '✗ Quotation Rejected',    tone: '#EF4444' }
  if (quotationApprovalStatus === 'reset')    return { text: '⚠ Quotation Reset',       tone: '#F97316' }
  return { text: '📝 Draft', tone: '#6B7280' }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ContractStatusTimelineProps {
  quotationApprovalStatus?: string
  contractApprovalStatus?:  string
  signedStatus?:            string
  quotationApprovedAt?:     string
  contractApprovedAt?:      string
  signedAt?:                string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContractStatusTimeline({
  quotationApprovalStatus,
  contractApprovalStatus,
  signedStatus,
  quotationApprovedAt,
  contractApprovedAt,
  signedAt,
}: ContractStatusTimelineProps) {
  const states  = resolveSteps(quotationApprovalStatus, contractApprovalStatus, signedStatus)
  const current = statusLabel(quotationApprovalStatus, contractApprovalStatus, signedStatus)

  const activeIdx    = states.findIndex(s => s === 'current' || s === 'rejected' || s === 'reset')
  const totalSlots   = STEPS.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  // Map dateKey → actual value
  const dateValues: Record<string, string | undefined> = {
    quotationApprovedAt,
    contractApprovedAt,
    signedAt,
  }

  return (
    <Box
      padding={4}
      style={{
        background:   '#F9FAFB',
        borderRadius: 8,
        border:       '1px solid #E5E7EB',
      }}
    >
      <Stack space={4}>

        {/* Status badge */}
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>
            Deal Status
          </Text>
          <Box
            padding={2}
            style={{
              background:   current.tone + '1A',
              border:       `1px solid ${current.tone}40`,
              borderRadius: 6,
            }}
          >
            <Text size={1} weight="semibold" style={{ color: current.tone }}>
              {current.text}
            </Text>
          </Box>
        </Flex>

        {/* Phase labels */}
        <Flex>
          <Box style={{ flex: PHASE_DIVIDER_AFTER + 1, borderRight: '2px dashed #D1D5DB', paddingRight: 8 }}>
            <Text size={0} style={{ color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Quotation Phase
            </Text>
          </Box>
          <Box style={{ flex: STEPS.length - PHASE_DIVIDER_AFTER - 1, paddingLeft: 8 }}>
            <Text size={0} style={{ color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Contract Phase
            </Text>
          </Box>
        </Flex>

        {/* Timeline */}
        <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
          {/* Grey background line */}
          <Box
            style={{
              position:   'absolute',
              top:        DOT_SIZE / 2,
              left:       `${slotPct / 2}%`,
              right:      `${slotPct / 2}%`,
              height:     2,
              background: '#E5E7EB',
              zIndex:     0,
            }}
          />

          {/* Filled line */}
          <Box
            style={{
              position:   'absolute',
              top:        DOT_SIZE / 2,
              left:       `${slotPct / 2}%`,
              width:      `calc((100% - ${slotPct}%) * ${fillFraction})`,
              height:     2,
              background: '#6B7280',
              zIndex:     0,
              transition: 'width 0.3s',
            }}
          />

          {/* Dots + labels */}
          <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
            {STEPS.map((step, i) => {
              const state    = states[i]
              const colors   = COLOR[state]
              const isActive = state === 'current' || state === 'rejected' || state === 'reset'
              const date     = step.dateKey ? fmtDate(dateValues[step.dateKey]) : null

              return (
                <Flex key={step.key} direction="column" align="center" gap={2} style={{ flex: 1 }}>
                  <Box
                    style={{
                      width:        DOT_SIZE,
                      height:       DOT_SIZE,
                      borderRadius: '50%',
                      background:   colors.dot,
                      border:       `2px solid ${colors.border}`,
                      boxShadow:    isActive ? `0 0 0 4px ${colors.dot}30` : undefined,
                      flexShrink:   0,
                      transition:   'all 0.2s',
                    }}
                  />
                  <Stack space={1} style={{ textAlign: 'center' }}>
                    <Text
                      size={0}
                      weight={isActive ? 'semibold' : 'regular'}
                      style={{ color: isActive ? '#111827' : state === 'done' ? '#6B7280' : '#9CA3AF' }}
                    >
                      {step.label}
                    </Text>
                    {date ? (
                      <Text size={0} weight="semibold" style={{ color: isActive ? '#22C55E' : '#6B7280' }}>
                        {date}
                      </Text>
                    ) : (
                      <Text size={0} style={{ color: isActive ? '#374151' : '#9CA3AF' }}>
                        {step.sub}
                      </Text>
                    )}
                  </Stack>
                </Flex>
              )
            })}
          </Flex>
        </Box>

      </Stack>
    </Box>
  )
}
