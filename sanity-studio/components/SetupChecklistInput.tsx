/**
 * SetupChecklistInput
 *
 * Visual grouped checklist for the installation setup process.
 * - Items grouped by phase with a header and progress bar per phase.
 * - Overall progress shown at the top.
 * - "Initialize defaults" button populates standard tasks on existing documents.
 * - Users can tick items, add custom tasks, or add notes per item.
 */

import { useState } from 'react'
import { Stack, Button, Flex, Text, Card, Badge, TextInput, Checkbox, Box } from '@sanity/ui'
import { set, insert, unset } from 'sanity'

// ── Default task list ──────────────────────────────────────────────────────────

export const DEFAULT_CHECKLIST = [
  // 📦 Delivery
  { phase: 'delivery',    task: 'Purchase order raised'                          },
  { phase: 'delivery',    task: 'Device shipped from vendor'                     },
  { phase: 'delivery',    task: 'Device received at office / site'               },
  { phase: 'delivery',    task: 'Device unboxed and inspected — no damage'       },

  // 🔨 Physical Installation
  { phase: 'physical',    task: 'Installation location confirmed with site manager' },
  { phase: 'physical',    task: 'Mounting bracket / TV stand installed'          },
  { phase: 'physical',    task: 'Screen mounted securely'                        },
  { phase: 'physical',    task: 'Cable trunking / conduit installed'             },
  { phase: 'physical',    task: 'Screen powered on — no dead pixels or defects'  },

  // 🖊 Sign-off
  { phase: 'signoff',     task: 'Site manager walkthrough completed'             },
  { phase: 'signoff',     task: 'Client / site approval received'                },
].map((item, i) => ({
  ...item,
  _type: 'checklistItem',
  _key:  `default_${String(i + 1).padStart(2, '0')}`,
  done:  false,
  notes: '',
}))

// ── Phase config ───────────────────────────────────────────────────────────────

const PHASES: { value: string; label: string; emoji: string; color: string }[] = [
  { value: 'delivery',   label: 'Delivery',              emoji: '📦', color: '#6b7280' },
  { value: 'physical',   label: 'Physical Installation', emoji: '🔨', color: '#92400e' },
  { value: 'signoff',    label: 'Sign-off',              emoji: '🖊', color: '#be185d' },
]

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  _key:   string
  _type:  string
  phase:  string
  task:   string
  done:   boolean
  notes?: string
}

