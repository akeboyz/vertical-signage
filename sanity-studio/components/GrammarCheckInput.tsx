/**
 * GrammarCheckInput
 *
 * A text/string input with an "✨ Grammar" button that calls Claude
 * to review English grammar and clarity. Shows a diff-style suggestion
 * card with Apply / Dismiss options.
 */

import { useState, useCallback } from 'react'
import { Stack, TextArea, TextInput, Button, Flex, Spinner, Text, Card, Badge } from '@sanity/ui'
import { set, unset } from 'sanity'
import type { StringInputProps } from 'sanity'

const API_BASE =
  process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

interface Props extends StringInputProps {
  multiline?: boolean
  rows?:      number
}

export function GrammarCheckInput({ multiline = true, rows = 3, ...props }: Props) {
  const [loading,    setLoading]    = useState(false)
  const [corrected,  setCorrected]  = useState<string | null>(null)
  const [notes,      setNotes]      = useState<string>('')
  const [changed,    setChanged]    = useState(false)
  const [error,      setError]      = useState('')

  const currentValue = (props.value as string | undefined) ?? ''

  const handleChange = useCallback((value: string) => {
    props.onChange(value ? set(value) : unset())
  }, [props])

  const handleCheck = useCallback(async () => {
    if (!currentValue.trim()) return
    setLoading(true)
    setError('')
    setCorrected(null)
    setNotes('')

    try {
      const res  = await fetch(`${API_BASE}/api/grammar-check`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: currentValue }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setCorrected(data.corrected ?? currentValue)
      setNotes(data.notes ?? '')
      setChanged(!!data.changed)
    } catch (err: any) {
      setError(err?.message ?? 'Grammar check failed')
    } finally {
      setLoading(false)
    }
  }, [currentValue])

  const applyCorrection = useCallback(() => {
    if (corrected != null) {
      handleChange(corrected)
      setCorrected(null)
      setNotes('')
    }
  }, [corrected, handleChange])

  return (
    <Stack space={2}>
      {multiline ? (
        <TextArea
          value={currentValue}
          onChange={e => handleChange((e.target as HTMLTextAreaElement).value)}
          rows={rows}
        />
      ) : (
        <TextInput
          value={currentValue}
          onChange={e => handleChange((e.target as HTMLInputElement).value)}
        />
      )}

      {/* Suggestion card */}
      {corrected != null && (
        <Card padding={3} radius={2} border tone={changed ? 'positive' : 'transparent'}>
          <Stack space={3}>
            <Flex align="center" gap={2}>
              <Badge tone={changed ? 'positive' : 'default'} fontSize={0} mode="outline">
                {changed ? '✏️ Suggested' : '✅ Looks good'}
              </Badge>
              {notes && <Text size={1} muted>{notes}</Text>}
            </Flex>
            {changed && (
              <Card padding={2} radius={2} tone="primary">
                <Text size={1}>{corrected}</Text>
              </Card>
            )}
            <Flex gap={2}>
              {changed && (
                <Button
                  text="Apply"
                  tone="positive"
                  fontSize={1}
                  padding={2}
                  onClick={applyCorrection}
                />
              )}
              <Button
                text="Dismiss"
                mode="ghost"
                fontSize={1}
                padding={2}
                onClick={() => { setCorrected(null); setNotes('') }}
              />
            </Flex>
          </Stack>
        </Card>
      )}

      {/* Button row */}
      <Flex align="center" gap={2}>
        {loading ? (
          <>
            <Spinner muted />
            <Text size={1} muted>Checking grammar…</Text>
          </>
        ) : (
          <Button
            text="✨ Grammar"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!currentValue.trim()}
            title={currentValue.trim() ? 'Check English grammar with AI' : 'Enter text first'}
            onClick={handleCheck}
          />
        )}
      </Flex>

      {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
    </Stack>
  )
}
