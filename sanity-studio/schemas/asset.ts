import { defineField, defineType, defineArrayMember } from 'sanity'
import { AssetTypeSelect }      from '../components/AssetTypeSelect'
import { AssetSpecFieldsInput } from '../components/AssetSpecFieldsInput'

/**
 * Asset — a physical device or item owned/managed by the organisation.
 *
 * Created when a Procurement item is accepted at delivery (step 3.2).
 * Tracks location history across Project Sites, warranty, and claims.
 */
export default defineType({
  name:  'asset',
  title: 'Asset',
  type:  'document',

  groups: [
    { name: 'identity',  title: 'Identity & Spec',  default: true },
    { name: 'location',  title: 'Location'                        },
    { name: 'warranty',  title: 'Warranty'                        },
    { name: 'custom',    title: 'Custom Fields'                   },
  ],

  fields: [

    // ── Identity & Spec ───────────────────────────────────────────────────────

    defineField({
      group:       'identity',
      name:        'contractType',
      title:       'Process Setup',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      description: 'Select the Process Setup to load asset types and spec fields.',
    }),

    defineField({
      group:       'identity',
      name:        'assetType',
      title:       'Asset Type',
      type:        'string',
      description: 'The type of this asset — drives which spec fields appear below.',
      components:  { input: AssetTypeSelect },
    }),

    defineField({
      group:       'identity',
      name:        'assetTag',
      title:       'Asset Tag',
      type:        'string',
      description: 'Internal asset identifier (e.g. AST-2026-001). Fill manually or follow your numbering convention.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group: 'identity',
      name:  'brand',
      title: 'Brand',
      type:  'string',
    }),

    defineField({
      group: 'identity',
      name:  'model',
      title: 'Model',
      type:  'string',
    }),

    defineField({
      group: 'identity',
      name:  'serialNumber',
      title: 'Serial Number',
      type:  'string',
    }),

    defineField({
      group:       'identity',
      name:        'sourceProcurement',
      title:       'Source Procurement',
      type:        'reference',
      to:          [{ type: 'procurement' }],
      description: 'The procurement order this asset came from.',
    }),

    defineField({
      group: 'identity',
      name:  'receivedDate',
      title: 'Received Date',
      type:  'date',
    }),

    defineField({
      group:        'identity',
      name:         'status',
      title:        'Status',
      type:         'string',
      initialValue: 'in_storage',
      options: {
        list: [
          { title: '📦 In Storage',      value: 'in_storage'     },
          { title: '✅ Installed',        value: 'installed'      },
          { title: '🔧 Under Repair',    value: 'under_repair'   },
          { title: '⛔ Decommissioned',  value: 'decommissioned' },
          { title: '↩️ Returned',         value: 'returned'       },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    // Dynamic spec fields — driven by the selected Asset Type in Process Setup
    defineField({
      group:       'identity',
      name:        'specFields',
      title:       'Spec Fields',
      type:        'string',
      description: 'Spec fields are defined per asset type in Process Setup → Asset Config.',
      components:  { input: AssetSpecFieldsInput },
    }),

    // ── Location ──────────────────────────────────────────────────────────────

    defineField({
      group:       'location',
      name:        'currentSite',
      title:       'Current Location',
      type:        'reference',
      to:          [{ type: 'projectSite' }],
      description: 'Where this asset is currently deployed. Update when asset is moved.',
    }),

    defineField({
      group:       'location',
      name:        'locationHistory',
      title:       'Location History',
      type:        'array',
      description: 'Record of every site this asset has been installed at.',
      of: [defineArrayMember({
        type:   'object',
        name:   'locationEntry',
        title:  'Location Entry',
        fields: [
          defineField({
            name:  'site',
            title: 'Project Site',
            type:  'reference',
            to:    [{ type: 'projectSite' }],
            validation: Rule => Rule.required(),
          }),
          defineField({ name: 'installedDate', title: 'Installed Date', type: 'date' }),
          defineField({ name: 'removedDate',   title: 'Removed Date',   type: 'date' }),
          defineField({ name: 'notes',         title: 'Notes',          type: 'string' }),
        ],
        preview: {
          select: { title: 'site.projectEn', subtitle: 'installedDate' },
          prepare({ title, subtitle }) {
            return { title: title ?? '(site)', subtitle: subtitle ?? '' }
          },
        },
      })],
    }),

    // ── Warranty ──────────────────────────────────────────────────────────────

    defineField({
      group:   'warranty',
      name:    'warrantyVendor',
      title:   'Warranty Vendor',
      type:    'reference',
      to:      [{ type: 'party' }],
      description: 'The party responsible for warranty service.',
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyStartDate',
      title: 'Warranty Start Date',
      type:  'date',
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyEndDate',
      title: 'Warranty End Date',
      type:  'date',
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyTerms',
      title: 'Warranty Terms',
      type:  'text',
      rows:  3,
    }),

    defineField({
      group: 'warranty',
      name:  'warrantyDoc',
      title: 'Warranty Document',
      type:  'file',
    }),

    defineField({
      group:       'warranty',
      name:        'warrantyClaims',
      title:       'Warranty Claims',
      type:        'array',
      description: 'Log of all warranty claims made for this asset.',
      of: [defineArrayMember({
        type:   'object',
        name:   'warrantyClaim',
        title:  'Warranty Claim',
        fields: [
          defineField({ name: 'claimDate',   title: 'Claim Date',          type: 'date',   validation: Rule => Rule.required() }),
          defineField({ name: 'details',     title: 'Claim Details',       type: 'text',   rows: 3 }),
          defineField({
            name:    'status',
            title:   'Status',
            type:    'string',
            options: {
              list: [
                { title: '🔔 Open',     value: 'open'     },
                { title: '🔧 In Progress', value: 'in_progress' },
                { title: '✅ Resolved', value: 'resolved' },
                { title: '❌ Rejected', value: 'rejected' },
              ],
            },
            initialValue: 'open',
          }),
          defineField({ name: 'resolution', title: 'Resolution Details', type: 'text',   rows: 2 }),
          defineField({ name: 'resolvedDate', title: 'Resolved Date',    type: 'date'  }),
          defineField({ name: 'claimDoc',    title: 'Supporting Document', type: 'file' }),
        ],
        preview: {
          select: { title: 'claimDate', subtitle: 'status' },
          prepare({ title, subtitle }) {
            const labels: Record<string, string> = { open: '🔔 Open', in_progress: '🔧 In Progress', resolved: '✅ Resolved', rejected: '❌ Rejected' }
            return { title: title ?? '', subtitle: labels[subtitle ?? ''] ?? subtitle }
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
        preview: {
          select: { title: 'key', subtitle: 'value' },
        },
      })],
    }),

  ],

  preview: {
    select: {
      assetTag:  'assetTag',
      brand:     'brand',
      model:     'model',
      status:    'status',
      siteName:  'currentSite.projectEn',
    },
    prepare({ assetTag, brand, model, status, siteName }) {
      const statusLabel: Record<string, string> = {
        in_storage:     '📦 In Storage',
        installed:      '✅ Installed',
        under_repair:   '🔧 Under Repair',
        decommissioned: '⛔ Decommissioned',
        returned:       '↩️ Returned',
      }
      return {
        title:    `${assetTag ?? '(no tag)'}  ·  ${[brand, model].filter(Boolean).join(' ')}`,
        subtitle: `${statusLabel[status ?? ''] ?? ''}${siteName ? `  ·  ${siteName}` : ''}`,
      }
    },
  },
})
