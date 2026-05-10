/**
 * AutoApAccountInput
 *
 * Auto-fills the Accounts Payable GL account field with the default AP account
 * (code 212000) on mount. Shows a read-only display with an override button
 * (pencil) so the user can manually pick a different liability account when needed.
 *
 * Override state survives page reload: if the saved ref differs from the default
 * AP account, override mode is restored on mount.
 */

import { useState, useEffect, useCallback, useId } from 'react'
import { set, unset, useClient }                    from 'sanity'
import { Autocomplete, Box, Flex, Text, Spinner, Button } from '@sanity/ui'
import { EditIcon, UndoIcon }                       from '@sanity/icons'

const DEFAULT_AP_CODE = '212000'

// Draft-aware fetch of the default AP account id
const DEFAULT_AP_QUERY = `
  *[_type == "accountCode" && code == $code && !(_id in path("drafts.**"))][0]._id
`

// All leaf liability accounts for the override dropdown
const LIABILITY_QUERY = `
  *[_type == "accountCode"
    && !(_id in path("drafts.**"))
    && type == "liability"
    && isActive != false
    && !(_id in *[_type == "accountCode" && defined(parentCode._ref)].parentCode._ref)
  ] | order(sortKey asc) { _id, code, nameTh, nameEn, sortKey }
`

interface AccountOption {
  value:  string
  code:   string
  name:   string
  nameEn: string
}

export function AutoApAccountInput(props: any) {
  const { value, onChange, readOnly, elementProps } = props
  const client  = useClient({ apiVersion: '2024-01-01' })
  const inputId = useId()

  const [defaultApId, setDefaultApId] = useState<string | null>(null)
  const [options,     setOptions]     = useState<AccountOption[]>([])
  const [loading,     setLoading]     = useState(true)
  const [isOverride,  setIsOverride]  = useState(false)

  // On mount: fetch default AP account + all liability accounts for dropdown
  useEffect(() => {
    Promise.all([
      client.fetch<string | null>(DEFAULT_AP_QUERY, { code: DEFAULT_AP_CODE }),
      client.fetch<any[]>(LIABILITY_QUERY),
    ]).then(([apId, accounts]) => {
      setDefaultApId(apId)
      setOptions(
        accounts.map(d => ({
          value:  d._id,
          code:   d.code ?? '',
          name:   d.nameTh ?? d.nameEn ?? '',
          nameEn: d.nameEn ?? '',
        }))
      )

      if (apId) {
        if (!value?._ref) {
          // No value saved yet — auto-fill with default AP
          onChange(set({ _type: 'reference', _ref: apId, _weak: true }))
        } else if (value._ref !== apId) {
          // Saved value differs from default — was manually overridden
          setIsOverride(true)
        }
      }
    })
    .catch(() => {})
    .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = useCallback(() => {
    setIsOverride(false)
    if (defaultApId) onChange(set({ _type: 'reference', _ref: defaultApId, _weak: true }))
    else             onChange(unset())
  }, [defaultApId, onChange])

  const handleChange = useCallback((id: string | null) => {
    onChange(id ? set({ _type: 'reference', _ref: id, _weak: true }) : unset())
  }, [onChange])

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text muted size={1}>Loading AP account…</Text>
      </Flex>
    )
  }

  // Read-only display when auto-filled and not overridden
  if (!isOverride) {
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
              {selected.nameEn && <Text muted size={1}>· {selected.nameEn}</Text>}
            </Flex>
          ) : (
            <Text muted size={1} style={{ fontStyle: 'italic' }}>
              {defaultApId
                ? 'Loading…'
                : `⚠ No account with code ${DEFAULT_AP_CODE} found — check Chart of Accounts`}
            </Text>
          )}
        </Box>
        <Button
          icon={EditIcon}
          mode="bleed"
          tone="default"
          padding={2}
          title="Override — pick a different AP account"
          onClick={() => setIsOverride(true)}
          disabled={readOnly}
        />
      </Flex>
    )
  }

  // Override mode — free dropdown of all liability accounts
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
          placeholder="Search liability account…"
          onChange={handleChange}
          renderValue={(val, opt) => opt ? `${opt.code}  ·  ${opt.name}` : val}
          renderOption={(opt: AccountOption) => (
            <Box padding={3}>
              <Text size={1} style={{ fontFamily: 'monospace', fontWeight: 600 }}>{opt.code}</Text>
              <Text muted size={0} style={{ marginTop: 2 }}>{opt.name}</Text>
              {opt.nameEn && <Text muted size={0} style={{ marginTop: 1 }}>{opt.nameEn}</Text>}
            </Box>
          )}
          filterOption={(query: string, opt: AccountOption) =>
            `${opt.code} ${opt.name} ${opt.nameEn}`.toLowerCase().includes(query.toLowerCase())
          }
        />
      </Box>
      <Button
        icon={UndoIcon}
        mode="bleed"
        tone="caution"
        padding={2}
        title="Reset to default AP account (212000)"
        onClick={handleUndo}
        disabled={readOnly}
      />
    </Flex>
  )
}
