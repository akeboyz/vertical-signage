import { Box, Flex, Text, Stack } from '@sanity/ui'

type StepState = 'done' | 'current' | 'future' | 'rejected' | 'reset'

interface Step {
  key:      string
  label:    string
  dateKey?: string
}

const STEPS: Step[] = [
  { key: 'site_created',  label: 'Created'                          },
  { key: 'site_review',   label: 'Under Review'                     },
  { key: 'approved',      label: 'Site Approved', dateKey: 'approvedAt' },
]

const DOT_SIZE = 14

const COLOR: Record<StepState, { dot: string; border: string }> = {
  done:     { dot: '#6B7280', border: '#6B7280' },
  current:  { dot: '#22C55E', border: '#22C55E' },
  future:   { dot: '#FFFFFF', border: '#D1D5DB' },
  rejected: { dot: '#EF4444', border: '#EF4444' },
  reset:    { dot: '#F97316', border: '#F97316' },
}

function fmtDate(iso: string | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function resolveSteps(pipelineStage: string | undefined, approvalStatus: string | undefined): StepState[] {
  // Once past site approval phase, show all 3 steps as done
  const pastApproval = ['quotation_pending', 'quotation_approved', 'contract_pending',
                        'contract_approved', 'active', 'terminated']
  if (pipelineStage && pastApproval.includes(pipelineStage))
    return ['done', 'done', 'done']

  if (pipelineStage === 'approved')   return ['done', 'done', 'current']
  if (pipelineStage === 'site_review') {
    if (approvalStatus === 'rejected') return ['done', 'rejected', 'future']
    if (approvalStatus === 'reset')    return ['done', 'reset',    'future']
    return ['done', 'current', 'future']
  }
  return ['current', 'future', 'future']
}

function statusLabel(pipelineStage: string | undefined): { text: string; tone: string } {
  switch (pipelineStage) {
    case 'site_created':       return { text: '📝 Site Created',         tone: '#6B7280' }
    case 'site_review':        return { text: '🔵 Under Review',         tone: '#3B82F6' }
    case 'site_rejected':      return { text: '🔴 Site Rejected',        tone: '#EF4444' }
    case 'approved':           return { text: '✅ Site Approved',         tone: '#22C55E' }
    case 'quotation_pending':  return { text: '⏳ Quotation Pending',     tone: '#F97316' }
    case 'quotation_approved': return { text: '🟢 Quotation Approved',   tone: '#22C55E' }
    case 'contract_pending':   return { text: '⏳ Contract Pending',      tone: '#F97316' }
    case 'contract_approved':  return { text: '🟠 Contract Approved',    tone: '#F97316' }
    case 'active':             return { text: '✅ Active',                tone: '#22C55E' }
    case 'terminated':         return { text: '🔴 Terminated',           tone: '#EF4444' }
    default:                   return { text: '📝 Site Created',         tone: '#6B7280' }
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProjectSiteStatusTimelineProps {
  pipelineStage?:  string
  approvalStatus?: string
  approvedAt?:     string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProjectSiteStatusTimeline({
  pipelineStage,
  approvalStatus,
  approvedAt,
}: ProjectSiteStatusTimelineProps) {
  const states  = resolveSteps(pipelineStage, approvalStatus)
  const current = statusLabel(pipelineStage)

  const activeIdx    = states.findIndex(s => s === 'current' || s === 'rejected' || s === 'reset')
  const totalSlots   = STEPS.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  const dateValues: Record<string, string | undefined> = { approvedAt }

  return (
    <Box
      padding={4}
      style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}
    >
      <Stack space={4}>

        {/* Status badge */}
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>
            Pipeline Status
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
                    {date && (
                      <Text size={0} weight="semibold" style={{ color: isActive ? '#22C55E' : '#6B7280' }}>
                        {date}
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
