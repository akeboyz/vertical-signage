/**
 * SiteListDisplay
 * Read-only display of hostingSetup.sites — shows each site as a labeled card.
 */

import { Stack, Card, Text, Flex, Badge } from '@sanity/ui'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

interface SiteEntry {
  _key:    string
  name?:   string
  url?:    string
  repo?:   string
  branch?: string
  notes?:  string
}

function Row({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  if (!value) return null
  return (
    <Flex gap={3} align="flex-start">
      <Text size={0} muted style={{ minWidth: 90, flexShrink: 0 }}>{label}</Text>
      {link
        ? <Text size={0}><a href={value} target="_blank" rel="noreferrer" style={{ color: 'var(--card-link-color)', wordBreak: 'break-all' }}>{value}</a></Text>
        : <Text size={0} style={{ wordBreak: 'break-all' }}>{value}</Text>
      }
    </Flex>
  )
}

export function SiteListDisplay(props: StringInputProps) {
  const sites = useFormValue(['hostingSetup', 'sites']) as SiteEntry[] | undefined

  if (!sites?.length) return null

  return (
    <Stack space={2}>
      {sites.map((site, i) => (
        <Card key={site._key} padding={3} radius={2} border tone="default">
          <Stack space={2}>
            <Flex align="center" justify="space-between">
              <Text size={1} weight="semibold">Site {i + 1}</Text>
              {site.url && (
                <Badge tone="positive" mode="outline" fontSize={0}>
                  <a href={site.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Open ↗</a>
                </Badge>
              )}
            </Flex>
            <Row label="Site Name"    value={site.name}   />
            <Row label="Site URL"     value={site.url}    link />
            <Row label="Linked Repo"  value={site.repo}   />
            <Row label="Branch"       value={site.branch} />
            <Row label="Notes"        value={site.notes}  />
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}
