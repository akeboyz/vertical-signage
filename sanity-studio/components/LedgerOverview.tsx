import { useState, useEffect } from 'react'
import { useClient }           from 'sanity'
import { Card, Stack, Text, Flex, Heading, Spinner, Box, Button, Badge } from '@sanity/ui'
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

const TYPE_ICON: Record<string, string> = {
  asset: '🏦', liability: '📋', equity: '📊', revenue: '💰', expense: '💸',
}

const DOC_TYPE_LABEL: Record<string, string> = {
  bank_statement:   '🏦 Bank Statement',
  audited_accounts: '📊 Audited Accounts',
  trial_balance:    '📋 Trial Balance Export',
  reconciliation:   '🔁 Reconciliation Sheet',
  depreciation:     '📉 Depreciation Schedule',
  other:            '📎 Other',
}

function fmtSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtThb(n: number): string {
  return Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface AssetMeta {
  _id:              string
  url:              string
  mimeType:         string
  originalFilename: string
  size:             number
}

interface SupportingDoc {
  _key:      string
  docType?:  string
  asOfDate?: string
  note?:     string
  file?:     { asset?: { _ref?: string } }
}

interface LedgerData {
  _id:                  string
  code?:                string
  nameTh?:              string
  nameEn?:              string
  type?:                string
  normalBalance?:       string
  isParent?:            boolean
  depth?:               number
  broughtForwardDate?:  string
  broughtForwardDebit?: number
  broughtForwardCredit?:number
  supportingDocs?:      SupportingDoc[]
}

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
}

