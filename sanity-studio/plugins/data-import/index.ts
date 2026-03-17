/**
 * data-import plugin — registers a top-level "Data Import" tool in Sanity Studio.
 *
 * Usage in sanity.config.ts:
 *   import { dataImportPlugin } from './plugins/data-import'
 *   plugins: [ ..., dataImportPlugin() ]
 */

import { definePlugin } from 'sanity'
import { DatabaseIcon }  from '@sanity/icons'
import { ImportToolRoot } from './ui/ImportToolRoot'

export const dataImportPlugin = definePlugin({
  name: 'data-import',
  tools: [
    {
      name:      'data-import',
      title:     'Data Import',
      icon:      DatabaseIcon,
      component: ImportToolRoot,
    },
  ],
})
