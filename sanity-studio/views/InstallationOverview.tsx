import { useEffect, useState }                                        from 'react'
import { useClient }                                                   from 'sanity'
import { IntentLink }                                                  from 'sanity/router'
import { Card, Stack, Text, Flex, Spinner, Box, Heading, Badge, Grid } from '@sanity/ui'
import { InstallationStatusTimeline }                                  from '../components/InstallationStatusTimeline'

interface Props {
  document: {
    displayed: Record<string, any>
  }
}

interface ContractSummary {
  _id:            string
  contractNumber: string | null
  projectEn:      string | null
  projectTh:      string | null
  customerName:   string | null
}

function fmtDate(iso: string | undefined | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtCurrency(n: number | undefined | null): string {
  if (n == null) return '—'
  return n.toLocaleString('th-TH') + ' THB'
}

// ── Stage summary card ────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Flex justify="space-between" gap={2} style={{ borderBottom: '1px solid #F3F4F6', paddingBottom: 4 }}>
      <Text size={0} muted style={{ flexShrink: 0 }}>{label}</Text>
      <Text size={0} style={{ textAlign: 'right' }}>{value}</Text>
    </Flex>
  )
}

function StageCard({
  title, tone, rows,
}: {
  title: string
  tone:  string
  rows:  { label: string; value: string | null | undefined }[]
}) {
  const visible = rows.filter(r => r.value)
  if (visible.length === 0) return null

  return (
    <Card padding={3} border radius={2}>
      <Stack space={3}>
        <Text size={0} weight="semibold" style={{ color: tone, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </Text>
        <Stack space={2}>
          {visible.map(r => (
            <SummaryRow key={r.label} label={r.label} value={r.value!} />
          ))}
        </Stack>
      </Stack>
    </Card>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function InstallationOverview({ document: { displayed: doc } }: Props) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [contract, setContract] = useState<ContractSummary | null | 'loading'>('loading')

  const contractRef: string | undefined = doc.contract?._ref

  useEffect(() => {
    if (!contractRef) { setContract(null); return }
    client
      .fetch<ContractSummary>(
        `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
          _id, contractNumber,
          "projectEn": projectSite->projectEn,
          "projectTh": projectSite->projectTh,
          customerName
        }`,
        { id: contractRef },
      )
      .then(r => setContract(r ?? null))
      .catch(() => setContract(null))
  }, [contractRef]) // eslint-disable-line react-hooks/exhaustive-deps

  const order    = doc.screenOrder         ?? {}
  const delivery = doc.screenDelivery      ?? {}
  const install  = doc.screenInstallation  ?? {}
  const config   = doc.systemConfig        ?? {}

  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={5}>

        {/* Header */}
        <Stack space={3}>
          <Flex gap={2} wrap="wrap">
            <Badge tone="primary" mode="outline" fontSize={0}>Install & Activate</Badge>
            <Badge tone="caution" mode="outline" fontSize={0}>Read-only — click Edit tab to make changes</Badge>
          </Flex>
          <Heading size={3}>
            {contract !== 'loading' && contract
              ? (contract.projectEn ?? contract.contractNumber ?? '(Untitled)')
              : '(Untitled)'}
          </Heading>
        </Stack>

        {/* Timeline */}
        <InstallationStatusTimeline
          installationStage={doc.installationStatus}
          setupDate={doc.setupDate}
          liveDate={doc.liveDate ?? doc.activatedDate}
        />

        {/* Linked Contract */}
        <Stack space={2}>
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Linked Contract</Text>
          {contract === 'loading' && (
            <Flex align="center" gap={2}><Spinner muted /><Text size={1} muted>Loading…</Text></Flex>
          )}
          {contract === null && (
            <Card padding={3} border radius={2} tone="transparent">
              <Text size={1} muted>No contract linked.</Text>
            </Card>
          )}
          {contract && contract !== 'loading' && (
            <IntentLink
              intent="edit"
              params={{ id: contract._id, type: 'contract' }}
              style={{ textDecoration: 'none' }}
            >
              <Card padding={3} border radius={2} tone="default" style={{ cursor: 'pointer' }}>
                <Stack space={1}>
                  <Text size={1} weight="semibold">{contract.contractNumber ?? '(No number)'}</Text>
                  {contract.projectEn   && <Text size={0} muted>{contract.projectEn}</Text>}
                  {contract.customerName && <Text size={0} muted>{contract.customerName}</Text>}
                </Stack>
              </Card>
            </IntentLink>
          )}
        </Stack>

        {/* Stage summaries */}
        <Stack space={3}>
          <Text size={1} weight="semibold" style={{ color: '#374151' }}>Stage Details</Text>

          <Grid columns={[1, 1, 2]} gap={3}>

            <StageCard
              title="2.1 — Screen Order"
              tone="#3B82F6"
              rows={[
                { label: 'Supplier',         value: order.supplier        },
                { label: 'Contact',          value: order.supplierContact },
                { label: 'PO Number',        value: order.purchaseOrderNo },
                { label: 'Units',            value: order.unitCount != null ? String(order.unitCount) : null },
                { label: 'Unit Cost',        value: fmtCurrency(order.unitCostTHB) !== '—' ? fmtCurrency(order.unitCostTHB) : null },
                { label: 'Est. Delivery',    value: order.estimatedDelivery ? fmtDate(order.estimatedDelivery) : null },
                { label: 'Ordered',          value: order.orderedAt ? fmtDate(order.orderedAt) : null },
                { label: 'Approved By',      value: order.approvedBy      },
              ]}
            />

            <StageCard
              title="2.2 — Screen Delivery"
              tone="#F97316"
              rows={[
                { label: 'Delivered',        value: delivery.deliveredAt ? fmtDate(delivery.deliveredAt) : null },
                { label: 'Received By',      value: delivery.receivedBy   },
                { label: 'Invoice',          value: delivery.invoiceNumber },
                { label: 'Transport Cost',   value: fmtCurrency(delivery.transportCostTHB) !== '—' ? fmtCurrency(delivery.transportCostTHB) : null },
                { label: 'Import Duty',      value: fmtCurrency(delivery.importDutyTHB) !== '—' ? fmtCurrency(delivery.importDutyTHB) : null },
                { label: 'Condition',        value: delivery.condition === 'good' ? '✅ Good' : delivery.condition === 'damaged_partial' ? '⚠️ Partial damage' : delivery.condition === 'damaged_all' ? '❌ All damaged' : null },
              ]}
            />

            <StageCard
              title="2.3 — Screen Installation"
              tone="#8B5CF6"
              rows={[
                { label: 'Installed',        value: install.installedAt ? fmtDate(install.installedAt) : null },
                { label: 'Service Provider', value: install.serviceProvider        },
                { label: 'Contact',          value: install.serviceProviderContact },
                { label: 'Electrician',      value: install.electricianContact     },
                { label: 'Wi-Fi',            value: install.wifiConfigured ? (install.wifiSSID ? `✅ ${install.wifiSSID}` : '✅ Configured') : null },
                { label: 'Install Cost',     value: fmtCurrency(install.installationCostTHB) !== '—' ? fmtCurrency(install.installationCostTHB) : null },
              ]}
            />

            <StageCard
              title="2.4 — System Configuration"
              tone="#10B981"
              rows={[
                { label: 'Configured',       value: config.configuredAt ? fmtDate(config.configuredAt) : null },
                { label: 'App Vendor',       value: config.appVendor    },
                { label: 'Device ID',        value: config.deviceId     },
                { label: 'Yodeck',           value: config.yodeckConfigured    ? '✅ Configured' : null },
                { label: 'Fully Kiosk',      value: config.fullyKioskInstalled ? '✅ Installed'  : null },
                { label: 'Volume Lock',      value: config.volumeLockSet       ? '✅ Set'         : null },
              ]}
            />

          </Grid>

          {doc.liveAt && (
            <Card padding={3} border radius={2} style={{ borderColor: '#22C55E40', background: '#F0FDF4' }}>
              <Flex align="center" gap={3}>
                <Text size={1} weight="semibold" style={{ color: '#15803D' }}>✅ System Live</Text>
                <Text size={1} style={{ color: '#15803D' }}>{fmtDate(doc.liveAt)}</Text>
              </Flex>
              {doc.liveNotes && <Text size={0} muted style={{ marginTop: 4 }}>{doc.liveNotes}</Text>}
            </Card>
          )}
        </Stack>

      </Stack>
    </Card>
  )
}
