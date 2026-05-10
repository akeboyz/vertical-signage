import { useState } from 'react'
import { useDocumentOperation, useClient } from 'sanity'
import type { DocumentActionProps } from 'sanity'

/**
 * Replaces the default Publish action on Provider documents.
 *
 * Extra behaviour: if provider.party is set, automatically writes
 * party.linkedProvider = this provider back onto the linked Party document.
 *
 * This means the user only needs to link the Party once (on the Provider form)
 * and the Party's CLIENT / PROSPECT status updates automatically on publish.
 */
export function ProviderPublishAction(props: DocumentActionProps) {
  const { publish } = useDocumentOperation(props.id, props.type)
  const client      = useClient({ apiVersion: '2024-01-01' })

  const [busy, setBusy] = useState(false)

  const doc      = (props.draft ?? props.published) as Record<string, any> | null
  const partyRef = doc?.party?._ref as string | undefined

  async function onHandle() {
    setBusy(true)

    // 1. Publish the Provider document
    publish.execute()

    // 2. If a Party is linked, write linkedProvider back onto that Party.
    //    Patch both the published doc and the draft (whichever exists) so the
    //    field appears immediately without requiring a Party publish cycle.
    if (partyRef) {
      try {
        // Patch the published Party document
        await client
          .patch(partyRef)
          .set({ linkedProvider: { _type: 'reference', _ref: props.id } })
          .commit({ visibility: 'async' })

        // Also patch the draft if it exists
        const draftId = `drafts.${partyRef}`
        const draft   = await client.fetch<{ _id: string } | null>(
          `*[_id == $id][0]{ _id }`,
          { id: draftId }
        )
        if (draft?._id) {
          await client
            .patch(draftId)
            .set({ linkedProvider: { _type: 'reference', _ref: props.id } })
            .commit({ visibility: 'async' })
        }
      } catch (err) {
        // Don't block the publish if the back-patch fails — log only
        console.warn('[ProviderPublishAction] Could not set linkedProvider on Party:', err)
      }
    }

    setBusy(false)
    props.onComplete()
  }

  return {
    label:    busy ? 'Publishing…' : 'Publish',
    tone:     'positive' as const,
    disabled: !!publish.disabled || busy,
    onHandle,
  }
}
