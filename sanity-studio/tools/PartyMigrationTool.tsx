import { useState, useEffect, useCallback } from 'react'
import {
  Box, Card, Stack, Text, Flex, Button, Spinner, Badge, Checkbox, Heading, Tab, TabList, TabPanel,
} from '@sanity/ui'
import { useClient } from 'sanity'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ContractRow {
  _id:              string
  quotationNumber?: string
  contractNumber?:  string
  customerName?:    string
  projectEn?:       string
  checked:          boolean
  status:           'pending' | 'checking' | 'creating' | 'linking' | 'done' | 'error'
  resolution?:      'created' | 'linked'    // how it was resolved
  matchedParty?:    { _id: string; legalName_th?: string }  // existing party found
  newPartyId?:      string
  error?:           string
}

interface DuplicateGroup {
  name:    string
  parties: { _id: string; legalName_th?: string; legalName_en?: string; partyRole?: string[]; contractCount: number }[]
}

// ── Tab: Migrate ──────────────────────────────────────────────────────────────

function MigrateTab() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [rows,    setRows]    = useState<ContractRow[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const results = await client.fetch<Omit<ContractRow, 'checked' | 'status'>[]>(
        `*[_type == "contract" && defined(customerName) && customerName != "" && !defined(party)]{
          _id, quotationNumber, contractNumber, customerName,
          "projectEn": projectSite->projectEn
        } | order(customerName asc)`,
      )
      setRows((results ?? []).map(r => ({ ...r, checked: true, status: 'pending' })))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { load() }, [load])

  const toggleRow  = (id: string) => setRows(prev => prev.map(r => r._id === id ? { ...r, checked: !r.checked } : r))
  const allChecked  = rows.length > 0 && rows.every(r => r.checked)
  const someChecked = rows.some(r => r.checked)
  const toggleAll   = () => setRows(prev => prev.map(r => ({ ...r, checked: !allChecked })))

  const setRowState = (id: string, update: Partial<ContractRow>) =>
    setRows(prev => prev.map(r => r._id === id ? { ...r, ...update } : r))

  const handleRun = useCallback(async () => {
    const targets = rows.filter(r => r.checked && r.status === 'pending')
    if (!targets.length) return
    setRunning(true)

    for (const row of targets) {
      const name = row.customerName!.trim()

      // ── 1. Check for existing party with same legalName_th ────────────────
      setRowState(row._id, { status: 'checking' })
      let existingParty: { _id: string; legalName_th?: string } | null = null
      try {
        existingParty = await client.fetch(
          `*[_type == "party" && (legalName_th == $name || legalName == $name)][0]{ _id, legalName_th }`,
          { name },
        )
      } catch { /* ignore — will fall through to create */ }

      try {
        // Always patch the base (published) ID — Sanity automatically creates
        // a proper draft from the published content and applies the patch.
        // Never use createIfNotExists with an empty shell, which would mask all existing data.
        const baseId = row._id.replace(/^drafts\./, '')

        if (existingParty?._id) {
          // ── 2a. Link existing party ────────────────────────────────────────
          setRowState(row._id, { status: 'linking', matchedParty: existingParty })
          await client
            .patch(baseId)
            .set({ party: { _type: 'reference', _ref: existingParty!._id } })
            .commit({ autoGenerateArrayKeys: true })

          setRowState(row._id, { status: 'done', resolution: 'linked', matchedParty: existingParty })
        } else {
          // ── 2b. Create new party ───────────────────────────────────────────
          setRowState(row._id, { status: 'creating' })
          const newParty = await client.create({
            _type: 'party', partyRole: ['juristicPerson'],
            identityType: 'corporate', legalName_th: name,
          })
          await client
            .patch(baseId)
            .set({ party: { _type: 'reference', _ref: newParty._id } })
            .commit({ autoGenerateArrayKeys: true })

          setRowState(row._id, { status: 'done', resolution: 'created', newPartyId: newParty._id })
        }
      } catch (err: any) {
        setRowState(row._id, { status: 'error', error: err?.message ?? 'Unknown error' })
      }
    }
    setRunning(false)
  }, [client, rows])

  const pending  = rows.filter(r => r.status === 'pending')
  const done     = rows.filter(r => r.status === 'done')
  const errors   = rows.filter(r => r.status === 'error')
  const selected = rows.filter(r => r.checked && r.status === 'pending')

  const statusIcon = (r: ContractRow) => {
    if (r.status === 'checking' || r.status === 'creating' || r.status === 'linking') return <Spinner muted />
    if (r.status === 'done')  return <Text size={1}>{r.resolution === 'linked' ? '🔗' : '✓'}</Text>
    if (r.status === 'error') return <Text size={1}>✗</Text>
    return null
  }

  return (
    <Stack space={5}>
      <Text size={1} muted>
        Contracts below have a customer name but no linked Party. Before creating,
        the tool checks for an existing Party with the same name and links it instead.
      </Text>

      {!loading && (
        <Flex gap={3} wrap="wrap">
          <Badge tone="default"  fontSize={1}>{pending.length} pending</Badge>
          <Badge tone="positive" fontSize={1}>{done.length} done</Badge>
          {errors.length > 0 && <Badge tone="critical" fontSize={1}>{errors.length} errors</Badge>}
        </Flex>
      )}

      {!loading && pending.length > 0 && (
        <Flex gap={3} align="center" wrap="wrap">
          <Flex gap={2} align="center" style={{ cursor: 'pointer' }} onClick={toggleAll}>
            <Checkbox checked={allChecked} indeterminate={someChecked && !allChecked} readOnly />
            <Text size={1}>{allChecked ? 'Deselect all' : 'Select all'}</Text>
          </Flex>
          <Box style={{ flex: 1 }} />
          {running ? (
            <Flex gap={2} align="center"><Spinner muted /><Text size={1} muted>Processing…</Text></Flex>
          ) : (
            <Button
              text={`Process ${selected.length} selected`}
              tone="primary"
              disabled={selected.length === 0}
              onClick={handleRun}
            />
          )}
        </Flex>
      )}

      {loading && <Flex gap={3} align="center"><Spinner muted /><Text size={1} muted>Loading…</Text></Flex>}

      {!loading && rows.length === 0 && (
        <Card padding={4} border radius={2} tone="positive">
          <Text size={1} weight="semibold">✓ All contracts already have a linked Party.</Text>
        </Card>
      )}

      {!loading && rows.length > 0 && (
        <Stack space={2}>
          {rows.map(row => {
            const ref = row.contractNumber ?? row.quotationNumber ?? row._id
            return (
              <Card
                key={row._id} padding={3} border radius={2}
                tone={row.status === 'done' ? 'positive' : row.status === 'error' ? 'critical' : 'default'}
              >
                <Flex gap={3} align="center">
                  <Box style={{ flexShrink: 0, width: 24, textAlign: 'center' }}>
                    {row.status === 'pending'
                      ? <Checkbox checked={row.checked} onChange={() => toggleRow(row._id)} />
                      : statusIcon(row)
                    }
                  </Box>
                  <Stack space={1} style={{ flex: 1 }}>
                    <Text size={1} weight="semibold">{row.customerName}</Text>
                    <Text size={0} muted>{ref}{row.projectEn ? ` — ${row.projectEn}` : ''}</Text>
                    {row.status === 'done' && row.resolution === 'linked' && row.matchedParty && (
                      <Text size={0} style={{ color: '#6366F1' }}>
                        🔗 Linked to existing party: {row.matchedParty.legalName_th ?? row.matchedParty._id}
                      </Text>
                    )}
                    {row.status === 'done' && row.resolution === 'created' && (
                      <Text size={0} style={{ color: '#10B981' }}>✓ New party created</Text>
                    )}
                    {row.error && <Text size={0} style={{ color: '#e05252' }}>{row.error}</Text>}
                  </Stack>
                  {row.status === 'done' && (row.newPartyId ?? row.matchedParty?._id) && (
                    <Button
                      text="Open Party →" mode="ghost" tone="positive" fontSize={1} padding={2}
                      as="a" href={`/intent/edit/id=${row.newPartyId ?? row.matchedParty!._id};type=party`}
                    />
                  )}
                </Flex>
              </Card>
            )
          })}
        </Stack>
      )}

      {!loading && !running && done.length > 0 && (
        <Flex justify="flex-end">
          <Button text="Refresh list" mode="ghost" onClick={load} />
        </Flex>
      )}
    </Stack>
  )
}

