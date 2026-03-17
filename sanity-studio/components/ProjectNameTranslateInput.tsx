import { useState, useCallback } from 'react'
import { Stack, TextInput, Button, Flex, Spinner, Text } from '@sanity/ui'
import { set, unset } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

/**
 * Custom input for Project Name (TH).
 * Shows a translate button that calls the translate API with EN→TH direction.
 */
export function ProjectNameTranslateInput(props: StringInputProps) {
  const [translating, setTranslating] = useState(false)
  const [error,       setError]       = useState('')

  const projectEn = useFormValue(['projectEn']) as string | undefined

  const handleChange = useCallback((value: string) => {
    props.onChange(value ? set(value) : unset())
  }, [props])

  const handleTranslate = useCallback(async () => {
    if (!projectEn?.trim()) return
    setTranslating(true)
    setError('')
    try {
      const res  = await fetch(TRANSLATE_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text:        projectEn,
          instruction: 'Transliterate the following English condominium or property project name into Thai script using phonetic transliteration — preserve the brand name sound, do NOT translate the meaning of individual words. Return only the Thai transliteration, no explanation, no quotes. Example: "Noble Remix" → "โนเบิล รีมิกซ์", "The Residences" → "เดอะ เรสซิเดนเซส".',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      handleChange(data.translated)
    } catch (err: any) {
      setError(err?.message ?? 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }, [projectEn, handleChange])

  const canTranslate = !!projectEn?.trim()

  return (
    <Stack space={2}>
      <TextInput
        value={props.value ?? ''}
        onChange={e => handleChange((e.target as HTMLInputElement).value)}
        placeholder="ชื่อโครงการ (ภาษาไทย)"
      />
      <Flex align="center" gap={2}>
        {translating ? (
          <>
            <Spinner muted />
            <Text size={1} muted>Translating…</Text>
          </>
        ) : (
          <Button
            text="✨ Translate from Project Name (EN)"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!canTranslate}
            title={canTranslate
              ? 'Auto-translate from the English project name'
              : 'Fill in Project Name (EN) first'}
            onClick={handleTranslate}
          />
        )}
        {!canTranslate && !translating && (
          <Text size={0} muted>Fill in Project Name (EN) first</Text>
        )}
      </Flex>
      {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
    </Stack>
  )
}
