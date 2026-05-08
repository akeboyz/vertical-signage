/**
 * SupportingDocsWithExtract
 *
 * Custom input for the supportingDocs (1.2) field on Payment documents.
 * Renders the standard array input, then an "Extract from Doc" button below.
 *
 * On click:
 *  1. Runs a free GROQ file-level duplicate check (same Sanity asset _ref)
 *  2. Calls Claude Vision via the extract-payment API (parallel with step 1)
 *  3. Runs a free GROQ invoice-number duplicate check with the extracted vendorInvoiceRef
 *  4. Shows a review dialog with any duplicate warnings + field checklist
 *  5. On confirm, patches the selected fields + vendorInvoiceRef into the draft
 */

import { useState, useCallback }   from 'react'
import { useClient, useFormValue } from 'sanity'
import { useToast, Box, Stack, Text, Button, Flex, Card, Spinner, Badge, Dialog } from '@sanity/ui'

const EXTRACT_URL =
  (process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app') +
  '/api/extract-payment'

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

function fileRefToUrl(ref: string): string | null {
  if (!ref?.startsWith('file-')) return null
  const body     = ref.slice('file-'.length)
  const lastDash = body.lastIndexOf('-')
  if (lastDash === -1) return null
  return `https://cdn.sanity.io/files/${PROJECT_ID}/${DATASET}/${body.slice(0, lastDash)}.${body.slice(lastDash + 1)}`
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
  vendorName?:           string | null
  vendorInvoiceRef?:     string | null
  paymentAmount?:        number | null
  vatType?:              string | null
  vatAmount?:            number | null
  withholdingTaxRate?:   string | null
  withholdingTaxCustom?: number | null
  currency?:             string | null
  dueDate?:              string | null
  invoiceDate?:          string | null
  expenseDescription?:   string | null
}

interface DuplicateHit {
  _id:            string
  paymentNumber?: string | null
  vendorName?:    string | null
  paymentStatus?: string | null
  reason:         'file' | 'invoice'
}

const FIELD_META = [
  { key: 'vendorName'           as const, label: 'Vendor Name',            sanityField: '',                     format: (v: any) => `${v}  (reference only — select vendor manually)` },
  { key: 'vendorInvoiceRef'     as const, label: '1.2b · Invoice Ref No.', sanityField: 'vendorInvoiceRef'                                                                              },
  { key: 'paymentAmount'        as const, label: '1.6 · Total Obligation', sanityField: 'paymentAmount',        format: (v: any) => Number(v).toLocaleString()                         },
  { key: 'currency'             as const, label: '1.7 · Currency',         sanityField: 'currency'                                                                                      },
  { key: 'vatType'              as const, label: '1.9 · VAT Type',         sanityField: 'vatType',              format: (v: any) => VAT_DISPLAY[v] ?? v                                },
  { key: 'vatAmount'            as const, label: '1.10 · VAT Amount',      sanityField: 'vatAmount',            format: (v: any) => Number(v).toLocaleString()                         },
  { key: 'withholdingTaxRate'   as const, label: '1.14 · WHT Rate',        sanityField: 'withholdingTaxRate',   format: (v: any) => WHT_DISPLAY[v] ?? v                                },
  { key: 'withholdingTaxCustom' as const, label: '1.15 · WHT Amount',      sanityField: 'withholdingTaxCustom', format: (v: any) => Number(v).toLocaleString()                         },
  { key: 'dueDate'              as const, label: '1.16 · Due Date',        sanityField: 'dueDate'                                                                                       },
  { key: 'invoiceDate'          as const, label: 'Invoice Date',           sanityField: '',                     format: (v: any) => `${v}  (reference only)`                           },
  { key: 'expenseDescription'   as const, label: '3.3 · Payment Notes',    sanityField: 'expenseDescription'                                                                            },
]

export function SupportingDocsWithExtract(props: any) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()
  const docId  = useFormValue(['_id']) as string | undefined

  const docs: any[] = props.value ?? []
  const assetRefs   = docs.map((d: any) => d?.file?.asset?._ref).filter(Boolean) as string[]
  const fileUrls    = assetRefs.map(fileRefToUrl).filter((u): u is string => u !== null)

  const [dialogOpen,  setDialogOpen]  = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [result,      setResult]      = useState<ExtractResult | null>(null)
  const [duplicates,  setDuplicates]  = useState<DuplicateHit[]>([])
  const [selected,    setSelected]    = useState<Partial<Record<keyof ExtractResult, boolean>>>({})
  const [error,       setError]       = useState('')

  // ── GROQ helpers ────────────────────────────────────────────────────────────

  async function checkFileDuplicates(refs: string[]): Promise<DuplicateHit[]> {
    if (refs.length === 0 || !docId) return []
    const baseId = docId.replace(/^drafts\./, '')
    try {
      const hits = await client.fetch<any[]>(
        `*[_type == "payment" && !(_id in path("drafts.**")) && _id != $currentId
           && count(supportingDocs[file.asset._ref in $assetRefs]) > 0]
         { _id, paymentNumber, vendorName, paymentStatus }`,
        { currentId: baseId, assetRefs: refs },
      )
      return hits.map(h => ({ ...h, reason: 'file' as const }))
    } catch {
      return []
    }
  }

  async function checkInvoiceDuplicate(invoiceRef: string): Promise<DuplicateHit[]> {
    if (!invoiceRef || !docId) return []
    const baseId = docId.replace(/^drafts\./, '')
    try {
      const hits = await client.fetch<any[]>(
        `*[_type == "payment" && !(_id in path("drafts.**")) && _id != $currentId
           && vendorInvoiceRef == $invoiceRef]
         { _id, paymentNumber, vendorName, paymentStatus }`,
        { currentId: baseId, invoiceRef },
      )
      return hits.map(h => ({ ...h, reason: 'invoice' as const }))
    } catch {
      return []
    }
  }

  // ── Main extraction ──────────────────────────────────────────────────────────

  const runExtract = useCallback(async () => {
    if (fileUrls.length === 0) return
    setDialogOpen(true)
    setLoading(true)
    setResult(null)
    setDuplicates([])
    setError('')
    setSelected({})

    try {
      // Step 1 + 2: file duplicate check and AI extraction run in parallel
      const [fileDupes, aiRes] = await Promise.all([
        checkFileDuplicates(assetRefs),
        fetch(EXTRACT_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ fileUrls }),
        }),
      ])

      const data = await aiRes.json() as ExtractResult
      if (!aiRes.ok) throw new Error((data as any).error ?? `HTTP ${aiRes.status}`)

      // Step 3: invoice-level duplicate check with extracted ref
      const invoiceDupes = data.vendorInvoiceRef
        ? await checkInvoiceDuplicate(data.vendorInvoiceRef)
        : []

      // Merge, de-duplicate by _id (prefer 'file' reason)
      const seen  = new Set<string>()
      const dupes: DuplicateHit[] = []
      for (const hit of [...fileDupes, ...invoiceDupes]) {
        if (!seen.has(hit._id)) { seen.add(hit._id); dupes.push(hit) }
      }
      setDuplicates(dupes)

      // Pre-select all patchable fields that have values
      const sel: Partial<Record<keyof ExtractResult, boolean>> = {}
      for (const { key, sanityField } of FIELD_META) {
        if (data[key] != null && sanityField) sel[key] = true
      }
      setResult(data)
      setSelected(sel)
    } catch (err: any) {
      setError(err?.message ?? 'Extraction failed')
    } finally {
      setLoading(false)
    }
  }, [fileUrls, assetRefs, docId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply selected fields ────────────────────────────────────────────────────

  const applySelected = useCallback(async () => {
    if (!result || !docId) return

    const patchSet: Record<string, unknown> = {}
    for (const { key, sanityField } of FIELD_META) {
      if (!sanityField || !selected[key]) continue
      const val = result[key]
      if (val != null) patchSet[sanityField] = val
    }
    if (Object.keys(patchSet).length === 0) return

    try {
      await client.patch(`drafts.${docId}`).set(patchSet).commit()
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
  }, [result, selected, docId, client, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──────────────────────────────────────────────────────────────────

  const hasResults    = result && FIELD_META.some(f => result[f.key] != null)
  const selectedCount = Object.values(selected).filter(Boolean).length
  const docCount      = fileUrls.length

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Stack space={3}>
      {props.renderDefault(props)}

      <Button
        text={fileUrls.length === 0
          ? '🤖 Extract from Doc  (upload a file above first)'
          : `🤖 Extract from Doc  (${docCount} file${docCount !== 1 ? 's' : ''})`
        }
        mode="ghost"
        tone={fileUrls.length === 0 ? 'default' : 'primary'}
        disabled={fileUrls.length === 0}
        onClick={runExtract}
        style={{ width: '100%', justifyContent: 'center' }}
      />

      {dialogOpen && (
        <Dialog
          id="extract-payment-dialog"
          header="🤖 AI Payment Extraction"
          onClose={() => setDialogOpen(false)}
          width={1}
        >
          <Box padding={4}>
            <Stack space={4}>

              {loading && (
                <Flex align="center" gap={3} padding={4} justify="center">
                  <Spinner />
                  <Text size={2}>Reading {docCount} file{docCount !== 1 ? 's' : ''} and checking for duplicates…</Text>
                </Flex>
              )}

              {error && (
                <Card tone="critical" padding={3} radius={2} border>
                  <Text size={1}>{error}</Text>
                </Card>
              )}

              {/* ── Duplicate warnings ───────────────────────────────────── */}
              {!loading && duplicates.length > 0 && (
                <Stack space={2}>
                  <Card tone="critical" padding={3} radius={2} border>
                    <Stack space={2}>
                      <Text size={1} weight="semibold">
                        ⚠ Possible duplicate payment{duplicates.length > 1 ? 's' : ''} detected
                      </Text>
                      <Text size={0} muted>
                        The following published payment{duplicates.length > 1 ? 's' : ''} may already cover this document.
                        Review carefully before applying fields.
                      </Text>
                    </Stack>
                  </Card>

                  {duplicates.map(hit => (
                    <Card key={hit._id} tone="caution" padding={3} radius={2} border>
                      <Flex align="center" gap={3} wrap="wrap">
                        <Badge
                          tone={hit.reason === 'file' ? 'critical' : 'caution'}
                          mode="outline"
                          fontSize={0}
                        >
                          {hit.reason === 'file' ? 'same file' : 'same invoice no.'}
                        </Badge>
                        <Stack space={1} style={{ flex: 1 }}>
                          <Text size={1} weight="semibold">
                            {hit.paymentNumber ?? hit._id}
                          </Text>
                          {hit.vendorName && (
                            <Text size={0} muted>{hit.vendorName}</Text>
                          )}
                        </Stack>
                        {hit.paymentStatus && (
                          <Badge tone="default" mode="outline" fontSize={0}>
                            {hit.paymentStatus}
                          </Badge>
                        )}
                      </Flex>
                    </Card>
                  ))}
                </Stack>
              )}

              {/* ── Field checklist ──────────────────────────────────────── */}
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
                      against the original document before publishing.
                    </Text>
                  </Card>

                  <Flex gap={2} justify="flex-end">
                    <Button text="Cancel" mode="ghost" onClick={() => setDialogOpen(false)} />
                    <Button
                      text={selectedCount > 0
                        ? `Apply ${selectedCount} field${selectedCount !== 1 ? 's' : ''}`
                        : 'Select fields to apply'
                      }
                      tone={duplicates.length > 0 ? 'caution' : 'primary'}
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
                      No payment data could be extracted. Try a clearer image or a digital PDF invoice.
                    </Text>
                  </Card>
                  <Flex justify="flex-end">
                    <Button text="Close" mode="ghost" onClick={() => setDialogOpen(false)} />
                  </Flex>
                </Stack>
              )}

            </Stack>
          </Box>
        </Dialog>
      )}
    </Stack>
  )
}
