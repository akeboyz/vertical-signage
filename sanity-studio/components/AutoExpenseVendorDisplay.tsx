/**
 * AutoExpenseVendorDisplay
 *
 * Factory that returns a read-only display component showing vendor(s)
 * from Direct Expense payments matching the installation's projectSite
 * and the given costGroup.
 */

import { useEffect, useState }     from 'react'
import { useClient, useFormValue } from 'sanity'
import type { StringInputProps }   from 'sanity'
import { Card, Text, Stack, Flex, Spinner, Badge } from '@sanity/ui'

interface ExpenseVendor {
  _id:           string
  expenseNumber?: string
  vendorName?:   string
  paymentNotes?: string
}

export function createAutoExpenseVendorDisplay(costGroup: string) {
  function AutoExpenseVendorDisplay(props: StringInputProps) {
    const client      = useClient({ apiVersion: '2024-01-01' })
    const projectSite = useFormValue(['projectSite']) as { _ref?: string } | undefined

    const [payments, setPayments] = useState<ExpenseVendor[]>([])
    const [loading,  setLoading]  = useState(false)

    const siteRef = projectSite?._ref

    useEffect(() => {
      if (!siteRef) { setPayments([]); return }
      setLoading(true)
      client
        .fetch<ExpenseVendor[]>(
          `*[
            _type == "payment" &&
            paymentMode == "direct_expense" &&
            costGroup == $costGroup &&
            expenseProjectSite._ref == $siteRef &&
            !(_id in path("drafts.**"))
          ] | order(_createdAt asc) {
            _id,
            expenseNumber,
            "vendorName": coalesce(vendor->legalName_en, vendor->legalName_th, vendor->legalName, vendor->firstName + " " + vendor->lastName),
            "paymentNotes": expenseDescription
          }`,
          { costGroup, siteRef },
        )
        .then(r => setPayments(r ?? []))
        .catch(() => setPayments([]))
        .finally(() => setLoading(false))
    }, [siteRef]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!siteRef) {
      return <Text size={1} muted>Link a Project Site to see vendor info from expense payments.</Text>
    }

    if (loading) {
      return (
        <Flex align="center" gap={2}>
          <Spinner muted />
          <Text size={1} muted>Loading…</Text>
        </Flex>
      )
    }

    if (payments.length === 0) {
      return <Text size={1} muted>No expense payments found for this project site and cost category.</Text>
    }

    return (
      <Stack space={2}>
        <Badge tone="primary" mode="outline" fontSize={0}>From expense payments</Badge>
        {payments.map(p => (
          <Card key={p._id} padding={3} radius={2} border tone="transparent">
            <Stack space={1}>
              <Flex justify="space-between" gap={2}>
                <Text size={1} weight="semibold">{p.vendorName ?? '(no vendor)'}</Text>
                <Text size={0} muted>{p.expenseNumber ?? ''}</Text>
              </Flex>
              {p.paymentNotes && (
                <Text size={0} muted>{p.paymentNotes}</Text>
              )}
            </Stack>
          </Card>
        ))}
      </Stack>
    )
  }

  AutoExpenseVendorDisplay.displayName = `AutoExpenseVendorDisplay(${costGroup})`
  return AutoExpenseVendorDisplay
}
