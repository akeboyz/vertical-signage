/**
 * LinkedServiceContractInput
 *
 * Wraps the linkedServiceContract reference field.
 * When the user selects (or the form loads with) a service contract,
 * patches the draft with vendor and paymentAmount from that contract.
 *
 * On mount with existing selection → setIfMissing (never overwrites saved values)
 * On user changing selection       → set (overwrites to match new contract)
 */
import { useEffect, useRef, useState } from 'react'
import { useClient, useFormValue }      from 'sanity'
import type { ReferenceInputProps }     from 'sanity'
import { Badge, Flex, Spinner, Stack, Text } from '@sanity/ui'

export function LinkedServiceContractInput(props: ReferenceInputProps) {
  const client      = useClient({ apiVersion: '2024-01-01' })
  const docId       = useFormValue(['_id']) as string | undefined
  const publishedId = docId?.replace(/^drafts\./, '') ?? ''

  const [filling,    setFilling]    = useState(false)
  const [filledFrom, setFilledFrom] = useState<string | null>(null)

  const prevRef = useRef<string | undefined>(undefined)
  const contractRef = (props.value as any)?._ref as string | undefined

  useEffect(() => {
    if (!contractRef || contractRef === prevRef.current) return

    const useMissing  = prevRef.current === undefined
    prevRef.current   = contractRef
    if (!publishedId) return

    setFilling(true)
    setFilledFrom(null)

    client
      .fetch<{ serviceName?: string; vendorRef?: string; amountPerPeriod?: number; accountCodeRef?: string }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
          serviceName,
          "vendorRef":      vendor._ref,
          "accountCodeRef": glAccount._ref,
          amountPerPeriod
        }`,
        { id: contractRef },
      )
      .then(sc => {
        if (!sc) return
        const data: Record<string, unknown> = {}
        if (sc.vendorRef)              data.vendor        = { _ref: sc.vendorRef,      _type: 'reference' }
        if (sc.accountCodeRef)         data.accountCode   = { _ref: sc.accountCodeRef, _type: 'reference' }
        if (sc.amountPerPeriod != null) data.paymentAmount = sc.amountPerPeriod
        if (!Object.keys(data).length) return

        const draftId = `drafts.${publishedId}`
        const patch   = useMissing
          ? client.patch(draftId).setIfMissing(data)
          : client.patch(draftId).set(data)

        return patch.commit().then(() => setFilledFrom(sc.serviceName ?? null))
      })
      .catch(() => {})
      .finally(() => setFilling(false))
  }, [contractRef]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack space={2}>
      {props.renderDefault(props)}

      {filling && (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Auto-filling from service contract…</Text>
        </Flex>
      )}

      {!filling && filledFrom && (
        <Flex align="center" gap={2}>
          <Badge tone="primary" mode="outline" fontSize={0}>Auto-filled</Badge>
          <Text size={0} muted>Vendor, GL account &amp; amount copied from {filledFrom}</Text>
        </Flex>
      )}
    </Stack>
  )
}
