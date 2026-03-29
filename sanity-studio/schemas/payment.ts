import { defineField, defineType, defineArrayMember } from 'sanity'
import { DynamicFieldsInput } from '../components/DynamicFieldsInput'

/**
 * Payment — tracks a payment against one or more Procurement documents.
 *
 * Pipeline:
 *   Created → Submitted → Approved (or Rejected → Created)
 *   → Condition Met → Processing → Paid → Receipt Collected
 *
 * Multiple Procurements can be covered by one Payment, but they must share the same vendor.
 */
export default defineType({
  name:  'payment',
  title: 'Payment',
  type:  'document',

  groups: [
    { name: 'setup',     title: '1. Setup',     default: true },
    { name: 'execution', title: '2. Execution'               },
    { name: 'dynamic',   title: 'Activity Fields'             },
    { name: 'custom',    title: 'Custom Fields'               },
  ],

  fields: [

    // ── Status (top-level, always visible) ────────────────────────────────────

    defineField({
      name:         'paymentStatus',
      title:        'Payment Status',
      type:         'string',
      initialValue: 'created',
      options: {
        list: [
          { title: '📝 Created',              value: 'created'          },
          { title: '📤 Submitted',            value: 'submitted'        },
          { title: '✅ Approved',             value: 'approved'         },
          { title: '❌ Rejected',             value: 'rejected'         },
          { title: '🔍 Condition Met',        value: 'condition_met'    },
          { title: '🔄 Processing',           value: 'processing'       },
          { title: '💳 Paid',                 value: 'paid'             },
          { title: '🧾 Receipt Collected',    value: 'complete'         },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),

    // ── 1. Setup ──────────────────────────────────────────────────────────────

    defineField({
      group:        'setup',
      name:         'procurementStatus',
      title:        'Procurement Status',
      type:         'string',
      description:  'Overall delivery status of the linked Procurement(s). Update manually or sync from Procurement.',
      initialValue: 'created',
      options: {
        list: [
          { title: '📝 Created',                  value: 'created'            },
          { title: '🔄 Processing',               value: 'processing'         },
          { title: '✅ Approved',                 value: 'approved'           },
          { title: '📦 Order Placed',             value: 'order_placed'       },
          { title: '🚚 Order Shipped',            value: 'order_shipped'      },
          { title: '✅ Delivered — Accepted',     value: 'delivered_accepted' },
          { title: '⚠️ Delivered — Partial',      value: 'delivered_partial'  },
          { title: '❌ Delivered — Rejected',     value: 'delivered_rejected' },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:       'setup',
      name:        'procurements',
      title:       'Procurements',
      type:        'array',
      description: 'Link one or more Procurement documents covered by this payment. Must be the same vendor.',
      of:          [defineArrayMember({ type: 'reference', to: [{ type: 'procurement' }] })],
    }),

    defineField({
      group:       'setup',
      name:        'vendor',
      title:       'Vendor',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'Auto-fill from the linked Procurement, or select manually.',
    }),

    defineField({
      group: 'setup',
      name:  'paymentAmount',
      title: 'Payment Amount',
      type:  'number',
      description: 'Total amount to be paid. Auto-calculate from Procurements or enter manually.',
    }),

    defineField({
      group:        'setup',
      name:         'currency',
      title:        'Currency',
      type:         'string',
      initialValue: 'THB',
      options: {
        list: [
          { title: 'THB — Thai Baht',       value: 'THB' },
          { title: 'USD — US Dollar',       value: 'USD' },
          { title: 'EUR — Euro',            value: 'EUR' },
          { title: 'JPY — Japanese Yen',    value: 'JPY' },
          { title: 'CNY — Chinese Yuan',    value: 'CNY' },
          { title: 'SGD — Singapore Dollar', value: 'SGD' },
          { title: 'Other',                 value: 'other' },
        ],
      },
    }),

    defineField({
      group:       'setup',
      name:        'exchangeRate',
      title:       'Exchange Rate (to THB)',
      type:        'number',
      description: 'Only required if currency is not THB.',
      hidden:      ({ document }) => (document?.currency as string) === 'THB',
    }),

    defineField({
      group:   'setup',
      name:    'paymentType',
      title:   'Payment Type',
      type:    'string',
      options: {
        list: [
          { title: '🏦 Bank Transfer',       value: 'transfer' },
          { title: '📄 Cheque',              value: 'cheque'   },
          { title: '💵 Cash',               value: 'cash'     },
          { title: '🌐 International SWIFT', value: 'swift'    },
        ],
      },
    }),

    defineField({
      group:   'setup',
      name:    'paymentCondition',
      title:   'Payment Condition',
      type:    'string',
      options: {
        list: [
          { title: 'Upon Order Placed',    value: 'order_placed'    },
          { title: 'Upon Item Shipped',    value: 'item_shipped'    },
          { title: 'Upon Item Delivered',  value: 'item_delivered'  },
          { title: 'Upon Request',         value: 'upon_request'    },
          { title: 'Upon Acceptance',      value: 'upon_acceptance' },
          { title: 'Other',               value: 'other'           },
        ],
      },
    }),

    defineField({
      group:   'setup',
      name:    'withholdingTaxRate',
      title:   'Withholding Tax Rate',
      type:    'string',
      options: {
        list: [
          { title: 'None',           value: 'none'   },
          { title: '0%',             value: '0'      },
          { title: '3%',             value: '3'      },
          { title: '5%',             value: '5'      },
          { title: '10%',            value: '10'     },
          { title: 'Specify Amount', value: 'custom' },
        ],
      },
      initialValue: 'none',
    }),

    defineField({
      group:  'setup',
      name:   'withholdingTaxCustom',
      title:  'Withholding Tax Amount (manual)',
      type:   'number',
      hidden: ({ document }) => (document?.withholdingTaxRate as string) !== 'custom',
    }),

    defineField({
      group: 'setup',
      name:  'dueDate',
      title: 'Payment Due Date',
      type:  'date',
    }),

    defineField({ group: 'setup', name: 'submittedBy',   title: 'Submitted By',   type: 'string' }),
    defineField({ group: 'setup', name: 'submittedDate', title: 'Submitted Date', type: 'date'   }),

    defineField({
      group:        'setup',
      name:         'approvalResult',
      title:        'Approval Result',
      type:         'string',
      options: {
        list: [
          { title: '⏳ Pending',  value: 'pending'  },
          { title: '✅ Approved', value: 'approved' },
          { title: '❌ Rejected', value: 'rejected' },
        ],
      },
      initialValue: 'pending',
    }),

    defineField({ group: 'setup', name: 'approvedBy',        title: 'Approved By',        type: 'string' }),
    defineField({ group: 'setup', name: 'approvedDate',       title: 'Approved Date',      type: 'date'   }),
    defineField({ group: 'setup', name: 'approvalRejectionReason', title: 'Rejection Reason', type: 'text', rows: 2,
      hidden: ({ document }) => (document?.approvalResult as string) !== 'rejected',
    }),

    // ── 2. Execution ──────────────────────────────────────────────────────────

    defineField({
      group:        'execution',
      name:         'conditionMet',
      title:        'Condition Met',
      type:         'boolean',
      initialValue: false,
      description:  'Check manually, or auto-derived from linked Procurement status.',
    }),

    defineField({ group: 'execution', name: 'conditionMetDate',  title: 'Condition Met Date',  type: 'date'   }),
    defineField({ group: 'execution', name: 'conditionMetNotes', title: 'Condition Met Notes', type: 'string' }),

    defineField({
      group:       'execution',
      name:        'bankAccount',
      title:       'Bank Account Used',
      type:        'string',
      description: 'Reference the vendor\'s bank account from the Party record (e.g. "SCB — 123-456-789").',
    }),

    defineField({ group: 'execution', name: 'paymentDate',   title: 'Payment Date',   type: 'date'   }),
    defineField({ group: 'execution', name: 'paidAmount',    title: 'Paid Amount',    type: 'number' }),
    defineField({ group: 'execution', name: 'whtAmount',     title: 'W/H Tax Amount', type: 'number' }),

    defineField({
      group:   'execution',
      name:    'vatType',
      title:   'VAT Type',
      type:    'string',
      options: {
        list: [
          { title: 'Inclusive (VAT included in price)',  value: 'inclusive' },
          { title: 'Exclusive (VAT added on top)',       value: 'exclusive' },
          { title: '0% VAT',                            value: 'zero'      },
          { title: 'No VAT',                            value: 'none'      },
        ],
      },
    }),

    defineField({ group: 'execution', name: 'vatAmount', title: 'VAT Amount', type: 'number',
      hidden: ({ document }) => ['none', 'zero'].includes(document?.vatType as string),
    }),

    defineField({
      group:       'execution',
      name:        'paymentMethodDetails',
      title:       'Payment Method Details',
      type:        'string',
      description: 'e.g. Cheque number, bank transfer reference number.',
    }),

    // W/H Tax documents (array — multiple docs supported)
    defineField({
      group:       'execution',
      name:        'whtDocs',
      title:       'Withholding Tax Documents',
      type:        'array',
      description: 'Upload one or more withholding tax certificate files.',
      of: [defineArrayMember({
        type:   'object',
        name:   'whtDoc',
        fields: [
          defineField({ name: 'doc',       title: 'Document',   type: 'file' }),
          defineField({ name: 'issueDate', title: 'Issue Date', type: 'date' }),
        ],
        preview: { select: { title: 'issueDate' }, prepare({ title }) { return { title: title ?? '(no date)' } } },
      })],
    }),

    // Receipts / Tax invoices
    defineField({
      group:       'execution',
      name:        'receipts',
      title:       'Receipts / Tax Invoices',
      type:        'array',
      description: 'Upload receipt or tax invoice files.',
      of: [defineArrayMember({
        type:   'object',
        name:   'receipt',
        fields: [
          defineField({ name: 'file',          title: 'File (PDF or image)',  type: 'file'   }),
          defineField({ name: 'receiptDate',   title: 'Receipt Date',         type: 'date'   }),
          defineField({ name: 'invoiceNumber', title: 'Invoice / Receipt No', type: 'string' }),
        ],
        preview: {
          select: { title: 'invoiceNumber', subtitle: 'receiptDate' },
          prepare({ title, subtitle }) { return { title: title ?? '(no number)', subtitle: subtitle ?? '' } },
        },
      })],
    }),

    // ── Activity Dynamic Fields (from Process Setup) ──────────────────────────

    defineField({
      group:       'dynamic',
      name:        'contractType',
      title:       'Process Setup',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      description: 'Select the Process Setup to load its Activity Dynamic Fields.',
    }),

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
      status:     'paymentStatus',
      vendor:     'vendor.legalName_en',
      amount:     'paymentAmount',
      currency:   'currency',
    },
    prepare({ status, vendor, amount, currency }) {
      const statusLabel: Record<string, string> = {
        created:       '📝 Created',
        submitted:     '📤 Submitted',
        approved:      '✅ Approved',
        rejected:      '❌ Rejected',
        condition_met: '🔍 Condition Met',
        processing:    '🔄 Processing',
        paid:          '💳 Paid',
        complete:      '🧾 Complete',
      }
      const amountStr = amount ? `${Number(amount).toLocaleString()} ${currency ?? 'THB'}` : ''
      return {
        title:    vendor ?? '(no vendor)',
        subtitle: [statusLabel[status ?? ''] ?? '', amountStr].filter(Boolean).join('  ·  '),
      }
    },
  },
})
