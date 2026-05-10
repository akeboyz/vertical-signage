import { useState, useEffect } from 'react'
import { TextInput } from '@sanity/ui'
import { set, unset } from 'sanity'
import type { StringInputProps } from 'sanity'

function formatWithCommas(raw: string): string {
  const stripped = raw.replace(/,/g, '').trim()
  if (stripped === '') return ''
  const n = Number(stripped)
  if (isNaN(n)) return raw   // e.g. "Government rate" — leave unchanged
  const parts = n.toString().split('.')
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return parts.join('.')
}

/**
 * String input that auto-formats numeric values with thousand separators.
 * Formats immediately on load and on blur.
 * Non-numeric text (e.g. "Government rate") is left unchanged.
 */
export function NumericFormatInput(props: StringInputProps) {
  const [display, setDisplay] = useState(() => formatWithCommas(props.value ?? ''))

  // Auto-format and save when the stored value loads or changes externally
  useEffect(() => {
    const formatted = formatWithCommas(props.value ?? '')
    setDisplay(formatted)
    // If the stored value differs from the formatted version, save it immediately
    if (props.value && formatted !== props.value) {
      props.onChange(set(formatted))
    }
  }, [props.value])

  return (
    <TextInput
      {...props.elementProps}
      value={display}
      onChange={e => setDisplay(e.currentTarget.value)}
      onBlur={() => {
        const formatted = formatWithCommas(display)
        setDisplay(formatted)
        props.onChange(formatted ? set(formatted) : unset())
      }}
    />
  )
}
