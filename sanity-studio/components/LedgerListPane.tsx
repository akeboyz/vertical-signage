import { useState, useEffect, useCallback } from 'react'
import { useClient }   from 'sanity'
import { useRouter }   from 'sanity/router'
import { Box, Card, TextInput, Flex, Text, Stack, Spinner, Button } from '@sanity/ui'
import { SearchIcon, ComposeIcon, ChevronLeftIcon } from '@sanity/icons'
import { useFiscalYears, FiscalYearOption } from '../hooks/useFiscalYears'

const GL_FILTER_KEY = 'gl:periodFilter'

interface LedgerRow {
  _id:       string
  code?:     string
  nameTh?:   string
  nameEn?:   string
  type?:     string
  depth?:    number
  isParent?: boolean
}

const TYPE_OPTIONS = [
  { value: '',          label: 'All'           },
  { value: 'asset',     label: '🏦 Assets'     },
  { value: 'liability', label: '📋 Liabilities' },
  { value: 'equity',    label: '📊 Equity'      },
  { value: 'revenue',   label: '💰 Revenue'     },
  { value: 'expense',   label: '💸 Expenses'    },
]

type DepthFilter = 'all' | 'leaf' | 'depth2' | 'depth1' | 'depth0'

const DEPTH_OPTIONS: { value: DepthFilter; label: string; title: string }[] = [
  { value: 'all',    label: 'All Levels',       title: 'Show all accounts'              },
  { value: 'leaf',   label: '🍃 Leaf',          title: 'Transactional accounts only'    },
  { value: 'depth2', label: '📄 Sub-sub-group', title: 'Group accounts at depth 2'      },
  { value: 'depth1', label: '📂 Sub-group',     title: 'Group accounts at depth 1'      },
  { value: 'depth0', label: '📁 Group',         title: 'Top-level group accounts only'  },
]

const TYPE_ICON: Record<string, string> = {
  asset: '🏦', liability: '📋', equity: '📊', revenue: '💰', expense: '💸',
}

const DEPTH_ICON: Record<number, string> = { 0: '📁', 1: '📂', 2: '📄' }

