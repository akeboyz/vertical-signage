import { useState, useEffect, useRef } from 'react'
import { Stack, Text, Card, Spinner, Flex, Badge, Box } from '@sanity/ui'
import type { ArrayInputProps } from 'sanity'
import { useClient, useFormValue } from 'sanity'

interface ComparisonItem {
  _key:         string
  vendor?:      { _ref?: string }
  quotedPrice?: number
  specFields?:  string
  selected?:    boolean
  notes?:       string
}

interface SpecFieldDef {
  key:       string
  label:     string
  fieldType: string
}

interface SpecGroupDef {
  groupName:   string
  specFields?: SpecFieldDef[]
}

interface VendorInfo {
  _id:          string
  legalName_en?: string
  legalName_th?: string
  legalName?:    string
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const th = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding:         '10px 14px',
  textAlign:       'left',
  borderBottom:    '2px solid var(--card-border-color)',
  borderRight:     '1px solid var(--card-border-color)',
  fontWeight:      600,
  fontSize:        12,
  verticalAlign:   'top',
  minWidth:        120,
  maxWidth:        200,
  width:           '1%',       // let columns share space equally
  whiteSpace:      'normal',
  wordBreak:       'break-word',
  overflowWrap:    'anywhere',
  ...extra,
})

const labelCell = (): React.CSSProperties => ({
  padding:         '8px 12px',
  borderBottom:    '1px solid var(--card-border-color)',
  borderRight:     '1px solid var(--card-border-color)',
  fontWeight:      500,
  fontSize:        12,
  color:           'var(--card-muted-fg-color)',
  background:      'var(--card-muted-bg-color)',
  whiteSpace:      'nowrap',
  minWidth:        150,
})

const dataCell = (selected?: boolean): React.CSSProperties => ({
  padding:         '8px 12px',
  borderBottom:    '1px solid var(--card-border-color)',
  borderRight:     '1px solid var(--card-border-color)',
  fontSize:        13,
  verticalAlign:   'top',
  background:      selected ? 'rgba(0, 164, 74, 0.07)' : undefined,
  whiteSpace:      'normal',
  wordBreak:       'break-word',
  overflowWrap:    'anywhere',
})

const groupHeader = (): React.CSSProperties => ({
  padding:         '5px 12px',
  background:      'var(--card-border-color)',
  fontWeight:      700,
  fontSize:        10,
  textTransform:   'uppercase',
  letterSpacing:   '0.08em',
  color:           'var(--card-muted-fg-color)',
})

// ── Component ─────────────────────────────────────────────────────────────────

