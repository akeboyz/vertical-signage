import { defineConfig, definePlugin } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './schemas'
import { initPlaylistAction }    from './actions/initPlaylistAction'
import { ProjectPublishAction } from './actions/projectPublishAction'
import { AddToPlaylistAction }  from './actions/addToPlaylistAction'
import { MediaPublishAction }   from './actions/mediaPublishAction'
import { DocumentOverview }     from './views/DocumentOverview'
import { AILookupAction }      from './actions/AILookupAction'
import { GenerateView }         from './views/GenerateView'
import { ApprovalView }         from './views/ApprovalView'
import { dataImportPlugin }     from './plugins/data-import'
import { HowToTool }            from './tools/HowToTool'

const howToPlugin = definePlugin({
  name: 'how-to-guide',
  tools: [
    {
      name:      'how-to',
      title:     'How-To Guide',
      component: HowToTool,
    },
  ],
})

const PROJECT_ID = 'awjj9g8u'
const DATASET    = 'production'

export default defineConfig({
  name: 'vertical-signage-studio',
  title: 'Vertical Signage CMS',

  projectId: PROJECT_ID,
  dataset:   DATASET,

  plugins: [
    dataImportPlugin(),
    howToPlugin(),
    structureTool({
      // Every document opens in read-only Overview by default.
      // The user clicks the "Edit" tab to make changes.
      // Exception: the categoryConfig singleton skips Overview and shows the form directly.
      defaultDocumentNode: (S, { schemaType }) => {
        if (schemaType === 'categoryConfig') {
          return S.document().views([S.view.form().id('edit').title('Edit')])
        }
        if (schemaType === 'contract') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
            S.view.component(GenerateView).id('generate').title('Generate'),
          ])
        }
        if (schemaType === 'projectSite') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
          ])
        }
        return S.document().views([
          S.view.component(DocumentOverview).id('overview').title('Overview'),
          S.view.form().id('edit').title('Edit'),
        ])
      },

      structure: S =>
        S.list()
          .title('Content')
          .items([

            // ── Projects ──────────────────────────────────────────────────────
            // "+" opens a blank project form. Clicking an existing project opens it directly.
            S.documentTypeListItem('project').title('Projects'),

            S.divider(),

            // ── Playlist (per-project) ─────────────────────────────────────────
            // Level 1: list of all projects.
            // Level 2: PlaylistItems filtered to that project, ordered by `order`.
            // "+" inside a project's playlist pre-fills project via initial value template.
            S.listItem()
              .id('playlist')
              .title('Playlist')
              .child(
                S.documentTypeList('project')
                  .title('Playlist — Select Project')
                  .child(projectId =>
                    S.documentList()
                      .title('Playlist Items')
                      .filter('_type == "playlistItem" && project._ref == $projectId')
                      .params({ projectId })
                      .defaultOrdering([{ field: 'order', direction: 'asc' }])
                  )
              ),

            // ── Media Library ──────────────────────────────────────────────────
            S.documentTypeListItem('media').title('Media Library'),

            S.divider(),

            // ── Providers + Offers (global) ────────────────────────────────────
            S.documentTypeListItem('offer').title('Offers'),
            S.documentTypeListItem('provider').title('Providers'),

            S.divider(),

            // ── Config (global singleton) ──────────────────────────────────────
            S.listItem()
              .title('Global Category Config')
              .id('categoryConfig-global')
              .child(
                S.document()
                  .schemaType('categoryConfig')
                  .documentId('categoryConfig-global')
                  .title('Global Category Config')
              ),

            S.divider(),

            // ── Contracts ─────────────────────────────────────────────────────
            S.documentTypeListItem('projectSite').title('Project Sites'),
            S.documentTypeListItem('contractType').title('Contract Types'),
            S.documentTypeListItem('contract').title('Contracts'),

            S.divider(),

            // ── Approval ──────────────────────────────────────────────────────
            S.documentTypeListItem('approvalPosition').title('Approver Positions'),
            S.documentTypeListItem('approvalRule').title('Approval Rules'),
            S.documentTypeListItem('approvalRequest').title('Approval Requests'),

          ]),
    }),

    visionTool(),
  ],

  schema: { types: schemaTypes },

  // ── Initial value templates ───────────────────────────────────────────────
  // Used by the Playlist list-item in the structure above so that clicking "+"
  // pre-fills the project reference on the new playlist item.
  templates: prev => [
    ...prev,
    {
      id:         'playlistItem-by-project',
      title:      'Playlist Item',
      schemaType: 'playlistItem',
      parameters: [{ name: 'projectId', type: 'string', title: 'Project ID' }],
      value: ({ projectId }: { projectId: string }) => ({
        project: { _type: 'reference', _ref: projectId },
        order:   1,
        enabled: true,
      }),
    },
  ],

  // ── Document actions ──────────────────────────────────────────────────────
  document: {
    actions: (prev, ctx) => {
      if (ctx.schemaType === 'project') {
        // Replace the first action (always Publish) with our version that
        // auto-creates a playlist item on first publish.
        // Keep initPlaylistAction as a manual fallback button.
        const [_defaultPublish, ...rest] = prev
        return [ProjectPublishAction, ...rest, initPlaylistAction]
      }
      if (ctx.schemaType === 'media') {
        // Replace default Publish with MediaPublishAction (handles addToPlaylistOnPublish).
        // Keep AddToPlaylistAction as a manual fallback in the ••• menu.
        const [_defaultPublish, ...rest] = prev
        return [MediaPublishAction, ...rest, AddToPlaylistAction]
      }
      if (ctx.schemaType === 'categoryConfig') {
        // Singleton — block delete and duplicate so it can't be destroyed or duplicated.
        return prev.filter(a => !['delete', 'duplicate'].includes((a as any).action))
      }
      if (ctx.schemaType === 'contract') {
        // Generation is handled by the dedicated Generate tab — no extra actions needed.
        return prev
      }
      if (ctx.schemaType === 'projectSite') {
        return [...prev, AILookupAction]
      }
      return prev
    },
  },
})