// ── Tab: Recover ──────────────────────────────────────────────────────────────

/**
 * Finds bad empty draft shells created by the old migration tool.
 * A bad draft: _type == "contract", has a party ref, but is missing
 * core fields (quotationNumber, contractNumber, customerName, projectSite).
 * Deleting it restores the published document.
 */
function RecoverTab() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [badDrafts, setBadDrafts] = useState<{ _id: string; party?: { _ref: string }; partyName?: string }[]>([])
  const [loading,   setLoading]   = useState(true)
  const [deleting,  setDeleting]  = useState<string | null>(null)
  const [error,     setError]     = useState('')
  const [deleted,   setDeleted]   = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Look for contract drafts that are missing ALL of the key content fields
      // (these are the empty shells the old migration created)
      const drafts = await client.fetch<{ _id: string; party?: { _ref: string }; partyName?: string }[]>(
        `*[_id in path("drafts.**") && _type == "contract"
           && !defined(quotationNumber)
           && !defined(contractNumber)
           && !defined(customerName)
           && !defined(projectSite)
        ]{
          _id,
          party,
          "partyName": party->legalName_th
        }`,
      )
      setBadDrafts(drafts ?? [])
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (draftId: string) => {
    setDeleting(draftId)
    try {
      await client.delete(draftId)
      setDeleted(prev => [...prev, draftId])
      setBadDrafts(prev => prev.filter(d => d._id !== draftId))
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }, [client])

  const handleDeleteAll = useCallback(async () => {
    if (!confirm(`Delete all ${badDrafts.length} bad draft(s)? This restores the published contract data.`)) return
    for (const d of badDrafts) {
      try {
        await client.delete(d._id)
        setDeleted(prev => [...prev, d._id])
        setBadDrafts(prev => prev.filter(x => x._id !== d._id))
      } catch { /* continue */ }
    }
  }, [client, badDrafts])

  return (
    <Stack space={5}>
      <Card padding={3} border radius={2} tone="caution">
        <Stack space={2}>
          <Text size={1} weight="semibold">⚠️ What is this?</Text>
          <Text size={1} muted>
            An earlier version of the migration tool accidentally created empty contract drafts
            that hid your real contract data. This tab finds those empty shells and deletes them,
            which immediately restores the published contract data.
          </Text>
        </Stack>
      </Card>

      {error && (
        <Card padding={3} border radius={2} tone="critical">
          <Text size={1}>{error}</Text>
        </Card>
      )}

      {loading && <Flex gap={3} align="center"><Spinner muted /><Text size={1} muted>Scanning…</Text></Flex>}

      {!loading && badDrafts.length === 0 && (
        <Card padding={4} border radius={2} tone="positive">
          <Text size={1} weight="semibold">
            {deleted.length > 0
              ? `✓ Done — deleted ${deleted.length} bad draft(s). All contract data is restored.`
              : '✓ No bad drafts found. All contracts look healthy.'}
          </Text>
        </Card>
      )}

      {!loading && badDrafts.length > 0 && (
        <>
          <Flex gap={3} align="center">
            <Badge tone="caution" fontSize={1}>{badDrafts.length} bad draft{badDrafts.length > 1 ? 's' : ''} found</Badge>
            <Box style={{ flex: 1 }} />
            <Button
              text="Delete all bad drafts"
              tone="critical"
              onClick={handleDeleteAll}
              disabled={!!deleting}
            />
          </Flex>

          <Stack space={2}>
            {badDrafts.map(d => {
              const baseId = d._id.replace(/^drafts\./, '')
              return (
                <Card key={d._id} padding={3} border radius={2} tone="caution">
                  <Flex gap={3} align="center">
                    <Stack space={1} style={{ flex: 1 }}>
                      <Text size={1} weight="semibold">Empty contract draft</Text>
                      <Text size={0} muted>Draft ID: {d._id}</Text>
                      {d.partyName && <Text size={0} muted>Party: {d.partyName}</Text>}
                    </Stack>
                    <Flex gap={2} align="center">
                      <Button
                        text="View contract →" mode="ghost" fontSize={1} padding={2}
                        as="a" href={`/intent/edit/id=${baseId};type=contract`}
                      />
                      {deleting === d._id ? (
                        <Spinner muted />
                      ) : (
                        <Button
                          text="Delete bad draft"
                          tone="critical"
                          mode="ghost"
                          fontSize={1}
                          padding={2}
                          onClick={() => handleDelete(d._id)}
                        />
                      )}
                    </Flex>
                  </Flex>
                </Card>
              )
            })}
          </Stack>
        </>
      )}

      {!loading && (
        <Flex justify="flex-end">
          <Button text="Refresh" mode="ghost" onClick={load} />
        </Flex>
      )}
    </Stack>
  )
}

