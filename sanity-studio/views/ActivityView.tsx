/**
 * ActivityView — shows a business event timeline for a contract or project document.
 *
 * For contracts: fetches approvalRequests directly linked to the contract.
 * For projects:  looks up the sourceContract, then shows its approval history
 *                plus the project creation (signing) event.
 *
 * For field-level change history, users can use the built-in
 * "Review Changes" (🕐) button in the Edit tab.
 */

import { useEffect, useState }                                              from 'react'
import { useClient }                                                        from 'sanity'
import { Card, Stack, Text, Flex, Badge, Spinner, Box, Heading, Tooltip }  from '@sanity/ui'
import { InstallationStatusTimeline, PaymentStatusTimeline } from '../components/PipelineStatusTimeline'

interface Props {
  document: {
    displayed: Record<string, any>
  }
  documentId: string
}

interface ApprovalRequest {
  _id:             string
  documentType:    string
  stage:           number
  totalStages:     number
  stageLabel:      string
  status:          string
  requestedAt:     string | null
  respondedAt:     string | null
  rejectionReason: string | null
  approver: { title: string; email: string } | null
}

interface TimelineEvent {
  ts:      string           // ISO timestamp for sorting
  emoji:   string
  title:   string
  sub?:    string
  tone:    'positive' | 'critical' | 'caution' | 'default'
  docType: string
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
         '  ' +
         d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function docTypeLabel(dt: string): string {
  if (dt === 'quotation')   return 'Quotation'
  if (dt === 'contract')    return 'Contract'
  if (dt === 'projectSite') return 'Project Site'
  return dt
}

function buildEvents(requests: ApprovalRequest[], doc: Record<string, any>): TimelineEvent[] {
  const events: TimelineEvent[] = []

  for (const r of requests) {
    const label = docTypeLabel(r.documentType)

    // Approval requested (only stage 1 has requestedAt set at creation)
    if (r.stage === 1 && r.requestedAt) {
      events.push({
        ts:      r.requestedAt,
        emoji:   '📨',
        title:   `${label} approval requested`,
        sub:     `Sent to ${r.approver?.title ?? 'approver'}`,
        tone:    'default',
        docType: r.documentType,
      })
    }

    // Stage approved
    if (r.status === 'approved' && r.respondedAt) {
      events.push({
        ts:      r.respondedAt,
        emoji:   '✅',
        title:   `${label} approved — ${r.stageLabel}`,
        sub:     `By ${r.approver?.title ?? r.approver?.email ?? '—'}`,
        tone:    'positive',
        docType: r.documentType,
      })
    }

    // Stage rejected
    if (r.status === 'rejected' && r.respondedAt) {
      events.push({
        ts:      r.respondedAt,
        emoji:   '❌',
        title:   `${label} rejected — ${r.stageLabel}`,
        sub:     [
          `By ${r.approver?.title ?? r.approver?.email ?? '—'}`,
          r.rejectionReason ? `Reason: ${r.rejectionReason}` : '',
        ].filter(Boolean).join(' · '),
        tone:    'critical',
        docType: r.documentType,
      })
    }

    // Stage cancelled (after a rejection)
    if (r.status === 'cancelled') {
      events.push({
        ts:      r.requestedAt ?? new Date(0).toISOString(),
        emoji:   '⊘',
        title:   `${label} ${r.stageLabel} cancelled`,
        tone:    'default',
        docType: r.documentType,
      })
    }
  }

  // Signed event
  if (doc.signedStatus === 'signed' && doc.signedAt) {
    events.push({
      ts:      doc.signedAt,
      emoji:   '✍️',
      title:   'Contract marked as signed',
      sub:     doc.signedBy ? `By ${doc.signedBy}` : undefined,
      tone:    'positive',
      docType: 'contract',
    })
  }

  // Sort oldest → newest
  return events.sort((a, b) => a.ts.localeCompare(b.ts))
}

// ── Tone colours ──────────────────────────────────────────────────────────────

const TONE_DOT: Record<string, string> = {
  positive: '#1e7e34',
  critical:  '#c82333',
  caution:   '#e6a817',
  default:   '#aaa',
}

// ── Pipeline bar ───────────────────────────────────────────────────────────────

interface PipelineStep {
  key:   string
  label: string
  tone:  string
}

const TONE_BG: Record<string, string> = {
  positive: '#1e7e34',
  caution:  '#e6a817',
  critical: '#c82333',
  default:  '#6b7280',
}

const TONE_MUTED: Record<string, string> = {
  positive: '#d4edda',
  caution:  '#fff3cd',
  critical: '#f8d7da',
  default:  '#e5e7eb',
}

function PipelineBar({ steps, currentKey }: { steps: PipelineStep[]; currentKey: string | undefined }) {
  if (steps.length === 0) return null

  const currentIdx = currentKey ? steps.findIndex(s => s.key === currentKey) : -1

  return (
    <Card padding={4} radius={2} border>
      <Stack space={3}>
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold">Pipeline</Text>
          {currentIdx >= 0 && (
            <Badge tone="primary" radius={2} fontSize={0}>
              Step {currentIdx + 1} of {steps.length}
            </Badge>
          )}
        </Flex>

        {/* Step pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {steps.map((step, i) => {
            const isCurrent = step.key === currentKey
            const isPast    = currentIdx >= 0 && i < currentIdx
            const bg        = isCurrent ? TONE_BG[step.tone ?? 'default']    : isPast ? TONE_MUTED[step.tone ?? 'default'] : '#f3f4f6'
            const color     = isCurrent ? '#fff'                              : isPast ? TONE_BG[step.tone ?? 'default']   : '#9ca3af'
            const border    = isCurrent ? 'none' : `1.5px solid ${isPast ? TONE_BG[step.tone ?? 'default'] : '#d1d5db'}`
            const opacity   = isCurrent ? 1 : isPast ? 0.75 : 0.5

            return (
              <Tooltip
                key={step.key}
                content={
                  <Box padding={2}>
                    <Text size={1}>{isCurrent ? '▶ Current step' : isPast ? '✓ Completed' : 'Not reached yet'}</Text>
                  </Box>
                }
                placement="top"
                portal
              >
                <div style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:           6,
                  padding:      '5px 12px',
                  borderRadius:  20,
                  background:    bg,
                  border,
                  opacity,
                  cursor:       'default',
                  transition:   'opacity 0.2s',
                }}>
                  {/* connector arrow between pills */}
                  {i > 0 && (
                    <span style={{ color: '#d1d5db', fontSize: 10, marginLeft: -8, marginRight: 2 }}>▶</span>
                  )}
                  <Text size={1} style={{ color, fontWeight: isCurrent ? 600 : 400, whiteSpace: 'nowrap' }}>
                    {step.label}
                  </Text>
                </div>
              </Tooltip>
            )
          })}
        </div>

        {/* Current step detail */}
        {currentIdx >= 0 && (
          <Text size={1} muted>
            Current: <strong>{steps[currentIdx].label}</strong>
          </Text>
        )}
        {!currentKey && (
          <Text size={1} muted style={{ fontStyle: 'italic' }}>
            Pipeline not started — no step reached yet.
          </Text>
        )}
      </Stack>
    </Card>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ActivityView({ document: { displayed: doc }, documentId }: Props) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const [events,        setEvents]        = useState<TimelineEvent[] | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([])

  const isProject        = doc._type === 'project'
  const sourceContractId: string | undefined =
    doc.sourceContracts?.[0]?._ref ?? doc.sourceContract?._ref
  const pipelineStage:    string | undefined = doc.pipelineStage
  const contractTypeRef:  string | undefined = doc.contractType?._ref

  // Fetch pipeline steps from processSetup
  useEffect(() => {
    if (!contractTypeRef) { setPipelineSteps([]); return }
    client
      .fetch<PipelineStep[]>(
        `*[_id == $id][0].steps[]{ key, label, tone }`,
        { id: contractTypeRef },
      )
      .then(steps => setPipelineSteps(steps ?? []))
      .catch(() => setPipelineSteps([]))
  }, [contractTypeRef]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setEvents(null)
    setError(null)

    async function load() {
      // For project documents, resolve sourceContract first
      let contractId   = documentId
      let contractDoc  = doc

      if (isProject) {
        if (!sourceContractId) {
          setEvents([])
          return
        }
        contractId  = sourceContractId
        contractDoc = await client.fetch(
          `*[_id == $id][0]{ signedAt, signedBy, signedStatus }`,
          { id: sourceContractId },
        ) ?? {}
      }

      const requests = await client.fetch<ApprovalRequest[]>(
        `*[_type == "approvalRequest" && contract._ref == $id] | order(documentType asc, stage asc) {
          _id, documentType, stage, totalStages, stageLabel, status,
          requestedAt, respondedAt, rejectionReason,
          "approver": approver->{ title, email }
        }`,
        { id: contractId },
      )

      setEvents(buildEvents(requests ?? [], contractDoc))
    }

    load().catch(err => setError(err?.message ?? 'Failed to load activity'))
  }, [documentId, sourceContractId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        {/* ── Status timeline ──────────────────────────────────────────────── */}
        {doc._type === 'procurement' && (
          <PaymentStatusTimeline currentStatus={doc.paymentStatus} doc={doc} />
        )}
        {doc._type === 'payment' && (
          <PaymentStatusTimeline doc={doc} />
        )}
        {doc._type === 'installation' && (
          <InstallationStatusTimeline currentStatus={doc.installationStatus} />
        )}
        {doc._type !== 'procurement' && doc._type !== 'payment' && doc._type !== 'installation' && pipelineSteps.length > 0 && (
          <PipelineBar steps={pipelineSteps} currentKey={pipelineStage} />
        )}

        <Stack space={2}>
          <Heading size={2}>Activity Log</Heading>
          <Text size={1} muted>
            Business events — approvals, rejections, and signing.
            For field-level change history, use the 🕐 Review Changes button in the Edit tab.
          </Text>
        </Stack>

        {error && (
          <Card padding={4} tone="critical" border radius={2}>
            <Text size={1}>{error}</Text>
          </Card>
        )}

        {!error && events === null && (
          <Flex align="center" gap={2} padding={2}>
            <Spinner muted />
            <Text size={1} muted>Loading activity…</Text>
          </Flex>
        )}

        {!error && events !== null && events.length === 0 && (
          <Card padding={4} border radius={2} tone="transparent">
            <Text size={1} muted align="center">
              No activity yet. Activity appears here once approval is requested.
            </Text>
          </Card>
        )}

        {!error && events !== null && events.length > 0 && (
          <Stack space={0}>
            {events.map((ev, i) => (
              <Flex key={i} gap={3} align="flex-start">

                {/* Timeline line + dot */}
                <Flex direction="column" align="center" style={{ minWidth: 24 }}>
                  <Box
                    style={{
                      width:        12,
                      height:       12,
                      borderRadius: '50%',
                      background:   TONE_DOT[ev.tone],
                      flexShrink:   0,
                      marginTop:    4,
                    }}
                  />
                  {i < events.length - 1 && (
                    <Box style={{ width: 2, flex: 1, minHeight: 28, background: '#e0e0e0', margin: '4px 0' }} />
                  )}
                </Flex>

                {/* Event content */}
                <Box style={{ paddingBottom: i < events.length - 1 ? 20 : 0 }}>
                  <Stack space={1}>
                    <Flex align="center" gap={2} wrap="wrap">
                      <Text size={1} weight="semibold">{ev.emoji} {ev.title}</Text>
                      <Badge
                        tone={ev.tone === 'default' ? undefined : ev.tone}
                        mode="outline"
                        fontSize={0}
                        radius={2}
                      >
                        {docTypeLabel(ev.docType)}
                      </Badge>
                    </Flex>
                    {ev.sub && <Text size={1} muted>{ev.sub}</Text>}
                    <Text size={0} muted style={{ fontFamily: 'monospace' }}>{fmtDate(ev.ts)}</Text>
                  </Stack>
                </Box>

              </Flex>
            ))}
          </Stack>
        )}

      </Stack>
    </Card>
  )
}
