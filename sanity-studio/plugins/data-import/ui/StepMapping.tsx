import React from 'react'
import { Box, Button, Card, Flex, Heading, Select, Stack, Text } from '@sanity/ui'
import type { ColumnMap, FieldDef, SchemaTarget } from '../types'

interface Props {
  headers: string[]
  columnMap: ColumnMap
  fields: FieldDef[]
  target: SchemaTarget
  rowCount: number
  onChange: (map: ColumnMap) => void
  onNext: () => void
  onBack: () => void
}

export function StepMapping({ headers, columnMap, fields, target, rowCount, onChange, onNext, onBack }: Props) {
  // Check that all required non-relationship fields have a mapping
  const requiredFields = fields.filter(f => f.required && !f.isRelationshipKey)
  const mappedFieldNames = new Set(Object.values(columnMap).filter(Boolean))
  const unmappedRequired = requiredFields.filter(f => !mappedFieldNames.has(f.name))
  const canProceed = unmappedRequired.length === 0

  function setMapping(header: string, fieldName: string | null) {
    onChange({ ...columnMap, [header]: fieldName || null })
  }

  const mappedCount = Object.values(columnMap).filter(Boolean).length

  return (
    <Stack space={5}>
      <Heading size={2}>Step 2 — Map Columns to Fields</Heading>

      <Text size={1} muted>
        {rowCount} rows detected · {headers.length} columns · {mappedCount} mapped
        · Importing into <strong>{target === 'projectSite' ? 'Project Sites' : 'Contracts'}</strong>
      </Text>

      {unmappedRequired.length > 0 && (
        <Card padding={3} radius={2} tone="caution">
          <Text size={1}>
            Required fields not yet mapped:{' '}
            <strong>{unmappedRequired.map(f => f.label).join(', ')}</strong>
          </Text>
        </Card>
      )}

      {/* Mapping table */}
      <Box style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={thStyle}>CSV / Excel Column</th>
              <th style={thStyle}>Maps to Sanity Field</th>
              <th style={thStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {headers.map(header => {
              const mapped = columnMap[header]
              const field = fields.find(f => f.name === mapped)
              const dot = !mapped ? '⚫' : field?.required ? '🟢' : '🔵'

              return (
                <tr key={header} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={tdStyle}>
                    <Text size={1}><strong>{header}</strong></Text>
                  </td>
                  <td style={tdStyle}>
                    <Select
                      value={mapped ?? ''}
                      onChange={e => setMapping(header, e.currentTarget.value || null)}
                      style={{ fontSize: 13 }}
                    >
                      <option value="">-- skip --</option>
                      {fields.map(f => (
                        <option key={f.name} value={f.name}>
                          {f.label}{f.required ? ' *' : ''}{f.isRelationshipKey ? ' (lookup)' : ''}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span title={!mapped ? 'Skipped' : field?.required ? 'Required field' : 'Optional field'}>
                      {dot}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Box>

      <Flex gap={3}>
        <Button mode="ghost" text="← Back" onClick={onBack} />
        <Button
          tone="primary"
          text="Preview Data →"
          onClick={onNext}
          disabled={!canProceed}
        />
      </Flex>
    </Stack>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  borderBottom: '2px solid #ddd',
}

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
  verticalAlign: 'middle',
}
