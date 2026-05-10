/**
 * ReceiptWhtAmountInput
 *
 * Mirrors AutoWhtAmountInput but for receipts:
 * auto-calculates WHT as totalAmount × rate / 100.
 * The payer deducts this amount before transferring to us.
 */

import { useState, useEffect, useCallback } from 'react'
import { set, unset, useFormValue }          from 'sanity'
import { Flex, Box, TextInput, Button }      from '@sanity/ui'
import { EditIcon, UndoIcon }                from '@sanity/icons'

function computeCalc(amount: number | undefined, rate: string | undefined): number | undefined {
  if (!amount || !rate || rate === 'none' || rate === '0' || rate === 'custom') return undefined
  const r = parseFloat(rate)
  if (isNaN(r)) return undefined
  return Math.round(amount * r) / 100
}

export function ReceiptWhtAmountInput(props: any) {
  const { value, onChange, elementProps } = props

  const totalAmount        = useFormValue(['totalAmount'])        as number | undefined
  const withholdingTaxRate = useFormValue(['withholdingTaxRate']) as string | undefined

  const calcValue = computeCalc(totalAmount, withholdingTaxRate)

  const [isOverride, setIsOverride] = useState(false)

  useEffect(() => {
    if (value !== undefined && calcValue !== undefined && value !== calcValue) {
      setIsOverride(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOverride) return
    if (!withholdingTaxRate || withholdingTaxRate === 'none' || withholdingTaxRate === '0') {
      onChange(unset())
      return
    }
    if (calcValue !== undefined) {
      onChange(set(calcValue))
    }
  }, [calcValue, isOverride, withholdingTaxRate, onChange])

  const handleOverride = useCallback(() => setIsOverride(true), [])

  const handleReset = useCallback(() => {
    setIsOverride(false)
    if (calcValue !== undefined) onChange(set(calcValue))
    else onChange(unset())
  }, [calcValue, onChange])

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (!isOverride) {
    return (
      <Flex align="center" gap={2}>
        <Box flex={1}>
          <TextInput
            {...elementProps}
            readOnly
            value={value !== undefined ? fmt(value) : '—'}
            style={{ color: 'var(--card-muted-fg-color)', cursor: 'default' }}
          />
        </Box>
        <Button icon={EditIcon} mode="bleed" tone="default" padding={2} title="Override manually" onClick={handleOverride} />
      </Flex>
    )
  }

  return (
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
      <Button icon={UndoIcon} mode="bleed" tone="caution" padding={2} title="Reset to auto-calculated" onClick={handleReset} />
    </Flex>
  )
}
