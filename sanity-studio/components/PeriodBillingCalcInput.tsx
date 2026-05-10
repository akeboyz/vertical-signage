/**
 * PeriodBillingCalcInput
 *
 * Read-only billing summary inside a billingPeriod array item on Rent Space.
 * Uses props.path to identify which array item it belongs to, reads that
 * item's values from the form, and renders the calculated breakdown.
 * No patching — totals are recalculated fresh wherever needed.
 */

import { useFormValue } from 'sanity'
import { Card, Stack, Flex, Text, Box } from '@sanity/ui'

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function PeriodBillingCalcInput(props: any) {
  // props.path = ['billingPeriods', {_key: 'xxx'}, 'billingCalc']
  const itemKey    = (props.path?.[1] as any)?._key as string | undefined
  const allPeriods = useFormValue(['billingPeriods']) as any[] | undefined
  const item       = allPeriods?.find((p: any) => p._key === itemKey)

  const rentalAmount    = item?.rentalAmount    as number | undefined
  const meterStart      = item?.meterStart      as number | undefined
  const meterEnd        = item?.meterEnd        as number | undefined
  const electricityRate = item?.electricityRate as number | undefined

  const unitsUsed = (meterEnd != null && meterStart != null)
    ? Math.max(0, meterEnd - meterStart)
    : null
  const elecCost = (unitsUsed != null && electricityRate != null)
    ? unitsUsed * electricityRate
    : null
  const total = rentalAmount != null
    ? rentalAmount + (elecCost ?? 0)
    : null

  if (!rentalAmount) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>Enter Rental Amount (field 3) to see the billing total.</Text>
      </Card>
    )
  }

  return (
    <Card padding={3} radius={2} border>
      <Stack space={3}>

        <Flex justify="space-between" align="center">
          <Text size={1} muted>Rental</Text>
          <Text size={1} weight="semibold">฿{fmt(rentalAmount)}</Text>
        </Flex>

        {unitsUsed != null && electricityRate != null ? (
          <Flex justify="space-between" align="center">
            <Stack space={1}>
              <Text size={1} muted>Electricity</Text>
              <Text size={0} muted>{unitsUsed} units × ฿{electricityRate}/unit</Text>
            </Stack>
            <Text size={1} weight="semibold">฿{fmt(elecCost ?? 0)}</Text>
          </Flex>
        ) : (
          <Flex justify="space-between" align="center">
            <Text size={1} muted>Electricity</Text>
            <Text size={1} muted style={{ fontStyle: 'italic' }}>
              {meterStart != null || meterEnd != null
                ? 'Fill both meter readings + rate'
                : '— (no meter readings entered)'}
            </Text>
          </Flex>
        )}

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Total Charged</Text>
          <Text size={2} weight="semibold">฿{fmt(total ?? rentalAmount)}</Text>
        </Flex>

      </Stack>
    </Card>
  )
}
