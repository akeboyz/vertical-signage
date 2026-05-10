import { useEffect, useRef }        from 'react'
import { useClient, useFormValue } from 'sanity'

// Runs once per browser session — detects which accountCode docs are parents
// and patches isParent: true/false so the General Ledger picker filter works.
let isParentSyncDone  = false
// Runs once per browser session — backfills codeCache on all ledger docs so
// the ledger list can sort by account code.
let codeCacheSyncDone = false

export function AccountCodeWithNormalBalanceInput(props: any) {
  const client       = useClient({ apiVersion: '2024-01-01' })
  const rawId        = useFormValue(['_id']) as string | undefined
  const accountRefId = (props.value as any)?._ref as string | undefined

  const docId   = rawId ? rawId.replace(/^drafts\./, '') : undefined
  const draftId = docId ? `drafts.${docId}` : undefined

  // ── One-time isParent sync across all account codes ─────────────────────
  const syncRef = useRef(false)
  useEffect(() => {
    if (syncRef.current || isParentSyncDone) return
    syncRef.current    = true
    isParentSyncDone   = true

    client
      .fetch<{ _id: string; isParent?: boolean; parentId?: string }[]>(
        `*[_type == "accountCode" && !(_id in path("drafts.**"))]{_id, isParent, "parentId": parentCode._ref}`
      )
      .then(all => {
        const parentIds = new Set(all.map(a => a.parentId).filter(Boolean))
        const toFix = all.filter(a => parentIds.has(a._id) !== (a.isParent ?? false))
        return Promise.all(
          toFix.map(a => client.patch(a._id).set({ isParent: parentIds.has(a._id) }).commit())
        )
      })
      .catch(() => {})
  }, [client]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── One-time codeCache backfill across all ledger docs ───────────────────
  const codeSyncRef = useRef(false)
  useEffect(() => {
    if (codeSyncRef.current || codeCacheSyncDone) return
    codeSyncRef.current  = true
    codeCacheSyncDone    = true

    client
      .fetch<{ _id: string; codeCache?: string; code?: string }[]>(
        `*[_type == "ledger" && !(_id in path("drafts.**"))]{_id, codeCache, "code": accountCode->code}`
      )
      .then(ledgers => {
        const toFix = ledgers.filter(l => l.code && l.codeCache !== l.code)
        return Promise.all(
          toFix.map(l => client.patch(l._id).set({ codeCache: l.code }).commit())
        )
      })
      .catch(() => {})
  }, [client]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cache normalBalance, isParent, depth, and code onto the ledger draft ─
  useEffect(() => {
    if (!draftId || !docId) return

    const safePatch = async (data: Record<string, any>) => {
      if (rawId?.startsWith('drafts.')) {
        await client.patch(draftId).set(data).commit()
        return
      }
      const published = await client.fetch<Record<string, any>>(`*[_id == $id][0]`, { id: docId })
      if (!published) return
      const { _id, _rev, _updatedAt, _createdAt, ...fields } = published
      await client.transaction()
        .createIfNotExists({ _id: draftId, _type: 'ledger', ...fields })
        .patch(draftId, (p: any) => p.set(data))
        .commit()
    }

    if (!accountRefId) {
      safePatch({ normalBalanceCache: null, isParentCache: false, accountDepthCache: 0, codeCache: null }).catch(() => {})
      return
    }

    let cancelled = false
    client
      .fetch<{ normalBalance?: string; isParent?: boolean; depth?: number; code?: string } | null>(
        `*[_id == $ref][0]{
          normalBalance,
          isParent,
          code,
          "depth": select(
            !defined(parentCode)                             => 0,
            !defined(parentCode->parentCode)                 => 1,
            !defined(parentCode->parentCode->parentCode)     => 2,
            3
          )
        }`,
        { ref: accountRefId },
      )
      .then(doc => {
        if (cancelled) return
        safePatch({
          normalBalanceCache:  doc?.normalBalance  ?? null,
          isParentCache:       doc?.isParent       ?? false,
          accountDepthCache:   doc?.depth          ?? 0,
          codeCache:           doc?.code           ?? null,
        }).catch(() => {})
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [accountRefId, draftId]) // eslint-disable-line react-hooks/exhaustive-deps

  return props.renderDefault(props)
}
