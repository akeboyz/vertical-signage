/**
 * GlAccountInput
 *
 * Custom reference input for GL Account fields.
 * Fetches account codes via GROQ with explicit order(sortKey asc) so the
 * dropdown is always sorted by account code number — regardless of Sanity's
 * default reference picker ordering.
 *
 * Usage:
 *   makeGlAccountInput(['asset', 'expense', 'liability'])
 *
 * With parent restriction (descendants of specific accounts only):
 *   makeGlAccountInput(['asset'], { parentCodes: ['15000', '16000'] })
 *   — parentCodes are the STORED codes (without type prefix), up to 3 levels deep.
 */

import { useEffect, useState, useCallback, useId } from 'react'
import { set, unset, useClient }                   from 'sanity'
import { Autocomplete, Box, Flex, Text, Spinner }  from '@sanity/ui'

const GROUP_PREFIX: Record<string, string> = {
  asset:     '1',
  liability: '2',
  equity:    '3',
  revenue:   '4',
  expense:   '5',
}

interface AccountOption {
  value:  string   // _id
  code:   string   // full display code  e.g. "115101"
  name:   string   // Thai name
  nameEn: string   // English name
}

interface GlAccountInputOptions {
  parentCodes?:       string[]  // restrict ALL types to these parent codes (stored, no prefix)
  assetParentCodes?:  string[]  // restrict only asset-type accounts to these parent codes;
                                // other types remain unrestricted — e.g. expenses free, assets under 115000/116000
  allowCreditBalance?: boolean  // include credit-normal-balance accounts (needed for revenue/income types)
}

function buildAncestryClause(codes: string[]): string {
  const codeList = codes.map(c => `"${c}"`).join(', ')
  return [
    `parentCode->code in [${codeList}]`,
    `parentCode->parentCode->code in [${codeList}]`,
    `parentCode->parentCode->parentCode->code in [${codeList}]`,
  ].join(' || ')
}

export function makeGlAccountInput(filterTypes: string[], options?: GlAccountInputOptions) {
  const typeList         = filterTypes.map(t => `"${t}"`).join(', ')
  const parentCodes      = options?.parentCodes
  const assetParentCodes = options?.assetParentCodes
  const creditBalanceFilter = options?.allowCreditBalance ? '' : '&& normalBalance != "credit"'

  // All-type ancestry filter (existing behaviour)
  const ancestryFilter = parentCodes?.length
    ? `&& defined(parentCode._ref) && (${buildAncestryClause(parentCodes)})`
    : null

  // Asset-only ancestry filter — other types bypass it
  const assetAncestryFilter = assetParentCodes?.length
    ? `&& (type != "asset" || (defined(parentCode._ref) && (${buildAncestryClause(assetParentCodes)})))`
    : null

  function GlAccountInput(props: any) {
    const { value, onChange, readOnly, elementProps } = props
    const client  = useClient({ apiVersion: '2024-01-01' })
    const inputId = useId()

    const [options, setOptions] = useState<AccountOption[]>([])
    const [loading, setLoading] = useState(true)
    const [error,   setError]   = useState('')

    useEffect(() => {
      const query = `*[_type == "accountCode"
          && !(_id in path("drafts.**"))
          && type in [${typeList}]
          && isActive != false
          && !(_id in *[_type == "accountCode" && defined(parentCode._ref)].parentCode._ref)
          ${creditBalanceFilter}
          ${ancestryFilter      ?? ''}
          ${assetAncestryFilter ?? ''}
        ] | order(sortKey asc) {
          _id, code, nameTh, nameEn, type, sortKey
        }`

      client.fetch<any[]>(query)
        .then(data => {
          setOptions(
            data
              .sort((a, b) => {
                // Fallback client-side sort in case sortKey is missing
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
          )
        })
        .catch(e => setError(e?.message ?? 'Failed to load accounts'))
        .finally(() => setLoading(false))
    }, [client])

    const handleChange = useCallback((selectedId: string | null) => {
      onChange(selectedId
        ? set({ _type: 'reference', _ref: selectedId, _weak: true })
        : unset()
      )
    }, [onChange])

    if (loading) return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text muted size={1}>Loading accounts…</Text>
      </Flex>
    )

    if (error) return (
      <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>{error}</Text>
    )

    return (
      <Autocomplete
        {...elementProps}
        id={inputId}
        disabled={readOnly}
        openButton
        options={options}
        value={value?._ref ?? null}
        placeholder="Search account code or name…"
        onChange={handleChange}
        renderValue={(val, opt) => opt ? `${opt.code}  ·  ${opt.name}` : val}
        renderOption={(opt: AccountOption) => (
          <Box padding={3}>
            <Text size={1} style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {opt.code}
            </Text>
            <Text muted size={0} style={{ marginTop: 2 }}>
              {opt.name}
            </Text>
            {opt.nameEn ? (
              <Text muted size={0} style={{ marginTop: 1 }}>
                {opt.nameEn}
              </Text>
            ) : null}
          </Box>
        )}
        filterOption={(query: string, option: AccountOption) =>
          `${option.code} ${option.name} ${option.nameEn}`.toLowerCase().includes(query.toLowerCase())
        }
      />
    )
  }

  GlAccountInput.displayName = `GlAccountInput(${filterTypes.join(',')})${parentCodes ? `[all:${parentCodes.join(',')}]` : ''}${assetParentCodes ? `[asset:${assetParentCodes.join(',')}]` : ''}`
  return GlAccountInput
}
