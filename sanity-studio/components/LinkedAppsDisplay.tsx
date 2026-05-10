/**
 * LinkedAppsDisplay
 *
 * Read-only field on the 5.4 App Installed tab.
 * Reads installedApps[] from the form, fetches each linked licenseAsset,
 * and renders an info card per app.
 */

import { useEffect, useState }  from 'react'
import { Stack, Card, Text, Flex, Box, Badge, Spinner } from '@sanity/ui'
import type { StringInputProps } from 'sanity'
import { useClient, useFormValue } from 'sanity'

interface AppEntry {
  _key:          string
  appName?:      string
  version?:      string
  licenseAsset?: { _ref?: string }
}

interface AssetInfo {
  assetTag?:        string
  brand?:           string
  model?:           string
  serialNumber?:    string
  status?:          string
  unitCost?:        number
  warrantyEndDate?: string
  specFields?:      string
}

const STATUS_LABEL: Record<string, string> = {
  in_storage:     '📦 In Storage',
  installed:      '✅ Installed',
  under_repair:   '🔧 Under Repair',
  decommissioned: '⛔ Decommissioned',
  returned:       '↩️ Returned',
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null
  return (
    <Flex gap={3} align="flex-start">
      <Text size={0} muted style={{ minWidth: 130, flexShrink: 0 }}>{label}</Text>
      <Text size={0}>{String(value)}</Text>
    </Flex>
  )
}

export function LinkedAppsDisplay(props: StringInputProps) {
  const client      = useClient({ apiVersion: '2024-01-01' })
  const installedApps = useFormValue(['installedApps']) as AppEntry[] | undefined

  const [assetMap, setAssetMap] = useState<Record<string, AssetInfo>>({})
  const [loading,  setLoading]  = useState(false)

  const refs = (installedApps ?? [])
    .map(a => a.licenseAsset?._ref)
    .filter((r): r is string => !!r)

  useEffect(() => {
    if (refs.length === 0) { setAssetMap({}); return }
    setLoading(true)

    client
      .fetch<AssetInfo[]>(
        `*[_id in $ids || ("drafts." + _id) in $ids]{
          _id, assetTag, brand, model, serialNumber, status, unitCost, warrantyEndDate, specFields
        }`,
        { ids: refs },
      )
      .then(results => {
        const map: Record<string, AssetInfo> = {}
        ;(results ?? []).forEach(a => {
          if (a._id) map[a._id.replace(/^drafts\./, '')] = a
        })
        setAssetMap(map)
      })
      .catch(() => setAssetMap({}))
      .finally(() => setLoading(false))
  }, [refs.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const apps = (installedApps ?? []).filter(a => a.licenseAsset?._ref)

  if (apps.length === 0) return null

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading app details…</Text>
      </Flex>
    )
  }

  return (
    <Stack space={3}>
      {apps.map(app => {
        const ref   = app.licenseAsset?._ref?.replace(/^drafts\./, '') ?? ''
        const asset = assetMap[ref]
        if (!asset) return null

        const specEntries: { key: string; value: string }[] = []
        if (asset.specFields) {
          try {
            const parsed = JSON.parse(asset.specFields) as Record<string, string>
            Object.entries(parsed)
              .filter(([k, v]) => k !== '_log' && v)
              .forEach(([k, v]) => specEntries.push({ key: k, value: v }))
          } catch {}
        }

        const title = app.appName || [asset.brand, asset.model].filter(Boolean).join(' ') || asset.assetTag || '—'

        return (
          <Card key={app._key} padding={3} radius={2} border tone="primary">
            <Stack space={3}>

              {/* Header */}
              <Flex align="center" justify="space-between" gap={2}>
                <Stack space={1}>
                  <Text size={1} weight="semibold">{title}</Text>
                  {app.version && <Text size={0} muted>v{app.version}</Text>}
                </Stack>
                <Badge tone="primary" mode="outline" fontSize={0}>{asset.assetTag ?? 'Asset'}</Badge>
              </Flex>

              <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

              <Stack space={2}>
                <InfoRow label="Model / Plan"  value={asset.model} />
                <InfoRow label="License Key"   value={asset.serialNumber} />
                <InfoRow label="Status"        value={STATUS_LABEL[asset.status ?? ''] ?? asset.status} />
                <InfoRow label="Unit Cost"     value={asset.unitCost != null ? `${asset.unitCost.toLocaleString()} THB` : null} />
                <InfoRow label="Warranty End"  value={asset.warrantyEndDate} />
              </Stack>

              {specEntries.length > 0 && (
                <>
                  <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
                  <Stack space={2}>
                    {specEntries.map(({ key, value }) => (
                      <InfoRow key={key} label={key} value={value} />
                    ))}
                  </Stack>
                </>
              )}

            </Stack>
          </Card>
        )
      })}
    </Stack>
  )
}