type Props = {
  value?:   ChecklistItem[]
  onChange: (patch: any) => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SetupChecklistInput({ value, onChange }: Props) {
  const items: ChecklistItem[] = value ?? []
  const [addingPhase, setAddingPhase] = useState<string | null>(null)
  const [newTask,     setNewTask]     = useState('')

  const knownPhases = new Set(PHASES.map(p => p.value))
  const visibleItems = items.filter(i => knownPhases.has(i.phase))
  const total = visibleItems.length
  const done  = visibleItems.filter(i => i.done).length

  // Toggle a single item's done state
  function toggle(item: ChecklistItem) {
    onChange(set(!item.done, [{ _key: item._key }, 'done']))
  }

  // Initialize with default tasks
  function initDefaults() {
    onChange(set(DEFAULT_CHECKLIST))
  }

  // Add a custom task to a phase
  function addTask(phase: string) {
    if (!newTask.trim()) return
    const newItem: ChecklistItem = {
      _type: 'checklistItem',
      _key:  `custom_${Date.now()}`,
      phase,
      task:  newTask.trim(),
      done:  false,
      notes: '',
    }
    onChange(insert([newItem], 'after', [{ _key: items.filter(i => i.phase === phase).at(-1)?._key ?? '' }]))
    setNewTask('')
    setAddingPhase(null)
  }

  // Remove an item
  function removeItem(key: string) {
    onChange(unset([{ _key: key }]))
  }

  if (items.length === 0) {
    return (
      <Card padding={4} radius={2} border tone="default">
        <Stack space={3}>
          <Text size={1} muted>No checklist items yet.</Text>
          <Button
            text="📋 Initialize with default tasks"
            mode="default"
            tone="primary"
            onClick={initDefaults}
          />
        </Stack>
      </Card>
    )
  }

  return (
    <Stack space={3}>

      {/* ── Overall progress ─────────────────────────────────────────── */}
      <Card padding={3} radius={2} border tone={done === total ? 'positive' : 'default'}>
        <Stack space={2}>
          <Flex align="center" justify="space-between">
            <Text size={1} weight="semibold">
              {done === total ? '🎉 All done!' : `Progress: ${done} / ${total} completed`}
            </Text>
            <Badge tone={done === total ? 'positive' : 'primary'} mode="outline">
              {total > 0 ? Math.round((done / total) * 100) : 0}%
            </Badge>
          </Flex>
          <div style={{ background: 'var(--card-border-color)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
            <div style={{
              background:  done === total ? '#22c55e' : 'var(--card-focus-ring-color, #2276fc)',
              height:      '100%',
              width:       `${total > 0 ? (done / total) * 100 : 0}%`,
              transition:  'width 0.4s ease',
            }} />
          </div>
        </Stack>
      </Card>

      {/* ── Per-phase groups ──────────────────────────────────────────── */}
      {PHASES.map(phase => {
        const phaseItems = items.filter(i => i.phase === phase.value)
        if (phaseItems.length === 0 && addingPhase !== phase.value) return null

        const phaseDone  = phaseItems.filter(i => i.done).length
        const phaseTotal = phaseItems.length

        return (
          <Card key={phase.value} padding={3} radius={2} border tone="default">
            <Stack space={3}>

              {/* Phase header */}
              <Flex align="center" justify="space-between">
                <Flex align="center" gap={2}>
                  <Text size={1} weight="semibold">{phase.emoji} {phase.label}</Text>
                </Flex>
                <Badge
                  tone={phaseDone === phaseTotal && phaseTotal > 0 ? 'positive' : 'default'}
                  mode="outline"
                  fontSize={0}
                >
                  {phaseDone} / {phaseTotal}
                </Badge>
              </Flex>

              {/* Checklist items */}
              {phaseItems.map(item => (
                <Flex key={item._key} align="flex-start" gap={2}>
                  <Box paddingTop={1} style={{ flexShrink: 0 }}>
                    <Checkbox
                      checked={item.done}
                      onChange={() => toggle(item)}
                      style={{ cursor: 'pointer' }}
                    />
                  </Box>
                  <Stack space={1} style={{ flex: 1 }}>
                    <Text
                      size={1}
                      style={{
                        textDecoration: item.done ? 'line-through' : 'none',
                        opacity:        item.done ? 0.5 : 1,
                        cursor:         'pointer',
                      }}
                      onClick={() => toggle(item)}
                    >
                      {item.task}
                    </Text>
                    {item.notes && (
                      <Text size={0} muted>{item.notes}</Text>
                    )}
                  </Stack>
                  <Button
                    text="✕"
                    mode="bleed"
                    tone="critical"
                    fontSize={0}
                    padding={1}
                    style={{ flexShrink: 0, opacity: 0.4 }}
                    onClick={() => removeItem(item._key)}
                  />
                </Flex>
              ))}

              {/* Add custom task */}
              {addingPhase === phase.value ? (
                <Flex gap={2}>
                  <Box flex={1}>
                    <TextInput
                      value={newTask}
                      onChange={e => setNewTask((e.target as HTMLInputElement).value)}
                      placeholder="Describe the task…"
                      onKeyDown={e => { if (e.key === 'Enter') addTask(phase.value) }}
                      autoFocus
                    />
                  </Box>
                  <Button text="Add"    mode="default" tone="primary" onClick={() => addTask(phase.value)} />
                  <Button text="Cancel" mode="ghost"   tone="default" onClick={() => { setAddingPhase(null); setNewTask('') }} />
                </Flex>
              ) : (
                <Button
                  text={`+ Add task to ${phase.label}`}
                  mode="bleed"
                  tone="default"
                  fontSize={1}
                  onClick={() => { setAddingPhase(phase.value); setNewTask('') }}
                />
              )}

            </Stack>
          </Card>
        )
      })}

      {/* Reset */}
      <Flex justify="flex-end">
        <Button
          text="↺ Reset to defaults"
          mode="ghost"
          tone="caution"
          fontSize={0}
          onClick={initDefaults}
        />
      </Flex>

    </Stack>
  )
}
