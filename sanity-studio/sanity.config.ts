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
import { AIPartyLookupAction } from './actions/AIPartyLookupAction'
import { MarkAsSignedAction }             from './actions/MarkAsSignedAction'
import { CreatePartyFromContractAction } from './actions/CreatePartyFromContractAction'
import { ImportFromContractAction }      from './actions/ImportFromContractAction'
import { GenerateView }         from './views/GenerateView'
import { ApprovalView }         from './views/ApprovalView'
import { ActivityView }         from './views/ActivityView'
import { InstallationOverview } from './views/InstallationOverview'
import { PartyOverview }        from './views/PartyOverview'
import { LeadOverview }              from './views/LeadOverview'
import { SaleOpportunityOverview }  from './views/SaleOpportunityOverview'
import { dataImportPlugin }     from './plugins/data-import'
import { HowToTool }            from './tools/HowToTool'
import { DashboardTool }        from './tools/DashboardTool'
import { PartyMigrationTool }   from './tools/PartyMigrationTool'
import { accessControlPlugin, accessStore } from './plugins/accessControl'

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

const dashboardPlugin = definePlugin({
  name: 'ops-dashboard',
  tools: [
    {
      name:      'dashboard',
      title:     'Dashboard',
      component: DashboardTool,
    },
    {
      name:      'party-migration',
      title:     'Party Migration',
      component: PartyMigrationTool,
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
    accessControlPlugin(),
    dashboardPlugin(),
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
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'projectSite') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'party') {
          return S.document().views([
            S.view.component(PartyOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'lead') {
          return S.document().views([
            S.view.component(LeadOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'saleOpportunity') {
          return S.document().views([
            S.view.component(SaleOpportunityOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
          ])
        }
        if (schemaType === 'procurement') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ApprovalView).id('approval').title('Approval'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'installation') {
          return S.document().views([
            S.view.component(InstallationOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        if (schemaType === 'project') {
          return S.document().views([
            S.view.component(DocumentOverview).id('overview').title('Overview'),
            S.view.form().id('edit').title('Edit'),
            S.view.component(ActivityView).id('activity').title('Activity'),
          ])
        }
        return S.document().views([
          S.view.component(DocumentOverview).id('overview').title('Overview'),
          S.view.form().id('edit').title('Edit'),
        ])
      },

      structure: (S, context) => {
        const email   = context.currentUser?.email?.toLowerCase() ?? ''
        const isAdmin = context.currentUser?.roles?.some(r => r.name === 'administrator') ?? false

        // `can(id)` — true if this user is allowed to see the section
        const can = (id: string) =>
          isAdmin || !accessStore.loaded || (accessStore.config[email] ?? []).includes(id)

        // Build each section conditionally; filter out falsy entries
        const items = [

          // ── Digital Signage ────────────────────────────────────────────────
          can('project')  && S.documentTypeListItem('project').title('Projects'),
          can('playlist') && S.listItem()
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
          can('media') && S.documentTypeListItem('media').title('Media Library'),

          (can('project') || can('playlist') || can('media')) &&
          (can('offer') || can('provider') || can('categoryConfig') || can('projectSite') || can('contract')) &&
          S.divider(),

          // ── Offers & Providers ─────────────────────────────────────────────
          can('offer')    && S.documentTypeListItem('offer').title('Offers'),
          can('provider') && S.documentTypeListItem('provider').title('Providers'),

          (can('offer') || can('provider')) &&
          (can('categoryConfig') || can('projectSite') || can('contract')) &&
          S.divider(),

          // ── Config ─────────────────────────────────────────────────────────
          can('categoryConfig') && S.listItem()
            .title('Global Category Config')
            .id('categoryConfig-global')
            .child(
              S.document()
                .schemaType('categoryConfig')
                .documentId('categoryConfig-global')
                .title('Global Category Config')
            ),

          (can('categoryConfig')) &&
          (can('projectSite') || can('contract')) &&
          S.divider(),

          // ── Contracts ──────────────────────────────────────────────────────
          can('projectSite')        && S.documentTypeListItem('projectSite').title('Project Sites'),
          can('contractType')       && S.documentTypeListItem('contractType').title('Process Setup'),
          can('contract')           && S.documentTypeListItem('contract').title('Rent Space').child(
            S.documentTypeList('contract').title('Rent Space').defaultOrdering([{ field: 'quotationNumber', direction: 'desc' }])
          ),
          can('installation')       && S.documentTypeListItem('installation').title('Install & Activate'),
          can('procurement')        && S.documentTypeListItem('procurement').title('Procurement'),
          can('payment')            && S.documentTypeListItem('payment').title('Payment'),
          can('asset')              && S.documentTypeListItem('asset').title('Assets'),
          can('contractManagement') && S.documentTypeListItem('contractManagement').title('Contract Management'),

          (can('projectSite') || can('contract') || can('contractManagement')) &&
          (can('approvalPosition') || can('approvalRule') || can('approvalRequest')) &&
          S.divider(),

          // ── CRM ────────────────────────────────────────────────────────────
          (can('projectSite') || can('contract') || can('installation')) &&
          (can('party')) &&
          S.divider(),

          can('party') && S.documentTypeListItem('party').title('Parties'),
          can('lead')            && S.documentTypeListItem('lead').title('Leads'),
          can('saleOpportunity') && S.documentTypeListItem('saleOpportunity').title('Sale Opportunities'),

          (can('party')) &&
          (can('approvalPosition') || can('approvalRule') || can('approvalRequest')) &&
          S.divider(),

          // ── Approval ───────────────────────────────────────────────────────
          can('approvalPosition') && S.documentTypeListItem('approvalPosition').title('Approver Positions'),
          can('approvalRule')     && S.documentTypeListItem('approvalRule').title('Approval Rules'),
          can('approvalRequest')  && S.documentTypeListItem('approvalRequest').title('Approval Requests'),

          // ── Admin only ─────────────────────────────────────────────────────
          isAdmin && S.divider(),
          isAdmin && S.listItem()
            .title('🔐 Studio Access Control')
            .id('studio-access-config')
            .child(
              S.document()
                .schemaType('studioAccess')
                .documentId('studio-access-config')
                .title('Studio Access Control')
            ),

        ].filter(Boolean)

        return S.list().title('Content').items(items as any)
      },
    }),

    dataImportPlugin(),
    howToPlugin(),
    visionTool(),
  ],

  schema: { types: schemaTypes },

  // ── Initial value templates ───────────────────────────────────────────────
  // Used by the Playlist list-item in the structure above so that clicking "+"
  // pre-fills the project reference on the new playlist item.
  templates: (prev: any[]) => [
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
        return [...prev, CreatePartyFromContractAction]
      }
      if (ctx.schemaType === 'projectSite') {
        return [...prev, AILookupAction]
      }
      if (ctx.schemaType === 'party') {
        return [...prev, AIPartyLookupAction, ImportFromContractAction]
      }
      return prev
    },
  },
})
