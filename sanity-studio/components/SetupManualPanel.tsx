/**
 * SetupManualPanel
 *
 * Read-only panel shown in Install & Activate when an asset is selected.
 * Traces: asset → contractType (Process Setup) + assetType → setupManual[]
 * Renders numbered steps with optional warnings.
 */

import { useEffect, useState } from 'react'
import { Stack, Card, Text, Box, Spinner, Flex } from '@sanity/ui'
import { useClient, useFormValue } from 'sanity'
import type { StringInputProps } from 'sanity'

// ── Shared renderer ───────────────────────────────────────────────────────────

function SetupManualSteps({ steps, title }: { steps: SetupStep[]; title: string }) {
  return (
    <Card padding={4} radius={2} border tone="primary">
      <Stack space={4}>
        <Text size={1} weight="semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: 10 }}>
          {title}
        </Text>
        {steps.map((step, index) => (
          <Stack key={step._key} space={2}>
            <Flex gap={3} align="flex-start">
              <Box style={{
                minWidth: 28, height: 28, borderRadius: '50%',
                background: 'var(--card-focus-ring-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Text size={1} weight="semibold" style={{ color: 'var(--card-bg-color)' }}>
                  {index + 1}
                </Text>
              </Box>
              <Text size={2} weight="semibold" style={{ paddingTop: 4 }}>{step.stepTitle}</Text>
            </Flex>
            {step.description && (
              <Box paddingLeft={5}>
                <Text size={1} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{step.description}</Text>
              </Box>
            )}
            {step.warning && (
              <Box paddingLeft={5}>
                <Card padding={3} radius={2} tone="critical" border>
                  <Flex gap={2} align="flex-start">
                    <Text size={1}>⚠️</Text>
                    <Text size={1} weight="semibold">{step.warning}</Text>
                  </Flex>
                </Card>
              </Box>
            )}
          </Stack>
        ))}
      </Stack>
    </Card>
  )
}

interface SetupStep {
  _key:        string
  stepTitle:   string
  description?: string
  warning?:    string
}

export function SetupManualPanel(props: StringInputProps) {
  const client   = useClient({ apiVersion: '2024-01-01' })
  const assetRef = useFormValue(['asset', '_ref']) as string | undefined

  const [steps,   setSteps]   = useState<SetupStep[]>([])
  const [title,   setTitle]   = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!assetRef) { setSteps([]); setTitle(''); setNotFound(false); return }
    setLoading(true)
    setNotFound(false)

    // Step 1 — fetch asset to get assetType key (draft-aware)
    client
      .fetch<{ assetType?: string }>(
        `coalesce(*[_id == "drafts." + $ref][0], *[_id == $ref][0]){ assetType }`,
        { ref: assetRef },
      )
      .then(async asset => {
        const assetTypeKey = asset?.assetType
        if (!assetTypeKey) { setSteps([]); setNotFound(true); return }

        // Step 2 — find setup manual from the global asset-config Process Setup
        const ct = await client.fetch<{ assetTypes?: any[] }>(
          `*[_type == "contractType" && useAssetConfig == true && isActive == true][0]{
            assetTypes[]{ key, name, setupManual[]{ _key, stepTitle, description, warning } }
          }`,
        )

        const found  = (ct?.assetTypes ?? []).find((t: any) => t.key === assetTypeKey)
        const manual = found?.setupManual ?? []

        if (manual.length === 0) { setSteps([]); setNotFound(true); return }

        setTitle(`${found.name} — Setup Manual`)
        setSteps(manual)
      })
      .catch(() => { setSteps([]); setNotFound(true) })
      .finally(() => setLoading(false))
  }, [assetRef, client])

  // Nothing selected yet
  if (!assetRef) return null

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading setup manual…</Text>
      </Flex>
    )
  }

  if (notFound || steps.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>
          No setup manual found for this asset type. Go to Process Setup → Asset Config → edit the asset type → add Setup Manual steps.
        </Text>
      </Card>
    )
  }

  return <SetupManualSteps steps={steps} title={title} />
}

// ── Procurement variant (reads contractType + assetType directly) ─────────────

export function ProcurementSetupManualPanel(props: StringInputProps) {
  const client    = useClient({ apiVersion: '2024-01-01' })
  const assetType = useFormValue(['assetType']) as string | undefined

  const [steps,    setSteps]    = useState<SetupStep[]>([])
  const [title,    setTitle]    = useState<string>('')
  const [loading,  setLoading]  = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!assetType) { setSteps([]); setTitle(''); setNotFound(false); return }
    setLoading(true)
    setNotFound(false)

    client
      .fetch<{ assetTypes?: any[] }>(
        `*[_type == "contractType" && useAssetConfig == true && isActive == true][0]{
          assetTypes[]{ key, name, setupManual[]{ _key, stepTitle, description, warning } }
        }`,
      )
      .then(ct => {
        const found  = (ct?.assetTypes ?? []).find((t: any) => t.key === assetType)
        const manual = found?.setupManual ?? []
        if (manual.length === 0) { setSteps([]); setNotFound(true); return }
        setTitle(`${found.name} — Setup Manual`)
        setSteps(manual)
      })
      .catch(() => { setSteps([]); setNotFound(true) })
      .finally(() => setLoading(false))
  }, [assetType, client])

  if (!assetType) return null

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Loading setup manual…</Text>
      </Flex>
    )
  }

  if (notFound || steps.length === 0) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1} muted>
          No setup manual for this asset type. Go to Process Setup → Asset Config → edit the asset type → add Setup Manual steps.
        </Text>
      </Card>
    )
  }

  return <SetupManualSteps steps={steps} title={title} />
}
