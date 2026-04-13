import { useState, useEffect } from 'react'
import { useClient } from 'sanity'
import { Box, Button, Card, Flex, Spinner, Stack, Text, Badge, Heading } from '@sanity/ui'
import { DocumentTextIcon } from '@sanity/icons'
import { useToast } from '@sanity/ui'

const API_URL =
  process.env.SANITY_STUDIO_GENERATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/generate-contract'

const API_URL_PO =
  process.env.SANITY_STUDIO_GENERATE_PO_API_URL ??
  'https://aquamx-handoff.netlify.app/api/generate-po'

interface DocConfig {
  key:          string
  name:         string
  description?: string
  numberPrefix?: string
  templateId?:  string
}

interface Props {
  document: {
    draft:     Record<string, any> | null
    published: Record<string, any> | null
    displayed: Record<string, any>
  }
  documentId: string
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB') +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

export function GenerateView({ document: doc, documentId }: Props) {
  const [generating, setGenerating] = useState<string | null>(null)
  const [docConfigs, setDocConfigs]  = useState<DocConfig[]>([])
  const [configLoading, setConfigLoading] = useState(true)
  const toast  = useToast()
  const client = useClient({ apiVersion: '2024-01-01' })

  const isPublished = !documentId.startsWith('drafts.')
  const hasDraft    = doc.draft !== null
  const displayed   = doc.displayed

  // ── Fetch documents[] from the linked processSetup ──────────────────────────
  const contractTypeRef = displayed.contractType?._ref as string | undefined

  useEffect(() => {
    if (!contractTypeRef) {
      setConfigLoading(false)
      return
    }
    setConfigLoading(true)
    client
      .fetch(`*[_id == $id][0].documents[]{ key, name, description, numberPrefix, templateId }`, { id: contractTypeRef })
      .then((docs: DocConfig[] | null) => {
        setDocConfigs(Array.isArray(docs) ? docs : [])
      })
      .catch(() => setDocConfigs([]))
      .finally(() => setConfigLoading(false))
  }, [contractTypeRef, client])

  // ── Per-doc status resolver ────────────────────────────────────────────────
  // New activity schema stores state in docStatuses[]; old contract uses flat fields.
  const docStatuses = (displayed.docStatuses ?? []) as Record<string, any>[]
  const useDocStatuses = docStatuses.length > 0 || displayed._type === 'activity'

  function getDocStatus(key: string) {
    if (useDocStatuses) {
      return docStatuses.find(s => s.key === key) ?? { key, approvalStatus: 'not_requested' }
    }
    // Procurement uses a single top-level approvalStatus for all doc types.
    if (displayed._type === 'procurement') {
      return {
        approvalStatus: displayed.approvalStatus ?? 'not_requested',
        googleDocUrl:   displayed[`${key}GoogleDocUrl`],
        generatedAt:    displayed[`${key}GeneratedAt`],
      }
    }
    // Old contracts store approval state under canonical flat field names ('quotation', 'contract').
    // The Process Setup key may differ (e.g. 'spaceRentalQuotation' vs 'quotation').
    // Fall back to the canonical name when the key-based lookup returns nothing.
    const canonicalKey =
      displayed[`${key}ApprovalStatus`] !== undefined ? key :
      key.toLowerCase().includes('quotation')         ? 'quotation' :
      key.toLowerCase().includes('contract')          ? 'contract'  :
      key
    return {
      approvalStatus:        displayed[`${canonicalKey}ApprovalStatus`]       ?? 'not_requested',
      googleDocUrl:          displayed[`${canonicalKey}GoogleDocUrl`],
      generatedAt:           displayed[`${canonicalKey}GeneratedAt`],
      approvedTermsSnapshot: canonicalKey === 'contract' ? displayed.approvedTermsSnapshot : undefined,
    }
  }

  // ── Material terms change detection ────────────────────────────────────────
  const contractStatus   = getDocStatus('contract')
  const contractApproval = (contractStatus.approvalStatus ?? 'not_requested') as string
  const termsChanged = (() => {
    const snapshot = contractStatus.approvedTermsSnapshot as string | undefined
    if (!snapshot || contractApproval !== 'approved') return false
    try {
      const snapshotObj = JSON.parse(snapshot) as Record<string, string>
      const currentObj  = JSON.parse(displayed.dynamicFields ?? '{}') as Record<string, string>
      return Object.entries(snapshotObj).some(([k, v]) => (currentObj[k] ?? '') !== v)
    } catch { return false }
  })()

  const lastError = displayed.generationError as string | undefined

  const generate = async (configKey: string) => {
    setGenerating(configKey)
    // For old contracts, normalize the Process Setup key to the canonical flat-field name.
    // New activities use the key as-is; docStatuses[] handles it via updateActivityDocStatus.
    let docType = configKey
    if (displayed._type !== 'activity') {
      if (configKey.toLowerCase().includes('quotation')) docType = 'quotation'
      else if (configKey.toLowerCase().includes('contract')) docType = 'contract'
    }
    try {
      const endpoint = displayed._type === 'procurement' ? API_URL_PO : API_URL
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, docType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      toast.push({
        status:      'success',
        title:       'Document generated!',
        description: `${docType} is ready.`,
        duration:    6000,
      })
    } catch (err: any) {
      toast.push({
        status:      'error',
        title:       'Generation failed',
        description: err?.message ?? 'Unknown error',
        duration:    8000,
      })
    } finally {
      setGenerating(null)
    }
  }

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <Stack space={2}>
          <Heading size={2}>Generate Documents</Heading>
          <Text size={1} muted>
            Each document type has its own Google Doc and PDF. Regenerating one does not
            affect the other.
          </Text>
        </Stack>

        {/* ── Warnings ────────────────────────────────────────────────────── */}
        {!isPublished && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>Publish this document first before generating.</Text>
          </Card>
        )}
        {isPublished && hasDraft && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>
              You have unpublished changes. Publish first so the latest data is used.
            </Text>
          </Card>
        )}

        {/* ── Loading ─────────────────────────────────────────────────────── */}
        {configLoading && (
          <Flex align="center" gap={2}>
            <Spinner muted />
            <Text size={1} muted>Loading document configuration…</Text>
          </Flex>
        )}

        {/* ── No process setup ────────────────────────────────────────────── */}
        {!configLoading && docConfigs.length === 0 && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={1}>
              No documents configured. Add documents in the linked Process Setup's "Documents" section.
            </Text>
          </Card>
        )}

        {/* ── Document type cards ─────────────────────────────────────────── */}
        {!configLoading && docConfigs.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {docConfigs.map(dt => {
              const isThisGenerating = generating === dt.key
              const isAnyGenerating  = generating !== null

              const status         = getDocStatus(dt.key)
              const docUrl         = status.googleDocUrl  as string | undefined
              const docDate        = status.generatedAt   as string | undefined
              const hasDoc         = !!docUrl
              const approvalStatus = (status.approvalStatus ?? 'not_requested') as string
              const isApproved     = approvalStatus === 'approved'
              const isLocked       = !isApproved
              const isTermsChanged = dt.key === 'contract' && termsChanged

              return (
                <Card key={dt.key} padding={4} radius={2} shadow={1} tone={isLocked ? 'transparent' : 'default'}>
                  <Stack space={4}>

                    {/* Title */}
                    <Flex align="center" gap={2}>
                      <DocumentTextIcon style={{ fontSize: 20, opacity: isLocked ? 0.45 : 1 }} />
                      <Text weight="semibold" size={2} style={{ opacity: isLocked ? 0.45 : 1 }}>{dt.name}</Text>
                      {isLocked && <Badge tone="default" radius={2}>🔒 Approval required</Badge>}
                    </Flex>

                    {/* Description */}
                    {dt.description && (
                      <Text size={1} muted>{dt.description}</Text>
                    )}

                    {/* Approval status indicator */}
                    {isLocked ? (
                      <Card padding={3} radius={2} tone="caution" border>
                        <Text size={1}>
                          {approvalStatus === 'pending'
                            ? 'Awaiting approver response before generation is allowed.'
                            : approvalStatus === 'rejected'
                            ? 'Approval was rejected. Edit the document and request approval again.'
                            : approvalStatus === 'reset'
                            ? 'Approval was reset due to field changes. Re-request approval.'
                            : 'Request approval in the Approval tab before generating.'}
                        </Text>
                      </Card>
                    ) : null}

                    {/* Per-type generation status */}
                    {isApproved && (hasDoc ? (
                      <Stack space={2}>
                        <Flex gap={2} align="center">
                          <Badge tone="positive" radius={2}>✓ Generated</Badge>
                          {docDate && (
                            <Text size={0} muted>{fmtDate(docDate)}</Text>
                          )}
                        </Flex>
                        <a href={docUrl} target="_blank" rel="noreferrer"
                          style={{ textDecoration: 'none' }}
                        >
                          <Text size={1} style={{ color: '#2276fc' }}>
                            Open Google Doc ↗
                          </Text>
                        </a>
                      </Stack>
                    ) : (
                      <Text size={1} muted style={{ fontStyle: 'italic' }}>
                        Not yet generated
                      </Text>
                    ))}

                    {/* Last error */}
                    {displayed.generatedDocType === dt.key &&
                     displayed.generationStatus === 'error' &&
                     lastError && (
                      <Text size={0} style={{ color: '#e05252' }}>{lastError}</Text>
                    )}

                    {/* Material terms changed warning */}
                    {isApproved && isTermsChanged && (
                      <Card padding={3} radius={2} tone="critical" border>
                        <Stack space={2}>
                          <Text size={1} weight="semibold">⚠️ Approved terms have been modified</Text>
                          <Text size={1} muted>
                            One or more material terms were changed after approval.
                            Re-approval is required before generating a new contract document.
                          </Text>
                          <Text size={1} muted>Go to the <strong>Approval</strong> tab to request re-approval.</Text>
                        </Stack>
                      </Card>
                    )}

                    {/* Generate button */}
                    {isApproved && (isThisGenerating ? (
                      <Flex align="center" gap={2}>
                        <Spinner muted />
                        <Text size={1} muted>Generating…</Text>
                      </Flex>
                    ) : (
                      <Button
                        text={hasDoc ? `↺ Regenerate ${dt.name}` : `Generate ${dt.name}`}
                        tone={isTermsChanged ? 'default' : hasDoc ? 'caution' : 'primary'}
                        disabled={!isPublished || isAnyGenerating || isTermsChanged}
                        onClick={() => generate(dt.key)}
                      />
                    ))}

                  </Stack>
                </Card>
              )
            })}
          </div>
        )}

      </Stack>
    </Card>
  )
}
