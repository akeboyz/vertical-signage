/**
 * SupportingDocsInput
 *
 * Custom component for the supportingDocs array on a Ledger document.
 * Renders the default array input (add / edit / delete items) then shows
 * a full-width image gallery below for any uploaded image files.
 * PDF / spreadsheet files are shown as download cards instead.
 */

import { useState, useEffect }  from 'react'
import { useClient }            from 'sanity'
import { Box, Card, Flex, Stack, Text, Button, Spinner } from '@sanity/ui'
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

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DocItem {
  _key:      string
  docType?:  string
  asOfDate?: string
  note?:     string
  file?:     { asset?: { _ref?: string } }
}

interface AssetMeta {
  _id:              string
  url:              string
  mimeType:         string
  originalFilename: string
  size:             number
}

export function SupportingDocsInput(props: any) {
  const { value, renderDefault } = props
  const client = useClient({ apiVersion: '2024-01-01' })

  const items   = (value ?? []) as DocItem[]
  const allRefs = items.map(i => i.file?.asset?._ref).filter(Boolean) as string[]

  const [assetMap, setAssetMap] = useState<Record<string, AssetMeta>>({})
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (allRefs.length === 0) { setAssetMap({}); return }
    setLoading(true)
    client
      .fetch<AssetMeta[]>(
        `*[_id in $refs]{ _id, url, mimeType, originalFilename, size }`,
        { refs: allRefs },
      )
      .then(docs => {
        const map: Record<string, AssetMeta> = {}
        for (const d of docs) map[d._id] = d
        setAssetMap(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [allRefs.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Only items that have a resolved asset
  const resolvedItems = items
    .filter(i => i.file?.asset?._ref && assetMap[i.file.asset._ref])
    .map(i => ({ item: i, meta: assetMap[i.file!.asset!._ref!] }))

  const imageItems    = resolvedItems.filter(({ meta }) => IMAGE_MIME.has(meta.mimeType))
  const nonImageItems = resolvedItems.filter(({ meta }) => !IMAGE_MIME.has(meta.mimeType))

  const docTypeLabel = (key?: string) =>
    key?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Document'

  return (
    <Stack space={3}>

      {/* ── Default array input (add / edit / delete items) ── */}
      {renderDefault(props)}

      {/* ── Loading indicator ── */}
      {loading && allRefs.length > 0 && (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Loading previews…</Text>
        </Flex>
      )}

      {/* ── Non-image file cards ── */}
      {!loading && nonImageItems.length > 0 && (
        <Stack space={2}>
          {nonImageItems.map(({ item, meta }) => (
            <Card
              key={item._key}
              padding={3} radius={2}
              style={{ border: '1px solid var(--card-border-color)', background: 'var(--card-muted-bg-color)' }}
            >
              <Flex align="center" justify="space-between" gap={3}>
                <Flex align="center" gap={2} style={{ minWidth: 0 }}>
                  <Text size={2}>{FILE_ICON[meta.mimeType] ?? '📎'}</Text>
                  <Box style={{ minWidth: 0 }}>
                    <Text size={1} weight="semibold"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {meta.originalFilename}
                    </Text>
                    <Text size={0} muted>
                      {docTypeLabel(item.docType)}
                      {item.asOfDate ? `  ·  ${item.asOfDate}` : ''}
                      {`  ·  ${fmtSize(meta.size)}`}
                    </Text>
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
                  title="Download"
                />
              </Flex>
            </Card>
          ))}
        </Stack>
      )}

      {/* ── Full-width image previews ── */}
      {!loading && imageItems.length > 0 && (
        <Stack space={3}>
          {imageItems.map(({ item, meta }) => (
            <Box
              key={item._key}
              style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--card-border-color)' }}
            >
              <img
                src={meta.url}
                alt={meta.originalFilename}
                style={{
                  display: 'block', width: '100%', height: 'auto',
                  maxHeight: 900, objectFit: 'contain',
                  background: 'var(--card-muted-bg-color)',
                }}
              />
              <Box
                padding={2}
                style={{
                  background:  'var(--card-muted-bg-color)',
                  borderTop:   '1px solid var(--card-border-color)',
                }}
              >
                <Flex justify="space-between" align="center" gap={2}>
                  <Text size={0} muted>
                    {docTypeLabel(item.docType)}
                    {item.asOfDate ? `  ·  ${item.asOfDate}` : ''}
                    {item.note     ? `  ·  ${item.note}`     : ''}
                  </Text>
                  <Flex align="center" gap={2} style={{ flexShrink: 0 }}>
                    <Text size={0} muted>{fmtSize(meta.size)}</Text>
                    <Button
                      as="a"
                      href={meta.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      icon={DownloadIcon}
                      mode="ghost"
                      fontSize={1}
                      padding={1}
                      title="Open full size"
                    />
                  </Flex>
                </Flex>
              </Box>
            </Box>
          ))}
        </Stack>
      )}

    </Stack>
  )
}
