import { useState, useCallback } from 'react'
import { Stack, TextInput, TextArea, Button, Flex, Spinner, Text, Card } from '@sanity/ui'
import { set, unset } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

const LOOKUP_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/lookup-project'

interface Props extends StringInputProps {
  fieldKey: string          // key in the lookup response (e.g. "address", "developer")
  multiline?: boolean       // render as TextArea instead of TextInput
  rows?: number
}

/**
 * Custom string/text input with an "✨ AI" button.
 * Calls /api/lookup-project with the project's EN name and fills this field.
 */
export function AILookupInput({ fieldKey, multiline, rows = 2, ...props }: Props) {
  const [loading,    setLoading]    = useState(false)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [error,      setError]      = useState('')

  const projectEn = useFormValue(['projectEn']) as string | undefined

  const handleChange = useCallback((value: string) => {
    props.onChange(value ? set(value) : unset())
  }, [props])

  const handleLookup = useCallback(async () => {
    if (!projectEn?.trim()) return
    setLoading(true)
    setError('')
    setSuggestion(null)
    try {
      const res  = await fetch(LOOKUP_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ projectName: projectEn }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const value = data[fieldKey]
      if (value == null || value === '') {
        setError('No information found for this field.')
      } else {
        setSuggestion(String(value))
      }
    } catch (err: any) {
      setError(err?.message ?? 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }, [projectEn, fieldKey])

  const applysuggestion = useCallback(() => {
    if (suggestion != null) {
      handleChange(suggestion)
      setSuggestion(null)
    }
  }, [suggestion, handleChange])

  const canLookup = !!projectEn?.trim()

  return (
    <Stack space={2}>
      {multiline ? (
        <TextArea
          value={props.value ?? ''}
          onChange={e => handleChange((e.target as HTMLTextAreaElement).value)}
          rows={rows}
        />
      ) : (
        <TextInput
          value={props.value ?? ''}
          onChange={e => handleChange((e.target as HTMLInputElement).value)}
        />
      )}

      {suggestion != null && (
        <Card padding={3} radius={2} tone="positive" border>
          <Stack space={2}>
            <Text size={0} muted weight="semibold">AI suggestion:</Text>
            <Text size={1}>{suggestion}</Text>
            <Flex gap={2}>
              <Button
                text="Apply"
                tone="positive"
                fontSize={1}
                padding={2}
                onClick={applysuggestion}
              />
              <Button
                text="Dismiss"
                mode="ghost"
                fontSize={1}
                padding={2}
                onClick={() => setSuggestion(null)}
              />
            </Flex>
          </Stack>
        </Card>
      )}

      <Flex align="center" gap={2}>
        {loading ? (
          <>
            <Spinner muted />
            <Text size={1} muted>Looking up…</Text>
          </>
        ) : (
          <Button
            text="✨ AI"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!canLookup}
            title={canLookup
              ? `Auto-fill from "${projectEn}"`
              : 'Fill in Project Name (EN) first'}
            onClick={handleLookup}
          />
        )}
        {!canLookup && !loading && (
          <Text size={0} muted>Fill in Project Name (EN) first</Text>
        )}
      </Flex>

      {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
    </Stack>
  )
}
