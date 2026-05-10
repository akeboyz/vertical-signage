/**
 * AutoUnitCostInput
 *
 * Auto-derives the unit acquisition cost for an Asset from the first costSources entry.
 * Procurement → root payment obligation ÷ quantity, or quoted price per unit.
 * Payment     → paidAmount (or paymentAmount) ÷ assetQuantity.
 */

import { useEffect, useState }         from 'react'
import { set, useFormValue, useClient } from 'sanity'
import { Card, Flex, Text, Spinner }   from '@sanity/ui'
import type { NumberInputProps }        from 'sanity'

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function AutoUnitCostInput(props: NumberInputProps) {
  const client      = useClient({ apiVersion: '2024-01-01' })
  const costSources = useFormValue(['costSources']) as Array<{_ref?: string}> | undefined
  const firstRef    = costSources?.[0]?._ref

  const [loading, setLoading] = useState(false)
  const [source,  setSource]  = useState<string | null>(null)

  useEffect(() => {
    if (!firstRef) return
    setLoading(true)

    async function derive() {
      const doc = await client.fetch<{ _type: string }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){ _type }`,
        { id: firstRef },
      )

      if (doc?._type === 'payment') {
        const payment = await client.fetch<{
          paidAmount?: number; paymentAmount?: number; assetQuantity?: number
        }>(
          `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
            paidAmount, paymentAmount, assetQuantity
          }`,
          { id: firstRef },
        )
        const amount = payment?.paidAmount ?? payment?.paymentAmount ?? 0
        const qty    = payment?.assetQuantity ?? 1
        if (amount > 0) {
          const unitCost = Math.round((amount / qty) * 100) / 100
          if (props.value !== unitCost) props.onChange(set(unitCost))
          setSource(`Direct Payment · ${fmt(amount)} THB ÷ ${qty} unit${qty > 1 ? 's' : ''}`)
        } else {
          setSource(null)
        }
        return
      }

      // Procurement path
      const procDoc = await client.fetch<{
        quantity?: number
        comparisonItems?: Array<{ selected?: boolean; quotedPrice?: number }>
      }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
          quantity,
          comparisonItems[]{ selected, quotedPrice }
        }`,
        { id: firstRef },
      )

      const quantity = procDoc?.quantity ?? 1

      const rootPayment = await client.fetch<{ paymentAmount?: number } | null>(
        `*[_type == "payment" && references($id) && !defined(parentPayment) && !(_id in path("drafts.**"))][0]{
          paymentAmount
        }`,
        { id: firstRef },
      )
      if (rootPayment?.paymentAmount && rootPayment.paymentAmount > 0 && quantity > 0) {
        const unitCost = Math.round((rootPayment.paymentAmount / quantity) * 100) / 100
        if (props.value !== unitCost) props.onChange(set(unitCost))
        setSource(`Payment obligation · ${fmt(rootPayment.paymentAmount)} THB ÷ ${quantity} unit${quantity > 1 ? 's' : ''}`)
        return
      }

      const selected    = (procDoc?.comparisonItems ?? []).find(i => i.selected === true)
      const quotedPrice = selected?.quotedPrice
      if (quotedPrice != null && quotedPrice > 0) {
        if (props.value !== quotedPrice) props.onChange(set(quotedPrice))
        setSource(`Procurement · quoted price per unit`)
        return
      }

      setSource(null)
    }

    derive()
      .catch(() => setSource(null))
      .finally(() => setLoading(false))
  }, [firstRef]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <Flex align="center" gap={2} padding={1}>
      <Spinner muted />
      <Text size={1} muted>Calculating…</Text>
    </Flex>
  )

  if (!props.value && !firstRef) return (
    <Text size={1} muted style={{ fontStyle: 'italic' }}>
      Link a Source Document above to auto-calculate.
    </Text>
  )

  return (
    <Card padding={2} radius={2} tone="transparent" border>
      <Flex justify="space-between" align="center">
        <Text size={1} muted>{source ?? 'Primary cost'}</Text>
        <Text size={1} weight="semibold" style={{ fontFamily: 'monospace' }}>
          {props.value != null ? `${fmt(props.value)} THB` : '—'}
        </Text>
      </Flex>
    </Card>
  )
}
