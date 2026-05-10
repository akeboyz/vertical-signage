import { useState, useEffect, useCallback } from 'react'
import { useClient }   from 'sanity'
import { useRouter }   from 'sanity/router'
import { Box, Card, TextInput, Flex, Text, Spinner, Button } from '@sanity/ui'
import { SearchIcon, ComposeIcon } from '@sanity/icons'

interface FundingRow {
  _id:              string
  fundingNumber?:   string
  fundingCategory?: string
  fundingType?:     string
  direction?:       string
  status?:          string
  party?:           string   // party->legalName_en
  partyName?:       string
  amount?:          number
  newRegisteredCapital?: number
  date?:            string
}

function buildPreview(row: FundingRow): { title: string; subtitle: string } {
  const typeIcon: Record<string, string> = {
    loan_drawdown:       '📥',
    equity_injection:    '💼',
    inter_company_loan:  '🔄',
    loan_repayment:      '📤',
    dividend_payment:    '💸',
    inter_company_repay: '↩',
  }
  const typeLabel: Record<string, string> = {
    loan_drawdown:       'Loan Drawdown',
    equity_injection:    'Equity Injection',
    inter_company_loan:  'IC Loan',
    loan_repayment:      'Loan Repayment',
    dividend_payment:    'Dividend',
    inter_company_repay: 'IC Repayment',
  }
  const statusLabel: Record<string, string> = {
    draft: '📝 Draft', confirmed: '✅ Confirmed', voided: '🚫 Voided',
  }
  const directionLabel: Record<string, string> = {
    inflow: '📥 In', outflow: '📤 Out',
  }

  const capReg       = row.fundingCategory === 'capital_register' || (!row.fundingCategory && row.fundingType === 'capital_register')
  const icon         = capReg ? '📋' : (typeIcon[row.fundingType ?? ''] ?? '💰')
  const label        = capReg ? 'Capital Registration' : (typeLabel[row.fundingType ?? ''] ?? row.fundingType ?? '—')
  const displayParty = row.party ?? row.partyName ?? null
  const amountStr    = capReg
    ? (row.newRegisteredCapital != null ? `${Number(row.newRegisteredCapital).toLocaleString()} THB` : '')
    : (row.amount != null ? `${Number(row.amount).toLocaleString()} THB` : '')

  return {
    title:    `${icon} ${label}${displayParty ? ` — ${displayParty}` : ''}`,
    subtitle: [
      row.fundingNumber ?? '(no number)',
      directionLabel[row.direction ?? ''] ?? '',
      statusLabel[row.status ?? ''] ?? '',
      amountStr,
      row.date ?? '',
    ].filter(Boolean).join('  ·  '),
  }
}

export function FundingListPane() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const router = useRouter()

  const [query,     setQuery]     = useState('')
  const [rows,      setRows]      = useState<FundingRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [limit,     setLimit]     = useState(50)
  const [sort,      setSort]      = useState('date desc')

  const SORT_OPTIONS = [
    { label: 'Date — Newest',      value: 'date desc'        },
    { label: 'Date — Oldest',      value: 'date asc'         },
    { label: 'Ref No — Newest',    value: 'fundingNumber desc' },
    { label: 'Amount — Highest',   value: 'amount desc'      },
    { label: 'Direction (In/Out)', value: 'direction asc'    },
    { label: 'Type',               value: 'fundingType asc'  },
    { label: 'Status',             value: 'status asc'       },
  ]

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const q      = query.trim()
    const filter = q
      ? `_type == "funding" && !(_id in path("drafts.**")) && (party->legalName_en match $q || fundingNumber match $q)`
      : `_type == "funding" && !(_id in path("drafts.**"))`
    const params = q ? { q: `*${q}*` } : {}

    client
      .fetch<FundingRow[]>(
        `*[${filter}] | order(${sort})[0...$limit] {
          _id,
          fundingNumber,
          fundingCategory,
          fundingType,
          direction,
          status,
          "party": party->legalName_en,
          amount,
          newRegisteredCapital,
          date,
        }`,
        { ...params, limit },
      )
      .then(data => { if (!cancelled) { setRows(data); setLoading(false) } })
      .catch(()  => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [query, limit, sort, client])

  const open = useCallback(
    (id: string) => router.navigateIntent('edit', { id, type: 'funding' }),
    [router],
  )

  return (
    <Card tone="default" height="fill" style={{ display: 'flex', flexDirection: 'column' }}>

      {/* Search bar + create button */}
      <Flex
        padding={2} gap={2} align="center"
        style={{ borderBottom: '1px solid var(--card-border-color)', flexShrink: 0 }}
      >
        <Box flex={1}>
          <TextInput
            icon={SearchIcon}
            placeholder="Search by Party Name or Reference No."
            value={query}
            onChange={e => { setQuery(e.currentTarget.value); setLimit(50) }}
            clearButton={!!query}
            onClear={() => { setQuery(''); setLimit(50) }}
          />
        </Box>
        <select
          value={sort}
          onChange={e => { setSort(e.currentTarget.value); setLimit(50) }}
          style={{
            fontSize: 12, padding: '5px 8px', borderRadius: 4, flexShrink: 0,
            border: '1px solid var(--card-border-color)',
            background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
          }}
        >
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <Button
          icon={ComposeIcon}
          mode="ghost"
          tone="primary"
          title="Create new funding record"
          onClick={() => router.navigateIntent('create', { type: 'funding' })}
        />
      </Flex>

      {/* List */}
      {loading ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Spinner muted />
        </Flex>
      ) : rows.length === 0 ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Text muted size={1}>{query ? 'No funding records match' : 'No funding records found'}</Text>
        </Flex>
      ) : (
        <Box style={{ flex: 1, overflowY: 'auto' }}>
          {rows.map(row => {
            const { title, subtitle } = buildPreview(row)
            return (
              <Box
                key={row._id}
                onClick={() => open(row._id)}
                onMouseEnter={() => setHoveredId(row._id)}
                onMouseLeave={() => setHoveredId(null)}
                padding={3}
                style={{
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
