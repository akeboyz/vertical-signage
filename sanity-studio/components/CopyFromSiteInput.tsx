import { useState, useCallback } from 'react'
import { Stack, Button, Flex, Spinner, Text, Card } from '@sanity/ui'
import { set, unset } from 'sanity'
import type { StringInputProps } from 'sanity'
import { useFormValue, useClient } from 'sanity'

/**
 * Factory — returns a custom StringInput that adds a
 * "📋 Copy from Project Site" button, reading `siteField` from
 * the first entry in the party's `projectSites` array.
 *
 * Usage in schema:
 *   components: { input: createCopyFromSiteInput('telephone') }
 *   components: { input: createCopyFromSiteInput('emailAddress') }
 */
export function createCopyFromSiteInput(siteField: string) {
  function CopyFromSiteInput(props: StringInputProps) {
    const client       = useClient({ apiVersion: '2024-01-01' })
    const projectSites = useFormValue(['projectSites']) as { _ref: string }[] | undefined
    const firstSiteRef = projectSites?.[0]?._ref

    const [loading,    setLoading]    = useState(false)
    const [suggestion, setSuggestion] = useState<string | null>(null)
    const [error,      setError]      = useState('')

    const handleChange = useCallback((value: string) => {
      props.onChange(value ? set(value) : unset())
    }, [props])

    const handleCopy = useCallback(async () => {
      if (!firstSiteRef) return
      setLoading(true)
      setError('')
      setSuggestion(null)
      try {
        const site = await client.fetch<Record<string, string>>(
          `*[_id == $id][0]{ "${siteField}": ${siteField} }`,
          { id: firstSiteRef },
        )
        const value = site?.[siteField]?.trim()
        if (!value) {
          setError(`No value found for "${siteField}" on the linked Project Site.`)
        } else {
          setSuggestion(value)
        }
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load project site')
      } finally {
        setLoading(false)
      }
    }, [client, firstSiteRef])

    const apply = useCallback(() => {
      if (suggestion != null) {
        handleChange(suggestion)
        setSuggestion(null)
      }
    }, [suggestion, handleChange])

    return (
      <Stack space={2}>
        {props.renderDefault(props)}

        {suggestion != null && (
          <Card padding={3} radius={2} tone="positive" border>
            <Stack space={2}>
              <Text size={0} muted weight="semibold">From Project Site — please verify:</Text>
              <Text size={1}>{suggestion}</Text>
              <Flex gap={2}>
                <Button text="Apply" tone="positive" fontSize={1} padding={2} onClick={apply} />
                <Button text="Dismiss" mode="ghost" fontSize={1} padding={2} onClick={() => setSuggestion(null)} />
              </Flex>
            </Stack>
          </Card>
        )}

        <Flex align="center" gap={2}>
          {loading ? (
            <Flex gap={2} align="center">
              <Spinner muted />
              <Text size={1} muted>Loading from project site…</Text>
            </Flex>
          ) : (
            <Button
              text="📋 Copy from Project Site"
              mode="ghost"
              tone="primary"
              fontSize={1}
              padding={2}
              disabled={!firstSiteRef}
              title={firstSiteRef
                ? 'Copy value from the first linked Project Site'
                : 'Link a Project Site first to use this button'}
              onClick={handleCopy}
            />
          )}
        </Flex>

        {error && <Text size={0} style={{ color: '#e05252' }}>{error}</Text>}
      </Stack>
    )
  }

  CopyFromSiteInput.displayName = `CopyFromSiteInput(${siteField})`
  return CopyFromSiteInput
}
