import { useState, useEffect, useCallback } from 'react'
import { set, unset, useFormValue }         from 'sanity'
import { Card, Stack, Flex, Text, Box, Button, TextInput } from '@sanity/ui'
import { EditIcon, UndoIcon }               from '@sanity/icons'
import type { NumberInputProps }            from 'sanity'

interface ComparisonItem {
  selected?:    boolean
  quotedPrice?: number
}

function computeSuggested(
  items:    ComparisonItem[] | undefined,
  quantity: number           | undefined,
): number | null {
  const selected = (items ?? []).find(i => i.selected === true)
  if (!selected || !selected.quotedPrice) return null
  return Math.round((selected.quotedPrice * (quantity ?? 1)) * 100) / 100
}

export function AutoInvoiceAmountInput(props: NumberInputProps) {
  const { value, onChange, elementProps } = props

  const comparisonItems = useFormValue(['comparisonItems']) as ComparisonItem[] | undefined
  const quantity        = useFormValue(['quantity'])        as number | undefined

  const suggested = computeSuggested(comparisonItems, quantity)

  const [isOverride, setIsOverride] = useState(false)

  // On mount: if a saved value exists and differs from what we'd compute, treat as manual override
  useEffect(() => {
    if (value !== undefined && suggested !== null && value !== suggested) setIsOverride(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-patch whenever the suggested value changes (and user hasn't overridden)
  useEffect(() => {
    if (isOverride) return
    if (suggested === null) return   // no selected vendor yet — don't touch the field
    onChange(set(suggested))
  }, [suggested, isOverride]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOverride = useCallback(() => setIsOverride(true), [])

  const handleReset = useCallback(() => {
    setIsOverride(false)
    if (suggested !== null) onChange(set(suggested))
    else onChange(unset())
  }, [suggested, onChange])

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const selectedItem = (comparisonItems ?? []).find(i => i.selected === true)
  const qty          = quantity ?? 1

  if (!isOverride) {
    // No vendor selected yet — show guidance
    if (suggested === null) {
      return (
        <Card padding={3} radius={2} tone="caution" border>
          <Text size={1} muted>
            No vendor selected in 1.8 Comparison Items yet. Mark a vendor as Selected to auto-fill this amount.
          </Text>
          {value != null && (
            <Text size={1} style={{ marginTop: 6 }}>
              Current saved value: <strong>{fmt(value)} THB</strong>
            </Text>
          )}
        </Card>
      )
    }

    return (
      <Card padding={3} radius={2} tone="primary" border>
        <Stack space={2}>
          <Flex justify="space-between" align="center">
            <Text size={1} muted>Selected vendor quoted price (per unit)</Text>
            <Text size={1}>{fmt(selectedItem?.quotedPrice ?? 0)} THB</Text>
          </Flex>

          <Flex justify="space-between" align="center">
            <Text size={1} muted>Quantity (1.6)</Text>
            <Text size={1}>{qty}</Text>
          </Flex>

          <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

          <Flex justify="space-between" align="center">
            <Text size={1} weight="semibold">Invoice Amount (auto-computed)</Text>
            <Flex align="center" gap={2}>
              <Text size={2} weight="semibold">{fmt(suggested)} THB</Text>
              <Button
                icon={EditIcon}
                mode="bleed"
                tone="default"
                padding={2}
                title="Override — actual invoice differs from quote"
                onClick={handleOverride}
              />
            </Flex>
          </Flex>

          <Text size={0} muted>
            Auto-derived from selected vendor's quoted price × quantity.
            Click ✎ to override if the actual vendor invoice amount differs.
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
          title="Reset to auto-computed from selected vendor quote"
          onClick={handleReset}
        />
      </Flex>
      <Text size={0} muted>
        Manually overriding quoted amount. Click ↩ to restore from selected vendor's quote × quantity.
      </Text>
    </Stack>
  )
}