// ── Tab: Duplicates ───────────────────────────────────────────────────────────

function DuplicatesTab() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [groups,   setGroups]   = useState<DuplicateGroup[]>([])
  const [loading,  setLoading]  = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error,    setError]    = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Fetch all parties with a legal name
      const parties = await client.fetch<{
        _id: string; legalName_th?: string; legalName_en?: string
        legalName?: string; partyRole?: string[]
      }[]>(
        `*[_type == "party"]{
          _id, legalName_th, legalName_en, legalName, partyRole
        }`,
      )

      // Count how many contracts reference each party
      const contractCounts = await client.fetch<{ ref: string; count: number }[]>(
        `*[_type == "contract" && defined(party)]{
          "ref": party._ref
        }`,
      ).then(refs => {
        const map: Record<string, number> = {}
        for (const r of refs) map[r.ref] = (map[r.ref] ?? 0) + 1
        return map
      })

      // Group by normalised name
      const nameMap: Record<string, typeof parties> = {}
      for (const p of parties) {
        const key = (p.legalName_th ?? p.legalName ?? '').trim().toLowerCase()
        if (!key) continue
        if (!nameMap[key]) nameMap[key] = []
        nameMap[key].push(p)
      }

      const dupes: DuplicateGroup[] = Object.entries(nameMap)
        .filter(([, group]) => group.length > 1)
        .map(([, group]) => ({
          name:    group[0].legalName_th ?? group[0].legalName ?? '',
          parties: group.map(p => ({
            ...p,
            contractCount: contractCounts[p._id] ?? 0,
          })),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))

      setGroups(dupes)
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { load() }, [load])

  const handleDelete = useCallback(async (partyId: string) => {
    if (!confirm('Delete this party record? This cannot be undone.')) return
    setDeleting(partyId)
    try {
      // Delete both draft and published
      await client.delete(partyId)
      await client.delete(`drafts.${partyId}`).catch(() => {/* may not exist */})
      await load()
    } catch (err: any) {
      setError(err?.message ?? 'Delete failed')
    } finally {
      setDeleting(null)
    }
  }, [client, load])

  if (loading) return <Flex gap={3} align="center"><Spinner muted /><Text size={1} muted>Scanning for duplicates…</Text></Flex>

  return (
    <Stack space={5}>
      <Text size={1} muted>
        Parties grouped by identical legal name (Thai). Keep the one with the most contract
        links — delete the rest. Parties with contract links cannot be safely deleted.
      </Text>

      {error && (
        <Card padding={3} border radius={2} tone="critical">
          <Text size={1}>{error}</Text>
        </Card>
      )}

      {groups.length === 0 && (
        <Card padding={4} border radius={2} tone="positive">
          <Text size={1} weight="semibold">✓ No duplicate parties found.</Text>
        </Card>
      )}

      {groups.map(group => (
        <Card key={group.name} padding={3} border radius={2} tone="caution">
          <Stack space={3}>
            <Flex gap={2} align="center">
              <Badge tone="caution" fontSize={0}>Duplicate</Badge>
              <Text size={1} weight="semibold">{group.name}</Text>
              <Text size={0} muted>({group.parties.length} records)</Text>
            </Flex>

            <Stack space={2}>
              {group.parties
                .sort((a, b) => b.contractCount - a.contractCount)
                .map((p, i) => {
                  const isKeep        = i === 0
                  const hasContracts  = p.contractCount > 0
                  const isDeleting    = deleting === p._id

                  return (
                    <Card key={p._id} padding={3} border radius={2}
                      tone={isKeep ? 'positive' : 'default'}
                    >
                      <Flex gap={3} align="center">
                        <Stack space={1} style={{ flex: 1 }}>
                          <Flex gap={2} align="center">
                            {isKeep && <Badge tone="positive" fontSize={0}>Keep</Badge>}
                            <Text size={1}>{p.legalName_th ?? p.legalName ?? p._id}</Text>
                          </Flex>
                          {p.legalName_en && <Text size={0} muted>{p.legalName_en}</Text>}
                          <Text size={0} muted>
                            {p.contractCount > 0
                              ? `${p.contractCount} contract${p.contractCount > 1 ? 's' : ''} linked`
                              : 'No contracts linked'}
                            {p.partyRole?.length ? ` · ${p.partyRole.join(', ')}` : ''}
                          </Text>
                        </Stack>

                        <Flex gap={2} align="center">
                          <Button
                            text="Open →" mode="ghost" fontSize={1} padding={2}
                            as="a" href={`/intent/edit/id=${p._id};type=party`}
                          />
                          {!isKeep && (
                            isDeleting ? (
                              <Spinner muted />
                            ) : (
                              <Button
                                text={hasContracts ? 'Has links — reassign first' : 'Delete'}
                                tone="critical"
                                mode="ghost"
                                fontSize={1}
                                padding={2}
                                disabled={hasContracts}
                                title={hasContracts
                                  ? 'This party has contract links. Open the contracts and re-link them to the kept party first.'
                                  : 'Delete this duplicate party'}
                                onClick={() => handleDelete(p._id)}
                              />
                            )
                          )}
                        </Flex>
                      </Flex>
                    </Card>
                  )
                })}
            </Stack>
          </Stack>
        </Card>
      ))}

      <Flex justify="flex-end">
        <Button text="Refresh" mode="ghost" onClick={load} />
      </Flex>
    </Stack>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

// ── Tab: Fix Pipeline Stages ──────────────────────────────────────────────────

interface StaleSite {
  _id:            string
  projectEn?:     string
  projectTh?:     string
  approvalStatus: string
  pipelineStage:  string
  correctStage:   string
}

function FixPipelineTab() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [sites,   setSites]   = useState<StaleSite[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [fixing,  setFixing]  = useState(false)
  const [done,    setDone]    = useState(0)

  // approvalStatus → correct pipelineStage
  const CORRECT: Record<string, string> = {
    approved: 'approved',
    rejected: 'site_rejected',
    pending:  'site_review',
  }

  const scan = useCallback(async () => {
    setLoading(true)
    setSites(null)
    setDone(0)
    try {
      const results = await client.fetch<{ _id: string; projectEn?: string; projectTh?: string; approvalStatus?: string; pipelineStage?: string }[]>(
        `*[_type == "projectSite" && defined(approvalStatus) && approvalStatus != "not_requested"]{
          _id, projectEn, projectTh, approvalStatus, pipelineStage
        }`,
      )
      const stale: StaleSite[] = (results ?? []).flatMap(s => {
        const correct = CORRECT[s.approvalStatus ?? '']
        if (!correct) return []
        if (s.pipelineStage === correct) return []
        return [{ ...s, approvalStatus: s.approvalStatus ?? '', pipelineStage: s.pipelineStage ?? 'site_created', correctStage: correct }]
      })
      setSites(stale)
    } finally {
      setLoading(false)
    }
  }, [client])

  const fixAll = useCallback(async () => {
    if (!sites?.length) return
    setFixing(true)
    setDone(0)
    for (const s of sites) {
      await client.patch(s._id).set({ pipelineStage: s.correctStage }).commit()
      setDone(d => d + 1)
    }
    setFixing(false)
    await scan()
  }, [client, sites, scan])

  return (
    <Stack space={4}>
      <Text size={1} muted>
        Finds project sites where <code>pipelineStage</code> doesn't match <code>approvalStatus</code>
        — happens when sites were approved before the pipeline tracking was added.
      </Text>

      <Button text="Scan for stale pipeline stages" tone="primary" onClick={scan} disabled={loading || fixing} />

      {loading && <Flex gap={2} align="center"><Spinner muted /><Text size={1} muted>Scanning…</Text></Flex>}

      {sites !== null && sites.length === 0 && (
        <Card padding={3} radius={2} tone="positive" border>
          <Text size={1}>✅ All project sites have correct pipeline stages.</Text>
        </Card>
      )}

      {sites !== null && sites.length > 0 && (
        <Stack space={3}>
          <Text size={1} weight="semibold">{sites.length} site(s) need fixing:</Text>
          {sites.map(s => (
            <Card key={s._id} padding={3} border radius={2}>
              <Stack space={1}>
                <Text size={1} weight="semibold">{s.projectEn ?? s.projectTh ?? s._id}</Text>
                <Text size={0} muted>approvalStatus: <strong>{s.approvalStatus}</strong> · pipelineStage: <strong>{s.pipelineStage}</strong> → will fix to: <strong>{s.correctStage}</strong></Text>
              </Stack>
            </Card>
          ))}
          {fixing ? (
            <Flex gap={2} align="center">
              <Spinner muted />
              <Text size={1} muted>Fixed {done} / {sites.length}…</Text>
            </Flex>
          ) : (
            <Button text={`Fix all ${sites.length} site(s)`} tone="caution" onClick={fixAll} />
          )}
        </Stack>
      )}
    </Stack>
  )
}

export function PartyMigrationTool() {
  const [tab, setTab] = useState<'migrate' | 'duplicates' | 'recover' | 'pipeline'>('pipeline')

  return (
    <Box padding={5} style={{ maxWidth: 860, margin: '0 auto' }}>
      <Stack space={5}>

        <Stack space={2}>
          <Heading size={3}>Party Migration & Deduplication</Heading>
        </Stack>

        <TabList space={1}>
          <Tab
            id="tab-pipeline"
            aria-controls="panel-pipeline"
            label="🔧 Fix Pipeline Stages"
            selected={tab === 'pipeline'}
            onClick={() => setTab('pipeline')}
          />
          <Tab
            id="tab-recover"
            aria-controls="panel-recover"
            label="⚠️ Recover Contracts"
            selected={tab === 'recover'}
            onClick={() => setTab('recover')}
          />
          <Tab
            id="tab-migrate"
            aria-controls="panel-migrate"
            label="Import from Contracts"
            selected={tab === 'migrate'}
            onClick={() => setTab('migrate')}
          />
          <Tab
            id="tab-duplicates"
            aria-controls="panel-duplicates"
            label="Find Duplicates"
            selected={tab === 'duplicates'}
            onClick={() => setTab('duplicates')}
          />
        </TabList>

        <TabPanel id="panel-pipeline" aria-labelledby="tab-pipeline" hidden={tab !== 'pipeline'}>
          <Box paddingTop={4}><FixPipelineTab /></Box>
        </TabPanel>

        <TabPanel id="panel-recover" aria-labelledby="tab-recover" hidden={tab !== 'recover'}>
          <Box paddingTop={4}><RecoverTab /></Box>
        </TabPanel>

        <TabPanel id="panel-migrate" aria-labelledby="tab-migrate" hidden={tab !== 'migrate'}>
          <Box paddingTop={4}><MigrateTab /></Box>
        </TabPanel>

        <TabPanel id="panel-duplicates" aria-labelledby="tab-duplicates" hidden={tab !== 'duplicates'}>
          <Box paddingTop={4}><DuplicatesTab /></Box>
        </TabPanel>

      </Stack>
    </Box>
  )
}
