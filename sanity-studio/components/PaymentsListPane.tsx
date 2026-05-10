import { useState, useEffect } from 'react'
import { useClient }     from 'sanity'
import { useRouter }     from 'sanity/router'
import { usePaneRouter } from 'sanity/structure'
import { Box, Card, TextInput, Flex, Text, Spinner, Button } from '@sanity/ui'
import { SearchIcon, ComposeIcon } from '@sanity/icons'

interface PaymentRow {
  _id:               string
  paymentNumber?:    string
  paymentStatus?:    string
  vendor?:           string   // vendor->legalName_en
  vendorName?:       string
  paymentAmount?:    number
  paidAmount?:       number
  whtAmount?:        number
  vatType?:          string
  vatAmount?:        number
  currency?:         string
  glName?:           string   // accountCode->nameEn
  glType?:           string   // accountCode->type
  categoryName?:     string   // expenseCategoryName
}

function buildPreview(row: PaymentRow): { title: string; subtitle: string } {
  const statusLabel: Record<string, string> = {
    created:       '📝 Created',
    submitted:     '📤 Submitted',
    approved:      '✅ Approved',
    rejected:      '❌ Rejected',
    condition_met: '🔍 Condition Met',
    processing:    '🔄 Processing',
    paid:          '💳 Paid',
    complete:      '🧾 Complete',
  }

  const displayVendor = row.vendor ?? row.vendorName ?? null
  const title = [row.paymentNumber, displayVendor].filter(Boolean).join(' — ') || '(no number)'

  const glLabel   = (row.glType === 'asset' && row.categoryName) ? row.categoryName : row.glName
  const gross     = row.paidAmount ?? row.paymentAmount
  const net       = gross != null
    ? gross - (row.whtAmount ?? 0) + (row.vatType === 'exclusive' ? (row.vatAmount ?? 0) : 0)
    : null
  const amountStr = net != null ? `${Number(net).toLocaleString()} THB` : ''

  return {
    title,
    subtitle: [statusLabel[row.paymentStatus ?? ''] ?? '', glLabel, amountStr].filter(Boolean).join('  ·  '),
  }
}

export function PaymentsListPane() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const router = useRouter()
  const { ChildLink } = usePaneRouter()

  const [query,      setQuery]      = useState('')
  const [rows,       setRows]       = useState<PaymentRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [hoveredId,  setHoveredId]  = useState<string | null>(null)
  const [limit,      setLimit]      = useState(50)
  const [sort,       setSort]       = useState('paymentDate desc')
  const [showDrafts, setShowDrafts] = useState(false)

  const SORT_OPTIONS = [
    { label: 'Payment Date — Newest',  value: 'paymentDate desc'   },
    { label: 'Payment Date — Oldest',  value: 'paymentDate asc'    },
    { label: 'Reference No — Newest',  value: 'paymentNumber desc' },
    { label: 'Reference No — Oldest',  value: 'paymentNumber asc'  },
    { label: 'Vendor Name A → Z',      value: 'vendorName asc'     },
    { label: 'Vendor Name Z → A',      value: 'vendorName desc'    },
    { label: 'Status',                 value: 'paymentStatus asc'  },
    { label: 'Amount — Highest First', value: 'paymentAmount desc' },
    { label: 'Amount — Lowest First',  value: 'paymentAmount asc'  },
    { label: 'Due Date — Soonest',     value: 'dueDate asc'        },
  ]

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const q           = query.trim()
    const draftClause = showDrafts ? `_id in path("drafts.**")` : `!(_id in path("drafts.**"))`
    const filter      = q
      ? `_type == "payment" && ${draftClause} && (vendorName match $q || paymentNumber match $q)`
      : `_type == "payment" && ${draftClause}`
    const params = q ? { q: `*${q}*` } : {}

    client
      .fetch<PaymentRow[]>(
        `*[${filter}] | order(${sort})[0...$limit] {
          _id,
          paymentNumber,
          paymentStatus,
          "vendor":       vendor->legalName_en,
          vendorName,
          paymentAmount,
          paidAmount,
          whtAmount,
          vatType,
          vatAmount,
          currency,
          "glName":       accountCode->nameEn,
          "glType":       accountCode->type,
          "categoryName": expenseCategoryName,
        }`,
        { ...params, limit },
      )
      .then(data => { if (!cancelled) { setRows(data); setLoading(false) } })
      .catch(()  => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [query, limit, sort, showDrafts, client])

  return (
    <Card tone="default" height="fill" style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Toolbar */}
      <Box style={{ borderBottom: '1px solid var(--card-border-color)', flexShrink: 0 }}>
        {/* Row 1: search — full width */}
        <Box padding={2}>
          <TextInput
            icon={SearchIcon}
            placeholder="Search by vendor name or payment number…"
            value={query}
            onChange={e => { setQuery(e.currentTarget.value); setLimit(50) }}
            clearButton={!!query}
            onClear={() => { setQuery(''); setLimit(50) }}
          />
        </Box>
        {/* Row 2: sort + toggles + create */}
        <Flex
          paddingX={2} paddingBottom={2} gap={2} align="center"
          style={{ borderTop: '1px solid var(--card-border-color)' }}
        >
          <Box flex={1}>
            <select
              value={sort}
              onChange={e => { setSort(e.currentTarget.value); setLimit(50) }}
              style={{
                width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 4,
                border: '1px solid var(--card-border-color)',
                background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
              }}
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Box>
          <Button
            text={showDrafts ? 'Drafts' : 'Published'}
            mode={showDrafts ? 'default' : 'ghost'}
            tone={showDrafts ? 'caution' : 'default'}
            fontSize={1}
            padding={2}
            title="Toggle between published and draft documents"
            onClick={() => { setShowDrafts(d => !d); setLimit(50) }}
          />
          <Button
            icon={ComposeIcon}
            mode="ghost"
            tone="primary"
            title="Create new payment"
            onClick={() => router.navigateIntent('create', { type: 'payment' })}
          />
        </Flex>
      </Box>

      {/* List */}
      {loading ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Spinner muted />
        </Flex>
      ) : rows.length === 0 ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Text muted size={1}>{query ? 'No payments match' : 'No payments found'}</Text>
        </Flex>
      ) : (
        <Box style={{ flex: 1, overflowY: 'auto' }}>
          {rows.map(row => {
            const { title, subtitle } = buildPreview(row)
            const cleanId = row._id.replace(/^drafts\./, '')
            return (
              <Box
                key={row._id}
                onMouseEnter={() => setHoveredId(row._id)}
                onMouseLeave={() => setHoveredId(null)}
                padding={3}
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--card-border-color)',
                  background: hoveredId === row._id ? 'var(--card-muted-bg-color)' : undefined,
                }}
              >
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px', lineHeight: '1.25' }}>
                  {title}
                </span>
                {subtitle ? (
                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', lineHeight: '1.25', marginTop: '3px', opacity: 0.6 }}>
                    {subtitle}
                  </span>
                ) : null}
                <ChildLink childId={cleanId} childParameters={{ type: 'payment' }}>
                  <span style={{ position: 'absolute', inset: 0, display: 'block' }} />
                </ChildLink>
              </Box>
            )
          })}
        {rows.length >= limit && (
          <Box padding={3} style={{ borderTop: '1px solid var(--card-border-color)', textAlign: 'center', flexShrink: 0 }}>
            <Button mode="ghost" text="... show more" onClick={() => setLimit(l => l + 50)} />
          </Box>
        )}
        </Box>
      )}

    </Card>
  )
}