export function LedgerOverview({ document: { displayed } }: Props) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [ledger,   setLedger]   = useState<LedgerData | null>(null)
  const [assetMap, setAssetMap] = useState<Record<string, AssetMeta>>({})
  const [loading,  setLoading]  = useState(true)

  const docId = (displayed?._id as string | undefined)?.replace(/^drafts\./, '') ?? ''

  useEffect(() => {
    if (!docId) { setLoading(false); return }
    let cancelled = false
    setLoading(true)

    client
      .fetch<LedgerData>(
        `*[_type == "ledger" && _id in [$id, "drafts." + $id]][0] {
          _id,
          "code":            coalesce(codeCache, accountCode->code),
          "nameTh":          accountCode->nameTh,
          "nameEn":          accountCode->nameEn,
          "type":            accountCode->type,
          "normalBalance":   coalesce(normalBalanceCache, accountCode->normalBalance),
          "isParent":        coalesce(isParentCache, accountCode->isParent, false),
          "depth":           coalesce(accountDepthCache, 0),
          broughtForwardDate,
          broughtForwardDebit,
          broughtForwardCredit,
          "supportingDocs":  supportingDocs[] { _key, docType, asOfDate, note, file },
        }`,
        { id: docId },
      )
      .then(data => {
        if (cancelled) return
        setLedger(data)

        const refs = (data?.supportingDocs ?? [])
          .map(d => d.file?.asset?._ref)
          .filter(Boolean) as string[]

        if (refs.length === 0) { setLoading(false); return }

        client
          .fetch<AssetMeta[]>(
            `*[_id in $refs]{ _id, url, mimeType, originalFilename, size }`,
            { refs },
          )
          .then(assets => {
            if (cancelled) return
            const map: Record<string, AssetMeta> = {}
            for (const a of assets) map[a._id] = a
            setAssetMap(map)
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setLoading(false) })
      })
      .catch(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Flex padding={6} align="center" justify="center">
        <Spinner muted />
      </Flex>
    )
  }

  if (!ledger) {
    return (
      <Box padding={6}>
        <Text muted>Could not load ledger data.</Text>
      </Box>
    )
  }

  const depthLabel =
    ledger.isParent
      ? (ledger.depth === 0 ? '📁 Group Account'
        : ledger.depth === 1 ? '📂 Sub-group'
        : '📄 Sub-sub-group')
      : '🍃 Transactional'

  const bfAmount =
    ledger.normalBalance === 'credit'
      ? (ledger.broughtForwardCredit ?? 0)
      : (ledger.broughtForwardDebit  ?? 0)

  const docs = ledger.supportingDocs ?? []

  const resolvedDocs = docs
    .filter(d => d.file?.asset?._ref && assetMap[d.file.asset._ref])
    .map(d => ({ doc: d, meta: assetMap[d.file!.asset!._ref!] }))

  const imageDocs    = resolvedDocs.filter(({ meta }) =>  IMAGE_MIME.has(meta.mimeType))
  const nonImageDocs = resolvedDocs.filter(({ meta }) => !IMAGE_MIME.has(meta.mimeType))
  const unresolved   = docs.filter(d => !d.file?.asset?._ref || !assetMap[d.file.asset._ref])

  return (
    <Box padding={4}>
      <Stack space={4}>

        {/* ── Account info ─────────────────────────────────────────────────── */}
        <Card padding={4} radius={2} border>
          <Stack space={4}>

            {/* Icon + title + subtitle */}
            <Flex gap={3} align="flex-start">
              <Text size={3} style={{ flexShrink: 0, paddingTop: 2 }}>
                {TYPE_ICON[ledger.type ?? ''] ?? '📒'}
              </Text>
              <Stack space={1} style={{ minWidth: 0 }}>
                <Heading size={2}>
                  {ledger.code}  ·  {ledger.nameTh ?? ledger.nameEn ?? '(No name)'}
                </Heading>
                <Text size={1} muted>
                  {depthLabel}  ·  {ledger.type ?? ''}  ·  Normal balance: {ledger.normalBalance ?? '—'}
                </Text>
              </Stack>
            </Flex>

            {/* Divider + brought-forward row */}
            {!ledger.isParent && (
              <>
                <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
                <Flex gap={5}>
                  <Stack space={1}>
                    <Text size={0} muted>Brought-forward date</Text>
                    <Text size={1} weight="semibold">{ledger.broughtForwardDate ?? '—'}</Text>
                  </Stack>
                  <Stack space={1}>
                    <Text size={0} muted>Opening balance</Text>
                    <Text size={1} weight="semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {bfAmount !== 0 ? `${fmtThb(bfAmount)} THB` : '—'}
                    </Text>
                  </Stack>
                </Flex>
              </>
            )}

          </Stack>
        </Card>

        {/* ── Supporting Documents ─────────────────────────────────────────── */}
        <Box>
          <Flex align="center" gap={2} style={{ marginBottom: 12 }}>
            <Text size={1} weight="semibold">📎  Supporting Documents</Text>
            <Badge mode="outline" tone={docs.length > 0 ? 'positive' : 'default'}>
              {docs.length}
            </Badge>
          </Flex>

          {docs.length === 0 ? (
            <Card padding={4} radius={2} border tone="default">
              <Text size={1} muted>No supporting documents attached.</Text>
            </Card>
          ) : (
            <Stack space={3}>

              {/* Non-image file cards */}
              {nonImageDocs.map(({ doc, meta }) => (
                <Card
                  key={doc._key}
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
                          {DOC_TYPE_LABEL[doc.docType ?? ''] ?? '📎 Document'}
                          {doc.asOfDate ? `  ·  ${doc.asOfDate}` : ''}
                          {doc.note     ? `  ·  ${doc.note}`     : ''}
                          {'  ·  '}{fmtSize(meta.size)}
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

              {/* Full-width image previews */}
              {imageDocs.map(({ doc, meta }) => (
                <Box
                  key={doc._key}
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
                      background: 'var(--card-muted-bg-color)',
                      borderTop:  '1px solid var(--card-border-color)',
                    }}
                  >
                    <Flex justify="space-between" align="center" gap={2}>
                      <Text size={0} muted>
                        {DOC_TYPE_LABEL[doc.docType ?? ''] ?? '📎 Document'}
                        {doc.asOfDate ? `  ·  ${doc.asOfDate}` : ''}
                        {doc.note     ? `  ·  ${doc.note}`     : ''}
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

              {/* Items without a resolved file (no upload yet) */}
              {unresolved.map(doc => (
                <Card
                  key={doc._key}
                  padding={3} radius={2}
                  style={{ border: '1px solid var(--card-border-color)', background: 'var(--card-muted-bg-color)' }}
                >
                  <Flex align="center" gap={2}>
                    <Text size={1} muted>📎</Text>
                    <Text size={1} muted>
                      {DOC_TYPE_LABEL[doc.docType ?? ''] ?? 'Document'}
                      {doc.asOfDate ? `  ·  ${doc.asOfDate}` : ''}
                      {'  — no file attached'}
                    </Text>
                  </Flex>
                </Card>
              ))}

            </Stack>
          )}
        </Box>

      </Stack>
    </Box>
  )
}
