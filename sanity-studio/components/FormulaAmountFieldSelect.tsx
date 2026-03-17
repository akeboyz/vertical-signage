import { useFormValue } from 'sanity'
import { set, unset }   from 'sanity'
import type { StringInputProps } from 'sanity'

interface FieldDef {
  key?:       string
  label?:     string
  fieldType?: string
}

/**
 * FormulaAmountFieldSelect
 *
 * Dropdown listing non-date fields from this ContractType so the admin can
 * pick which field supplies the duration number (e.g. "Terms" containing "12").
 *
 * Path context: ['fieldDefinitions', {_key}, 'formula', 'amountField']
 * → own key lives at props.path.slice(0, -2) + 'key'
 */
export function FormulaAmountFieldSelect(props: StringInputProps) {
  const fieldDefs    = useFormValue(['fieldDefinitions']) as FieldDef[] | undefined
  const currentValue = props.value as string | undefined

  // props.path = ['fieldDefinitions', {_key}, 'formula', 'amountField']
  const ownKeyPath = [...props.path.slice(0, -2), 'key']
  const ownKey     = useFormValue(ownKeyPath) as string | undefined

  // Show number and string fields (not date / text) — these are where numeric durations live
  const options = (fieldDefs ?? [])
    .filter(f => f.key?.trim() && f.key !== ownKey && (f.fieldType === 'number' || f.fieldType === 'string'))
    .map(f => ({ key: f.key!, label: f.label?.trim() ? `${f.label} (${f.key})` : f.key! }))

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value
    props.onChange(v ? set(v) : unset())
  }

  return (
    <select
      value={currentValue ?? ''}
      onChange={handleChange}
      disabled={props.readOnly}
      style={{
        width:        '100%',
        padding:      '8px 12px',
        border:       '1px solid var(--card-border-color)',
        borderRadius: 4,
        fontFamily:   'inherit',
        fontSize:     14,
        background:   'var(--card-bg-color)',
        color:        'var(--card-fg-color)',
        cursor:       'pointer',
      }}
    >
      <option value="">— None —</option>
      {options.map(o => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
      {options.length === 0 && (
        <option disabled value="">No number/text fields found — add fields first, then publish</option>
      )}
    </select>
  )
}
