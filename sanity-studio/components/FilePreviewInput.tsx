/**
 * FilePreviewInput
 *
 * Custom component for Sanity `file` fields.
 * - Image files  → full-width inline preview above the upload control
 * - PDF / Excel  → styled download card with icon + filename
 * - Empty        → just the native upload control
 */

import { useState, useEffect } from 'react'
import { useClient }           from 'sanity'
import { Box, Card, Flex, Text, Button, Spinner } from '@sanity/ui'
import { DownloadIcon } from '@sanity/icons'

const IMAGE_MIME = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
])

const FILE_ICON: Record<string, string> = {
  'application/pdf':                                                          '📄',
  'application/vnd.ms-excel':                                                 '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':       '📊',
  'text/csv':                                                                 '📊',
  'application/msword':                                                       '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
}

interface AssetMeta {
  url:              string
  mimeType:         string
  originalFilename: string
  size:             number
}

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilePreviewInput(props: any) {
  const { value, renderDefault } = props
  const client = useClient({ apiVersion: '2024-01-01' })

  const assetRef = value?.asset?._ref as string | undefined

  const [meta,    setMeta]    = useState<AssetMeta | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!assetRef) { setMeta(null); return }
    setLoading(true)
    client
      .fetch<AssetMeta>(
        `*[_id == $ref][0]{ url, mimeType, originalFilename, size }`,
        { ref: assetRef },
      )
      .then(doc => setMeta(doc ?? null))
      .catch(() => setMeta(null))
      .finally(() => setLoading(false))
  }, [assetRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const isImage = meta ? IMAGE_MIME.has(meta.mimeType) : false

  return (
    <Box>
      {/* ── Preview area ── */}
      {loading && (
        <Flex align="center" gap={2} paddingBottom={2}>
          <Spinner muted />
          <Text size={1} muted>Loading preview…</Text>
        </Flex>
      )}

      {!loading && meta && isImage && (
        <Box
          marginBottom={2}
          style={{ borderRadius: 4, overflow: 'hidden', border: '1px solid var(--card-border-color)' }}
        >
          <img
            src={meta.url}
            alt={meta.originalFilename}
            style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 600, objectFit: 'contain', background: 'var(--card-muted-bg-color)' }}
          />
          <Box
            padding={2}
            style={{ background: 'var(--card-muted-bg-color)', borderTop: '1px solid var(--card-border-color)' }}
          >
            <Flex align="center" justify="space-between" gap={2}>
              <Text size={0} muted style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {meta.originalFilename}
              </Text>
              <Text size={0} muted style={{ flexShrink: 0 }}>{fmtSize(meta.size)}</Text>
            </Flex>
          </Box>
        </Box>
      )}

      {!loading && meta && !isImage && (
        <Card
          padding={3} radius={2} marginBottom={2}
          style={{ border: '1px solid var(--card-border-color)', background: 'var(--card-muted-bg-color)' }}
        >
          <Flex align="center" justify="space-between" gap={3}>
            <Flex align="center" gap={2} style={{ minWidth: 0 }}>
              <Text size={2}>{FILE_ICON[meta.mimeType] ?? '📎'}</Text>
              <Box style={{ minWidth: 0 }}>
                <Text
                  size={1}
                  weight="semibold"
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {meta.originalFilename}
                </Text>
                <Text size={0} muted>{fmtSize(meta.size)}</Text>
              </Box>
            </Flex>
            <Button
              as="a"
              href={meta.url}
              target="_blank"
              rel="noopener noreferrer"
              icon={DownloadIcon}
              mode="ghost"
              fontSize={1}
              padding={2}
              title="Download file"
            />
          </Flex>
        </Card>
      )}

      {/* ── Native file upload control (always visible for replace/upload) ── */}
      {renderDefault(props)}
    </Box>
  )
}
