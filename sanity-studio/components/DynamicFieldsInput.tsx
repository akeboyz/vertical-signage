import { useState, useEffect, useCallback, useRef } from 'react'
import { Stack, Text, TextInput, Card, Spinner, Flex, Badge, Label, Button } from '@sanity/ui'
import { set, unset } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue, useClient } from 'sanity'

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

interface Formula {
  baseField?:   string
  amountField?: string   // key of another field whose value is the duration number
  unit?:        'days' | 'months' | 'years'
}

interface FieldDef {
  key:            string
  label:          string
  fieldType:      'string' | 'number' | 'date' | 'text'
  required?:      boolean
  hint?:          string
  translateFrom?: string
  formula?:       Formula
}

/** Calculate a new YYYY-MM-DD date by adding a duration to a base date string. */
function calcDate(base: string, amount: number, unit: Formula['unit']): string | null {
  if (!base || !/^\d{4}-\d{2}-\d{2}$/.test(base) || !amount) return null
  const d = new Date(base + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  if (unit === 'days')   d.setDate(d.getDate() + amount)
  if (unit === 'months') d.setMonth(d.getMonth() + amount)
  if (unit === 'years')  d.setFullYear(d.getFullYear() + amount)
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dy}`
}

/**
 * DynamicFieldsInput
 *
 * Renders one input per field definition fetched from the selected ContractType.
 * Values are serialised as a JSON string in the parent `dynamicFields` field.
 */
export function DynamicFieldsInput(props: StringInputProps) {
  const client          = useClient({ apiVersion: '2024-01-01' })
  const contractTypeRef = useFormValue(['contractType', '_ref']) as string | undefined

  const [fieldDefs,    setFieldDefs]    = useState<FieldDef[]>([])
  const [loading,      setLoading]      = useState(false)
  const [values,       setValues]       = useState<Record<string, string>>({})
  const [translating,  setTranslating]  = useState<string | null>(null)
  const [translateErr, setTranslateErr] = useState<Record<string, string>>({})

  // Track previous values to detect which base field changed
  const prevValuesRef = useRef<Record<string, string>>({})

  // Parse current JSON value once on mount
  useEffect(() => {
    try {
      const raw = props.value as string | undefined
      setValues(raw ? JSON.parse(raw) : {})
    } catch {
      setValues({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fetch field definitions when contractType changes
  useEffect(() => {
    if (!contractTypeRef) { setFieldDefs([]); return }
    setLoading(true)
    client
      .fetch<{ fieldDefinitions?: FieldDef[] }>(
        `*[_id == $id][0]{ fieldDefinitions }`,
        { id: contractTypeRef },
      )
      .then(ct => setFieldDefs(ct?.fieldDefinitions ?? []))
      .catch(() => setFieldDefs([]))
      .finally(() => setLoading(false))
  }, [contractTypeRef, client])

  // Auto-fill formula fields when their base date or amount field changes (only if target is empty)
  useEffect(() => {
    const prev = prevValuesRef.current
    for (const f of fieldDefs) {
      const { baseField, amountField, unit } = f.formula ?? {}
      if (!baseField || !amountField || !unit) continue
      const baseVal     = values[baseField]
      const amountRaw   = values[amountField]
      const amount      = parseFloat(amountRaw)
      const prevBaseVal = prev[baseField]
      const prevAmount  = prev[amountField]
      // Trigger when base date or amount changes
      const changed = (baseVal && baseVal !== prevBaseVal) || (amountRaw && amountRaw !== prevAmount)
      if (changed && baseVal && !isNaN(amount) && !values[f.key]) {
        const calc = calcDate(baseVal, amount, unit)
        if (calc) {
          setValues(current => {
            if (current[f.key]) return current   // already filled by user — skip
            const next = { ...current, [f.key]: calc }
            props.onChange(set(JSON.stringify(next)))
            return next
          })
        }
      }
    }
    prevValuesRef.current = { ...values }
  }, [values, fieldDefs]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((key: string, value: string) => {
    setValues(prev => {
      const next = { ...prev, [key]: value }
      const json = JSON.stringify(next)
      props.onChange(json === '{}' ? unset() : set(json))
      return next
    })
  }, [props])

  const handleTranslate = useCallback(async (f: FieldDef) => {
    if (!f.translateFrom) return
    const sourceText = values[f.translateFrom]
    if (!sourceText?.trim()) return
    setTranslating(f.key)
    setTranslateErr(prev => ({ ...prev, [f.key]: '' }))
    try {
      const res  = await fetch(TRANSLATE_API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text: sourceText }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      handleChange(f.key, data.translated)
    } catch (err: any) {
      setTranslateErr(prev => ({ ...prev, [f.key]: err?.message ?? 'Translation failed' }))
    } finally {
      setTranslating(null)
    }
  }, [values, handleChange])

  if (!contractTypeRef) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>Select a Contract Type above to see the fields for this contract.</Text>
      </Card>
    )
  }

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading fields…</Text>
      </Flex>
    )
  }

  if (fieldDefs.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>No fields defined for this contract type yet. Go to Contract Types to add fields.</Text>
      </Card>
    )
  }

  return (
    <Stack space={5}>
      {fieldDefs.map(f => {
        const sourceText    = f.translateFrom ? values[f.translateFrom] : undefined
        const canTranslate  = !!f.translateFrom && !!sourceText?.trim()
        const isTranslating = translating === f.key
        const tErr          = translateErr[f.key]

        // Formula
        const { baseField, amountField, unit } = f.formula ?? {}
        const baseVal     = baseField    ? values[baseField]    : undefined
        const amountRaw   = amountField  ? values[amountField]  : undefined
        const amount      = parseFloat(amountRaw ?? '')
        const calcPreview = baseVal && !isNaN(amount) && unit ? calcDate(baseVal, amount, unit) : null
        const canRecalc   = !!calcPreview && calcPreview !== values[f.key]

        return (
          <Stack space={2} key={f.key}>
            <Flex align="center" gap={2}>
              <Label size={1}>{f.label}</Label>
              {f.required && (
                <Badge tone="critical" radius={2}>Required</Badge>
              )}
              <Text size={0} muted style={{ fontFamily: 'monospace', opacity: 0.55 }}>{`{{${f.key}}}`}</Text>
            </Flex>

            {f.fieldType === 'text' ? (
              <textarea
                rows={3}
                value={values[f.key] ?? ''}
                onChange={e => handleChange(f.key, e.target.value)}
                placeholder={f.label}
                style={{
                  width:        '100%',
                  padding:      '8px 12px',
                  border:       '1px solid var(--card-border-color)',
                  borderRadius: 4,
                  fontFamily:   'inherit',
                  fontSize:     14,
                  resize:       'vertical',
                  background:   'var(--card-bg-color)',
                  color:        'var(--card-fg-color)',
                  boxSizing:    'border-box',
                }}
              />
            ) : (
              <TextInput
                type={f.fieldType === 'date' ? 'date' : 'text'}
                inputMode={f.fieldType === 'number' ? 'decimal' : undefined}
                value={values[f.key] ?? ''}
                onChange={e => handleChange(f.key, (e.target as HTMLInputElement).value)}
                placeholder={f.fieldType === 'number' ? 'e.g. 25000' : f.label}
              />
            )}

            {/* ── Hint text ───────────────────────────────────────────────── */}
            {f.hint && (
              <Text size={1} muted>{f.hint}</Text>
            )}

            {/* ── Recalculate button (only when formula is configured) ─────── */}
            {baseField && amountField && unit && (
              <Flex align="center" gap={2}>
                <Button
                  text={canRecalc
                    ? `📅 Recalculate → ${calcPreview}`
                    : `📅 Formula: {{${baseField}}} + {{${amountField}}} ${unit}`}
                  mode="ghost"
                  tone={canRecalc ? 'caution' : 'default'}
                  fontSize={1}
                  padding={2}
                  disabled={!canRecalc}
                  title={canRecalc
                    ? `Update to ${calcPreview}`
                    : !baseVal   ? `Fill in {{${baseField}}} first`
                    : isNaN(amount) ? `{{${amountField}}} must be a number`
                    : 'Already matches formula'}
                  onClick={() => canRecalc && handleChange(f.key, calcPreview!)}
                />
              </Flex>
            )}

            {/* ── Translate button (only if translateFrom is set) ─────────── */}
            {f.translateFrom && (
              <Flex align="center" gap={2}>
                {isTranslating ? (
                  <>
                    <Spinner muted />
                    <Text size={1} muted>Translating…</Text>
                  </>
                ) : (
                  <Button
                    text={`✨ Translate from {{${f.translateFrom}}}`}
                    mode="ghost"
                    tone="primary"
                    fontSize={1}
                    padding={2}
                    disabled={!canTranslate}
                    title={canTranslate ? `Auto-translate from the "${f.translateFrom}" field` : `Fill in "${f.translateFrom}" first`}
                    onClick={() => handleTranslate(f)}
                  />
                )}
                {!canTranslate && !isTranslating && (
                  <Text size={0} muted>Fill in <code>{f.translateFrom}</code> first</Text>
                )}
              </Flex>
            )}

            {tErr && (
              <Text size={0} style={{ color: '#e05252' }}>{tErr}</Text>
            )}
          </Stack>
        )
      })}
    </Stack>
  )
}
