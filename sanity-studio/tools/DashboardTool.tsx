import { useEffect, useState, useCallback } from 'react'
import { useClient } from 'sanity'
import { IntentLink } from 'sanity/router'
import { Box, Card, Flex, Grid, Stack, Text, Badge, Spinner, Heading, Button } from '@sanity/ui'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pipeline {
  inquiry: number
  siteApproved: number
  quotationPending: number
  quotationApproved: number
  contractPending: number
  contractApproved: number
  signed: number
  live: number
}

interface Summary {
  activeContracts: number
  screensLive: number
  expiringSoon: number
  monthlyRevenue: number[]
}

interface NeedsActionItem {
  _id: string
  contractNumber?: string
  quotationNumber?: string
  customerName?: string
  quotationApprovalStatus?: string
  contractApprovalStatus?: string
  signedStatus?: string
  contractApprovedAt?: string
  _updatedAt: string
  projectName?: string
}

interface ApprovalItem {
  _id: string
  documentType: string
  stage: number
  totalStages: number
  stageLabel: string
  requestedAt: string
  approver: { title: string }
  contract: { _id: string; contractNumber?: string; quotationNumber?: string; projectName?: string }
}

interface Installation {
  ordered: number
  delivered: number
  installed: number
  configured: number
  live: number
}

interface ActiveInstallItem {
  _id: string
  installationStatus?: string
  projectName?: string
  contractNumber?: string
  monthlyValue?: number
}

interface RecentSignedItem {
  _id: string
  contractNumber?: string
  customerName?: string
  signedAt?: string
  projectName?: string
}

interface RecentLiveItem {
  _id: string
  monthlyValue?: number
  projectName?: string
  startDate?: string
}

interface DashboardData {
  pipeline:         Pipeline
  summary:          Summary
  needsAction:      NeedsActionItem[]
  pendingApprovals: ApprovalItem[]
  installation:     Installation
  activeInstalls:   ActiveInstallItem[]
  recentSigned:     RecentSignedItem[]
  recentLive:       RecentLiveItem[]
}

// ── GROQ query ────────────────────────────────────────────────────────────────

