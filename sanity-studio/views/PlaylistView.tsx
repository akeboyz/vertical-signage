/**
 * PlaylistView
 *
 * Full-page document view shown as the "Playlist" tab on a Project document.
 * Displays ALL playlist items for this project in one visual page.
 * Supports reordering via up/down buttons and shows total playlist duration.
 */

import { useEffect, useState, useCallback } from 'react'
import { useClient }                         from 'sanity'
import { Stack, Flex, Text, Card, Badge, Box, Grid, Spinner, Button } from '@sanity/ui'

interface PlaylistItem {
  _id:              string
  order:            number
  enabled:          boolean
  notes?:           string
  startAt?:         string
  endAt?:           string
  displayDuration?: number
  touchCategory?:   string
  touchProvider?:   string
  mediaTitle?:      string
  mediaType?:       string
  mediaKind?:       string
  mediaActive?:     boolean
  thumbnail?:       string
  videoUrl?:        string
  videoDuration?:   number
  imageCount?:      number
  defaultImageDuration?: number
}

const CATEGORY_LABEL: Record<string, string> = {
  food: 'Food', groceries: 'Groceries', services: 'Services',
  forRent: 'For Rent', forSale: 'For Sale', buildingUpdates: 'Building Updates',
}

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s > 0 ? s + 's' : ''}`.trim() : `${s}s`
}

function itemDuration(item: PlaylistItem): number | null {
  if (item.mediaType === 'video') {
    return item.videoDuration ?? null
  }
  // notices have no `type` field — treat as single image
  if (item.mediaType === 'image' || item.mediaKind === 'notice') {
    const dur   = item.displayDuration ?? item.defaultImageDuration ?? 10
    // notices use posterImage (always 1); promos use imageFiles (1–6)
    const count = item.mediaKind === 'notice' ? 1
      : (item.imageCount && item.imageCount > 0 ? item.imageCount : 1)
    return dur * count
  }
  return null
}

export function PlaylistView({ document: doc }: { document?: { displayed?: any } }) {
  const client     = useClient({ apiVersion: '2024-01-01' })
  const projectId  = doc?.displayed?._id?.replace(/^drafts\./, '')
  const projectTitle = doc?.displayed?.title ?? doc?.displayed?.code?.current ?? ''
  const isActive   = doc?.displayed?.isActive as boolean | undefined
  const deployCode = doc?.displayed?.code?.current as string | undefined

  const [items,    setItems]   = useState<PlaylistItem[]>([])
  const [loading,  setLoading] = useState(false)
  const [error,    setError]   = useState('')
  const [reordering, setReordering] = useState(false)

  const fetchItems = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    client.fetch<PlaylistItem[]>(
      `*[_type == "playlistItem" && project._ref == $projectId] | order(order asc) {
        _id, order, enabled, notes, startAt, endAt, displayDuration,
        "touchCategory":        touchExploreCategory,
        "touchProvider":        touchExploreDefaultProvider->name_th,
        "mediaTitle":           media->title,
        "mediaType":            media->type,
        "mediaKind":            media->kind,
        "mediaActive":          media->isActive,
        "videoDuration":        media->videoDuration,
        "imageCount":           count(media->imageFiles),
        "defaultImageDuration": media->defaultImageDuration,
        "thumbnail":            coalesce(
          media->posterImage.asset->url,
          media->imageFiles[0].asset->url
        ),
        "videoUrl":             media->videoFile.asset->url
      }`,
      { projectId },
    )
    .then(rows => setItems(rows ?? []))
    .catch(e  => setError(e?.message ?? 'Failed to load'))
    .finally(() => setLoading(false))
  }, [projectId, client])

  useEffect(() => { fetchItems() }, [fetchItems])

  async function moveItem(idx: number, direction: 'up' | 'down') {
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= items.length) return
    setReordering(true)
    const a = items[idx]
    const b = items[swapIdx]
    try {
      await Promise.all([
        client.patch(a._id).set({ order: b.order }).commit(),
        client.patch(b._id).set({ order: a.order }).commit(),
      ])
      fetchItems()
    } finally {
      setReordering(false)
    }
  }

  function openItem(id: string) {
    const base  = window.location.href.split('/intent')[0].split('/structure')[0]
    const clean = id.replace(/^drafts\./, '')
    window.location.href = `${base}/intent/edit/id=${clean};type=playlistItem/`
  }

  const enabled        = items.filter(i => i.enabled !== false)
  const disabled       = items.filter(i => i.enabled === false)
  const videos         = items.filter(i => i.mediaType === 'video')
  const images         = items.filter(i => i.mediaType === 'image')
  const notices        = items.filter(i => i.mediaKind === 'notice')
  const missingMedia   = items.filter(i => !i.mediaTitle)
  const unknownDur     = items.filter(i => itemDuration(i) === null)

  const totalSeconds   = items.reduce((sum, item) => sum + (itemDuration(item) ?? 0), 0)
  const knownDurations = items.filter(i => itemDuration(i) !== null).length

  if (loading) return (
    <Flex align="center" justify="center" gap={3} style={{ height: 300 }}>
      <Spinner /><Text muted size={1}>Loading playlist…</Text>
    </Flex>
  )

  if (error) return (
    <Card tone="critical" padding={4} margin={4} radius={2} border>
      <Text size={1}>{error}</Text>
    </Card>
  )

  return (
    <Box padding={5} style={{ maxWidth: 900 }}>
      <Stack space={5}>

        {/* Header */}
        <Stack space={4}>
          <Text size={3} weight="semibold">{projectTitle} — Playlist</Text>

          {/* Summary stats */}
          <Grid columns={4} gap={3}>
            {/* Total slots */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Slots</Text>
                <Text size={4} weight="semibold">{items.length}</Text>
                <Flex gap={2} wrap="wrap">
                  <Badge tone="positive" mode="outline" fontSize={0}>{enabled.length} active</Badge>
                  {disabled.length > 0 && <Badge tone="caution" mode="outline" fontSize={0}>{disabled.length} off</Badge>}
                </Flex>
              </Stack>
            </Card>

            {/* Total duration */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Duration</Text>
                <Text size={4} weight="semibold">{totalSeconds > 0 ? fmtDuration(totalSeconds) : '—'}</Text>
                {unknownDur.length > 0 && (
                  <Text size={0} muted style={{ color: 'orange' }}>⚠ {unknownDur.length} unknown</Text>
                )}
                {unknownDur.length === 0 && knownDurations > 0 && (
                  <Text size={0} muted>complete</Text>
                )}
              </Stack>
            </Card>

            {/* Media types */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Media Types</Text>
                <Text size={4} weight="semibold">{videos.length + images.length + notices.length}</Text>
                <Flex gap={2} wrap="wrap">
                  {videos.length   > 0 && <Badge tone="primary" mode="outline" fontSize={0}>▶ {videos.length} video</Badge>}
                  {images.length   > 0 && <Badge tone="default" mode="outline" fontSize={0}>🖼 {images.length} image</Badge>}
                  {notices.length  > 0 && <Badge tone="default" mode="outline" fontSize={0}>📢 {notices.length} notice</Badge>}
                </Flex>
              </Stack>
            </Card>

            {/* Issues */}
            <Card padding={3} radius={2} border tone={missingMedia.length > 0 ? 'critical' : 'positive'}>
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Issues</Text>
                <Text size={4} weight="semibold">{missingMedia.length + unknownDur.length}</Text>
                <Flex gap={2} wrap="wrap">
                  {missingMedia.length > 0 && <Badge tone="critical" mode="outline" fontSize={0}>{missingMedia.length} no media</Badge>}
                  {unknownDur.length   > 0 && <Badge tone="caution" mode="outline" fontSize={0}>{unknownDur.length} no duration</Badge>}
                  {missingMedia.length === 0 && unknownDur.length === 0 && <Text size={0} muted>All good ✓</Text>}
                </Flex>
              </Stack>
            </Card>
          </Grid>
        </Stack>

        {/* Deploy status banner */}
        <Card padding={3} radius={2} border tone={isActive ? 'positive' : 'caution'}>
          <Flex gap={3} align="center">
            <Text size={1}>{isActive ? '🚀' : '⏸'}</Text>
            <Stack space={1}>
              <Text size={1} weight="semibold">
                {isActive
                  ? 'This playlist is live — deployed to GitHub'
                  : 'This playlist is not deployed (project is inactive)'}
              </Text>
              {isActive && deployCode && (
                <Text size={1} muted>Deploy folder: <code>{deployCode}</code> · Changes take effect after next build &amp; push</Text>
              )}
              {!isActive && (
                <Text size={1} muted>Enable "Is Active" on the project to include it in the next build.</Text>
              )}
            </Stack>
          </Flex>
        </Card>

        {items.length === 0 && (
          <Card padding={4} radius={2} border tone="caution">
            <Text size={1} muted>No playlist items yet for this project.</Text>
          </Card>
        )}

        {/* Items */}
        {items.map((item, idx) => {
          const off      = item.enabled === false
          const duration = itemDuration(item)

          return (
            <Card
              key={item._id}
              padding={4}
              radius={2}
              border
              tone={off ? 'caution' : item.mediaActive === false ? 'critical' : 'default'}
              style={{ opacity: off ? 0.55 : 1 }}
            >
              <Flex gap={4} align="flex-start">

                {/* Reorder buttons + position number */}
                <Stack space={1} style={{ flexShrink: 0, alignItems: 'center' }}>
                  <Button
                    text="▲"
                    mode="ghost"
                    fontSize={0}
                    padding={1}
                    disabled={idx === 0 || reordering}
                    onClick={() => moveItem(idx, 'up')}
                  />
                  <Flex align="center" justify="center" style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'rgba(128,128,128,0.2)',
                  }}>
                    <Text size={1} weight="semibold" style={{ lineHeight: 1 }}>
                      {idx + 1}
                    </Text>
                  </Flex>
                  <Button
                    text="▼"
                    mode="ghost"
                    fontSize={0}
                    padding={1}
                    disabled={idx === items.length - 1 || reordering}
                    onClick={() => moveItem(idx, 'down')}
                  />
                </Stack>

                {/* Thumbnail */}
                <Box style={{
                  flexShrink: 0, width: 40, height: 72,
                  borderRadius: 4, overflow: 'hidden', background: '#1a1a2e',
                }}>
                  {item.thumbnail
                    ? <img src={`${item.thumbnail}?w=80&h=144&fit=crop`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : item.videoUrl
                      ? <video src={item.videoUrl} muted preload="metadata"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}><Text size={0} muted>—</Text></Flex>
                  }
                </Box>

                {/* Info */}
                <Stack space={3} style={{ flex: 1, minWidth: 0 }}>

                  <Flex gap={2} align="center" wrap="wrap">
                    <Text size={2} weight="semibold"
                      style={{ textDecoration: off ? 'line-through' : 'none' }}>
                      {item.mediaTitle ?? '(no media linked)'}
                    </Text>
                    {item.mediaType && (
                      <Badge mode="outline" tone={item.mediaType === 'video' ? 'primary' : 'default'} fontSize={0}>
                        {item.mediaType === 'video' ? '▶ Video' : '🖼 Image'}
                      </Badge>
                    )}
                    {off && <Badge tone="caution" mode="outline" fontSize={0}>Disabled</Badge>}
                    {item.mediaActive === false && <Badge tone="critical" mode="outline" fontSize={0}>Media inactive</Badge>}
                  </Flex>

                  <Grid columns={2} gap={2}>
                    {duration != null && (
                      <Text size={1} muted>⏱ {fmtDuration(duration)}</Text>
                    )}
                    {item.mediaType === 'video' && !item.videoDuration && (
                      <Text size={1} muted style={{ color: 'orange' }}>⏱ duration not set</Text>
                    )}
                    {item.touchCategory && (
                      <Text size={1} muted>👆 {CATEGORY_LABEL[item.touchCategory] ?? item.touchCategory}</Text>
                    )}
                    {item.touchProvider && (
                      <Text size={1} muted>🏪 {item.touchProvider}</Text>
                    )}
                    {(item.startAt || item.endAt) && (
                      <Text size={1} muted>
                        📅 {item.startAt ? fmtDate(item.startAt) : '∞'} → {item.endAt ? fmtDate(item.endAt) : '∞'}
                      </Text>
                    )}
                    {item.notes && (
                      <Text size={1} muted style={{ gridColumn: '1 / -1' }}>📝 {item.notes}</Text>
                    )}
                  </Grid>

                </Stack>

                {/* Edit button */}
                <Button
                  text="Edit slot"
                  mode="ghost"
                  tone="primary"
                  fontSize={1}
                  style={{ flexShrink: 0, alignSelf: 'center' }}
                  onClick={() => openItem(item._id)}
                />

              </Flex>
            </Card>
          )
        })}

      </Stack>
    </Box>
  )
}
