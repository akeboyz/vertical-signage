/**
 * RentalBillingOverview
 * "Billing" view tab on Rent Space.
 * Reads billingPeriods from draft (preferred) → displayed → published.
 * Derives live status from dates — no async needed for periods.
 * useClient only to resolve party + projectSite reference names.
 */

import { useEffect, useState }                from 'react'
import { useClient }                          from 'sanity'
import { Box, Card, Stack, Text, Flex, Badge } from '@sanity/ui'
import { fmtDate } from '../utils/dateFormat'

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function deriveStatus(p: any, today: string): 'paid' | 'overdue' | 'due' | 'upcoming' {
  if (p.accrualStatus === 'paid') return 'paid'
  if (!p.periodStart || p.periodStart > today) return 'upcoming'
  if (p.periodEnd && p.periodEnd < today)       return 'overdue'
  return 'due'
}

function fmt(n: number) {
  return '฿ ' + n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}


const TONE:  Record<string, any>    = { overdue: 'critical', due: 'caution', paid: 'positive', upcoming: 'default' }
const ICON:  Record<string, string> = { overdue: '🚨', due: '🔴', paid: '✅', upcoming: '🕐' }
const LABEL: Record<string, string> = { overdue: 'Overdue', due: 'Due', paid: 'Paid', upcoming: 'Upcoming' }
const ORDER = ['overdue', 'due', 'paid', 'upcoming'] as const

