/**
 * AutoPaymentAmountInput
 *
 * When parentPayment is linked: fetches the root payment's paymentAmount,
 * patches this field to match, and renders read-only.
 * When no parent: renders the default editable number input.
 */

import { useEffect, useState }      from 'react'
import { useFormValue, useClient }   from 'sanity'
import { set }                       from 'sanity'
import type { NumberInputProps }     from 'sanity'
import { Stack, Text, Badge, Flex, Spinner } from '@sanity/ui'

export function AutoPaymentAmountInput(props: NumberInputProps) {
  const client    = useClient({ apiVersion: '2024-01-01' })
  const parentRef = useFormValue(['parentPayment']) as { _ref?: string } | undefined

  const [loading,    setLoading]    = useState(false)
  const [parentAmt,  setParentAmt]  = useState<number | null>(null)

  const parentId = parentRef?._ref

  useEffect(() => {
    if (!parentId) { setParentAmt(null); return }
    setLoading(true)
    client
      .fetch<{ paymentAmount?: number }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){ paymentAmount }`,
        { id: parentId },
      )
      .then(doc => {
        const amt = doc?.paymentAmount ?? null
        setParentAmt(amt)
        if (amt != null && props.value !== amt) props.onChange(set(amt))
      })
      .catch(() => setParentAmt(null))
      .finally(() => setLoading(false))
  }, [parentId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!parentId) {
    return (
      <Stack space={2}>
        {props.renderDefault(props)}
        <Text size={0} muted>Total obligation for this payment series. Auto-fills from Procurement quoted price if linked.</Text>
      </Stack>
    )
  }

  return (
    <Stack space={2}>
      {loading ? (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Loading from parent payment…</Text>
        </Flex>
      ) : (
        <Flex align="center" gap={2}>
          <Text size={2} weight="semibold">
            {parentAmt != null ? parentAmt.toLocaleString('th-TH') : '—'} THB
          </Text>
          <Badge tone="primary" mode="outline" fontSize={0}>Auto — from root payment</Badge>
        </Flex>
      )}
      <Text size={0} muted>Total obligation is inherited from the root payment and cannot be changed here.</Text>
    </Stack>
  )
}
