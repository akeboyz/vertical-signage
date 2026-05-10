/**
 * RepoListDisplay
 * Read-only display of repoSetup.repos — shows each repo as a labeled card.
 */

import { Stack, Card, Text, Flex, Badge } from '@sanity/ui'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

interface RepoEntry {
  _key:   string
  name?:  string
  url?:   string
  notes?: string
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

export function RepoListDisplay(props: StringInputProps) {
  const repos = useFormValue(['repoSetup', 'repos']) as RepoEntry[] | undefined

  if (!repos?.length) return null

  return (
    <Stack space={2}>
      {repos.map((repo, i) => (
        <Card key={repo._key} padding={3} radius={2} border tone="default">
          <Stack space={2}>
            <Flex align="center" justify="space-between">
              <Text size={1} weight="semibold">Repo {i + 1}</Text>
              {repo.url && (
                <Badge tone="primary" mode="outline" fontSize={0}>
                  <a href={repo.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>Open ↗</a>
                </Badge>
              )}
            </Flex>
            <Row label="Repo Name" value={repo.name} />
            <Row label="URL"       value={repo.url}  link />
            <Row label="Notes"     value={repo.notes} />
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}
