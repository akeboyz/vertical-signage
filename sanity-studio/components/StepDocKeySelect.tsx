import { useFormValue } from 'sanity'
import { set, unset }   from 'sanity'
import type { StringInputProps } from 'sanity'

interface DocDef {
  key?:  string
  name?: string
}

/**
 * Dropdown listing documents[] defined on this Process Setup.
 * Used on steps[].docKey — shown only when triggerType is doc_*.
 *
 * Path context: ['steps', {_key}, 'docKey']
 * Reads from:   ['documents'] on the root document
 */
export function StepDocKeySelect(props: StringInputProps) {
  const documents    = useFormValue(['documents']) as DocDef[] | undefined
  const currentValue = props.value as string | undefined

  const options = (documents ?? [])
    .filter(d => d.key?.trim())
    .map(d => ({ key: d.key!, label: d.name?.trim() ? `${d.name} (${d.key})` : d.key! }))

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
      <option value="">— Select document —</option>
      {options.length === 0
        ? <option key="__empty" disabled value="">No documents configured — add documents first, then publish</option>
        : options.map(o => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))
      }
    </select>
  )
}
