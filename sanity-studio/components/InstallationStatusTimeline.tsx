import { Box, Flex, Text, Stack } from '@sanity/ui'

type StepState = 'done' | 'current' | 'future'

interface Step {
  key:      string
  label:    string
  sub:      string
  dateKey?: string
}

const STEPS: Step[] = [
  { key: 'item_setup',            label: 'Item Setup',            sub: 'Device received',    dateKey: 'setupDate'      },
  { key: 'electricity_installed', label: 'Electricity Installed', sub: 'Wiring complete',    dateKey: 'electricalDate' },
  { key: 'wifi_installed',        label: 'Wifi Installed',        sub: 'Network connected',  dateKey: 'wifiDate'       },
  { key: 'app_installed',         label: 'App Installed',         sub: 'Software set up',    dateKey: 'appDate'        },
  { key: 'live',                  label: 'Live',                  sub: 'Screen activated',   dateKey: 'liveDate'       },
]

const STAGE_ORDER = STEPS.map(s => s.key)

const DOT_SIZE = 16

const COLOR: Record<StepState, { dot: string; border: string }> = {
  done:    { dot: '#6B7280', border: '#6B7280' },
  current: { dot: '#22C55E', border: '#22C55E' },
  future:  { dot: '#FFFFFF', border: '#D1D5DB' },
}

function fmtDate(iso: string | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function resolveSteps(installationStage: string | undefined): StepState[] {
  const idx = STAGE_ORDER.indexOf(installationStage ?? '')
  if (idx < 0) return STEPS.map(() => 'future')
  return STEPS.map((_, i) => {
    if (i < idx)  return 'done'
    if (i === idx) return 'current'
    return 'future'
  })
}

function statusLabel(installationStage: string | undefined): { text: string; tone: string } {
  switch (installationStage) {
    case 'item_setup':            return { text: '📦 Item Setup',            tone: '#6B7280' }
    case 'electricity_installed': return { text: '⚡ Electricity Installed', tone: '#F97316' }
    case 'wifi_installed':        return { text: '📶 Wifi Installed',        tone: '#3B82F6' }
    case 'app_installed':         return { text: '📱 App Installed',         tone: '#8B5CF6' }
    case 'live':                  return { text: '✅ Live',                  tone: '#22C55E' }
    default:                      return { text: '📦 Item Setup',            tone: '#6B7280' }
  }
}

export interface InstallationStatusTimelineProps {
  installationStage?: string
  setupDate?:         string
  liveDate?:          string
}

export function InstallationStatusTimeline({
  installationStage,
  setupDate,
  liveDate,
}: InstallationStatusTimelineProps) {
  const states  = resolveSteps(installationStage)
  const current = statusLabel(installationStage)

  const activeIdx    = states.findIndex(s => s === 'current')
  const totalSlots   = STEPS.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  const dateValues: Record<string, string | undefined> = {
    setupDate, liveDate,
  }

  return (
    <Box
      padding={4}
      style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}
    >
      <Stack space={4}>

        {/* Status badge */}
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>
            Installation Status
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
              const isActive = state === 'current'
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
