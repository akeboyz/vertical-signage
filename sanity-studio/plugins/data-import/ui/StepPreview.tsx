import React from 'react'
import { Box, Button, Card, Flex, Heading, Stack, Text } from '@sanity/ui'
import { ErrorBadge } from './ErrorBadge'
import type { ColumnMap, FieldDef, MappedRow } from '../types'

interface Props {
  mappedRows: MappedRow[]
  columnMap: ColumnMap
  fields: FieldDef[]
  onNext: () => void
  onBack: () => void
}

const PREVIEW_LIMIT = 100

export function StepPreview({ mappedRows, columnMap, fields, onNext, onBack }: Props) {
  const preview = mappedRows.slice(0, PREVIEW_LIMIT)
  const errorCount = mappedRows.filter(r => r.errors.length > 0).length
  const validCount = mappedRows.length - errorCount

  // Only show columns that were mapped (not skipped)
  const mappedFields = fields.filter(f =>
    Object.values(columnMap).includes(f.name),
  )

  return (
    <Stack space={5}>
      <Heading size={2}>Step 3 — Preview</Heading>

      <Flex gap={3} wrap="wrap">
        <Card padding={3} radius={2} tone="positive" style={{ minWidth: 120 }}>
          <Stack space={1}>
            <Text size={3} weight="bold">{validCount}</Text>
            <Text size={1}>Valid rows</Text>
          </Stack>
        </Card>
        {errorCount > 0 && (
          <Card padding={3} radius={2} tone="critical" style={{ minWidth: 120 }}>
            <Stack space={1}>
              <Text size={3} weight="bold">{errorCount}</Text>
              <Text size={1}>Rows with errors</Text>
            </Stack>
          </Card>
        )}
        <Card padding={3} radius={2} tone="default" style={{ minWidth: 120 }}>
          <Stack space={1}>
            <Text size={3} weight="bold">{mappedRows.length}</Text>
            <Text size={1}>Total rows</Text>
          </Stack>
        </Card>
      </Flex>

      {errorCount > 0 && (
        <Card padding={3} radius={2} tone="caution">
          <Text size={1}>
            Rows with errors are highlighted in red. They will be skipped during import.
            You can go back and fix the mapping, or proceed and skip those rows.
          </Text>
        </Card>
      )}

      <Box style={{ overflowX: 'auto', maxHeight: 480, overflowY: 'auto', border: '1px solid #eee', borderRadius: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5f5f5', zIndex: 1 }}>
            <tr>
              <th style={thStyle}>#</th>
              {mappedFields.map(f => (
                <th key={f.name} style={thStyle}>
                  {f.label}{f.required ? ' *' : ''}
                </th>
              ))}
              <th style={thStyle}>Errors</th>
            </tr>
          </thead>
          <tbody>
            {preview.map(row => {
              const hasError = row.errors.length > 0
              const rowBg = hasError ? '#fff5f5' : undefined

              return (
                <tr key={row._rowIndex} style={{ background: rowBg, borderBottom: '1px solid #eee' }}>
                  <td style={{ ...tdStyle, color: '#888' }}>{row._rowIndex + 1}</td>
                  {mappedFields.map(f => {
                    const fieldErrors = row.errors.filter(e => e.field === f.name)
                    const value = row.data[f.name]
                    return (
                      <td
                        key={f.name}
                        style={{
                          ...tdStyle,
                          background: fieldErrors.length > 0 ? '#ffe3e3' : undefined,
                        }}
                      >
                        {value !== undefined && value !== null ? String(value) : (
                          <span style={{ color: '#bbb' }}>—</span>
                        )}
                      </td>
                    )
                  })}
                  <td style={tdStyle}>
                    <ErrorBadge messages={row.errors.map(e => e.message)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Box>

      {mappedRows.length > PREVIEW_LIMIT && (
        <Text size={1} muted>
          Showing first {PREVIEW_LIMIT} of {mappedRows.length} rows.
        </Text>
      )}

      <Flex gap={3}>
        <Button mode="ghost" text="← Back" onClick={onBack} />
        <Button tone="primary" text="Confirm Import →" onClick={onNext} />
      </Flex>
    </Stack>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontWeight: 600,
  borderBottom: '2px solid #ddd',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  verticalAlign: 'top',
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
