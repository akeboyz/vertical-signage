import { useState, useEffect }      from 'react'
import { Stack, Text, Card, Spinner, Flex } from '@sanity/ui'
import { set, unset }               from 'sanity'
import type { StringInputProps }    from 'sanity'
import { useClient }                from 'sanity'

interface AssetTypeDef {
  key:  string
  name: string
}

/**
 * AssetTypeSelect
 *
 * Auto-discovers the Process Setup with useAssetConfig == true and reads
 * its assetTypes[]. Independent of whichever Process Setup is linked to
 * the current document (Procurement, Payment, etc.).
 */
export function AssetTypeSelect(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [assetTypes, setAssetTypes] = useState<AssetTypeDef[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    setLoading(true)
    client
      .fetch<{ assetTypes?: AssetTypeDef[] }>(
        `*[_type == "contractType" && useAssetConfig == true && isActive == true][0]{ assetTypes[]{ key, name } }`,
      )
      .then(ct => setAssetTypes(ct?.assetTypes ?? []))
      .catch(() => setAssetTypes([]))
      .finally(() => setLoading(false))
  }, [client])

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading asset types…</Text>
      </Flex>
    )
  }

  if (assetTypes.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>No asset types found. Go to Process Setup → enable "Use Asset Config" → add asset types.</Text>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      <select
        value={props.value ?? ''}
        onChange={e => {
          const val = e.target.value
          props.onChange(val ? set(val) : unset())
        }}
        style={{
          width:        '100%',
          padding:      '8px 12px',
          border:       '1px solid var(--card-border-color)',
          borderRadius: 4,
          fontSize:     14,
          background:   'var(--card-bg-color)',
          color:        'var(--card-fg-color)',
          cursor:       'pointer',
        }}
      >
        <option value="">— Select Asset Type —</option>
        {assetTypes.map(t => (
          <option key={t.key} value={t.key}>{t.name}</option>
        ))}
      </select>
    </Stack>
  )
}
