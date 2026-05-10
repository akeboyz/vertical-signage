import { useEffect, useState } from 'react'
import { Stack, Card, Text, Flex, Spinner } from '@sanity/ui'
import { useClient, useFormValue } from 'sanity'
import type { StringInputProps } from 'sanity'

interface ContractSummary {
  _id:            string
  contractNumber: string | null
  quotationNumber: string | null
  customerName:   string | null
  contractTypeName: string | null
}

/**
 * Invisible field — renders only a warning card listing existing contracts
 * for the selected Project Site. Shown right after the projectSite reference.
 */
export function ExistingContractsWarning(props: StringInputProps) {
  const client        = useClient({ apiVersion: '2024-01-01' })
  const projectSiteRef = useFormValue(['projectSite', '_ref']) as string | undefined
  const currentDocId   = useFormValue(['_id']) as string | undefined

  const [contracts, setContracts] = useState<ContractSummary[]>([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!projectSiteRef) { setContracts([]); return }
    setLoading(true)
    const cleanId = currentDocId?.replace(/^drafts\./, '') ?? ''
    client
      .fetch<ContractSummary[]>(
        `*[_type == "contract" && projectSite._ref == $ref && !(_id in [$id, "drafts." + $id])]{
          _id,
          contractNumber,
          quotationNumber,
          customerName,
          "contractTypeName": contractType->name
        } | order(_createdAt desc)`,
        { ref: projectSiteRef, id: cleanId },
      )
      .then(res => setContracts(res ?? []))
      .catch(() => setContracts([]))
      .finally(() => setLoading(false))
  }, [projectSiteRef, client, currentDocId])

  // Render nothing if no project selected or no existing contracts
  if (!projectSiteRef) return null
  if (loading) return (
    <Flex align="center" gap={2} paddingY={1}>
      <Spinner muted />
      <Text size={0} muted>Checking existing contracts…</Text>
    </Flex>
  )
  if (contracts.length === 0) return null

  return (
    <Card padding={3} radius={2} tone="caution" border>
      <Stack space={2}>
        <Text size={1} weight="semibold">
          ⚠ {contracts.length} existing contract{contracts.length > 1 ? 's' : ''} for this project:
        </Text>
        {contracts.map(c => {
          const ref  = c.contractNumber ?? c.quotationNumber ?? c._id
          const type = c.contractTypeName ? ` (${c.contractTypeName})` : ''
          const who  = c.customerName ? ` — ${c.customerName}` : ''
          return (
            <Text key={c._id} size={1} muted>
              • {ref}{type}{who}
            </Text>
          )
        })}
        <Text size={0} muted>You can still create a new contract — this is just a reminder.</Text>
      </Stack>
    </Card>
  )
}
