/**
 * SourcePaymentInput
 *
 * Wraps the Asset.sourcePayment reference field (direct-expense payments only).
 * When a payment is selected, patches the draft asset with:
 *   - assetType    (copied from the payment's assetType)
 *   - accountCode  (copied from the payment's GL account)
 *
 * On mount with existing ref  → setIfMissing (preserve saved overrides)
 * On user changing selection  → set (overwrite to match new payment)
 */

import { useEffect, useRef, useState } from 'react'
import { useClient, useFormValue }      from 'sanity'
import type { ReferenceInputProps }     from 'sanity'
import { Card, Text, Flex, Spinner, Stack } from '@sanity/ui'

export function SourcePaymentInput(props: ReferenceInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const docId  = useFormValue(['_id']) as string | undefined

  const currentRef = (props.value as any)?._ref as string | undefined
  const prevRef    = useRef<string | undefined>(undefined)

  const [filling,    setFilling]    = useState(false)
  const [filledFrom, setFilledFrom] = useState<string[]>([])

  useEffect(() => {
    if (!currentRef || currentRef === prevRef.current) return
    if (!docId) return

    const useMissing  = prevRef.current === undefined
    prevRef.current   = currentRef
    const publishedId = docId.replace(/^drafts\./, '')
    const draftId     = `drafts.${publishedId}`

    setFilling(true)
    setFilledFrom([])

    client
      .fetch<{
        assetType?:      string
        accountCodeRef?: string
      }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
          assetType,
          "accountCodeRef": accountCode._ref
        }`,
        { id: currentRef },
      )
      .then(payment => {
        if (!payment) return

        const data: Record<string, unknown> = {}
        const filled: string[] = []

        if (payment.assetType) {
          data.assetType = payment.assetType
          filled.push('Asset Type')
        }
        if (payment.accountCodeRef) {
          data.accountCode = { _ref: payment.accountCodeRef, _type: 'reference' }
          filled.push('GL Account')
        }

        if (Object.keys(data).length === 0) return

        const p = useMissing
          ? client.patch(draftId).setIfMissing(data)
          : client.patch(draftId).set(data)

        return p.commit().then(() => setFilledFrom(filled))
      })
      .catch(() => {})
      .finally(() => setFilling(false))
  }, [currentRef, docId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack space={2}>
      {props.renderDefault(props)}

      {filling && (
        <Card padding={2} radius={2} tone="primary">
          <Flex align="center" gap={2}>
            <Spinner muted />
            <Text size={1} muted>Auto-filling from Payment…</Text>
          </Flex>
        </Card>
      )}

      {!filling && currentRef && filledFrom.length > 0 && (
        <Card padding={2} radius={2} tone="transparent">
          <Text size={1} muted>
            Auto-filled from Payment: {filledFrom.join(', ')}.
          </Text>
        </Card>
      )}
    </Stack>
  )
}