const QUERY = `{
  "pipeline": {
    "inquiry":           count(*[_type == "projectSite" && pipelineStage == "inquiry"]),
    "siteApproved":      count(*[_type == "projectSite" && pipelineStage == "approved"]),
    "quotationPending":  count(*[_type == "contract" && quotationApprovalStatus == "pending"]),
    "quotationApproved": count(*[_type == "contract" && quotationApprovalStatus == "approved" && contractApprovalStatus in ["not_requested","reset"]]),
    "contractPending":   count(*[_type == "contract" && contractApprovalStatus == "pending"]),
    "contractApproved":  count(*[_type == "contract" && contractApprovalStatus == "approved" && signedStatus != "signed"]),
    "signed":            count(*[_type == "contract" && signedStatus == "signed"])
  },
  "summary": {
    "activeContracts": count(*[_type == "contract" && signedStatus == "signed"]),
    "expiringSoon":    count(*[_type == "contract" && signedStatus == "signed" && endDate > now() && endDate < $ninetyDays]),
    "screensLive":     count(*[_type == "installation" && installationStatus == "live"]),
    "monthlyRevenue":  *[_type == "contract" && signedStatus == "signed"].monthlyValue
  },
  "needsAction": *[_type == "contract" && (
    quotationApprovalStatus in ["rejected","reset"] ||
    contractApprovalStatus in ["rejected","reset"] ||
    (contractApprovalStatus == "approved" && signedStatus != "signed")
  )][0...10]{
    _id, contractNumber, quotationNumber, customerName,
    quotationApprovalStatus, contractApprovalStatus, signedStatus,
    contractApprovedAt, _updatedAt,
    "projectName": projectSite->projectEn
  } | order(_updatedAt asc),
  "pendingApprovals": *[_type == "approvalRequest" && status == "pending"][0...8]{
    _id, documentType, stage, totalStages, stageLabel, requestedAt,
    "approver": approver->{ title },
    "contract": contract->{ _id, contractNumber, quotationNumber, "projectName": projectSite->projectEn }
  } | order(requestedAt asc),
  "recentSigned": *[_type == "contract" && signedStatus == "signed" && signedAt > $thirtyDaysAgo][0...6]{
    _id, contractNumber, customerName, signedAt,
    "projectName": projectSite->projectEn
  } | order(signedAt desc),
  "installation": {
    "ordered":    count(*[_type == "installation" && installationStatus == "screen_ordered"]),
    "delivered":  count(*[_type == "installation" && installationStatus == "screen_delivered"]),
    "installed":  count(*[_type == "installation" && installationStatus == "screen_installed"]),
    "configured": count(*[_type == "installation" && installationStatus == "system_configured"]),
    "live":       count(*[_type == "installation" && installationStatus == "live"])
  },
  "activeInstalls": *[_type == "installation" && installationStatus != "live"][0...8]{
    _id, installationStatus,
    "projectName": projectSite->projectEn
  } | order(_updatedAt asc),
  "recentLive": []
}`

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSince(iso: string | undefined): number {
  if (!iso) return 0
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function fmtDate(iso: string | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtBaht(values: number[] | undefined): string {
  const total = (values ?? []).reduce((s, v) => s + (v ?? 0), 0)
  return '฿' + total.toLocaleString('en-US')
}

function needsActionReason(item: NeedsActionItem): { label: string; tone: 'critical' | 'caution' } {
  if (item.quotationApprovalStatus === 'rejected') return { label: 'Quotation Rejected',    tone: 'critical' }
  if (item.quotationApprovalStatus === 'reset')    return { label: 'Quotation Reset',        tone: 'caution'  }
  if (item.contractApprovalStatus  === 'rejected') return { label: 'Contract Rejected',      tone: 'critical' }
  if (item.contractApprovalStatus  === 'reset')    return { label: 'Contract Reset',         tone: 'caution'  }
  if (item.contractApprovalStatus  === 'approved') return { label: 'Awaiting Signature',     tone: 'caution'  }
  return { label: 'Needs Attention', tone: 'caution' }
}

const INSTALL_LABEL: Record<string, string> = {
  screen_ordered:    '📦 Ordered',
  screen_delivered:  '🚚 Delivered',
  screen_installed:  '🔧 Installed',
  system_configured: '⚙️ Configured',
  live:              '✅ Live',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: string }) {
  return (
    <Text size={1} weight="semibold" style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {children}
    </Text>
  )
}

function Divider() {
  return <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
}

// ── Alert Bar ─────────────────────────────────────────────────────────────────

function AlertBar({ needsAction, pendingApprovals }: { needsAction: NeedsActionItem[]; pendingApprovals: ApprovalItem[] }) {
  const overdue = needsAction.filter(i => daysSince(i._updatedAt) > 7)
  const oldApprovals = pendingApprovals.filter(i => daysSince(i.requestedAt) > 3)
  const total = overdue.length + oldApprovals.length
  if (total === 0) return null
  return (
    <Card padding={3} radius={2} tone="critical" border>
      <Flex align="center" gap={3}>
        <Text size={1}>⚠️</Text>
        <Text size={1} weight="semibold">
          {overdue.length > 0 && `${overdue.length} contract${overdue.length > 1 ? 's' : ''} stuck > 7 days`}
          {overdue.length > 0 && oldApprovals.length > 0 && '  ·  '}
          {oldApprovals.length > 0 && `${oldApprovals.length} approval${oldApprovals.length > 1 ? 's' : ''} waiting > 3 days`}
        </Text>
      </Flex>
    </Card>
  )
}

// ── Pipeline Bar ──────────────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'inquiry',           label: 'Inquiry',        type: 'projectSite', color: '#6B7280' },
  { key: 'siteApproved',      label: 'Site Approved',  type: 'projectSite', color: '#3B82F6' },
  { key: 'quotationPending',  label: 'Q. Pending',     type: 'contract',    color: '#F59E0B' },
  { key: 'quotationApproved', label: 'Q. Approved',    type: 'contract',    color: '#10B981' },
  { key: 'contractPending',   label: 'C. Pending',     type: 'contract',    color: '#F59E0B' },
  { key: 'contractApproved',  label: 'C. Approved',    type: 'contract',    color: '#10B981' },
  { key: 'signed',            label: 'Signed',         type: 'contract',    color: '#8B5CF6' },
  { key: 'live',              label: 'Live',           type: 'contract',           color: '#22C55E' },
]

