/**
 * UtilizationSummary
 *
 * Read-only cost allocation summary for Asset Registration — Utilization tab.
 * Reads utilization entries + unitCost + usefulLifeMonths from the live form,
 * fetches project site names, and shows cost allocated per period plus totals.
 *
 * Daily rate = (unitCost ÷ usefulLifeMonths) ÷ 30.44
 * Allocated  = Σ (dailyRate × days per entry)
 * Ongoing entries use today as the end date.
 */

import { useEffect, useState } from 'react'
import { useFormValue, useClient } from 'sanity'
import { Card, Stack, Flex, Text, Box, Badge } from '@sanity/ui'

interface UtilizationEntry {
  _key?:        string
  projectSite?: { _ref?: string }
  startDate?:   string
  endDate?:     string
}

function daysBetween(start: string, end?: string): number {
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  return Math.max(0, Math.ceil((e - s) / (1000 * 60 * 60 * 24)))
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function UtilizationSummary(_props: any) {
  const client           = useClient({ apiVersion: '2024-01-01' })
  const utilization      = useFormValue(['utilization'])       as UtilizationEntry[] | undefined
  const unitCost         = useFormValue(['unitCost'])          as number | undefined
  const usefulLifeMonths = useFormValue(['usefulLifeMonths'])  as number | undefined

  const [siteNames, setSiteNames] = useState<Record<string, string>>({})

  const entries = utilization ?? []
  const siteIds = [...new Set(
    entries.map(e => e.projectSite?._ref).filter((id): id is string => !!id)
  )]

  useEffect(() => {
    if (siteIds.length === 0) return
    client
      .fetch<Array<{ _id: string; projectEn?: string; nameTh?: string }>>(
        `*[_id in $ids]{ _id, projectEn, nameTh }`,
        { ids: siteIds },
      )
      .then(sites => {
        const map: Record<string, string> = {}
        for (const s of sites) map[s._id] = s.projectEn ?? s.nameTh ?? s._id
        setSiteNames(map)
      })
      .catch(() => {})
  }, [siteIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!unitCost || !usefulLifeMonths || entries.length === 0) return null

  const monthlyRate    = unitCost / usefulLifeMonths
  const dailyRate      = monthlyRate / 30.44
  const totalAllocated = entries.reduce((sum, e) => {
    if (!e.startDate) return sum
    return sum + dailyRate * daysBetween(e.startDate, e.endDate)
  }, 0)
  const remaining = Math.max(0, unitCost - totalAllocated)
  const fullyAllocated = remaining <= 0

  return (
    <Card padding={3} radius={2} border tone={fullyAllocated ? 'positive' : 'default'}>
      <Stack space={3}>

        {/* Header */}
        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Cost Allocation</Text>
          <Text size={0} muted>
            ฿{fmt(monthlyRate)} / mo  ·  ฿{dailyRate.toLocaleString('th-TH', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} / day
          </Text>
        </Flex>

        {/* Total obligation */}
        <Flex justify="space-between">
          <Text size={1} muted>Total Obligation</Text>
          <Text size={1} weight="semibold">฿{fmt(unitCost)} THB</Text>
        </Flex>

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        {/* Per-entry rows */}
        {entries.map((e, i) => {
          if (!e.startDate) return null
          const days     = daysBetween(e.startDate, e.endDate)
          const cost     = dailyRate * days
          const siteName = e.projectSite?._ref
            ? (siteNames[e.projectSite._ref] ?? '…')
            : '(no site)'
          const ongoing  = !e.endDate

          return (
            <Flex key={e._key ?? i} justify="space-between" align="center" gap={2}>
              <Stack space={1}>
                <Flex align="center" gap={2}>
                  <Text size={1}>{siteName}</Text>
                  {ongoing && (
                    <Badge tone="caution" mode="outline" fontSize={0}>Active</Badge>
                  )}
                </Flex>
                <Text size={0} muted>
                  {e.startDate} → {e.endDate ?? 'today'}  ·  {days} days
                </Text>
              </Stack>
              <Text size={1} weight="semibold">฿{fmt(cost)}</Text>
            </Flex>
          )
        })}

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        {/* Totals */}
        <Flex justify="space-between" align="center">
          <Text size={1} muted>Allocated</Text>
          <Text size={1}>฿{fmt(totalAllocated)}</Text>
        </Flex>

        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Remaining</Text>
          <Text
            size={2}
            weight="semibold"
            style={{
              color: fullyAllocated
                ? 'var(--card-positive-fg-color)'
                : 'var(--card-fg-color)',
            }}
          >
            ฿{fmt(remaining)}
          </Text>
        </Flex>

      </Stack>
    </Card>
  )
}
