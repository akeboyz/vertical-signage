import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'

// ── Replace these two values after running `npm create sanity@latest` ──────────
const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  name: 'vertical-signage-studio',
  title: 'Vertical Signage CMS',

  projectId: PROJECT_ID,
  dataset:   DATASET,

  plugins: [
    structureTool({
      structure: S =>
        S.list()
          .title('Content')
          .items([
            // Singleton: Category Config — always open the one document directly
            S.listItem()
              .title('Category Config')
              .id('categoryConfig')
              .child(
                S.document()
                  .schemaType('categoryConfig')
                  .documentId('categoryConfig-singleton')
              ),
            S.divider(),
            S.documentTypeListItem('playlistItem').title('Playlist'),
            S.divider(),
            S.documentTypeListItem('provider').title('Providers'),
            S.documentTypeListItem('buildingUpdate').title('Building Updates'),
          ]),
    }),
    visionTool(), // GROQ query playground — useful for testing
  ],

  schema: { types: schemaTypes },
})
