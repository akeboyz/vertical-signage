import React, { useEffect, useRef } from 'react'
import { usePaneRouter } from 'sanity/structure'
import { Card, Text, Stack, Heading, Badge, Flex, Spinner } from '@sanity/ui'

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
  schemaType: { name: string; title?: string }
}

const SKIP = new Set([
  '_id', '_type', '_rev', '_createdAt', '_updatedAt',
  'title', 'nameEN', 'name',
])

function formatKey(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim()
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No'
  if (typeof value === 'string')  return value || null
  if (typeof value === 'number')  return String(value)
  return null
}

export function DocumentOverview({ document: { draft, published, displayed: doc }, schemaType }: Props) {
  const { setParams } = usePaneRouter()

  // decided ref ensures we only pick a view once per document mount,
  // preventing flicker if draft/published update after initial render.
  const decided = useRef(false)

  useEffect(() => {
    if (decided.current) return

    // Wait up to 150 ms for Sanity's real-time cache to populate
    // published/draft — then make a single routing decision.
    const timer = setTimeout(() => {
      if (decided.current) return
      decided.current = true

      // "New" = no published version AND draft has no user-filled fields
      const userKeys = Object.keys(draft ?? {}).filter(k => !k.startsWith('_'))
      const isNew    = !published && userKeys.length === 0

      // Always explicitly set the view so stale URL params don't interfere
      setParams({ view: isNew ? 'edit' : 'overview' })
    }, 150)

    return () => clearTimeout(timer)
  }, [published, draft]) // re-triggers if data arrives after mount

  // ── Render ────────────────────────────────────────────────────────────────
  if (!doc._type) {
    return (
      <Card padding={6} height="fill" tone="transparent">
        <Flex align="center" justify="center" height="fill">
          <Spinner muted />
        </Flex>
      </Card>
    )
  }

  const heading =
    doc.title          ??
    doc.nameEN         ??
    doc.name           ??
    doc.contractNumber ??
    doc.quotationNumber ??
    doc.customerName   ??
    '(Untitled)'
  const rows = Object.entries(doc)
    .filter(([key]) => !SKIP.has(key))
    .map(([key, val]) => ({ key, label: formatKey(key), display: formatValue(val) }))
    .filter(r => r.display !== null)

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        <Stack space={3}>
          <Flex gap={2} wrap="wrap">
            <Badge tone="primary" mode="outline" fontSize={0}>
              {schemaType.title ?? schemaType.name}
            </Badge>
            <Badge tone="caution" mode="outline" fontSize={0}>
              Read-only — click Edit tab to make changes
            </Badge>
          </Flex>
          <Heading size={3}>{heading}</Heading>
        </Stack>

        {rows.length > 0 ? (
          <Stack space={2}>
            {rows.map(({ key, label, display }) => (
              <Card key={key} padding={3} border radius={2}>
                <Stack space={1}>
                  <Text size={0} weight="semibold" muted>{label}</Text>
                  <Text size={1}>{display}</Text>
                </Stack>
              </Card>
            ))}
          </Stack>
        ) : (
          <Card padding={4} border radius={2} tone="transparent">
            <Text size={1} muted align="center">
              No simple fields to preview — click Edit to view full content.
            </Text>
          </Card>
        )}

      </Stack>
    </Card>
  )
}
