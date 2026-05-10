/**
 * AutoAllocatedCostInput
 *
 * Used inside additionalCostSources[].allocatedCost.
 * Watches the sibling sourceDocument ref and auto-fills cost from the linked document.
 *
 * Procurement → invoiceAmount ÷ quantity
 * Payment     → paidAmount or paymentAmount ÷ assetQuantity
 *
 * User can always override.
 */

import { useEffect, useState, useCallback } from 'react'
import { set, useFormValue, useClient }     from 'sanity'
import { Stack, Flex, Text, Spinner, Badge, Button } from '@sanity/ui'
import { ResetIcon } from '@sanity/icons'
import type { NumberInputProps } from 'sanity'

export function AutoAllocatedCostInput(props: NumberInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const itemKey = (props.path.find(seg => typeof seg === 'object' && '_key' in seg) as { _key?: string } | undefined)?._key

  const allSources = useFormValue(['additionalCostSources']) as any[] | undefined
  const thisItem   = allSources?.find((s: any) => s._key === itemKey)

  const sourceRef = thisItem?.sourceDocument?._ref as string | undefined

  const [loading,    setLoading]    = useState(false)
  const [autoSource, setAutoSource] = useState<string | null>(null)
  const [isOverride, setIsOverride] = useState(false)

  const applyAuto = useCallback((amount: number, label: string) => {
    if (!isOverride) {
      props.onChange(set(amount))
      setAutoSource(label)
    }
  }, [isOverride, props])

  useEffect(() => {
    if (isOverride) return
    if (!sourceRef) { setAutoSource(null); return }

    setLoading(true)

    client
      .fetch<{ _type: string }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){ _type }`,
        { id: sourceRef },
      )
      .then(async doc => {
        if (!doc) return

        if (doc._type === 'payment') {
          const payment = await client.fetch<{
            paidAmount?: number; paymentAmount?: number; assetQuantity?: number; docNumber?: string
          }>(
            `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
              paidAmount, paymentAmount, assetQuantity, docNumber
            }`,
            { id: sourceRef },
          )
          const total  = payment?.paidAmount ?? payment?.paymentAmount ?? 0
          const qty    = payment?.assetQuantity ?? 1
          const amount = Math.round((total / qty) * 100) / 100
          if (amount > 0) {
            const qtyNote = qty > 1 ? ` ÷ ${qty} assets` : ''
            applyAuto(amount, `${payment?.docNumber ?? 'Payment'}${qtyNote} · ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`)
          } else setAutoSource(null)
        } else {
          const proc = await client.fetch<{
            invoiceAmount?: number; quantity?: number; docNumber?: string
          }>(
            `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
              invoiceAmount, quantity, docNumber
            }`,
            { id: sourceRef },
          )
          const total  = proc?.invoiceAmount ?? 0
          const qty    = proc?.quantity ?? 1
          const amount = Math.round((total / qty) * 100) / 100
          if (amount > 0) {
            const qtyNote = qty > 1 ? ` ÷ ${qty} units` : ''
            applyAuto(amount, `${proc?.docNumber ?? 'Procurement'}${qtyNote} · ${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} THB`)
          } else setAutoSource(null)
        }
      })
      .catch(() => setAutoSource(null))
      .finally(() => setLoading(false))
  }, [sourceRef, isOverride]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = () => {
    setIsOverride(false)
    setAutoSource(null)
  }

  return (
    <Stack space={2}>
      <div onChange={() => { if (!isOverride && autoSource) setIsOverride(true) }}>
        {props.renderDefault(props)}
      </div>

      {loading && (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Fetching amount…</Text>
        </Flex>
      )}

      {!loading && autoSource && !isOverride && (
        <Flex align="center" gap={2}>
          <Badge tone="positive" mode="outline" fontSize={0}>Auto</Badge>
          <Text size={0} muted>{autoSource}</Text>
        </Flex>
      )}

      {!loading && isOverride && (
        <Flex align="center" gap={2}>
          <Badge tone="caution" mode="outline" fontSize={0}>Override</Badge>
          <Button
            tone="default"
            mode="ghost"
            fontSize={0}
            padding={1}
            icon={ResetIcon}
            text="Reset to auto"
            onClick={handleReset}
          />
        </Flex>
      )}

      {!loading && !sourceRef && (
        <Text size={0} muted>Select a Source Document above to auto-fill.</Text>
      )}
    </Stack>
  )
}
