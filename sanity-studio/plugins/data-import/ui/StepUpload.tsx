import React, { useRef, useState } from 'react'
import { Box, Button, Card, Flex, Heading, Select, Stack, Text } from '@sanity/ui'
import { parseFile } from '../lib/parser'
import type { ParseResult, SchemaTarget } from '../types'

interface Props {
  onComplete: (target: SchemaTarget, result: ParseResult) => void
}

export function StepUpload({ onComplete }: Props) {
  const [target, setTarget] = useState<SchemaTarget>('projectSite')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setLoading(true)
    setError(null)
    const result = await parseFile(file)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else if (result.rows.length === 0) {
      setError('The file contains no data rows.')
    } else {
      onComplete(target, result)
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <Stack space={5}>
      <Heading size={2}>Step 1 — Upload File</Heading>

      {/* Schema type selector */}
      <Stack space={2}>
        <Text size={1} weight="semibold">Import into</Text>
        <Select
          value={target}
          onChange={e => setTarget(e.currentTarget.value as SchemaTarget)}
        >
          <option value="projectSite">Project Sites</option>
          <option value="contract">Contracts</option>
        </Select>
      </Stack>

      {/* Drop zone */}
      <Card
        padding={5}
        radius={2}
        style={{
          border: `2px dashed ${dragging ? '#0070f3' : '#ccc'}`,
          background: dragging ? '#f0f7ff' : '#fafafa',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.2s, background 0.2s',
        }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={onInputChange}
        />
        <Stack space={3}>
          <Text size={3}>📁</Text>
          <Text size={2} weight="semibold">
            {loading ? 'Parsing file…' : 'Drop a CSV or Excel file here, or click to browse'}
          </Text>
          <Text size={1} muted>Supports .csv, .xlsx, .xls</Text>
        </Stack>
      </Card>

      {error && (
        <Card padding={3} radius={2} tone="critical">
          <Text size={1}>{error}</Text>
        </Card>
      )}
    </Stack>
  )
}
