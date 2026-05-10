import { useState, useCallback } from 'react'
import { Stack, TextArea, Button, Flex, Spinner, Text, Card } from '@sanity/ui'
import { set, unset, useClient } from 'sanity'
import type { StringInputProps, TextInputProps } from 'sanity'
import { useFormValue } from 'sanity'

/**
 * Custom text input for Address (EN) in Contract.
 * Shows a "Retrieve from Project Site" button that fetches the address
 * from the linked projectSite reference.
 */
export function RetrieveFromProjectSiteInput(props: StringInputProps | TextInputProps) {
  const [loading,    setLoading]    = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [error,      setError]      = useState('')

  const client        = useClient({ apiVersion: '2024-01-01' })
  const projectSiteRef = useFormValue(['projectSite', '_ref']) as string | undefined

  const handleChange = useCallback((value: string) => {
    props.onChange(value ? set(value) : unset())
  }, [props])

  const handleRetrieve = useCallback(async () => {
    if (!projectSiteRef) return
    setLoading(true)
    setError('')
    setSuggestion(null)
    try {
      const result = await client.fetch<{ address?: string }>(
        `*[_id == $id][0]{ address }`,
        { id: projectSiteRef },
      )
      const address = result?.address?.trim()
      if (!address) {
        setError('No address found on the linked Project Site.')
      } else {
        setSuggestion(address)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to retrieve address')
    } finally {
      setLoading(false)
    }
  }, [projectSiteRef, client])

  const applySuggestion = useCallback(() => {
    if (suggestion != null) {
      handleChange(suggestion)
      setSuggestion(null)
    }
  }, [suggestion, handleChange])

  const canRetrieve = !!projectSiteRef

  return (
    <Stack space={2}>
      <TextArea
        value={props.value ?? ''}
        onChange={e => handleChange((e.target as HTMLTextAreaElement).value)}
        rows={2}
      />

      {suggestion != null && (
        <Card padding={3} radius={2} tone="positive" border>
          <Stack space={2}>
            <Text size={0} muted weight="semibold">From Project Site:</Text>
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
            text="↙ Retrieve from Project Site"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!canRetrieve}
            title={canRetrieve ? 'Copy address from the linked Project Site' : 'Select a Project Site first'}
            onClick={handleRetrieve}
          />
        )}
        {!canRetrieve && !loading && (
          <Text size={0} muted>Select a Project Site first</Text>
        )}
      </Flex>

      {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
    </Stack>
  )
}
