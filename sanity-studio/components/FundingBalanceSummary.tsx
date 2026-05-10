/**
 * FundingBalanceSummary
 *
 * Shown on loan_drawdown and inter_company_loan records.
 * Queries all repayment records linked via relatedFunding._ref and computes:
 *   Original amount − sum of repayments = remaining balance
 *
 * Mirrors the NetPayableSummary / PaymentChainSummary pattern:
 * a read-only string field used purely as a display component.
 */

import { useEffect, useState } from 'react'
import { useClient, useFormValue } from 'sanity'
import { Card, Stack, Flex, Text, Box, Spinner, Badge } from '@sanity/ui'

const REPAYMENT_TYPES = ['loan_repayment', 'inter_company_repay']

export function FundingBalanceSummary(_props: any) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const rawId      = useFormValue(['_id'])          as string | undefined
  const amount     = useFormValue(['amount'])        as number | undefined
  const fundingType = useFormValue(['fundingType'])  as string | undefined

  const docId = rawId?.replace(/^drafts\./, '')

  const [totalRepaid, setTotalRepaid] = useState<number | null>(null)
  const [loading,     setLoading]     = useState(false)

  const isDrawdown = fundingType === 'loan_drawdown' || fundingType === 'inter_company_loan'

  useEffect(() => {
    if (!docId || !isDrawdown) return
    setLoading(true)
    client
      .fetch<number>(
        `math::sum(*[_type == "funding"
          && relatedFunding._ref == $id
          && fundingType in $types
          && !(_id in path("drafts.**"))
        ].amount)`,
        { id: docId, types: REPAYMENT_TYPES },
      )
      .then(sum => setTotalRepaid(sum ?? 0))
      .catch(() => setTotalRepaid(null))
      .finally(() => setLoading(false))
  }, [docId, isDrawdown, client])

  if (!isDrawdown) return null
  if (!amount) return null

  const fmt = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const remaining = amount - (totalRepaid ?? 0)

  return (
    <Card padding={3} radius={2} tone={remaining <= 0 ? 'positive' : 'primary'} border>
      <Stack space={2}>

        <Flex justify="space-between">
          <Text size={1} muted>Original Amount</Text>
          <Text size={1}>{fmt(amount)} THB</Text>
        </Flex>

        <Flex justify="space-between">
          <Text size={1} muted>Total Repaid</Text>
          {loading ? (
            <Spinner muted />
          ) : (
            <Text size={1} style={{ color: 'var(--card-critical-fg-color)' }}>
              − {fmt(totalRepaid ?? 0)} THB
            </Text>
          )}
        </Flex>

        <Box style={{ borderTop: '1px solid var(--card-border-color)' }} />

        <Flex justify="space-between" align="center">
          <Text size={1} weight="semibold">Remaining Balance</Text>
          {loading ? (
            <Spinner muted />
          ) : remaining <= 0 ? (
            <Badge tone="positive" mode="outline" fontSize={1}>Fully Settled</Badge>
          ) : (
            <Text size={1} weight="semibold">{fmt(remaining)} THB</Text>
          )}
        </Flex>

      </Stack>
    </Card>
  )
}
