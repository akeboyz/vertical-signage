/**
 * ApprovalLockedBanner / ContractLockedBanner
 *
 * Banner components that warn the user when a document's key fields are locked
 * because it has been approved.
 *
 * ApprovalLockedBanner   — reads `approvalStatus`         (Procurement, Payment, Project Site)
 * ContractLockedBanner   — reads `contractApprovalStatus` (Rent Space / contract)
 */

import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'
import { Card, Text, Stack, Flex, Badge } from '@sanity/ui'

// ── shared banner UI ─────────────────────────────────────────────────────────

function LockedBannerUI({
  isLocked,
  lockedFields,
  resetReason,
}: {
  isLocked:     boolean
  lockedFields: string
  resetReason?: string
}) {
  if (!isLocked) return null

  return (
    <Card padding={4} radius={2} tone="caution" border>
      <Stack space={3}>
        <Flex align="center" gap={2}>
          <Badge tone="caution" fontSize={0} mode="filled">🔒 Approved & Locked</Badge>
        </Flex>

        <Text size={1}>
          This document has been approved. {lockedFields} are now{' '}
          <strong>read-only</strong> and cannot be changed.
        </Text>

        <Text size={1}>
          To make changes, reset the approval status from the{' '}
          <strong>Approval</strong> panel, then re-submit for approval once edits are complete.
        </Text>

        {resetReason && (
          <Card padding={3} radius={2} tone="caution" border>
            <Text size={0} muted>Last reset reason: {resetReason}</Text>
          </Card>
        )}
      </Stack>
    </Card>
  )
}

// ── Procurement / Payment / Project Site ─────────────────────────────────────

/** Used by Procurement, Payment, and Project Site — reads `approvalStatus`. */
export function ApprovalLockedBanner(_props: StringInputProps) {
  const approvalStatus = useFormValue(['approvalStatus'])      as string | undefined
  const resetReason    = useFormValue(['approvalResetReason']) as string | undefined

  return (
    <LockedBannerUI
      isLocked={approvalStatus === 'approved'}
      lockedFields="Key setup fields"
      resetReason={resetReason}
    />
  )
}

// ── Rent Space (contract) ─────────────────────────────────────────────────────

/** Used by the Rent Space schema — reads `contractApprovalStatus`. */
export function ContractLockedBanner(_props: StringInputProps) {
  const contractStatus = useFormValue(['contractApprovalStatus']) as string | undefined
  const resetReason    = useFormValue(['approvalResetReason'])    as string | undefined

  return (
    <LockedBannerUI
      isLocked={contractStatus === 'approved'}
      lockedFields="Project Site, Contract Type, Party, Quotation Number, Contract Number, and Contract Fields"
      resetReason={resetReason}
    />
  )
}