export function LedgerListPane() {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const router  = useRouter()
  const fyYears = useFiscalYears(5)

  // null = showing fiscal year list; set = showing account list for that year
  const [selectedFY, setSelectedFY] = useState<FiscalYearOption | null>(null)
  const [fyHovered,  setFyHovered]  = useState<string | null>(null)

  const [query,   setQuery]   = useState('')
  const [type,    setType]    = useState('')
  const [depth,   setDepth]   = useState<DepthFilter>('all')
  const [rows,    setRows]    = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hovered, setHovered] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedFY) { setRows([]); setLoading(false); return }

    let cancelled = false
    setLoading(true)

    const q = query.trim()

    const typeClause = type
      ? `&& accountCode->type == "${type}"`
      : ''

    // Use live accountCode fields — cached values (isParentCache, accountDepthCache)
    // can be stale if accounts were added after the ledger document was created.
    const depthClause =
      depth === 'leaf'   ? '&& accountCode->isParent != true'
      : depth === 'depth0' ? '&& accountCode->isParent == true && !defined(accountCode->parentCode._ref)'
      : depth === 'depth1' ? '&& accountCode->isParent == true && defined(accountCode->parentCode._ref) && !defined(accountCode->parentCode->parentCode._ref)'
      : depth === 'depth2' ? '&& accountCode->isParent == true && defined(accountCode->parentCode->parentCode._ref)'
      : ''

    const searchClause = q
      ? `&& (codeCache match $q || accountCode->nameTh match $q || accountCode->nameEn match $q)`
      : ''

    const groq = `*[_type == "ledger" && !(_id in path("drafts.**"))
      ${typeClause} ${depthClause} ${searchClause}
    ] | order(codeCache asc) {
      _id,
      "code":     coalesce(codeCache, accountCode->code),
      "nameTh":   accountCode->nameTh,
      "nameEn":   accountCode->nameEn,
      "type":     accountCode->type,
      "isParent": accountCode->isParent,
      "depth": select(
        !defined(accountCode->parentCode._ref)                                        => 0,
        !defined(accountCode->parentCode->parentCode._ref)                            => 1,
        !defined(accountCode->parentCode->parentCode->parentCode._ref)                => 2,
        3
      ),
    }`

    client
      .fetch<LedgerRow[]>(groq, q ? { q: `*${q}*` } : {})
      .then(data => { if (!cancelled) { setRows(data); setLoading(false) } })
      .catch(()  => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [selectedFY, query, type, depth, client])

  const open = useCallback(
    (id: string) => {
      if (selectedFY) {
        localStorage.setItem(GL_FILTER_KEY, JSON.stringify({ from: selectedFY.from, to: selectedFY.to, activeId: selectedFY.id }))
      }
      router.navigateIntent('edit', { id: id.replace(/^drafts\./, ''), type: 'ledger' })
    },
    [router, selectedFY],
  )

  // Indent only when showing all levels — visually conveys hierarchy
  const indent = (row: LedgerRow) =>
    depth === 'all' ? (row.depth ?? 0) * 14 : 0

  // ── Fiscal year list ─────────────────────────────────────────────────────
  if (!selectedFY) {
    return (
      <Card tone="default" height="fill" data-narrow-pane="true" style={{ display: 'flex', flexDirection: 'column' }}>

        {fyYears.length === 0 ? (
          <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
            <Spinner muted />
          </Flex>
        ) : (
          <Box style={{ flex: 1, overflowY: 'auto' }}>
            {fyYears.map(fy => (
              <Box
                key={fy.id}
                onClick={() => { setSelectedFY(fy); setLoading(true) }}
                onMouseEnter={() => setFyHovered(fy.id)}
                onMouseLeave={() => setFyHovered(null)}
                style={{
                  cursor:       'pointer',
                  borderBottom: '1px solid var(--card-border-color)',
                  background:   fyHovered === fy.id ? 'var(--card-muted-bg-color)' : undefined,
                  padding:      '9px 16px',
                }}
              >
                <Stack space={1}>
                  <Text size={1}>{fy.label}</Text>
                  <Text size={0} muted>{fy.from} – {fy.to}</Text>
                </Stack>
              </Box>
            ))}
          </Box>
        )}

      </Card>
    )
  }

  // ── Account list (fiscal year selected) ──────────────────────────────────
  return (
    <Card tone="default" height="fill" data-narrow-pane="true" style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ── */}
      <Box style={{ borderBottom: '1px solid var(--card-border-color)', flexShrink: 0 }}>

        {/* FY context bar */}
        <Flex align="center" gap={2} style={{ borderBottom: '1px solid var(--card-border-color)', padding: '5px 8px' }}>
          <Button
            icon={ChevronLeftIcon}
            mode="ghost"
            fontSize={1}
            padding={2}
            text="Back"
            onClick={() => { setSelectedFY(null); setQuery(''); setType(''); setDepth('all') }}
          />
          <Flex align="center" gap={1}>
            <span style={{ fontSize: 11 }}>📅</span>
            <Text size={1} weight="medium">{selectedFY.label}</Text>
          </Flex>
          <Text size={0} muted>{selectedFY.from} – {selectedFY.to}</Text>
        </Flex>

        {/* Search */}
        <Box padding={2}>
          <TextInput
            icon={SearchIcon}
            placeholder="Search code or account name…"
            value={query}
            onChange={e => setQuery(e.currentTarget.value)}
            clearButton={!!query}
            onClear={() => setQuery('')}
          />
        </Box>

        {/* Account type filter */}
        <Flex
          paddingX={2} paddingBottom={1} gap={1} wrap="wrap"
          style={{ borderTop: '1px solid var(--card-border-color)' }}
        >
          {TYPE_OPTIONS.map(o => (
            <Button
              key={o.value}
              text={o.label}
              fontSize={1} padding={2}
              mode={type === o.value ? 'default' : 'ghost'}
              tone={type === o.value ? 'primary' : 'default'}
              onClick={() => setType(o.value)}
            />
          ))}
        </Flex>

        {/* Depth / level filter */}
        <Flex
          paddingX={2} paddingBottom={2} gap={1} wrap="wrap" align="center"
          style={{ borderTop: '1px solid var(--card-border-color)' }}
        >
          {DEPTH_OPTIONS.map(o => (
            <Button
              key={o.value}
              text={o.label}
              title={o.title}
              fontSize={1} padding={2}
              mode={depth === o.value ? 'default' : 'ghost'}
              tone={depth === o.value ? 'primary' : 'default'}
              onClick={() => setDepth(o.value)}
            />
          ))}
          <Box style={{ marginLeft: 'auto' }}>
            <Button
              icon={ComposeIcon}
              mode="ghost"
              tone="primary"
              title="Create new ledger account"
              onClick={() => router.navigateIntent('create', { type: 'ledger' })}
            />
          </Box>
        </Flex>
      </Box>

      {/* ── List ── */}
      {loading ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Spinner muted />
        </Flex>
      ) : rows.length === 0 ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Text muted size={1}>{query ? 'No accounts match' : 'No ledger accounts found'}</Text>
        </Flex>
      ) : (
        <Box style={{ flex: 1, overflowY: 'auto' }}>
          {rows.map(row => (
            <Box
              key={row._id}
              onClick={() => open(row._id)}
              onMouseEnter={() => setHovered(row._id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                cursor: 'pointer',
                borderBottom: '1px solid var(--card-border-color)',
                background: hovered === row._id ? 'var(--card-muted-bg-color)' : undefined,
                padding: `7px 12px 7px ${12 + indent(row)}px`,
              }}
            >
              <Flex align="center" gap={2} style={{ minWidth: 0 }}>
                {/* Group / leaf icon */}
                {row.isParent
                  ? <span style={{ fontSize: 11, flexShrink: 0 }}>{DEPTH_ICON[row.depth ?? 0] ?? '📂'}</span>
                  : <span style={{ fontSize: 10, flexShrink: 0, opacity: 0.35 }}>·</span>
                }

                {/* Code */}
                <span style={{
                  fontFamily: 'monospace', fontSize: 12, fontWeight: 600,
                  flexShrink: 0, color: row.isParent ? undefined : 'var(--card-muted-fg-color)',
                }}>
                  {row.code}
                </span>

                {/* Name */}
                <span style={{
                  fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: row.isParent ? undefined : 'var(--card-muted-fg-color)',
                }}>
                  {row.nameTh || row.nameEn}
                </span>

                {/* Type icon — right-aligned */}
                {row.type && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, flexShrink: 0, opacity: 0.45 }}>
                    {TYPE_ICON[row.type]}
                  </span>
                )}
              </Flex>
            </Box>
          ))}
        </Box>
      )}

    </Card>
  )
}
