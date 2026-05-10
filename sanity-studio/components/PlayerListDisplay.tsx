/**
 * PlayerListDisplay
 * Read-only display of playerSetup.players — shows each player as a labeled card.
 */

import { Stack, Card, Text, Flex, Badge } from '@sanity/ui'
import type { StringInputProps } from 'sanity'
import { useFormValue } from 'sanity'

interface PlayerEntry {
  _key:      string
  playerName?: string
  playerId?:   string
  appType?:    string
  appUrl?:     string
  schedule?:   string
  notes?:      string
}

const APP_TYPE_LABELS: Record<string, string> = {
  web_app:     'Web App',
  widget:      'Widget',
  video:       'Video Player',
  html5:       'HTML5',
  other:       'Other',
}

function Row({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  if (!value) return null
  return (
    <Flex gap={3} align="flex-start">
      <Text size={0} muted style={{ minWidth: 100, flexShrink: 0 }}>{label}</Text>
      {link
        ? <Text size={0}><a href={value} target="_blank" rel="noreferrer" style={{ color: 'var(--card-link-color)', wordBreak: 'break-all' }}>{value}</a></Text>
        : <Text size={0} style={{ wordBreak: 'break-all' }}>{value}</Text>
      }
    </Flex>
  )
}

export function PlayerListDisplay(props: StringInputProps) {
  const players = useFormValue(['playerSetup', 'players']) as PlayerEntry[] | undefined

  if (!players?.length) return null

  return (
    <Stack space={2}>
      {players.map((player, i) => (
        <Card key={player._key} padding={3} radius={2} border tone="default">
          <Stack space={2}>
            <Flex align="center" justify="space-between">
              <Text size={1} weight="semibold">Player {i + 1}{player.playerName ? ` — ${player.playerName}` : ''}</Text>
              {player.appType && (
                <Badge tone="caution" mode="outline" fontSize={0}>
                  {APP_TYPE_LABELS[player.appType] ?? player.appType}
                </Badge>
              )}
            </Flex>
            <Row label="Player ID"   value={player.playerId}   />
            <Row label="App URL"     value={player.appUrl}     link />
            <Row label="Schedule"    value={player.schedule}   />
            <Row label="Notes"       value={player.notes}      />
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}
