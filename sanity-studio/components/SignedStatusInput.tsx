import { useState, useCallback } from 'react'
import { Stack, Card, Text, Flex, Button, Spinner, useToast } from '@sanity/ui'
import { set, useFormValue } from 'sanity'
import type { StringInputProps } from 'sanity'

const API_BASE = process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

/**
 * Inline signed-status field shown in the Signed Documents tab.
 * - If already signed: shows a green confirmation card with the signed date.
 * - If approved but not signed: shows a "Mark as Signed" button with confirmation.
 * - If not yet approved: shows a locked / waiting card.
 */
export function SignedStatusInput(props: StringInputProps) {
  const toast = useToast()

  const docId                  = useFormValue(['_id'])                  as string | undefined
  const signedStatus           = useFormValue(['signedStatus'])           as string | undefined
  const signedAt               = useFormValue(['signedAt'])               as string | undefined
  const contractApprovalStatus = useFormValue(['contractApprovalStatus']) as string | undefined

  const [confirming, setConfirming] = useState(false)
  const [loading,    setLoading]    = useState(false)

  const alreadySigned = signedStatus === 'signed'
  const canSign       = contractApprovalStatus === 'approved' && !alreadySigned

  const cleanId = docId?.replace(/^drafts\./, '') ?? ''

  const handleConfirm = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`${API_BASE}/api/mark-signed`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contractId: cleanId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      toast.push({
        status:      'success',
        title:       'Contract signed',
        description: `Project "${data.projectTitle}" created. Pipeline is now Active.`,
        duration:    8000,
      })
      // Update the form value immediately so the green "Signed" card shows
      // without needing a page reload (backend patches published doc, form shows draft)
      props.onChange(set('signed'))
      setConfirming(false)
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Failed to mark as signed', description: err?.message })
    } finally {
      setLoading(false)
    }
  }, [cleanId, toast])

  // ── Already signed ────────────────────────────────────────────────────────
  if (alreadySigned) {
    const dateStr = signedAt ? new Date(signedAt).toLocaleString() : '—'
    return (
      <Card padding={3} radius={2} tone="positive" border>
        <Flex align="center" gap={3}>
          <Text size={2}>✍️</Text>
          <Stack space={1}>
            <Text size={1} weight="semibold">Signed</Text>
            <Text size={1} muted>Marked as signed on {dateStr}</Text>
          </Stack>
        </Flex>
      </Card>
    )
  }

  // ── Not yet approved ──────────────────────────────────────────────────────
  if (contractApprovalStatus !== 'approved') {
    return (
      <Card padding={3} radius={2} tone="default" border>
        <Flex align="center" gap={3}>
          <Text size={2}>🔒</Text>
          <Stack space={1}>
            <Text size={1} weight="semibold">Not yet signed</Text>
            <Text size={1} muted>Contract must be approved before it can be marked as signed.</Text>
          </Stack>
        </Flex>
      </Card>
    )
  }

  // ── Approved, ready to sign ───────────────────────────────────────────────
  if (!confirming) {
    return (
      <Card padding={3} radius={2} tone="caution" border>
        <Flex align="center" justify="space-between" gap={3}>
          <Stack space={1}>
            <Text size={1} weight="semibold">Not yet signed</Text>
            <Text size={1} muted>Contract is approved. Upload signed documents above, then mark as signed.</Text>
          </Stack>
          <Button
            text="✍️ Mark as Signed"
            tone="positive"
            onClick={() => setConfirming(true)}
          />
        </Flex>
      </Card>
    )
  }

  // ── Confirmation step ─────────────────────────────────────────────────────
  return (
    <Card padding={4} radius={2} tone="caution" border>
      <Stack space={4}>
        <Text size={1} weight="semibold">This will automatically:</Text>
        <Stack space={2} paddingLeft={2}>
          <Text size={1}>✓ Mark this contract as signed</Text>
          <Text size={1}>✓ Create a <strong>Project</strong> record (kiosk config)</Text>
          <Text size={1}>✓ Create a <strong>Contract Management</strong> record (operational)</Text>
          <Text size={1}>✓ Update Project Site pipeline to <strong>Active</strong></Text>
        </Stack>
        <Card padding={3} tone="critical" border radius={2}>
          <Text size={1} muted>Make sure the signed documents are uploaded before proceeding.</Text>
        </Card>
        {loading ? (
          <Flex align="center" gap={2}>
            <Spinner />
            <Text size={1} muted>Creating records…</Text>
          </Flex>
        ) : (
          <Flex gap={2} justify="flex-end">
            <Button text="Cancel" mode="ghost" onClick={() => setConfirming(false)} />
            <Button text="Confirm — Mark as Signed" tone="positive" onClick={handleConfirm} />
          </Flex>
        )}
      </Stack>
    </Card>
  )
}
