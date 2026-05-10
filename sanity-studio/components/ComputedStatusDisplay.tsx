import { useFormValue }         from 'sanity'
import type { StringInputProps } from 'sanity'
import { Badge, Card, Flex, Text } from '@sanity/ui'
import {
  deriveContractStatus,
  STATUS_ICON,
  STATUS_LABEL,
  STATUS_TONE,
} from '../utils/deriveContractStatus'

export function ComputedStatusDisplay(_props: StringInputProps) {
  const startDate    = useFormValue(['startDate'])         as string | undefined
  const endDate      = useFormValue(['endDate'])           as string | undefined
  const noticeDays   = useFormValue(['noticePeriodDays'])  as number | undefined
  const isSuspended  = useFormValue(['isSuspended'])       as boolean | undefined
  const termination  = useFormValue(['termination'])       as { effectiveDate?: string } | undefined
  const renewalHistory = useFormValue(['renewalHistory'])  as Array<{ newEndDate?: string }> | undefined

  const { status, detail } = deriveContractStatus({
    startDate,
    endDate,
    noticePeriodDays:        noticeDays,
    isSuspended,
    terminationEffectiveDate: termination?.effectiveDate,
    renewalHistory,
  })

  return (
    <Card padding={3} radius={2} border tone={STATUS_TONE[status] === 'critical' ? 'critical' : STATUS_TONE[status] === 'caution' ? 'caution' : 'transparent'}>
      <Flex align="center" gap={3}>
        <Badge
          tone={STATUS_TONE[status]}
          mode="outline"
          fontSize={1}
          padding={2}
          style={{ flexShrink: 0 }}
        >
          {STATUS_ICON[status]} {STATUS_LABEL[status]}
        </Badge>
        {detail && (
          <Text size={1} muted>{detail}</Text>
        )}
      </Flex>
    </Card>
  )
}
