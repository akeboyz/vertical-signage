import React from 'react'
import { Box, Button, Card, Flex, Heading, Stack, Text } from '@sanity/ui'
import type { ImportSummary } from '../types'

interface Props {
  summary: ImportSummary
  onReset: () => void
}

export function StepSummary({ summary, onReset }: Props) {
  const { total, created, updated, failed, dryRun, results } = summary

  return (
    <Stack space={5}>
      <Flex align="center" gap={3}>
        <Heading size={2}>Import Complete</Heading>
        {dryRun && (
          <span
            style={{
              background: '#f08c00',
              color: '#fff',
              borderRadius: 4,
              fontSize: 12,
              padding: '2px 8px',
              fontWeight: 600,
            }}
          >
            DRY RUN — no data was written
          </span>
        )}
      </Flex>

      {/* Stat boxes */}
      <Flex gap={3} wrap="wrap">
        <StatBox label="Total" value={total} tone="default" />
        {!dryRun && <StatBox label="Created" value={created} tone="positive" />}
        {!dryRun && <StatBox label="Updated" value={updated} tone="primary" />}
        <StatBox label="Failed / Skipped" value={failed} tone={failed > 0 ? 'critical' : 'positive'} />
      </Flex>

      {/* Result table */}
      <Box style={{ overflowX: 'auto', maxHeight: 400, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
            <tr>
              <th style={thStyle}>Row</th>
              <th style={thStyle}>Identifier</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Details</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => {
              const isError = r.status === 'error'
              return (
                <tr
                  key={r.rowIndex}
                  style={{
                    borderBottom: '1px solid #eee',
                    background: isError ? '#fff5f5' : undefined,
                  }}
                >
                  <td style={tdStyle}>{r.rowIndex + 1}</td>
                  <td style={tdStyle}>{r.identifier || '—'}</td>
                  <td style={tdStyle}>
                    <StatusPill status={r.status} />
                  </td>
                  <td style={{ ...tdStyle, color: isError ? '#e03131' : '#555' }}>
                    {r.error ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Box>

      <Button tone="primary" text="↩ Import Another File" onClick={onReset} />
    </Stack>
  )
}

function StatBox({ label, value, tone }: { label: string; value: number; tone: string }) {
  const bg: Record<string, string> = {
    positive: '#ebfbee',
    primary:  '#e7f5ff',
    critical: '#fff5f5',
    caution:  '#fff9db',
    default:  '#f8f9fa',
  }
  return (
    <Card
      padding={3}
      radius={2}
      style={{ background: bg[tone] ?? bg.default, minWidth: 110 }}
    >
      <Stack space={1}>
        <Text size={3} weight="bold">{value}</Text>
        <Text size={1}>{label}</Text>
      </Stack>
    </Card>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    created:  { bg: '#2f9e44', label: '✓ Created'  },
    updated:  { bg: '#1971c2', label: '✓ Updated'  },
    'dry-run':{ bg: '#e67700', label: '○ Dry Run'  },
    error:    { bg: '#e03131', label: '✗ Error'    },
    skipped:  { bg: '#868e96', label: '— Skipped'  },
  }
  const { bg, label } = map[status] ?? { bg: '#868e96', label: status }
  return (
    <span style={{
      background: bg,
      color: '#fff',
      borderRadius: 4,
      fontSize: 11,
      padding: '2px 6px',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '2px solid #ddd',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  verticalAlign: 'top',
}
