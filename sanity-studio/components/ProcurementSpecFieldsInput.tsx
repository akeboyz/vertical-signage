/**
 * ProcurementSpecFieldsInput
 *
 * Displays spec fields as direct editable inputs.
 *
 * Price group auto-logic (detects fields by label pattern):
 *   - "Unit Price in THB" (label contains "thb", number): auto-computed from
 *     original price × exchange rate; also synced to sibling `quotedPrice` field
 *     on the comparison item so the invoice amount stays in sync automatically.
 *   - "Exchange Rate" (label contains "exchange"/"rate", number): triggers recompute
 *   - "Unit Price (Original Currency)" (first number field that isn't THB or rate): source
 *
 * Patching quotedPrice uses the document client directly via the array item _key
 * extracted from props.path.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Stack, Text, TextInput, Card, Spinner, Flex, Label, Badge } from '@sanity/ui'
import { set, unset }              from 'sanity'
import type { StringInputProps }   from 'sanity'
import { useClient, useFormValue } from 'sanity'

interface SpecFieldDef {
  key:       string
  label:     string
  fieldType: 'string' | 'number' | 'date' | 'text' | 'yes_no'
}

interface SpecGroupDef {
  groupName:  string
  specFields: SpecFieldDef[]
}

interface AssetTypeDef {
  key:         string
  name:        string
  specGroups?: SpecGroupDef[]
}

function parseStored(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const { _log, ...values } = JSON.parse(raw)
    return values
  } catch {
    return {}
  }
}

function serialize(values: Record<string, string>): string {
  return JSON.stringify(values)
}

export function ProcurementSpecFieldsInput(props: StringInputProps) {
  const client    = useClient({ apiVersion: '2024-01-01' })
  const assetType = useFormValue(['assetType']) as string | undefined

  // For patching sibling quotedPrice on the same comparison item
  const docId   = useFormValue(['_id']) as string | undefined
  const itemKey = ((props.path as any[])?.[1] as { _key?: string })?._key

  const [specGroups, setSpecGroups] = useState<SpecGroupDef[]>([])
  const [loading,    setLoading]    = useState(false)
  const [values,     setValues]     = useState<Record<string, string>>({})

  // Sync from external patches (e.g. CopyFromProcurementInput)
  useEffect(() => {
    setValues(parseStored(props.value as string | undefined))
  }, [props.value])

  // Fetch spec groups whenever asset type changes
  useEffect(() => {
    if (!assetType) { setSpecGroups([]); return }
    setLoading(true)
    client
      .fetch<{ assetTypes?: AssetTypeDef[] }>(
        `*[_type == "contractType" && useAssetConfig == true && isActive == true][0]{
          assetTypes[]{ key, name, specGroups[]{ groupName, specFields[]{ key, label, fieldType } } }
        }`,
      )
      .then(ct => {
        const found = (ct?.assetTypes ?? []).find(t => t.key === assetType)
        setSpecGroups(found?.specGroups ?? [])
      })
      .catch(() => setSpecGroups([]))
      .finally(() => setLoading(false))
  }, [assetType, client])

  // Identify Price-group special field keys by label pattern
  const fieldKeys = useMemo(() => {
    let thb:  string | null = null
    let orig: string | null = null
    let exch: string | null = null
    for (const group of specGroups) {
      for (const f of group.specFields) {
        if (f.fieldType !== 'number') continue
        const lbl = f.label.toLowerCase()
        if (lbl.includes('thb'))                                  thb  = f.key
        else if (lbl.includes('exchange') || lbl.includes('rate')) exch = f.key
        else if (lbl.includes('unit') || lbl.includes('price'))    orig = f.key
      }
    }
    return { thb, orig, exch }
  }, [specGroups])

  // Patch sibling quotedPrice on the parent comparison item
  const syncQuotedPrice = useCallback((thbValue: number) => {
    if (!docId || !itemKey || thbValue <= 0) return
    const draftId = docId.startsWith('drafts.') ? docId : `drafts.${docId}`
    client
      .patch(draftId)
      .set({ [`comparisonItems[_key == "${itemKey}"].quotedPrice`]: thbValue })
      .commit()
      .catch(() => {})
  }, [docId, itemKey, client])

  const handleChange = useCallback((key: string, newVal: string) => {
    const next = { ...values, [key]: newVal }

    // Auto-compute Unit Price in THB when original price or exchange rate changes
    if ((key === fieldKeys.orig || key === fieldKeys.exch) && fieldKeys.thb) {
      const origStr = next[fieldKeys.orig ?? ''] ?? ''
      const exchStr = next[fieldKeys.exch ?? ''] ?? ''
      const orig    = parseFloat(origStr)
      const exch    = parseFloat(exchStr) || 1
      if (!isNaN(orig) && orig > 0) {
        const thb = Math.round(orig * exch * 100) / 100
        next[fieldKeys.thb] = String(thb)
        syncQuotedPrice(thb)
      }
    }

    // Direct edit of Unit Price in THB → still sync to quotedPrice
    if (key === fieldKeys.thb) {
      const thb = parseFloat(newVal)
      if (!isNaN(thb) && thb > 0) syncQuotedPrice(thb)
    }

    setValues(next)
    const json = serialize(next)
    props.onChange(json === '{}' ? unset() : set(json))
  }, [values, props, fieldKeys, syncQuotedPrice])

  if (!assetType) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>Select an Asset Type above to see spec fields.</Text>
      </Card>
    )
  }

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading spec fields…</Text>
      </Flex>
    )
  }

  if (specGroups.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>No spec groups defined for this asset type.</Text>
      </Card>
    )
  }

  return (
    <Stack space={6}>
      {specGroups.map(group => (
        <Stack space={4} key={group.groupName}>

          {/* ── Group header ── */}
          <Text size={0} weight="semibold" muted
            style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {group.groupName}
          </Text>

          {(group.specFields ?? []).map(f => {
            const val       = values[f.key] ?? ''
            const isThbField  = f.key === fieldKeys.thb
            const isAutoCalc  = isThbField && !!fieldKeys.orig && !!fieldKeys.exch

            return (
              <Stack space={2} key={f.key}>
                <Flex align="center" gap={2}>
                  <Label size={1}>{f.label}</Label>
                  {isAutoCalc && (
                    <Badge tone="primary" fontSize={0} mode="outline">auto</Badge>
                  )}
                </Flex>

                {f.fieldType === 'yes_no' ? (
                  <Flex gap={2}>
                    <button
                      type="button"
                      onClick={() => handleChange(f.key, val === 'yes' ? '' : 'yes')}
                      style={{
                        padding: '6px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                        border: '1px solid var(--card-border-color)',
                        background: val === 'yes' ? '#1e7e34' : 'var(--card-bg-color)',
                        color:      val === 'yes' ? '#fff'    : 'var(--card-fg-color)',
                      }}
                    >✅ Yes</button>
                    <button
                      type="button"
                      onClick={() => handleChange(f.key, val === 'no' ? '' : 'no')}
                      style={{
                        padding: '6px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 13,
                        border: '1px solid var(--card-border-color)',
                        background: val === 'no' ? '#856404' : 'var(--card-bg-color)',
                        color:      val === 'no' ? '#fff'    : 'var(--card-fg-color)',
                      }}
                    >⬜ No</button>
                  </Flex>
                ) : f.fieldType === 'date' ? (
                  <input
                    type="date"
                    value={val}
                    onChange={e => handleChange(f.key, e.target.value)}
                    style={{
                      padding: '6px 12px', border: '1px solid var(--card-border-color)',
                      borderRadius: 4, fontFamily: 'inherit', fontSize: 14,
                      background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
                    }}
                  />
                ) : f.fieldType === 'text' ? (
                  <textarea
                    rows={3}
                    value={val}
                    onChange={e => handleChange(f.key, e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px',
                      border: '1px solid var(--card-border-color)', borderRadius: 4,
                      fontFamily: 'inherit', fontSize: 14, resize: 'vertical',
                      background: 'var(--card-bg-color)', color: 'var(--card-fg-color)',
                      boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <TextInput
                    inputMode={f.fieldType === 'number' ? 'decimal' : undefined}
                    value={val}
                    onChange={e => handleChange(f.key, (e.target as HTMLInputElement).value)}
                    style={isThbField ? { fontWeight: 600 } : undefined}
                  />
                )}

                {isAutoCalc && val && (
                  <Text size={0} muted>
                    Auto-computed from unit price × exchange rate · synced to Quoted Price (3.1)
                  </Text>
                )}
              </Stack>
            )
          })}
        </Stack>
      ))}
    </Stack>
  )
}
