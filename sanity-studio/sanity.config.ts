import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

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

            // ── Projects — plain list; "+" opens the project create form directly ─
            S.documentTypeListItem('project').title('Projects'),

            S.divider(),

            // ── Browse by Project — per-project content navigation ─────────────
            // Separate from Projects so clicking "+" above always creates a doc.
            S.listItem()
              .title('Browse by Project')
              .child(
                S.documentTypeList('project')
                  .title('Select a Project')
                  .child(projectId =>
                    S.list()
                      .title('Project Content')
                      .items([

                        S.listItem()
                          .title('Category Config')
                          .child(
                            S.documentList()
                              .title('Category Config')
                              .filter('_type == "categoryConfig" && project._ref == $projectId')
                              .params({ projectId })
                          ),

                        S.listItem()
                          .title('Media Library')
                          .child(
                            S.documentList()
                              .title('Media Library')
                              .filter('_type == "media" && $projectId in projects[]._ref')
                              .params({ projectId })
                          ),

                        S.listItem()
                          .title('Playlist')
                          .child(
                            S.documentList()
                              .title('Playlist')
                              .filter('_type == "playlistItem" && project._ref == $projectId')
                              .params({ projectId })
                              .defaultOrdering([{ field: 'order', direction: 'asc' }])
                          ),

                        S.listItem()
                          .title('Providers')
                          .child(
                            S.documentList()
                              .title('Providers')
                              .filter('_type == "provider" && project._ref == $projectId')
                              .params({ projectId })
                          ),

                        S.listItem()
                          .title('Building Updates')
                          .child(
                            S.documentList()
                              .title('Building Updates')
                              .filter('_type == "buildingUpdate" && project._ref == $projectId')
                              .params({ projectId })
                              .defaultOrdering([{ field: 'publishedAt', direction: 'desc' }])
                          ),

                      ])
                  )
              ),

            S.divider(),

            // ── Global flat views (useful for cross-project browsing) ──────────
            S.documentTypeListItem('media').title('All Media'),
            S.documentTypeListItem('playlistItem').title('All Playlists'),
            S.documentTypeListItem('provider').title('All Providers'),
            S.documentTypeListItem('buildingUpdate').title('All Building Updates'),
            S.documentTypeListItem('categoryConfig').title('All Category Configs'),

          ]),
    }),

    visionTool(),
  ],

  schema: { types: schemaTypes },
})
