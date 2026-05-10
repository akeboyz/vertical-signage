/**
 * ParentPaymentInput
 *
 * Wraps the 1.3b Root Payment reference field. Does two things:
 *
 * 1. isSettled sync — on mount, queries all procurement payments and patches
 *    isSettled so the reference filter hides fully-settled roots.
 *
 * 2. Auto-fill — when the user selects (or the form loads with) a root payment,
 *    patches the draft document with vendor, GL account, currency, exchange rate,
 *    VAT type, W/H tax rate, and process setup copied from the root.
 *
 *    On mount with existing selection → setIfMissing (never overwrites saved values)
 *    On user changing selection       → set (overwrites to match the new root)
 */

import { useEffect, useRef, useState } from 'react'
import { useClient, useFormValue }      from 'sanity'
import type { ReferenceInputProps }     from 'sanity'
import { Flex, Spinner, Text, Badge, Stack } from '@sanity/ui'

export function ParentPaymentInput(props: ReferenceInputProps) {
  const client      = useClient({ apiVersion: '2024-01-01' })
  const docId       = useFormValue(['_id']) as string | undefined
  const publishedId = docId?.replace(/^drafts\./, '') ?? ''

  const [ready,      setReady]      = useState(false)
  const [filling,    setFilling]    = useState(false)
  const [filledFrom, setFilledFrom] = useState<string | null>(null)

  const synced     = useRef(false)
  const prevRootId = useRef<string | undefined>(undefined)

  const rootRef = (props.value as any)?._ref as string | undefined

  // ── 1. Sync isSettled on all procurement root payments (once per mount) ───
  useEffect(() => {
    if (synced.current) return
    synced.current = true

    client
      .fetch<Array<{
        _id:           string
        paymentAmount?: number
        paidAmount?:   number
        isSettled?:    boolean
        installments:  Array<{ paidAmount?: number }>
      }>>(
        `*[_type == "payment" && paymentMode == "procurement" && !(_id in path("drafts.**"))]{
          _id,
          paymentAmount,
          "paidAmount": coalesce(*[_id == "drafts." + ^._id][0].paidAmount, paidAmount),
          isSettled,
          "installments": *[_type == "payment" && parentPayment._ref == ^._id && !(_id in path("drafts.**"))]{
            "paidAmount": coalesce(*[_id == "drafts." + ^._id][0].paidAmount, paidAmount)
          }
        }`,
      )
      .then(payments => {
        const patches = (payments ?? [])
          .map(p => {
            const obligation = p.paymentAmount ?? 0
            const totalPaid  = (p.paidAmount ?? 0) + p.installments.reduce((s, i) => s + (i.paidAmount ?? 0), 0)
            const settled    = obligation > 0 && totalPaid >= obligation
            if (!settled || p.isSettled === true) return null
            return client.patch(p._id).set({ isSettled: true }).commit()
          })
          .filter(Boolean)
        return Promise.all(patches)
      })
      .catch(() => {})
      .finally(() => setReady(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2. Auto-fill from root payment ────────────────────────────────────────
  useEffect(() => {
    if (!rootRef || rootRef === prevRootId.current) return

    // First time we see this ref (mount or fresh selection):
    //   - mount with existing value → setIfMissing (don't overwrite saved data)
    //   - user changed selection    → set (overwrite to match new root)
    const useMissing = prevRootId.current === undefined
    prevRootId.current = rootRef

    if (!publishedId) return

    setFilling(true)
    setFilledFrom(null)

    client
      .fetch<{
        paymentNumber?:      string
        vendorRef?:          string
        accountCodeRef?:     string
        currency?:           string
        exchangeRate?:       number
        vatType?:            string
        withholdingTaxRate?: string
        contractTypeRef?:    string
      }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
          paymentNumber,
          "vendorRef":       vendor._ref,
          "accountCodeRef":  accountCode._ref,
          currency,
          exchangeRate,
          vatType,
          withholdingTaxRate,
          "contractTypeRef": contractType._ref
        }`,
        { id: rootRef },
      )
      .then(root => {
        if (!root) return

        const data: Record<string, unknown> = {}

        if (root.vendorRef)
          data.vendor = { _ref: root.vendorRef, _type: 'reference' }
        if (root.accountCodeRef)
          data.accountCode = { _ref: root.accountCodeRef, _type: 'reference' }
        if (root.currency)
          data.currency = root.currency
        if (root.exchangeRate)
          data.exchangeRate = root.exchangeRate
        if (root.vatType)
          data.vatType = root.vatType
        if (root.withholdingTaxRate && root.withholdingTaxRate !== 'none')
          data.withholdingTaxRate = root.withholdingTaxRate
        if (root.contractTypeRef)
          data.contractType = { _ref: root.contractTypeRef, _type: 'reference' }

        if (Object.keys(data).length === 0) return

        const draftId = `drafts.${publishedId}`
        const p = useMissing
          ? client.patch(draftId).setIfMissing(data)
          : client.patch(draftId).set(data)

        return p.commit()
          .then(() => setFilledFrom(root.paymentNumber ?? null))
      })
      .catch(() => {})
      .finally(() => setFilling(false))
  }, [rootRef]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading available payments…</Text>
      </Flex>
    )
  }

  return (
    <Stack space={2}>
      {props.renderDefault(props)}

      {filling && (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Auto-filling from root payment…</Text>
        </Flex>
      )}

      {!filling && filledFrom && (
        <Flex align="center" gap={2}>
          <Badge tone="primary" mode="outline" fontSize={0}>Auto-filled</Badge>
          <Text size={0} muted>
            Vendor, GL account, currency, VAT &amp; W/H tax copied from {filledFrom}
          </Text>
        </Flex>
      )}
    </Stack>
  )
}
