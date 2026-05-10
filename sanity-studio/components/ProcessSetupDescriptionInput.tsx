/**
 * ProcessSetupDescriptionInput
 *
 * Wraps the default reference input for contractType fields.
 * When a Process Setup is selected, shows its description as a
 * read guidance banner below the reference picker.
 */

import { useEffect, useState } from 'react'
import { useClient, useFormValue } from 'sanity'
import type { ReferenceInputProps } from 'sanity'
import { Card, Text, Stack, Badge, Flex } from '@sanity/ui'

export function ProcessSetupDescriptionInput(props: ReferenceInputProps) {
  const client     = useClient({ apiVersion: '2024-01-01' })
  const currentRef = (props.value as any)?._ref as string | undefined

  const [description, setDescription] = useState<string | null>(null)
  const [setupName,   setSetupName]   = useState<string | null>(null)

  useEffect(() => {
    if (!currentRef) { setDescription(null); setSetupName(null); return }
    client
      .fetch<{ name?: string; description?: string } | null>(
        `*[_id == $id || _id == "drafts." + $id][0]{ name, description }`,
        { id: currentRef },
      )
      .then(ct => {
        setSetupName(ct?.name ?? null)
        setDescription(ct?.description ?? null)
      })
      .catch(() => {})
  }, [currentRef]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack space={2}>
      {props.renderDefault(props)}
      {description && (
        <Card padding={3} radius={2} tone="primary" border>
          <Flex align="center" gap={2} style={{ marginBottom: 4 }}>
            <Badge tone="primary" fontSize={0} mode="outline">Process Setup</Badge>
            {setupName && <Text size={1} weight="semibold">{setupName}</Text>}
          </Flex>
          <Text size={1} muted style={{ fontStyle: 'italic' }}>{description}</Text>
        </Card>
      )}
    </Stack>
  )
}
