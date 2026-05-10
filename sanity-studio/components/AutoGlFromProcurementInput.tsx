/**
 * AutoGlFromProcurementInput
 *
 * GL Account field for Asset Registration.
 * When sourceProcurement is set → auto-fills from Procurement's GL Account.
 * When sourcePayment is set     → auto-fills from Payment's GL Account.
 * Neither set                   → free dropdown (asset / intangible accounts).
 *
 * Read-only display + ✏️ pencil to override · ↩ undo to revert.
 * Override state survives page reload.
 */

import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { set, unset, useClient, useFormValue }              from 'sanity'
import { Autocomplete, Box, Flex, Text, Spinner, Button }   from '@sanity/ui'
import { EditIcon, UndoIcon }                               from '@sanity/icons'

interface AccountOption {
  value:  string
  code:   string
  name:   string
  nameEn: string
}

const SOURCE_GL_QUERY = `coalesce(
  *[_id == ("drafts." + $id)][0].accountCode._ref,
  *[_id == $id][0].accountCode._ref
)`

const ACCOUNTS_QUERY = `*[_type == "accountCode"
    && !(_id in path("drafts.**"))
    && type == "asset"
    && isActive != false
    && normalBalance != "credit"
    && defined(parentCode._ref)
    && !(_id in *[_type == "accountCode" && defined(parentCode._ref)].parentCode._ref)
    && (
      parentCode->code in ["115000", "116000"]
      || parentCode->parentCode->code in ["115000", "116000"]
      || parentCode->parentCode->parentCode->code in ["115000", "116000"]
    )
  ] | order(sortKey asc) { _id, code, nameTh, nameEn, sortKey }`

