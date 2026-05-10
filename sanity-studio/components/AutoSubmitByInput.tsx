/**
 * AutoSubmitByInput
 *
 * Custom input for the `submittedBy` field.
 * Watches `paymentStatus` — when it is "submitted" and the field is empty,
 * auto-fills with the current Studio user's display name.
 * Patches the draft directly (not just form state) so the value persists
 * without requiring a manual Publish click.
 * The user can still override the value manually.
 */

import { useEffect }                                         from 'react'
import { set, unset, useClient, useCurrentUser, useFormValue } from 'sanity'
import { TextInput }                                         from '@sanity/ui'

export function AutoSubmitByInput(props: any) {
  const { value, onChange, readOnly, elementProps } = props
  const client        = useClient({ apiVersion: '2024-01-01' })
  const currentUser   = useCurrentUser()
  const paymentStatus = useFormValue(['paymentStatus']) as string | undefined
  const rawId         = useFormValue(['_id'])           as string | undefined

  const draftId = rawId
    ? (rawId.startsWith('drafts.') ? rawId : `drafts.${rawId}`)
    : undefined

  useEffect(() => {
    if (paymentStatus !== 'submitted') return
    if (value) return
    if (!currentUser?.name) return
    if (!draftId) return

    // Update form state immediately
    onChange(set(currentUser.name))
    // Also persist directly to the draft so it survives without a manual Publish
    client.patch(draftId).setIfMissing({ submittedBy: currentUser.name }).commit().catch(() => {})
  }, [paymentStatus, value, currentUser, draftId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <TextInput
      {...elementProps}
      value={value ?? ''}
      readOnly={readOnly}
      onChange={e => {
        const v = e.currentTarget.value
        onChange(v ? set(v) : unset())
      }}
    />
  )
}
