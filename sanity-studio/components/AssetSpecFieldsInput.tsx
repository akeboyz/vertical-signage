import { useState, useEffect, useCallback } from 'react'
import { Stack, Text, TextInput, Card, Spinner, Flex, Label, Button, Box } from '@sanity/ui'
import { set, unset }              from 'sanity'
import type { StringInputProps }   from 'sanity'
import { useClient, useFormValue } from 'sanity'

interface SpecFieldDef {
  key:       string
  label:     string
  fieldType: 'string' | 'number' | 'text' | 'yes_no'
}

interface SpecGroupDef {
  groupName:  string
  specFields: SpecFieldDef[]
}

interface AssetTypeDef {
  key:        string
  name:       string
  specGroups?: SpecGroupDef[]
}

/**
 * AssetSpecFieldsInput
 *
 * Auto-discovers the Process Setup with useAssetConfig == true, finds the
 * matching asset type, and renders its specGroups as dynamic inputs.
 * Values are stored as a JSON string.
 */
export function AssetSpecFieldsInput(props: StringInputProps) {
  const client    = useClient({ apiVersion: '2024-01-01' })
  const assetType = useFormValue(['assetType']) as string | undefined

  const [specGroups, setSpecGroups] = useState<SpecGroupDef[]>([])
  const [loading,    setLoading]    = useState(false)
  const [values,     setValues]     = useState<Record<string, string>>({})

  // Parse stored JSON on mount
  useEffect(() => {
    try {
      const raw = props.value as string | undefined
      setValues(raw ? JSON.parse(raw) : {})
    } catch {
      setValues({})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch spec groups whenever asset type changes
  useEffect(() => {
    if (!assetType) { setSpecGroups([]); return }
    setLoading(true)
    client
      .fetch<{ assetTypes?: AssetTypeDef[] }>(
        `*[_type == "contractType" && useAssetConfig == true && isActive == true][0]{
          assetTypes[]{
            key, name,
            specGroups[]{ groupName, specFields[]{ key, label, fieldType } }
          }
        }`,
      )
      .then(ct => {
        const found = (ct?.assetTypes ?? []).find(t => t.key === assetType)
        setSpecGroups(found?.specGroups ?? [])
      })
      .catch(() => setSpecGroups([]))
      .finally(() => setLoading(false))
  }, [assetType, client])

  const handleChange = useCallback((key: string, value: string) => {
    setValues(prev => {
      const next = { ...prev, [key]: value }
      const json = JSON.stringify(next)
      props.onChange(json === '{}' ? unset() : set(json))
      return next
    })
  }, [props])

  if (!assetType) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>Select an Asset Type above to see spec fields.</Text>
      </Card>
    )
  }

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading spec fields…</Text>
      </Flex>
    )
  }

  if (specGroups.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>No spec groups defined for this asset type. Go to Process Setup → Asset Config → edit the asset type to add spec groups.</Text>
      </Card>
    )
  }

  return (
    <Stack space={6}>
      {specGroups.map(group => (
        <Stack space={4} key={group.groupName}>

          {/* ── Group header ─────────────────────────────────────── */}
          <Box paddingTop={2}>
            <Text
              size={0}
              weight="semibold"
              muted
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
            >
              {group.groupName}
            </Text>
          </Box>

          {/* ── Fields in this group ──────────────────────────────── */}
          {(group.specFields ?? []).map(f => (
            <Stack space={2} key={f.key}>
              <Label size={1}>{f.label}</Label>

              {f.fieldType === 'yes_no' ? (
                values[f.key] === 'yes' ? (
                  <Card padding={3} radius={2} tone="positive" border>
                    <Flex align="center" justify="space-between" gap={3}>
                      <Flex align="center" gap={2}>
                        <Text size={2}>✅</Text>
                        <Text size={1} weight="semibold">Yes</Text>
                      </Flex>
                      <Button
                        text="Reset to No"
                        mode="ghost"
                        tone="default"
                        fontSize={1}
                        padding={2}
                        onClick={() => handleChange(f.key, 'no')}
                      />
                    </Flex>
                  </Card>
                ) : (
                  <Card padding={3} radius={2} tone="default" border>
                    <Flex align="center" justify="space-between" gap={3}>
                      <Flex align="center" gap={2}>
                        <Text size={2}>⬜</Text>
                        <Text size={1} muted>No</Text>
                      </Flex>
                      <Button
                        text="✓ Mark as Yes"
                        tone="positive"
                        fontSize={1}
                        padding={2}
                        onClick={() => handleChange(f.key, 'yes')}
                      />
                    </Flex>
                  </Card>
                )
              ) : f.fieldType === 'text' ? (
                <textarea
                  rows={3}
                  value={values[f.key] ?? ''}
                  onChange={e => handleChange(f.key, e.target.value)}
                  placeholder={f.label}
                  style={{
                    width:        '100%',
                    padding:      '8px 12px',
                    border:       '1px solid var(--card-border-color)',
                    borderRadius: 4,
                    fontFamily:   'inherit',
                    fontSize:     14,
                    resize:       'vertical',
                    background:   'var(--card-bg-color)',
                    color:        'var(--card-fg-color)',
                    boxSizing:    'border-box',
                  }}
                />
              ) : (
                <TextInput
                  inputMode={f.fieldType === 'number' ? 'decimal' : undefined}
                  value={values[f.key] ?? ''}
                  onChange={e => handleChange(f.key, (e.target as HTMLInputElement).value)}
                  placeholder={f.fieldType === 'number' ? '0' : f.label}
                />
              )}
            </Stack>
          ))}
        </Stack>
      ))}
    </Stack>
  )
}
