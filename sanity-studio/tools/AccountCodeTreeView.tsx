/**
 * AccountCodeTreeView
 *
 * Hierarchical tree editor for Account Codes (up to N levels deep).
 * - Expand / collapse parent rows
 * - Inline editing for all cells
 * - "+ Add Child" per row, "+ Add Root Account" in toolbar
 * - Save All commits creates / patches / deletes in one batch
 * - parentCode reference maintained automatically
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useClient } from 'sanity'
import { Box, Button, Card, Flex, Spinner, Text, Badge, useToast } from '@sanity/ui'

const TRANSLATE_URL =
  (typeof process !== 'undefined' && (process.env as any).SANITY_STUDIO_API_BASE_URL
    ? (process.env as any).SANITY_STUDIO_API_BASE_URL
    : 'https://aquamx-handoff.netlify.app') + '/api/translate'

async function translateText(text: string, from: 'th' | 'en'): Promise<string> {
  const res = await fetch(TRANSLATE_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      sourceLang: from === 'th' ? 'Thai' : 'English',
      targetLang: from === 'th' ? 'English' : 'Thai',
      instruction: from === 'th'
        ? 'Translate the following Thai accounting term to English. Return only the translated term — no explanation, no quotes:'
        : 'แปลคำศัพท์บัญชีภาษาอังกฤษต่อไปนี้เป็นภาษาไทย ตอบเฉพาะคำแปลเท่านั้น ไม่ต้องอธิบาย:',
    }),
  })
  if (!res.ok) throw new Error(`Translation failed (${res.status})`)
  const data = await res.json()
  return data.translated ?? ''
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface FlatNode {
  _id?:        string   // undefined = new
  _key:        string   // stable local key
  parentId?:   string   // _id of saved parent
  parentKey?:  string   // _key of unsaved parent
  code:        string
  nameTh:      string
  nameEn:      string
  normalBalance: string
  type:        string
  notes:       string
  isParent:             boolean
  dirty:       boolean
  markedDelete: boolean
}

interface TreeNode extends FlatNode {
  children: TreeNode[]
  depth:    number
}

// ── Helpers ────────────────────────────────────────────────────────────────────

let _seq = 0
const uid = () => `k${++_seq}`

function blankNode(overrides: Partial<FlatNode> = {}): FlatNode {
  return {
    _key: uid(), code: '', nameTh: '', nameEn: '',
    normalBalance: '', type: '', notes: '', isParent: false, dirty: true, markedDelete: false,
    ...overrides,
  }
}

function buildTree(nodes: FlatNode[]): TreeNode[] {
  const visible = nodes.filter(n => !n.markedDelete)

  function toTree(n: FlatNode, depth: number): TreeNode {
    const children = visible
      .filter(c =>
        (c.parentId  && c.parentId  === n._id)  ||
        (c.parentKey && c.parentKey === n._key)
      )
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(c => toTree(c, depth + 1))
    return { ...n, children, depth }
  }

  return visible
    .filter(n => !n.parentId && !n.parentKey)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map(n => toTree(n, 0))
}

function flatten(tree: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  function walk(nodes: TreeNode[]) {
    for (const n of nodes) { out.push(n); walk(n.children) }
  }
  walk(tree)
  return out
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '8px 10px', fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em',
  whiteSpace: 'nowrap', textAlign: 'left',
  background: 'var(--card-border-color)',
  color: 'var(--card-muted-fg-color)',
  borderBottom: '2px solid var(--card-border-color)',
  borderRight: '1px solid var(--card-border-color)',
  position: 'sticky', top: 0, zIndex: 2,
}

const TD: React.CSSProperties = {
  padding: 0,
  borderBottom: '1px solid var(--card-border-color)',
  borderRight: '1px solid var(--card-border-color)',
  verticalAlign: 'top',
}

const INPUT: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent',
  outline: 'none', padding: '7px 10px', fontSize: 13,
  color: 'var(--card-fg-color)', fontFamily: 'inherit', boxSizing: 'border-box',
}

const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer' }

const BALANCE_OPTIONS = [
  { value: '',       label: '—'      },
  { value: 'debit',  label: 'Debit'  },
  { value: 'credit', label: 'Credit' },
]

const TYPE_META: Record<string, { label: string; normalBalance: string }> = {
  asset:     { label: '🏦 Assets',      normalBalance: 'debit'  },
  liability: { label: '📋 Liabilities', normalBalance: 'credit' },
  equity:    { label: '📊 Equity',      normalBalance: 'credit' },
  revenue:   { label: '💰 Revenue',     normalBalance: 'credit' },
  expense:   { label: '💸 Expenses',    normalBalance: 'debit'  },
}

// ── CSV ────────────────────────────────────────────────────────────────────────

const GROUP_PREFIX: Record<string, string> = {
  asset: '1', liability: '2', equity: '3', revenue: '4', expense: '5',
}

const CSV_HEADERS = ['Account Code', 'Account Name (Thai)', 'Account Name (English)', 'Normal Balance', 'Parent Code', 'Notes'] as const
const CSV_HEADERS_ALL = [...CSV_HEADERS, 'Group'] as const

function csvEsc(v: any): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

function buildCsvBlob(headers: readonly string[], rows: string[][]): Blob {
  const csv = [[...headers], ...rows].map(r => r.map(csvEsc).join(',')).join('\n')
  return new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a   = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function parseCsvText(text: string): Record<string, string>[] {
  const splitLine = (line: string): string[] => {
    const out: string[] = []; let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ
      } else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
      else cur += ch
    }
    return [...out, cur]
  }
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitLine(lines[0]).map(h => h.trim())
  return lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = splitLine(l)
    return Object.fromEntries(headers.map((h, i) => [h, (vals[i] ?? '').trim()]))
  })
}

// ── Row ────────────────────────────────────────────────────────────────────────

function TranslateBtn({ spinning, onClick, title }: { spinning: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={spinning}
      style={{
        flexShrink: 0, border: 'none', background: 'transparent',
        cursor: spinning ? 'wait' : 'pointer', padding: '2px 4px',
        color: 'var(--card-muted-fg-color)', fontSize: 11, lineHeight: 1,
        borderRadius: 3, opacity: spinning ? 0.5 : 1,
      }}
      onMouseEnter={e => { if (!spinning) e.currentTarget.style.color = 'var(--card-accent-fg-color, #3b82f6)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--card-muted-fg-color)' }}
    >
      {spinning ? '…' : '🌐'}
    </button>
  )
}

function TreeRow({
  node, collapsed, translating, notesOpen, keyToNo, onToggle, onUpdate, onAddChild, onDelete, onTranslate, onToggleNote,
}: {
  node:          TreeNode
  collapsed:     Set<string>
  translating:   Set<string>
  notesOpen:     Set<string>
  keyToNo:       Map<string, number>
  onToggle:      (key: string) => void
  onUpdate:      (key: string, field: keyof FlatNode, value: string | boolean) => void
  onAddChild:    (parentKey: string, parentId?: string) => void
  onDelete:      (key: string) => void
  onTranslate:   (key: string, from: 'th' | 'en') => void
  onToggleNote:  (key: string) => void
}) {
  const isCollapsed  = collapsed.has(node._key)
  const hasChildren  = node.children.length > 0
  const indent       = node.depth * 24
  const noteIsOpen   = notesOpen.has(node._key)
  const hasNote      = node.notes.trim().length > 0

  return (
    <>
      <tr
        style={{
          background: !node._id
            ? 'rgba(99,179,237,0.06)'
            : node.dirty
              ? 'rgba(236,201,75,0.05)'
              : 'transparent',
        }}
      >
        {/* No. — auto-assigned, read-only */}
        <td style={{ ...TD, width: 52, textAlign: 'center' }}>
          <Text size={1} muted style={{ display: 'block', padding: '8px 6px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {keyToNo.get(node._key) ?? ''}
          </Text>
        </td>

        {/* Code — indented */}
        <td style={{ ...TD, minWidth: 160 }}>
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: indent }}>
            {/* expand / collapse toggle */}
            <button
              onClick={() => hasChildren && onToggle(node._key)}
              style={{
                border: 'none', background: 'transparent', cursor: hasChildren ? 'pointer' : 'default',
                color: hasChildren ? 'var(--card-fg-color)' : 'transparent',
                width: 20, flexShrink: 0, fontSize: 10, padding: 0, lineHeight: 1,
              }}
            >
              {hasChildren ? (isCollapsed ? '▶' : '▼') : '·'}
            </button>
            <input style={{ ...INPUT, fontWeight: 600, fontFamily: 'monospace', padding: '7px 6px' }}
              type="text" value={node.code} placeholder="e.g. 11000"
              onChange={e => onUpdate(node._key, 'code', e.target.value)} />
          </div>
        </td>

        {/* Name TH */}
        <td style={{ ...TD, width: 150 }}>
          <Flex align="center">
            <input style={{ ...INPUT, flex: 1 }}
              type="text" value={node.nameTh} placeholder="ชื่อบัญชี"
              onChange={e => onUpdate(node._key, 'nameTh', e.target.value)} />
            <TranslateBtn
              spinning={translating.has(`${node._key}-en`)}
              title="Translate EN → TH"
              onClick={() => onTranslate(node._key, 'en')}
            />
          </Flex>
        </td>

        {/* Name EN */}
        <td style={{ ...TD, width: 150 }}>
          <Flex align="center">
            <input style={{ ...INPUT, flex: 1 }}
              type="text" value={node.nameEn} placeholder="Account name"
              onChange={e => onUpdate(node._key, 'nameEn', e.target.value)} />
            <TranslateBtn
              spinning={translating.has(`${node._key}-th`)}
              title="Translate TH → EN"
              onClick={() => onTranslate(node._key, 'th')}
            />
          </Flex>
        </td>

        {/* Normal Balance */}
        <td style={{ ...TD, width: 110 }}>
          <select style={SELECT} value={node.normalBalance}
            onChange={e => onUpdate(node._key, 'normalBalance', e.target.value)}>
            {BALANCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </td>

        {/* Is Parent (header account) */}
        <td style={{ ...TD, width: 36, textAlign: 'center' }}>
          <input
            type="checkbox"
            checked={node.isParent}
            title="Header account — has sub-accounts, cannot record transactions directly"
            onChange={e => onUpdate(node._key, 'isParent', e.target.checked)}
            style={{ cursor: 'pointer', marginTop: 8 }}
          />
        </td>

        {/* Notes toggle */}
        <td style={{ ...TD, width: 36, textAlign: 'center' }}>
          <button
            onClick={() => onToggleNote(node._key)}
            title={hasNote ? node.notes : 'Add note / comment'}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              padding: '6px 8px', lineHeight: 1, fontSize: 14,
              color: hasNote
                ? (noteIsOpen ? 'var(--card-accent-fg-color, #3b82f6)' : 'var(--card-accent-fg-color, #3b82f6)')
                : 'var(--card-muted-fg-color)',
              opacity: hasNote ? 1 : 0.35,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = hasNote ? '1' : '0.35' }}
          >💬</button>
        </td>

        {/* Add Child */}
        <td style={{ ...TD, width: 36, textAlign: 'center' }}>
          <button
            onClick={() => onAddChild(node._key, node._id)}
            title="Add child account"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--card-muted-fg-color)', padding: '6px 8px', lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--card-fg-color)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--card-muted-fg-color)')}
          >＋</button>
        </td>

        {/* Delete */}
        <td style={{ ...TD, width: 36, textAlign: 'center', borderRight: 'none' }}>
          <button
            onClick={() => onDelete(node._key)}
            title="Delete"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--card-muted-fg-color)', padding: '6px 8px', lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--card-critical-fg-color, #e53e3e)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--card-muted-fg-color)')}
          >✕</button>
        </td>
      </tr>

      {/* Inline note row */}
      {noteIsOpen && (
        <tr style={{ background: 'rgba(59,130,246,0.04)' }}>
          <td colSpan={9} style={{ ...TD, padding: '8px 12px 10px', borderRight: 'none' }}>
            <Flex gap={2} align="flex-start">
              <Text size={1} muted style={{ paddingTop: 7, flexShrink: 0, width: 52 }}>📝 Note</Text>
              <textarea
                rows={2}
                style={{
                  ...INPUT, flex: 1, resize: 'vertical', lineHeight: '1.5',
                  border: '1px solid var(--card-border-color)', borderRadius: 4,
                  padding: '6px 10px', background: 'var(--card-bg-color)',
                }}
                value={node.notes}
                placeholder="Add notes, policies, or comments for this account (e.g. depreciation method, useful life…)"
                ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                onChange={e => {
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                  onUpdate(node._key, 'notes', e.target.value)
                }}
              />
            </Flex>
          </td>
        </tr>
      )}

      {/* Children */}
      {!isCollapsed && node.children.map(child => (
        <TreeRow key={child._key} node={child} collapsed={collapsed}
          translating={translating} notesOpen={notesOpen} keyToNo={keyToNo} onToggle={onToggle} onUpdate={onUpdate}
          onAddChild={onAddChild} onDelete={onDelete} onTranslate={onTranslate} onToggleNote={onToggleNote} />
      ))}
    </>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AccountCodeTreeView({
  options,
  document: doc,
}: {
  options?:  { accountType?: string }
  document?: { displayed?: any }
}) {
  const docId      = doc?.displayed?._id?.replace(/^drafts\./, '') ?? ''
  const typeFromId = docId.replace('accountCode-group-', '')
  const accountType = options?.accountType ?? doc?.displayed?.groupType
    ?? (typeFromId in TYPE_META ? typeFromId : undefined)
  const meta = accountType ? TYPE_META[accountType] : null

  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()

  const [nodes,       setNodes]       = useState<FlatNode[]>([])
  const [collapsed,   setCollapsed]   = useState<Set<string>>(new Set())
  const [notesOpen,   setNotesOpen]   = useState<Set<string>>(new Set())
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')
  const [saved,       setSaved]       = useState(false)
  const [translating, setTranslating] = useState<Set<string>>(new Set()) // `${key}-th` or `${key}-en`
  const [exporting,   setExporting]   = useState(false)
  const [importInfo,  setImportInfo]  = useState<{ added: number; updated: number } | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const filter = accountType
        ? `_type == "accountCode" && !(_id in path("drafts.**")) && type == "${accountType}"`
        : `_type == "accountCode" && !(_id in path("drafts.**"))`
      const data = await client.fetch<any[]>(
        `*[${filter}] | order(code asc) {
           _id, code, nameTh, nameEn, normalBalance, type, sortKey, isParent,
           "parentId": parentCode._ref,
           "notes": description
         }`
      )

      // Auto-migrate: silently write sortKey for any record that is missing it
      const needsMigration = data.filter(d => !d.sortKey && d.code && d.type)
      if (needsMigration.length > 0) {
        await Promise.all(needsMigration.map(d => {
          const pfx     = GROUP_PREFIX[d.type as string] ?? ''
          const sortKey = pfx + (d.code as string).trim().padStart(8, '0')
          return client.patch(d._id as string).set({ sortKey }).commit()
        }))
      }

      // Auto-detect parents: any _id that appears as a parentId in another node
      const parentIdSet = new Set((data ?? []).map(d => d.parentId).filter(Boolean))

      // Auto-patch accounts whose isParent flag is out of sync with reality
      const needsIsParentFix = (data ?? []).filter(d => {
        const shouldBeParent = parentIdSet.has(d._id)
        return shouldBeParent !== (d.isParent ?? false)
      })
      if (needsIsParentFix.length > 0) {
        await Promise.all(needsIsParentFix.map(d =>
          client.patch(d._id as string).set({ isParent: parentIdSet.has(d._id) }).commit()
        ))
      }

      setNodes((data ?? []).map(d => ({
        _key:                 uid(),
        _id:                  d._id,
        parentId:             d.parentId,
        code:                 d.code                ?? '',
        nameTh:               d.nameTh              ?? '',
        nameEn:               d.nameEn              ?? '',
        normalBalance:        d.normalBalance        ?? '',
        type:                 d.type                ?? accountType ?? '',
        notes:                d.notes               ?? '',
        isParent:             parentIdSet.has(d._id),
        dirty:                false,
        markedDelete:         false,
      })))
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [client, accountType])

  useEffect(() => { load() }, [load])

  // ── Mutations ─────────────────────────────────────────────────────────────

  const updateNode = (key: string, field: keyof FlatNode, value: string | boolean) => {
    setNodes(prev => prev.map(n => n._key === key ? { ...n, [field]: value, dirty: true } : n))
    setSaved(false)
  }

  const addRoot = () => {
    setNodes(prev => [...prev, blankNode({
      type:          accountType ?? '',
      normalBalance: meta?.normalBalance ?? '',
    })])
    setSaved(false)
  }

  const addChild = (parentKey: string, parentId?: string) => {
    const parent = nodes.find(n => n._key === parentKey)
    setNodes(prev => [...prev, blankNode({
      parentKey:     parentId ? undefined : parentKey,
      parentId:      parentId,
      type:          accountType ?? parent?.type ?? '',
      normalBalance: meta?.normalBalance ?? parent?.normalBalance ?? '',
    })])
    // expand parent
    setCollapsed(prev => { const s = new Set(prev); s.delete(parentKey); return s })
    setSaved(false)
  }

  const deleteNode = (key: string) => {
    setNodes(prev => prev.map(n => n._key === key ? { ...n, markedDelete: true, dirty: true } : n))
    setSaved(false)
  }

  // ── Translate ─────────────────────────────────────────────────────────────

  const translate = useCallback(async (key: string, from: 'th' | 'en') => {
    const node = nodes.find(n => n._key === key)
    if (!node) return
    const sourceText = from === 'th' ? node.nameTh : node.nameEn
    if (!sourceText.trim()) return

    const tKey = `${key}-${from}`
    setTranslating(prev => new Set(prev).add(tKey))
    try {
      const result = await translateText(sourceText, from)
      const targetField = from === 'th' ? 'nameEn' : 'nameTh'
      setNodes(prev => prev.map(n =>
        n._key === key ? { ...n, [targetField]: result, dirty: true } : n
      ))
      setSaved(false)
    } catch (e: any) {
      setError(e?.message ?? 'Translation failed')
    } finally {
      setTranslating(prev => { const s = new Set(prev); s.delete(tKey); return s })
    }
  }, [nodes])

  const translateAllEmpty = useCallback(async () => {
    const toTranslate = nodes.filter(n =>
      !n.markedDelete && (
        (n.nameTh.trim() && !n.nameEn.trim()) ||
        (n.nameEn.trim() && !n.nameTh.trim())
      )
    )
    for (const n of toTranslate) {
      const from: 'th' | 'en' = n.nameTh.trim() && !n.nameEn.trim() ? 'th' : 'en'
      await translate(n._key, from)
    }
  }, [nodes, translate])

  // ── Export ────────────────────────────────────────────────────────────────

  const exportCurrent = () => {
    const idToCode   = new Map(nodes.filter(n => n._id).map(n => [n._id!, n.code]))
    const exportFlat = flatten(buildTree(nodes))
    const rows = exportFlat.map(n => [
      n.code,
      n.nameTh,
      n.nameEn,
      n.normalBalance,
      n.parentId ? (idToCode.get(n.parentId) ?? '') : '',
      n.notes,
    ])
    const label = accountType ?? 'group'
    triggerDownload(
      buildCsvBlob(CSV_HEADERS, rows),
      `account-codes-${label}-${new Date().toISOString().slice(0, 10)}.csv`,
    )
  }

  const exportAll = async () => {
    setExporting(true); setError('')
    try {
      const groups = ['asset', 'liability', 'equity', 'revenue', 'expense'] as const
      const allRows: string[][] = []

      for (const g of groups) {
        const pfx  = GROUP_PREFIX[g]
        const data = await client.fetch<any[]>(
          `*[_type == "accountCode" && !(_id in path("drafts.**")) && type == "${g}"] | order(code asc) {
             _id, code, nameTh, nameEn, normalBalance,
             "parentId": parentCode._ref,
             "notes": description
           }`
        )
        const idToCode = new Map(data.map(d => [d._id as string, d.code as string]))
        for (const d of data) {
          allRows.push([
            pfx + (d.code ?? ''),
            d.nameTh        ?? '',
            d.nameEn        ?? '',
            d.normalBalance ?? '',
            d.parentId ? pfx + (idToCode.get(d.parentId) ?? '') : '',
            d.notes         ?? '',
            g,
          ])
        }
      }

      // Sort by full code then re-number
      allRows.sort((a, b) => a[0].localeCompare(b[0]))
      triggerDownload(
        buildCsvBlob(CSV_HEADERS_ALL, allRows),
        `account-codes-all-${new Date().toISOString().slice(0, 10)}.csv`,
      )
    } catch (e: any) {
      setError(e?.message ?? 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // allow re-importing same file
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const rows = parseCsvText(ev.target?.result as string)
        if (!rows.length) { setError('CSV appears empty or has no data rows.'); return }

        const pfx   = accountType ? (GROUP_PREFIX[accountType] ?? '') : ''
        // Strip group prefix from a code string if it starts with this group's digit
        const strip = (code: string) =>
          pfx && code.startsWith(pfx) ? code.slice(pfx.length) : code

        const getCol = (row: Record<string, string>, ...keys: string[]) => {
          for (const k of keys) if (row[k] !== undefined) return row[k]
          return ''
        }

        // Build lookup: stripped code → existing node
        const codeToExisting = new Map(nodes.map(n => [n.code, n]))

        // First pass: collect all imported codes + keys (for parent resolution)
        const importedCodeToKey = new Map<string, string>()

        // Update existing nodes
        let updatedCount = 0
        const updatedNodes = nodes.map(n => {
          const row = rows.find(r => strip(getCol(r, 'Account Code', 'code', 'Code').trim()) === n.code)
          if (!row) return n
          updatedCount++
          return {
            ...n,
            nameTh:        getCol(row, 'Account Name (Thai)', 'Name (Thai)', 'nameTh')   || n.nameTh,
            nameEn:        getCol(row, 'Account Name (English)', 'Name (English)', 'nameEn') || n.nameEn,
            normalBalance: getCol(row, 'Normal Balance', 'normalBalance').toLowerCase() || n.normalBalance,
            notes:         getCol(row, 'Notes', 'notes')                                || n.notes,
            dirty: true,
          }
        })

        // Second pass: create new nodes
        const newNodes: FlatNode[] = []
        for (const row of rows) {
          const rawCode = getCol(row, 'Account Code', 'code', 'Code').trim()
          if (!rawCode) continue
          const code = strip(rawCode)
          if (codeToExisting.has(code)) continue // already updated above
          const node = blankNode({
            code,
            nameTh:        getCol(row, 'Account Name (Thai)', 'Name (Thai)', 'nameTh'),
            nameEn:        getCol(row, 'Account Name (English)', 'Name (English)', 'nameEn'),
            normalBalance: getCol(row, 'Normal Balance', 'normalBalance').toLowerCase(),
            notes:         getCol(row, 'Notes', 'notes'),
            type:          accountType ?? '',
          })
          importedCodeToKey.set(code, node._key)
          newNodes.push(node)
        }

        // Third pass: resolve parent codes for new nodes
        const resolvedNew = newNodes.map(n => {
          const row = rows.find(r => strip(getCol(r, 'Account Code', 'code', 'Code').trim()) === n.code)
          const rawParent = getCol(row ?? {}, 'Parent Code', 'parentCode', 'parent').trim()
          if (!rawParent) return n
          const parentCode = strip(rawParent)
          const existing   = updatedNodes.find(x => x.code === parentCode)
          if (existing) return { ...n, parentId: existing._id, parentKey: undefined }
          const newKey = importedCodeToKey.get(parentCode)
          if (newKey) return { ...n, parentKey: newKey, parentId: undefined }
          return n
        })

        setNodes([...updatedNodes, ...resolvedNew])
        setImportInfo({ added: newNodes.length, updated: updatedCount })
        setSaved(false)
      } catch (e: any) {
        setError(e?.message ?? 'Import failed')
      }
    }
    reader.readAsText(file, 'UTF-8')
  }

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const toggleNote = (key: string) => {
    setNotesOpen(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const save = async () => {
    setSaving(true); setError(''); setSaved(false)

    // Build a map from _key → _id for resolving new parent references
    const keyToId = new Map<string, string>()
    nodes.filter(n => n._id).forEach(n => keyToId.set(n._key, n._id!))

    // Auto-assign `no` based on depth-first display order across the full tree
    const keyToNo = new Map<string, number>(
      flatten(buildTree(nodes)).map((n, i) => [n._key, i + 1])
    )

    const toDelete = nodes.filter(n => n.markedDelete && n._id)
    const toCreate = nodes.filter(n => !n._id && !n.markedDelete && n.code.trim())
    const toUpdate = nodes.filter(n => n._id && n.dirty && !n.markedDelete)

    // Collect any failed ledger auto-creates so we can warn the user after save
    // without rolling back the corresponding accountCode.
    const ledgerFailures: { code: string; reason: string }[] = []

    try {
      // Create new nodes first (to get their IDs for child references)
      for (const n of toCreate) {
        const parentRef = n.parentId
          ? { _type: 'reference', _ref: n.parentId, _weak: true }
          : n.parentKey && keyToId.has(n.parentKey)
            ? { _type: 'reference', _ref: keyToId.get(n.parentKey), _weak: true }
            : undefined

        const effectiveType = n.type || accountType || ''
        const prefix        = GROUP_PREFIX[effectiveType] ?? ''
        const sortKey       = prefix && n.code.trim()
          ? prefix + n.code.trim().padStart(8, '0')
          : undefined

        const doc = await client.create({
          _type:                'accountCode',
          no:                   keyToNo.get(n._key),
          code:                 n.code.trim(),
          nameTh:               n.nameTh.trim()       || undefined,
          nameEn:               n.nameEn.trim()       || undefined,
          normalBalance:        n.normalBalance       || undefined,
          type:                 effectiveType         || undefined,
          description:          n.notes.trim()        || undefined,
          isParent:             n.isParent            || undefined,
          sortKey,
          ...(parentRef ? { parentCode: parentRef } : {}),
        })
        keyToId.set(n._key, doc._id)

        // Auto-create paired ledger doc so the new accountCode appears
        // immediately in General Ledger and Financial Statements — both query
        // *[_type == "ledger"] for their account list. Failure here doesn't
        // roll back the accountCode; user gets a warning toast with the codes
        // and the recovery command (scripts/seed-ledgers.mjs).
        try {
          await client.create({
            _type:       'ledger',
            accountCode: { _type: 'reference', _ref: doc._id, _weak: true },
          })
        } catch (e: any) {
          ledgerFailures.push({ code: n.code, reason: e?.message ?? 'unknown' })
        }
      }

      await Promise.all([
        ...toDelete.map(n => client.delete(n._id!)),
        ...toUpdate.map(n => {
          const parentRef = n.parentId
            ? { _type: 'reference', _ref: n.parentId, _weak: true }
            : n.parentKey && keyToId.has(n.parentKey)
              ? { _type: 'reference', _ref: keyToId.get(n.parentKey), _weak: true }
              : undefined
          const effectiveType = n.type || accountType || ''
          const prefix        = GROUP_PREFIX[effectiveType] ?? ''
          const sortKey       = prefix && n.code.trim()
            ? prefix + n.code.trim().padStart(8, '0')
            : undefined

          return client.patch(n._id!).set({
            no:                   keyToNo.get(n._key),
            code:                 n.code.trim(),
            nameTh:               n.nameTh.trim()       || undefined,
            nameEn:               n.nameEn.trim()       || undefined,
            normalBalance:        n.normalBalance       || undefined,
            type:                 effectiveType         || undefined,
            description:          n.notes.trim()        || undefined,
            isParent:             n.isParent            || false,
            sortKey,
            ...(parentRef !== undefined ? { parentCode: parentRef } : {}),
          }).commit()
        }),
      ])

      setSaved(true)

      if (ledgerFailures.length > 0) {
        toast.push({
          status:      'warning',
          title:       `${ledgerFailures.length} ledger doc${ledgerFailures.length > 1 ? 's' : ''} failed to create`,
          description: `Affected accounts: ${ledgerFailures.map(f => f.code).join(', ')}. Run scripts/seed-ledgers.mjs to backfill.`,
          duration:    8000,
        })
      }

      await load()
    } catch (e: any) {
      setError(e?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <Flex align="center" justify="center" style={{ height: 300 }}>
      <Spinner muted /><Box marginLeft={3}><Text muted size={1}>Loading…</Text></Box>
    </Flex>
  )

  const tree        = buildTree(nodes)
  const flatVisible = flatten(tree)
  const keyToNo     = new Map<string, number>(flatVisible.map((n, i) => [n._key, i + 1]))
  const dirtyCount  = nodes.filter(n => n.dirty && !n.markedDelete && (n._id || n.code.trim())).length
  const deleteCount  = nodes.filter(n => n.markedDelete && n._id).length
  const deletedNodes = nodes.filter(n => n.markedDelete)

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>

      {/* Toolbar */}
      <Flex align="center" gap={2} padding={3}
        style={{ borderBottom: '1px solid var(--card-border-color)', flexShrink: 0, flexWrap: 'wrap' }}>
        <Text size={2} weight="semibold">
          {meta ? `Account Codes — ${meta.label}` : 'Account Codes'}
        </Text>
        <Badge mode="outline" tone="default">{flatVisible.length} accounts</Badge>
        {dirtyCount  > 0 && <Badge mode="outline" tone="caution">{dirtyCount} unsaved</Badge>}
        {deleteCount > 0 && <Badge mode="outline" tone="critical">{deleteCount} to delete</Badge>}
        {saved && <Badge mode="outline" tone="positive">Saved ✓</Badge>}
        <Box style={{ flex: 1 }} />

        {/* Import */}
        <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
          onChange={handleImportFile} />
        <Button text="📥 Import CSV" mode="ghost"
          onClick={() => importRef.current?.click()} />

        {/* Export */}
        <Button text="📤 Export" mode="ghost"
          disabled={flatVisible.length === 0}
          onClick={exportCurrent} />
        <Button text={exporting ? 'Exporting…' : '📤 Export All Groups'} mode="ghost"
          disabled={exporting}
          onClick={exportAll} />

        <Button text="🌐 Translate All Empty" mode="ghost"
          disabled={translating.size > 0}
          onClick={translateAllEmpty} />
        <Button text="+ Add Root Account" tone="primary" mode="ghost" onClick={addRoot} />
        <Button text={saving ? 'Saving…' : 'Save All'} tone="positive"
          disabled={saving || (dirtyCount === 0 && deleteCount === 0)} onClick={save} />
      </Flex>

      {/* Import result banner */}
      {importInfo && (
        <Card tone="primary" padding={3} margin={3} radius={2} border>
          <Flex align="center" gap={3}>
            <Text size={1}>
              Import preview ready —{' '}
              <strong>{importInfo.added}</strong> new account{importInfo.added !== 1 ? 's' : ''},{' '}
              <strong>{importInfo.updated}</strong> updated.
              Review below then click <strong>Save All</strong> to commit.
            </Text>
            <Box style={{ flex: 1 }} />
            <button
              onClick={() => setImportInfo(null)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--card-muted-fg-color)', fontSize: 16 }}
            >✕</button>
          </Flex>
        </Card>
      )}

      {error && (
        <Card tone="critical" padding={3} margin={3} radius={2} border>
          <Text size={1}>{error}</Text>
        </Card>
      )}

      {/* Tree table */}
      <Box style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 52 }}>No.</th>
              <th style={{ ...TH, width: 35 }}>Account Code</th>
              <th style={{ ...TH, width: 150 }}>Account Name (Thai)</th>
              <th style={{ ...TH, width: 150 }}>Account Name (English)</th>
              <th style={{ ...TH, width: 110 }}>Normal Balance</th>
              <th style={{ ...TH, width: 36 }} title="Header account — has sub-accounts, cannot post transactions directly">Header</th>
              <th style={{ ...TH, width: 36 }} title="Notes">💬</th>
              <th style={{ ...TH, width: 36 }} title="Add child"></th>
              <th style={{ ...TH, width: 36, borderRight: 'none' }} title="Delete"></th>
            </tr>
          </thead>
          <tbody>
            {tree.map(node => (
              <TreeRow key={node._key} node={node} collapsed={collapsed}
                translating={translating} notesOpen={notesOpen} keyToNo={keyToNo} onToggle={toggleCollapse} onUpdate={updateNode}
                onAddChild={addChild} onDelete={deleteNode} onTranslate={translate} onToggleNote={toggleNote} />
            ))}

            {/* Pending deletes at bottom */}
            {deletedNodes.map(n => (
              <tr key={n._key} style={{ opacity: 0.35 }}>
                <td colSpan={6} style={{ ...TD, borderRight: 'none' }}>
                  <Text size={1} muted style={{ padding: '7px 10px', display: 'block', textDecoration: 'line-through' }}>
                    {[n.code, n.nameTh || n.nameEn].filter(Boolean).join('  ·  ')}
                  </Text>
                </td>
                <td colSpan={3} style={{ ...TD, borderRight: 'none', textAlign: 'center' }}>
                  <button onClick={() => setNodes(p => p.map(x => x._key === n._key ? { ...x, markedDelete: false, dirty: true } : x))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--card-muted-fg-color)', padding: '6px', fontSize: 12 }}>
                    ↩ undo
                  </button>
                </td>
              </tr>
            ))}

            {/* Add root row */}
            <tr>
              <td colSpan={9} style={{ padding: '6px 10px', borderBottom: 'none' }}>
                <button onClick={addRoot}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--card-muted-fg-color)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--card-fg-color)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--card-muted-fg-color)')}>
                  + Add root account
                </button>
              </td>
            </tr>
          </tbody>
        </table>

        {flatVisible.length === 0 && !loading && (
          <Card padding={4} margin={4} radius={2} border tone="caution">
            <Text size={1} muted>No accounts yet. Click "+ Add Root Account" to start.</Text>
          </Card>
        )}
      </Box>
    </Box>
  )
}
