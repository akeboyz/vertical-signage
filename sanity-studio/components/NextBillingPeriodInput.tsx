import React from 'react'
import { useFormValue } from 'sanity'
import { Card, Stack, Text, Flex, Badge } from '@sanity/ui'

interface BillingEntry {
  servicePeriodStart?: string
  servicePeriodEnd?:   string
}

function daysBetween(isoA: string, isoB: string): number {
  return Math.round((new Date(isoB).getTime() - new Date(isoA).getTime()) / 86400000)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  const [y, m, day] = iso.split('-')
  return `${day}/${m}/${y}`
}

export function NextBillingPeriodInput(_props: any) {
  const payments    = useFormValue(['payments'])    as BillingEntry[] | undefined
  const isSuspended = useFormValue(['isSuspended']) as boolean | undefined

  const entries = (payments ?? [])
    .filter(p => p.servicePeriodEnd)
    .slice()
    .sort((a, b) => (b.servicePeriodEnd ?? '').localeCompare(a.servicePeriodEnd ?? ''))

  if (entries.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="transparent">
        <Text size={1} muted>No billing periods recorded yet — will auto-compute once payments are linked.</Text>
      </Card>
    )
  }

  const latest      = entries[0]
  const latestEnd   = latest.servicePeriodEnd!
  const latestStart = latest.servicePeriodStart

  // Next period starts the day after the latest period ended
  const nextStart = addDays(latestEnd, 1)

  // Estimate next end using last period's duration
  const nextEnd = latestStart
    ? addDays(nextStart, daysBetween(latestStart, latestEnd) - 1)
    : null

  // How many days since the latest period ended (positive = overdue, negative = still within)
  const today      = new Date(); today.setHours(0, 0, 0, 0)
  const endDate    = new Date(latestEnd); endDate.setHours(0, 0, 0, 0)
  const daysLapsed = Math.round((today.getTime() - endDate.getTime()) / 86400000)

  const tone: 'caution' | 'critical' | 'positive' | 'transparent' =
    isSuspended      ? 'transparent' :
    daysLapsed > 14  ? 'critical'    :
    daysLapsed > 0   ? 'caution'     :
    daysLapsed >= -7 ? 'positive'    : 'transparent'

  const statusText =
    isSuspended     ? '⏸ Contract suspended — billing paused' :
    daysLapsed > 0  ? `⚠ ${daysLapsed} day${daysLapsed !== 1 ? 's' : ''} overdue — new payment likely needed` :
    daysLapsed === 0 ? '📅 Current period ends today' :
                      `✓ Current period ends in ${-daysLapsed} day${-daysLapsed !== 1 ? 's' : ''}`

  return (
    <Card padding={3} radius={2} border tone={tone}>
      <Stack space={2}>
        <Flex justify="space-between" align="center" gap={3}>
          <Text size={1} weight="semibold">
            {fmtDate(nextStart)}{nextEnd ? ` – ${fmtDate(nextEnd)}` : ''}
          </Text>
          <Badge tone={tone === 'transparent' ? 'default' : tone} mode="outline" fontSize={0} style={{ flexShrink: 0 }}>
            {isSuspended ? 'Suspended' : daysLapsed > 0 ? 'Overdue' : daysLapsed >= -7 ? 'Due soon' : 'Upcoming'}
          </Badge>
        </Flex>
        <Text size={0} muted>
          {statusText}
        </Text>
        <Text size={0} muted>
          Latest period: {latestStart ? fmtDate(latestStart) : '?'} – {fmtDate(latestEnd)}
          {nextEnd && latestStart ? `  ·  ${daysBetween(latestStart, latestEnd)} day cycle` : ''}
        </Text>
      </Stack>
    </Card>
  )
}
