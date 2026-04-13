import { Card, Stack, Text, Flex, Badge, Box, Heading } from '@sanity/ui'
import { IntentLink }                                   from 'sanity/router'

interface Props {
  document: {
    displayed: Record<string, any>
  }
}

const PIPELINE_STEPS = ['inquiry', 'viewing', 'offer', 'under_contract']

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  inquiry:        { label: '📋 Inquiry',        color: '#3B82F6' },
  viewing:        { label: '🏠 Viewing',         color: '#F97316' },
  offer:          { label: '📝 Offer Made',       color: '#8B5CF6' },
  under_contract: { label: '📄 Under Contract',  color: '#F59E0B' },
  closed:         { label: '🏆 Closed / Won',    color: '#22C55E' },
  lost:           { label: '❌ Lost',            color: '#EF4444' },
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtCurrency(n: number | null | undefined): string | null {
  if (n == null) return null
  return '฿' + n.toLocaleString('th-TH')
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <Flex justify="space-between" gap={3} style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 6 }}>
      <Text size={0} muted style={{ flexShrink: 0, minWidth: 130 }}>{label}</Text>
      <Text size={0} style={{ textAlign: 'right' }}>{value}</Text>
    </Flex>
  )
}

export function SaleOpportunityOverview({ document: { displayed: doc } }: Props) {
  if (!doc._type) {
    return (
      <Card padding={6} height="fill" tone="transparent">
        <Flex align="center" justify="center" height="fill">
          <Text muted>Loading…</Text>
        </Flex>
      </Card>
    )
  }

  const stage      = doc.dealStage ?? 'inquiry'
  const stageCfg   = STAGE_CONFIG[stage] ?? STAGE_CONFIG.inquiry
  const isTerminal = stage === 'closed' || stage === 'lost'
  const activeIdx  = PIPELINE_STEPS.indexOf(stage)

  const DOT_SIZE     = 14
  const totalSlots   = PIPELINE_STEPS.length
  const slotPct      = 100 / totalSlots
  const fillFraction = activeIdx <= 0 ? 0 : activeIdx / (totalSlots - 1)

  const buyerRef = doc.buyer?._ref
  const leadRef  = doc.lead?._ref

  const title = [doc.projectName, doc.unitNumber].filter(Boolean).join(' · ') || '(No unit)'

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        {/* Header */}
        <Stack space={3}>
          <Flex gap={2} wrap="wrap">
            <Badge tone="primary" mode="outline" fontSize={0}>Sale Opportunity</Badge>
            <Badge tone="caution" mode="outline" fontSize={0}>Read-only — click Edit tab to make changes</Badge>
          </Flex>
          <Heading size={3}>{title}</Heading>
        </Stack>

        {/* Stage */}
        <Box padding={4} style={{ background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
          <Stack space={4}>
            <Flex align="center" justify="space-between">
              <Text size={1} weight="semibold" style={{ color: '#374151' }}>Deal Stage</Text>
              <Box
                padding={2}
                style={{
                  background:   stageCfg.color + '1A',
                  border:       `1px solid ${stageCfg.color}40`,
                  borderRadius: 6,
                }}
              >
                <Text size={1} weight="semibold" style={{ color: stageCfg.color }}>{stageCfg.label}</Text>
              </Box>
            </Flex>

            {/* Pipeline progress */}
            {!isTerminal && (
              <Box style={{ position: 'relative', paddingTop: 4, paddingBottom: 4 }}>
                <Box style={{
                  position: 'absolute', top: DOT_SIZE / 2,
                  left: `${slotPct / 2}%`, right: `${slotPct / 2}%`,
                  height: 2, background: '#E5E7EB', zIndex: 0,
                }} />
                <Box style={{
                  position: 'absolute', top: DOT_SIZE / 2,
                  left: `${slotPct / 2}%`,
                  width: `calc((100% - ${slotPct}%) * ${fillFraction})`,
                  height: 2, background: '#6B7280', zIndex: 0, transition: 'width 0.3s',
                }} />
                <Flex justify="space-between" style={{ position: 'relative', zIndex: 1 }}>
                  {PIPELINE_STEPS.map((step, i) => {
                    const cfg       = STAGE_CONFIG[step]
                    const isDone    = i < activeIdx
                    const isCurrent = i === activeIdx
                    const dotColor  = isDone ? '#6B7280' : isCurrent ? cfg.color : '#FFFFFF'
                    const border    = isDone ? '#6B7280' : isCurrent ? cfg.color : '#D1D5DB'
                    return (
                      <Flex key={step} direction="column" align="center" gap={2} style={{ flex: 1 }}>
                        <Box style={{
                          width: DOT_SIZE, height: DOT_SIZE, borderRadius: '50%',
                          background: dotColor, border: `2px solid ${border}`,
                          boxShadow: isCurrent ? `0 0 0 4px ${cfg.color}30` : undefined,
                          flexShrink: 0, transition: 'all 0.2s',
                        }} />
                        <Text
                          size={0}
                          weight={isCurrent ? 'semibold' : 'regular'}
                          style={{ color: isCurrent ? '#111827' : isDone ? '#6B7280' : '#9CA3AF', textAlign: 'center' }}
                        >
                          {cfg.label.replace(/^\S+\s/, '')}
                        </Text>
                      </Flex>
                    )
                  })}
                </Flex>
              </Box>
            )}

            {isTerminal && (
              <Text size={1} style={{ color: stageCfg.color }}>
                {stage === 'closed' ? 'Deal successfully closed.' : 'Opportunity marked as lost.'}
              </Text>
            )}
          </Stack>
        </Box>

        {/* Deal details */}
        <Card padding={3} border radius={2}>
          <Stack space={3}>
            <Text size={0} weight="semibold" style={{ color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Deal Details
            </Text>
            <Stack space={2}>
              <InfoRow label="Assigned Agent"    value={doc.assignedAgent}                    />
              <InfoRow label="Target Close Date" value={fmtDate(doc.targetCloseDate)}         />
              <InfoRow label="List Price"        value={fmtCurrency(doc.listPriceTHB)}        />
              <InfoRow label="Offer Price"       value={fmtCurrency(doc.offerPriceTHB)}       />
              <InfoRow label="Financing"         value={doc.financingType}                    />
            </Stack>
          </Stack>
        </Card>

        {/* Unit details */}
        <Card padding={3} border radius={2}>
          <Stack space={3}>
            <Text size={0} weight="semibold" style={{ color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Unit Details
            </Text>
            <Stack space={2}>
              <InfoRow label="Project"    value={doc.projectName}                                        />
              <InfoRow label="Unit"       value={doc.unitNumber}                                         />
              <InfoRow label="Type"       value={doc.unitType}                                           />
              <InfoRow label="Floor"      value={doc.floor}                                              />
              <InfoRow label="Floor Area" value={doc.floorArea ? `${doc.floorArea} sqm` : null}         />
            </Stack>
          </Stack>
        </Card>

        {/* Buyer */}
        <Stack space={2}>
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Buyer</Text>
          {buyerRef ? (
            <IntentLink intent="edit" params={{ id: buyerRef, type: 'party' }} style={{ textDecoration: 'none' }}>
              <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
                <Flex align="center" justify="space-between">
                  <Text size={1} weight="semibold">
                    {doc.buyer?.legalName_th ?? doc.buyer?.legalName ?? doc.buyer?.firstName ?? 'View Buyer Record'}
                  </Text>
                  <Text size={0} muted>→ Open</Text>
                </Flex>
              </Card>
            </IntentLink>
          ) : (
            <Card padding={3} border radius={2} tone="transparent">
              <Text size={1} muted>No buyer linked. Create a Party record and link it here.</Text>
            </Card>
          )}
        </Stack>

        {/* Source lead */}
        {leadRef && (
          <Stack space={2}>
            <Text size={1} weight="semibold" style={{ color: '#374151' }}>Source Lead</Text>
            <IntentLink intent="edit" params={{ id: leadRef, type: 'lead' }} style={{ textDecoration: 'none' }}>
              <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
                <Flex align="center" justify="space-between">
                  <Text size={1} weight="semibold">{doc.lead?.contactName ?? 'View Lead Record'}</Text>
                  <Text size={0} muted>→ Open</Text>
                </Flex>
              </Card>
            </IntentLink>
          </Stack>
        )}

        {/* Notes */}
        {doc.notes && (
          <Card padding={3} border radius={2} tone="transparent">
            <Stack space={2}>
              <Text size={0} weight="semibold" muted>Notes</Text>
              <Text size={1}>{doc.notes}</Text>
            </Stack>
          </Card>
        )}

      </Stack>
    </Card>
  )
}
