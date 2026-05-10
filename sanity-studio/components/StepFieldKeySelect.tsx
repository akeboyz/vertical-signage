import { useFormValue } from 'sanity'
import { set, unset }   from 'sanity'
import type { StringInputProps } from 'sanity'

interface FieldDef {
  key?:  string
  label?: string
}

/**
 * Dropdown listing fieldDefinitions[] defined on this Process Setup.
 * Used on steps[].fieldKey — shown only when triggerType is field_equals.
 *
 * Path context: ['steps', {_key}, 'fieldKey']
 * Reads from:   ['fieldDefinitions'] on the root document
 */
export function StepFieldKeySelect(props: StringInputProps) {
  const fieldDefs    = useFormValue(['fieldDefinitions']) as FieldDef[] | undefined
  const currentValue = props.value as string | undefined

  const options = (fieldDefs ?? [])
    .filter(f => f.key?.trim())
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
      <option value="">— Select field —</option>
      {options.length === 0
        ? <option key="__empty" disabled value="">No fields configured — add fields first, then publish</option>
        : options.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))
      }
    </select>
  )
}
