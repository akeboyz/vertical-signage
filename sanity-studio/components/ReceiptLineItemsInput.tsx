/**
 * ReceiptLineItemsInput
 *
 * Wraps the default array editor for Receipt.lineItems and adds a
 * "Pre-fill from Process Setup template" button.
 *
 * On click:
 *  1. Resolves the linked contract → its contractType (Process Setup)
 *  2. Reads receiptCharges[] (active entries only)
 *  3. Copies each charge as a snapshot into lineItems on the draft document
 *
 * The copy is one-way (create-time snapshot). Subsequent edits to the
 * Process Setup template do not affect already-created line items.
 * sourceChargeKey preserves a traceability link back to the template entry.
 */

import { useState, useCallback }   from 'react'
import { useClient, useFormValue } from 'sanity'
import type { ArrayOfObjectsInputProps } from 'sanity'
import { Stack, Card, Flex, Text, Button, Spinner } from '@sanity/ui'

interface ReceiptCharge {
  _key:             string
  label_en:         string
  label_th?:        string
  accountCode?:     { _ref: string; _type: string }
  defaultAmount?:   number
  defaultVatType?:  string
  isActive?:        boolean
}

function newKey(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function ReceiptLineItemsInput(props: ArrayOfObjectsInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const rawId   = useFormValue(['_id']) as string | undefined
  const draftId = rawId
    ? (rawId.startsWith('drafts.') ? rawId : `drafts.${rawId}`)
    : undefined

  const linkedContractRef = useFormValue(['linkedContract', '_ref']) as string | undefined

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [copied,  setCopied]  = useState(false)

  const handlePrefill = useCallback(async () => {
    if (!linkedContractRef || !draftId) return
    setLoading(true)
    setError(null)
    setCopied(false)

    try {
      // Resolve contract → contractType → receiptCharges
      // Works for both rentSpace (contract) and serviceContract — both carry contractType
      const result = await client.fetch<{
        contractType?: { receiptCharges?: ReceiptCharge[] }
      }>(
        `coalesce(
          *[_id == $draftId][0],
          *[_id == $id][0]
        ){
          contractType->{ receiptCharges[]{ _key, label_en, label_th, accountCode, defaultAmount, defaultVatType, isActive } }
        }`,
        { id: linkedContractRef, draftId: `drafts.${linkedContractRef}` },
      )

      const charges = (result?.contractType?.receiptCharges ?? []).filter(c => c.isActive !== false)

      if (charges.length === 0) {
        setError(
          'No active receipt charges found on this contract\'s Process Setup. ' +
          'Enable "Use for Receipt" on the Process Setup and add charges under Receipt Config.',
        )
        return
      }

      const lineItems = charges.map(charge => ({
        _type:           'lineItem',
        _key:            newKey(),
        sourceChargeKey: charge._key,
        description_en:  charge.label_en,
        description_th:  charge.label_th ?? '',
        accountCode:     charge.accountCode
          ? { _type: 'reference', _ref: charge.accountCode._ref, _weak: true }
          : undefined,
        quantity:        1,
        unitPrice:       charge.defaultAmount ?? 0,
        vatType:         charge.defaultVatType ?? 'exclusive',
        lineTotal:       charge.defaultAmount ?? 0,
      }))

      await client.patch(draftId).set({ lineItems }).commit()
      setCopied(true)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load template charges.')
    } finally {
      setLoading(false)
    }
  }, [client, draftId, linkedContractRef])

  return (
    <Stack space={3}>

      {/* Pre-fill action row */}
      {linkedContractRef ? (
        <Flex align="center" gap={2}>
          {loading ? (
            <>
              <Spinner muted />
              <Text size={1} muted>Loading template charges…</Text>
            </>
          ) : (
            <Button
              text={copied ? '✓ Pre-filled — edit below if needed' : '📋 Pre-fill from Process Setup template'}
              mode="ghost"
              tone={copied ? 'positive' : 'primary'}
              onClick={handlePrefill}
              disabled={loading || !draftId}
            />
          )}
        </Flex>
      ) : (
        <Card padding={2} radius={2} tone="caution" border>
          <Text size={1}>Link a contract in 1.7 to enable pre-fill from its Process Setup template.</Text>
        </Card>
      )}

      {error && (
        <Card padding={2} radius={2} tone="critical" border>
          <Text size={1}>{error}</Text>
        </Card>
      )}

      {/* Default array editor — add, edit, reorder, remove items */}
      {props.renderDefault(props)}

    </Stack>
  )
}
