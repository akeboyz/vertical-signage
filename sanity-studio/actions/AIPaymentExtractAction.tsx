/**
 * AIPaymentExtractAction
 *
 * Document action for Payment — reads uploaded supporting documents (invoices,
 * quotations, POs) via Claude Vision and lets the user review and apply
 * extracted fields (amount, VAT, WHT, due date, currency, description).
 *
 * Only enabled when at least one supporting document with a file is attached.
 * Uses useClient to patch the draft directly (avoids useDocumentOperation
 * which can throw on __edit__ URLs for payment documents).
 */

import { useState, useCallback } from 'react'
import { useClient }             from 'sanity'
import { useToast, Box, Stack, Text, Button, Flex, Card, Spinner, Badge } from '@sanity/ui'
import type { DocumentActionProps } from 'sanity'

const EXTRACT_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/extract-payment'

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

// Convert Sanity file asset _ref to a public CDN URL
// ref format: "file-{hash}-{ext}"  →  cdn.sanity.io/files/{project}/{dataset}/{hash}.{ext}
function fileRefToUrl(ref: string): string | null {
  if (!ref?.startsWith('file-')) return null
  const body     = ref.slice('file-'.length)   // e.g. "abc123def456-pdf"
  const lastDash = body.lastIndexOf('-')
  if (lastDash === -1) return null
  const hash = body.slice(0, lastDash)          // "abc123def456"
  const ext  = body.slice(lastDash + 1)         // "pdf"
  return `https://cdn.sanity.io/files/${PROJECT_ID}/${DATASET}/${hash}.${ext}`
}

const WHT_DISPLAY: Record<string, string> = {
  none: 'None', '0': '0%', '3': '3%', '5': '5%', '10': '10%', custom: 'Custom',
}

const VAT_DISPLAY: Record<string, string> = {
  inclusive: 'Inclusive (VAT in price)',
  exclusive: 'Exclusive (VAT added on top)',
  zero:      '0% VAT',
  none:      'No VAT',
}

interface ExtractResult {
  vendorName?:          string | null
  paymentAmount?:       number | null
  vatType?:             string | null
  vatAmount?:           number | null
  withholdingTaxRate?:  string | null
  withholdingTaxCustom?: number | null
  currency?:            string | null
  dueDate?:             string | null
  invoiceDate?:         string | null
  expenseDescription?:  string | null
}

interface FieldMeta {
  key:         keyof ExtractResult
  label:       string
  sanityField: string
  format?:     (v: any) => string
}

const FIELD_META: FieldMeta[] = [
  { key: 'vendorName',         label: 'Vendor Name',            sanityField: '',                   format: v => `${v}  (reference only — select vendor manually)` },
  { key: 'paymentAmount',      label: '1.6 · Total Obligation', sanityField: 'paymentAmount',      format: v => Number(v).toLocaleString() },
  { key: 'currency',           label: '1.7 · Currency',         sanityField: 'currency'            },
  { key: 'vatType',            label: '1.9 · VAT Type',         sanityField: 'vatType',            format: v => VAT_DISPLAY[v] ?? v },
  { key: 'vatAmount',          label: '1.10 · VAT Amount',      sanityField: 'vatAmount',          format: v => Number(v).toLocaleString() },
  { key: 'withholdingTaxRate', label: '1.14 · WHT Rate',        sanityField: 'withholdingTaxRate', format: v => WHT_DISPLAY[v] ?? v },
  { key: 'withholdingTaxCustom', label: '1.15 · WHT Amount',  sanityField: 'withholdingTaxCustom', format: v => Number(v).toLocaleString() },
  { key: 'dueDate',            label: '1.16 · Due Date',        sanityField: 'dueDate'             },
  { key: 'invoiceDate',        label: 'Invoice Date',           sanityField: '',                   format: v => `${v}  (reference only — not a payment field)` },
  { key: 'expenseDescription', label: '3.3 · Payment Notes',    sanityField: 'expenseDescription'  },
]

