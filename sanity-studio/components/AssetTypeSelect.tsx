import { useState, useEffect }      from 'react'
import { Stack, Text, Card, Spinner, Flex } from '@sanity/ui'
import { set, unset }               from 'sanity'
import type { StringInputProps }    from 'sanity'
import { useFormValue, useClient }  from 'sanity'

interface AssetTypeDef {
  key:  string
  name: string
}

/**
 * AssetTypeSelect
 *
 * Reads assetTypes[] from the linked Process Setup document and renders
 * a dropdown so the user can pick which type this asset is.
 * Changing the selection clears the spec fields (they belong to the old type).
 */
export function AssetTypeSelect(props: StringInputProps) {
  const client           = useClient({ apiVersion: '2024-01-01' })
  const contractTypeRef  = useFormValue(['contractType', '_ref']) as string | undefined

  const [assetTypes, setAssetTypes] = useState<AssetTypeDef[]>([])
  const [loading,    setLoading]    = useState(false)

  useEffect(() => {
    if (!contractTypeRef) { setAssetTypes([]); return }
    setLoading(true)
    client
      .fetch<{ assetTypes?: AssetTypeDef[] }>(
        `*[_id == $id][0]{ assetTypes[]{ key, name } }`,
        { id: contractTypeRef },
      )

      .then(ct => setAssetTypes(ct?.assetTypes ?? []))
      .catch(() => setAssetTypes([]))
      .finally(() => setLoading(false))
  }, [contractTypeRef, client])

  if (!contractTypeRef) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>Select a Process Setup above to see available asset types.</Text>
      </Card>
    )
  }

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
        <Text size={1}>No asset types defined in this Process Setup. Go to Process Setup → Asset Config to add types.</Text>
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
