/**
 * SourceProcurementInput
 *
 * Custom reference input for Asset.sourceProcurement.
 * When a procurement is selected, auto-fills:
 *   - contractType  (Process Setup)
 *   - assetType
 *   - brand, model  (from selected comparison item's specFields)
 *   - specFields    (full JSON from selected comparison item)
 *   - receivedDate  (from procurement's receivedDate)
 */

import { useEffect, useRef, useState } from 'react'
import { useClient, useFormValue, useDocumentOperation } from 'sanity'
import type { ReferenceInputProps } from 'sanity'
import { Card, Text, Flex, Spinner, Stack } from '@sanity/ui'

interface ProcurementData {
  contractTypeRef?: string
  assetType?:       string
  receivedDate?:    string
  selectedItem?: {
    specFields?: string   // JSON string
    quotedPrice?: number
  }
}

export function SourceProcurementInput(props: ReferenceInputProps) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const docId   = useFormValue(['_id'])   as string | undefined
  const docType = useFormValue(['_type']) as string | undefined

  const currentRef = (props.value as any)?._ref as string | undefined
  const prevRef    = useRef<string | undefined>(undefined)

  const [filling,    setFilling]    = useState(false)
  const [filledFrom, setFilledFrom] = useState<string[]>([])

  const { patch } = useDocumentOperation(
    (docId ?? '').replace(/^drafts\./, ''),
    docType ?? 'asset',
  )

  useEffect(() => {
    if (!currentRef || currentRef === prevRef.current) return
    if (!docId) return
    prevRef.current = currentRef

    setFilling(true)
    setFilledFrom([])

    client
      .fetch<ProcurementData>(
        `*[_id == $id || _id == "drafts." + $id][0]{
          "contractTypeRef": contractType._ref,
          assetType,
          receivedDate,
          "selectedItem": comparisonItems[selected == true][0]{
            specFields,
            quotedPrice
          }
        }`,
        { id: currentRef },
      )
      .then(proc => {
        if (!proc) return

        const patches: object[] = []
        const filled: string[]  = []

        // Use setIfMissing so adding a 2nd+ procurement doesn't overwrite
        // metadata already filled by the first one.
        if (proc.contractTypeRef) {
          patches.push({ setIfMissing: { contractType: { _type: 'reference', _ref: proc.contractTypeRef } } })
          filled.push('Process Setup')
        }
        if (proc.assetType) {
          patches.push({ setIfMissing: { assetType: proc.assetType } })
          filled.push('Asset Type')
        }
        if (proc.receivedDate) {
          patches.push({ setIfMissing: { receivedDate: proc.receivedDate } })
          filled.push('Received Date')
        }

        // Parse specFields JSON from the selected comparison item
        if (proc.selectedItem?.specFields) {
          try {
            const specs = JSON.parse(proc.selectedItem.specFields) as Record<string, unknown>

            patches.push({ setIfMissing: { specFields: proc.selectedItem.specFields } })
            filled.push('Spec Fields')

            if (specs.brand && typeof specs.brand === 'string') {
              patches.push({ setIfMissing: { brand: specs.brand } })
              filled.push('Brand')
            }
            if (specs.model && typeof specs.model === 'string') {
              patches.push({ setIfMissing: { model: specs.model } })
              filled.push('Model')
            }
          } catch {
            // specFields not valid JSON — skip
          }
        }

        if (patches.length > 0) patch.execute(patches)
        setFilledFrom(filled)
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
            <Text size={1} muted>Auto-filling from Procurement…</Text>
          </Flex>
        </Card>
      )}
      {!filling && currentRef && filledFrom.length > 0 && (
        <Card padding={2} radius={2} tone="transparent">
          <Text size={1} muted>
            Auto-filled from Procurement: {filledFrom.join(', ')}.
          </Text>
        </Card>
      )}
    </Stack>
  )
}
