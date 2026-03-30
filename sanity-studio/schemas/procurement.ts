import { defineField, defineType, defineArrayMember } from 'sanity'
import { DynamicFieldsInput }         from '../components/DynamicFieldsInput'
import { AssetTypeSelect }            from '../components/AssetTypeSelect'
import { AssetSpecFieldsInput }       from '../components/AssetSpecFieldsInput'
import { AutoProcurementSetupInput }  from '../components/AutoSetupRefInput'

/**
 * Procurement — tracks the full lifecycle of purchasing a physical item.
 *
 * Pipeline:
 *   Created → Processing → Approved → Order Placed → Order Shipped
 *   → Delivered (Accepted | Partial | Rejected)
 *
 * One Procurement can cover multiple units/assets of the same item.
 * Assets are created at step 3.2 (Item Checked) upon acceptance.
 */
export default defineType({
  name:  'procurement',
  title: 'Procurement',
  type:  'document',

  groups: [
    { name: 'spec',     title: '1. Compare & Approve', default: true },
    { name: 'ordering', title: '2. Ordering'                         },
    { name: 'delivery', title: '3. Delivery'                         },
    { name: 'payment',  title: '4. Payment'                          },
    { name: 'dynamic',  title: 'Activity Fields'                     },
    { name: 'custom',   title: 'Custom Fields'                       },
  ],

  fields: [

    // ── Status (top-level, always visible) ────────────────────────────────────

    defineField({
      name:         'procurementStatus',
      title:        'Procurement Status',
      type:         'string',
      initialValue: 'created',
      options: {
        list: [
          { title: '📝 Created',           value: 'created'    },
          { title: '🔄 Processing',        value: 'processing' },
          { title: '✅ Approved',          value: 'approved'   },
          { title: '📦 Order Placed',      value: 'order_placed'   },
          { title: '🚚 Order Shipped',     value: 'order_shipped'  },
          { title: '✅ Delivered — Accepted', value: 'delivered_accepted' },
          { title: '⚠️ Delivered — Partial',  value: 'delivered_partial'  },
          { title: '❌ Delivered — Rejected', value: 'delivered_rejected' },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    // ── 1. Compare & Approve ──────────────────────────────────────────────────

    defineField({
      group:      'spec',
      name:       'contractType',
      title:      'Process Setup',
      type:       'reference',
      to:         [{ type: 'contractType' }],
      components: { input: AutoProcurementSetupInput },
    }),

    defineField({
      group:       'spec',
      name:        'assetType',
      title:       'Asset Type',
      type:        'string',
      description: 'The type of asset being procured — drives spec fields below.',
      components:  { input: AssetTypeSelect },
    }),

    defineField({
      group: 'spec',
      name:  'quantity',
      title: 'Quantity',
      type:  'number',
      validation: Rule => Rule.min(1),
    }),

    defineField({
      group: 'spec',
      name:  'surveyedPrice',
      title: 'Surveyed Price (per unit)',
      type:  'number',
    }),

    defineField({
      group:  'spec',
      name:   'budgetRange',
      title:  'Budget Range',
      type:   'object',
      options: { collapsible: false },
      fields: [
        defineField({ name: 'min', title: 'Min (THB)', type: 'number' }),
        defineField({ name: 'max', title: 'Max (THB)', type: 'number' }),
      ],
    }),

    // Dynamic spec fields — driven by selected Asset Type in Process Setup
    defineField({
      group:       'spec',
      name:        'specFields',
      title:       'Spec Fields',
      type:        'string',
      description: 'Spec fields are defined per asset type in Process Setup → Asset Config.',
      components:  { input: AssetSpecFieldsInput },
    }),

    defineField({
      group: 'spec',
      name:  'vendor',
      title: 'Vendor',
      type:  'reference',
      to:    [{ type: 'party' }],
      description: 'The vendor/supplier this procurement is with.',
    }),

    // Warranty block
    defineField({
      group:  'spec',
      name:   'warrantyOffer',
      title:  'Warranty Offered',
      type:   'boolean',
      initialValue: false,
    }),

    defineField({
      group:  'spec',
      name:   'warrantyPeriod',
      title:  'Warranty Period',
      type:   'string',
      hidden: ({ document }) => !document?.warrantyOffer,
    }),

    defineField({
      group:  'spec',
      name:   'warrantyDetails',
      title:  'Warranty Coverage Details',
      type:   'text',
      rows:   3,
      hidden: ({ document }) => !document?.warrantyOffer,
    }),

    // Approval
    defineField({
      group:        'spec',
      name:         'approvalStatus',
      title:        'Spec Approval Status',
      type:         'string',
      initialValue: 'pending',
      options: {
        list: [
          { title: '⏳ Pending',  value: 'pending'  },
          { title: '✅ Approved', value: 'approved' },
          { title: '❌ Rejected', value: 'rejected' },
        ],
      },
    }),

    defineField({ group: 'spec', name: 'approvedBy',   title: 'Approved By',   type: 'string' }),
    defineField({ group: 'spec', name: 'approvedDate',  title: 'Approved Date', type: 'date'   }),
    defineField({ group: 'spec', name: 'rejectionReason', title: 'Rejection Reason', type: 'text', rows: 2,
      hidden: ({ document }) => (document?.approvalStatus as string) !== 'rejected',
    }),

    // ── 2. Ordering ───────────────────────────────────────────────────────────

    defineField({ group: 'ordering', name: 'purchaseOrderRef',    title: 'Purchase Order Number', type: 'string' }),
    defineField({ group: 'ordering', name: 'orderPlacedDate',     title: 'Order Placed Date',     type: 'date'   }),
    defineField({ group: 'ordering', name: 'orderShippedDate',    title: 'Order Shipped Date',    type: 'date'   }),
    defineField({ group: 'ordering', name: 'trackingNumber',      title: 'Tracking Number',       type: 'string' }),
    defineField({ group: 'ordering', name: 'estimatedDelivery',   title: 'Estimated Delivery',    type: 'date'   }),
    defineField({ group: 'ordering', name: 'orderNotes',          title: 'Order Notes',           type: 'text', rows: 2 }),

    // ── 3. Delivery ───────────────────────────────────────────────────────────

    defineField({ group: 'delivery', name: 'receivedDate', title: 'Received Date', type: 'date' }),

    defineField({
      group:   'delivery',
      name:    'receivedStatus',
      title:   'Received Status',
      type:    'string',
      options: {
        list: [
          { title: '✅ Accepted',          value: 'accepted' },
          { title: '⚠️ Partial',            value: 'partial'  },
          { title: '❌ Rejected / Returned', value: 'rejected' },
        ],
      },
    }),

    defineField({ group: 'delivery', name: 'receivedQty',   title: 'Quantity Received',  type: 'number' }),
    defineField({ group: 'delivery', name: 'remainingQty',  title: 'Quantity Remaining', type: 'number',
      description: 'Outstanding units not yet received. Update manually if delivery is partial.',
    }),

    defineField({ group: 'delivery', name: 'deliveryRejectionReason', title: 'Rejection / Return Reason', type: 'text', rows: 2,
      hidden: ({ document }) => (document?.receivedStatus as string) === 'accepted',
    }),

    // Assets created from this procurement (linked after acceptance)
    defineField({
      group:       'delivery',
      name:        'assets',
      title:       'Assets Created',
      type:        'array',
      description: 'Link Asset records created from accepted items in this delivery.',
      of:          [defineArrayMember({ type: 'reference', to: [{ type: 'asset' }] })],
    }),

    defineField({ group: 'delivery', name: 'deliveryNotes', title: 'Delivery Notes', type: 'text', rows: 2 }),

    // ── 4. Payment ────────────────────────────────────────────────────────────

    defineField({
      group:       'payment',
      name:        'payments',
      title:       'Linked Payments',
      type:        'array',
      description: 'Payment documents covering this procurement.',
      of:          [defineArrayMember({ type: 'reference', to: [{ type: 'payment' }] })],
    }),

    defineField({
      group:        'payment',
      name:         'paymentStatus',
      title:        'Payment Status',
      type:         'string',
      initialValue: 'unpaid',
      description:  'Update manually or derive from linked Payment documents.',
      options: {
        list: [
          { title: '❌ Unpaid',  value: 'unpaid'  },
          { title: '⚠️ Partial', value: 'partial' },
          { title: '✅ Paid',    value: 'paid'    },
        ],
      },
    }),

    // ── Activity Dynamic Fields (from Process Setup) ──────────────────────────

    defineField({
      group:       'dynamic',
      name:        'dynamicFields',
      title:       'Activity Dynamic Fields',
      type:        'string',
      description: 'Fields defined by the selected Process Setup.',
      components:  { input: DynamicFieldsInput },
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
      assetType: 'assetType',
      status:    'procurementStatus',
      vendor:    'vendor.legalName_en',
    },
    prepare({ assetType, status, vendor }: { assetType?: string; status?: string; vendor?: string }) {
      const statusLabel: Record<string, string> = {
        created:              '📝 Created',
        processing:           '🔄 Processing',
        approved:             '✅ Approved',
        order_placed:         '📦 Order Placed',
        order_shipped:        '🚚 Shipped',
        delivered_accepted:   '✅ Delivered',
        delivered_partial:    '⚠️ Partial Delivery',
        delivered_rejected:   '❌ Rejected',
      }
      return {
        title:    assetType ?? '(Untitled)',
        subtitle: `${statusLabel[status ?? ''] ?? ''}${vendor ? `  ·  ${vendor}` : ''}`,
      }
    },
  },
})
