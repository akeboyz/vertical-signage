import { useState, useCallback } from 'react'
import { Stack, Text, Card, Flex, Button, Spinner, Badge } from '@sanity/ui'
import { useClient } from 'sanity'
import type { DocumentActionProps, DocumentActionDescription } from 'sanity'

/**
 * Document Action — appears on Contract documents that have a legacy
 * `customerName` text field but no `party` reference linked yet.
 *
 * Creates a new Party document pre-filled with the customer name,
 * then patches the contract's `party` field to reference it.
 */
export function CreatePartyFromContractAction(
  props: DocumentActionProps,
): DocumentActionDescription | null {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [open,     setOpen]     = useState(false)
  const [creating, setCreating] = useState(false)
  const [done,     setDone]     = useState(false)
  const [partyId,  setPartyId]  = useState<string | null>(null)
  const [error,    setError]    = useState('')

  const doc          = props.draft ?? props.published
  const customerName = doc?.customerName as string | undefined
  const partyRef     = (doc?.party as any)?._ref as string | undefined

  // Only show when legacy customerName exists but no party is linked yet
  if (!customerName?.trim() || partyRef) return null

  const handleCreate = useCallback(async () => {
    setCreating(true)
    setError('')
    try {
      // 1. Create new Party document
      const newParty = await client.create({
        _type:        'party',
        partyRole:    ['juristicPerson'],
        identityType: 'corporate',
        legalName_th: customerName.trim(),
      })

      // 2. Patch the published contract — Sanity creates a proper draft from it
      const baseId = props.id.replace(/^drafts\./, '')
      await client
        .patch(baseId)
        .set({ party: { _type: 'reference', _ref: newParty._id } })
        .commit({ autoGenerateArrayKeys: true })

      setPartyId(newParty._id)
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to create party')
    } finally {
      setCreating(false)
    }
  }, [client, customerName, props.id])

  const handleClose = useCallback(() => {
    setOpen(false)
    if (done) props.onComplete()
  }, [done, props])

  return {
    label:    'Create Party',
    tone:     'primary',
    onHandle: () => setOpen(true),

    dialog: open
      ? {
          type:    'dialog',
          header:  'Create Party from Contract',
          onClose: handleClose,
          content: (
            <Stack space={4} padding={4}>

              {!done ? (
                <>
                  <Text size={1} muted>
                    A new Party record will be created and linked to this contract:
                  </Text>

                  <Card padding={3} border radius={2} tone="primary">
                    <Stack space={2}>
                      <Flex gap={2} align="center">
                        <Badge tone="primary" fontSize={0}>Legal Name (TH)</Badge>
                        <Text size={1} weight="semibold">{customerName}</Text>
                      </Flex>
                      <Flex gap={2} align="center">
                        <Badge tone="default" fontSize={0}>Role</Badge>
                        <Text size={1}>🏛️ Juristic Person</Text>
                      </Flex>
                      <Flex gap={2} align="center">
                        <Badge tone="default" fontSize={0}>Identity</Badge>
                        <Text size={1}>Corporate</Text>
                      </Flex>
                    </Stack>
                  </Card>

                  <Text size={0} muted>
                    You can edit all details after creation. The legal name in English,
                    contact info, and role-specific fields can be filled in the Party record.
                  </Text>

                  {error && (
                    <Card padding={3} border radius={2} tone="critical">
                      <Text size={1}>{error}</Text>
                    </Card>
                  )}

                  <Flex gap={3} justify="flex-end">
                    <Button
                      text="Cancel"
                      mode="ghost"
                      onClick={handleClose}
                      disabled={creating}
                    />
                    {creating ? (
                      <Flex gap={2} align="center">
                        <Spinner muted />
                        <Text size={1} muted>Creating…</Text>
                      </Flex>
                    ) : (
                      <Button
                        text="Create & Link Party"
                        tone="primary"
                        onClick={handleCreate}
                      />
                    )}
                  </Flex>
                </>
              ) : (
                <>
                  <Card padding={3} border radius={2} tone="positive">
                    <Stack space={2}>
                      <Text size={1} weight="semibold">✓ Party created and linked</Text>
                      <Text size={1} muted>
                        "{customerName}" has been created as a Party record
                        and linked to this contract.
                      </Text>
                    </Stack>
                  </Card>

                  <Text size={0} muted>
                    Open the Party record to fill in the English name, contact info,
                    and any role-specific details.
                  </Text>

                  <Flex gap={3} justify="flex-end">
                    <Button
                      text="Close"
                      mode="ghost"
                      onClick={handleClose}
                    />
                    {partyId && (
                      <Button
                        text="Open Party Record →"
                        tone="primary"
                        as="a"
                        href={`/intent/edit/id=${partyId};type=party`}
                        onClick={handleClose}
                      />
                    )}
                  </Flex>
                </>
              )}

            </Stack>
          ),
        }
      : undefined,
  }
}
