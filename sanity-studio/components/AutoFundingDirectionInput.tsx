/**
 * AutoFundingDirectionInput
 *
 * Derives and stores `direction` ("inflow" | "outflow") automatically
 * from `fundingType` whenever the type changes.
 *
 * Renders a read-only badge so the direction is always visible at the
 * top of the form — no user interaction needed.
 */

import { useEffect }          from 'react'
import { set, useFormValue }  from 'sanity'
import { Badge, Flex }        from '@sanity/ui'
import type { StringInputProps } from 'sanity'

const INFLOW_TYPES  = new Set(['loan_drawdown', 'equity_injection', 'inter_company_loan'])
const OUTFLOW_TYPES = new Set(['loan_repayment', 'dividend_payment', 'inter_company_repay'])

function deriveDirection(fundingType: string | undefined): 'inflow' | 'outflow' | undefined {
  if (!fundingType) return undefined
  if (INFLOW_TYPES.has(fundingType))  return 'inflow'
  if (OUTFLOW_TYPES.has(fundingType)) return 'outflow'
  return undefined
}

export function AutoFundingDirectionInput(props: StringInputProps) {
  const fundingType = useFormValue(['fundingType']) as string | undefined
  const direction   = deriveDirection(fundingType)

  useEffect(() => {
    if (direction && direction !== props.value) {
      props.onChange(set(direction))
    }
  }, [direction]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!direction) return null

  return (
    <Flex align="center" paddingY={1}>
      {direction === 'inflow' ? (
        <Badge tone="positive" mode="outline" fontSize={1} padding={3}>
          📥 Inflow — Funds Received
        </Badge>
      ) : (
        <Badge tone="critical" mode="outline" fontSize={1} padding={3}>
          📤 Outflow — Funds Paid
        </Badge>
      )}
    </Flex>
  )
}
