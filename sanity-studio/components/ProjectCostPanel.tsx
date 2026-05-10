/**
 * ProjectCostPanel
 *
 * Read-only cost summary for Install & Activate.
 * Aggregates:
 *   1. Device cost  — from linked Asset's unitCost
 *   2. Electrical   — from electricalCost field on this document
 *   3. Manual items — from costItems[] array on this document
 *
 * Rendered as a breakdown table with a running total.
 */

import { useEffect, useState } from 'react'
import { Stack, Card, Text, Box, Flex, Spinner, Badge } from '@sanity/ui'
import { useClient, useFormValue } from 'sanity'
import type { StringInputProps } from 'sanity'

interface CostItem {
  _key:      string
  category:  string
  label?:    string
  amount?:   number
}

const CATEGORY_LABEL: Record<string, string> = {
  app_software:        '💻 App / Software',
  installation_labor:  '🔧 Installation Labor',
  delivery:            '🚚 Delivery',
  monthly_fee:         '📅 Monthly Fee',
  other:               '📦 Other',
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Row({ label, amount, muted, bold }: { label: string; amount: number; muted?: boolean; bold?: boolean }) {
  return (
    <Flex justify="space-between" align="center" gap={3}>
      <Text size={1} muted={muted} weight={bold ? 'semibold' : undefined}>{label}</Text>
      <Text size={1} muted={muted} weight={bold ? 'semibold' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {fmt(amount)}
      </Text>
    </Flex>
  )
}

export function ProjectCostPanel(props: StringInputProps) {
  const client        = useClient({ apiVersion: '2024-01-01' })
  const assetRef        = useFormValue(['asset', '_ref'])    as string | undefined
  const setupCost       = useFormValue(['setupCost'])        as number | undefined
  const electricalCost  = useFormValue(['electricalCost'])   as number | undefined
  const wifiCost        = useFormValue(['wifiCost'])         as number | undefined
  const appCost         = useFormValue(['appCost'])          as number | undefined
  const activationCost  = useFormValue(['activationCost'])   as number | undefined
  const costItems       = useFormValue(['costItems'])        as CostItem[] | undefined

  const [deviceCost, setDeviceCost] = useState<number | null>(null)
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    if (!assetRef) { setDeviceCost(null); return }
    setLoading(true)
    client
      .fetch<{ unitCost?: number }>(
        `coalesce(*[_id == "drafts." + $ref][0], *[_id == $ref][0]){ unitCost }`,
        { ref: assetRef },
      )
      .then(a => setDeviceCost(a?.unitCost ?? null))
      .catch(() => setDeviceCost(null))
      .finally(() => setLoading(false))
  }, [assetRef, client])

  const setup      = setupCost      ?? 0
  const elec       = electricalCost ?? 0
  const wifi       = wifiCost       ?? 0
  const app        = appCost        ?? 0
  const activation = activationCost ?? 0
  const itemsTotal = (costItems ?? []).reduce((sum, i) => sum + (i.amount ?? 0), 0)
  const device     = deviceCost ?? 0
  const total      = device + setup + elec + wifi + app + activation + itemsTotal

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Calculating project cost…</Text>
      </Flex>
    )
  }

  if (!assetRef && !setup && !elec && !wifi && !app && !activation && !itemsTotal) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>Link an Asset above to auto-include device cost, then add cost items below.</Text>
      </Card>
    )
  }

  return (
    <Card padding={4} radius={2} border tone="primary">
      <Stack space={3}>
        <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>
          Project Cost Summary (THB)
        </Text>

        {/* Device line */}
        <Row
          label={`📺 Screen / Device${deviceCost == null && assetRef ? ' (no unit cost on asset)' : ''}`}
          amount={device}
          muted={device === 0}
        />

        {/* Setup line */}
        <Row label="🔨 Item Setup" amount={setup} muted={setup === 0} />

        {/* Electrical line */}
        <Row label="⚡ Electrical & Wiring" amount={elec} muted={elec === 0} />

        {/* Wifi line */}
        <Row label="📶 Wifi & Router" amount={wifi} muted={wifi === 0} />

        {/* App line */}
        <Row label="📱 App Installed" amount={app} muted={app === 0} />

        {/* Activation line */}
        <Row label="🔧 Activate & Test" amount={activation} muted={activation === 0} />

        {/* Manual cost items */}
        {(costItems ?? []).map(item => (
          <Row
            key={item._key}
            label={`${CATEGORY_LABEL[item.category] ?? item.category}${item.label ? ` · ${item.label}` : ''}`}
            amount={item.amount ?? 0}
            muted={(item.amount ?? 0) === 0}
          />
        ))}

        {/* Divider */}
        <Box style={{ borderTop: '1px solid var(--card-border-color)', paddingTop: 4 }}>
          <Row label="Total" amount={total} bold />
        </Box>

        <Flex gap={2} align="center">
          <Badge tone="positive" mode="outline" fontSize={0}>Auto</Badge>
          <Text size={0} muted>Pulled from each step tab · Manual items below</Text>
        </Flex>
      </Stack>
    </Card>
  )
}
