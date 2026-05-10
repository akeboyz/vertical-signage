import { useState, useEffect }   from 'react'
import { Stack, Text, Card, Spinner, Flex } from '@sanity/ui'
import { set, unset }             from 'sanity'
import type { StringInputProps }  from 'sanity'
import { useClient }              from 'sanity'

interface ServiceTypeDef {
  key:  string
  name: string
}

export function ServiceTypeSelect(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [serviceTypes, setServiceTypes] = useState<ServiceTypeDef[]>([])
  const [loading,      setLoading]      = useState(true)

  useEffect(() => {
    client
      .fetch<{ serviceTypes?: ServiceTypeDef[] }[]>(
        `*[_type == "contractType" && useForServiceContract == true && isActive == true]{
          serviceTypes[]{ key, name }
        }`,
      )
      .then(results => {
        const all = results.flatMap(r => r.serviceTypes ?? [])
        setServiceTypes(all)
      })
      .catch(() => setServiceTypes([]))
      .finally(() => setLoading(false))
  }, [client])

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading service types…</Text>
      </Flex>
    )
  }

  if (serviceTypes.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>No service types found. Go to Process Setup → Service Config → add service types.</Text>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      <select
        value={props.value ?? ''}
        data-testid="sc-service-type-select"
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
        <option value="">— Select Service Type —</option>
        {serviceTypes.map(t => (
          <option key={t.key} value={t.key}>{t.name}</option>
        ))}
      </select>
    </Stack>
  )
}