export function AIPaymentExtractAction(props: DocumentActionProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()

  const doc          = (props.draft ?? props.published) as any
  const supportingDocs: any[] = doc?.supportingDocs ?? []

  // Collect all file asset refs from supporting docs
  const fileUrls: string[] = supportingDocs
    .map((d: any) => d?.file?.asset?._ref)
    .filter(Boolean)
    .map(fileRefToUrl)
    .filter((u): u is string => u !== null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [result,     setResult]     = useState<ExtractResult | null>(null)
  const [selected,   setSelected]   = useState<Partial<Record<keyof ExtractResult, boolean>>>({})
  const [error,      setError]      = useState('')

  const runExtract = useCallback(async () => {
    if (fileUrls.length === 0) return
    setDialogOpen(true)
    setLoading(true)
    setResult(null)
    setError('')
    setSelected({})

    try {
      const res  = await fetch(EXTRACT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fileUrls }),
      })
      const data = await res.json() as ExtractResult
      if (!res.ok) throw new Error((data as any).error ?? `HTTP ${res.status}`)

      // Pre-select all fields that have non-null values, except reference-only fields
      const sel: Partial<Record<keyof ExtractResult, boolean>> = {}
      for (const { key, sanityField } of FIELD_META) {
        const val = data[key]
        if (val != null && sanityField) sel[key] = true   // only auto-select patchable fields
      }
      setResult(data)
      setSelected(sel)
    } catch (err: any) {
      setError(err?.message ?? 'Extraction failed')
    } finally {
      setLoading(false)
    }
  }, [fileUrls])   // eslint-disable-line react-hooks/exhaustive-deps

  const applySelected = useCallback(async () => {
    if (!result) return

    const patchSet: Record<string, unknown> = {}
    for (const { key, sanityField } of FIELD_META) {
      if (!sanityField) continue              // reference-only — skip
      if (!selected[key]) continue
      const val = result[key]
      if (val == null) continue
      patchSet[sanityField] = val
    }

    if (Object.keys(patchSet).length === 0) return

    const draftId = `drafts.${props.id}`
    try {
      // Ensure a draft exists before patching
      if (!props.draft && props.published) {
        const { _rev, _createdAt, _updatedAt, ...base } = props.published as any
        await client.createIfNotExists({ ...base, _id: draftId })
      }
      await client.patch(draftId).set(patchSet).commit()
      toast.push({
        status:      'success',
        title:       'Fields applied',
        description: `${Object.keys(patchSet).length} field(s) written to draft. Verify and publish when ready.`,
        duration:    6000,
      })
      setDialogOpen(false)
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Failed to apply fields', description: err?.message, duration: 6000 })
    }
  }, [result, selected, props, client, toast])   // eslint-disable-line react-hooks/exhaustive-deps

  const hasResults    = result && FIELD_META.some(f => result[f.key] != null)
  const selectedCount = Object.values(selected).filter(Boolean).length
  const docCount      = fileUrls.length
  const docLabel      = docCount === 1 ? '1 document' : `${docCount} documents`

  const disabledReason = fileUrls.length === 0
    ? 'Upload at least one file in 1.16 · Supporting Documents to use AI extraction'
    : null

  return {
    label:    '🤖 Extract from Doc',
    title:    disabledReason ?? `Extract payment data from ${docLabel} with AI`,
    disabled: !!disabledReason,
    onHandle: runExtract,

    dialog: dialogOpen ? {
      type:    'dialog' as const,
      header:  '🤖 AI Payment Extraction',
      onClose: () => setDialogOpen(false),
      content: (
        <Box padding={4} style={{ maxWidth: 560 }}>
          <Stack space={4}>

            {loading && (
              <Flex align="center" gap={3} padding={4} justify="center">
                <Spinner />
                <Text size={2}>Reading {docLabel}…</Text>
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
                  Select fields to apply to this payment draft.{' '}
                  <strong>Always verify amounts and dates before publishing.</strong>
                </Text>

                {FIELD_META.map(({ key, label, sanityField, format }) => {
                  const val = result![key]
                  if (val == null) return null

                  const isReferenceOnly = !sanityField
                  const isChecked       = !!selected[key]
                  const displayVal      = format ? format(val) : String(val)

                  return (
                    <Card
                      key={key}
                      padding={3}
                      radius={2}
                      border
                      tone={isReferenceOnly ? 'transparent' : isChecked ? 'positive' : 'default'}
                      style={{ cursor: isReferenceOnly ? 'default' : 'pointer' }}
                      onClick={() => !isReferenceOnly && setSelected(p => ({ ...p, [key]: !p[key] }))}
                    >
                      <Flex align="flex-start" gap={3}>
                        {isReferenceOnly ? (
                          <Box style={{ width: 16, height: 16, flexShrink: 0 }} />
                        ) : (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setSelected(p => ({ ...p, [key]: !p[key] }))}
                            style={{ marginTop: 2, width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
                          />
                        )}
                        <Stack space={1} style={{ flex: 1 }}>
                          <Flex align="center" gap={2} wrap="wrap">
                            <Text size={0} weight="semibold" muted>{label}</Text>
                            {isReferenceOnly && (
                              <Badge tone="caution" mode="outline" fontSize={0}>reference only</Badge>
                            )}
                          </Flex>
                          <Text size={1}>{displayVal}</Text>
                        </Stack>
                      </Flex>
                    </Card>
                  )
                })}

                <Card padding={3} radius={2} tone="caution" border>
                  <Text size={0} muted>
                    ⚠ AI extraction may misread amounts, dates, or currency. Always cross-check
                    against the original document before publishing. Fields marked "reference only"
                    are shown for context and are not written to the payment.
                  </Text>
                </Card>

                <Flex gap={2} justify="flex-end">
                  <Button text="Cancel" mode="ghost" onClick={() => setDialogOpen(false)} />
                  <Button
                    text={selectedCount > 0
                      ? `Apply ${selectedCount} field${selectedCount !== 1 ? 's' : ''}`
                      : 'Select fields to apply'
                    }
                    tone="primary"
                    disabled={selectedCount === 0}
                    onClick={applySelected}
                  />
                </Flex>
              </Stack>
            )}

            {!loading && !error && result && !hasResults && (
              <Stack space={3}>
                <Card padding={4} tone="caution" border radius={2}>
                  <Text size={1} muted align="center">
                    No payment data could be extracted. The document may be scanned at low resolution,
                    handwritten, or in an unsupported format. Try uploading a clearer image or a
                    digital PDF invoice.
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
