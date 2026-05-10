import React, { useState } from 'react'
import { useClient, useFormValue, set, PatchEvent } from 'sanity'
import type { StringInputProps } from 'sanity'
import { Stack, Flex, TextArea, Button, Text, Card, Spinner } from '@sanity/ui'

const API_BASE =
  (typeof process !== 'undefined' && (process.env as any).SANITY_STUDIO_API_BASE_URL) ||
  'https://aquamx-handoff.netlify.app'

/**
 * Custom input for the emailCampaign.aiBrief field.
 *
 * Renders a textarea for the campaign brief, then a "✨ Generate Content"
 * button directly below it. On click, calls /api/ai-campaign and patches
 * subject / body_th / body_en / imageSuggestions into the same draft document.
 * The form updates live via Sanity's real-time listener.
 */
export function CampaignBriefInput(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [busy,   setBusy]   = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [msg,    setMsg]    = useState('')

  const rawId         = useFormValue(['_id'])         as string | undefined
  const campaignTitle = useFormValue(['title'])        as string | undefined
  const recipientFilter = useFormValue(['recipientFilter']) as string | undefined

  async function handleGenerate() {
    const brief = props.value
    if (!brief?.trim()) {
      setMsg('Write your campaign idea first.')
      setStatus('error')
      return
    }
    if (!rawId) return

    setBusy(true)
    setMsg('')
    setStatus('idle')

    try {
      const res = await fetch(`${API_BASE}/api/ai-campaign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          brief:            brief,
          campaignTitle:    campaignTitle    ?? '',
          businessCategory: recipientFilter  ?? '',
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)

      // Patch generated fields into the draft document
      const draftId = rawId.startsWith('drafts.') ? rawId : `drafts.${rawId}`
      await client
        .patch(draftId)
        .set({
          subject:          data.subject          ?? '',
          body_th:          data.body_th          ?? '',
          body_en:          data.body_en          ?? '',
          imageSuggestions: data.imageSuggestions ?? '',
        })
        .commit()

      setMsg('Done — review and edit the content below.')
      setStatus('ok')

    } catch (err: any) {
      setMsg(`Generation failed: ${err?.message ?? String(err)}`)
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Stack space={3}>
      {/* Brief textarea */}
      <TextArea
        value={props.value ?? ''}
        onChange={e =>
          props.onChange(PatchEvent.from(set((e.target as HTMLTextAreaElement).value)))
        }
        rows={5}
        disabled={props.readOnly || busy}
        placeholder='e.g. "Special Q3 rate for F&B brands — 3-month package at 10% off. Emphasise high foot traffic in our Sukhumvit buildings and the captive affluent audience."'
      />

      {/* Generate button + status message */}
      <Flex align="center" gap={3}>
        <Button
          text={busy ? 'Generating…' : '✨ Generate Content'}
          tone="primary"
          disabled={busy || props.readOnly}
          onClick={handleGenerate}
          icon={busy ? Spinner : undefined}
        />
        {status === 'ok' && (
          <Text size={1} style={{ color: 'green' }}>
            {msg}
          </Text>
        )}
        {status === 'error' && (
          <Text size={1} style={{ color: 'crimson' }}>
            {msg}
          </Text>
        )}
      </Flex>

      {/* Hint shown while generating */}
      {busy && (
        <Card padding={3} radius={2} tone="transparent" border>
          <Text size={1} muted>
            Claude is writing your subject line, Thai body, English body, and image suggestions…
          </Text>
        </Card>
      )}
    </Stack>
  )
}