function SummaryRow({ icon, label, count, amount, tone, bold }: {
  icon?: string; label: string; count?: number; amount: number; tone?: string; bold?: boolean
}) {
  return (
    <Flex justify="space-between" align="center" gap={3}
          style={{ borderBottom: '1px solid var(--card-border-color)', paddingBottom: 6 }}>
      <Flex align="center" gap={2} style={{ flex: 1 }}>
        {icon && <Text size={1}>{icon}</Text>}
        <Text size={1} weight={bold ? 'semibold' : undefined}>{label}</Text>
        {count != null && (
          <Badge tone={(tone as any) ?? 'default'} mode="outline" fontSize={0}>
            {count} {count === 1 ? 'period' : 'periods'}
          </Badge>
        )}
      </Flex>
      <Text size={1} weight={bold ? 'semibold' : undefined}
            style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {fmt(amount)}
      </Text>
    </Flex>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" align="center" gap={3}
          style={{ borderBottom: '1px solid var(--card-border-color)', paddingBottom: 4 }}>
      <Text size={1} muted style={{ flexShrink: 0 }}>{label}</Text>
      <Text size={1} style={{ textAlign: 'right' }}>{value}</Text>
    </Flex>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function RentalBillingOverview({ document: { draft, published, displayed } }: Props) {
  const client = useClient({ apiVersion: '2024-01-01' })

  // draft has the latest patches; fall back to displayed then published
  const src = draft ?? displayed ?? published ?? {}

  const periods: any[]     = src.billingPeriods ?? []
  const today              = localToday()
  const hasPeriods         = periods.length > 0

  // Resolve reference names
  const partyRef      = src.party?._ref      as string | undefined
  const projectRef    = src.projectSite?._ref as string | undefined
  const [partyName,   setPartyName]   = useState<string>('')
  const [projectName, setProjectName] = useState<string>('')

  useEffect(() => {
    if (!partyRef) return
    client
      .fetch(`*[_id == $id || _id == "drafts." + $id][0]{ legalName_en, legalName_th, firstName }`, { id: partyRef })
      .then((p: any) => setPartyName(p?.legalName_en ?? p?.legalName_th ?? p?.firstName ?? ''))
      .catch(() => {})
  }, [partyRef]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projectRef) return
    client
      .fetch(`*[_id == $id || _id == "drafts." + $id][0]{ projectEn, projectTh }`, { id: projectRef })
      .then((p: any) => setProjectName(p?.projectEn ?? p?.projectTh ?? ''))
      .catch(() => {})
  }, [projectRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bucket periods by live-derived status
  type Bucket = { count: number; amount: number }
  const buckets: Record<string, Bucket> = {
    overdue: { count: 0, amount: 0 },
    due:     { count: 0, amount: 0 },
    paid:    { count: 0, amount: 0 },
    upcoming:{ count: 0, amount: 0 },
  }
  for (const p of periods) {
    const s      = deriveStatus(p, today)
    const rental = Number(p.rentalAmount ?? 0)
    const units  = (p.meterEnd != null && p.meterStart != null) ? Math.max(0, p.meterEnd - p.meterStart) : 0
    buckets[s].count  += 1
    buckets[s].amount += rental + (units * Number(p.electricityRate ?? 0))
  }
  const grandTotal = Object.values(buckets).reduce((s, b) => s + b.amount, 0)

  return (
    <Box padding={4}>
      <Stack space={4}>

        {/* ── Header ────────────────────────────────────────────────────── */}
        <Card padding={3} radius={2} border
              tone={buckets.overdue.count > 0 ? 'critical' : buckets.due.count > 0 ? 'caution' : 'positive'}>
          <Stack space={2}>
            <Text size={0} weight="semibold" muted
                  style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Rental Payment Summary
            </Text>
            <Flex gap={2} wrap="wrap" align="center">
              {partyName   && <Text size={1} weight="semibold">{partyName}</Text>}
              {projectName && <Text size={1} muted>·  {projectName}</Text>}
            </Flex>
            <Flex gap={2} wrap="wrap">
              {hasPeriods && (
                <Badge mode="outline" tone="default" fontSize={0}>{periods.length} periods</Badge>
              )}
              {src.startingDate && (
                <Badge mode="outline" tone="default" fontSize={0}>
                  {fmtDate(src.startingDate)} → {fmtDate(src.endingDate)}
                </Badge>
              )}
              {buckets.overdue.count > 0 && (
                <Badge mode="outline" tone="critical" fontSize={0}>
                  🚨 {buckets.overdue.count} overdue
                </Badge>
              )}
            </Flex>
          </Stack>
        </Card>

        {/* ── Payment status ─────────────────────────────────────────────── */}
        {hasPeriods ? (
          <Card padding={3} radius={2} border>
            <Stack space={3}>
              <Text size={0} weight="semibold" muted
                    style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Payment Status
              </Text>
              <Stack space={2}>
                {ORDER.map(s => buckets[s].count > 0 ? (
                  <SummaryRow
                    key={s}
                    icon={ICON[s]}
                    label={LABEL[s]}
                    count={buckets[s].count}
                    amount={buckets[s].amount}
                    tone={TONE[s]}
                  />
                ) : null)}
                <SummaryRow label="Grand Total" amount={grandTotal} bold />
              </Stack>
            </Stack>
          </Card>
        ) : (
          <Card padding={4} radius={2} border tone="caution">
            <Text size={1} muted>
              No billing periods yet. Open Edit → Payment to generate them.
            </Text>
          </Card>
        )}

        {/* ── Contract details ───────────────────────────────────────────── */}
        <Card padding={3} radius={2} border>
          <Stack space={3}>
            <Text size={0} weight="semibold" muted
                  style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Contract
            </Text>
            <Stack space={2}>
              {partyName            && <Row label="Party"        value={partyName} />}
              {projectName          && <Row label="Project"      value={projectName} />}
              {src.contractNumber   && <Row label="Contract No." value={src.contractNumber} />}
              {src.startingDate     && <Row label="Start"        value={fmtDate(src.startingDate)} />}
              {src.endingDate       && <Row label="End"          value={fmtDate(src.endingDate)} />}
              {periods[0]?.rentalAmount && (
                <Row label="Monthly Rent" value={fmt(Number(periods[0].rentalAmount))} />
              )}
              {periods[0]?.electricityRate && (
                <Row label="Elec. Rate" value={`฿ ${periods[0].electricityRate} / unit`} />
              )}
            </Stack>
          </Stack>
        </Card>

      </Stack>
    </Box>
  )
}
