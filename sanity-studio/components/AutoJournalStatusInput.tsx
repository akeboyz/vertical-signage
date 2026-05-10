import { useEffect }             from 'react'
import { Card, Text }            from '@sanity/ui'
import { set }                   from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue }          from 'sanity'

function deriveStatus(doc: {
  voidedAt?:        string
  accountingEntry?: { glStatus?: string }
}): string {
  if (doc.voidedAt)                                return 'voided'
  if (doc.accountingEntry?.glStatus === 'posted')  return 'posted'
  return 'draft'
}

const STATUS_LABELS: Record<string, string> = {
  draft:  '📝 Draft',
  posted: '✅ Posted',
  voided: '🚫 Voided',
}

const STATUS_DESCRIPTIONS: Record<string, string> = {
  draft:  'Entry not yet posted. Add debit/credit lines in the Accounting tab, then post.',
  posted: 'Posted to the general ledger. Set Voided At to cancel — create a correction entry to reverse.',
  voided: 'Entry has been voided and is excluded from all reports.',
}

const STATUS_TONE: Record<string, 'default' | 'caution' | 'positive' | 'critical'> = {
  draft:  'caution',
  posted: 'positive',
  voided: 'critical',
}

export function AutoJournalStatusInput(props: StringInputProps) {
  const doc    = useFormValue([]) as any
  const status = deriveStatus(doc)

  useEffect(() => {
    if (props.value === status || props.readOnly) return
    try { props.onChange(set(status)) } catch { /* locked */ }
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card padding={3} radius={2} tone={STATUS_TONE[status] ?? 'default'} border>
      <Text size={2} weight="semibold">{STATUS_LABELS[status] ?? status}</Text>
      <Text size={1} muted style={{ marginTop: 6 }}>
        {STATUS_DESCRIPTIONS[status] ?? ''}
      </Text>
    </Card>
  )
}