export function ComparisonItemsTable(props: ArrayInputProps) {
  const client    = useClient({ apiVersion: '2024-01-01' })
  const assetType = useFormValue(['assetType']) as string | undefined
  const rawItems  = (useFormValue(['comparisonItems']) ?? []) as ComparisonItem[]

  const [specGroups, setSpecGroups] = useState<SpecGroupDef[]>([])
  const [vendors,    setVendors]    = useState<Record<string, VendorInfo>>({})
  const [loadingSpec, setLoadingSpec] = useState(false)

  // Fetch spec group definitions whenever assetType changes
  useEffect(() => {
    if (!assetType) { setSpecGroups([]); return }
    setLoadingSpec(true)
    client
      .fetch<{ assetTypes?: any[] }>(
        `*[_type == "contractType" && useAssetConfig == true && isActive == true][0]{
          assetTypes[]{ key, specGroups[]{ groupName, specFields[]{ key, label, fieldType } } }
        }`,
      )
      .then(ct => {
        const found = (ct?.assetTypes ?? []).find((t: any) => t.key === assetType)
        setSpecGroups(found?.specGroups ?? [])
      })
      .catch(() => setSpecGroups([]))
      .finally(() => setLoadingSpec(false))
  }, [assetType, client])

  // Fetch vendor names whenever the list of refs changes
  const refsKey = rawItems.map(i => i.vendor?._ref ?? '').join(',')
  const prevRefsKey = useRef('')
  useEffect(() => {
    if (refsKey === prevRefsKey.current) return
    prevRefsKey.current = refsKey

    const refs = rawItems.map(i => i.vendor?._ref).filter(Boolean) as string[]
    if (refs.length === 0) { setVendors({}); return }

    client
      .fetch<VendorInfo[]>(
        `*[_id in $refs]{ _id, legalName_en, legalName_th, legalName }`,
        { refs },
      )
      .then(results => {
        const map: Record<string, VendorInfo> = {}
        for (const v of results) map[v._id] = v
        setVendors(map)
      })
      .catch(() => {})
  }, [refsKey, client]) // eslint-disable-line react-hooks/exhaustive-deps

  const vendorName = (item: ComparisonItem) => {
    const ref = item.vendor?._ref
    if (!ref) return '(no vendor)'
    const v = vendors[ref]
    if (!v) return '…'
    return v.legalName_en ?? v.legalName_th ?? v.legalName ?? '—'
  }

  const specValue = (item: ComparisonItem, key: string): string => {
    if (!item.specFields) return '—'
    try {
      const parsed = JSON.parse(item.specFields) as Record<string, string>
      const v = parsed[key]
      return v != null && v !== '' ? v : '—'
    } catch {
      return '—'
    }
  }

  const hasItems = rawItems.length > 0

  return (
    <Stack space={5}>

      {/* ── Comparison table ── */}
      {hasItems && (
        <Stack space={2}>
          <Text size={1} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>
            Comparison Summary
          </Text>

          <Card border radius={2} style={{ overflow: 'hidden' }}>
            {loadingSpec ? (
              <Flex align="center" gap={2} padding={3}>
                <Spinner muted />
                <Text size={1} muted>Loading spec definitions…</Text>
              </Flex>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>

                {/* ── Header row — vendor names ── */}
                <thead>
                  <tr style={{ background: 'var(--card-muted-bg-color)' }}>
                    <th style={th({ minWidth: 150, background: 'var(--card-muted-bg-color)' })}>
                      <Text size={0} weight="semibold" muted>Vendor</Text>
                    </th>
                    {rawItems.map(item => (
                      <th key={item._key} style={th()}>
                        <Stack space={2}>
                          <Text size={1} weight="semibold">{vendorName(item)}</Text>
                          {item.selected && (
                            <Box>
                              <Badge tone="positive" radius={2} fontSize={0}>✅ Selected</Badge>
                            </Box>
                          )}
                        </Stack>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>

                  {/* ── Price row ── */}
                  <tr>
                    <td style={labelCell()}>Price / unit (THB)</td>
                    {rawItems.map(item => (
                      <td key={item._key} style={dataCell(item.selected)}>
                        <Text size={1} weight={item.selected ? 'semibold' : 'regular'}>
                          {item.quotedPrice != null
                            ? Number(item.quotedPrice).toLocaleString() + ' THB'
                            : '—'}
                        </Text>
                      </td>
                    ))}
                  </tr>

                  {/* ── Spec groups ── */}
                  {specGroups.map(group => (
                    <>
                      <tr key={`grp-${group.groupName}`}>
                        <td
                          colSpan={rawItems.length + 1}
                          style={groupHeader()}
                        >
                          {group.groupName}
                        </td>
                      </tr>
                      {(group.specFields ?? []).map(f => (
                        <tr key={f.key}>
                          <td style={labelCell()}>{f.label}</td>
                          {rawItems.map(item => {
                            const val = specValue(item, f.key)
                            return (
                              <td key={item._key} style={dataCell(item.selected)}>
                                <Text size={1}>
                                  {f.fieldType === 'yes_no'
                                    ? val === 'yes' ? '✅ Yes' : val === 'no' ? '⬜ No' : val
                                    : val}
                                </Text>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </>
                  ))}

                  {/* ── Notes row ── */}
                  <tr>
                    <td style={labelCell()}>Notes</td>
                    {rawItems.map(item => (
                      <td key={item._key} style={dataCell(item.selected)}>
                        <Text size={1} muted={!item.notes}>{item.notes || '—'}</Text>
                      </td>
                    ))}
                  </tr>

                </tbody>
              </table>
            )}
          </Card>
        </Stack>
      )}

      {/* ── Standard array editor (add / edit items) ── */}
      <Stack space={2}>
        <Text size={1} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>
          Edit Items
        </Text>
        {props.renderDefault(props)}
      </Stack>

    </Stack>
  )
}
