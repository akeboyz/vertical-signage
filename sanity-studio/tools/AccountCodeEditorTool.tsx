/**
 * AccountCodeEditorTool
 *
 * Spreadsheet-style editor for Account Codes.
 * - Inline editable cells (No., Code, Name TH, Name EN, Type, Normal Balance)
 * - Add Row button appends a blank row
 * - Delete button per row
 * - Save All commits creates/patches/deletes in one batch
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClient }    from 'sanity'
import { useRouter }    from 'sanity/router'
import { AddIcon, LaunchIcon } from '@sanity/icons'
import { Box, Button, Card, Flex, Spinner, Text, Badge } from '@sanity/ui'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Row {
  _id?:          string        // undefined = new, not yet in Sanity
  _key:          string        // stable React key
  no:            string        // kept as string for input binding
  code:          string
  nameTh:        string
  nameEn:        string
  type:          string
  normalBalance: string
  dirty:         boolean
  markedDelete:  boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _seq = 0
const uid = () => `row-${++_seq}`

function blankRow(): Row {
  return { _key: uid(), no: '', code: '', nameTh: '', nameEn: '', type: '', normalBalance: '', dirty: true, markedDelete: false }
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding:       '8px 10px',
  fontSize:      11,
  fontWeight:    600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace:    'nowrap',
  background:    'var(--card-border-color)',
  color:         'var(--card-muted-fg-color)',
  borderBottom:  '2px solid var(--card-border-color)',
  borderRight:   '1px solid var(--card-border-color)',
  position:      'sticky',
  top:           0,
  zIndex:        2,
  textAlign:     'left',
}

const TD: React.CSSProperties = {
  padding:     0,
  borderBottom: '1px solid var(--card-border-color)',
  borderRight:  '1px solid var(--card-border-color)',
  verticalAlign: 'middle',
}

const CELL_INPUT: React.CSSProperties = {
  width:      '100%',
  border:     'none',
  background: 'transparent',
  outline:    'none',
  padding:    '8px 10px',
  fontSize:   13,
  color:      'var(--card-fg-color)',
  fontFamily: 'inherit',
  boxSizing:  'border-box',
}

const CELL_SELECT: React.CSSProperties = {
  ...CELL_INPUT,
  cursor: 'pointer',
}

const TYPE_OPTIONS = [
  { value: '',          label: '— type —'    },
  { value: 'asset',     label: '🏦 Asset'     },
  { value: 'liability', label: '📋 Liability' },
  { value: 'revenue',   label: '💰 Revenue'   },
  { value: 'expense',   label: '💸 Expense'   },
  { value: 'equity',    label: '📊 Equity'    },
]

const BALANCE_OPTIONS = [
  { value: '',       label: '— balance —' },
  { value: 'debit',  label: 'Debit'       },
  { value: 'credit', label: 'Credit'      },
]

// ── Component ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; normalBalance: string }> = {
  asset:     { label: '🏦  Assets',      normalBalance: 'debit'  },
  liability: { label: '📋  Liabilities', normalBalance: 'credit' },
  equity:    { label: '📊  Equity',      normalBalance: 'credit' },
  revenue:   { label: '💰  Revenue',     normalBalance: 'credit' },
  expense:   { label: '💸  Expenses',    normalBalance: 'debit'  },
}

export function AccountCodeEditorTool({
  options,
  document: doc,
}: {
  options?:  { accountType?: string }
  document?: { displayed?: any }
}) {
  // derive type from options, document field, or fixed document ID
  const docId       = doc?.displayed?._id?.replace(/^drafts\./, '') ?? ''
  const typeFromId  = docId.replace('accountCode-group-', '') // e.g. 'asset'
  const accountType = options?.accountType ?? doc?.displayed?.groupType ?? (typeFromId in TYPE_META ? typeFromId : undefined)
  const meta        = accountType ? TYPE_META[accountType] : null

  const client = useClient({ apiVersion: '2024-01-01' })
  const router = useRouter()

  const [rows,    setRows]    = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)
  const lastNewRef = useRef<HTMLInputElement>(null)

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const filter = accountType
        ? `_type == "accountCode" && !(_id in path("drafts.**")) && type == "${accountType}"`
        : `_type == "accountCode" && !(_id in path("drafts.**"))`
      const data = await client.fetch<any[]>(
        `*[${filter}] | order(no asc, code asc) {
           _id, no, code, nameTh, nameEn, type, normalBalance
         }`
      )
      setRows((data ?? []).map(d => ({
        _id:          d._id,
        _key:         uid(),
        no:           d.no != null ? String(d.no) : '',
        code:         d.code         ?? '',
        nameTh:       d.nameTh       ?? '',
        nameEn:       d.nameEn       ?? '',
        type:         d.type         ?? '',
        normalBalance: d.normalBalance ?? '',
        dirty:        false,
        markedDelete: false,
      })))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { load() }, [load])

  // ── Mutations ───────────────────────────────────────────────────────────────

  const updateRow = (key: string, field: keyof Row, value: string) => {
    setRows(prev => prev.map(r =>
      r._key === key ? { ...r, [field]: value, dirty: true } : r
    ))
    setSaved(false)
  }

  const addRow = () => {
    const row = blankRow()
    if (accountType) {
      row.type          = accountType
      row.normalBalance = meta?.normalBalance ?? ''
    }
    setRows(prev => [...prev, row])
    setSaved(false)
    setTimeout(() => lastNewRef.current?.focus(), 50)
  }

  const toggleDelete = (key: string) => {
    setRows(prev => prev.map(r =>
      r._key === key ? { ...r, markedDelete: !r.markedDelete, dirty: true } : r
    ))
    setSaved(false)
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)

    const toDelete = rows.filter(r => r.markedDelete && r._id)
    const toCreate = rows.filter(r => !r._id && !r.markedDelete && r.code.trim())
    const toUpdate = rows.filter(r => r._id && r.dirty && !r.markedDelete)

    try {
      await Promise.all([
        ...toDelete.map(r => client.delete(r._id!)),
        ...toCreate.map(r =>
          client.create({
            _type:         'accountCode',
            no:            r.no ? Number(r.no) : undefined,
            code:          r.code.trim(),
            nameTh:        r.nameTh.trim() || undefined,
            nameEn:        r.nameEn.trim() || undefined,
            type:          r.type         || undefined,
            normalBalance: r.normalBalance || undefined,
          })
        ),
        ...toUpdate.map(r =>
          client.patch(r._id!).set({
            no:            r.no ? Number(r.no) : undefined,
            code:          r.code.trim(),
            nameTh:        r.nameTh.trim() || undefined,
            nameEn:        r.nameEn.trim() || undefined,
            type:          r.type         || undefined,
            normalBalance: r.normalBalance || undefined,
          }).commit()
        ),
      ])
      setSaved(true)
      await load()   // refresh from Sanity
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const dirtyCount   = rows.filter(r => r.dirty && !r.markedDelete && (r._id || r.code.trim())).length
  const deleteCount  = rows.filter(r => r.markedDelete).length
  const visibleRows  = rows.filter(r => !r.markedDelete)
  const deletedRows  = rows.filter(r => r.markedDelete)

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return (
    <Flex align="center" justify="center" style={{ height: 300 }}>
      <Spinner muted />
      <Box marginLeft={3}><Text muted size={1}>Loading…</Text></Box>
    </Flex>
  )

  const isNewRow = (r: Row) => !r._id
  const newRows  = visibleRows.filter(isNewRow)

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* ── Toolbar ── */}
      <Flex
        align="center" gap={3} padding={3}
        style={{ borderBottom: '1px solid var(--card-border-color)', flexShrink: 0 }}
      >
        <Text size={2} weight="semibold">{meta ? `Account Codes — ${meta.label}` : 'Account Codes'}</Text>
        <Badge mode="outline" tone="default">{visibleRows.length} records</Badge>

        {dirtyCount > 0 && (
          <Badge mode="outline" tone="caution">{dirtyCount} unsaved</Badge>
        )}
        {deleteCount > 0 && (
          <Badge mode="outline" tone="critical">{deleteCount} to delete</Badge>
        )}
        {saved && (
          <Badge mode="outline" tone="positive">Saved ✓</Badge>
        )}

        <Box style={{ flex: 1 }} />

        <Button
          icon={AddIcon}
          text="Add Row"
          tone="primary"
          mode="ghost"
          onClick={addRow}
        />
        <Button
          text={saving ? 'Saving…' : 'Save All'}
          tone="positive"
          disabled={saving || (dirtyCount === 0 && deleteCount === 0)}
          onClick={save}
        />
      </Flex>

      {/* ── Error ── */}
      {error && (
        <Card tone="critical" padding={3} margin={3} radius={2} border>
          <Text size={1}>{error}</Text>
        </Card>
      )}

      {/* ── Table ── */}
      <Box style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 52 }}>No.</th>
              <th style={{ ...TH, width: 110 }}>Account Code</th>
              <th style={{ ...TH, minWidth: 180 }}>Account Name (Thai)</th>
              <th style={{ ...TH, minWidth: 180 }}>Account Name (English)</th>
              <th style={{ ...TH, width: 120 }}>Normal Balance</th>
              <th style={{ ...TH, width: 44 }}></th>
              <th style={{ ...TH, width: 44, borderRight: 'none' }}></th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => {
              const isNew = !row._id
              return (
                <tr
                  key={row._key}
                  style={{
                    background: isNew
                      ? 'rgba(99,179,237,0.06)'
                      : row.dirty
                        ? 'rgba(236,201,75,0.06)'
                        : 'transparent',
                  }}
                >
                  {/* No. */}
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <input
                      style={{ ...CELL_INPUT, textAlign: 'center' }}
                      type="number"
                      value={row.no}
                      placeholder={String(i + 1)}
                      onChange={e => updateRow(row._key, 'no', e.target.value)}
                      ref={isNew && i === visibleRows.length - 1 ? undefined : undefined}
                    />
                  </td>
                  {/* Code */}
                  <td style={TD}>
                    <input
                      style={{ ...CELL_INPUT, fontWeight: 600, fontFamily: 'monospace' }}
                      type="text"
                      value={row.code}
                      placeholder="e.g. 1100"
                      onChange={e => updateRow(row._key, 'code', e.target.value)}
                      ref={isNew && i === newRows.length - 1 ? lastNewRef : undefined}
                    />
                  </td>
                  {/* Name TH */}
                  <td style={TD}>
                    <input
                      style={CELL_INPUT}
                      type="text"
                      value={row.nameTh}
                      placeholder="ชื่อบัญชี"
                      onChange={e => updateRow(row._key, 'nameTh', e.target.value)}
                    />
                  </td>
                  {/* Name EN */}
                  <td style={TD}>
                    <input
                      style={CELL_INPUT}
                      type="text"
                      value={row.nameEn}
                      placeholder="Account name"
                      onChange={e => updateRow(row._key, 'nameEn', e.target.value)}
                    />
                  </td>
                  {/* Normal Balance */}
                  <td style={TD}>
                    <select
                      style={CELL_SELECT}
                      value={row.normalBalance}
                      onChange={e => updateRow(row._key, 'normalBalance', e.target.value)}
                    >
                      {BALANCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  {/* Open full-page doc */}
                  <td style={{ ...TD, textAlign: 'center' }}>
                    {row._id && (
                      <button
                        onClick={() => router.navigateIntent('edit', { id: row._id!, type: 'accountCode' })}
                        title="Open document"
                        style={{
                          border: 'none', background: 'transparent', cursor: 'pointer',
                          color: 'var(--card-muted-fg-color)', padding: '6px 8px',
                          borderRadius: 4, lineHeight: 1,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--card-fg-color)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--card-muted-fg-color)')}
                      >
                        ↗
                      </button>
                    )}
                  </td>
                  {/* Delete */}
                  <td style={{ ...TD, borderRight: 'none', textAlign: 'center' }}>
                    <button
                      onClick={() => toggleDelete(row._key)}
                      title="Delete row"
                      style={{
                        border:      'none',
                        background:  'transparent',
                        cursor:      'pointer',
                        color:       'var(--card-muted-fg-color)',
                        padding:     '6px 8px',
                        borderRadius: 4,
                        lineHeight:  1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--card-critical-fg-color, #e53e3e)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--card-muted-fg-color)')}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}

            {/* Pending deletes shown at bottom, struck through */}
            {deletedRows.map(row => (
              <tr key={row._key} style={{ opacity: 0.4 }}>
                <td style={TD} colSpan={6}>
                  <Text
                    size={1} muted
                    style={{ padding: '8px 10px', display: 'block', textDecoration: 'line-through' }}
                  >
                    {[row.no, row.code, row.nameTh || row.nameEn].filter(Boolean).join('  ·  ')}
                  </Text>
                </td>
                <td style={{ ...TD, borderRight: 'none', textAlign: 'center' }}>
                  <button
                    onClick={() => toggleDelete(row._key)}
                    title="Undo delete"
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: 'var(--card-muted-fg-color)', padding: '6px 8px',
                      borderRadius: 4, lineHeight: 1, fontSize: 12,
                    }}
                  >
                    ↩
                  </button>
                </td>
              </tr>
            ))}

            {/* Add row trigger */}
            <tr>
              <td colSpan={7} style={{ padding: '6px 10px', borderBottom: 'none' }}>
                <button
                  onClick={addRow}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--card-muted-fg-color)', fontSize: 13, padding: '4px 0',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--card-fg-color)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--card-muted-fg-color)')}
                >
                  + Add row
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </Box>

    </Box>
  )
}
