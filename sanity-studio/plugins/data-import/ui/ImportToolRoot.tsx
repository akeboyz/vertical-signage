/**
 * ImportToolRoot.tsx — top-level component for the Data Import tool.
 *
 * Manages all shared state and acts as a step router:
 *   upload → mapping → preview → confirm → summary
 */

import React, { useState } from 'react'
import { Box, Card, Flex, Stack, Text } from '@sanity/ui'
import { StepUpload }  from './StepUpload'
import { StepMapping } from './StepMapping'
import { StepPreview } from './StepPreview'
import { StepConfirm } from './StepConfirm'
import { StepSummary } from './StepSummary'
import { autoSuggestMapping } from '../lib/mapper'
import { applyMapping }       from '../lib/mapper'
import { validateRows }       from '../lib/validator'
import { getFieldDefs }       from '../lib/fieldDefs'
import type {
  ColumnMap,
  ImportSummary,
  MappedRow,
  ParseResult,
  SchemaTarget,
} from '../types'

type Step = 'upload' | 'mapping' | 'preview' | 'confirm' | 'summary'

const STEPS: Step[] = ['upload', 'mapping', 'preview', 'confirm', 'summary']
const STEP_LABELS: Record<Step, string> = {
  upload:  '1. Upload',
  mapping: '2. Map Columns',
  preview: '3. Preview',
  confirm: '4. Confirm',
  summary: '5. Summary',
}

export function ImportToolRoot() {
  const [step,         setStep]         = useState<Step>('upload')
  const [target,       setTarget]       = useState<SchemaTarget>('projectSite')
  const [parseResult,  setParseResult]  = useState<ParseResult | null>(null)
  const [columnMap,    setColumnMap]    = useState<ColumnMap>({})
  const [mappedRows,   setMappedRows]   = useState<MappedRow[]>([])
  const [summary,      setSummary]      = useState<ImportSummary | null>(null)

  // ── Step handlers ──────────────────────────────────────────────────────────

  function handleUploadComplete(t: SchemaTarget, result: ParseResult) {
    const fields = getFieldDefs(t)
    const suggested = autoSuggestMapping(result.headers, fields)
    setTarget(t)
    setParseResult(result)
    setColumnMap(suggested)
    setStep('mapping')
  }

  function handleMappingNext() {
    const fields = getFieldDefs(target)
    const raw    = applyMapping(parseResult!.rows, columnMap, fields)
    const validated = validateRows(raw, fields)
    setMappedRows(validated)
    setStep('preview')
  }

  function handleConfirmComplete(s: ImportSummary) {
    setSummary(s)
    setStep('summary')
  }

  function handleReset() {
    setStep('upload')
    setTarget('projectSite')
    setParseResult(null)
    setColumnMap({})
    setMappedRows([])
    setSummary(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const fields = getFieldDefs(target)

  return (
    <Box padding={4} style={{ maxWidth: 960, margin: '0 auto' }}>
      <Stack space={5}>

        {/* Header */}
        <Box>
          <Text size={4} weight="bold">Data Import</Text>
          <Text size={1} muted style={{ marginTop: 4 }}>
            Import CSV or Excel data into Project Sites or Contracts
          </Text>
        </Box>

        {/* Step breadcrumb */}
        <Flex gap={2} wrap="wrap">
          {STEPS.map(s => {
            const isCurrent  = s === step
            const isDone     = STEPS.indexOf(s) < STEPS.indexOf(step)
            return (
              <Box
                key={s}
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: isCurrent ? 700 : 400,
                  background: isCurrent ? '#0070f3' : isDone ? '#d3f9d8' : '#f1f3f5',
                  color:      isCurrent ? '#fff'    : isDone ? '#2f9e44' : '#555',
                }}
              >
                {STEP_LABELS[s]}
              </Box>
            )
          })}
        </Flex>

        {/* Step content */}
        <Card padding={5} radius={2} shadow={1}>
          {step === 'upload' && (
            <StepUpload onComplete={handleUploadComplete} />
          )}

          {step === 'mapping' && parseResult && (
            <StepMapping
              headers={parseResult.headers}
              columnMap={columnMap}
              fields={fields}
              target={target}
              rowCount={parseResult.rows.length}
              onChange={setColumnMap}
              onNext={handleMappingNext}
              onBack={() => setStep('upload')}
            />
          )}

          {step === 'preview' && (
            <StepPreview
              mappedRows={mappedRows}
              columnMap={columnMap}
              fields={fields}
              onNext={() => setStep('confirm')}
              onBack={() => setStep('mapping')}
            />
          )}

          {step === 'confirm' && (
            <StepConfirm
              mappedRows={mappedRows}
              target={target}
              onComplete={handleConfirmComplete}
              onBack={() => setStep('preview')}
            />
          )}

          {step === 'summary' && summary && (
            <StepSummary summary={summary} onReset={handleReset} />
          )}
        </Card>

      </Stack>
    </Box>
  )
}
