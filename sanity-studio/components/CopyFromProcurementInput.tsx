/**
 * CopyFromProcurementInput
 *
 * Reference field that, when a previous Procurement is selected, copies:
 *   contractType, assetType, quantity, budgetRange,
 *   comparisonItems (vendor refs + specs + prices — selected flag reset to false),
 *   warrantyOffer, warrantyPeriod, warrantyDetails
 *
 * Deliberately does NOT copy: status, approval, dates, PO number, delivery, payment.
 * After patching, clears itself so it acts as a one-time trigger.
 */

import { useEffect, useRef, useState } from 'react'
import { useClient, useFormValue, useDocumentOperation } from 'sanity'
import type { ReferenceInputProps } from 'sanity'
import { Card, Text, Flex, Spinner, Stack, Badge } from '@sanity/ui'

interface ProcurementData {
  contractTypeRef?: string
  assetType?:       string
  quantity?:        number
  budgetRange?:     { min?: number; max?: number }
  comparisonItems?: Array<{
    _key?:        string
    vendorRef?:   string
    quotedPrice?: number
    specFields?:  string
    notes?:       string
  }>
  warrantyOffer?:   boolean
  warrantyPeriod?:  string
  warrantyDetails?: string
}

export function CopyFromProcurementInput(props: ReferenceInputProps) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const docId   = useFormValue(['_id'])   as string | undefined
  const docType = useFormValue(['_type']) as string | undefined

  const currentRef = (props.value as any)?._ref as string | undefined
  const prevRef    = useRef<string | undefined>(undefined)

  const [filling,  setFilling]  = useState(false)
  const [copied,   setCopied]   = useState<string | null>(null)

  const { patch } = useDocumentOperation(
    (docId ?? '').replace(/^drafts\./, ''),
    docType ?? 'procurement',
  )

  useEffect(() => {
    if (!currentRef || currentRef === prevRef.current) return
    if (!docId) return
    prevRef.current = currentRef

    setFilling(true)
    setCopied(null)

    client
      .fetch<ProcurementData>(
        `*[_id == $id || _id == "drafts." + $id][0]{
          "contractTypeRef": contractType._ref,
          assetType,
          quantity,
          budgetRange,
          "comparisonItems": comparisonItems[]{
            "vendorRef": vendor._ref,
            quotedPrice,
            specFields,
            notes
          },
          warrantyOffer,
          warrantyPeriod,
          warrantyDetails
        }`,
        { id: currentRef },
      )
      .then(prev => {
        if (!prev) return

        const patches: object[] = []

        if (prev.contractTypeRef) {
          patches.push({ set: { contractType: { _type: 'reference', _ref: prev.contractTypeRef } } })
        }
        if (prev.assetType) {
          patches.push({ set: { assetType: prev.assetType } })
        }
        if (prev.quantity) {
          patches.push({ set: { quantity: prev.quantity } })
        }
        if (prev.budgetRange) {
          patches.push({ set: { budgetRange: prev.budgetRange } })
        }
        if ((prev.comparisonItems ?? []).length > 0) {
          const items = (prev.comparisonItems ?? []).map((item, i) => ({
            _type:      'comparisonItem',
            _key:       `copied-${Date.now()}-${i}`,
            vendor:     item.vendorRef ? { _type: 'reference', _ref: item.vendorRef } : undefined,
            quotedPrice: item.quotedPrice,
            specFields:  item.specFields,
            notes:       item.notes,
            selected:    false,   // always reset — user must re-select for the new PO
          }))
          patches.push({ set: { comparisonItems: items } })
        }
        if (prev.warrantyOffer != null) {
          patches.push({ set: { warrantyOffer: prev.warrantyOffer } })
        }
        if (prev.warrantyPeriod) {
          patches.push({ set: { warrantyPeriod: prev.warrantyPeriod } })
        }
        if (prev.warrantyDetails) {
          patches.push({ set: { warrantyDetails: prev.warrantyDetails } })
        }

        // Clear this reference field after copying
        patches.push({ unset: ['copyFromProcurement'] })

        if (patches.length > 0) patch.execute(patches)

        const label = prev.assetType ?? 'previous PO'
        setCopied(label)
      })
      .catch(() => {/* ignore */})
      .finally(() => setFilling(false))
  }, [currentRef, docId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack space={2}>
      {props.renderDefault(props)}
      {filling && (
        <Card padding={2} radius={2} tone="primary">
          <Flex align="center" gap={2}>
            <Spinner muted />
            <Text size={1} muted>Copying from previous PO…</Text>
          </Flex>
        </Card>
      )}
      {!filling && copied && (
        <Card padding={2} radius={2} tone="positive">
          <Flex align="center" gap={2}>
            <Badge tone="positive" fontSize={0}>Copied</Badge>
            <Text size={1} muted>
              Vendor comparison, specs, and settings copied from <strong>{copied}</strong>.
              Selected vendor has been reset — re-select for this new order.
            </Text>
          </Flex>
        </Card>
      )}
    </Stack>
  )
}
