import { useState, useCallback } from 'react'
import { Stack, TextInput, Button, Flex, Spinner, Text, Card } from '@sanity/ui'
import { set, unset, useClient } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

type FieldKey = 'phone' | 'lineId' | 'website'

const FIELD_LABEL: Record<FieldKey, string> = {
  phone:  'Phone',
  lineId: 'LINE ID',
  website: 'Website',
}

/** GROQ projection for each field key */
const GROQ_PROJECTION: Record<FieldKey, string> = {
  phone:   '{ "value": coalesce(phone, phones[0].number) }',
  lineId:  '{ "value": lineId }',
  website: '{ "value": website }',
}

/**
 * Factory — returns a custom StringInput component that adds a
 * "← from Party" retrieve button beneath the standard text input.
 *
 * Usage in schema:
 *   components: { input: createRetrieveFromPartyInput('phone') }
 */
export function createRetrieveFromPartyInput(fieldKey: FieldKey) {
  const label = FIELD_LABEL[fieldKey]
  const projection = GROQ_PROJECTION[fieldKey]

  function RetrieveFromPartyInput(props: StringInputProps) {
    const [loading,    setLoading]    = useState(false)
    const [suggestion, setSuggestion] = useState<string | null>(null)
    const [error,      setError]      = useState('')

    const client   = useClient({ apiVersion: '2024-01-01' })
    const partyRef = useFormValue(['party', '_ref']) as string | undefined

    const handleChange = useCallback((value: string) => {
      props.onChange(value ? set(value) : unset())
    }, [props])

    const handleRetrieve = useCallback(async () => {
      if (!partyRef) return
      setLoading(true)
      setError('')
      setSuggestion(null)
      try {
        const result = await client.fetch<{ value?: string }>(
          `*[_id == $id][0]${projection}`,
          { id: partyRef },
        )
        const value = result?.value?.trim()
        if (!value) {
          setError(`No ${label} found on the linked Party.`)
        } else {
          setSuggestion(value)
        }
      } catch (err: any) {
        setError(err?.message ?? `Failed to retrieve ${label}`)
      } finally {
        setLoading(false)
      }
    }, [partyRef, client])

    const applySuggestion = useCallback(() => {
      if (suggestion != null) {
        handleChange(suggestion)
        setSuggestion(null)
      }
    }, [suggestion, handleChange])

    const canRetrieve = !!partyRef

    return (
      <Stack space={2}>
        <TextInput
          value={props.value ?? ''}
          onChange={e => handleChange((e.target as HTMLInputElement).value)}
        />

        {suggestion != null && (
          <Card padding={3} radius={2} tone="positive" border>
            <Stack space={2}>
              <Text size={0} muted weight="semibold">From Party:</Text>
              <Text size={1}>{suggestion}</Text>
              <Flex gap={2}>
                <Button text="Apply" tone="positive" fontSize={1} padding={2} onClick={applySuggestion} />
                <Button text="Dismiss" mode="ghost" fontSize={1} padding={2} onClick={() => setSuggestion(null)} />
              </Flex>
            </Stack>
          </Card>
        )}

        <Flex align="center" gap={2}>
          {loading ? (
            <>
              <Spinner muted />
              <Text size={1} muted>Retrieving…</Text>
            </>
          ) : (
            <Button
              text={`↙ from Party`}
              mode="ghost"
              tone="primary"
              fontSize={1}
              padding={2}
              disabled={!canRetrieve}
              title={canRetrieve ? `Copy ${label} from the linked Party` : 'Link a Party first'}
              onClick={handleRetrieve}
            />
          )}
          {!canRetrieve && !loading && (
            <Text size={0} muted>Link a Party first</Text>
          )}
        </Flex>

        {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
      </Stack>
    )
  }

  RetrieveFromPartyInput.displayName = `RetrieveFromPartyInput(${fieldKey})`
  return RetrieveFromPartyInput
}
