/**
 * ProviderNameInput
 *
 * Combined input for Provider name_th / name_en fields.
 * Adds:
 *   - ↙ Retrieve from linked Party (legalName_th or legalName_en)
 *   - ✨ AI translate button (Thai ↔ English)
 */

import { useState, useCallback } from 'react'
import { Stack, TextInput, Button, Flex, Spinner, Text, Card } from '@sanity/ui'
import { set, unset, useClient } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

export function createProviderNameInput(lang: 'th' | 'en') {
  const isTh          = lang === 'th'
  const partyField    = isTh ? 'legalName_th' : 'legalName_en'
  const sourceField   = isTh ? 'name_en' : 'name_th'
  const sourceLang    = isTh ? 'English' : 'Thai'
  const targetLang    = isTh ? 'Thai'    : 'English'
  const translateLabel = `✨ Translate from ${sourceLang}`

  function ProviderNameInput(props: StringInputProps) {
    const client   = useClient({ apiVersion: '2024-01-01' })
    const partyRef = useFormValue(['party', '_ref']) as string | undefined
    const sourceValue = useFormValue([sourceField]) as string | undefined

    const [retrieving,  setRetrieving]  = useState(false)
    const [suggestion,  setSuggestion]  = useState<string | null>(null)
    const [retrieveErr, setRetrieveErr] = useState('')
    const [translating, setTranslating] = useState(false)
    const [translateErr, setTranslateErr] = useState('')

    const handleChange = useCallback((value: string) => {
      props.onChange(value ? set(value) : unset())
    }, [props])

    // ── Retrieve from Party ──────────────────────────────────────────────────
    const handleRetrieve = useCallback(async () => {
      if (!partyRef) return
      setRetrieving(true)
      setRetrieveErr('')
      setSuggestion(null)
      try {
        const result = await client.fetch<{ value?: string }>(
          `*[_id == $id][0]{ "value": coalesce(${partyField}, legalName) }`,
          { id: partyRef },
        )
        const value = result?.value?.trim()
        if (!value) {
          setRetrieveErr('No name found on the linked Party.')
        } else {
          setSuggestion(value)
        }
      } catch (err: any) {
        setRetrieveErr(err?.message ?? 'Failed to retrieve')
      } finally {
        setRetrieving(false)
      }
    }, [partyRef, client])

    const applySuggestion = useCallback(() => {
      if (suggestion != null) {
        handleChange(suggestion)
        setSuggestion(null)
      }
    }, [suggestion, handleChange])

    // ── Translate ────────────────────────────────────────────────────────────
    const handleTranslate = useCallback(async () => {
      if (!sourceValue?.trim()) return
      setTranslating(true)
      setTranslateErr('')
      try {
        const res  = await fetch(TRANSLATE_API_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ text: sourceValue, sourceLang, targetLang }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
        props.onChange(set(data.translated))
      } catch (err: any) {
        setTranslateErr(err?.message ?? 'Translation failed')
      } finally {
        setTranslating(false)
      }
    }, [sourceValue, props])

    return (
      <Stack space={2}>
        <TextInput
          value={props.value ?? ''}
          readOnly={props.readOnly}
          onChange={e => handleChange((e.target as HTMLInputElement).value)}
        />

        {/* Suggestion card */}
        {suggestion != null && (
          <Card padding={3} radius={2} tone="positive" border>
            <Stack space={2}>
              <Text size={0} muted weight="semibold">From Party:</Text>
              <Text size={1}>{suggestion}</Text>
              <Flex gap={2}>
                <Button text="Apply"   tone="positive" fontSize={1} padding={2} onClick={applySuggestion} />
                <Button text="Dismiss" mode="ghost"    fontSize={1} padding={2} onClick={() => setSuggestion(null)} />
              </Flex>
            </Stack>
          </Card>
        )}

        {/* Action buttons */}
        <Flex gap={2} wrap="wrap">
          {/* Retrieve from Party */}
          {retrieving ? (
            <Flex align="center" gap={1}><Spinner muted /><Text size={1} muted>Retrieving…</Text></Flex>
          ) : (
            <Button
              text="↙ from Party"
              mode="ghost"
              tone="primary"
              fontSize={1}
              padding={2}
              disabled={!partyRef}
              title={partyRef ? 'Copy name from linked Party' : 'Link a Party first'}
              onClick={handleRetrieve}
            />
          )}

          {/* Translate */}
          {translating ? (
            <Flex align="center" gap={1}><Spinner muted /><Text size={1} muted>Translating…</Text></Flex>
          ) : (
            <Button
              text={translateLabel}
              mode="ghost"
              tone="primary"
              fontSize={1}
              padding={2}
              disabled={!sourceValue?.trim()}
              title={sourceValue?.trim() ? translateLabel : `Fill in the ${sourceLang} name first`}
              onClick={handleTranslate}
            />
          )}
        </Flex>

        {!partyRef && <Text size={0} muted>Link a Party above to enable ↙ retrieve.</Text>}
        {retrieveErr  && <Text size={0} style={{ color: '#e05252' }}>{retrieveErr}</Text>}
        {translateErr && <Text size={0} style={{ color: '#e05252' }}>{translateErr}</Text>}
      </Stack>
    )
  }

  ProviderNameInput.displayName = `ProviderNameInput(${lang})`
  return ProviderNameInput
}
