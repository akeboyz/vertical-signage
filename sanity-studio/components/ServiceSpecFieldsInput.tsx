import { useState, useEffect, useCallback } from 'react'
import { Stack, Text, TextInput, Card, Spinner, Flex, Label, Button, Box } from '@sanity/ui'
import { set, unset }              from 'sanity'
import type { StringInputProps }   from 'sanity'
import { useClient, useFormValue } from 'sanity'

interface ServiceFieldDef {
  key:       string
  label:     string
  fieldType: 'string' | 'number' | 'date' | 'text' | 'yes_no'
}

interface FieldGroupDef {
  groupName: string
  fields:    ServiceFieldDef[]
}

interface ServiceTypeDef {
  key:          string
  name:         string
  fieldGroups?: FieldGroupDef[]
}

export function ServiceSpecFieldsInput(props: StringInputProps) {
  const client      = useClient({ apiVersion: '2024-01-01' })
  const serviceType = useFormValue(['serviceType']) as string | undefined

  const [fieldGroups, setFieldGroups] = useState<FieldGroupDef[]>([])
  const [loading,     setLoading]     = useState(false)
  const [values,      setValues]      = useState<Record<string, string>>({})

  // Parse stored JSON on mount
  useEffect(() => {
    try {
      const raw = props.value as string | undefined
      setValues(raw ? JSON.parse(raw) : {})
    } catch {
      setValues({})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch field groups whenever serviceType changes
  useEffect(() => {
    if (!serviceType) { setFieldGroups([]); return }
    setLoading(true)
    client
      .fetch<{ serviceTypes?: ServiceTypeDef[] }[]>(
        `*[_type == "contractType" && useForServiceContract == true && isActive == true]{
          serviceTypes[]{ key, name, fieldGroups[]{ groupName, fields[]{ key, label, fieldType } } }
        }`,
      )
      .then(results => {
        const allTypes = results.flatMap(r => r.serviceTypes ?? [])
        const found    = allTypes.find(t => t.key === serviceType)
        setFieldGroups(found?.fieldGroups ?? [])
      })
      .catch(() => setFieldGroups([]))
      .finally(() => setLoading(false))
  }, [serviceType, client])

  const handleChange = useCallback((key: string, value: string) => {
    setValues(prev => {
      const next = { ...prev, [key]: value }
      const json = JSON.stringify(next)
      props.onChange(json === '{}' ? unset() : set(json))
      return next
    })
  }, [props])

  if (!serviceType) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>Select a Service Type above to see fields.</Text>
      </Card>
    )
  }

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading service fields…</Text>
      </Flex>
    )
  }

  if (fieldGroups.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>No fields defined for this service type. Go to Process Setup → Service Config → edit the service type to add field groups.</Text>
      </Card>
    )
  }

  return (
    <Stack space={6}>
      {fieldGroups.map(group => (
        <Stack space={4} key={group.groupName}>

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

          {(group.fields ?? []).map(f => (
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
              ) : f.fieldType === 'date' ? (
                <input
                  type="date"
                  value={values[f.key] ?? ''}
                  onChange={e => handleChange(f.key, e.target.value)}
                  style={{
                    padding: '6px 12px', border: '1px solid var(--card-border-color)',
                    borderRadius: 4, fontFamily: 'inherit', fontSize: 14,
                    background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
                  }}
                />
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
