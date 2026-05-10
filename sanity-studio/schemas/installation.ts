import { defineField, defineType, defineArrayMember } from 'sanity'
import { AutoInstallStatusInput }    from '../components/AutoInstallStatusInput'
import { SetupManualPanel }          from '../components/SetupManualPanel'
import { ProjectCostPanel }          from '../components/ProjectCostPanel'
import { AppEntryInput }             from '../components/AppEntryInput'
import { LockableStringInput }       from '../components/LockableStringInput'
import { LinkedAppsDisplay }         from '../components/LinkedAppsDisplay'
import { AutoAppCostInput }          from '../components/AutoAppCostInput'
import { createAutoExpenseCostInput }   from '../components/AutoExpenseCostInput'
import { createAutoExpenseVendorDisplay } from '../components/AutoExpenseVendorDisplay'
import { RepoListDisplay }           from '../components/RepoListDisplay'
import { SiteListDisplay }           from '../components/SiteListDisplay'
import { PlayerListDisplay }         from '../components/PlayerListDisplay'
import { SetupChecklistInput }       from '../components/SetupChecklistInput'

const SetupExpenseCostInput        = createAutoExpenseCostInput('setup')
const ElectricalExpenseCostInput   = createAutoExpenseCostInput('electrical')
const WifiExpenseCostInput         = createAutoExpenseCostInput('wifi')
const ActivationExpenseCostInput   = createAutoExpenseCostInput('activation')
const ElectricalVendorDisplay      = createAutoExpenseVendorDisplay('electrical')
const WifiVendorDisplay            = createAutoExpenseVendorDisplay('wifi')

/**
 * Install & Activate — tracks the physical installation and activation of an asset.
 *
 * Requires an Asset to exist first (created from Procurement step 3.2).
 * Standalone from Procurement — can be initiated any time after the asset is in storage.
 *
 * Pipeline:
 *   Item Setup → Electricity Installed → Wifi Installed → App Installed → Live
 */
