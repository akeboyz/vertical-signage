import React, { useState } from 'react'
import { Flex, Box, Text, Button, Card } from '@sanity/ui'
import { EditIcon, LockIcon } from '@sanity/icons'

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${Number(d)} ${months[Number(m) - 1]} ${y}`
}

export function LockedDateInput(props: any) {
  const { value, readOnly, renderDefault } = props
  const hasValue = !!value
  const [unlocked, setUnlocked] = useState(false)

  if (hasValue && !unlocked) {
    return (
      <Flex align="center" gap={2}>
        <Card
          padding={2} radius={2}
          style={{ flex: 1, border: '1px solid var(--card-border-color)', background: 'var(--card-muted-bg-color)' }}
        >
          <Text size={2} style={{ padding: '2px 6px' }}>
            {fmtDate(value)}
          </Text>
        </Card>
        <Button
          icon={EditIcon}
          mode="ghost"
          tone="caution"
          fontSize={1}
          padding={2}
          title="Edit brought forward date"
          disabled={readOnly}
          onClick={() => setUnlocked(true)}
        />
      </Flex>
    )
  }

  return (
    <Flex align="center" gap={2}>
      <Box flex={1}>{renderDefault(props)}</Box>
      {hasValue && !readOnly && (
        <Button
          icon={LockIcon}
          mode="ghost"
          fontSize={1}
          padding={2}
          title="Lock this field"
          onClick={() => setUnlocked(false)}
        />
      )}
    </Flex>
  )
}
