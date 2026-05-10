/**
 * LockableStringInput
 *
 * Displays a string field as read-only text with a pencil icon.
 * Clicking the pencil switches to an editable text input.
 * Useful for auto-filled fields that should rarely be changed manually.
 */

import { useState }            from 'react'
import { Stack, Flex, Text, Button, TextInput, Badge } from '@sanity/ui'
import { set, unset }          from 'sanity'
import type { StringInputProps } from 'sanity'

export function LockableStringInput(props: StringInputProps) {
  const [editing,  setEditing]  = useState(false)
  const [draft,    setDraft]    = useState('')

  const current = (props.value as string | undefined) ?? ''

  const startEdit = () => {
    setDraft(current)
    setEditing(true)
  }

  const confirm = () => {
    setEditing(false)
    const trimmed = draft.trim()
    props.onChange(trimmed ? set(trimmed) : unset())
  }

  const cancel = () => {
    setEditing(false)
  }

  if (editing) {
    return (
      <Stack space={2}>
        <TextInput
          autoFocus
          value={draft}
          onChange={e => setDraft((e.target as HTMLInputElement).value)}
          onKeyDown={e => {
            if (e.key === 'Enter')  confirm()
            if (e.key === 'Escape') cancel()
          }}
        />
        <Flex gap={2}>
          <Button text="Save"   tone="primary" mode="default" fontSize={1} padding={2} onClick={confirm} />
          <Button text="Cancel" tone="default" mode="ghost"   fontSize={1} padding={2} onClick={cancel}  />
        </Flex>
      </Stack>
    )
  }

  return (
    <Flex align="center" justify="space-between" gap={2}
      style={{ minHeight: 33, borderBottom: '1px solid var(--card-border-color)', paddingBottom: 4 }}>
      <Flex align="center" gap={2} style={{ flex: 1, minWidth: 0 }}>
        <Text size={1} style={{ color: current ? 'var(--card-fg-color)' : 'var(--card-muted-fg-color)' }}>
          {current || <em style={{ opacity: 0.5 }}>—</em>}
        </Text>
        {current && (
          <Badge tone="primary" mode="outline" fontSize={0}>Auto</Badge>
        )}
      </Flex>
      <Button
        mode="bleed"
        tone="default"
        fontSize={0}
        padding={1}
        title="Edit this field"
        text="✏️"
        onClick={startEdit}
        style={{ flexShrink: 0 }}
      />
    </Flex>
  )
}