export default defineType({
  name:  'installation',
  title: 'Install & Activate',
  type:  'document',

  groups: [
    { name: 'overview',    title: 'Overview',              default: true },
    { name: 'setup',       title: '5.1 Item Setup'                       },
    { name: 'electrical',  title: '5.2 Electrical & Wiring'              },
    { name: 'wifi',        title: '5.3 Wifi & Router'                    },
    { name: 'apps',        title: '5.4 App Installed'                    },
    { name: 'activation',  title: '5.5 Activate & Test'                  },
    { name: 'cost',        title: 'Project Cost'                         },
    { name: 'custom',      title: 'Custom Fields'                        },
  ],

  fields: [

    // ── Overview ──────────────────────────────────────────────────────────────

    defineField({
      group:       'overview',
      name:        'projectSite',
      title:       'Project Site',
      type:        'reference',
      to:          [{ type: 'projectSite' }],
      description: 'The site where this asset is being installed.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'overview',
      name:        'asset',
      title:       'Asset',
      type:        'reference',
      to:          [{ type: 'asset' }],
      description: 'The asset being installed. Asset must exist before starting installation.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'overview',
      name:        'setupManual',
      title:       'Setup Manual',
      type:        'string',
      readOnly:    true,
      components:  { input: SetupManualPanel },
    }),

    defineField({
      group:        'overview',
      name:         'installationStatus',
      title:        'Installation Status',
      type:         'string',
      initialValue: 'item_setup',
      components:   { input: AutoInstallStatusInput },
    }),

    defineField({
      group: 'overview',
      name:  'notes',
      title: 'General Notes',
      type:  'text',
      rows:  3,
    }),

    // ── 5.1 Item Setup ────────────────────────────────────────────────────────

    defineField({ group: 'setup', name: 'setupDate', title: 'Setup Date', type: 'date' }),

    defineField({
      group:       'setup',
      name:        'setupBy',
      title:       'Setup By',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'The party or technician who performed the setup.',
    }),



    defineField({ group: 'setup', name: 'setupCost', title: 'Total Cost (THB)', type: 'number',
      description: 'Auto-summed from linked Direct Expense payments for this site (Device Setup cost group). Edit manually to override.',
      components:  { input: SetupExpenseCostInput },
    }),

    defineField({ group: 'setup', name: 'setupNotes', title: 'Setup Notes', type: 'text', rows: 2 }),

    defineField({
      group:       'setup',
      name:        'setupChecklist',
      title:       'Setup Checklist',
      type:        'array',
      description: 'Track installation progress step by step. Click "Initialize with default tasks" to get started.',
      of: [defineArrayMember({
        type:   'object',
        name:   'checklistItem',
        fields: [
          defineField({ name: 'phase', title: 'Phase', type: 'string' }),
          defineField({ name: 'task',  title: 'Task',  type: 'string' }),
          defineField({ name: 'done',  title: 'Done',  type: 'boolean', initialValue: false }),
          defineField({ name: 'notes', title: 'Notes', type: 'string' }),
        ],
        preview: {
          select: { title: 'task', subtitle: 'done' },
          prepare({ title, subtitle }) {
            return { title: subtitle ? `✅ ${title}` : title, subtitle: '' }
          },
        },
      })],
      components: { input: SetupChecklistInput },
    }),

    // ── 5.2 Electrical & Wiring ───────────────────────────────────────────────

    defineField({
      group:       'electrical',
      name:        'electricalVendor',
      title:       'Electrical Vendor',
      type:        'string',
      readOnly:    true,
      description: 'Auto-retrieved from Direct Expense payments for this site.',
      components:  { input: ElectricalVendorDisplay },
    }),

    // Dynamic accessories list
    defineField({
      group:       'electrical',
      name:        'accessories',
      title:       'Accessories Used',
      type:        'array',
      description: 'Add accessories installed (e.g. Electricity meter, Plugs, Router, Cable tray).',
      of: [defineArrayMember({
        type:   'object',
        name:   'accessory',
        title:  'Accessory',
        fields: [
          defineField({ name: 'item',  title: 'Item',     type: 'string', validation: Rule => Rule.required() }),
          defineField({ name: 'qty',   title: 'Qty',      type: 'number' }),
          defineField({ name: 'notes', title: 'Notes',    type: 'string' }),
        ],
        preview: {
          select: { title: 'item', subtitle: 'qty' },
          prepare({ title, subtitle }) {
            return { title: title ?? '', subtitle: subtitle ? `Qty: ${subtitle}` : '' }
          },
        },
      })],
    }),

    defineField({ group: 'electrical', name: 'electricalCost',  title: 'Total Cost (THB)', type: 'number',
      description: 'Auto-summed from linked Direct Expense payments for this site (Electrical cost group). Edit manually to override.',
      components:  { input: ElectricalExpenseCostInput },
    }),

    defineField({
      group:        'electrical',
      name:         'electricalWarrantyOffer',
      title:        'Warranty Offered',
      type:         'boolean',
      initialValue: false,
    }),

    defineField({ group: 'electrical', name: 'electricalWarrantyPeriod',  title: 'Warranty Period',   type: 'string',
      hidden: ({ document }) => !(document?.electricalWarrantyOffer as boolean),
    }),

    defineField({ group: 'electrical', name: 'electricalWarrantyDetails', title: 'Warranty Coverage', type: 'text', rows: 2,
      hidden: ({ document }) => !(document?.electricalWarrantyOffer as boolean),
    }),


    // ── 5.3 Wifi & Router ─────────────────────────────────────────────────────

    defineField({
      group:       'wifi',
      name:        'wifiVendor',
      title:       'Wifi Vendor / ISP',
      type:        'string',
      readOnly:    true,
      description: 'Auto-retrieved from Direct Expense payments for this site.',
      components:  { input: WifiVendorDisplay },
    }),

    defineField({
      group:   'wifi',
      name:    'wifiType',
      title:   'Wifi Type',
      type:    'string',
      options: {
        list: [
          { title: '📶 Broadband',  value: 'broadband' },
          { title: '📡 SIM Card',   value: 'sim'       },
          { title: '🔌 LAN / Wired', value: 'lan'      },
        ],
      },
    }),

    defineField({ group: 'wifi', name: 'wifiName',     title: 'Wifi Name (SSID)', type: 'string' }),
    defineField({ group: 'wifi', name: 'wifiPassword', title: 'Wifi Password',    type: 'string' }),
    defineField({ group: 'wifi', name: 'wifiPackage',  title: 'Wifi Package',     type: 'string',
      description: 'Package name or speed tier (e.g. "100/100 Mbps Fiber").',
    }),

    defineField({ group: 'wifi', name: 'wifiCost',  title: 'Total Cost (THB)', type: 'number',
      description: 'Auto-summed from linked Direct Expense payments for this site (Wifi cost group). Edit manually to override.',
      components:  { input: WifiExpenseCostInput },
    }),


    // ── 5.4 App Installed ─────────────────────────────────────────────────────

    // Dynamic app list
    defineField({
      group:       'apps',
      name:        'installedApps',
      title:       'Installed Apps',
      type:        'array',
      description: 'List all apps installed on this device.',
      of: [defineArrayMember({
        type:       'object',
        name:       'appEntry',
        title:      'App',
        components: { input: AppEntryInput },
        fields: [
          defineField({
            name:        'licenseAsset',
            title:       'App License Asset',
            type:        'reference',
            to:          [{ type: 'asset' }],
            options:     { filter: 'assetType == "appLicense"' },
            description: 'Shows App License assets only.',
          }),
          defineField({
            name:        'appName',
            title:       'App Name',
            type:        'string',
            description: 'Auto-filled from Asset Brand. Click ✏️ to override.',
            components:  { input: LockableStringInput },
          }),
          defineField({ name: 'version', title: 'Version', type: 'string' }),
          defineField({
            name:        'licenseKey',
            title:       'License Key',
            type:        'string',
            description: 'Auto-filled from Asset Serial Number / License Key. Click ✏️ to override.',
            components:  { input: LockableStringInput },
          }),
          defineField({ name: 'notes',      title: 'Notes',       type: 'string' }),
        ],
        preview: {
          select: {
            appName:   'appName',
            assetTag:  'licenseAsset.assetTag',
            brand:     'licenseAsset.brand',
            model:     'licenseAsset.model',
            version:   'version',
          },
          prepare({ appName, assetTag, brand, model, version }) {
            const name = appName || [brand, model].filter(Boolean).join(' ') || assetTag || '(unnamed)'
            return {
              title:    name,
              subtitle: [assetTag ? `📦 ${assetTag}` : null, version ? `v${version}` : null].filter(Boolean).join('  ·  '),
            }
          },
        },
      })],
    }),

    defineField({
      group:      'apps',
      name:       'linkedAppsInfo',
      title:      'App Details',
      type:       'string',
      readOnly:   true,
      components: { input: LinkedAppsDisplay },
    }),

    defineField({
      group:       'apps',
      name:        'appCost',
      title:       'Total App Cost (THB)',
      type:        'number',
      description: 'Auto-summed from linked app asset unit costs.',
      components:  { input: AutoAppCostInput },
    }),

    defineField({ group: 'apps', name: 'appNotes', title: 'App Notes', type: 'text', rows: 2 }),

    // ── 5.5 Activate & Test ───────────────────────────────────────────────────

    // ── Repo Setup ────────────────────────────────────────────────────────────

    defineField({
      group:  'activation',
      name:   'repoSetup',
      title:  'Repo Setup',
      type:   'object',
      fields: [
        defineField({
          name:        'provider',
          title:       'Provider',
          type:        'string',
          description: 'The platform where the code is stored (e.g. GitHub). If you change provider in the future, update this field.',
          options: { list: [
            { title: 'GitHub',     value: 'github'     },
            { title: 'GitLab',     value: 'gitlab'     },
            { title: 'Bitbucket',  value: 'bitbucket'  },
            { title: 'Other',      value: 'other'      },
          ]},
        }),
        defineField({
          name:        'organization',
          title:       'Organization / Account',
          type:        'string',
          description: 'The GitHub organization or account name that owns the repos (e.g. aquamx-biz).',
        }),
        defineField({
          name:        'repos',
          title:       'Repositories',
          type:        'array',
          description: 'Each project has its own repository. Add one entry per project.',
          of: [defineArrayMember({
            type:   'object',
            name:   'repo',
            title:  'Repo',
            fields: [
              defineField({ name: 'name',  title: 'Repo Name', type: 'string', description: 'Short name of the repo. Examples: noble-be19 · lumpini-24 · noble-geo · mahogany-tower · the-room-skv21' }),
              defineField({ name: 'url',   title: 'URL',       type: 'url',    description: 'Full URL to the repo. Examples: https://github.com/aquamx-biz/noble-be19 · https://github.com/aquamx-biz/lumpini-24' }),
              defineField({ name: 'notes', title: 'Notes',     type: 'string', description: 'Optional — any extra info about this repo.' }),
            ],
            preview: { select: { title: 'name', subtitle: 'url' } },
          })],
        }),
        defineField({
          name:       'reposDisplay',
          title:      'Repositories Overview',
          type:       'string',
          readOnly:   true,
          components: { input: RepoListDisplay },
        }),
      ],
    }),

    // ── Hosting Setup ─────────────────────────────────────────────────────────

    defineField({
      group:  'activation',
      name:   'hostingSetup',
      title:  'Hosting Setup',
      type:   'object',
      fields: [
        defineField({
          name:        'provider',
          title:       'Provider',
          type:        'string',
          description: 'The platform that hosts and serves the live site (e.g. Netlify). Each project site is connected to a repo and auto-deploys on push.',
          options: { list: [
            { title: 'Netlify',  value: 'netlify'  },
            { title: 'Vercel',   value: 'vercel'   },
            { title: 'Other',    value: 'other'    },
          ]},
        }),
        defineField({
          name:        'sites',
          title:       'Sites',
          type:        'array',
          description: 'Each project has its own hosted site. Add one entry per project.',
          of: [defineArrayMember({
            type:   'object',
            name:   'site',
            title:  'Site',
            fields: [
              defineField({ name: 'name',   title: 'Site Name',   type: 'string', description: 'Display name for this site (e.g. Noble BE19).'                                         }),
              defineField({ name: 'url',    title: 'Site URL',    type: 'url',    description: 'The live URL where the kiosk is served. Examples: https://noble-be19.netlify.app · https://lumpini-24.netlify.app · https://the-room-skv21.netlify.app' }),
              defineField({ name: 'repo',   title: 'Linked Repo', type: 'string', description: 'The repo name this site deploys from. Examples: noble-be19 · lumpini-24 · noble-geo · mahogany-tower · the-room-skv21' }),
              defineField({ name: 'branch', title: 'Branch',      type: 'string', description: 'The git branch Netlify watches for new deploys. Default is master.', initialValue: 'master' }),
              defineField({ name: 'notes', title: 'Notes',       type: 'string', description: 'Optional — any extra info about this site.' }),
            ],
            preview: { select: { title: 'name', subtitle: 'url' } },
          })],
        }),
        defineField({
          name:       'sitesDisplay',
          title:      'Sites Overview',
          type:       'string',
          readOnly:   true,
          components: { input: SiteListDisplay },
        }),
      ],
    }),

    // ── Player Setup ─────────────────────────────────────────────────────────

    defineField({
      group:  'activation',
      name:   'playerSetup',
      title:  'Player Setup',
      type:   'object',
      fields: [
        defineField({
          name:        'provider',
          title:       'Provider',
          type:        'string',
          description: 'The digital signage platform managing the player devices and schedules.',
          options: { list: [
            { title: 'Yodeck',     value: 'yodeck'     },
            { title: 'BrightSign', value: 'brightsign' },
            { title: 'Screenly',   value: 'screenly'   },
            { title: 'Other',      value: 'other'      },
          ]},
        }),
        defineField({
          name:        'workspaceAccount',
          title:       'Workspace / Account',
          type:        'string',
          description: 'The account or workspace name on the provider platform (e.g. aquamx).',
        }),
        defineField({
          name:        'players',
          title:       'Players',
          type:        'array',
          description: 'Add one entry per physical screen / player device.',
          of: [defineArrayMember({
            type:   'object',
            name:   'player',
            title:  'Player',
            fields: [
              defineField({
                name:        'playerName',
                title:       'Player Name',
                type:        'string',
                description: 'Friendly name for this screen (e.g. Lobby Screen, Elevator 1).',
              }),
              defineField({
                name:        'playerId',
                title:       'Player ID',
                type:        'string',
                description: 'The device ID assigned by the provider dashboard (e.g. YD-00123).',
              }),
              defineField({
                name:        'appType',
                title:       'App Type',
                type:        'string',
                description: 'The type of content the player loads.',
                options: { list: [
                  { title: '🌐 Web App',      value: 'web_app' },
                  { title: '🧩 Widget',        value: 'widget'  },
                  { title: '▶ Video Player',  value: 'video'   },
                  { title: '📄 HTML5',        value: 'html5'   },
                  { title: 'Other',           value: 'other'   },
                ]},
                initialValue: 'web_app',
              }),
              defineField({
                name:        'appUrl',
                title:       'App URL',
                type:        'url',
                description: 'The URL the player loads (your Netlify site URL, e.g. https://noble-be19.netlify.app).',
              }),
              defineField({
                name:        'schedule',
                title:       'Schedule',
                type:        'string',
                description: 'When this player is active (e.g. Daily 07:00–22:00).',
              }),
              defineField({
                name:        'notes',
                title:       'Notes',
                type:        'string',
                description: 'Optional — any extra info about this player.',
              }),
            ],
            preview: {
              select: {
                playerName: 'playerName',
                playerId:   'playerId',
                appType:    'appType',
              },
              prepare({ playerName, playerId, appType }) {
                const typeLabel: Record<string, string> = {
                  web_app: '🌐', widget: '🧩', video: '▶', html5: '📄', other: '—',
                }
                return {
                  title:    playerName || playerId || '(unnamed player)',
                  subtitle: [typeLabel[appType] ?? '', playerId].filter(Boolean).join('  '),
                }
              },
            },
          })],
        }),
        defineField({
          name:       'playersDisplay',
          title:      'Players Overview',
          type:       'string',
          readOnly:   true,
          components: { input: PlayerListDisplay },
        }),
        defineField({
          name:        'playerNotes',
          title:       'Player Notes',
          type:        'text',
          rows:        3,
          description: 'General notes about the player setup — login credentials location, dashboard URL, support contacts, etc.',
        }),
      ],
    }),

    // ── Deploy Setup ──────────────────────────────────────────────────────────

    defineField({
      group:  'activation',
      name:   'deploySetup',
      title:  'Deploy Setup',
      type:   'object',
      fields: [
        defineField({
          name:        'deployCommand',
          title:       'Deploy Command',
          type:        'string',
          description: 'The command staff run to deploy. Click ✏️ to edit.',
          components:  { input: LockableStringInput },
        }),
        defineField({ name: 'deployNotes', title: 'Deploy Notes', type: 'text', rows: 4,
          description: 'Step-by-step instructions for staff on how and when to run the deploy command.',
        }),
      ],
    }),

    defineField({ group: 'activation', name: 'activatedDate', title: 'Activation Date', type: 'date' }),

    defineField({
      group:   'activation',
      name:    'testResult',
      title:   'Test Result',
      type:    'string',
      options: {
        list: [
          { title: '✅ Pass', value: 'pass' },
          { title: '❌ Fail', value: 'fail' },
          { title: '⚠️ Partial', value: 'partial' },
        ],
      },
    }),

    defineField({ group: 'activation', name: 'activationCost', title: 'Total Cost (THB)', type: 'number',
      description: 'Auto-summed from linked Direct Expense payments for this site (Activation cost group). Edit manually to override.',
      components:  { input: ActivationExpenseCostInput },
    }),

    defineField({ group: 'activation', name: 'testNotes',  title: 'Test Notes',  type: 'text', rows: 3 }),
    defineField({ group: 'activation', name: 'liveDate',   title: 'Go-Live Date', type: 'date' }),

    // ── Project Cost ──────────────────────────────────────────────────────────

    defineField({
      group:    'cost',
      name:     'costSummary',
      title:    'Cost Summary',
      type:     'string',
      readOnly: true,
      components: { input: ProjectCostPanel },
    }),

    defineField({
      group:       'cost',
      name:        'costItems',
      title:       'Additional Cost Items',
      type:        'array',
      description: 'Add labor, app/software, delivery, or other costs. Device and electrical costs are pulled automatically.',
      of: [defineArrayMember({
        type:   'object',
        name:   'costItem',
        title:  'Cost Item',
        fields: [
          defineField({
            name:    'category',
            title:   'Category',
            type:    'string',
            validation: Rule => Rule.required(),
            options: {
              list: [
                { title: '💻 App / Software',       value: 'app_software'       },
                { title: '🔧 Installation Labor',   value: 'installation_labor' },
                { title: '🚚 Delivery',              value: 'delivery'           },
                { title: '📅 Monthly Fee',           value: 'monthly_fee'        },
                { title: '📦 Other',                 value: 'other'              },
              ],
            },
          }),
          defineField({ name: 'label',  title: 'Description', type: 'string' }),
          defineField({ name: 'amount', title: 'Amount (THB)', type: 'number', validation: Rule => Rule.min(0) }),
        ],
        preview: {
          select: { title: 'label', subtitle: 'category', amount: 'amount' },
          prepare({ title, subtitle, amount }) {
            const cats: Record<string, string> = {
              app_software: '💻', installation_labor: '🔧',
              delivery: '🚚', monthly_fee: '📅', other: '📦',
            }
            return {
              title:    `${cats[subtitle] ?? ''}  ${title ?? subtitle ?? ''}`.trim(),
              subtitle: amount != null ? `${Number(amount).toLocaleString()} THB` : '',
            }
          },
        },
      })],
    }),

    // ── Custom Fields ─────────────────────────────────────────────────────────

    defineField({
      group:       'custom',
      name:        'customFields',
      title:       'Custom Fields',
      type:        'array',
      description: 'Add any additional fields not covered above.',
      of: [defineArrayMember({
        type:   'object',
        name:   'customField',
        title:  'Field',
        fields: [
          defineField({ name: 'key',   title: 'Field Name',  type: 'string', validation: Rule => Rule.required() }),
          defineField({ name: 'value', title: 'Field Value', type: 'string' }),
        ],
        preview: { select: { title: 'key', subtitle: 'value' } },
      })],
    }),

  ],

  preview: {
    select: {
      assetTag:  'asset.assetTag',
      brand:     'asset.brand',
      model:     'asset.model',
      siteName:  'projectSite.projectEn',
      status:    'installationStatus',
    },
    prepare({ assetTag, brand, model, siteName, status }) {
      const statusLabel: Record<string, string> = {
        item_setup:            '📦 Item Setup',
        electricity_installed: '⚡ Electricity Installed',
        wifi_installed:        '📶 Wifi Installed',
        app_installed:         '📱 App Installed',
        live:                  '✅ Live',
      }
      return {
        title:    `${siteName ?? '(no project)'}  ·  ${[brand, model].filter(Boolean).join(' ') || assetTag || ''}`.replace(/\s·\s$/, ''),
        subtitle: `${statusLabel[status ?? ''] ?? ''}${assetTag ? `  ·  ${assetTag}` : ''}`,
      }
    },
  },
})
