/**
 * RentalEndDateInput
 *
 * Read-only auto-calculated rental end date.
 * Looks up the contract type's fieldDefinitions, finds the lease term field
 * (any number field whose key/label contains lease/term/period/duration/month/year),
 * reads its value from dynamicFields, calculates endingDate, and auto-patches it.
 *
 * Unit: months by default; years if "year" appears in the field key or label.
 */

import { useEffect, useRef, useState } from 'react'
import { useClient, useFormValue }      from 'sanity'
import type { StringInputProps }        from 'sanity'
import { Card, Flex, Text, Badge, Spinner, Stack } from '@sanity/ui'
import { fmtDate } from '../utils/dateFormat'

const TERM_PATTERN  = /lease|term|period|duration|month|year/i
const YEAR_PATTERN  = /year/i

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  d.setDate(d.getDate() - 1)   // last day of the Nth month
  return localDateStr(d)
}

export function RentalEndDateInput(_props: StringInputProps) {
  const client       = useClient({ apiVersion: '2024-01-01' })
  const rawDocId     = useFormValue(['_id'])                  as string | undefined
  const startingDate = useFormValue(['startingDate'])         as string | undefined
  const ctRef        = useFormValue(['contractType', '_ref']) as string | undefined
  const rawDyn       = useFormValue(['dynamicFields'])        as string | undefined

  const draftId = rawDocId
    ? (rawDocId.startsWith('drafts.') ? rawDocId : `drafts.${rawDocId}`)
    : undefined

  const [fieldDefs, setFieldDefs] = useState<any[]>([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!ctRef) return
    setLoading(true)
    client
      .fetch(`coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){ fieldDefinitions }`, { id: ctRef })
      .then((ct: any) => setFieldDefs(ct?.fieldDefinitions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ctRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const dynValues: Record<string, string> = rawDyn
    ? (() => { try { return JSON.parse(rawDyn) } catch { return {} } })()
    : {}

  // Find the lease term field — number type whose key/label matches pattern
  const termField = fieldDefs.find(
    f => f.fieldType === 'number' && TERM_PATTERN.test(f.key + ' ' + (f.label ?? ''))
  )
  const termRaw   = termField ? dynValues[termField.key] : undefined
  const termValue = termRaw  ? Number(termRaw) : undefined

  // Convert to months (multiply by 12 if the field is year-based)
  const isYears     = termField ? YEAR_PATTERN.test(termField.key + ' ' + (termField.label ?? '')) : false
  const termMonths  = termValue != null ? (isYears ? termValue * 12 : termValue) : undefined

  const endDate = (startingDate && termMonths) ? addMonths(startingDate, termMonths) : undefined

  // Auto-patch endingDate whenever the calculation changes
  const prevRef = useRef('')
  useEffect(() => {
    if (!draftId || !endDate) return
    if (endDate === prevRef.current) return
    prevRef.current = endDate
    client
      .patch(draftId)
      .set({ endingDate: endDate })
      .commit({ autoGenerateArrayKeys: true })
      .catch(() => {})
  }, [endDate, draftId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Looking up lease term field…</Text>
      </Flex>
    )
  }

  if (!ctRef) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>Select a Contract Type first — lease term field will be read from it.</Text>
      </Card>
    )
  }

  if (!termField) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>
          No lease term field found in this contract type's fields. Add a number field with "lease", "term", "period", or "duration" in its key.
        </Text>
      </Card>
    )
  }

  if (!termValue) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Stack space={2}>
          <Text size={1} muted>
            Found field <strong>{termField.label ?? termField.key}</strong> — fill it in Contract Fields to calculate end date.
          </Text>
        </Stack>
      </Card>
    )
  }

  if (!startingDate) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>Set Rental Start Date above to calculate end date.</Text>
      </Card>
    )
  }

  return (
    <Card padding={3} radius={2} border tone={endDate ? 'positive' : 'caution'}>
      <Flex align="center" gap={3} justify="space-between">
        <Stack space={2}>
          <Text size={2} weight="semibold">{fmtDate(endDate)}</Text>
          <Text size={0} muted>
            {fmtDate(startingDate)} + {termValue} {isYears ? 'years' : 'months'} − 1 day
          </Text>
        </Stack>
        <Badge tone="positive" mode="outline" fontSize={0}>
          From: {termField.label ?? termField.key}
        </Badge>
      </Flex>
    </Card>
  )
}
