/**
 * ServiceContractPaymentsDisplay
 *
 * Read-only summary for the Service Contract payments array.
 * Reads the contract's own `payments[]` (objects with servicePeriodStart,
 * servicePeriodEnd, and a payment reference) so period dates are shown
 * alongside each payment row — same style as Rent Space billing periods.
 */

import { useEffect, useState }    from 'react'
import { useFormValue, useClient } from 'sanity'
import type { StringInputProps }  from 'sanity'
import { IntentLink }             from 'sanity/router'
import { Text, Stack, Flex, Spinner, Badge, Card } from '@sanity/ui'

interface BillingEntry {
  _key:                string
  servicePeriodStart?: string
  servicePeriodEnd?:   string
  payment?: {
    _id:             string
    paymentNumber?:  string
    paymentStatus?:  string
    paymentAmount?:  number
    paidAmount?:     number
    whtAmount?:      number
    vatType?:        string
    vatAmount?:      number
    paymentDate?:    string
    currency?:       string
    vendor?: { legalName_en?: string; legalName_th?: string }
  }
}

const STATUS_LABEL: Record<string, string> = {
  created:       '📝 Created',
  submitted:     '📤 Submitted',
  approved:      '✅ Approved',
  rejected:      '❌ Rejected',
  condition_met: '🔍 Condition Met',
  processing:    '🔄 Processing',
  paid:          '💳 Paid',
  complete:      '🧾 Complete',
}

const STATUS_TONE: Record<string, 'default' | 'positive' | 'caution' | 'critical'> = {
  created:       'default',
  submitted:     'caution',
  approved:      'positive',
  rejected:      'critical',
  condition_met: 'caution',
  processing:    'caution',
  paid:          'positive',
  complete:      'positive',
}

