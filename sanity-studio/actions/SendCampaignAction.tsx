import React, { useState } from 'react'
import { useDocumentOperation, useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'
import { Stack, Flex, Box, Text, Card, Badge, Spinner, Button } from '@sanity/ui'

const API_BASE =
  (typeof process !== 'undefined' && (process.env as any).SANITY_STUDIO_API_BASE_URL) ||
  'https://aquamx-handoff.netlify.app'

type Recipient  = { name: string; email: string }
type SendResult = { sent: number; failed: number; log: string[] }

type Step =
  | 'idle'          // nothing open
  | 'loading'       // fetching recipient list
  | 'review'        // showing preview + recipient list — waiting for confirm
  | 'sending'       // emails in flight
  | 'done'          // send complete, showing log
  | 'error'         // error before/during send

/**
 * "📧 Review & Send" document action on emailCampaign documents.
 *
 * Step 1 — "Review" dialog:
 *   Shows subject preview, body excerpt, and the full recipient list.
 *   User can check who will receive the email before confirming.
 *
 * Step 2 — Send:
 *   Calls /api/email-send with the recipient list + campaign content.
 *   Patches status / sentAt / recipientCount / sendLog back onto the document.
 */
export function SendCampaignAction(props: DocumentActionProps) {
  const { patch }  = useDocumentOperation(props.id, props.type)
  const client     = useClient({ apiVersion: '2024-01-01' })

  const [step,       setStep]       = useState<Step>('idle')
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [result,     setResult]     = useState<SendResult | null>(null)
  const [errMsg,     setErrMsg]     = useState('')

  const doc             = (props.published ?? props.draft) as Record<string, any> | null
  const subject         = doc?.subject         as string | undefined
  const body_en         = doc?.body_en         as string | undefined
  const body_th         = doc?.body_th         as string | undefined
  const recipientFilter = doc?.recipientFilter as string | undefined
  const status          = doc?.status         as string | undefined
  const alreadySent     = status === 'sent'

  // ── Fetch matching recipient list from Sanity ─────────────────────────────
  // Client status comes from party.linkedProvider:
  //   set     = client (they have an active Provider profile)
  //   not set = prospect
  async function fetchRecipients(): Promise<Recipient[]> {
    let filter: string
    if (recipientFilter === 'prospects_only') {
      filter = `_type == "party" && "advertiser" in partyRole && defined(email) && !defined(linkedProvider)`
    } else if (recipientFilter === 'clients_only') {
      filter = `_type == "party" && "advertiser" in partyRole && defined(email) && defined(linkedProvider)`
    } else {
      filter = `_type == "party" && "advertiser" in partyRole && defined(email)`
    }
    const list = await client.fetch<Recipient[]>(
      `*[${filter}]{
        "name":  coalesce(legalName_en, legalName_th, legalName, firstName + " " + lastName, "Unknown"),
        "email": email
      }`,
      {}
    )
    return list.filter(p => p.email?.trim())
  }

  // ── Step 1: open review dialog ─────────────────────────────────────────────
  async function onHandle() {
    if (alreadySent) return

    // Validate required fields before fetching
    if (!subject?.trim()) {
      setErrMsg('Fill in the Email Subject before sending.')
      setStep('error')
      return
    }
    if (!body_en?.trim() && !body_th?.trim()) {
      setErrMsg('Fill in at least one email body (use ✨ Generate Content first).')
      setStep('error')
      return
    }

    setStep('loading')
    setErrMsg('')
    setResult(null)

    try {
      const list = await fetchRecipients()
      setRecipients(list)
      setStep('review')
    } catch (err: any) {
      setErrMsg(`Could not load recipients: ${err?.message ?? String(err)}`)
      setStep('error')
    }
  }

  // ── Step 2: confirm & send ─────────────────────────────────────────────────
  async function confirmSend() {
    if (recipients.length === 0) return
    setStep('sending')

    try {
      const res = await fetch(`${API_BASE}/api/email-send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          recipients,
          subject:    subject ?? '',
          body_en:    body_en ?? '',
          body_th:    body_th ?? '',
          campaignId: props.id,
        }),
      })

      const data: SendResult = await res.json()
      if (!res.ok) throw new Error((data as any)?.error ?? `HTTP ${res.status}`)

      // Write status back to the document
      const now = new Date().toISOString()
      patch.execute([{
        set: {
          status:         'sent',
          sentAt:         now,
          recipientCount: data.sent,
          sendLog:        data.log.join('\n'),
        },
      }])

      setResult(data)
      setStep('done')

    } catch (err: any) {
      setErrMsg(`Send failed: ${err?.message ?? String(err)}`)
      setStep('error')
    }
  }

  function closeDialog() {
    setStep('idle')
    setRecipients([])
    setResult(null)
    setErrMsg('')
    if (step === 'done') props.onComplete()
  }

  // ── Determine action button label ─────────────────────────────────────────
  const isBusy = step === 'loading' || step === 'sending'
  const label  = alreadySent
    ? '✅ Already Sent'
    : isBusy
    ? step === 'loading' ? 'Loading recipients…' : 'Sending…'
    : '📧 Review & Send'

  const isOpen = step !== 'idle'

  // ── Dialog header ─────────────────────────────────────────────────────────
  const header =
    step === 'loading' ? 'Loading Recipients…'         :
    step === 'review'  ? `Review Campaign (${recipients.length} recipients)` :
    step === 'sending' ? 'Sending…'                    :
    step === 'done'    ? '✅ Campaign Sent'             :
                         '📧 Send Campaign — Error'

  return {
    label,
    tone:     alreadySent ? 'default' as const : 'critical' as const,
    disabled: isBusy || alreadySent,
    onHandle,

    dialog: isOpen ? {
      type:    'dialog' as const,
      id:      'send-campaign',
      header,
      onClose: closeDialog,
      content: (
        <Box padding={4} style={{ minWidth: 360, maxWidth: 560 }}>
          <Stack space={4}>

            {/* ── Loading ─────────────────────────────────────── */}
            {step === 'loading' && (
              <Flex align="center" gap={3}>
                <Spinner muted />
                <Text muted size={2}>Fetching recipient list from Sanity…</Text>
              </Flex>
            )}

            {/* ── Review ──────────────────────────────────────── */}
            {step === 'review' && (
              <>
                {/* Subject */}
                <Stack space={2}>
                  <Text size={1} weight="semibold" muted>SUBJECT</Text>
                  <Card padding={3} radius={2} tone="transparent" border>
                    <Text size={2}>{subject}</Text>
                  </Card>
                </Stack>

                {/* Body excerpt */}
                <Stack space={2}>
                  <Text size={1} weight="semibold" muted>BODY PREVIEW</Text>
                  <Card padding={3} radius={2} tone="transparent" border>
                    <Text size={1} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                      {(body_th || body_en || '').slice(0, 280)}
                      {((body_th || body_en || '').length > 280) ? '…' : ''}
                    </Text>
                  </Card>
                </Stack>

                {/* Recipient list */}
                <Stack space={2}>
                  <Flex align="center" justify="space-between">
                    <Text size={1} weight="semibold" muted>RECIPIENTS</Text>
                    <Badge tone={recipients.length > 0 ? 'positive' : 'caution'} mode="outline">
                      {recipients.length} {recipients.length === 1 ? 'contact' : 'contacts'}
                    </Badge>
                  </Flex>

                  {recipients.length === 0 ? (
                    <Card padding={3} radius={2} tone="caution" border>
                      <Text size={1}>No recipients found for this filter. Check that Parties have email addresses.</Text>
                    </Card>
                  ) : (
                    <Card
                      padding={2}
                      radius={2}
                      tone="transparent"
                      border
                      style={{ maxHeight: 220, overflowY: 'auto' }}
                    >
                      <Stack space={1}>
                        {recipients.map((r, i) => (
                          <Flex key={i} align="center" gap={2} padding={1}>
                            <Text size={1} style={{ minWidth: 160, flexShrink: 0 }}>
                              {r.name}
                            </Text>
                            <Text size={1} muted style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {r.email}
                            </Text>
                          </Flex>
                        ))}
                      </Stack>
                    </Card>
                  )}
                </Stack>

                {/* Confirm button */}
                <Flex justify="flex-end" gap={2} paddingTop={2}>
                  <Button
                    text="Cancel"
                    mode="ghost"
                    onClick={closeDialog}
                  />
                  <Button
                    text={`Send to ${recipients.length} ${recipients.length === 1 ? 'contact' : 'contacts'}`}
                    tone="critical"
                    disabled={recipients.length === 0}
                    onClick={confirmSend}
                  />
                </Flex>
              </>
            )}

            {/* ── Sending ─────────────────────────────────────── */}
            {step === 'sending' && (
              <Flex align="center" gap={3}>
                <Spinner muted />
                <Text muted size={2}>Sending emails via Resend…</Text>
              </Flex>
            )}

            {/* ── Done ────────────────────────────────────────── */}
            {step === 'done' && result && (
              <Stack space={3}>
                <Text size={2} weight="semibold">
                  {result.sent} sent{result.failed > 0 ? `, ${result.failed} failed` : ''}.
                </Text>
                <Card
                  padding={3}
                  radius={2}
                  tone="transparent"
                  border
                  style={{ maxHeight: 260, overflowY: 'auto' }}
                >
                  <Text
                    size={1}
                    style={{ fontFamily: 'monospace', whiteSpace: 'pre', lineHeight: '1.7' }}
                  >
                    {result.log.join('\n')}
                  </Text>
                </Card>
              </Stack>
            )}

            {/* ── Error ───────────────────────────────────────── */}
            {step === 'error' && (
              <Card padding={3} radius={2} tone="critical" border>
                <Text size={2}>{errMsg}</Text>
              </Card>
            )}

          </Stack>
        </Box>
      ),
    } : undefined,
  }
}
