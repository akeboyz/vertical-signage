/**
 * NetReceivedSummary
 *
 * Read-only display card for receipt WHT.
 *   Net Received = totalAmount (3.3) − whtAmount deducted by payer (3.9)
 */

import { useFormValue }                        from 'sanity'
import { Card, Stack, Flex, Text, Box } from '@sanity/ui'

export function NetReceivedSummary(_props: any) {
  const totalAmount = useFormValue(['totalAmount']) as number | undefined
  const whtAmount   = useFormValue(['whtAmount'])   as number | undefined

  if (!totalAmount) return null

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const wht         = whtAmount ?? 0
  const netReceived = totalAmount - wht

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Stack space={2}>

        <Flex justify="space-between">
          <Text size={1} muted>Total Amount (incl. VAT)</Text>
          <Text size={1}>{fmt(totalAmount)} THB</Text>
        </Flex>

        {wht > 0 && (
          <Flex justify="space-between">
            <Text size={1} muted>WHT Deducted by Payer</Text>
            <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>
              − {fmt(wht)} THB
            </Text>
          </Flex>
        )}

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        <Flex justify="space-between">
          <Text size={1} weight="semibold">Net Received</Text>
          <Text size={1} weight="semibold">{fmt(netReceived)} THB</Text>
        </Flex>

      </Stack>
    </Card>
  )
}
