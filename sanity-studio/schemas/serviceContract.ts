import { defineField, defineType, defineArrayMember } from 'sanity'
import { ServiceTypeSelect }        from '../components/ServiceTypeSelect'
import { ServiceSpecFieldsInput }   from '../components/ServiceSpecFieldsInput'
import { ServiceContractPaymentsDisplay } from '../components/ServiceContractPaymentsDisplay'
import { NextBillingPeriodInput }         from '../components/NextBillingPeriodInput'
import { ComputedStatusDisplay }    from '../components/ComputedStatusDisplay'
import { deriveContractStatus, STATUS_ICON, STATUS_LABEL } from '../utils/deriveContractStatus'
import { withTestId }               from '../components/withTestId'
import { makeGlAccountInput }       from '../components/GlAccountInput'

const ExpenseAccountInput = makeGlAccountInput(['expense'])

/**
 * Service Contract — tracks ongoing recurring services paid to a vendor.
 * e.g. Internet, Maintenance, SaaS subscriptions, Cleaning, Insurance.
 *
 * No document generation — vendor issues the contract, we just monitor it.
 * Dynamic fields per service type are driven by the linked Process Setup
 * (any Process Setup with useForServiceContract == true).
 */
export default defineType({
  name:  'serviceContract',
  title: 'Service Contract',
  type:  'document',

  groups: [
    { name: 'overview',    title: '📋 Overview' },
    { name: 'terms',       title: '1. Contract Terms'               },
    { name: 'payment',     title: '2. Payment'                      },
    { name: 'renewal',     title: '3. Renewals'                     },
    { name: 'termination', title: '4. Termination'                  },
    { name: 'custom',      title: 'Custom Fields'                   },
  ],

  fields: [

    // ── Overview tab ──────────────────────────────────────────────────────────

    defineField({
      group:       'overview',
      name:        'projectSite',
      title:       'Project Site',
      type:        'reference',
      to:          [{ type: 'projectSite' }],
      options: {
        filter: '_id in *[_type == "contract" && contractApprovalStatus == "approved"].projectSite._ref',
      },
      description: 'Only sites with an approved Rent Space contract are shown. Leave blank for internal or company-wide contracts.',
      components:  { input: withTestId('sc-project-site-input') },
    }),

    defineField({
      group:       'overview',
      name:        'vendor',
      title:       'Vendor / Party *',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'The company or person you pay for this service.',
      validation:  Rule => Rule.required().error('Vendor is required — select the party for this service contract.'),
      components:  { input: withTestId('sc-vendor-input') },
    }),

    defineField({
      group:       'overview',
      name:        'serviceName',
      title:       'Service Name',
      type:        'string',
      description: 'Optional override — auto-generated from vendor, service type, and contract number if left blank.',
    }),

    defineField({
      group:     'overview',
      name:      'contractStatus',
      title:     'Status',
      type:      'string',
      readOnly:  true,
      description: 'Auto-derived from contract dates, renewals, and termination record. Toggle "Suspended" below to override.',
      components: { input: ComputedStatusDisplay },
    }),

    defineField({
      group:        'overview',
      name:         'isSuspended',
      title:        'Suspended',
      type:         'boolean',
      initialValue: false,
      description:  'Manually mark this contract as suspended (e.g. vendor paused service). Overrides the auto-derived status.',
    }),

    // ── 1. Contract Terms ─────────────────────────────────────────────────────

    defineField({
      group:       'terms',
      name:        'serviceType',
      title:       '1.1 · Service Type *',
      type:        'string',
      description: 'Select the service type — drives the fields below.',
      components:  { input: ServiceTypeSelect },
      validation:  Rule => Rule.required().error('Service Type is required — select the type of service being contracted.'),
    }),

    defineField({
      group:       'terms',
      name:        'serviceSpecFields',
      title:       '1.2 · Service Details',
      type:        'string',
      description: 'Fields specific to the selected service type.',
      components:  { input: ServiceSpecFieldsInput },
    }),

    defineField({
      group:       'terms',
      name:        'vendorContractNo',
      title:       '1.3 · Vendor Contract No. *',
      type:        'string',
      description: 'Phone number, account number, or reference from the vendor\'s contract.',
      validation:  Rule => Rule.required().error('Vendor Contract No. is required — enter the phone number, account ID, or reference number.'),
      components:  { input: withTestId('sc-phone-input') },
    }),

    defineField({
      group:  'terms',
      name:   'contractDocument',
      title:  '1.4 · Contract Document',
      type:   'file',
      options: { accept: '.pdf,image/*' },
      description: 'Upload the vendor\'s contract PDF.',
    }),

    defineField({
      group:      'terms',
      name:       'startDate',
      title:      '1.5 · Start Date',
      type:       'date',
      validation: Rule => Rule.custom(val =>
        val != null || 'Required to publish — add the contract start date.'
      ),
      components: { input: withTestId('sc-start-date-input') },
    }),
    defineField({ group: 'terms', name: 'endDate', title: '1.6 · End Date', type: 'date',
      components: { input: withTestId('sc-end-date-input') },
    }),

    defineField({
      group:        'terms',
      name:         'autoRenewal',
      title:        '1.7 · Auto-Renewal',
      type:         'boolean',
      initialValue: false,
      description:  'Contract renews automatically unless cancelled.',
    }),

    defineField({
      group:       'terms',
      name:        'noticePeriodDays',
      title:       '1.8 · Notice Period (days)',
      type:        'number',
      description: 'Days required to cancel before the contract auto-renews or expires.',
      hidden:      ({ document }) => !document?.autoRenewal,
    }),

    defineField({
      group:       'terms',
      name:        'linkedProcurement',
      title:       '1.9 · Linked Procurement',
      type:        'reference',
      to:          [{ type: 'procurement' }],
      description: 'Optional — link the Procurement document this service was purchased through.',
    }),

    defineField({
      group:       'terms',
      name:        'linkedRentSpace',
      title:       '1.10 · Linked Rent Space',
      type:        'reference',
      to:          [{ type: 'contract' }],
      description: 'Optional — link the signed Rent Space contract this payment obligation comes from.',
    }),

    // ── 2. Payment ────────────────────────────────────────────────────────────

    defineField({
      group:       'payment',
      name:        'glAccount',
      title:       '2.1 · GL Account (Expense)',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:    { disableNew: true },
      components: { input: ExpenseAccountInput },
      description: 'Expense account for this service (e.g. 512300 Internet, 512400 Maintenance). Auto-fills the GL account on linked payments.',
    }),

    defineField({
      group:   'payment',
      name:    'paymentFrequency',
      title:   '2.2 · Payment Frequency',
      type:    'string',
      options: {
        list: [
          { title: 'Monthly',   value: 'monthly'   },
          { title: 'Quarterly', value: 'quarterly' },
          { title: 'Annual',    value: 'annual'    },
          { title: 'One-time',  value: 'one_time'  },
        ],
      },
      validation: Rule => Rule.custom(val =>
        val != null || 'Required to publish — select how often this service is billed.'
      ),
    }),

    defineField({
      group:      'payment',
      name:       'amountPerPeriod',
      title:      '2.3 · Amount per Period (THB) *',
      type:       'number',
      validation: Rule => Rule.required().min(0),
      components: { input: withTestId('sc-amount-input') },
    }),

    defineField({
      group:       'payment',
      name:        'vatNote',
      title:       '2.3b · VAT Note',
      type:        'string',
      description: 'e.g. "Excluding 7% VAT", "VAT inclusive", "VAT exempt"',
    }),

    defineField({
      group:        'payment',
      name:         'paymentMethod',
      title:        '2.4 · Payment Method',
      type:         'string',
      initialValue: 'bank_transfer',
      options: {
        list: [
          { title: 'Bank Transfer', value: 'bank_transfer' },
          { title: 'Auto-Debit',    value: 'auto_debit'    },
          { title: 'Credit Card',   value: 'credit_card'   },
          { title: 'Cheque',        value: 'cheque'        },
          { title: 'Cash',          value: 'cash'          },
        ],
      },
    }),

    defineField({
      group:       'payment',
      name:        'nextPaymentDue',
      title:       '2.5 · Next Billing Period',
      type:        'string',
      readOnly:    true,
      description: 'Auto-computed from the latest billing period in Payment History.',
      components:  { input: NextBillingPeriodInput },
    }),

    defineField({
      group:       'payment',
      name:        'paymentHistory',
      title:       '2.6 · Payment History',
      type:        'string',
      readOnly:    true,
      description: 'Summary of all billing periods and their linked payments.',
      components:  { input: ServiceContractPaymentsDisplay },
    }),

    defineField({
      group:       'payment',
      name:        'payments',
      title:       '2.7 · Billing Entries',
      type:        'array',
      description: 'Each entry records a billing period and the payment that covers it.',
      of: [defineArrayMember({
        type:  'object',
        name:  'billingEntry',
        title: 'Billing Entry',
        fields: [
          defineField({
            name:       'payment',
            title:      'Payment',
            type:       'reference',
            to:         [{ type: 'payment' }],
            validation: Rule => Rule.required(),
          }),
          defineField({ name: 'servicePeriodStart', title: 'Period Start', type: 'date', validation: Rule => Rule.required() }),
          defineField({ name: 'servicePeriodEnd',   title: 'Period End',   type: 'date', validation: Rule => Rule.required() }),
        ],
        preview: {
          select: {
            start:  'servicePeriodStart',
            end:    'servicePeriodEnd',
            status: 'payment.paymentStatus',
            number: 'payment.paymentNumber',
          },
          prepare({ start, end, status, number }: { start?: string; end?: string; status?: string; number?: string }) {
            const fmt = (iso?: string) => {
              if (!iso) return '—'
              const [y, m, d] = iso.split('-')
              return `${d}/${m}/${y}`
            }
            const icons: Record<string, string> = {
              created: '📝', submitted: '📤', approved: '✅', rejected: '❌',
              condition_met: '🔍', processing: '🔄', paid: '💳', complete: '🧾',
            }
            return {
              title:    `${fmt(start)} – ${fmt(end)}`,
              subtitle: `${icons[status ?? ''] ?? '⏳'} ${number ?? '(no payment linked)'}`,
            }
          },
        },
      })],
    }),

    // ── 3. Renewals ───────────────────────────────────────────────────────────

    defineField({
      group: 'renewal',
      name:  'renewalHistory',
      title: 'Renewal History',
      type:  'array',
      of: [defineArrayMember({
        type:   'object',
        name:   'renewal',
        title:  'Renewal',
        fields: [
          defineField({ name: 'renewedAt',        title: 'Renewed On',        type: 'date'   }),
          defineField({ name: 'previousEndDate',  title: 'Previous End Date', type: 'date'   }),
          defineField({ name: 'newEndDate',       title: 'New End Date',      type: 'date'   }),
          defineField({ name: 'newAmountPerPeriod', title: 'New Amount per Period (THB)', type: 'number' }),
          defineField({ name: 'document',         title: 'Renewal Document',  type: 'file',  options: { accept: '.pdf,image/*' } }),
          defineField({ name: 'note',             title: 'Note',              type: 'text',  rows: 2 }),
        ],
        preview: {
          select: { renewedAt: 'renewedAt', newEndDate: 'newEndDate', amount: 'newAmountPerPeriod' },
          prepare({ renewedAt, newEndDate, amount }: { renewedAt?: string; newEndDate?: string; amount?: number }) {
            return {
              title:    `Renewed ${renewedAt ?? '—'}`,
              subtitle: `New end: ${newEndDate ?? '—'}${amount ? `  ·  ${Number(amount).toLocaleString()} THB` : ''}`,
            }
          },
        },
      })],
    }),

    // ── 5. Termination ────────────────────────────────────────────────────────

    defineField({
      group:   'termination',
      name:    'termination',
      title:   'Termination Record',
      type:    'object',
      options: { collapsible: true, collapsed: true },
      fields: [
        defineField({
          name:    'terminatedBy',
          title:   'Terminated By',
          type:    'string',
          options: {
            list: [
              { title: 'Us',    value: 'us'     },
              { title: 'Vendor', value: 'vendor' },
              { title: 'Mutual', value: 'mutual' },
            ],
          },
        }),
        defineField({ name: 'noticeGivenAt', title: 'Notice Given On', type: 'date' }),
        defineField({ name: 'effectiveDate', title: 'Effective Date',  type: 'date' }),
        defineField({ name: 'reason',        title: 'Reason',          type: 'text', rows: 3 }),
        defineField({
          name:  'documents',
          title: 'Termination Documents',
          type:  'array',
          of:    [defineArrayMember({ type: 'file', options: { accept: '.pdf,image/*' } })],
        }),
      ],
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
      name:             'serviceName',
      vendorShort:      'vendor.shortName',
      vendorEn:         'vendor.legalName_en',
      vendorTh:         'vendor.legalName_th',
      serviceType:      'serviceType',
      vendorContractNo: 'vendorContractNo',
      endDate:          'endDate',
      noticePeriodDays: 'noticePeriodDays',
      isSuspended:      'isSuspended',
      terminationDate:  'termination.effectiveDate',
      renewalHistory:   'renewalHistory',
      projectEn:        'projectSite.projectEn',
      projectTh:        'projectSite.projectTh',
    },
    prepare({ name, vendorShort, vendorEn, vendorTh, serviceType, vendorContractNo, endDate, noticePeriodDays, isSuspended, terminationDate, renewalHistory, projectEn, projectTh }: {
      name?: string; vendorShort?: string; vendorEn?: string; vendorTh?: string
      serviceType?: string; vendorContractNo?: string
      endDate?: string; noticePeriodDays?: number; isSuspended?: boolean
      terminationDate?: string; renewalHistory?: Array<{ newEndDate?: string }>
      projectEn?: string; projectTh?: string
    }) {
      const { status } = deriveContractStatus({
        endDate, noticePeriodDays, isSuspended,
        terminationEffectiveDate: terminationDate,
        renewalHistory,
      })

      const vendor  = vendorShort ?? vendorEn ?? vendorTh ?? null
      const st      = serviceType ? serviceType.toUpperCase() : null
      const cn      = vendorContractNo ?? null
      const project = projectEn ?? projectTh ?? null

      // If user manually set serviceName, use it as-is (append project if present)
      let title: string
      if (name) {
        title = project ? `${name}  ·  ${project}` : name
      } else if (vendor && st && cn && project) {
        title = `${vendor} ${st} ${cn}  ·  ${project}`        // Tier 1
      } else if (vendor && st && cn) {
        title = `${vendor} ${st} ${cn}`                        // Tier 2
      } else if (vendor && cn) {
        title = `${vendor}  ·  ${cn}`                          // Tier 3
      } else if (vendor) {
        title = `${vendor}  ·  (untitled service)`             // Tier 4
      } else {
        title = '(Untitled draft)'                             // Tier 5
      }

      return {
        title,
        subtitle: `${STATUS_ICON[status]} ${STATUS_LABEL[status]}  ·  ${vendor ?? '—'}`,
      }
    },
  },
})