function PipelineBar({ pipeline }: { pipeline: Pipeline }) {
  return (
    <Card padding={4} radius={2} shadow={1}>
      <Stack space={3}>
        <SectionHeading>Pipeline Overview</SectionHeading>
        <Box style={{ overflowX: 'auto' }}>
          <Flex align="stretch" gap={0} style={{ minWidth: 640 }}>
            {PIPELINE_STAGES.map((stage, i) => {
              const count = pipeline[stage.key as keyof Pipeline] ?? 0
              const isLast = i === PIPELINE_STAGES.length - 1
              return (
                <Flex key={stage.key} align="center" style={{ flex: 1 }}>
                  <Stack space={2} style={{ flex: 1, textAlign: 'center' }}>
                    <Box
                      style={{
                        background:   count > 0 ? stage.color + '18' : '#F9FAFB',
                        border:       `2px solid ${count > 0 ? stage.color : '#E5E7EB'}`,
                        borderRadius: 8,
                        padding:      '10px 4px',
                        cursor:       count > 0 ? 'pointer' : 'default',
                        transition:   'all 0.15s',
                      }}
                    >
                      <Text
                        size={3}
                        weight="semibold"
                        style={{ color: count > 0 ? stage.color : '#D1D5DB', display: 'block', textAlign: 'center' }}
                      >
                        {count}
                      </Text>
                    </Box>
                    <Text size={0} style={{ color: '#6B7280', textAlign: 'center', lineHeight: 1.3 }}>
                      {stage.label}
                    </Text>
                  </Stack>
                  {!isLast && (
                    <Text size={1} style={{ color: '#D1D5DB', padding: '0 2px', flexShrink: 0, marginBottom: 18 }}>
                      →
                    </Text>
                  )}
                </Flex>
              )
            })}
          </Flex>
        </Box>
      </Stack>
    </Card>
  )
}

// ── Stat Cards ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <Card padding={4} radius={2} shadow={1} style={{ borderTop: `3px solid ${color}` }}>
      <Stack space={2}>
        <Text size={0} style={{ color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</Text>
        <Text size={4} weight="semibold" style={{ color }}>{value}</Text>
        {sub && <Text size={1} muted>{sub}</Text>}
      </Stack>
    </Card>
  )
}

function StatCards({ summary }: { summary: Summary }) {
  return (
    <Grid columns={4} gap={3}>
      <StatCard label="Active Contracts" value={String(summary.activeContracts)} color="#3B82F6" />
      <StatCard label="Monthly Revenue"  value={fmtBaht(summary.monthlyRevenue)}  color="#10B981" sub="from active contracts" />
      <StatCard label="Expiring ≤ 90 days" value={String(summary.expiringSoon)}   color={summary.expiringSoon > 0 ? '#F59E0B' : '#6B7280'} />
      <StatCard label="Screens Live"     value={String(summary.screensLive)}       color="#22C55E" />
    </Grid>
  )
}

// ── Needs Action ──────────────────────────────────────────────────────────────

