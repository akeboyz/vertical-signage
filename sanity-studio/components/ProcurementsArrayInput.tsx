/**
 * ProcurementsArrayInput
 *
 * Custom array input for Payment.procurements[].
 * Renders the native Sanity array/reference UI (dropdown arrow, search, etc.)
 * and auto-fills the vendor field from the first linked procurement.
 */

import { useEffect, useRef, useState } from 'react'
import { useClient, useFormValue }      from 'sanity'
import type { ArrayInputProps }         from 'sanity'
import { Card, Text, Flex, Spinner, Stack } from '@sanity/ui'

export function ProcurementsArrayInput(props: ArrayInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const docId  = useFormValue(['_id']) as string | undefined

  const procurements   = useFormValue(['procurements']) as Array<{ _ref: string }> | undefined
  const existingVendor = useFormValue(['vendor', '_ref']) as string | undefined

  const prevRefs = useRef<string>('')
  const [filling,    setFilling]    = useState(false)
  const [vendorName, setVendorName] = useState<string | null>(null)

  const refs = (procurements ?? []).map(p => p._ref).filter(Boolean)

  useEffect(() => {
    const refsKey = refs.join(',')
    if (refsKey === prevRefs.current) return
    prevRefs.current = refsKey

    if (refs.length === 0) { setVendorName(null); return }
    if (existingVendor) return
    if (!docId) return

    setFilling(true)
    client
      .fetch<{ vendorRef?: string; vendorName?: string }>(
        `*[_id == $id || _id == "drafts." + $id][0]{
          "vendorRef":  comparisonItems[selected == true][0].vendor._ref,
          "vendorName": comparisonItems[selected == true][0].vendor->legalName_en
        }`,
        { id: refs[0] },
      )
      .then(proc => {
        if (!proc?.vendorRef) return
        client.patch(docId).set({ vendor: { _type: 'reference', _ref: proc.vendorRef } }).commit().catch(() => {})
        setVendorName(proc.vendorName ?? null)
      })
      .catch(() => {})
      .finally(() => setFilling(false))
  }, [refs.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Stack space={2}>
      {props.renderDefault(props)}

      {filling && (
        <Card padding={2} radius={2} tone="primary">
          <Flex align="center" gap={2}>
            <Spinner muted />
            <Text size={1} muted>Auto-filling vendor from Procurement…</Text>
          </Flex>
        </Card>
      )}
      {!filling && vendorName && (
        <Card padding={2} radius={2} tone="transparent">
          <Text size={1} muted>
            Vendor auto-filled: <strong>{vendorName}</strong>. All linked Procurements must be from the same vendor.
          </Text>
        </Card>
      )}
    </Stack>
  )
}
