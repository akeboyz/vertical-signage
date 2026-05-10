import { useState, useEffect, useCallback } from 'react'
import { set, unset, useFormValue }         from 'sanity'
import { Card, Stack, Flex, Text, Box, Button, TextInput } from '@sanity/ui'
import { EditIcon, UndoIcon }               from '@sanity/icons'
import type { NumberInputProps }            from 'sanity'

const VAT_RATE = 0.07

interface LineItem {
  quantity?: number
  unitPrice?: number
  vatType?:   string
}

function computeTotal(
  subtotal:  number     | undefined,
  vatType:   string     | undefined,
  vatAmount: number     | undefined,
  lineItems: LineItem[] | undefined,
): number {
  const sub = subtotal ?? 0

  if (!vatType || vatType === 'none' || vatType === 'zero' || vatType === 'inclusive') {
    return Math.round(sub * 100) / 100
  }

  if (vatType === 'exclusive') {
    if (vatAmount != null) return Math.round((sub + vatAmount) * 100) / 100
    // no vatAmount yet — estimate from exclusive-tagged line items
    const exclusiveBase = (lineItems ?? []).reduce((s, item) => {
      if (item.vatType !== 'exclusive') return s
      return s + (item.quantity ?? 0) * (item.unitPrice ?? 0)
    }, 0)
    const autoVat = Math.round(exclusiveBase * VAT_RATE * 100) / 100
    return Math.round((sub + autoVat) * 100) / 100
  }

  return Math.round(sub * 100) / 100
}

export function AutoTotalAmountInput(props: NumberInputProps) {
  const { value, onChange, elementProps } = props

  const subtotal  = useFormValue(['subtotal'])           as number     | undefined
  const vatType   = useFormValue(['vatType'])            as string     | undefined
  const vatAmount = useFormValue(['vatAmount'])          as number     | undefined
  const lineItems = useFormValue(['lineItems'])          as LineItem[] | undefined

  const calcTotal = computeTotal(subtotal, vatType, vatAmount, lineItems)

  const [isOverride, setIsOverride] = useState(false)

  // On mount: if a saved value differs from what auto-calc gives, treat it as a prior manual override
  useEffect(() => {
    if (value !== undefined && value !== calcTotal) setIsOverride(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-patch whenever computed total changes (and user hasn't overridden)
  useEffect(() => {
    if (isOverride) return
    onChange(set(calcTotal))
  }, [calcTotal, isOverride]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOverride = useCallback(() => setIsOverride(true), [])

  const handleReset = useCallback(() => {
    setIsOverride(false)
    onChange(set(calcTotal))
  }, [calcTotal, onChange])

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const sub      = subtotal  ?? 0
  const vat      = vatAmount ?? 0
  const showVat  = vatType === 'exclusive' && vat > 0

  if (!isOverride) {
    return (
      <Card padding={3} radius={2} tone="primary" border>
        <Stack space={2}>
          <Flex justify="space-between" align="center">
            <Text size={1} muted>Subtotal</Text>
            <Text size={1}>{fmt(sub)} THB</Text>
          </Flex>

          {showVat && (
            <Flex justify="space-between" align="center">
              <Text size={1} muted>VAT</Text>
              <Text size={1}>{fmt(vat)} THB</Text>
            </Flex>
          )}

          {!showVat && vatType === 'exclusive' && (
            <Flex justify="space-between" align="center">
              <Text size={1} muted>VAT (7% est.)</Text>
              <Text size={1} style={{ color: 'var(--card-muted-fg-color)' }}>
                {fmt(Math.round(
                  (lineItems ?? []).reduce((s, i) => i.vatType === 'exclusive'
                    ? s + (i.quantity ?? 0) * (i.unitPrice ?? 0) : s, 0) * VAT_RATE * 100
                ) / 100)} THB
              </Text>
            </Flex>
          )}

          <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

          <Flex justify="space-between" align="center">
            <Text size={1} weight="semibold">Total (auto-computed)</Text>
            <Flex align="center" gap={2}>
              <Text size={2} weight="semibold">{fmt(calcTotal)} THB</Text>
              <Button
                icon={EditIcon}
                mode="bleed"
                tone="default"
                padding={2}
                title="Override manually"
                onClick={handleOverride}
              />
            </Flex>
          </Flex>

          <Text size={0} muted>
            Auto-derived from subtotal{showVat ? ' + VAT' : vatType === 'exclusive' ? ' + estimated VAT' : ''}.
            Enter VAT amount in 2.3 to confirm the exact figure.
          </Text>
        </Stack>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      <Flex align="center" gap={2}>
        <Box flex={1}>
          <TextInput
            {...elementProps}
            type="number"
            value={value !== undefined ? String(value) : ''}
            onChange={e => {
              const v = parseFloat(e.currentTarget.value)
              onChange(isNaN(v) ? unset() : set(v))
            }}
          />
        </Box>
        <Button
          icon={UndoIcon}
          mode="bleed"
          tone="caution"
          padding={2}
          title="Reset to auto-calculated"
          onClick={handleReset}
        />
      </Flex>
      <Text size={0} muted>
        Manually overriding auto-total. Click ↩ to restore auto-computation from line items.
      </Text>
    </Stack>
  )
}