export function AutoGlFromProcurementInput(props: any) {
  const { value, onChange, readOnly, elementProps } = props
  const client  = useClient({ apiVersion: '2024-01-01' })
  const inputId = useId()

  const costSources = useFormValue(['costSources']) as Array<{_ref?: string}> | undefined
  const sourceRef   = costSources?.[0]?._ref ?? null

  const [options,     setOptions]     = useState<AccountOption[]>([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [autoGlRef,   setAutoGlRef]   = useState<string | null>(null)
  const [isOverride,  setIsOverride]  = useState(false)
  const [initialized, setInitialized] = useState(false)
  const cancelRef = useRef<boolean>(false)

  // ── Fetch dropdown options ────────────────────────────────────────────────
  useEffect(() => {
    client.fetch<any[]>(ACCOUNTS_QUERY)
      .then(data => setOptions(
        data
          .sort((a, b) => {
            const ka = a.sortKey ?? (a.code ?? '').padStart(10, '0')
            const kb = b.sortKey ?? (b.code ?? '').padStart(10, '0')
            return ka < kb ? -1 : ka > kb ? 1 : 0
          })
          .map(d => ({
            value:  d._id as string,
            code:   d.code as string ?? '',
            name:   (d.nameTh ?? d.nameEn ?? '') as string,
            nameEn: (d.nameEn ?? '') as string,
          }))
      ))
      .catch(e => setError(e?.message ?? 'Failed to load accounts'))
      .finally(() => setLoading(false))
  }, [client])

  // ── Helper: fetch expected auto-GL from whichever source is linked ────────
  const fetchExpectedGl = useCallback(async (): Promise<string | null> => {
    if (!sourceRef) return null
    return client.fetch<string | null>(SOURCE_GL_QUERY, { id: sourceRef }).catch(() => null)
  }, [sourceRef, client])

  // ── On mount: detect override OR apply auto-fill if no value saved yet ───
  useEffect(() => {
    cancelRef.current = false
    fetchExpectedGl().then(ref => {
      if (cancelRef.current) return
      setAutoGlRef(ref)
      if (ref && value?._ref && ref !== value._ref) {
        setIsOverride(true)
      } else if (ref && !value?._ref) {
        onChange(set({ _type: 'reference', _ref: ref, _weak: true }))
      }
      setInitialized(true)
    })
    return () => { cancelRef.current = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — mount only

  // ── Re-fetch auto-GL when source changes ──────────────────────────────────
  useEffect(() => {
    if (!initialized) return
    cancelRef.current = false

    fetchExpectedGl().then(ref => {
      if (cancelRef.current) return
      setAutoGlRef(ref)

      if (isOverride) return

      if (ref) {
        onChange(set({ _type: 'reference', _ref: ref, _weak: true }))
      } else {
        onChange(unset())
      }
    })
    return () => { cancelRef.current = true }
  }, [sourceRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset override when source changes ────────────────────────────────────
  useEffect(() => {
    if (!initialized) return
    setIsOverride(false)
  }, [sourceRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((id: string | null) => {
    onChange(id ? set({ _type: 'reference', _ref: id, _weak: true }) : unset())
  }, [onChange])

  const handleUndo = useCallback(() => {
    setIsOverride(false)
    if (autoGlRef) onChange(set({ _type: 'reference', _ref: autoGlRef, _weak: true }))
    else           onChange(unset())
  }, [autoGlRef, onChange])

  const showReadOnly = !!sourceRef && !isOverride
  const undoTitle    = 'Reset to source GL account'
  const emptyLabel   = 'No GL account set on linked source'

  // ── Loading / error ───────────────────────────────────────────────────────
  if (loading) return (
    <Flex align="center" gap={2} padding={2}>
      <Spinner muted />
      <Text muted size={1}>Loading accounts…</Text>
    </Flex>
  )
  if (error) return (
    <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>{error}</Text>
  )

  // ── Read-only display (auto-filled from source) ───────────────────────────
  if (showReadOnly) {
    const selected = options.find(o => o.value === value?._ref)

    return (
      <Flex align="center" gap={2}>
        <Box flex={1} padding={3} style={{
          background:   'var(--card-code-bg-color)',
          border:       '1px solid var(--card-border-color)',
          borderRadius: 3,
        }}>
          {selected ? (
            <Flex gap={3} align="center">
              <Text size={1} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {selected.code}
              </Text>
              <Text muted size={1}>{selected.name}</Text>
            </Flex>
          ) : (
            <Text muted size={1} style={{ fontStyle: 'italic' }}>{emptyLabel}</Text>
          )}
        </Box>
        <Button
          icon={EditIcon}
          mode="bleed"
          tone="default"
          padding={2}
          title="Override manually"
          onClick={() => setIsOverride(true)}
          disabled={readOnly}
        />
      </Flex>
    )
  }

  // ── Free dropdown (no source, or manual override) ─────────────────────────
  return (
    <Flex align="center" gap={2}>
      <Box flex={1}>
        <Autocomplete
          {...elementProps}
          id={inputId}
          disabled={readOnly}
          openButton
          options={options}
          value={value?._ref ?? null}
          placeholder="Search fixed / intangible asset account…"
          onChange={handleChange}
          renderValue={(val, opt) => opt ? `${opt.code}  ·  ${opt.name}` : val}
          renderOption={(opt: AccountOption) => (
            <Box padding={3}>
              <Text size={1} style={{ fontFamily: 'monospace', fontWeight: 600 }}>{opt.code}</Text>
              <Text muted size={0} style={{ marginTop: 2 }}>{opt.name}</Text>
              {opt.nameEn ? <Text muted size={0} style={{ marginTop: 1 }}>{opt.nameEn}</Text> : null}
            </Box>
          )}
          filterOption={(query: string, opt: AccountOption) =>
            `${opt.code} ${opt.name} ${opt.nameEn}`.toLowerCase().includes(query.toLowerCase())
          }
        />
      </Box>
      {sourceRef && isOverride && (
        <Button
          icon={UndoIcon}
          mode="bleed"
          tone="caution"
          padding={2}
          title={undoTitle}
          onClick={handleUndo}
          disabled={readOnly}
        />
      )}
    </Flex>
  )
}
