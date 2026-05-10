/**
 * ProcessSetupDescriptionBanner
 *
 * Standalone display-only field placed at the TOP of a schema's edit form.
 * Reads the linked contractType's description and shows it as a guidance
 * banner so users can read it before filling in any fields.
 *
 * Usage: add as the first field in the schema (no group, hidden when no description).
 */

import { useEffect, useState, useCallback } from 'react'
import { useClient, useFormValue } from 'sanity'
import type { StringInputProps } from 'sanity'
import { Card, Text, Stack, Badge, Flex, Button, Spinner } from '@sanity/ui'

const API_BASE =
  process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

export function ProcessSetupDescriptionBanner(props: StringInputProps) {
  const client       = useClient({ apiVersion: '2024-01-01' })
  const contractType = useFormValue(['contractType']) as { _ref?: string } | undefined
  const currentRef   = contractType?._ref

  const [description,  setDescription]  = useState<string | null>(null)
  const [setupName,    setSetupName]    = useState<string | null>(null)
  const [translation,  setTranslation]  = useState<string | null>(null)
  const [translating,  setTranslating]  = useState(false)
  const [transError,   setTransError]   = useState('')

  useEffect(() => {
    setTranslation(null)
    setTransError('')
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

  const handleTranslate = useCallback(async () => {
    if (!description) return
    setTranslating(true)
    setTransError('')
    try {
      const res  = await fetch(`${API_BASE}/api/translate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: description, sourceLang: 'English', targetLang: 'Thai' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setTranslation(data.translated ?? null)
    } catch (err: any) {
      setTransError(err?.message ?? 'Translation failed')
    } finally {
      setTranslating(false)
    }
  }, [description])

  if (!description) return null

  return (
    <Card padding={4} radius={2} tone="primary" border>
      <Stack space={3}>

        {/* Header */}
        <Flex align="center" gap={2}>
          <Badge tone="primary" fontSize={0} mode="outline">Process Setup</Badge>
          {setupName && <Text size={1} weight="semibold">{setupName}</Text>}
        </Flex>

        {/* English description */}
        <Text size={2} style={{ fontStyle: 'italic' }}>{description}</Text>

        {/* Thai translation */}
        {translation && (
          <Card padding={3} radius={2} tone="transparent" border>
            <Stack space={2}>
              <Badge tone="default" fontSize={0} mode="outline">🇹🇭 ภาษาไทย</Badge>
              <Text size={2} style={{ fontFamily: 'inherit' }}>{translation}</Text>
            </Stack>
          </Card>
        )}

        {transError && <Text size={0} style={{ color: '#e05252' }}>{transError}</Text>}

        {/* Translate button */}
        <Flex align="center" gap={2}>
          {translating ? (
            <>
              <Spinner muted />
              <Text size={1} muted>กำลังแปล…</Text>
            </>
          ) : translation ? (
            <Button
              text="ซ่อนคำแปล"
              mode="ghost"
              tone="default"
              fontSize={1}
              padding={2}
              onClick={() => setTranslation(null)}
            />
          ) : (
            <Button
              text="🇹🇭 แปลภาษาไทย"
              mode="ghost"
              tone="primary"
              fontSize={1}
              padding={2}
              onClick={handleTranslate}
            />
          )}
        </Flex>

      </Stack>
    </Card>
  )
}
