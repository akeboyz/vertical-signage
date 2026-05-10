/**
 * PlaylistOverviewPane
 *
 * Document view for a playlistItem — shown as the "Overview" tab,
 * consistent with how other documents (media, installation, etc.) work.
 * Displays a visual summary of the slot: media thumbnail, title, type,
 * status, schedule, duration, touch routing, and notes.
 */

import { Flex, Stack, Text, Card, Badge, Box, Grid } from '@sanity/ui'

const CATEGORY_LABEL: Record<string, string> = {
  food:            'Food',
  groceries:       'Groceries',
  services:        'Services',
  forRent:         'For Rent',
  forSale:         'For Sale',
  buildingUpdates: 'Building Updates',
}

const TYPE_COLOR: Record<string, string> = {
  video: '#7c3aed',
  image: '#1d4ed8',
}

function fmt(dt: string) {
  return new Date(dt).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <Flex gap={3} align="flex-start">
      <Text size={1} muted style={{ minWidth: 160, flexShrink: 0 }}>{label}</Text>
      <Text size={1}>{value}</Text>
    </Flex>
  )
}

export function PlaylistOverviewPane({ document: doc }: { document?: { displayed?: any } }) {
  const item = doc?.displayed

  if (!item) {
    return (
      <Flex align="center" justify="center" padding={6}>
        <Text muted size={1}>No data. Switch to Edit tab.</Text>
      </Flex>
    )
  }

  const isDisabled    = item.enabled === false
  const mediaTitle    = item.media?.title
  const mediaType     = item.media?.type
  const mediaActive   = item.media?.isActive
  const thumbnail     = item.media?.posterImage?.asset?.url
                     ?? item.media?.imageFiles?.[0]?.asset?.url
  const touchCategory = item.touchExploreCategory
  const touchProvider = item.touchExploreDefaultProvider?.name_th

  return (
    <Box padding={4}>
      <Stack space={5}>

        {/* ── Status banner ──────────────────────────────────────────────── */}
        <Card
          padding={3}
          radius={2}
          border
          tone={isDisabled ? 'caution' : mediaActive === false ? 'critical' : 'positive'}
        >
          <Flex gap={3} align="center" wrap="wrap">
            <Text size={1} weight="semibold">
              Slot {item.order ?? '?'}
            </Text>
            <Badge tone={isDisabled ? 'caution' : 'positive'} mode="outline">
              {isDisabled ? 'Slot disabled' : 'Slot active'}
            </Badge>
            {mediaActive === false && (
              <Badge tone="critical" mode="outline">Media inactive</Badge>
            )}
            {mediaType && (
              <Badge mode="outline" style={{
                borderColor: TYPE_COLOR[mediaType],
                color: TYPE_COLOR[mediaType],
              }}>
                {mediaType}
              </Badge>
            )}
          </Flex>
        </Card>

        {/* ── Media preview ──────────────────────────────────────────────── */}
        <Card padding={3} radius={2} border tone="default">
          <Stack space={3}>
            <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Media
            </Text>
            <Flex gap={4} align="flex-start">
              {/* Thumbnail */}
              <Box style={{
                width: 90, height: 160, borderRadius: 6, overflow: 'hidden',
                background: '#111', flexShrink: 0,
              }}>
                {thumbnail ? (
                  <img
                    src={`${thumbnail}?w=180&h=320&fit=crop`}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}>
                    <Text size={0} muted>No image</Text>
                  </Flex>
                )}
              </Box>
              {/* Details */}
              <Stack space={2} style={{ flex: 1 }}>
                <Text size={2} weight="semibold">{mediaTitle ?? '(no media linked)'}</Text>
                {mediaType && <Text size={1} muted>{mediaType === 'video' ? '▶ Video' : '🖼 Image'}</Text>}
                {item.displayDuration && (
                  <Text size={1} muted>⏱ {item.displayDuration}s per image</Text>
                )}
              </Stack>
            </Flex>
          </Stack>
        </Card>

        {/* ── Schedule ───────────────────────────────────────────────────── */}
        {(item.startAt || item.endAt) && (
          <Card padding={3} radius={2} border tone="default">
            <Stack space={3}>
              <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Schedule
              </Text>
              <Grid columns={2} gap={3}>
                {item.startAt && <Row label="Active from" value={fmt(item.startAt)} />}
                {item.endAt   && <Row label="Active until" value={fmt(item.endAt)} />}
              </Grid>
            </Stack>
          </Card>
        )}

        {/* ── Touch routing ──────────────────────────────────────────────── */}
        {(touchCategory || touchProvider) && (
          <Card padding={3} radius={2} border tone="default">
            <Stack space={3}>
              <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Touch to Explore
              </Text>
              <Stack space={2}>
                {touchCategory && <Row label="Category" value={CATEGORY_LABEL[touchCategory] ?? touchCategory} />}
                {touchProvider  && <Row label="Default Provider" value={touchProvider} />}
              </Stack>
            </Stack>
          </Card>
        )}

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        {item.notes && (
          <Card padding={3} radius={2} border tone="transparent">
            <Stack space={2}>
              <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Notes
              </Text>
              <Text size={1} muted>{item.notes}</Text>
            </Stack>
          </Card>
        )}

      </Stack>
    </Box>
  )
}
