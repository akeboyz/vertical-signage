import React, { useEffect, useRef } from 'react'
import { definePlugin, useClient }  from 'sanity'

let syncDone = false

function LedgerCodeSyncer() {
  const client = useClient({ apiVersion: '2024-01-01' })
  const ran    = useRef(false)

  useEffect(() => {
    if (ran.current || syncDone) return
    ran.current = syncDone = true

    // Query ALL ledger docs — published and drafts — so nothing is missed
    client
      .fetch<{ _id: string; codeCache?: string; code?: string }[]>(
        `*[_type == "ledger"]{_id, codeCache, "code": accountCode->code}`
      )
      .then(ledgers => {
        const toFix = ledgers.filter(l => l.code && l.codeCache !== l.code)
        return Promise.all(toFix.map(l => client.patch(l._id).set({ codeCache: l.code }).commit()))
      })
      .catch(() => {})
  }, [client]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export const ledgerCodeSyncPlugin = definePlugin({
  name: 'ledger-code-sync',
  studio: {
    components: {
      layout: (props: any) => (
        <>
          <LedgerCodeSyncer />
          {props.renderDefault(props)}
        </>
      ),
    },
  },
})
