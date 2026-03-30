import { useEffect, useState } from 'react'
import { Card, Text, Spinner, Flex } from '@sanity/ui'
import { set } from 'sanity'
import { useClient } from 'sanity'

interface Props {
  /** The GROQ filter flag field on contractType, e.g. "useForProcurement" */
  flag:       string
  value?:     { _ref?: string } | null
  onChange:   (patch: any) => void
}

/**
 * AutoSetupRefInput
 *
 * Queries for the Process Setup document where `flag == true`,
 * auto-sets the reference value, and displays it read-only.
 * The user never needs to touch this field.
 */
export function AutoSetupRefInput({ flag, value, onChange }: Props) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const [setupName, setSetupName] = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  useEffect(() => {
    client
      .fetch<{ _id: string; name: string } | null>(
        `*[_type == "contractType" && ${flag} == true && isActive == true][0]{ _id, name }`,
      )
      .then(setup => {
        if (!setup) {
          setError(`No Process Setup with "${flag}" enabled found. Go to Process Setup → Identity and turn on the toggle.`)
          setLoading(false)
          return
        }
        setSetupName(setup.name)
        if (value?._ref !== setup._id) {
          onChange(set({ _type: 'reference', _ref: setup._id }))
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load process setup.')
        setLoading(false)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Flex align="center" gap={2} padding={2}>
        <Spinner muted />
        <Text size={1} muted>Linking process setup…</Text>
      </Flex>
    )
  }

  if (error) {
    return (
      <Card padding={3} radius={2} border tone="caution">
        <Text size={1}>{error}</Text>
      </Card>
    )
  }

  return (
    <Card padding={3} radius={2} tone="primary" border>
      <Text size={2} weight="semibold">{setupName}</Text>
      <Text size={1} muted style={{ marginTop: 4 }}>
        Auto-linked from Process Setup.
      </Text>
    </Card>
  )
}

/** Pre-bound version for Procurement documents */
export function AutoProcurementSetupInput(props: any) {
  return <AutoSetupRefInput flag="useForProcurement" value={props.value} onChange={props.onChange} />
}

/** Pre-bound version for Payment documents */
export function AutoPaymentSetupInput(props: any) {
  return <AutoSetupRefInput flag="useForPayment" value={props.value} onChange={props.onChange} />
}
