/**
 * DirectoryView
 *
 * Read-only summary tab on a Project document.
 * Shows all offers visible on this project's kiosk screen, grouped by category.
 * Provider info (logo, name) is shown inside each offer card.
 */

import { useEffect, useState } from 'react'
import { useClient }           from 'sanity'
import { IntentLink }          from 'sanity/router'
import { Stack, Flex, Text, Card, Badge, Box, Spinner, Grid } from '@sanity/ui'

interface OfferEntry {
  _id:            string
  slug:           string
  titleTh:        string
  titleEn?:       string
  scope:          string
  category:       string
  providerName:   string
  providerActive: boolean
  logo?:          string
  primaryImage?:  string
}

interface NoticeEntry {
  _id:        string
  title:      string
  isActive:   boolean
  expiresAt?: string
  thumbnail?: string
}

const CATEGORY_LABEL: Record<string, string> = {
  food:            '🍽 Food',
  groceries:       '🛒 Groceries',
  services:        '🔧 Services',
  forRent:         '🏠 For Rent',
  forSale:         '💰 For Sale',
  buildingUpdates: '📢 Building Updates',
}

export function DirectoryView({ document: doc }: { document?: { displayed?: any } }) {
  const client       = useClient({ apiVersion: '2024-01-01' })
  const projectId    = doc?.displayed?._id?.replace(/^drafts\./, '')
  const projectTitle = doc?.displayed?.title ?? ''

  const [offers,   setOffers]   = useState<OfferEntry[]>([])
  const [notices,  setNotices]  = useState<NoticeEntry[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!projectId) return
    setLoading(true)
    Promise.all([
      client.fetch<any[]>(
        `*[
          _type == "offer" &&
          !(_id in path("drafts.**")) &&
          status == true &&
          (scope == "global" || $projectId in projects[]._ref)
        ] | order(category asc, provider->name_th asc) {
          _id,
          "slug":           slug.current,
          "titleTh":        title_th,
          "titleEn":        title_en,
          scope,
          category,
          "providerName":   provider->name_th,
          "providerActive": provider->status,
          "logo":           provider->logo.asset->url,
          "primaryImage":   primaryImage.asset->url,
        }`,
        { projectId },
      ),
      client.fetch<NoticeEntry[]>(
        `*[
          _type == "media" &&
          !(_id in path("drafts.**")) &&
          kind == "notice" &&
          $projectId in projects[]._ref
        ] | order(title asc) {
          _id, title, isActive, expiresAt,
          "thumbnail": posterImage.asset->url,
        }`,
        { projectId },
      ),
    ])
    .then(([offerRows, noticeRows]) => {
      // Deduplicate by slug
      const seen = new Set<string>()
      const deduped: OfferEntry[] = []
      for (const row of (offerRows ?? [])) {
        const key = row.slug ?? row._id
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push({
          _id:            row._id,
          slug:           key,
          titleTh:        row.titleTh ?? '(untitled)',
          titleEn:        row.titleEn,
          scope:          row.scope,
          category:       row.category ?? 'other',
          providerName:   row.providerName ?? '(unnamed)',
          providerActive: row.providerActive !== false,
          logo:           row.logo,
          primaryImage:   row.primaryImage,
        })
      }
      setOffers(deduped)
      setNotices(noticeRows ?? [])
    })
    .catch(e => setError(e?.message ?? 'Failed to load'))
    .finally(() => setLoading(false))
  }, [projectId, client])

  if (loading) return (
    <Flex align="center" justify="center" gap={3} style={{ height: 300 }}>
      <Spinner /><Text muted size={1}>Loading directory…</Text>
    </Flex>
  )

  if (error) return (
    <Card tone="critical" padding={4} margin={4} radius={2} border>
      <Text size={1}>{error}</Text>
    </Card>
  )

  // Group offers by category
  const byCategory: Record<string, OfferEntry[]> = {}
  for (const o of offers) {
    if (!byCategory[o.category]) byCategory[o.category] = []
    byCategory[o.category].push(o)
  }

  const categoryOrder    = ['food', 'groceries', 'services', 'forRent', 'forSale', 'buildingUpdates']
  const sortedCategories = [
    ...categoryOrder.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !categoryOrder.includes(c)),
  ]

  const now            = new Date().toISOString()
  const activeNotices  = notices.filter(n => n.isActive && (!n.expiresAt || n.expiresAt > now))
  const expiredNotices = notices.filter(n => n.expiresAt && n.expiresAt <= now)

  return (
    <Box padding={5} style={{ maxWidth: 900 }}>
      <Stack space={5}>

        {/* Header */}
        <Stack space={4}>
          <Text size={3} weight="semibold">{projectTitle} — Directory</Text>

          <Grid columns={4} gap={3}>
            {/* Total Offers */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Offers</Text>
                <Text size={4} weight="semibold">{offers.length}</Text>
                <Flex gap={2} wrap="wrap">
                  {sortedCategories.map(cat => (
                    <Badge key={cat} tone="default" mode="outline" fontSize={0}>
                      {byCategory[cat].length} {CATEGORY_LABEL[cat]?.replace(/^\S+\s/, '') ?? cat}
                    </Badge>
                  ))}
                </Flex>
              </Stack>
            </Card>

            {/* Notices */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Building Updates</Text>
                <Text size={4} weight="semibold">{notices.length}</Text>
                <Flex gap={2} wrap="wrap">
                  {activeNotices.length > 0  && <Badge tone="positive" mode="outline" fontSize={0}>{activeNotices.length} active</Badge>}
                  {expiredNotices.length > 0 && <Badge tone="critical" mode="outline" fontSize={0}>{expiredNotices.length} expired</Badge>}
                  {notices.length === 0 && <Text size={0} muted>None</Text>}
                </Flex>
              </Stack>
            </Card>

            {/* Categories */}
            <Card padding={3} radius={2} border tone="default">
              <Stack space={2}>
                <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Categories</Text>
                <Text size={4} weight="semibold">{sortedCategories.length}</Text>
                <Flex gap={2} wrap="wrap">
                  {sortedCategories.map(cat => (
                    <Badge key={cat} tone="default" mode="outline" fontSize={0}>
                      {CATEGORY_LABEL[cat] ?? cat}
                    </Badge>
                  ))}
                </Flex>
              </Stack>
            </Card>

            {/* Issues */}
            {(() => {
              const inactiveProviders = offers.filter(o => !o.providerActive).length
              const issueCount = inactiveProviders + expiredNotices.length
              return (
                <Card padding={3} radius={2} border tone={issueCount > 0 ? 'critical' : 'positive'}>
                  <Stack space={2}>
                    <Text size={0} muted style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>Issues</Text>
                    <Text size={4} weight="semibold">{issueCount}</Text>
                    <Flex gap={2} wrap="wrap">
                      {inactiveProviders > 0  && <Badge tone="critical" mode="outline" fontSize={0}>{inactiveProviders} inactive provider</Badge>}
                      {expiredNotices.length > 0 && <Badge tone="critical" mode="outline" fontSize={0}>{expiredNotices.length} expired notice</Badge>}
                      {issueCount === 0 && <Text size={0} muted>All good ✓</Text>}
                    </Flex>
                  </Stack>
                </Card>
              )
            })()}
          </Grid>
        </Stack>

        {offers.length === 0 && notices.length === 0 && (
          <Card padding={4} radius={2} border tone="caution">
            <Text size={1} muted>No offers or notices found for this project.</Text>
          </Card>
        )}

        {/* Offer cards grouped by category */}
        {sortedCategories.map(cat => (
          <Stack key={cat} space={3}>
            <Flex gap={2} align="center">
              <Text size={2} weight="semibold">{CATEGORY_LABEL[cat] ?? cat}</Text>
              <Badge tone="default" mode="outline" fontSize={0}>{byCategory[cat].length} offers</Badge>
            </Flex>

            <Grid columns={2} gap={3}>
              {byCategory[cat].map(offer => (
                <IntentLink
                  key={offer._id}
                  intent="edit"
                  params={{ id: offer._id, type: 'offer' }}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <Card padding={3} radius={2} border
                    tone={offer.providerActive ? 'default' : 'caution'}
                    style={{ cursor: 'pointer', height: '100%' }}>
                    <Flex gap={3} align="flex-start">

                      {/* Offer poster image */}
                      <Box style={{
                        flexShrink: 0, width: 56, height: 56,
                        borderRadius: 6, overflow: 'hidden', background: '#f0f0f0',
                      }}>
                        {(offer.primaryImage ?? offer.logo)
                          ? <img src={`${offer.primaryImage ?? offer.logo}?w=112&h=112&fit=crop`} alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}>
                              <Text size={0} muted>—</Text>
                            </Flex>
                        }
                      </Box>

                      {/* Offer info */}
                      <Stack space={2} style={{ flex: 1, minWidth: 0 }}>
                        <Text size={0} style={{
                          opacity: 0.6,
                          textDecoration: offer.providerActive ? 'none' : 'line-through',
                          color: 'var(--card-fg-color)',
                        }}>
                          {offer.providerName}
                        </Text>
                        <Text size={1} weight="semibold" style={{
                          color: 'var(--card-fg-color)',
                        }}>
                          {offer.titleTh}
                        </Text>
                        <Flex gap={2} wrap="wrap">
                          <Badge fontSize={0} mode="outline"
                            tone={offer.scope === 'global' ? 'default' : 'primary'}>
                            {offer.scope === 'global' ? 'Global' : 'This project'}
                          </Badge>
                          {!offer.providerActive && (
                            <Badge fontSize={0} mode="outline" tone="caution">Provider inactive</Badge>
                          )}
                        </Flex>
                      </Stack>

                    </Flex>
                  </Card>
                </IntentLink>
              ))}
            </Grid>
          </Stack>
        ))}

        {/* Building Updates */}
        {notices.length > 0 && (
          <Stack space={3}>
            <Flex gap={2} align="center">
              <Text size={2} weight="semibold">📢 Building Updates</Text>
              <Badge tone="default" mode="outline" fontSize={0}>{notices.length}</Badge>
            </Flex>
            <Grid columns={2} gap={3}>
              {notices.map(notice => {
                const expired = notice.expiresAt && notice.expiresAt <= now
                return (
                  <Card key={notice._id} padding={3} radius={2} border
                    tone={expired ? 'critical' : notice.isActive ? 'default' : 'caution'}>
                    <Flex gap={3} align="center">
                      <Box style={{
                        flexShrink: 0, width: 40, height: 40,
                        borderRadius: 6, overflow: 'hidden', background: '#1a1a2e',
                      }}>
                        {notice.thumbnail
                          ? <img src={`${notice.thumbnail}?w=80&h=80&fit=crop`} alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}>
                              <Text size={0} muted>—</Text>
                            </Flex>
                        }
                      </Box>
                      <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
                        <Text size={1} weight="semibold">
                          {notice.title}
                        </Text>
                        <Flex gap={2} wrap="wrap">
                          {expired
                            ? <Badge tone="critical" mode="outline" fontSize={0}>Expired</Badge>
                            : notice.isActive
                              ? <Badge tone="positive" mode="outline" fontSize={0}>Active</Badge>
                              : <Badge tone="caution" mode="outline" fontSize={0}>Inactive</Badge>
                          }
                          {notice.expiresAt && (
                            <Text size={0} muted>
                              Expires {new Date(notice.expiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                            </Text>
                          )}
                        </Flex>
                      </Stack>
                    </Flex>
                  </Card>
                )
              })}
            </Grid>
          </Stack>
        )}

      </Stack>
    </Box>
  )
}
