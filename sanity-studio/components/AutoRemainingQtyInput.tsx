/**
 * AutoRemainingQtyInput
 *
 * Auto-calculates Quantity Remaining = Quantity Required − Quantity Received.
 * When Received Status is "accepted", remaining is forced to 0.
 *
 * Read-only display + ✏️ pencil to override · ↩ undo to revert.
 * Override state survives page reload.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { set, unset, useFormValue }                  from 'sanity'
import { Flex, Box, TextInput, Button, Text }        from '@sanity/ui'
import { EditIcon, UndoIcon }                        from '@sanity/icons'

export function AutoRemainingQtyInput(props: any) {
  const { value, onChange, readOnly, elementProps } = props

  const quantity       = useFormValue(['quantity'])       as number | undefined
  const receivedQty    = useFormValue(['receivedQty'])    as number | undefined
  const receivedStatus = useFormValue(['receivedStatus']) as string | undefined

  const computeCalc = useCallback((): number | null => {
    if (receivedStatus === 'accepted') return 0
    if (quantity == null) return null
    return Math.max(0, quantity - (receivedQty ?? 0))
  }, [quantity, receivedQty, receivedStatus])

  const [isOverride,  setIsOverride]  = useState(false)
  const [editValue,   setEditValue]   = useState('')
  const [initialized, setInitialized] = useState(false)
  const prevCalcRef = useRef<number | null>(null)

  // ── On mount: detect override ─────────────────────────────────────────────
  useEffect(() => {
    const calc = computeCalc()
    prevCalcRef.current = calc
    if (calc !== null && value !== undefined && value !== calc) {
      setIsOverride(true)
      setEditValue(String(value))
    } else if (calc !== null && value === undefined) {
      onChange(set(calc))
    }
    setInitialized(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — mount only

  // ── Re-calculate when source fields change ────────────────────────────────
  useEffect(() => {
    if (!initialized) return
    const calc = computeCalc()
    if (isOverride) return
    if (calc !== null) onChange(set(calc))
    else               onChange(unset())
  }, [quantity, receivedQty, receivedStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleOverride = () => {
    setIsOverride(true)
    setEditValue(value !== undefined ? String(value) : '')
  }

  const handleUndo = () => {
    setIsOverride(false)
    const calc = computeCalc()
    if (calc !== null) onChange(set(calc))
    else               onChange(unset())
  }

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value)
    const num = parseFloat(e.target.value)
    if (!isNaN(num)) onChange(set(num))
    else if (e.target.value === '') onChange(unset())
  }

  const calc = computeCalc()

  if (!isOverride) {
    return (
      <Flex align="center" gap={2}>
        <Box flex={1}>
          <TextInput
            {...elementProps}
            readOnly
            value={value !== undefined ? String(value) : calc !== null ? String(calc) : '—'}
            style={{ color: 'var(--card-muted-fg-color)', cursor: 'default' }}
          />
        </Box>
        <Button
          icon={EditIcon}
          mode="bleed"
          tone="default"
          padding={2}
          title="Override manually"
          onClick={handleOverride}
          disabled={readOnly}
        />
      </Flex>
    )
  }

  return (
    <Flex align="center" gap={2}>
      <Box flex={1}>
        <TextInput
          {...elementProps}
          value={editValue}
          onChange={handleEditChange}
          disabled={readOnly}
          type="number"
        />
      </Box>
      <Button
        icon={UndoIcon}
        mode="bleed"
        tone="caution"
        padding={2}
        title="Reset to auto-calculated value"
        onClick={handleUndo}
        disabled={readOnly}
      />
    </Flex>
  )
}
