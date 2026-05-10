/**
 * NetPayableSummary
 *
 * Read-only display card. All amounts in THB.
 *   Net = paidAmount (2.6, THB) − whtAmount (2.7, THB) + exclusive VAT (THB)
 *
 * For non-THB invoices, shows the implied effective exchange rate:
 *   impliedRate = paidAmount (THB) ÷ paymentAmount (original currency)
 */

import { useFormValue }                       from 'sanity'
import { Card, Stack, Flex, Text, Box, Badge } from '@sanity/ui'

export function NetPayableSummary(_props: any) {
  const paidAmount    = useFormValue(['paidAmount'])    as number | undefined
  const paymentAmount = useFormValue(['paymentAmount']) as number | undefined
  const whtAmount     = useFormValue(['whtAmount'])     as number | undefined
  const vatType       = useFormValue(['vatType'])       as string | undefined
  const vatAmount     = useFormValue(['vatAmount'])     as number | undefined
  const currency      = useFormValue(['currency'])      as string | undefined

  if (!paidAmount) return null

  const cur   = currency ?? 'THB'
  const isTHB = cur === 'THB'

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const wht    = whtAmount ?? 0
  const vatAdd = vatType === 'exclusive' ? (vatAmount ?? 0) : 0
  const net    = paidAmount - wht + vatAdd  // always THB

  // Implied rate: what effective rate was used when converting invoice → THB
  const impliedRate =
    !isTHB && paymentAmount && paymentAmount > 0
      ? paidAmount / paymentAmount
      : null

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={2}>

        <Flex justify="space-between">
          <Text size={1} muted>Gross Amount</Text>
          <Text size={1}>{fmt(paidAmount)} THB</Text>
        </Flex>

        {wht > 0 && (
          <Flex justify="space-between">
            <Text size={1} muted>W/H Tax Deducted</Text>
            <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>
              − {fmt(wht)} THB
            </Text>
          </Flex>
        )}

        {vatAdd > 0 && (
          <Flex justify="space-between">
            <Text size={1} muted>VAT (exclusive, added on top)</Text>
            <Text size={1} style={{ color: 'var(--card-positive-fg-color)' }}>
              + {fmt(vatAdd)} THB
            </Text>
          </Flex>
        )}

        {/* Implied exchange rate — informational only, shown when non-THB invoice */}
        {!isTHB && (
          <>
            <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />
            <Flex justify="space-between" align="center">
              <Text size={0} muted>Effective Rate (1 {cur} → THB, implied from 2.6 ÷ 1.5)</Text>
              {impliedRate
                ? <Text size={0} muted>{fmt(impliedRate)} THB</Text>
                : <Badge tone="caution" mode="outline" fontSize={0}>Fill 1.5 &amp; 2.6 to derive</Badge>
              }
            </Flex>
          </>
        )}

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        <Flex justify="space-between">
          <Text size={1} weight="semibold">Net Transfer to Vendor</Text>
          <Text size={1} weight="semibold">{fmt(net)} THB</Text>
        </Flex>

      </Stack>
    </Card>
  )
}
