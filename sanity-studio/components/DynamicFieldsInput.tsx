import { useState, useEffect, useCallback, useRef } from 'react'
import { Stack, Text, TextInput, Card, Spinner, Flex, Badge, Label, Button } from '@sanity/ui'
import { set, unset } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue, useClient } from 'sanity'

const TRANSLATE_API_URL =
  process.env.SANITY_STUDIO_TRANSLATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/translate'

const FIELD_CHANGED_URL =
  process.env.SANITY_STUDIO_FIELD_CHANGED_URL ??
  'https://aquamx-handoff.netlify.app/api/field-changed'

interface Formula {
  baseField?:   string
  amountField?: string   // key of another field whose value is the duration number
  unit?:        'days' | 'months' | 'years'
}

interface FieldDef {
  key:                      string
  label:                    string
  fieldType:                'string' | 'number' | 'date' | 'text' | 'yes_no'
  required?:                boolean
  hint?:                    string
  translateFrom?:           string
  translateTargetLang?:     string
  formula?:                 Formula
  retrieveFromProjectSite?: boolean
  retrieveFromPsKey?:       string   // override: which PS field key to pull from
  _section?:                string   // internal: section header label
}

// ── Field metadata for Project Site and Party schema fields ──────────────────

const PS_META: Record<string, { label: string; fieldType: FieldDef['fieldType'] }> = {
  projectEn:                { label: 'Project Name (EN)',           fieldType: 'string' },
  projectTh:                { label: 'Project Name (TH)',           fieldType: 'string' },
  address:                  { label: 'Address',                     fieldType: 'text'   },
  btsStation:               { label: 'BTS / MRT Station',           fieldType: 'string' },
  area:                     { label: 'Area',                        fieldType: 'string' },
  totalUnits:               { label: 'Total Units',                 fieldType: 'number' },
  numberOfBuildings:        { label: 'No. of Buildings',            fieldType: 'number' },
  numberOfParking:          { label: 'No. of Parking',              fieldType: 'number' },
  commonFees:               { label: 'Common Fees',                 fieldType: 'string' },
  totalProjectArea:         { label: 'Total Project Area',          fieldType: 'string' },
  developer:                { label: 'Developer',                   fieldType: 'string' },
  completionYear:           { label: 'Completion Year',             fieldType: 'number' },
  percentSold:              { label: '% Sold',                      fieldType: 'number' },
  ownerOccupiedRented:      { label: 'Owner Occupied & Rented',     fieldType: 'string' },
  contactPerson:            { label: 'Contact Person',              fieldType: 'string' },
  telephone:                { label: 'Telephone',                   fieldType: 'string' },
  propertyManagementCompany:{ label: 'Property Management Company', fieldType: 'string' },
  emailAddress:             { label: 'Email Address',               fieldType: 'string' },
}

