import { useState } from 'react'
import { Box, Button, Card, Flex, Spinner, Stack, Text, Badge, Heading } from '@sanity/ui'
import { DocumentTextIcon } from '@sanity/icons'
import { useToast } from '@sanity/ui'

const API_URL =
  process.env.SANITY_STUDIO_GENERATE_API_URL ??
  'https://aquamx-handoff.netlify.app/api/generate-contract'

type DocType = 'contract' | 'quotation'

interface DocTypeConfig {
  id:          DocType
  title:       string
  description: string
  urlField:    string   // field name in displayed doc
  dateField:   string
}

const DOC_TYPES: DocTypeConfig[] = [
  {
    id:          'quotation',
    title:       'Quotation',
    description: 'Price quotation document sent to the customer for approval.',
    urlField:    'quotationGoogleDocUrl',
    dateField:   'quotationGeneratedAt',
  },
  {
    id:          'contract',
    title:       'Rental Agreement',
    description: 'Full rental agreement with all terms, conditions, and signatures.',
    urlField:    'contractGoogleDocUrl',
    dateField:   'contractGeneratedAt',
  },
]

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
  const [generating, setGenerating] = useState<DocType | null>(null)
  const toast = useToast()

  const isPublished = !documentId.startsWith('drafts.')
  const hasDraft    = doc.draft !== null
  const displayed   = doc.displayed

  const qApproval = (displayed.quotationApprovalStatus ?? 'not_requested') as string
  const cApproval = (displayed.contractApprovalStatus  ?? 'not_requested') as string

  // Overall last-generation error (not type-specific)
  const lastError  = displayed.generationError as string | undefined

  const generate = async (docType: DocType) => {
    setGenerating(docType)
    try {
      const res  = await fetch(API_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ documentId, docType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      toast.push({
        status:      'success',
        title:       'Document generated!',
        description: `${docType === 'contract' ? 'Rental Agreement' : 'Quotation'} is ready.`,
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

        {/* ── Document type cards ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {DOC_TYPES.map(dt => {
            const isThisGenerating = generating === dt.id
            const isAnyGenerating  = generating !== null

            // Each card reads its own type-specific fields
            const docUrl  = displayed[dt.urlField] as string | undefined
            const docDate = displayed[dt.dateField] as string | undefined
            const hasDoc  = !!docUrl

            // Approval gate
            const approvalStatus = dt.id === 'quotation' ? qApproval : cApproval
            const isApproved     = approvalStatus === 'approved'
            const isLocked       = !isApproved

            return (
              <Card key={dt.id} padding={4} radius={2} shadow={1} tone={isLocked ? 'transparent' : 'default'}>
                <Stack space={4}>

                  {/* Title */}
                  <Flex align="center" gap={2}>
                    <DocumentTextIcon style={{ fontSize: 20, opacity: isLocked ? 0.45 : 1 }} />
                    <Text weight="semibold" size={2} style={{ opacity: isLocked ? 0.45 : 1 }}>{dt.title}</Text>
                    {isLocked && <Badge tone="default" radius={2}>🔒 Approval required</Badge>}
                  </Flex>

                  {/* Description */}
                  <Text size={1} muted>{dt.description}</Text>

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

                  {/* Last error (shown only if this type was the last attempted) */}
                  {displayed.generatedDocType === dt.id &&
                   displayed.generationStatus === 'error' &&
                   lastError && (
                    <Text size={0} style={{ color: '#e05252' }}>{lastError}</Text>
                  )}

                  {/* Generate button — only shown when approved */}
                  {isApproved && (isThisGenerating ? (
                    <Flex align="center" gap={2}>
                      <Spinner muted />
                      <Text size={1} muted>Generating…</Text>
                    </Flex>
                  ) : (
                    <Button
                      text={hasDoc ? `↺ Regenerate ${dt.title}` : `Generate ${dt.title}`}
                      tone={hasDoc ? 'caution' : 'primary'}
                      disabled={!isPublished || isAnyGenerating}
                      onClick={() => generate(dt.id)}
                    />
                  ))}

                </Stack>
              </Card>
            )
          })}
        </div>

      </Stack>
    </Card>
  )
}
