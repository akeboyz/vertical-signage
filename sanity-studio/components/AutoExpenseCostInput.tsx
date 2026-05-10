/**
 * AutoExpenseCostInput
 *
 * Factory that returns a number input component for Installation cost fields
 * (5.2 Electrical, 5.3 Wifi, 5.5 Activation). Auto-sums paid direct-expense
 * payments that match the installation's projectSite and the given costGroup.
 *
 * Usage:
 *   const ElectricalCostInput = createAutoExpenseCostInput('electrical')
 */

import { useEffect, useState }              from 'react'
import { useClient, useFormValue }          from 'sanity'
import { set }                              from 'sanity'
import type { NumberInputProps }            from 'sanity'
import { Card, Text, Stack, Flex, Spinner, Badge } from '@sanity/ui'

interface ExpensePayment {
  _id:                 string
  paymentNumber?:      string
  paymentAmount?:      number
  paidAmount?:         number
  paymentStatus?:      string
  expenseDescription?: string
}

export function createAutoExpenseCostInput(costGroup: string) {
  function AutoExpenseCostInput(props: NumberInputProps) {
    const client      = useClient({ apiVersion: '2024-01-01' })
    const projectSite = useFormValue(['projectSite']) as { _ref?: string } | undefined

    const [payments, setPayments] = useState<ExpensePayment[]>([])
    const [loading,  setLoading]  = useState(false)

    const siteRef = projectSite?._ref

    useEffect(() => {
      if (!siteRef) { setPayments([]); return }

      setLoading(true)
      client
        .fetch<ExpensePayment[]>(
          `*[
            _type == "payment" &&
            paymentMode == "direct_expense" &&
            costGroup == $costGroup &&
            expenseProjectSite._ref == $siteRef &&
            !(paymentStatus in ["rejected"]) &&
            !(_id in path("drafts.**"))
          ] | order(_createdAt asc) {
            _id, paymentNumber, paymentAmount, paidAmount, paymentStatus, expenseDescription
          }`,
          { costGroup, siteRef },
        )
        .then(results => {
          setPayments(results ?? [])
          const total = (results ?? []).reduce(
            (sum, p) => sum + (p.paidAmount ?? p.paymentAmount ?? 0), 0,
          )
          if (props.value !== (total > 0 ? total : undefined)) {
            props.onChange(total > 0 ? set(total) : set(0))
          }
        })
        .catch(() => setPayments([]))
        .finally(() => setLoading(false))
    }, [siteRef]) // eslint-disable-line react-hooks/exhaustive-deps

    const total = payments.reduce((sum, p) => sum + (p.paidAmount ?? p.paymentAmount ?? 0), 0)

    return (
      <Stack space={2}>

        {/* Total display */}
        <Card padding={3} radius={2} tone={payments.length > 0 ? 'positive' : 'transparent'} border>
          <Flex justify="space-between" align="center">
            <Text size={1} weight="semibold">
              {loading ? '…' : `${total.toLocaleString()} THB`}
            </Text>
            {loading && <Spinner muted />}
            {!loading && payments.length > 0 && (
              <Badge tone="positive" mode="outline" fontSize={0}>
                Auto — from {payments.length} payment{payments.length > 1 ? 's' : ''}
              </Badge>
            )}
          </Flex>
        </Card>

        {/* Breakdown */}
        {!loading && payments.length > 0 && (
          <Stack space={1}>
            {payments.map(p => (
              <Card key={p._id} padding={2} radius={1} tone="transparent" border>
                <Flex justify="space-between" gap={2}>
                  <Text size={0} muted>
                    {p.paymentNumber ?? '(no number)'}
                    {p.expenseDescription ? ` · ${p.expenseDescription}` : ''}
                    {p.paymentStatus ? ` [${p.paymentStatus}]` : ''}
                  </Text>
                  <Text size={0} weight="semibold">
                    {(p.paidAmount ?? p.paymentAmount ?? 0).toLocaleString()} THB
                  </Text>
                </Flex>
              </Card>
            ))}
          </Stack>
        )}

        {!loading && !siteRef && (
          <Text size={0} muted>Link a Project Site to auto-derive cost from expense payments.</Text>
        )}

        {!loading && siteRef && payments.length === 0 && (
          <Text size={0} muted>No paid expense payments found for this project site and cost category.</Text>
        )}

      </Stack>
    )
  }

  AutoExpenseCostInput.displayName = `AutoExpenseCostInput(${costGroup})`
  return AutoExpenseCostInput
}
