/**
 * ReceiptTotalsSummary
 *
 * Auto-computes the receipt subtotal from lineItems and patches the
 * `subtotal` field via onChange. Also renders a read-only summary card
 * showing subtotal, auto-estimated VAT (7%), and guidance for 3.2–3.3.
 *
 * Mirrors the AutoWhtAmountInput pattern: useEffect patches whenever
 * the computed value changes, no user interaction required.
 */

import { useEffect }       from 'react'
import { set, useFormValue } from 'sanity'
import { Card, Stack, Flex, Text } from '@sanity/ui'
import type { NumberInputProps }   from 'sanity'

interface LineItem {
  quantity?:  number
  unitPrice?: number
  vatType?:   string
}

const VAT_RATE = 0.07

export function ReceiptTotalsSummary(props: NumberInputProps) {
  const lineItems = useFormValue(['lineItems']) as LineItem[] | undefined

  const subtotal = (lineItems ?? []).reduce((sum, item) => {
    return sum + (item.quantity ?? 0) * (item.unitPrice ?? 0)
  }, 0)

  const exclusiveBase = (lineItems ?? []).reduce((sum, item) => {
    if (item.vatType !== 'exclusive') return sum
    return sum + (item.quantity ?? 0) * (item.unitPrice ?? 0)
  }, 0)

  const autoVat = Math.round(exclusiveBase * VAT_RATE * 100) / 100

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Auto-patch the subtotal field whenever line items change
  useEffect(() => {
    props.onChange(set(subtotal))
  }, [subtotal]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={2}>

        <Flex justify="space-between">
          <Text size={1} muted>Subtotal (sum of line items)</Text>
          <Text size={1} weight="semibold">{fmt(subtotal)} THB</Text>
        </Flex>

        {autoVat > 0 && (
          <Flex justify="space-between">
            <Text size={1} muted>VAT 7% est. (exclusive items)</Text>
            <Text size={1}>{fmt(autoVat)} THB</Text>
          </Flex>
        )}

        <Text size={0} muted style={{ marginTop: 2 }}>
          Set VAT type in 2.2 and confirm VAT amount in 2.3 — total will auto-compute in 2.4.
        </Text>

      </Stack>
    </Card>
  )
}
