import { useState }   from 'react'
import { useClient }  from 'sanity'
import { useToast }   from '@sanity/ui'
import type { DocumentActionProps } from 'sanity'

/**
 * Replaces the default Publish action for Payment documents.
 *
 * For all payment modes except `service_contract_payment`:
 *   → Publishes the Payment document directly via client transaction.
 *
 * For `service_contract_payment` with a linked Service Contract:
 *   1. Publishes the Payment.
 *   2. Checks if the linked Service Contract has an unpublished draft.
 *   3. If yes → publishes it immediately after.
 *   4. Shows a combined success toast, or a warning if the SC publish fails.
 */
export function ServiceContractPaymentPublishAction(props: DocumentActionProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const toast  = useToast()
  const [busy, setBusy] = useState(false)

  const doc         = (props.draft ?? props.published) as Record<string, any> | null
  const paymentMode = doc?.paymentMode as string | undefined
  const scRef       = (doc?.linkedServiceContract as { _ref?: string } | undefined)?._ref
  const isScPayment = paymentMode === 'service_contract_payment' && !!scRef
  const publishedId = props.id.replace(/^drafts\./, '')

  async function onHandle() {
    setBusy(true)

    try {
      // Publish the Payment: copy draft → published, delete draft
      const paymentDraft = await client.getDocument(`drafts.${publishedId}`) as Record<string, any> | undefined
      if (paymentDraft) {
        const { _id: _dId, ...paymentRest } = paymentDraft
        await client
          .transaction()
          .createOrReplace({ ...paymentRest, _id: publishedId })
          .delete(`drafts.${publishedId}`)
          .commit()
      }

      if (!isScPayment) {
        setBusy(false)
        props.onComplete()
        return
      }

      // Give Sanity a moment to finish writing the published Payment
      await new Promise(r => setTimeout(r, 800))

      const scDraft = await client.getDocument(`drafts.${scRef}`) as Record<string, any> | undefined

      if (!scDraft) {
        // Service Contract has no draft — already in sync
        setBusy(false)
        props.onComplete()
        return
      }

      // Publish the Service Contract: copy draft → published, remove draft
      const { _id: _scDraftId, ...scRest } = scDraft
      await client
        .transaction()
        .createOrReplace({ ...scRest, _id: scRef })
        .delete(`drafts.${scRef}`)
        .commit()

      toast.push({
        status: 'success',
        title:  'Payment and Service Contract published',
      })
    } catch (err) {
      console.error('[ServiceContractPaymentPublishAction] Publish failed:', err)
      toast.push({
        status:      'warning',
        title:       'Publish failed',
        description: 'Could not auto-publish the Service Contract. Please publish it manually.',
      })
    }

    setBusy(false)
    props.onComplete()
  }

  return {
    label:    busy ? 'Publishing…' : 'Publish',
    tone:     'positive' as const,
    disabled: !props.draft || busy,
    onHandle,
  }
}
