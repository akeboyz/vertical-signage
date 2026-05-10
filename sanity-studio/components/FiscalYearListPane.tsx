import { useState } from 'react'
import { useRouter }     from 'sanity/router'
import { Box, Card, Text, Flex, Stack, Spinner } from '@sanity/ui'
import { useFiscalYears, FiscalYearOption } from '../hooks/useFiscalYears'

const FS_FILTER_KEY = 'fs:periodFilter'

export function FiscalYearListPane() {
  const router  = useRouter()
  const fyYears = useFiscalYears(5)
  const [hovered, setHovered] = useState<string | null>(null)

  const open = (fy: FiscalYearOption) => {
    localStorage.setItem(FS_FILTER_KEY, JSON.stringify({ from: fy.from, to: fy.to, activeId: fy.id }))
    router.navigateIntent('edit', { id: 'financial-statements-singleton', type: 'financialStatement' })
  }

  return (
    <Card tone="default" height="fill" data-narrow-pane="true" style={{ display: 'flex', flexDirection: 'column' }}>

      {fyYears.length === 0 ? (
        <Flex align="center" justify="center" padding={6} style={{ flex: 1 }}>
          <Spinner muted />
        </Flex>
      ) : (
        <Box style={{ flex: 1, overflowY: 'auto' }}>
          {fyYears.map(fy => (
            <Box
              key={fy.id}
              onClick={() => open(fy)}
              onMouseEnter={() => setHovered(fy.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                cursor:       'pointer',
                borderBottom: '1px solid var(--card-border-color)',
                background:   hovered === fy.id ? 'var(--card-muted-bg-color)' : undefined,
                padding:      '9px 16px',
              }}
            >
              <Stack space={1}>
                <Text size={1}>{fy.label}</Text>
                <Text size={0} muted>{fy.from} – {fy.to}</Text>
              </Stack>
            </Box>
          ))}
        </Box>
      )}

    </Card>
  )
}
