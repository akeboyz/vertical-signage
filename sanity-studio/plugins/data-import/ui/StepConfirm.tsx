import React, { useState } from 'react'
import { Box, Button, Card, Checkbox, Flex, Heading, Stack, Text } from '@sanity/ui'
import { runImport } from '../lib/writer'
import type { ImportSummary, MappedRow, SchemaTarget } from '../types'

interface Props {
  mappedRows: MappedRow[]
  target: SchemaTarget
  onComplete: (summary: ImportSummary) => void
  onBack: () => void
}

export function StepConfirm({ mappedRows, target, onComplete, onBack }: Props) {
  const [dryRun, setDryRun] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)

  const validRows  = mappedRows.filter(r => r.errors.length === 0)
  const errorRows  = mappedRows.filter(r => r.errors.length > 0)
  const targetLabel = target === 'projectSite' ? 'Project Sites' : 'Contracts'

  async function handleRun() {
    setRunning(true)
    setProgress(0)
    try {
      const summary = await runImport(
        mappedRows,
        target,
        dryRun,
        (done, total) => setProgress(Math.round((done / total) * 100)),
      )
      onComplete(summary)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`Import failed: ${msg}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Stack space={5}>
      <Heading size={2}>Step 4 — Confirm Import</Heading>

      <Card padding={4} radius={2} tone="default">
        <Stack space={3}>
          <Text size={2} weight="semibold">Import summary</Text>
          <Text size={1}>Target: <strong>{targetLabel}</strong></Text>
          <Text size={1}>Total rows: <strong>{mappedRows.length}</strong></Text>
          <Text size={1} style={{ color: '#2f9e44' }}>Valid rows: <strong>{validRows.length}</strong></Text>
          {errorRows.length > 0 && (
            <Text size={1} style={{ color: '#e03131' }}>
              Rows with errors (will be skipped): <strong>{errorRows.length}</strong>
            </Text>
          )}
        </Stack>
      </Card>

      {/* Dry-run toggle */}
      <Flex align="center" gap={3}>
        <Checkbox
          id="dryrun"
          checked={dryRun}
          onChange={e => setDryRun((e.target as HTMLInputElement).checked)}
        />
        <label htmlFor="dryrun" style={{ cursor: 'pointer' }}>
          <Stack space={1}>
            <Text size={2} weight="semibold">Dry Run</Text>
            <Text size={1} muted>Validate and simulate — no data will be written to Sanity</Text>
          </Stack>
        </label>
      </Flex>

      {running && (
        <Stack space={2}>
          <Text size={1}>{dryRun ? 'Simulating…' : 'Importing…'} {progress}%</Text>
          <Box
            style={{
              height: 8,
              background: '#eee',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <Box
              style={{
                height: '100%',
                width: `${progress}%`,
                background: '#0070f3',
                transition: 'width 0.2s',
              }}
            />
          </Box>
        </Stack>
      )}

      <Flex gap={3}>
        <Button mode="ghost" text="← Back" onClick={onBack} disabled={running} />
        <Button
          tone={dryRun ? 'caution' : 'primary'}
          text={running
            ? `${dryRun ? 'Simulating' : 'Importing'}… ${progress}%`
            : dryRun
              ? '🔍 Run Dry Run'
              : `🚀 Import ${validRows.length} rows into ${targetLabel}`
          }
          onClick={handleRun}
          disabled={running || validRows.length === 0}
        />
      </Flex>
    </Stack>
  )
}
