import { useFormValue } from 'sanity'
import { set, unset }   from 'sanity'
import type { StringInputProps } from 'sanity'

interface FieldDef {
  key?:       string
  label?:     string
  fieldType?: string
}

/**
 * FormulaBaseFieldSelect
 *
 * Dropdown listing only date-type fields from this ContractType,
 * excluding the field this formula belongs to.
 *
 * Path context: ['fieldDefinitions', {_key}, 'formula', 'baseField']
 * → own key lives at ['fieldDefinitions', {_key}, 'key']  (slice 0,-2 + 'key')
 */
export function FormulaBaseFieldSelect(props: StringInputProps) {
  const fieldDefs    = useFormValue(['fieldDefinitions']) as FieldDef[] | undefined
  const currentValue = props.value as string | undefined

  // props.path = ['fieldDefinitions', {_key}, 'formula', 'baseField']
  // parent item path = slice(0, -2) → ['fieldDefinitions', {_key}]
  const ownKeyPath = [...props.path.slice(0, -2), 'key']
  const ownKey     = useFormValue(ownKeyPath) as string | undefined

  const options = (fieldDefs ?? [])
    .filter(f => f.key?.trim() && f.fieldType === 'date' && f.key !== ownKey)
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
      <option value="">— None (no formula) —</option>
      {options.map(o => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
      {options.length === 0 && (
        <option disabled value="">No date fields found — add date fields first, then publish</option>
      )}
    </select>
  )
}
