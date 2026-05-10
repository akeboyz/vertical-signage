/**
 * LinkedAssetsDisplay
 *
 * Used on both Procurement and Payment (direct_expense) documents.
 * Lists Asset Registration docs linked to this document and provides
 * a "Create Asset Registration" button that pre-fills the new asset.
 *
 * Procurement → assets linked via sourceProcurement._ref
 * Payment     → assets linked via sourcePayment._ref
 */

import { useState, useEffect }              from 'react'
import { useClient, useFormValue }           from 'sanity'
import { Card, Stack, Flex, Text, Button, Badge, Spinner } from '@sanity/ui'

const RECEIVED_STATUS: Record<string, { label: string; tone: 'positive' | 'caution' | 'critical' | 'default' }> = {
  accepted: { label: '✅ Accepted', tone: 'positive' },
  partial:  { label: '⚠️ Partial',  tone: 'caution'  },
  rejected: { label: '❌ Rejected', tone: 'critical'  },
}

interface LinkedAsset {
  _id:             string
  assetTag?:       string
  receivedStatus?: string
  receivedQty?:    number
  brand?:          string
  model?:          string
}

const ASSET_NAV = (id: string) => `/structure/finance;asset;${id}%2Cview%3Dedit`

export function LinkedAssetsDisplay(_props: any) {
  const client      = useClient({ apiVersion: '2024-01-01' })
  const docId       = useFormValue(['_id'])          as string | undefined
  const docType     = useFormValue(['_type'])        as string | undefined
  const quantity    = useFormValue(['quantity'])     as number | undefined
  const assetQty    = useFormValue(['assetQuantity']) as number | undefined
  const contractRef = useFormValue(['contractType']) as { _ref?: string } | undefined
  const assetType   = useFormValue(['assetType'])    as string | undefined
  const accountRef  = useFormValue(['accountCode'])  as { _ref?: string } | undefined

  const [assets,   setAssets]   = useState<LinkedAsset[]>([])
  const [loading,  setLoading]  = useState(false)
  const [creating, setCreating] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const sourceId       = docId?.replace(/^drafts\./, '')
  const isPayment      = docType === 'payment'
  const displayQty     = isPayment ? (assetQty ?? 1) : (quantity ?? 0)
  const filterClause = `$sourceId in costSources[]._ref`

  const [orphanDrafts, setOrphanDrafts] = useState(0)
  const [totalCount,   setTotalCount]   = useState(0)

  const fetchAssets = () => {
    if (!sourceId) return
    setLoading(true)
    Promise.all([
      // Published assets — for display list
      client.fetch<LinkedAsset[]>(
        `*[_type == "asset" && ${filterClause} && !(_id in path("drafts.**"))]
         | order(_createdAt asc) {
           _id, assetTag, receivedStatus, receivedQty, brand, model
         }`,
        { sourceId },
      ),
      // All docs (published + draft) — deduplicated in JS to get true unique asset count
      client.fetch<Array<{ _id: string; receivedQty?: number }>>(
        `*[_type == "asset" && ${filterClause}]{ _id, receivedQty }`,
        { sourceId },
      ),
    ])
      .then(([published, all]) => {
        setAssets(published ?? [])

        // Group by base ID (strip "drafts." prefix).
        // A published doc + its open draft = same asset — count only once.
        const groups = new Map<string, Array<{ _id: string; receivedQty?: number }>>()
        for (const doc of (all ?? [])) {
          const baseId = doc._id.replace(/^drafts\./, '')
          if (!groups.has(baseId)) groups.set(baseId, [])
          groups.get(baseId)!.push(doc)
        }

        let qty = 0
        let orphans = 0
        for (const docs of groups.values()) {
          const pub = docs.find(d => !d._id.startsWith('drafts.'))
          qty += (pub ?? docs[0]).receivedQty ?? 1
          if (!pub) orphans++
        }

        setTotalCount(qty)
        setOrphanDrafts(orphans)
      })
      .catch(() => { setAssets([]); setTotalCount(0); setOrphanDrafts(0) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchAssets() }, [sourceId]) // eslint-disable-line

  const quotaSet     = displayQty > 0
  const quotaReached = quotaSet && totalCount >= displayQty
  const remaining    = quotaSet ? Math.max(0, displayQty - totalCount) : null

  const handleCreate = async () => {
    if (!sourceId) return

    // Re-check at click time: deduplicate same way to avoid race conditions
    const liveAll = await client
      .fetch<Array<{ _id: string }>>(`*[_type == "asset" && ${filterClause}]{ _id }`, { sourceId })
      .catch(() => [] as Array<{ _id: string }>)
    const liveUnique = new Set(liveAll.map(d => d._id.replace(/^drafts\./, ''))).size

    if (quotaSet && liveUnique >= displayQty) {
      setError(`Quota reached — ${displayQty} asset${displayQty > 1 ? 's' : ''} already exist for this ${isPayment ? 'payment' : 'procurement'}.`)
      return
    }

    setCreating(true)
    setError(null)
    try {
      const doc: Record<string, any> = { _type: 'asset' }
      doc.costSources = [{ _type: 'reference', _ref: sourceId, _key: sourceId }]
      if (!isPayment && contractRef?._ref) doc.contractType = { _type: 'reference', _ref: contractRef._ref }
      if (assetType)        doc.assetType   = assetType
      if (accountRef?._ref) doc.accountCode = { _type: 'reference', _ref: accountRef._ref }

      const created = await client.create(doc)
      window.location.href = ASSET_NAV(created._id)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create asset')
      setCreating(false)
    }
  }

  const qtyNote = remaining !== null && !loading
    ? `  ·  ${remaining} of ${displayQty} remaining${orphanDrafts > 0 ? ` (${orphanDrafts} unpublished)` : ''}`
    : ''

  return (
    <Stack space={3}>

      <Flex align="center" justify="space-between" gap={2}>
        <Text size={1} muted>
          {loading ? '…' : `${assets.length} asset${assets.length !== 1 ? 's' : ''} registered`}
          {qtyNote}
        </Text>
        {quotaReached ? (
          <Badge tone="positive" mode="outline" fontSize={0}>Quota reached</Badge>
        ) : (
          <Button
            text={creating ? 'Creating…' : '+ Create Asset Registration'}
            tone="primary"
            mode="ghost"
            fontSize={1}
            padding={2}
            disabled={creating || !sourceId || loading}
            onClick={handleCreate}
          />
        )}
      </Flex>

      {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}

      {loading ? (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Loading linked assets…</Text>
        </Flex>
      ) : assets.length === 0 && orphanDrafts === 0 ? (
        <Card padding={3} radius={2} tone="caution" border>
          <Text size={1}>No asset registrations yet. Click "Create Asset Registration" when goods arrive.</Text>
        </Card>
      ) : orphanDrafts > 0 && assets.length === 0 ? (
        <Card padding={3} radius={2} tone="primary" border>
          <Text size={1}>{orphanDrafts} asset draft{orphanDrafts > 1 ? 's' : ''} pending publish — open and complete before creating more.</Text>
        </Card>
      ) : (
        <Stack space={2}>
          {assets.map(a => {
            const si = RECEIVED_STATUS[a.receivedStatus ?? '']
            return (
              <Card key={a._id} padding={3} radius={2} tone="default" border>
                <Flex align="center" justify="space-between" gap={2}>
                  <Stack space={1}>
                    <Text size={1} weight="semibold">{a.assetTag ?? '(no tag yet)'}</Text>
                    {(a.brand || a.model) && (
                      <Text size={0} muted>{[a.brand, a.model].filter(Boolean).join(' ')}</Text>
                    )}
                  </Stack>
                  <Flex align="center" gap={2}>
                    {a.receivedQty != null && a.receivedQty !== 1 && (
                      <Text size={0} muted>×{a.receivedQty} units</Text>
                    )}
                    <Badge tone={si?.tone ?? 'default'} mode="outline" fontSize={0}>
                      {si?.label ?? '⏳ Pending'}
                    </Badge>
                    <Button
                      text="Open"
                      mode="ghost"
                      fontSize={0}
                      padding={2}
                      onClick={() => { window.location.href = ASSET_NAV(a._id) }}
                    />
                  </Flex>
                </Flex>
              </Card>
            )
          })}
        </Stack>
      )}

    </Stack>
  )
}
