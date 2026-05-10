/**
 * LockableTextInput
 *
 * Displays a text (multiline) field as read-only with a pencil icon.
 * Clicking the pencil switches to an editable TextArea.
 * Useful for description fields that should be readable at a glance
 * but rarely need editing.
 */

import { useState }              from 'react'
import { Stack, Flex, Text, Button, TextArea } from '@sanity/ui'
import { set, unset }            from 'sanity'
import type { StringInputProps } from 'sanity'

export function LockableTextInput(props: StringInputProps) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')

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

  const cancel = () => setEditing(false)

  if (editing) {
    return (
      <Stack space={2}>
        <TextArea
          autoFocus
          rows={4}
          value={draft}
          onChange={e => setDraft((e.target as HTMLTextAreaElement).value)}
        />
        <Flex gap={2}>
          <Button text="Save"   tone="primary" mode="default" fontSize={1} padding={2} onClick={confirm} />
          <Button text="Cancel" tone="default" mode="ghost"   fontSize={1} padding={2} onClick={cancel}  />
        </Flex>
      </Stack>
    )
  }

  return (
    <Flex align="flex-start" justify="space-between" gap={3}
      style={{
        background:   '#FFFBEB',
        border:       '1px solid #FCD34D',
        borderLeft:   '4px solid #F59E0B',
        borderRadius: 6,
        padding:      '10px 12px',
      }}>
      <Flex gap={2} align="flex-start" style={{ flex: 1 }}>
        <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>ℹ️</span>
        <Text size={2} style={{
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          color: current ? '#78350F' : '#B45309',
          fontStyle: current ? 'normal' : 'italic',
        }}>
          {current || 'No description yet. Click ✏️ to add one.'}
        </Text>
      </Flex>
      <Button
        mode="bleed"
        tone="default"
        fontSize={0}
        padding={1}
        title="Edit description"
        text="✏️"
        onClick={startEdit}
        style={{ flexShrink: 0 }}
      />
    </Flex>
  )
}
