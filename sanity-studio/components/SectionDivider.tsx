import { Box } from '@sanity/ui'

export function SectionDivider() {
  return (
    <Box paddingY={1}>
      <hr style={{ border: 'none', borderTop: '1px solid var(--card-border-color)', margin: 0 }} />
    </Box>
  )
}