const SETTLED = new Set(['paid', 'complete'])

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtAmount(n: number, currency = 'THB'): string {
  return `${Number(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

export function ServiceContractPaymentsDisplay(_props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const rawId  = useFormValue(['_id']) as string | undefined
  const docId  = rawId?.replace(/^drafts\./, '')

  const [billings, setBillings] = useState<BillingEntry[]>([])
  const [vatNote,  setVatNote]  = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    client
      .fetch<{ vatNote?: string; billings: BillingEntry[] }>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]) {
          vatNote,
          "billings": payments[] {
            _key,
            servicePeriodStart,
            servicePeriodEnd,
            "payment": payment-> {
              _id, paymentNumber, paymentStatus,
              paymentAmount, paidAmount, whtAmount, vatType, vatAmount,
              paymentDate, currency,
              "vendor": vendor->{ legalName_en, legalName_th }
            }
          }
        }`,
        { id: docId },
      )
      .then(doc => {
        const sorted = (doc?.billings ?? []).slice().sort((a, b) => {
          const cmp = (b.servicePeriodStart ?? '').localeCompare(a.servicePeriodStart ?? '')
          if (cmp !== 0) return cmp
          return (b.servicePeriodEnd ?? '').localeCompare(a.servicePeriodEnd ?? '')
        })
        setBillings(sorted)
        setVatNote(doc?.vatNote ?? null)
      })
      .catch(() => setBillings([]))
      .finally(() => setLoading(false))
  }, [docId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading payment history…</Text>
      </Flex>
    )
  }

  if (billings.length === 0) {
    return (
      <Card padding={3} radius={2} tone="transparent" border>
        <Text size={1} muted>No billing entries yet. Use "+ Add item" below to link a payment and record its period.</Text>
      </Card>
    )
  }

  const settledCount = billings.filter(b => SETTLED.has(b.payment?.paymentStatus ?? '')).length

  const calcNet = (p: BillingEntry['payment']): number => {
    const gross = p?.paidAmount ?? p?.paymentAmount ?? 0
    const wht   = p?.whtAmount ?? 0
    const vat   = p?.vatType === 'exclusive' ? (p?.vatAmount ?? 0) : 0
    return gross - wht + vat
  }

  const totalGross = billings
    .filter(b => SETTLED.has(b.payment?.paymentStatus ?? ''))
    .reduce((s, b) => s + (b.payment?.paidAmount ?? b.payment?.paymentAmount ?? 0), 0)
  const totalNet = billings
    .filter(b => SETTLED.has(b.payment?.paymentStatus ?? ''))
    .reduce((s, b) => s + calcNet(b.payment), 0)

  return (
    <Stack space={2}>

      {billings.map(b => {
        const p          = b.payment
        const statusKey  = p?.paymentStatus ?? ''
        const isSettled  = SETTLED.has(statusKey)
        const displayAmt = p ? (p.paidAmount ?? p.paymentAmount) : null
        const vendorName = p?.vendor?.legalName_en ?? p?.vendor?.legalName_th ?? ''

        const periodStr =
          b.servicePeriodStart && b.servicePeriodEnd
            ? `${fmtDate(b.servicePeriodStart)} – ${fmtDate(b.servicePeriodEnd)}`
            : b.servicePeriodStart
            ? `From ${fmtDate(b.servicePeriodStart)}`
            : '— no period set'

        return (
          <Card
            key={b._key}
            padding={3}
            radius={2}
            tone={isSettled ? 'transparent' : 'caution'}
            border
          >
            <Stack space={2}>

              {/* Row 1 — period + status badge */}
              <Flex justify="space-between" align="center" gap={3}>
                <Text size={1} weight="semibold">{periodStr}</Text>
                {p && (
                  <Badge
                    tone={STATUS_TONE[statusKey] ?? 'default'}
                    mode="outline"
                    fontSize={0}
                    style={{ flexShrink: 0 }}
                  >
                    {STATUS_LABEL[statusKey] ?? statusKey}
                  </Badge>
                )}
              </Flex>

              {/* Row 2 — payment link + amount */}
              {p ? (
                <Flex justify="space-between" align="center" gap={3}>
                  <Stack space={1} style={{ flex: 1, minWidth: 0 }}>
                    <IntentLink
                      intent="edit"
                      params={{ id: p._id, type: 'payment' }}
                      style={{ textDecoration: 'none' }}
                    >
                      <Text size={1} style={{ color: '#2563EB' }}>
                        {p.paymentNumber ?? '(no number)'}
                        {vendorName ? `  ·  ${vendorName}` : ''}
                      </Text>
                    </IntentLink>
                    {p.paymentDate && (
                      <Text size={0} muted>Paid {fmtDate(p.paymentDate)}</Text>
                    )}
                  </Stack>
                  {displayAmt != null && (
                    <Stack space={1} style={{ textAlign: 'right', flexShrink: 0 }}>
                      <Stack space={0}>
                        <Text size={0} muted>Gross</Text>
                        <Text size={1} weight="semibold">{fmtAmount(displayAmt, p.currency)}</Text>
                      </Stack>
                      <Stack space={0}>
                        <Text size={0} muted>Net payable</Text>
                        <Text size={1} weight="semibold">{fmtAmount(calcNet(p), p.currency)}</Text>
                      </Stack>
                    </Stack>
                  )}
                </Flex>
              ) : (
                <Text size={1} muted style={{ fontStyle: 'italic' }}>No payment linked yet</Text>
              )}

            </Stack>
          </Card>
        )
      })}

      {/* Footer */}
      <Card padding={3} radius={2} tone="primary" border>
        <Stack space={2}>
          <Flex justify="space-between" align="center">
            <Text size={1} muted>
              {settledCount} of {billings.length} period{billings.length !== 1 ? 's' : ''} settled
            </Text>
            {totalGross > 0 && (
              <Stack space={1} style={{ textAlign: 'right' }}>
                <Text size={0} muted>Total gross: {fmtAmount(totalGross)}</Text>
                <Text size={1} weight="semibold">Net payable: {fmtAmount(totalNet)}</Text>
              </Stack>
            )}
          </Flex>
          {vatNote && (
            <Text size={0} muted>⚠ {vatNote}</Text>
          )}
        </Stack>
      </Card>

    </Stack>
  )
}
