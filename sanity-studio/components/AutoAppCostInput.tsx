/**
 * AutoAppCostInput
 *
 * Auto-calculates total app cost from installedApps[].licenseAsset.unitCost.
 * Sums all linked app assets and writes the total to appCost.
 * Shows a per-app breakdown below.
 */

import { useEffect, useState }  from 'react'
import { set, unset }           from 'sanity'
import type { NumberInputProps } from 'sanity'
import { useClient, useFormValue } from 'sanity'
import { Stack, Card, Text, Flex, Box, Badge, Spinner } from '@sanity/ui'

interface AppEntry {
  _key:          string
  appName?:      string
  licenseAsset?: { _ref?: string }
}

interface AssetCost {
  _id:       string
  brand?:    string
  model?:    string
  unitCost?: number
}

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function AutoAppCostInput(props: NumberInputProps) {
  const client        = useClient({ apiVersion: '2024-01-01' })
  const installedApps = useFormValue(['installedApps']) as AppEntry[] | undefined

  const [breakdown, setBreakdown] = useState<{ name: string; cost: number }[]>([])
  const [loading,   setLoading]   = useState(false)

  const entries = (installedApps ?? []).filter(a => a.licenseAsset?._ref)
  const refs    = entries.map(a => a.licenseAsset!._ref as string)

  useEffect(() => {
    if (refs.length === 0) {
      setBreakdown([])
      if (props.value !== undefined) props.onChange(unset())
      return
    }

    setLoading(true)

    client
      .fetch<AssetCost[]>(
        `*[_id in $ids || ("drafts." + _id) in $ids]{ _id, brand, model, unitCost }`,
        { ids: refs },
      )
      .then(results => {
        // Build a map from base ID → asset
        const map: Record<string, AssetCost> = {}
        ;(results ?? []).forEach(a => {
          map[a._id.replace(/^drafts\./, '')] = a
        })

        // Build breakdown preserving app order
        const rows = entries.map(entry => {
          const baseRef = entry.licenseAsset!._ref!.replace(/^drafts\./, '')
          const asset   = map[baseRef]
          const name    = entry.appName || [asset?.brand, asset?.model].filter(Boolean).join(' ') || baseRef
          return { name, cost: asset?.unitCost ?? 0 }
        })

        setBreakdown(rows)

        const total = rows.reduce((sum, r) => sum + r.cost, 0)
        if (total !== (props.value ?? 0)) {
          props.onChange(total > 0 ? set(total) : unset())
        }
      })
      .catch(() => setBreakdown([]))
      .finally(() => setLoading(false))
  }, [refs.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const total = breakdown.reduce((sum, r) => sum + r.cost, 0)

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Calculating app cost…</Text>
      </Flex>
    )
  }

  if (entries.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>Link app assets in the list above to auto-calculate cost.</Text>
      </Card>
    )
  }

  return (
    <Card padding={3} radius={2} border tone="primary">
      <Stack space={3}>
        {/* Per-app breakdown */}
        {breakdown.map((row, i) => (
          <Flex key={i} justify="space-between" align="center" gap={3}>
            <Text size={1} muted>{row.name}</Text>
            <Text size={1} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {row.cost > 0 ? `${fmt(row.cost)} THB` : <em style={{ opacity: 0.5 }}>no cost</em>}
            </Text>
          </Flex>
        ))}

        {/* Total */}
        {breakdown.length > 1 && (
          <>
            <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
            <Flex justify="space-between" align="center" gap={3}>
              <Text size={1} weight="semibold">Total</Text>
              <Text size={1} weight="semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {fmt(total)} THB
              </Text>
            </Flex>
          </>
        )}

        <Flex gap={2} align="center">
          <Badge tone="positive" mode="outline" fontSize={0}>Auto</Badge>
          <Text size={0} muted>Summed from linked app asset costs</Text>
        </Flex>
      </Stack>
    </Card>
  )
}
