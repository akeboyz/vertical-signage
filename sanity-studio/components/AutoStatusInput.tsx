import { useEffect, useState }   from 'react'
import { Card, Text, Spinner, Flex } from '@sanity/ui'
import { set }                   from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue, useClient } from 'sanity'

interface PipelineStep {
  key:         string
  label:       string
  tone?:       string
  triggerType: string
  docKey?:     string
  fieldKey?:   string
  fieldValue?: string
}

const TONE_ICON: Record<string, string> = {
  positive: '🟢',
  caution:  '🟡',
  critical:  '🔴',
  default:  '⚪',
}

/**
 * Evaluates a single pipeline step trigger against the current document.
 * Returns true if the step's condition is met.
 */
function evalTrigger(step: PipelineStep, doc: any): boolean {
  switch (step.triggerType) {
    case 'created':
      return true

    case 'field_equals':
      if (!step.fieldKey) return false
      return String(doc?.[step.fieldKey] ?? '') === String(step.fieldValue ?? '')

    case 'doc_approved':
      // Matches approvalStatus, quotationApprovalStatus, contractApprovalStatus
      if (step.docKey) {
        const field = `${step.docKey}ApprovalStatus`
        return doc?.[field] === 'approved'
      }
      return doc?.approvalStatus === 'approved'

    case 'doc_submitted':
      if (step.docKey) {
        const field = `${step.docKey}ApprovalStatus`
        return doc?.[field] === 'pending'
      }
      return doc?.approvalStatus === 'pending'

    case 'doc_rejected':
      if (step.docKey) {
        const field = `${step.docKey}ApprovalStatus`
        return doc?.[field] === 'rejected'
      }
      return doc?.approvalStatus === 'rejected'

    case 'doc_generated':
      if (step.docKey) {
        const field = `${step.docKey}GeneratedAt`
        return !!doc?.[field]
      }
      return false

    default:
      return false
  }
}

/**
 * AutoStatusInput (factory)
 *
 * Reads Pipeline Steps from the linked Process Setup (contractType._ref),
 * evaluates each step's trigger against the current document, and
 * auto-sets the status to the last triggered step's key.
 *
 * Usage in schema:
 *   components: { input: AutoStatusInput }
 */
export function AutoStatusInput(props: StringInputProps) {
  const client          = useClient({ apiVersion: '2024-01-01' })
  const doc             = useFormValue([]) as any
  const contractTypeRef = useFormValue(['contractType', '_ref']) as string | undefined

  const [steps,   setSteps]   = useState<PipelineStep[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch pipeline steps from Process Setup
  useEffect(() => {
    if (!contractTypeRef) { setSteps([]); return }
    setLoading(true)
    client
      .fetch<{ steps?: PipelineStep[] }>(
        `*[_type == "contractType" && _id == $id][0]{
          steps[]{ key, label, tone, triggerType, docKey, fieldKey, fieldValue }
        }`,
        { id: contractTypeRef },
      )
      .then(ct => setSteps(ct?.steps ?? []))
      .catch(() => setSteps([]))
      .finally(() => setLoading(false))
  }, [contractTypeRef, client])

  // Derive status: walk steps in order, keep last one whose trigger is met
  const derivedStep = steps.reduce<PipelineStep | null>((last, step) => {
    return evalTrigger(step, doc) ? step : last
  }, null) ?? steps[0] ?? null

  const derivedKey = derivedStep?.key ?? ''

  // Write derived value back into the field
  useEffect(() => {
    if (!derivedKey) return
    if (props.value !== derivedKey) props.onChange(set(derivedKey))
  }, [derivedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!contractTypeRef) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>Link a Process Setup to enable auto status.</Text>
      </Card>
    )
  }

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading pipeline steps…</Text>
      </Flex>
    )
  }

  if (!derivedStep) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>No pipeline steps configured. Go to Process Setup → Pipeline Steps.</Text>
      </Card>
    )
  }

  const icon = TONE_ICON[derivedStep.tone ?? 'default'] ?? '⚪'

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Text size={2} weight="semibold">{icon} {derivedStep.label}</Text>
      <Text size={1} muted style={{ marginTop: 4 }}>
        Auto-derived from Pipeline Steps. Updates when you save.
      </Text>
    </Card>
  )
}
