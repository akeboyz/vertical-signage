import { useState, useCallback } from 'react'
import { useToast, Box, Stack, Text, Button, Flex, Card, Spinner } from '@sanity/ui'
import type { DocumentActionProps } from 'sanity'
import { useDocumentOperation } from 'sanity'

const LOOKUP_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/lookup-party'

interface LookupResult {
  addressFull?:     string | null
  phone?:           string | null
  email?:           string | null
  taxId?:           string | null
  registrationNo?:  string | null
  juristicManager?: string | null
  website?:         string | null
}

const FIELD_META: { key: keyof LookupResult; label: string; sanityField: string }[] = [
  { key: 'addressFull',     label: 'Address',              sanityField: 'addressFull'     },
  { key: 'phone',           label: 'Phone',                sanityField: 'phone'           },
  { key: 'email',           label: 'Email',                sanityField: 'email'           },
  { key: 'taxId',           label: 'Tax ID',               sanityField: 'taxId'           },
  { key: 'registrationNo',  label: 'Registration Number',  sanityField: 'registrationNo'  },
  { key: 'juristicManager', label: 'Contact Person',       sanityField: 'juristicManager' },
  { key: 'website',         label: 'Website',              sanityField: 'website'         },
]

/**
 * Document action for party — looks up company info using AI
 * and lets the user apply selected fields.
 */
export function AIPartyLookupAction(props: DocumentActionProps) {
  const { patch } = useDocumentOperation(props.id, props.type)
  const toast      = useToast()

  const doc         = (props.draft ?? props.published) as any
  const companyName = (doc?.legalName_en ?? doc?.legalName_th ?? doc?.legalName) as string | undefined

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<LookupResult | null>(null)
  const [selected,   setSelected]   = useState<Record<string, boolean>>({})
  const [error,      setError]      = useState('')

  const runLookup = useCallback(async () => {
    if (!companyName?.trim()) return
    setDialogOpen(true)
    setLoading(true)
    setResult(null)
    setError('')
    setSelected({})

    try {
      const res  = await fetch(LOOKUP_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ companyName }),
      })
      const data = await res.json() as LookupResult
      if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`)

      const sel: Record<string, boolean> = {}
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined) sel[k] = true
      }
      setResult(data)
      setSelected(sel)
    } catch (err: any) {
      setError(err?.message ?? 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }, [companyName])

  const applySelected = useCallback(() => {
    if (!result) return
    const patchSet: Record<string, unknown> = {}
    for (const { key, sanityField } of FIELD_META) {
      if (selected[key] && result[key] != null) {
        patchSet[sanityField] = result[key]
      }
    }
    if (Object.keys(patchSet).length === 0) return
    patch.execute([{ set: patchSet }])
    toast.push({
      status:      'success',
      title:       'Fields updated',
      description: `Applied ${Object.keys(patchSet).length} field(s). Please verify and publish.`,
      duration:    6000,
    })
    setDialogOpen(false)
  }, [result, selected, patch, toast])

  const hasResults    = result && FIELD_META.some(f => result[f.key] != null)
  const selectedCount = Object.values(selected).filter(Boolean).length

  return {
    label:    '🔍 AI Lookup',
    title:    companyName?.trim()
      ? `Look up company info for "${companyName}"`
      : 'Fill in Legal Name (EN) first to use AI Lookup',
    disabled: !companyName?.trim(),
    onHandle: runLookup,

    dialog: dialogOpen ? {
      type:    'dialog' as const,
      header:  `AI Lookup — ${companyName}`,
      onClose: () => setDialogOpen(false),
      content: (
        <Box padding={4}>
          <Stack space={4}>

            {loading && (
              <Flex align="center" gap={3} padding={4} justify="center">
                <Spinner />
                <Text size={2}>Searching for "{companyName}"…</Text>
              </Flex>
            )}

            {error && (
              <Card tone="critical" padding={3} radius={2} border>
                <Text size={1}>{error}</Text>
              </Card>
            )}

            {!loading && hasResults && (
              <Stack space={3}>
                <Text size={1} muted>
                  Select the fields you want to apply. <strong>Always verify before publishing.</strong>
                </Text>

                {FIELD_META.map(({ key, label }) => {
                  const val = result![key]
                  if (val == null) return null
                  const isChecked = !!selected[key]
                  return (
                    <Card
                      key={key}
                      padding={3}
                      radius={2}
                      border
                      tone={isChecked ? 'positive' : 'default'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(prev => ({ ...prev, [key]: !prev[key] }))}
                    >
                      <Flex align="center" gap={3}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => setSelected(prev => ({ ...prev, [key]: !prev[key] }))}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <Stack space={1} style={{ flex: 1 }}>
                          <Text size={0} weight="semibold" muted>{label}</Text>
                          <Text size={1}>{String(val)}</Text>
                        </Stack>
                      </Flex>
                    </Card>
                  )
                })}

                <Card padding={3} radius={2} tone="caution" border>
                  <Text size={0} muted>
                    ⚠ AI-generated data may be inaccurate. Always verify tax ID, registration number,
                    and contact details against official sources before publishing.
                  </Text>
                </Card>

                <Flex gap={2} justify="flex-end">
                  <Button
                    text="Cancel"
                    mode="ghost"
                    onClick={() => setDialogOpen(false)}
                  />
                  <Button
                    text={`Apply ${selectedCount} field${selectedCount !== 1 ? 's' : ''}`}
                    tone="primary"
                    disabled={selectedCount === 0}
                    onClick={applySelected}
                  />
                </Flex>
              </Stack>
            )}

            {!loading && !error && !hasResults && result !== null && (
              <Stack space={3}>
                <Card padding={4} tone="transparent" border radius={2}>
                  <Text size={1} muted align="center">
                    No information found for this company. Try using the full legal name (e.g. include "Co., Ltd." or "Public Company Limited").
                  </Text>
                </Card>
                <Flex justify="flex-end">
                  <Button text="Close" mode="ghost" onClick={() => setDialogOpen(false)} />
                </Flex>
              </Stack>
            )}

          </Stack>
        </Box>
      ),
    } : undefined,
  }
}
