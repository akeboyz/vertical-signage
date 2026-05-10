/**
 * AppEntryInput
 *
 * Object-level input for installedApps[] entries.
 * When licenseAsset is selected, auto-fills:
 *   appName    ← asset.brand
 *   licenseKey ← asset.serialNumber
 *
 * App details are shown on the 5.4 tab via LinkedAppsDisplay.
 */

import { useEffect }             from 'react'
import { set, PatchEvent }       from 'sanity'
import type { ObjectInputProps } from 'sanity'
import { useClient, useFormValue } from 'sanity'

export function AppEntryInput(props: ObjectInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })

  const refPath    = [...props.path, 'licenseAsset', '_ref']
  const licenseRef = useFormValue(refPath) as string | undefined

  useEffect(() => {
    if (!licenseRef) return

    client
      .fetch<{ brand?: string; serialNumber?: string }>(
        `coalesce(*[_id == "drafts." + $ref][0], *[_id == $ref][0]){ brand, serialNumber }`,
        { ref: licenseRef },
      )
      .then(asset => {
        if (!asset) return
        const patches: ReturnType<typeof set>[] = []
        if (asset.brand)        patches.push(set(asset.brand,        ['appName']))
        if (asset.serialNumber) patches.push(set(asset.serialNumber, ['licenseKey']))
        if (patches.length > 0) props.onChange(PatchEvent.from(patches))
      })
      .catch(() => {})
  }, [licenseRef]) // eslint-disable-line react-hooks/exhaustive-deps

  return props.renderDefault(props)
}
