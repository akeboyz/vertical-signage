import { defineField, defineType } from 'sanity'
import { ProcessSetupDescriptionBanner } from '../components/ProcessSetupDescriptionBanner'
import { ContractLockedBanner }          from '../components/ApprovalLockedBanner'
import { createTranslateInput }              from '../components/TranslateInput'
import { createAutoNumberInput }             from '../components/AutoNumberInput'
import { NumericFormatInput }                from '../components/NumericFormatInput'
import { DynamicFieldsInput }               from '../components/DynamicFieldsInput'
import { RetrieveFromProjectSiteInput }     from '../components/RetrieveFromProjectSiteInput'
import { ExistingContractsWarning }         from '../components/ExistingContractsWarning'
import { SignedStatusInput }               from '../components/SignedStatusInput'
import { BillingPeriodsInput }             from '../components/BillingPeriodsInput'
import { PeriodBillingCalcInput }          from '../components/PeriodBillingCalcInput'
import { PeriodStatusInput }               from '../components/PeriodStatusInput'
import { PeriodPaymentButton }             from '../components/PeriodPaymentButton'

/**
 * Contract / Quotation document.
 * Links to a Project Site and holds all rental terms.
 * The "Generated Documents" group is written back by the backend after generation.
 */
export default defineType({
  name: 'contract',
  title: 'Rent Space',
  type: 'document',

  orderings: [
    {
      title: 'Quotation No. (newest first)',
      name:  'quotationNumberDesc',
      by: [{ field: 'quotationNumber', direction: 'desc' }],
    },
    {
      title: 'Quotation No. (oldest first)',
      name:  'quotationNumberAsc',
      by: [{ field: 'quotationNumber', direction: 'asc' }],
    },
    {
      title: 'Last Updated',
      name:  'updatedAtDesc',
      by: [{ field: '_updatedAt', direction: 'desc' }],
    },
  ],

  groups: [
    { name: 'customer',  title: 'Party'               },
    { name: 'rental',    title: 'Rental Details'      },
    { name: 'billing',   title: 'Billing Periods'     },
    { name: 'approval',  title: 'Approval'            },
    { name: 'signed',    title: 'Signed Documents'    },
    { name: 'generated', title: 'Generated Documents' },
  ],

  fields: [
    // ── Contract approval locked banner ──────────────────────────────────────
    defineField({
      name:       'approvalLockedBanner',
      title:      'Approval Lock',
      type:       'string',
      readOnly:   true,
      components: { input: ContractLockedBanner },
    }),

    // ── Process Setup description banner (top of form) ────────────────────────
    defineField({
      name:       'setupDescriptionBanner',
      title:      'Process Setup Guide',
      type:       'string',
      hidden:     ({ document }) => !(document?.contractType as any)?._ref,
      components: { input: ProcessSetupDescriptionBanner },
    }),

    // ── Project reference ─────────────────────────────────────────────────────
    defineField({
      name:     'projectSite',
      title:    '1. Project Site',
      type:     'reference',
      to:       [{ type: 'projectSite' }],
      readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      options: {
        filter: 'approvalStatus == "approved"',
      },
      validation:  Rule => Rule.required(),
      description: 'Only approved Project Sites are shown. Can\'t find yours? Create it in Project Sites first.',
    }),

    // ── Existing contracts warning (informational only) ───────────────────────
    defineField({
      name:       'existingContractsWarning',
      title:      'Existing Contracts',
      type:       'string',
      readOnly:   true,
      hidden:     ({ document }) => !document?.projectSite,
      components: { input: ExistingContractsWarning },
    }),

    // ── Contract type ─────────────────────────────────────────────────────────
    defineField({
      name:        'contractType',
      title:       '2. Contract Type',
      type:        'reference',
      to:          [{ type: 'contractType' }],
      readOnly:    ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      description: 'e.g. Rental Contract, Service Contract, Ad Contract — configure in Contract Types.',
      validation:  Rule => Rule.required(),
    }),

    // ── Party (counterparty to this contract) ────────────────────────────────
    defineField({
      group:       'customer',
      name:        'party',
      title:       '3. Party',
      type:        'reference',
      to:          [{ type: 'party' }],
      readOnly:    ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      description: 'The counterparty to this contract. Create the party first under CRM → Parties.',
      validation:  Rule => Rule.custom((val, ctx: any) => {
        // Warn if no party AND no legacy customerName fallback
        if (!val && !ctx.document?.customerName) {
          return { message: 'Please link a Party record. Without it, {{customer_name}} will be blank in generated documents.', level: 'warning' }
        }
        return true
      }),
    }),
    // Legacy fallback — kept hidden so old contracts still generate correctly.
    // Once all contracts have a Party linked, this field can be removed.
    defineField({ group: 'customer', name: 'customerName', title: 'Customer Name (legacy)', type: 'string', hidden: true }),

    // ── Rental details ────────────────────────────────────────────────────────
    // ── Document numbers (always needed) ──────────────────────────────────────
    defineField({ group: 'rental', name: 'quotationNumber', title: '5. Quotation Number', type: 'string', readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved', validation: Rule => Rule.required(), components: { input: createAutoNumberInput('quotation') } }),
    defineField({ group: 'rental', name: 'quotationDate',   title: '6. Quotation Date',   type: 'date',   readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved' }),
    defineField({ group: 'rental', name: 'contractNumber',  title: '7. Contract Number',  type: 'string', readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved', components: { input: createAutoNumberInput('contract') } }),
    defineField({ group: 'rental', name: 'contractDate',    title: '8. Contract Date',    type: 'date',   readOnly: ({ document }) => (document?.contractApprovalStatus as string) === 'approved' }),

    // ── Dynamic fields (driven by Contract Type) ──────────────────────────────
    defineField({
      group:       'rental',
      name:        'dynamicFields',
      title:       '9. Contract Fields',
      type:        'string',
      readOnly:    ({ document }) => (document?.contractApprovalStatus as string) === 'approved',
      description: 'Fields defined by the selected Contract Type.',
      components:  { input: DynamicFieldsInput },
    }),

    // ── Billing periods (recurring rent + electricity per month) ──────────────
    // Reconstructed from BillingPeriodsInput / PeriodPaymentButton / PeriodStatusInput
    // / PeriodBillingCalcInput components. Documents in the dataset already carry
    // this array — the schema definition was missing, which surfaced as "Unknown field".
    defineField({
      group:       'billing',
      name:        'billingPeriods',
      title:       'Billing Periods',
      type:        'array',
      description: 'Monthly billing rows for the rental. Use "Generate All Billing Periods" to populate the full contract duration in one click, then record rent payments per row as they come due.',
      components:  { input: BillingPeriodsInput },
      of: [{
        type: 'object',
        name: 'billingPeriod',
        fields: [
          defineField({
            name:     'periodNumber',
            title:    'Period #',
            type:     'number',
            readOnly: true,
          }),
          defineField({
            name:       'periodStart',
            title:      'Period Start',
            type:       'date',
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:       'periodEnd',
            title:      'Period End',
            type:       'date',
            validation: Rule => Rule.required(),
          }),
          defineField({
            name:        'rentalAmount',
            title:       'Rental Amount (THB)',
            type:        'number',
            validation:  Rule => Rule.required().min(0),
            description: 'Monthly rent for this period.',
          }),
          defineField({
            name:        'electricityRate',
            title:       'Electricity Rate (THB / unit)',
            type:        'number',
            description: 'Optional. Leave blank if electricity is not metered for this period.',
          }),
          defineField({
            name:        'meterStart',
            title:       'Meter Reading — Start',
            type:        'number',
            description: 'Optional. Enter at the beginning of the period.',
          }),
          defineField({
            name:        'meterEnd',
            title:       'Meter Reading — End',
            type:        'number',
            description: 'Optional. Enter at the end of the period to calculate electricity charge.',
          }),
          defineField({
            name:       'billingCalc',
            title:      'Billing Total',
            type:       'string',
            readOnly:   true,
            description: 'Auto-calculated from rental + (meter end − meter start) × electricity rate. Read-only.',
            components: { input: PeriodBillingCalcInput },
          }),
          defineField({
            name:       'accrualStatus',
            title:      'Status',
            type:       'string',
            readOnly:   true,
            description: 'Auto-derived from period dates + linked Payment status. Not user-editable.',
            options: { list: [
              { title: '🕐 Upcoming', value: 'upcoming' },
              { title: '🔴 Due',      value: 'due'      },
              { title: '🚨 Overdue',  value: 'overdue'  },
              { title: '📤 Invoiced', value: 'invoiced' },
              { title: '✅ Paid',     value: 'paid'     },
            ]},
            components: { input: PeriodStatusInput },
          }),
          defineField({
            name:        'linkedPayment',
            title:       'Linked Payment',
            type:        'reference',
            to:          [{ type: 'payment' }],
            readOnly:    true,
            description: 'Auto-linked when "Record Rent Payment" is clicked. Click "Open Payment" in the status card to view.',
          }),
          defineField({
            name:        'createPayment',
            title:       'Record Payment',
            type:        'string',
            description: 'Click to create a Payment document for this period and link it back here.',
            components:  { input: PeriodPaymentButton },
          }),
        ],
        preview: {
          select: {
            periodNumber:    'periodNumber',
            periodStart:     'periodStart',
            periodEnd:       'periodEnd',
            rentalAmount:    'rentalAmount',
            electricityRate: 'electricityRate',
            meterStart:      'meterStart',
            meterEnd:        'meterEnd',
            accrualStatus:   'accrualStatus',
          },
          prepare({ periodNumber, periodStart, periodEnd, rentalAmount, electricityRate, meterStart, meterEnd, accrualStatus }) {
            const icon: Record<string, string> = {
              upcoming: '🕐', due: '🔴', overdue: '🚨', invoiced: '📤', paid: '✅',
            }
            const fmtD = (s?: string) => s
              ? new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
              : '—'
            const units    = (meterStart != null && meterEnd != null) ? Math.max(0, Number(meterEnd) - Number(meterStart)) : 0
            const elecCost = units * Number(electricityRate ?? 0)
            const total    = Number(rentalAmount ?? 0) + elecCost
            const amount   = rentalAmount != null
              ? `฿${total.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : '—'
            return {
              title:    `${icon[accrualStatus ?? 'upcoming'] ?? '🕐'} Period ${periodNumber ?? '?'}  ·  ${fmtD(periodStart)} → ${fmtD(periodEnd)}`,
              subtitle: amount,
            }
          },
        },
      }],
    }),

    // ── Legacy fields — hidden, kept for backward compatibility ───────────────
    // Existing contracts still have values here; generation reads them as fallback.
    defineField({ name: 'addressTh',    title: 'Address (TH)',   type: 'text',   hidden: true }),
    defineField({ name: 'addressEn', title: 'Address (EN)', type: 'text', hidden: true }),
    defineField({ name: 'rentalRate',   title: 'Rental Rate',    type: 'string', hidden: true }),
    defineField({ name: 'electricity',  title: 'Electricity',    type: 'string', hidden: true }),
    defineField({ name: 'locationTh',   title: 'Location (TH)', type: 'string', hidden: true }),
    defineField({ name: 'locationEn',   title: 'Location (EN)', type: 'string', hidden: true }),
    defineField({ name: 'startingDate', title: 'Starting Date', type: 'date',   hidden: true }),
    defineField({ name: 'endingDate',   title: 'Ending Date',   type: 'date',   hidden: true }),
    defineField({ name: 'terms',        title: 'Terms',         type: 'text',   hidden: true }),
    defineField({ name: 'note',         title: 'Note',          type: 'text',   hidden: true }),

    // ── Approval state (written by backend — read-only in Studio) ────────────
    // Visible fields in the Approval tab
    defineField({ group: 'approval', name: 'notificationEmail', title: '10. Notification Email', type: 'string', readOnly: true, description: 'Set via the Approval tab. The staff email that receives the approved document.' }),
    defineField({ group: 'approval', name: 'quotationApprovalStatus', title: '11. Quotation Approval', type: 'string', readOnly: true,
      options: { list: [
        { title: '—  Not Requested', value: 'not_requested' },
        { title: '⏳ Pending',        value: 'pending'       },
        { title: '✓  Approved',      value: 'approved'      },
        { title: '✗  Rejected',      value: 'rejected'      },
        { title: '⚠  Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'approval', name: 'quotationApprovedAt',    title: '12. Quotation Approved At', type: 'datetime', readOnly: true }),
    defineField({ group: 'approval', name: 'contractApprovalStatus', title: '13. Contract Approval',     type: 'string',   readOnly: true,
      options: { list: [
        { title: '—  Not Requested', value: 'not_requested' },
        { title: '⏳ Pending',        value: 'pending'       },
        { title: '✓  Approved',      value: 'approved'      },
        { title: '✗  Rejected',      value: 'rejected'      },
        { title: '⚠  Reset',         value: 'reset'         },
      ]},
    }),
    defineField({ group: 'approval', name: 'contractApprovedAt',  title: '14. Contract Approved At', type: 'datetime', readOnly: true }),
    defineField({ group: 'approval', name: 'approvalResetReason', title: '15. Reset Reason',         type: 'string',   readOnly: true }),
    // Hidden — snapshots of key fields at approval time for reset-on-edit detection
    defineField({ name: 'lastQuotationSnapshot', title: 'Quotation Snapshot', type: 'string', hidden: true, readOnly: true }),
    defineField({ name: 'lastContractSnapshot',  title: 'Contract Snapshot',  type: 'string', hidden: true, readOnly: true }),

    // ── Signed documents ──────────────────────────────────────────────────────
    defineField({
      group:       'signed',
      name:        'signedDocuments',
      title:       '10. Signed Contract Documents',
      description: 'Upload the physically signed contract pages (PDF or photos) before marking as signed.',
      type:        'array',
      of:          [{ type: 'file', options: { accept: '.pdf,image/*' } }],
    }),
    defineField({ group: 'signed', name: 'signedNote', title: '11. Signing Note', type: 'string', description: 'Optional remark about signing (e.g. signed at office, courier, etc.)' }),
    // Signed status + inline "Mark as Signed" button
    defineField({
      group:      'signed',
      name:       'signedStatus',
      title:      '17. Signed Status',
      type:       'string',
      readOnly:   true,
      components: { input: SignedStatusInput },
    }),
    defineField({ group: 'signed', name: 'signedAt', title: '18. Signed At', type: 'datetime', readOnly: true }),
    defineField({ group: 'signed', name: 'signedBy', title: 'Signed By',     type: 'string',   readOnly: true, hidden: true }),

    // ── Generation metadata (written by backend — read-only in Studio) ────────
    // generationStatus and generatedDocType are hidden — used internally by preview and GenerateView
    defineField({ name: 'generationStatus', title: 'Generation Status', type: 'string', hidden: true, readOnly: true }),
    defineField({ name: 'generatedDocType', title: 'Generated Doc Type', type: 'string', hidden: true, readOnly: true }),
    // Combined status + error visible in the Generated Documents tab
    defineField({ group: 'generated', name: 'lastGenerationResult', title: '19. Last Generation', type: 'string', readOnly: true }),

    // ── Rental Agreement ──────────────────────────────────────────────────────
    defineField({ group: 'generated', name: 'contractGoogleDocUrl', title: '20. Agreement — Google Doc URL', type: 'url',      readOnly: true }),
    defineField({ group: 'generated', name: 'contractPdfAsset',     title: '21. Agreement — PDF File',       type: 'file',     readOnly: true }),
    defineField({ group: 'generated', name: 'contractGeneratedAt',  title: '22. Agreement — Generated At',   type: 'datetime', readOnly: true }),

    // ── Quotation ─────────────────────────────────────────────────────────────
    defineField({ group: 'generated', name: 'quotationGoogleDocUrl', title: '23. Quotation — Google Doc URL', type: 'url',      readOnly: true }),
    defineField({ group: 'generated', name: 'quotationPdfAsset',     title: '24. Quotation — PDF File',       type: 'file',     readOnly: true }),
    defineField({ group: 'generated', name: 'quotationGeneratedAt',  title: '25. Quotation — Generated At',   type: 'datetime', readOnly: true }),
  ],

  preview: {
    select: {
      contractNumber:         'contractNumber',
      quotationNumber:        'quotationNumber',
      partyLegalEn:           'party.legalName_en',
      partyLegalTh:           'party.legalName_th',
      partyFirst:             'party.firstName',
      customerName:           'customerName',
      projectEn:              'projectSite.projectEn',
      contractApprovalStatus: 'contractApprovalStatus',
      signedStatus:           'signedStatus',
    },
    prepare({ contractNumber, quotationNumber, partyLegalEn, partyLegalTh, partyFirst, customerName, projectEn, contractApprovalStatus, signedStatus }) {
      const partyName   = partyLegalEn ?? partyLegalTh ?? partyFirst ?? customerName
      const projectName = projectEn ?? partyName ?? '—'
      const stage       = contractNumber ? 'Contract' : quotationNumber ? 'Quotation' : 'New'
      const docNumber   = contractNumber ?? quotationNumber
      const title       = docNumber ? `${stage} · ${projectName} · ${docNumber}` : `${stage} · ${projectName}`

      const approvalLabel: Record<string, string> = {
        approved:      '✓ Approved',
        pending:       '⏳ Pending',
        rejected:      '✗ Rejected',
        reset:         '⚠ Reset',
        not_requested: '',
      }
      const approval = approvalLabel[contractApprovalStatus ?? ''] ?? ''
      const signed   = signedStatus === 'signed' ? '✍️ Signed' : ''
      const badges   = [approval, signed].filter(Boolean).join('  ·  ')

      return {
        title,
        subtitle: badges ? `${partyName ?? '—'}  ·  ${badges}` : (partyName ?? '—'),
      }
    },
  },
})
