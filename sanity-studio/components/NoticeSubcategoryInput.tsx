import { useCallback, useEffect, useState } from 'react'
import { set, unset, useClient }            from 'sanity'
import type { ArrayOfPrimitivesInputProps } from 'sanity'
import { Stack, Flex, Checkbox, Text, Card, Box, Spinner } from '@sanity/ui'

interface Subcat {
  id:    string
  label: { en?: string; th?: string }
}

export function NoticeSubcategoryInput(props: ArrayOfPrimitivesInputProps) {
  const { value = [], onChange } = props
  const current = value as string[]
  const client  = useClient({ apiVersion: '2024-01-01' })

  const [options,  setOptions]  = useState<Subcat[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    client
      .fetch<{ subcategories?: Subcat[] }>(
        `*[_type == "categoryConfig"][0]{
          "subcategories": categories[id == "buildingUpdates"][0].subcategories
        }`
      )
      .then(r => setOptions(r?.subcategories ?? []))
      .catch(() => setOptions([]))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(
    (optValue: string, checked: boolean) => {
      const next = checked
        ? [...current, optValue]
        : current.filter(v => v !== optValue)
      onChange(next.length > 0 ? set(next) : unset())
    },
    [current, onChange],
  )

  if (loading) {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading subcategories…</Text>
      </Flex>
    )
  }

  if (options.length === 0) {
    return (
      <Card padding={3} tone="caution" border radius={2}>
        <Text size={1} muted>
          No subcategories found. Add them to Category Config → Building Updates.
        </Text>
      </Card>
    )
  }

  return (
    <Card padding={3} border radius={2}>
      <Stack space={3}>
        {options.map(opt => (
          <Flex key={opt.id} align="center" gap={3}>
            <Checkbox
              id={`notice-subcat-${opt.id}`}
              checked={current.includes(opt.id)}
              onChange={e => toggle(opt.id, e.currentTarget.checked)}
            />
            <Box>
              <Text
                as="label"
                size={1}
                weight="medium"
                htmlFor={`notice-subcat-${opt.id}`}
                style={{ cursor: 'pointer' }}
              >
                {opt.label?.en ?? opt.label?.th ?? opt.id}
              </Text>
            </Box>
          </Flex>
        ))}
      </Stack>
    </Card>
  )
}