function NeedsAction({ items }: { items: NeedsActionItem[] }) {
  return (
    <Card padding={4} radius={2} shadow={1} style={{ minHeight: 200 }}>
      <Stack space={3}>
        <Flex align="center" justify="space-between">
          <SectionHeading>Needs Action</SectionHeading>
          {items.length > 0 && (
            <Badge tone="critical" radius={2}>{items.length}</Badge>
          )}
        </Flex>
        {items.length === 0 ? (
          <Card padding={3} radius={2} tone="positive" border>
            <Text size={1} style={{ color: '#22C55E' }}>✓ All clear — no items need attention</Text>
          </Card>
        ) : (
          <Stack space={2}>
            {items.map(item => {
              const { label, tone } = needsActionReason(item)
              const ref = item.contractNumber ?? item.quotationNumber ?? '—'
              const days = daysSince(item._updatedAt)
              return (
                <IntentLink
                  key={item._id}
                  intent="edit"
                  params={{ id: item._id, type: 'contract' }}
                  style={{ textDecoration: 'none' }}
                >
                  <Card
                    padding={3}
                    radius={2}
                    border
                    tone={tone}
                    style={{ cursor: 'pointer' }}
                  >
                    <Flex align="center" justify="space-between" gap={3}>
                      <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
                        <Flex align="center" gap={2}>
                          <Text size={1} weight="semibold" style={{ color: '#111827' }}>
                            {ref}
                          </Text>
                          <Badge tone={tone} radius={2} style={{ fontSize: 10 }}>{label}</Badge>
                        </Flex>
                        <Text size={0} muted style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.projectName ?? item.customerName ?? '—'}
                        </Text>
                      </Stack>
                      <Text size={0} muted style={{ flexShrink: 0 }}>{days}d ago</Text>
                    </Flex>
                  </Card>
                </IntentLink>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

// ── Pending Approvals ─────────────────────────────────────────────────────────

function PendingApprovals({ items }: { items: ApprovalItem[] }) {
  return (
    <Card padding={4} radius={2} shadow={1} style={{ minHeight: 200 }}>
      <Stack space={3}>
        <Flex align="center" justify="space-between">
          <SectionHeading>Pending Approvals</SectionHeading>
          {items.length > 0 && (
            <Badge tone="caution" radius={2}>{items.length}</Badge>
          )}
        </Flex>
        {items.length === 0 ? (
          <Card padding={3} radius={2} tone="positive" border>
            <Text size={1} style={{ color: '#22C55E' }}>✓ No approvals waiting</Text>
          </Card>
        ) : (
          <Stack space={2}>
            {items.map(item => {
              const ref = item.contract?.contractNumber ?? item.contract?.quotationNumber ?? '—'
              const days = daysSince(item.requestedAt)
              const docLabel = item.documentType === 'quotation' ? 'Quotation' : 'Contract'
              return (
                <IntentLink
                  key={item._id}
                  intent="edit"
                  params={{ id: item.contract?._id, type: 'contract' }}
                  style={{ textDecoration: 'none' }}
                >
                  <Card padding={3} radius={2} border tone="caution" style={{ cursor: 'pointer' }}>
                    <Flex align="center" justify="space-between" gap={3}>
                      <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
                        <Flex align="center" gap={2} style={{ flexWrap: 'wrap' }}>
                          <Text size={1} weight="semibold" style={{ color: '#111827' }}>{ref}</Text>
                          <Badge tone="default" radius={2} style={{ fontSize: 10 }}>{docLabel}</Badge>
                          <Badge tone="default" radius={2} style={{ fontSize: 10 }}>
                            Stage {item.stage}/{item.totalStages}
                          </Badge>
                        </Flex>
                        <Text size={0} muted style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.contract?.projectName ?? '—'}  ·  Approver: {item.approver?.title ?? '—'}
                        </Text>
                      </Stack>
                      <Text size={0} muted style={{ flexShrink: 0 }}>{days}d</Text>
                    </Flex>
                  </Card>
                </IntentLink>
              )
            })}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

// ── Installation Progress ─────────────────────────────────────────────────────

function InstallationProgress({ installation, activeInstalls }: { installation: Installation; activeInstalls: ActiveInstallItem[] }) {
  const stages = [
    { key: 'ordered',    label: 'Ordered',    count: installation.ordered,    color: '#6B7280' },
    { key: 'delivered',  label: 'Delivered',  count: installation.delivered,  color: '#3B82F6' },
    { key: 'installed',  label: 'Installed',  count: installation.installed,  color: '#F59E0B' },
    { key: 'configured', label: 'Configured', count: installation.configured, color: '#8B5CF6' },
    { key: 'live',       label: 'Live',       count: installation.live,       color: '#22C55E' },
  ]
  return (
    <Card padding={4} radius={2} shadow={1}>
      <Stack space={4}>
        <SectionHeading>Installation Progress</SectionHeading>

        {/* Stage counters */}
        <Grid columns={5} gap={2}>
          {stages.map(s => (
            <Stack key={s.key} space={1} style={{ textAlign: 'center' }}>
              <Card
                padding={2}
                radius={2}
                style={{
                  background: s.count > 0 ? s.color + '18' : '#F9FAFB',
                  border: `1px solid ${s.count > 0 ? s.color : '#E5E7EB'}`,
                }}
              >
                <Text size={2} weight="semibold" style={{ color: s.count > 0 ? s.color : '#D1D5DB', textAlign: 'center' }}>
                  {s.count}
                </Text>
              </Card>
              <Text size={0} muted style={{ textAlign: 'center' }}>{s.label}</Text>
            </Stack>
          ))}
        </Grid>

        <Divider />

        {/* Active installs list */}
        {activeInstalls.length === 0 ? (
          <Text size={1} muted>No active installations in progress.</Text>
        ) : (
          <Stack space={2}>
            {activeInstalls.map(item => (
              <IntentLink
                key={item._id}
                intent="edit"
                params={{ id: item._id, type: 'installation' }}
                style={{ textDecoration: 'none' }}
              >
                <Card padding={3} radius={2} border style={{ cursor: 'pointer' }}>
                  <Flex align="center" justify="space-between" gap={2}>
                    <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
                      <Text size={1} weight="semibold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.projectName ?? item.contractNumber ?? '—'}
                      </Text>
                    </Stack>
                    <Badge tone="default" radius={2} style={{ fontSize: 10, flexShrink: 0 }}>
                      {INSTALL_LABEL[item.installationStatus ?? ''] ?? item.installationStatus ?? '—'}
                    </Badge>
                  </Flex>
                </Card>
              </IntentLink>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  )
}

// ── Recent Activity ───────────────────────────────────────────────────────────

function RecentActivity({ signed, live }: { signed: RecentSignedItem[]; live: RecentLiveItem[] }) {
  return (
    <Card padding={4} radius={2} shadow={1}>
      <Stack space={4}>
        <SectionHeading>Recent Activity (last 30 days)</SectionHeading>

        {/* Recently signed */}
        <Stack space={2}>
          <Text size={1} weight="semibold" style={{ color: '#8B5CF6' }}>✍️ Contracts Signed</Text>
          {signed.length === 0 ? (
            <Text size={1} muted>None this month.</Text>
          ) : (
            <Stack space={1}>
              {signed.map(item => (
                <IntentLink
                  key={item._id}
                  intent="edit"
                  params={{ id: item._id, type: 'contract' }}
                  style={{ textDecoration: 'none' }}
                >
                  <Card padding={2} radius={2} style={{ cursor: 'pointer' }}>
                    <Flex align="center" justify="space-between" gap={2}>
                      <Text size={1} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {item.projectName ?? item.customerName ?? '—'}
                      </Text>
                      <Text size={0} muted style={{ flexShrink: 0 }}>{fmtDate(item.signedAt)}</Text>
                    </Flex>
                  </Card>
                </IntentLink>
              ))}
            </Stack>
          )}
        </Stack>

        <Divider />

        {/* Recently live */}
        <Stack space={2}>
          <Text size={1} weight="semibold" style={{ color: '#22C55E' }}>✅ Screens Went Live</Text>
          {live.length === 0 ? (
            <Text size={1} muted>None this month.</Text>
          ) : (
            <Stack space={1}>
              {live.map(item => (
                <IntentLink
                  key={item._id}
                  intent="edit"
                  params={{ id: item._id, type: 'installation' }}
                  style={{ textDecoration: 'none' }}
                >
                  <Card padding={2} radius={2} style={{ cursor: 'pointer' }}>
                    <Flex align="center" justify="space-between" gap={2}>
                      <Text size={1} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {item.projectName ?? '—'}
                      </Text>
                      <Text size={0} muted style={{ flexShrink: 0 }}>
                        {item.monthlyValue ? '฿' + item.monthlyValue.toLocaleString() : '—'}
                      </Text>
                    </Flex>
                  </Card>
                </IntentLink>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Card>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export function DashboardTool() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [data,        setData]        = useState<DashboardData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const now           = new Date()
      const ninetyDays    = new Date(now.getTime() + 90 * 86_400_000).toISOString()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString()

      const result = await client.fetch<DashboardData>(QUERY, { ninetyDays, thirtyDaysAgo })
      setData(result)
      setError(null)
      setLastUpdated(new Date())
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [fetchData])

  return (
    <Box
      style={{ height: '100%', overflowY: 'auto', background: '#F3F4F6' }}
      padding={4}
    >
      <Stack space={4} style={{ maxWidth: 1280, margin: '0 auto' }}>

        {/* Header */}
        <Flex align="center" justify="space-between">
          <Stack space={1}>
            <Heading size={2}>Operations Dashboard</Heading>
            <Text size={1} muted>
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · auto-refreshes every 60s`
                : 'Loading…'}
            </Text>
          </Stack>
          <Button
            text="Refresh"
            mode="ghost"
            fontSize={1}
            padding={2}
            onClick={fetchData}
            disabled={loading}
          />
        </Flex>

        {/* Loading state */}
        {loading && !data && (
          <Card padding={6} radius={2} shadow={1}>
            <Flex align="center" justify="center" gap={3}>
              <Spinner />
              <Text size={1} muted>Loading dashboard…</Text>
            </Flex>
          </Card>
        )}

        {/* Error state */}
        {error && (
          <Card padding={4} radius={2} tone="critical" border>
            <Text size={1}>⚠️ {error}</Text>
          </Card>
        )}

        {data && (
          <Stack space={4}>
            {/* Alert bar */}
            <AlertBar needsAction={data.needsAction} pendingApprovals={data.pendingApprovals} />

            {/* Pipeline */}
            <PipelineBar pipeline={data.pipeline} />

            {/* Stat cards */}
            <StatCards summary={data.summary} />

            {/* Needs Action + Pending Approvals */}
            <Grid columns={2} gap={4}>
              <NeedsAction items={data.needsAction} />
              <PendingApprovals items={data.pendingApprovals} />
            </Grid>

            {/* Installation + Recent Activity */}
            <Grid columns={2} gap={4}>
              <InstallationProgress
                installation={data.installation ?? { ordered: 0, delivered: 0, installed: 0, configured: 0, live: 0 }}
                activeInstalls={data.activeInstalls ?? []}
              />
              <RecentActivity signed={data.recentSigned} live={data.recentLive} />
            </Grid>
          </Stack>
        )}

      </Stack>
    </Box>
  )
}
