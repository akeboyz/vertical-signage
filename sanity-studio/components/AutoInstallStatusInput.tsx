import { useEffect }          from 'react'
import { Card, Text }         from '@sanity/ui'
import { set }                from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue }       from 'sanity'

const STATUS_LABELS: Record<string, string> = {
  item_setup:            '📦 Item Setup',
  electricity_installed: '⚡ Electricity Installed',
  wifi_installed:        '📶 Wifi Installed',
  app_installed:         '📱 App Installed',
  live:                  '✅ Live',
}

function deriveStatus(doc: any): string {
  if (doc?.liveDate && doc?.testResult === 'pass')       return 'live'
  if ((doc?.installedApps ?? []).length > 0)             return 'app_installed'
  if (doc?.wifiName || doc?.wifiVendor?._ref)            return 'wifi_installed'
  if (doc?.electricalVendor?._ref || (doc?.accessories ?? []).length > 0) return 'electricity_installed'
  if (doc?.setupDate)                                    return 'item_setup'
  return 'item_setup'
}

export function AutoInstallStatusInput(props: StringInputProps) {
  const doc    = useFormValue([]) as any
  const status = deriveStatus(doc)

  useEffect(() => {
    if (props.value !== status) {
      props.onChange(set(status))
    }
  }, [status])

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Text size={2} weight="semibold">{STATUS_LABELS[status] ?? status}</Text>
      <Text size={1} muted style={{ marginTop: 4 }}>
        Auto-derived from completed steps. Updates when you save.
      </Text>
    </Card>
  )
}
