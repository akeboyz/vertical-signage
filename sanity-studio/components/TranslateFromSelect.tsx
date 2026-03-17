import { useFormValue } from 'sanity'
import { set, unset }   from 'sanity'
import type { StringInputProps } from 'sanity'

interface FieldDef {
  key?:   string
  label?: string
}

/**
 * TranslateFromSelect
 *
 * Renders a dropdown listing all field keys already defined on this ContractType,
 * so staff can pick a translate-source without typing free text.
 *
 * Used as: components: { input: TranslateFromSelect }
 * on the `translateFrom` field inside fieldDefinitions.
 */
export function TranslateFromSelect(props: StringInputProps) {
  const fieldDefs    = useFormValue(['fieldDefinitions']) as FieldDef[] | undefined
  const currentValue = props.value as string | undefined

  // Resolve the key of the field this component belongs to, so we can exclude it.
  // props.path is e.g. ['fieldDefinitions', {_key:'abc'}, 'translateFrom']
  const ownKeyPath = [...props.path.slice(0, -1), 'key']
  const ownKey     = useFormValue(ownKeyPath) as string | undefined

  const options = (fieldDefs ?? [])
    .filter(f => f.key?.trim() && f.key !== ownKey)
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
      <option value="">— None (no auto-translate) —</option>
      {options.map(o => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  )
}
