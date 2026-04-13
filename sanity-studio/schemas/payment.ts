import { defineField, defineType, defineArrayMember } from 'sanity'
import { DynamicFieldsInput }                     from '../components/DynamicFieldsInput'
import { AutoPaymentSetupInput }                  from '../components/AutoSetupRefInput'
import { ProcurementsArrayInput }                from '../components/ProcurementsArrayInput'
import { ProcessSetupDescriptionBanner }        from '../components/ProcessSetupDescriptionBanner'
import { ApprovalLockedBanner }                from '../components/ApprovalLockedBanner'
import { createAutoNumberInput }               from '../components/AutoNumberInput'
import { AutoPaymentStatusInput }             from '../components/AutoPaymentStatusInput'
import { AutoPaidAmountInput }               from '../components/AutoPaidAmountInput'
import { ExpenseCategoryInput }               from '../components/ExpenseCategoryInput'

const PaymentNumberInput  = createAutoNumberInput('payment', { fixedPrefix: 'PMT' })
const ExpenseNumberInput  = createAutoNumberInput('expense',  { fixedPrefix: 'EXP' })

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

    // ── Approval locked banner ────────────────────────────────────────────────
    defineField({
      group:      'setup',
      name:       'approvalLockedBanner',
      title:      'Approval Lock',
      type:       'string',
      readOnly:   true,
      components: { input: ApprovalLockedBanner },
    }),

    // ── Payment Mode ──────────────────────────────────────────────────────────
    defineField({
      group:        'setup',
      name:         'paymentMode',
      title:        'Payment Mode',
      type:         'string',
      initialValue: 'procurement',
      options: {
        list: [
          { title: '🛒 Procurement Payment — pay against a Procurement record', value: 'procurement'    },
          { title: '💸 Direct Expense — one-off expense without Procurement',   value: 'direct_expense' },
        ],
        layout: 'radio',
      },
    }),

    // ── Process Setup description banner (top of form) ────────────────────────
    defineField({
      group:      'setup',
      name:       'setupDescriptionBanner',
      title:      'Process Setup Guide',
      type:       'string',
      hidden:     ({ document }) => (document?.paymentMode as string) === 'direct_expense' || !(document?.contractType as any)?._ref,
      components: { input: ProcessSetupDescriptionBanner },
    }),

    // ── Status (top-level, always visible) ────────────────────────────────────

    defineField({
      group:        'setup',
      name:         'paymentStatus',
      title:        'Payment Status',
      type:         'string',
      initialValue: 'created',
      components:   { input: AutoPaymentStatusInput },
    }),

    // ── 1. Setup ──────────────────────────────────────────────────────────────

    defineField({
      group:       'setup',
      name:        'paymentNumber',
      title:       'Payment Reference Number',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) === 'direct_expense',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Auto-generated payment reference number. Format: PMT-yymm-001.',
      components:  { input: PaymentNumberInput },
    }),

    defineField({
      group:       'setup',
      name:        'expenseNumber',
      title:       'Expense Reference Number',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      description: 'Auto-generated expense reference number. Format: EXP-yymm-001.',
      components:  { input: ExpenseNumberInput },
    }),

    defineField({
      group:       'setup',
      name:        'procurements',
      title:       'Procurements',
      type:        'array',
      hidden:      ({ document }) => (document?.paymentMode as string) === 'direct_expense',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Link one or more Procurement documents covered by this payment. Vendor will be auto-filled from the first linked procurement.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) === 'direct_expense') return true
        if (!value || (value as any[]).length === 0) return 'At least one Procurement must be linked before submitting for approval.'
        return true
      }),
      components:  { input: ProcurementsArrayInput },
      of: [defineArrayMember({
        type: 'reference',
        to:   [{ type: 'procurement' }],
        options: {
          filter: ({ document }: { document: any }) => ({
            filter: '!(_id in *[_type == "payment" && !(_id in path("drafts.**")) && _id != $currentId][].procurements[]._ref)',
            params: { currentId: (document._id as string)?.replace(/^drafts\./, '') ?? '' },
          }),
        },
      })],
    }),

    defineField({
      group:       'setup',
      name:        'vendor',
      title:       'Vendor',
      type:        'reference',
      to:          [{ type: 'party' }],
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Auto-fill from the linked Procurement, or select manually.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) === 'direct_expense') return true
        if (!value) return 'Vendor is required.'
        return true
      }),
    }),

    defineField({
      group:       'setup',
      name:        'paymentAmount',
      title:       'Payment Amount',
      type:        'number',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Total amount to be paid. Auto-calculate from Procurements or enter manually.',
      validation:  Rule => Rule.required().min(0),
    }),

    // ── Direct Expense fields ─────────────────────────────────────────────────

    defineField({
      group:       'setup',
      name:        'expenseProjectSite',
      title:       'Project Site',
      type:        'reference',
      to:          [{ type: 'projectSite' }],
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      description: 'The project site this expense belongs to. Used to auto-link costs in Install & Activate.',
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.paymentMode as string) !== 'direct_expense') return true
        if (!value) return 'Project Site is required for Direct Expense payments.'
        return true
      }),
    }),

    defineField({
      group:       'setup',
      name:        'expenseCategory',
      title:       'Expense Category',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      description: 'Category from Process Setup (e.g. Electrical Work, Wifi Setup). Determines which Install & Activate cost group this expense contributes to.',
      components:  { input: ExpenseCategoryInput },
    }),

    defineField({
      name:   'costGroup',
      title:  'Cost Group',
      type:   'string',
      hidden: true,   // auto-filled by ExpenseCategoryInput
    }),

    defineField({
      group:       'setup',
      name:        'expenseDescription',
      title:       'Payment Notes',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) !== 'direct_expense',
      description: 'Any clarification specific to this payment — e.g. scope of work, reference number, or special conditions.',
    }),

    defineField({
      group:        'setup',
      name:         'currency',
      title:        'Currency',
      type:         'string',
      readOnly:     ({ document }) => (document?.approvalStatus as string) === 'approved',
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
      group:    'setup',
      name:     'paymentType',
      title:    'Payment Type',
      type:     'string',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
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
      group:    'setup',
      name:     'paymentCondition',
      title:    'Payment Condition',
      type:     'string',
      hidden:   ({ document }) => (document?.paymentMode as string) === 'direct_expense',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
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
      group:        'setup',
      name:         'withholdingTaxRate',
      title:        'Withholding Tax Rate',
      type:         'string',
      readOnly:     ({ document }) => (document?.approvalStatus as string) === 'approved',
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
      group:    'setup',
      name:     'dueDate',
      title:    'Payment Due Date',
      type:     'date',
      readOnly: ({ document }) => (document?.approvalStatus as string) === 'approved',
    }),

    defineField({ group: 'setup', name: 'submittedBy',   title: 'Submitted By',   type: 'string' }),
    defineField({ group: 'setup', name: 'submittedDate', title: 'Submitted Date', type: 'date'   }),

    // ── Hidden approval fields (written by ApprovalView / approval API) ───────
    defineField({ name: 'approvalStatus',       title: 'Approval Status',        type: 'string',   hidden: true }),
    defineField({ name: 'notificationEmail',    title: 'Notification Email',     type: 'string',   hidden: true }),
    defineField({ name: 'approvedAt',           title: 'Approved At',            type: 'datetime', hidden: true }),
    defineField({ name: 'approvalResetReason',  title: 'Approval Reset Reason',  type: 'string',   hidden: true }),
    defineField({ name: 'lastApprovalSnapshot', title: 'Last Approval Snapshot', type: 'string',   hidden: true }),

    // ── 2. Execution ──────────────────────────────────────────────────────────

    defineField({
      group:        'execution',
      name:         'conditionMet',
      title:        'Condition Met',
      type:         'boolean',
      initialValue: false,
      hidden:       ({ document }) => (document?.paymentMode as string) === 'direct_expense',
      description:  'Check manually, or auto-derived from linked Procurement status.',
    }),

    defineField({ group: 'execution', name: 'conditionMetDate',  title: 'Condition Met Date',  type: 'date',
      hidden: ({ document }) => (document?.paymentMode as string) === 'direct_expense',
    }),
    defineField({ group: 'execution', name: 'conditionMetNotes', title: 'Condition Met Notes', type: 'string',
      hidden: ({ document }) => (document?.paymentMode as string) === 'direct_expense',
    }),

    defineField({
      group:       'execution',
      name:        'bankAccount',
      title:       'Bank Account Used',
      type:        'string',
      description: 'Reference the vendor\'s bank account from the Party record (e.g. "SCB — 123-456-789").',
    }),

    defineField({ group: 'execution', name: 'paymentDate',   title: 'Payment Date',   type: 'date'   }),
    defineField({ group: 'execution', name: 'paidAmount', title: 'Paid Amount', type: 'number',
      readOnly:    ({ document }) => (document?.approvalStatus as string) === 'approved',
      description: 'Auto-filled from approved Payment Amount. Locked after approval.',
      components:  { input: AutoPaidAmountInput },
    }),
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
      group:      'dynamic',
      name:       'contractType',
      title:      'Process Setup',
      type:       'reference',
      to:         [{ type: 'contractType' }],
      hidden:     ({ document }) => (document?.paymentMode as string) === 'direct_expense',
      components: { input: AutoPaymentSetupInput },
    }),

    defineField({
      group:       'dynamic',
      name:        'dynamicFields',
      title:       'Activity Dynamic Fields',
      type:        'string',
      hidden:      ({ document }) => (document?.paymentMode as string) === 'direct_expense',
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
      number:        'paymentNumber',
      expenseNumber: 'expenseNumber',
      mode:          'paymentMode',
      status:        'paymentStatus',
      vendor:        'vendor.legalName_en',
      amount:        'paymentAmount',
      currency:      'currency',
      category:      'expenseCategory',
    },
    prepare({ number, expenseNumber, mode, status, vendor, amount, currency, category }: { number?: string; expenseNumber?: string; mode?: string; status?: string; vendor?: string; amount?: number; currency?: string; category?: string }) {
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
      const isExpense  = mode === 'direct_expense'
      const ref        = isExpense ? (expenseNumber ?? '💸 Expense') : (number ?? '(no number)')
      const nameLabel  = isExpense ? (category ?? vendor ?? '(no category)') : (vendor ?? '(no vendor)')
      const amountStr  = amount ? `${Number(amount).toLocaleString()} ${currency ?? 'THB'}` : ''
      return {
        title:    `${ref}${nameLabel ? ` — ${nameLabel}` : ''}`,
        subtitle: [statusLabel[status ?? ''] ?? '', amountStr].filter(Boolean).join('  ·  '),
      }
    },
  },
})