const PARTY_META: Record<string, { label: string; fieldType: FieldDef['fieldType'] }> = {
  legalName_th:  { label: 'Legal Name (Thai)',        fieldType: 'string' },
  legalName_en:  { label: 'Legal Name (English)',     fieldType: 'string' },
  taxId:         { label: 'Tax ID',                   fieldType: 'string' },
  registrationNo:{ label: 'Company Registration No.', fieldType: 'string' },
  juristicManager:{ label: 'Juristic Manager',        fieldType: 'string' },
  firstName:     { label: 'First Name',               fieldType: 'string' },
  lastName:      { label: 'Last Name',                fieldType: 'string' },
  nationalId:    { label: 'National ID',              fieldType: 'string' },
  phone:         { label: 'Phone',                    fieldType: 'string' },
  email:         { label: 'Email',                    fieldType: 'string' },
  lineId:        { label: 'LINE ID',                  fieldType: 'string' },
  addressFull:   { label: 'Address',                  fieldType: 'text'   },
  vatNumber:     { label: 'VAT Number',               fieldType: 'string' },
  billingAddress:{ label: 'Billing Address',          fieldType: 'text'   },
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
  const client           = useClient({ apiVersion: '2024-01-01' })
  const contractTypeRef  = useFormValue(['contractType', '_ref']) as string | undefined
  const projectSiteRef   = useFormValue(['projectSite',  '_ref']) as string | undefined
  const documentId       = (useFormValue(['_id']) as string | undefined)?.replace(/^drafts\./, '')

  const [fieldDefs,    setFieldDefs]    = useState<FieldDef[]>([])
  const [loading,      setLoading]      = useState(false)
  const [values,       setValues]       = useState<Record<string, string>>({})
  const [translating,  setTranslating]  = useState<string | null>(null)
  const [translateErr, setTranslateErr] = useState<Record<string, string>>({})
  const [retrieving,   setRetrieving]   = useState<string | null>(null)  // kept for future use
  const [suggestions,  setSuggestions]  = useState<Record<string, string>>({})
  const [retrieveErr,  setRetrieveErr]  = useState<Record<string, string>>({})

  // ── Project Site / Party auto-fill ────────────────────────────────────────
  const [psKeys,    setPsKeys]    = useState<string[]>([])
  const [partyKeys, setPartyKeys] = useState<string[]>([])
  const [psOptions,    setPsOptions]    = useState<{ _id: string; label: string }[]>([])
  const [partyOptions, setPartyOptions] = useState<{ _id: string; label: string }[]>([])
  const [fillingPs,    setFillingPs]    = useState(false)
  const [fillingParty, setFillingParty] = useState(false)

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
      .fetch<{ fieldDefinitions?: FieldDef[]; projectSiteFields?: string[]; partyFields?: string[] }>(
        `*[_id == $id][0]{ fieldDefinitions, projectSiteFields, partyFields }`,
        { id: contractTypeRef },
      )
      .then(async ct => {
        const ps     = ct?.projectSiteFields ?? []
        const party  = ct?.partyFields       ?? []
        const custom = ct?.fieldDefinitions  ?? []

        setPsKeys(ps)
        setPartyKeys(party)

        // Build FieldDef objects from schema field selections
        const psFields: FieldDef[] = ps.map((key, i) => ({
          key,
          label:     PS_META[key]?.label     ?? key,
          fieldType: PS_META[key]?.fieldType ?? 'string',
          _section:  i === 0 ? 'Project Site' : undefined,
        }))

        const partyFieldsList: FieldDef[] = party.map((key, i) => ({
          key,
          label:     PARTY_META[key]?.label     ?? key,
          fieldType: PARTY_META[key]?.fieldType ?? 'string',
          _section:  i === 0 ? 'Party' : undefined,
        }))

        const customWithSection: FieldDef[] = custom.map((f, i) => ({
          ...f,
          _section: i === 0 && (ps.length > 0 || party.length > 0) ? 'Details' : undefined,
        }))

        setFieldDefs([...psFields, ...partyFieldsList, ...customWithSection])

        // Fetch picker options if needed
        if (ps.length > 0) {
          client.fetch<{ _id: string; projectEn?: string }[]>(
            `*[_type == "projectSite"] | order(projectEn asc) { _id, projectEn }`,
          ).then(rows => setPsOptions((rows ?? []).map(r => ({ _id: r._id, label: r.projectEn ?? r._id }))))
            .catch(() => {})
        }
        if (party.length > 0) {
          client.fetch<{ _id: string; legalName_en?: string; legalName_th?: string; firstName?: string; lastName?: string }[]>(
            `*[_type == "party"] | order(legalName_en asc) { _id, legalName_en, legalName_th, firstName, lastName }`,
          ).then(rows => setPartyOptions((rows ?? []).map(r => ({
            _id: r._id,
            label: r.legalName_en ?? r.legalName_th ?? [r.firstName, r.lastName].filter(Boolean).join(' ') ?? r._id,
          })))).catch(() => {})
        }
      })
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
        body:    JSON.stringify({
          text:       sourceText,
          targetLang: f.translateTargetLang ?? 'English',
          sourceLang: (f.translateTargetLang ?? 'English') === 'Thai' ? 'English' : 'Thai',
        }),
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

  const handleRetrieve = useCallback(async (key: string, psKey?: string) => {
    if (!projectSiteRef) return
    setRetrieving(key)
    setRetrieveErr(prev => ({ ...prev, [key]: '' }))
    try {
      const doc = await client.fetch<Record<string, any>>(`*[_id == $id][0]`, { id: projectSiteRef })
      if (!doc) { setRetrieveErr(prev => ({ ...prev, [key]: 'Project site not found.' })); return }
      // Use the mapped PS key if provided, otherwise fall back to the field's own key
      const lookupKey = psKey || key
      const val = doc[lookupKey]
      if (val !== undefined && val !== null) {
        setSuggestions(prev => ({ ...prev, [key]: String(val) }))
      } else {
        setRetrieveErr(prev => ({ ...prev, [key]: `Field "${lookupKey}" has no value on the linked project site.` }))
      }
    } catch (err: any) {
      setRetrieveErr(prev => ({ ...prev, [key]: err?.message ?? 'Retrieve failed.' }))
    } finally {
      setRetrieving(null)
    }
  }, [projectSiteRef, client])

  const handleFillFromPs = useCallback(async (psId: string) => {
    if (!psId || psKeys.length === 0) return
    setFillingPs(true)
    try {
      const doc = await client.fetch<Record<string, any>>(`*[_id == $id][0]`, { id: psId })
      if (!doc) return
      setValues(prev => {
        const next = { ...prev }
        for (const key of psKeys) {
          const val = doc[key]
          if (val !== undefined && val !== null) next[key] = String(val)
        }
        props.onChange(set(JSON.stringify(next)))
        return next
      })
    } catch { /* ignore */ } finally { setFillingPs(false) }
  }, [psKeys, client, props])

  const handleFillFromParty = useCallback(async (partyId: string) => {
    if (!partyId || partyKeys.length === 0) return
    setFillingParty(true)
    try {
      const doc = await client.fetch<Record<string, any>>(`*[_id == $id][0]`, { id: partyId })
      if (!doc) return
      setValues(prev => {
        const next = { ...prev }
        for (const key of partyKeys) {
          const val = doc[key]
          if (val !== undefined && val !== null) next[key] = String(val)
        }
        props.onChange(set(JSON.stringify(next)))
        return next
      })
    } catch { /* ignore */ } finally { setFillingParty(false) }
  }, [partyKeys, client, props])

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
        if (!f) return null
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

        const suggestion     = suggestions[f.key]
        const isRetrieving   = retrieving === f.key
        const rErr           = retrieveErr[f.key]

        return (
          <Stack space={2} key={f.key}>
            {f._section && (
              <Box paddingTop={2}>
                <Flex align="center" justify="space-between" gap={3}>
                  <Text size={0} weight="semibold" muted style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {f._section}
                  </Text>

                  {/* Auto-fill picker for Project Site section */}
                  {f._section === 'Project Site' && psOptions.length > 0 && (
                    <Flex align="center" gap={2}>
                      {fillingPs && <Spinner muted />}
                      <select
                        defaultValue=""
                        disabled={fillingPs}
                        onChange={e => handleFillFromPs(e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--card-border-color)', background: 'var(--card-bg-color)', color: 'var(--card-fg-color)', cursor: 'pointer' }}
                      >
                        <option value="">↙ Fill from Project Site…</option>
                        {psOptions.map(o => <option key={o._id} value={o._id}>{o.label}</option>)}
                      </select>
                    </Flex>
                  )}

                  {/* Auto-fill picker for Party section */}
                  {f._section === 'Party' && partyOptions.length > 0 && (
                    <Flex align="center" gap={2}>
                      {fillingParty && <Spinner muted />}
                      <select
                        defaultValue=""
                        disabled={fillingParty}
                        onChange={e => handleFillFromParty(e.target.value)}
                        style={{ fontSize: 12, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--card-border-color)', background: 'var(--card-bg-color)', color: 'var(--card-fg-color)', cursor: 'pointer' }}
                      >
                        <option value="">↙ Fill from Party…</option>
                        {partyOptions.map(o => <option key={o._id} value={o._id}>{o.label}</option>)}
                      </select>
                    </Flex>
                  )}
                </Flex>
              </Box>
            )}
            <Flex align="center" gap={2}>
              <Label size={1}>{f.label}</Label>
              {f.required && (
                <Badge tone="critical" radius={2}>Required</Badge>
              )}
              <Badge mode="outline" fontSize={0} style={{ fontFamily: 'monospace' }}>{`{{${f.key}}}`}</Badge>
            </Flex>

            {f.fieldType === 'yes_no' ? (
              values[f.key] === 'yes' ? (
                <Card padding={3} radius={2} tone="positive" border>
                  <Flex align="center" justify="space-between" gap={3}>
                    <Flex align="center" gap={2}>
                      <Text size={2}>✅</Text>
                      <Text size={1} weight="semibold">Yes</Text>
                    </Flex>
                    <Button
                      text="Reset to No"
                      mode="ghost"
                      tone="default"
                      fontSize={1}
                      padding={2}
                      onClick={() => {
                        handleChange(f.key, 'no')
                        if (documentId) fetch(FIELD_CHANGED_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, fieldKey: f.key, fieldValue: 'no' }) }).catch(() => {})
                      }}
                    />
                  </Flex>
                </Card>
              ) : (
                <Card padding={3} radius={2} tone="default" border>
                  <Flex align="center" justify="space-between" gap={3}>
                    <Flex align="center" gap={2}>
                      <Text size={2}>⬜</Text>
                      <Text size={1} muted>No</Text>
                    </Flex>
                    <Button
                      text="✓ Mark as Yes"
                      tone="positive"
                      fontSize={1}
                      padding={2}
                      onClick={() => {
                        handleChange(f.key, 'yes')
                        if (documentId) fetch(FIELD_CHANGED_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId, fieldKey: f.key, fieldValue: 'yes' }) }).catch(() => {})
                      }}
                    />
                  </Flex>
                </Card>
              )
            ) : f.fieldType === 'text' ? (
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
            {f.fieldType !== 'yes_no' && f.hint && (
              <Text size={1} muted>{f.hint}</Text>
            )}

            {/* ── Recalculate button (only when formula is configured) ─────── */}
            {f.fieldType !== 'yes_no' && baseField && amountField && unit && (
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
            {f.fieldType !== 'yes_no' && f.translateFrom && (
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

            {/* ── Retrieve from Project Site button ───────────────────────── */}
            {f.fieldType !== 'yes_no' && f.retrieveFromProjectSite && (
              <>
                {suggestion && (
                  <Card padding={3} radius={2} tone="positive" border>
                    <Stack space={2}>
                      <Text size={0} muted weight="semibold">From Project Site:</Text>
                      <Text size={1}>{suggestion}</Text>
                      <Flex gap={2}>
                        <Button text="Apply" tone="positive" fontSize={1} padding={2} onClick={() => { handleChange(f.key, suggestion); setSuggestions(prev => ({ ...prev, [f.key]: '' })) }} />
                        <Button text="Dismiss" mode="ghost" fontSize={1} padding={2} onClick={() => setSuggestions(prev => ({ ...prev, [f.key]: '' }))} />
                      </Flex>
                    </Stack>
                  </Card>
                )}
                <Flex align="center" gap={2}>
                  {isRetrieving ? (
                    <>
                      <Spinner muted />
                      <Text size={1} muted>Retrieving…</Text>
                    </>
                  ) : (
                    <Button
                      text="↙ Retrieve from Project Site"
                      mode="ghost"
                      tone="primary"
                      fontSize={1}
                      padding={2}
                      disabled={!projectSiteRef || isRetrieving}
                      title={!projectSiteRef ? 'Link a Project Site on this document first' : `Retrieve "${f.label}" from the linked project site`}
                      onClick={() => handleRetrieve(f.key, f.retrieveFromPsKey)}
                    />
                  )}
                </Flex>
                {rErr && <Text size={0} style={{ color: '#e05252' }}>{rErr}</Text>}
              </>
            )}
          </Stack>
        )
      })}
    </Stack>
  )
}
