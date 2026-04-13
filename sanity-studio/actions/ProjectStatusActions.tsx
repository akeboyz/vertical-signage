/**
 * ProjectStatusActions
 *
 * Two document actions for `project` documents:
 *   - SuspendProjectAction   — sets status to "suspended"
 *   - TerminateProjectAction — sets status to "terminated", records terminatedAt + reason
 *   - ReactivateProjectAction — sets status back to "active"
 *
 * Status is never editable directly in the form.
 */

import { useState }          from 'react'
import { useDocumentOperation, useClient } from 'sanity'
import type { DocumentActionProps }        from 'sanity'

// ── Suspend ───────────────────────────────────────────────────────────────────

export function SuspendProjectAction(props: DocumentActionProps) {
  const client   = useClient({ apiVersion: '2024-01-01' })
  const [busy, setBusy] = useState(false)
  const status   = (props.published as any)?.status

  if (status === 'terminated') return null   // can't suspend a terminated project
  if (status === 'suspended')  return null   // already suspended

  return {
    label:    busy ? 'Suspending…' : 'Suspend Project',
    tone:     'caution' as const,
    disabled: busy,
    onHandle: async () => {
      setBusy(true)
      try {
        await client.patch(props.id).set({ status: 'suspended' }).commit()
        props.onComplete()
      } finally {
        setBusy(false)
      }
    },
  }
}

// ── Reactivate ────────────────────────────────────────────────────────────────

export function ReactivateProjectAction(props: DocumentActionProps) {
  const client   = useClient({ apiVersion: '2024-01-01' })
  const [busy, setBusy] = useState(false)
  const status   = (props.published as any)?.status

  if (!status || status === 'active') return null   // already active

  return {
    label:    busy ? 'Reactivating…' : 'Reactivate Project',
    tone:     'positive' as const,
    disabled: busy,
    onHandle: async () => {
      setBusy(true)
      try {
        await client.patch(props.id)
          .set({ status: 'active' })
          .unset(['terminatedAt', 'terminationReason'])
          .commit()
        props.onComplete()
      } finally {
        setBusy(false)
      }
    },
  }
}

// ── Terminate ─────────────────────────────────────────────────────────────────

export function TerminateProjectAction(props: DocumentActionProps) {
  const client   = useClient({ apiVersion: '2024-01-01' })
  const [busy,        setBusy]        = useState(false)
  const [confirming,  setConfirming]  = useState(false)
  const [reason,      setReason]      = useState('')
  const status   = (props.published as any)?.status

  if (status === 'terminated') return null   // already terminated

  if (confirming) {
    return {
      label:    busy ? 'Terminating…' : 'Confirm Terminate',
      tone:     'critical' as const,
      disabled: busy || !reason.trim(),
      title:    !reason.trim() ? 'Enter a reason before confirming' : undefined,
      onHandle: async () => {
        setBusy(true)
        try {
          await client.patch(props.id).set({
            status:            'terminated',
            terminatedAt:      new Date().toISOString(),
            terminationReason: reason.trim(),
            isActive:          false,
          }).commit()
          props.onComplete()
        } finally {
          setBusy(false)
          setConfirming(false)
        }
      },
    }
  }

  return {
    label:    'Terminate Project',
    tone:     'critical' as const,
    onHandle: () => {
      const r = window.prompt('Reason for termination (required):')
      if (!r?.trim()) return
      setReason(r.trim())
      setConfirming(true)
    },
  }
}
