import React, { useState } from 'react'
import { Flex, Box, Text, Button, Card } from '@sanity/ui'
import { EditIcon, LockIcon } from '@sanity/icons'

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function LockedNumberInput(props: any) {
  const { value, readOnly, renderDefault } = props
  const hasValue = value != null
  const [unlocked, setUnlocked] = useState(false)

  if (hasValue && !unlocked) {
    return (
      <Flex align="center" gap={2}>
        <Card
          padding={2} radius={2}
          style={{ flex: 1, border: '1px solid var(--card-border-color)', background: 'var(--card-muted-bg-color)' }}
        >
          <Text size={2} style={{ fontVariantNumeric: 'tabular-nums', padding: '2px 6px' }}>
            {fmt(value)}
          </Text>
        </Card>
        <Button
          icon={EditIcon}
          mode="ghost"
          tone="caution"
          fontSize={1}
          padding={2}
          title="Edit opening balance"
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
