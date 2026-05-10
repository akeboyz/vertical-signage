import { Card, Flex, Stack, Text, Badge } from '@sanity/ui'

export function DirectExpenseSectionBanner() {
  return (
    <Card padding={3} radius={2} tone="caution" border>
      <Flex gap={3} align="flex-start">
        <Text size={2}>📁</Text>
        <Stack space={2}>
          <Flex gap={2} align="center">
            <Badge tone="caution" mode="outline" fontSize={0}>Optional section</Badge>
          </Flex>
          <Text size={1} weight="semibold">Project-specific details</Text>
          <Text size={1} muted>
            Fill in if this expense belongs to a project site (e.g. installation cost, asset purchase).
            Skip if it is a standalone operational payment.
          </Text>
        </Stack>
      </Flex>
    </Card>
  )
}
