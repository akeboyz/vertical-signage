/**
 * BankAccountInput
 *
 * GL Account reference picker restricted to:
 *   • type == "asset"  (Cash & Bank live under asset)
 *   • isActive == true
 *   • leaf accounts only (no children)
 *   • must have a parent (i.e. is a sub-account — the parent is Cash & Cash Equivalents)
 *
 * Sorted by sortKey asc so codes appear in numeric order.
 * Displays both Thai and English names; both are searchable.
 */

import { useEffect, useState, useCallback, useId } from 'react'
import { set, unset, useClient }                   from 'sanity'
import { Autocomplete, Box, Flex, Text, Spinner }  from '@sanity/ui'

interface BankOption {
  value:  string   // _id
  code:   string   // display code with "1" prefix
  name:   string   // Thai name
  nameEn: string   // English name
}

export function BankAccountInput(props: any) {
  const { value, onChange, readOnly, elementProps } = props
  const client  = useClient({ apiVersion: '2024-01-01' })
  const inputId = useId()

  const [options, setOptions] = useState<BankOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    Promise.all([
      client.fetch<any[]>(
        `*[_type == "accountCode"
            && !(_id in path("drafts.**"))
            && type == "asset"
            && isActive != false
            && defined(parentCode._ref)
            && (
              parentCode->code == "110000"
              || parentCode->parentCode->code == "110000"
              || parentCode->parentCode->parentCode->code == "110000"
            )
            && !(_id in *[_type == "accountCode" && defined(parentCode._ref)].parentCode._ref)
          ] | order(sortKey asc) { _id, code, nameTh, nameEn, type, sortKey }`
      ),
      client.fetch<any[]>(
        `*[_type == "accountCode" && !(_id in path("drafts.**")) && code == "211100"]{ _id, code, nameTh, nameEn, type, sortKey }`
      ),
    ]).then(([banks, loans]) => {
      const toOption = (d: any): BankOption => ({
        value:  d._id as string,
        code:   d.code as string ?? '',
        name:   (d.nameTh ?? d.nameEn ?? '') as string,
        nameEn: (d.nameEn ?? '') as string,
      })
      const sorted = (arr: any[]) => arr.sort((a, b) => {
        const ka = a.sortKey ?? (a.code ?? '').padStart(10, '0')
        const kb = b.sortKey ?? (b.code ?? '').padStart(10, '0')
        return ka < kb ? -1 : ka > kb ? 1 : 0
      })
      setOptions([...sorted(banks).map(toOption), ...loans.map(toOption)])
    }).catch(e => {
      setError(e?.message ?? 'Failed to load bank accounts')
    }).finally(() => setLoading(false))
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
      <Text muted size={1}>Loading bank accounts…</Text>
    </Flex>
  )

  if (error) return (
    <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>{error}</Text>
  )

  return (
    <div data-testid="payment-bank-account-input">
    <Autocomplete
      {...elementProps}
      id={inputId}
      disabled={readOnly}
      openButton
      options={options}
      value={value?._ref ?? null}
      placeholder="Search bank / cash account…"
      onChange={handleChange}
      renderValue={(val, opt) => opt ? `${opt.code}  ·  ${opt.name}` : val}
      renderOption={(opt: BankOption) => (
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
      filterOption={(query: string, option: BankOption) =>
        `${option.code} ${option.name} ${option.nameEn}`.toLowerCase().includes(query.toLowerCase())
      }
    />
    </div>
  )
}
