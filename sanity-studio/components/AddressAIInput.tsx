import { useState, useCallback } from 'react'
import { Stack, TextArea, Button, Flex, Spinner, Text, Card } from '@sanity/ui'
import { set, unset, useClient } from 'sanity'
import type { TextInputProps } from 'sanity'
import { useFormValue } from 'sanity'

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

/**
 * Custom text input for Party address.
 *
 * Two AI buttons:
 *  ✨ Find from Name   — reads legalName_th + legalName_en, asks Claude to find the address
 *  ✨ Format Address   — takes current field value, asks Claude to clean/complete it
 *
 * Both show a suggestion card (Apply / Dismiss) — never auto-apply.
 */
export function AddressAIInput(props: TextInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [loading,    setLoading]    = useState<'find' | 'format' | 'site' | null>(null)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [error,      setError]      = useState('')

  const legalNameTh   = useFormValue(['legalName_th']) as string | undefined
  const legalNameEn   = useFormValue(['legalName_en']) as string | undefined
  const projectSites   = useFormValue(['projectSites']) as { _ref: string }[] | undefined
  const projectSiteRef = projectSites?.[0]?._ref
  const currentValue  = props.value as string | undefined

  const hasName    = !!(legalNameTh?.trim() || legalNameEn?.trim())
  const hasAddress = !!currentValue?.trim()
  const hasSite    = !!projectSiteRef

  const handleChange = useCallback((value: string) => {
    props.onChange(value ? set(value) : unset())
  }, [props])

  const callAI = useCallback(async (instruction: string, text: string, mode: 'find' | 'format') => {
    setLoading(mode)
    setError('')
    setSuggestion(null)
    try {
      const res  = await fetch(TRANSLATE_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text, instruction }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const result = data.translated?.trim()
      if (!result) throw new Error('No result returned.')
      setSuggestion(result)
    } catch (err: any) {
      setError(err?.message ?? 'AI request failed')
    } finally {
      setLoading(null)
    }
  }, [])

  const handleCopyFromSite = useCallback(async () => {
    if (!projectSiteRef) return
    setLoading('site')
    setError('')
    setSuggestion(null)
    try {
      const site = await client.fetch<{ address?: string }>(
        `*[_id == $id][0]{ address }`,
        { id: projectSiteRef },
      )
      const addr = site?.address?.trim()
      if (!addr) throw new Error('Project site has no address filled in yet.')
      setSuggestion(addr)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load project site address')
    } finally {
      setLoading(null)
    }
  }, [client, projectSiteRef])

  const handleFindFromName = useCallback(() => {
    const thPart = legalNameTh?.trim() ? `Thai name: ${legalNameTh.trim()}` : ''
    const enPart = legalNameEn?.trim() ? `English name: ${legalNameEn.trim()}` : ''
    const nameContext = [thPart, enPart].filter(Boolean).join('\n')

    const instruction =
      `You are helping find a contact address for a Thai condominium juristic person or company.\n\n` +
      `${nameContext}\n\n` +
      `Return only the most likely contact address in Thai (street, subdistrict, district, province, postcode). ` +
      `If you are not confident, say so clearly rather than guessing. Do not add any explanation.`

    callAI(instruction, nameContext, 'find')
  }, [legalNameTh, legalNameEn, callAI])

  const handleFormatAddress = useCallback(() => {
    const instruction =
      `You are a Thai address formatting assistant. ` +
      `Take the partial or unformatted address below and return a clean, complete Thai address ` +
      `(street/building, subdistrict/แขวง, district/เขต, province/จังหวัด, postcode). ` +
      `Return only the formatted address — no explanation, no extra words.`

    callAI(instruction, currentValue ?? '', 'format')
  }, [currentValue, callAI])

  const applySuggestion = useCallback(() => {
    if (suggestion != null) {
      handleChange(suggestion)
      setSuggestion(null)
    }
  }, [suggestion, handleChange])

  const isLoading = loading !== null

  return (
    <Stack space={2}>
      <TextArea
        value={props.value ?? ''}
        onChange={e => handleChange((e.target as HTMLTextAreaElement).value)}
        rows={3}
      />

      {suggestion != null && (
        <Card padding={3} radius={2} tone="positive" border>
          <Stack space={2}>
            <Text size={0} muted weight="semibold">AI Suggestion — please verify before applying:</Text>
            <Text size={1} style={{ whiteSpace: 'pre-wrap' }}>{suggestion}</Text>
            <Flex gap={2}>
              <Button text="Apply" tone="positive" fontSize={1} padding={2} onClick={applySuggestion} />
              <Button text="Dismiss" mode="ghost" fontSize={1} padding={2} onClick={() => setSuggestion(null)} />
            </Flex>
          </Stack>
        </Card>
      )}

      <Flex gap={2} wrap="wrap" align="center">
        {loading === 'site' ? (
          <Flex gap={2} align="center">
            <Spinner muted />
            <Text size={1} muted>Loading from project site…</Text>
          </Flex>
        ) : (
          <Button
            text="📋 Copy from Project Site"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!hasSite || loading !== null}
            title={hasSite
              ? (projectSites && projectSites.length > 1 ? 'Copies address from the first linked Project Site' : 'Copy address from the linked Project Site')
              : 'Link a Project Site first to use this button'
            }
            onClick={handleCopyFromSite}
          />
        )}

        {loading === 'find' ? (
          <Flex gap={2} align="center">
            <Spinner muted />
            <Text size={1} muted>Searching…</Text>
          </Flex>
        ) : (
          <Button
            text="✨ Find from Name"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!hasName || isLoading}
            title={hasName ? 'Ask AI to find address from legal name' : 'Fill in Legal Name (Thai or English) first'}
            onClick={handleFindFromName}
          />
        )}

        {loading === 'format' ? (
          <Flex gap={2} align="center">
            <Spinner muted />
            <Text size={1} muted>Formatting…</Text>
          </Flex>
        ) : (
          <Button
            text="✨ Format Address"
            mode="ghost"
            tone="primary"
            fontSize={1}
            padding={2}
            disabled={!hasAddress || isLoading}
            title={hasAddress ? 'Ask AI to format and complete this address' : 'Type a partial address first'}
            onClick={handleFormatAddress}
          />
        )}
      </Flex>

      {!hasName && !isLoading && (
        <Text size={0} muted>Fill in Legal Name (Thai or English) to enable "Find from Name"</Text>
      )}

      {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
    </Stack>
  )
}
