import { useEffect, useRef, useState }              from 'react'
import { useClient, useFormValue, useDocumentOperation } from 'sanity'
import type { ReferenceInputProps }                from 'sanity'
import { Card, Text, Flex, Spinner, Stack }        from '@sanity/ui'

export function CostSourceInput(props: ReferenceInputProps) {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const docId   = useFormValue(['_id'])   as string | undefined
  const docType = useFormValue(['_type']) as string | undefined

  const currentRef = (props.value as any)?._ref as string | undefined
  const prevRef    = useRef<string | undefined>(undefined)

  const [filling,    setFilling]    = useState(false)
  const [filledFrom, setFilledFrom] = useState<string[]>([])
  const [sourceType, setSourceType] = useState<'procurement' | 'payment' | null>(null)

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
      .fetch<{
        _type:            string
        contractTypeRef?: string
        assetType?:       string
        receivedDate?:    string
        selectedItem?:    { specFields?: string }
        accountCodeRef?:  string
      }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
          _type,
          "contractTypeRef": contractType._ref,
          assetType,
          receivedDate,
          "selectedItem": comparisonItems[selected == true][0]{ specFields },
          "accountCodeRef": accountCode._ref
        }`,
        { id: currentRef },
      )
      .then(doc => {
        if (!doc) return

        const isProc = doc._type === 'procurement'
        setSourceType(isProc ? 'procurement' : 'payment')

        const patches: object[] = []
        const filled: string[]  = []

        if (isProc) {
          if (doc.contractTypeRef) {
            patches.push({ setIfMissing: { contractType: { _type: 'reference', _ref: doc.contractTypeRef } } })
            filled.push('Process Setup')
          }
          if (doc.assetType) {
            patches.push({ setIfMissing: { assetType: doc.assetType } })
            filled.push('Asset Type')
          }
          if (doc.receivedDate) {
            patches.push({ setIfMissing: { receivedDate: doc.receivedDate } })
            filled.push('Received Date')
          }
          if (doc.selectedItem?.specFields) {
            try {
              const specs = JSON.parse(doc.selectedItem.specFields) as Record<string, unknown>
              patches.push({ setIfMissing: { specFields: doc.selectedItem.specFields } })
              filled.push('Spec Fields')
              if (typeof specs.brand === 'string') {
                patches.push({ setIfMissing: { brand: specs.brand } })
                filled.push('Brand')
              }
              if (typeof specs.model === 'string') {
                patches.push({ setIfMissing: { model: specs.model } })
                filled.push('Model')
              }
            } catch { /* specFields not valid JSON */ }
          }
        } else {
          if (doc.assetType) {
            patches.push({ setIfMissing: { assetType: doc.assetType } })
            filled.push('Asset Type')
          }
          if (doc.accountCodeRef) {
            patches.push({ setIfMissing: { accountCode: { _type: 'reference', _ref: doc.accountCodeRef } } })
            filled.push('GL Account')
          }
        }

        if (patches.length > 0) patch.execute(patches)
        setFilledFrom(filled)
      })
      .catch(() => {})
      .finally(() => setFilling(false))
  }, [currentRef, docId]) // eslint-disable-line react-hooks/exhaustive-deps

  const label = sourceType === 'procurement' ? 'Procurement'
              : sourceType === 'payment'     ? 'Payment'
              : 'source'

  return (
    <Stack space={2}>
      {props.renderDefault(props)}
      {filling && (
        <Card padding={2} radius={2} tone="primary">
          <Flex align="center" gap={2}>
            <Spinner muted />
            <Text size={1} muted>Auto-filling from {label}…</Text>
          </Flex>
        </Card>
      )}
      {!filling && currentRef && filledFrom.length > 0 && (
        <Card padding={2} radius={2} tone="transparent">
          <Text size={1} muted>
            Auto-filled from {label}: {filledFrom.join(', ')}.
          </Text>
        </Card>
      )}
    </Stack>
  )
}
