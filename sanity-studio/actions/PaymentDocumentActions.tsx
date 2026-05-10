/**
 * PaymentDocumentActions
 *
 * Custom Delete, Discard Changes, and Duplicate actions for payment documents.
 * Replace Sanity's default equivalents which use useDocumentOperation internally —
 * that hook reads the document type from the router params and throws when
 * the document is opened via an __edit__ URL (no type in path).
 */

import { useState }             from 'react'
import { useClient }            from 'sanity'
import { useToast }             from '@sanity/ui'
import type { DocumentActionProps } from 'sanity'

// ── Discard Changes ───────────────────────────────────────────────────────────

export function PaymentDiscardAction(props: DocumentActionProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()
  const [busy, setBusy] = useState(false)

  if (!props.draft) return null  // nothing to discard

  return {
    label:    busy ? 'Discarding…' : 'Discard changes',
    tone:     'caution'  as const,
    disabled: busy || !props.draft,
    onHandle: async () => {
      setBusy(true)
      try {
        await client.delete(`drafts.${props.id}`)
        props.onComplete()
      } catch (err: any) {
        toast.push({ status: 'error', title: 'Discard failed', description: err?.message, duration: 6000 })
      } finally {
        setBusy(false)
      }
    },
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

export function PaymentDeleteAction(props: DocumentActionProps) {
  const client     = useClient({ apiVersion: '2024-01-01' })
  const toast      = useToast()
  const [busy, setBusy]           = useState(false)
  const [confirming, setConfirm]  = useState(false)

  if (!props.draft && !props.published) return null

  return {
    label:    busy ? 'Deleting…' : 'Delete',
    tone:     'critical' as const,
    disabled: busy,
    onHandle: () => setConfirm(true),
    dialog: confirming
      ? {
          type:    'confirm'  as const,
          tone:    'critical' as const,
          header:  'Delete this payment?',
          message: 'This will permanently delete the document and any unpublished draft. This cannot be undone.',
          onConfirm: async () => {
            setBusy(true)
            try {
              const tx = client.transaction()
              if (props.draft)     tx.delete(`drafts.${props.id}`)
              if (props.published) tx.delete(props.id)
              await tx.commit()
              props.onComplete()
            } catch (err: any) {
              toast.push({ status: 'error', title: 'Delete failed', description: err?.message, duration: 6000 })
            } finally {
              setBusy(false)
              setConfirm(false)
            }
          },
          onCancel: () => setConfirm(false),
        }
      : undefined,
  }
}

// ── Duplicate ────────────────────────────────────────────────────────────────

export function PaymentDuplicateAction(props: DocumentActionProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()
  const [busy, setBusy] = useState(false)

  const source = props.draft ?? props.published
  if (!source) return null

  return {
    label:    busy ? 'Duplicating…' : 'Duplicate',
    tone:     'default' as const,
    disabled: busy,
    onHandle: async () => {
      setBusy(true)
      try {
        const { _id: _origId, _rev, _createdAt, _updatedAt, paymentNumber, paymentStatus, approvalStatus, approvedAt, approvalResetReason, ...rest } = source as any
        await client.create({
          ...rest,
          _type:         'payment',
          paymentStatus: 'created',
        })
        props.onComplete()
        toast.push({ status: 'success', title: 'Duplicated', description: 'New draft created — payment number will be regenerated.' })
      } catch (err: any) {
        toast.push({ status: 'error', title: 'Duplicate failed', description: err?.message, duration: 6000 })
      } finally {
        setBusy(false)
      }
    },
  }
}
