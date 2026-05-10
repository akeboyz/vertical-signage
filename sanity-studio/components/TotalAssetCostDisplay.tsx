import { useEffect, useState }    from 'react'
import { useFormValue, useClient } from 'sanity'
import { Box, Card, Flex, Text, Spinner } from '@sanity/ui'

const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface CostLine { label: string; cost: number }

async function fetchProcurementLine(client: any, id: string): Promise<CostLine | null> {
  const doc = await client.fetch<{
    docNumber?: string; vendorName?: string; invoiceAmount?: number; quantity?: number
  }>(
    `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
      docNumber,
      "vendorName": comparisonItems[selected == true][0].vendor->legalName_en,
      invoiceAmount,
      quantity
    }`,
    { id },
  ).catch(() => null)
  if (!doc) return null
  const qty   = doc.quantity ?? 1
  const cost  = Math.round(((doc.invoiceAmount ?? 0) / qty) * 100) / 100
  const parts = [doc.docNumber, doc.vendorName].filter(Boolean)
  const label = (parts.join(' · ') || 'Procurement') + (qty > 1 ? ` ÷ ${qty} units` : '')
  return { label, cost }
}

async function fetchPaymentLine(client: any, id: string): Promise<CostLine | null> {
  const doc = await client.fetch<{
    docNumber?: string; vendorName?: string
    paidAmount?: number; paymentAmount?: number; assetQuantity?: number
  }>(
    `coalesce(*[_id == "drafts." + $id][0], *[_id == $id][0]){
      docNumber,
      "vendorName": coalesce(vendor->legalName_en, vendorName),
      paidAmount,
      paymentAmount,
      assetQuantity
    }`,
    { id },
  ).catch(() => null)
  if (!doc) return null
  const qty   = doc.assetQuantity ?? 1
  const total = doc.paidAmount ?? doc.paymentAmount ?? 0
  const cost  = Math.round((total / qty) * 100) / 100
  const parts = [doc.docNumber, doc.vendorName].filter(Boolean)
  const label = (parts.join(' · ') || 'Payment') + (qty > 1 ? ` ÷ ${qty} assets` : '')
  return { label, cost }
}

export function TotalAssetCostDisplay(_props: any) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const costSources   = useFormValue(['costSources'])          as Array<{_ref?: string}> | undefined
  const additionalSrc = useFormValue(['additionalCostSources']) as any[] | undefined

  const [lines,   setLines]   = useState<CostLine[]>([])
  const [loading, setLoading] = useState(false)

  const ids = (costSources ?? []).map(r => r._ref).filter(Boolean) as string[]

  useEffect(() => {
    if (ids.length === 0) { setLines([]); return }
    setLoading(true)

    const allIds = [...ids, ...ids.map(id => `drafts.${id}`)]
    client
      .fetch<Array<{ _id: string; _type: string }>>(
        `*[_id in $allIds]{ _id, _type }`,
        { allIds },
      )
      .then(async typeDocs => {
        const typeMap = new Map<string, string>()
        for (const d of typeDocs) {
          const base = d._id.replace(/^drafts\./, '')
          if (!typeMap.has(base)) typeMap.set(base, d._type)
        }
        const results = await Promise.all(
          ids.map(id => {
            const type = typeMap.get(id)
            if (type === 'procurement') return fetchProcurementLine(client, id)
            if (type === 'payment')     return fetchPaymentLine(client, id)
            return Promise.resolve(null)
          }),
        )
        setLines(results.filter((l): l is CostLine => l !== null))
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false))
  }, [ids.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const manualLines: CostLine[] = (additionalSrc ?? []).map((s: any) => ({
    label: s?.label ?? '(unlabelled)',
    cost:  typeof s?.allocatedCost === 'number' ? s.allocatedCost : 0,
  }))

  const allLines = [...lines, ...manualLines]
  const total    = allLines.reduce((sum, l) => sum + l.cost, 0)

  if (loading) return (
    <Flex align="center" gap={2} padding={1}>
      <Spinner muted />
      <Text muted size={1}>Calculating total…</Text>
    </Flex>
  )

  if (allLines.length === 0) return (
    <Text size={1} muted style={{ fontStyle: 'italic' }}>
      Link a Source Document above to calculate total cost.
    </Text>
  )

  return (
    <Card padding={3} radius={2} tone="transparent" border>
      <Flex direction="column" gap={2}>
        {allLines.map((line, i) => (
          <Flex key={i} justify="space-between">
            <Text size={1} muted>{line.label}</Text>
            <Text size={1} style={{ fontFamily: 'monospace' }}>{fmt(line.cost)} THB</Text>
          </Flex>
        ))}
        <Box style={{ borderTop: '1px solid var(--card-border-color)', marginTop: 4, paddingTop: 8 }}>
          <Flex justify="space-between">
            <Text size={1} weight="semibold">Total Asset Cost</Text>
            <Text size={1} weight="semibold" style={{ fontFamily: 'monospace' }}>
              {fmt(total)} THB
            </Text>
          </Flex>
        </Box>
      </Flex>
    </Card>
  )
}
