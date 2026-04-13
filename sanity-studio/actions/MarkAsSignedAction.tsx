import { useState, useCallback } from 'react'
import { useToast, Box, Stack, Text, Button, Flex, Card, Spinner } from '@sanity/ui'
import type { DocumentActionProps } from 'sanity'
import { useCurrentUser } from 'sanity'

const API_BASE = process.env.SANITY_STUDIO_API_BASE_URL ?? 'https://aquamx-handoff.netlify.app'

/**
 * Document action for contract — marks contract as signed and auto-creates
 * a Project + ContractManagement record.
 *
 * Only enabled when:
 *   - contractApprovalStatus === 'approved'
 *   - signedStatus !== 'signed'
 */
export function MarkAsSignedAction(props: DocumentActionProps) {
  const toast       = useToast()
  const currentUser = useCurrentUser()
  const doc         = (props.draft ?? props.published) as any

  const contractApprovalStatus = doc?.contractApprovalStatus as string | undefined
  const signedStatus           = doc?.signedStatus           as string | undefined

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading,    setLoading]    = useState(false)

  const alreadySigned = signedStatus === 'signed'
  const canSign       = contractApprovalStatus === 'approved' && !alreadySigned

  const handleConfirm = useCallback(async () => {
    setLoading(true)
    try {
      const signedBy = currentUser?.name ?? currentUser?.email ?? currentUser?.id ?? 'Unknown'
      const res  = await fetch(`${API_BASE}/api/mark-signed`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ contractId: props.id, signedBy }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      toast.push({
        status:      'success',
        title:       'Contract signed',
        description: `Project "${data.projectTitle}" created. Pipeline is now Active.`,
        duration:    8000,
      })
      setDialogOpen(false)
    } catch (err: any) {
      toast.push({ status: 'error', title: 'Failed', description: err?.message })
    } finally {
      setLoading(false)
    }
  }, [props.id, toast])

  // Hide completely if contract isn't approved yet
  if (!alreadySigned && contractApprovalStatus !== 'approved') return null

  return {
    label:    alreadySigned ? '✅ Signed' : '✍ Mark as Signed',
    disabled: !canSign,
    title:    alreadySigned
      ? 'This contract has already been marked as signed'
      : 'Mark this contract as physically signed — auto-creates Project & Contract Management',
    onHandle: () => setDialogOpen(true),

    dialog: dialogOpen ? {
      type:    'dialog' as const,
      header:  'Mark Contract as Signed',
      onClose: () => !loading && setDialogOpen(false),
      content: (
        <Box padding={4}>
          <Stack space={4}>
            <Text size={2} weight="semibold">This will automatically:</Text>
            <Stack space={2} paddingLeft={2}>
              <Text size={1}>✓ Mark this contract as signed</Text>
              <Text size={1}>✓ Create a <strong>Project</strong> record (kiosk config)</Text>
              <Text size={1}>✓ Create a <strong>Contract Management</strong> record (operational)</Text>
              <Text size={1}>✓ Update Project Site pipeline to <strong>Active</strong></Text>
            </Stack>
            <Card padding={3} tone="caution" border radius={2}>
              <Text size={1} muted>
                Make sure the signed documents are uploaded to the contract before proceeding.
              </Text>
            </Card>
            <Flex gap={2} justify="flex-end">
              <Button
                text="Cancel"
                mode="ghost"
                onClick={() => setDialogOpen(false)}
                disabled={loading}
              />
              {loading ? (
                <Flex align="center" gap={2}>
                  <Spinner />
                  <Text size={1} muted>Creating records…</Text>
                </Flex>
              ) : (
                <Button
                  text="Confirm — Mark as Signed"
                  tone="positive"
                  onClick={handleConfirm}
                />
              )}
            </Flex>
          </Stack>
        </Box>
      ),
    } : undefined,
  }
}
