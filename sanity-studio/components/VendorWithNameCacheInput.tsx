/**
 * VendorWithNameCacheInput
 *
 * Thin wrapper around the default reference input for the Payment vendor field.
 * Whenever the selected vendor changes, it fetches the party's display name and
 * writes it to the hidden `vendorName` field on the same document.
 *
 * This allows the payment list to be sorted by vendor name — Sanity list
 * orderings can only sort on scalar fields stored directly on the document;
 * they cannot dereference across documents. `vendorName` is that scalar.
 */

import { useEffect }               from 'react'
import { useClient, useFormValue } from 'sanity'

export function VendorWithNameCacheInput(props: any) {
  const client    = useClient({ apiVersion: '2024-01-01' })
  const rawId     = useFormValue(['_id']) as string | undefined
  const vendorRef = (props.value as any)?._ref as string | undefined

  // Patch rawId directly: if the document has no draft yet (rawId = published base ID),
  // patching the published doc is fine for this sort-cache field — the Studio will inherit
  // it into any subsequent draft. If there IS a draft, rawId is already "drafts.xxx".
  useEffect(() => {
    if (!rawId) return

    if (!vendorRef) {
      client.patch(rawId).unset(['vendorName']).commit().catch(() => {})
      return
    }

    let cancelled = false
    client
      .fetch<{ shortName?: string; legalName_en?: string; legalName_th?: string; nameTh?: string; nameEn?: string } | null>(
        `coalesce(
          *[_id == ("drafts." + $ref)][0],
          *[_id == $ref][0]
        ){ shortName, legalName_en, legalName_th, nameTh, nameEn }`,
        { ref: vendorRef },
      )
      .then(party => {
        if (cancelled) return
        const parts = [party?.shortName, party?.legalName_en, party?.legalName_th, party?.nameTh, party?.nameEn]
          .map(v => v?.trim())
          .filter((v): v is string => Boolean(v))
        const name = [...new Set(parts)].join(' ')
        if (name) {
          client.patch(rawId).set({ vendorName: name }).commit().catch(() => {})
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [vendorRef, rawId]) // eslint-disable-line react-hooks/exhaustive-deps

  return props.renderDefault(props)
}
