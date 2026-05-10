/**
 * ApprovedOrderSummary
 *
 * Read-only panel shown at the top of the Ordering tab.
 * Summarises the approved decision from the Compare & Approve step:
 *   - Purchase Order Number
 *   - Asset Type + Quantity + Budget
 *   - Selected vendor, quoted price, spec fields, notes
 *   - Warranty info
 */

import { useEffect, useState, useRef } from 'react'
import { Stack, Card, Text, Flex, Badge, Box } from '@sanity/ui'
import { useClient, useFormValue } from 'sanity'
import type { StringInputProps } from 'sanity'

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

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <Flex gap={3} align="flex-start">
      <Box style={{ minWidth: 160, flexShrink: 0 }}>
        <Text size={1} muted>{label}</Text>
      </Box>
      <Text size={1} weight="semibold" style={{ wordBreak: 'break-word' }}>{value}</Text>
    </Flex>
  )
}

export function ApprovedOrderSummary(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const purchaseOrderNumber = useFormValue(['purchaseOrderNumber']) as string | undefined
  const assetType           = useFormValue(['assetType'])           as string | undefined
  const quantity            = useFormValue(['quantity'])            as number | undefined
  const budgetMin           = useFormValue(['budgetRange', 'min'])  as number | undefined
  const budgetMax           = useFormValue(['budgetRange', 'max'])  as number | undefined
  const warrantyOffer       = useFormValue(['warrantyOffer'])       as boolean | undefined
  const warrantyPeriod      = useFormValue(['warrantyPeriod'])      as string | undefined
  const warrantyDetails     = useFormValue(['warrantyDetails'])     as string | undefined
  const rawItems            = (useFormValue(['comparisonItems']) ?? []) as ComparisonItem[]
  const approvalStatus      = useFormValue(['approvalStatus'])      as string | undefined

  const selected = rawItems.find(i => i.selected)

  const [vendorName,  setVendorName]  = useState<string>('')
  const [specGroups,  setSpecGroups]  = useState<SpecGroupDef[]>([])
  const prevRef = useRef('')

  // Resolve vendor name
  useEffect(() => {
    const ref = selected?.vendor?._ref
    if (!ref || ref === prevRef.current) return
    prevRef.current = ref
    client
      .fetch<{ legalName_en?: string; legalName_th?: string; legalName?: string }>(
        `*[_id == $ref][0]{ legalName_en, legalName_th, legalName }`,
        { ref },
      )
      .then(v => setVendorName(v?.legalName_en ?? v?.legalName_th ?? v?.legalName ?? '—'))
      .catch(() => setVendorName('—'))
  }, [selected?.vendor?._ref, client])

  // Fetch spec group definitions for label resolution
  useEffect(() => {
    if (!assetType) { setSpecGroups([]); return }
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
  }, [assetType, client])

  // Parse spec fields from selected vendor
  const specValues: Record<string, string> = (() => {
    if (!selected?.specFields) return {}
    try { return JSON.parse(selected.specFields) } catch { return {} }
  })()

  const fmt = (n?: number) => n != null ? Number(n).toLocaleString() + ' THB' : undefined
  const budgetStr = budgetMin != null || budgetMax != null
    ? [fmt(budgetMin), fmt(budgetMax)].filter(Boolean).join(' – ')
    : undefined

  // If nothing is selected yet, show a placeholder
  if (!selected) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>
          No vendor has been selected yet. Go to <strong>Compare &amp; Approve</strong> and mark a vendor as selected.
        </Text>
      </Card>
    )
  }

  return (
    <Card padding={4} radius={2} border tone="positive">
      <Stack space={4}>

        {/* ── Header ── */}
        <Flex align="center" justify="space-between" gap={3}>
          <Text size={2} weight="bold">Approved Order Summary</Text>
          {approvalStatus === 'approved' && (
            <Badge tone="positive" radius={2} fontSize={1}>✅ Approved</Badge>
          )}
        </Flex>

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        {/* ── PO + Item info ── */}
        <Stack space={2}>
          <Row label="Purchase Order Number" value={purchaseOrderNumber} />
          <Row label="Asset Type"            value={assetType} />
          <Row label="Quantity to Order"     value={quantity != null ? String(quantity) + ' unit(s)' : undefined} />
          <Row label="Budget Range"          value={budgetStr} />
        </Stack>

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        {/* ── Selected vendor ── */}
        <Stack space={2}>
          <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Selected Vendor
          </Text>
          <Row label="Vendor"          value={vendorName || undefined} />
          <Row label="Quoted Price"    value={fmt(selected.quotedPrice)} />
        </Stack>

        {/* ── Spec fields by group ── */}
        {specGroups.map(group => {
          const rows = (group.specFields ?? []).filter(f => specValues[f.key])
          if (rows.length === 0) return null
          return (
            <Stack key={group.groupName} space={2}>
              <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {group.groupName}
              </Text>
              {rows.map(f => {
                const raw = specValues[f.key]
                const display =
                  f.fieldType === 'yes_no'
                    ? raw === 'yes' ? '✅ Yes' : '⬜ No'
                    : raw
                return <Row key={f.key} label={f.label} value={display} />
              })}
            </Stack>
          )
        })}

        {/* Fallback: show raw spec entries when no spec group definitions loaded */}
        {specGroups.length === 0 && Object.keys(specValues).length > 0 && (
          <Stack space={2}>
            <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Specs
            </Text>
            {Object.entries(specValues).map(([k, v]) => (
              <Row key={k} label={k} value={String(v)} />
            ))}
          </Stack>
        )}

        {/* ── Notes ── */}
        {selected.notes && (
          <>
            <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
            <Stack space={2}>
              <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Notes
              </Text>
              <Text size={1} style={{ whiteSpace: 'pre-wrap' }}>{selected.notes}</Text>
            </Stack>
          </>
        )}

        {/* ── Warranty ── */}
        {warrantyOffer && (
          <>
            <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
            <Stack space={2}>
              <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Warranty
              </Text>
              <Row label="Warranty Period"  value={warrantyPeriod} />
              <Row label="Coverage Details" value={warrantyDetails} />
            </Stack>
          </>
        )}

      </Stack>
    </Card>
  )
}
