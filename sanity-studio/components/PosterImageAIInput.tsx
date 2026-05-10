/**
 * PosterImageAIInput
 *
 * Wraps the native Sanity image upload for the posterImage field.
 * When an image is uploaded on a Notice document, shows a
 * "🤖 Read Image" button that calls Claude vision to extract:
 *   - title  (Thai text from the notice image)
 *   - altText (English description)
 *
 * Only shows the AI button when kind === 'notice' and an image is uploaded.
 */

import { useState, useCallback }       from 'react'
import { Stack, Button, Flex, Text, Card, Spinner, Badge } from '@sanity/ui'
import { useFormValue, useDocumentOperation }              from 'sanity'
import type { ImageInputProps }                            from 'sanity'

const API_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/read-notice-image'

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

function refToUrl(ref: string): string | null {
  if (!ref?.startsWith('image-')) return null
  const body     = ref.slice('image-'.length)
  const lastDash = body.lastIndexOf('-')
  if (lastDash === -1) return null
  const ext  = body.slice(lastDash + 1)
  const name = body.slice(0, lastDash)
  return `https://cdn.sanity.io/images/${PROJECT_ID}/${DATASET}/${name}.${ext}`
}

interface ReadResult {
  title?:   string | null
  titleEn?: string | null
  summary?: string | null
}

export function PosterImageAIInput(props: ImageInputProps) {
  const rawId   = useFormValue(['_id'])   as string | undefined
  const kind    = useFormValue(['kind'])  as string | undefined
  const docId   = (rawId ?? '').replace(/^drafts\./, '')
  const { patch } = useDocumentOperation(docId || 'placeholder', 'media')

  const imageRef = (props.value as any)?.asset?._ref as string | undefined
  const imageUrl = imageRef ? refToUrl(imageRef) : null
  const isNotice = kind === 'notice'

  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<ReadResult | null>(null)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [error,    setError]    = useState('')
  const [applied,  setApplied]  = useState(false)

  const runRead = useCallback(async () => {
    if (!imageUrl) return
    setLoading(true)
    setResult(null)
    setError('')
    setSelected({})
    setApplied(false)

    try {
      const res  = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageUrl }),
      })
      const data = await res.json() as ReadResult
      if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`)
      setResult(data)
      setSelected({
        title:   !!data.title,
        altText: !!data.titleEn,
      })
    } catch (err: any) {
      setError(err?.message ?? 'Failed to read image')
    } finally {
      setLoading(false)
    }
  }, [imageUrl])

  const applySelected = useCallback(() => {
    if (!result) return
    const patches: Record<string, string> = {}
    if (selected.title   && result.title)   patches.title   = result.title
    if (selected.altText && result.titleEn) patches.altText = result.titleEn
    if (Object.keys(patches).length === 0) return
    patch.execute([{ set: patches }])
    setApplied(true)
    setResult(null)
  }, [result, selected, patch])

  return (
    <Stack space={3}>

      {/* Native image upload */}
      {props.renderDefault(props)}

      {/* AI button — only for notices with an uploaded image */}
      {isNotice && (
        <Stack space={2}>
          <Button
            text={loading ? 'Reading image…' : '🤖 Read Image with AI'}
            mode="ghost"
            tone="primary"
            disabled={!imageUrl || loading}
            onClick={runRead}
            icon={loading ? () => <Spinner /> : undefined}
          />

          {!imageUrl && (
            <Text size={0} muted>Upload an image above first.</Text>
          )}

          {applied && (
            <Card padding={2} radius={2} tone="positive" border>
              <Text size={0}>✅ Fields applied — review and publish.</Text>
            </Card>
          )}

          {error && (
            <Card padding={2} radius={2} tone="critical" border>
              <Text size={0}>{error}</Text>
            </Card>
          )}

          {result && (
            <Card padding={3} radius={2} border tone="primary">
              <Stack space={3}>
                <Text size={0} weight="semibold">Select fields to apply:</Text>

                {/* Title */}
                {result.title && (
                  <Card
                    padding={2} radius={2} border
                    tone={selected.title ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, title: !p.title }))}
                  >
                    <Flex align="flex-start" gap={2}>
                      <input
                        type="checkbox"
                        checked={!!selected.title}
                        onChange={() => setSelected(p => ({ ...p, title: !p.title }))}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <Stack space={1}>
                        <Flex gap={2} align="center">
                          <Text size={0} muted weight="semibold">Title</Text>
                          <Badge tone="primary" mode="outline" fontSize={0}>→ Title field</Badge>
                        </Flex>
                        <Text size={1}>{result.title}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* Alt text (English) */}
                {result.titleEn && (
                  <Card
                    padding={2} radius={2} border
                    tone={selected.altText ? 'positive' : 'default'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected(p => ({ ...p, altText: !p.altText }))}
                  >
                    <Flex align="flex-start" gap={2}>
                      <input
                        type="checkbox"
                        checked={!!selected.altText}
                        onChange={() => setSelected(p => ({ ...p, altText: !p.altText }))}
                        style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <Stack space={1}>
                        <Flex gap={2} align="center">
                          <Text size={0} muted weight="semibold">English</Text>
                          <Badge tone="default" mode="outline" fontSize={0}>→ Alt Text field</Badge>
                        </Flex>
                        <Text size={1}>{result.titleEn}</Text>
                      </Stack>
                    </Flex>
                  </Card>
                )}

                {/* Summary — read only */}
                {result.summary && (
                  <Card padding={2} radius={2} tone="transparent" border>
                    <Stack space={1}>
                      <Text size={0} muted weight="semibold">Summary (reference only)</Text>
                      <Text size={0} muted>{result.summary}</Text>
                    </Stack>
                  </Card>
                )}

                <Flex gap={2} justify="flex-end">
                  <Button text="Dismiss" mode="ghost" fontSize={0} onClick={() => setResult(null)} />
                  <Button
                    text="Apply selected"
                    tone="primary"
                    fontSize={0}
                    disabled={!Object.values(selected).some(Boolean)}
                    onClick={applySelected}
                  />
                </Flex>
              </Stack>
            </Card>
          )}
        </Stack>
      )}

    </Stack>
  )
}
