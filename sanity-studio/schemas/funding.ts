import { defineField, defineType, defineArrayMember } from 'sanity'
import { createAutoNumberInput }       from '../components/AutoNumberInput'
import { makeGlAccountInput }          from '../components/GlAccountInput'
import { BankAccountInput }            from '../components/BankAccountInput'
import { FundingBalanceSummary }       from '../components/FundingBalanceSummary'
import { AutoFundingDirectionInput }   from '../components/AutoFundingDirectionInput'
import { accountingEntryField }        from './accountingEntryField'

const FundingNumberInput    = createAutoNumberInput('funding', { fixedPrefix: 'FND' })

// Liability + equity accounts (loans payable, share capital, retained earnings)
// + asset accounts for inter-company receivables — all with credit-balance allowed
const GlFundingAccountInput  = makeGlAccountInput(['asset', 'liability', 'equity'], { allowCreditBalance: true })
const RegCapAccountInput     = makeGlAccountInput(['equity'])

const INFLOW_TYPES  = ['loan_drawdown', 'equity_injection', 'inter_company_loan']
const OUTFLOW_TYPES = ['loan_repayment', 'dividend_payment', 'inter_company_repay']

// Handle both new docs (fundingCategory set) and legacy docs (only fundingType set)
const isCapReg = (doc: any) =>
  (doc?.fundingCategory as string) === 'capital_register' ||
  (!doc?.fundingCategory && (doc?.fundingType as string) === 'capital_register')

export default defineType({
  name:  'funding',
  title: 'Funding',
  type:  'document',

  groups: [
    { name: 'setup',      title: '1. Setup',                default: true },
    { name: 'execution',  title: '2. Execution & Documents'               },
    { name: 'accounting', title: '3. Accounting'                          },
  ],

  orderings: [
    { title: 'Date — Newest',      name: 'dateDesc',      by: [{ field: 'date',          direction: 'desc' }] },
    { title: 'Date — Oldest',      name: 'dateAsc',       by: [{ field: 'date',          direction: 'asc'  }] },
    { title: 'Ref No — Newest',    name: 'numDesc',       by: [{ field: 'fundingNumber', direction: 'desc' }] },
    { title: 'Amount — Highest',   name: 'amtDesc',       by: [{ field: 'amount',        direction: 'desc' }] },
    { title: 'Direction (In/Out)', name: 'directionAsc',  by: [{ field: 'direction',     direction: 'asc'  }] },
    { title: 'Type',               name: 'typeAsc',       by: [{ field: 'fundingType',   direction: 'asc'  }] },
    { title: 'Status',             name: 'statusAsc',     by: [{ field: 'status',        direction: 'asc'  }] },
  ],

  fields: [

    // ── Group 1: Setup ────────────────────────────────────────────────────────

    defineField({
      group:       'setup',
      name:        'fundingNumber',
      title:       '1.1 · Reference Number',
      type:        'string',
      description: 'Auto-generated. Format: FND-yymm-001.',
      components:  { input: FundingNumberInput },
      validation:  Rule => Rule.custom(async (value, context) => {
        if (!value) return true
        const client = (context as any).getClient({ apiVersion: '2024-01-01' })
        const selfId = (context.document?._id as string)?.replace(/^drafts\./, '')
        const count  = (await client.fetch(
          `count(*[_type == "funding" && fundingNumber == $num && _id != $self && !(_id in path("drafts.**"))])`,
          { num: value, self: selfId ?? '' },
        )) as number
        return count === 0 ? true : `"${value}" is already used — regenerate to get a unique number.`
      }),
    }),

    defineField({
      group:      'setup',
      name:       'fundingCategory',
      title:      '1.2 · Category',
      type:       'string',
      validation: Rule => Rule.required(),
      options: {
        list: [
          { title: '📋 Registered Capital — update authorized capital with DBD filing',           value: 'capital_register' },
          { title: '💰 Funding Transaction — loan, equity injection, repayment, dividend, etc.', value: 'transaction'      },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:       'setup',
      name:        'fundingType',
      title:       '1.3 · Transaction Type',
      type:        'string',
      hidden:      ({ document }) => {
        const cat  = document?.fundingCategory as string
        const type = document?.fundingType     as string
        // Hide if explicitly capital_register, or if category not yet set on a new doc
        if (cat === 'capital_register') return true
        if (!cat && !type) return true
        return false
      },
      validation:  Rule => Rule.custom((value, context) => {
        if ((context.document?.fundingCategory as string) !== 'transaction') return true
        if (!value) return 'Required — select a transaction type'
        return true
      }),
      options: {
        list: [
          { title: '📥 Loan Drawdown — funds received from lender (DR Bank / CR Loan Payable)',                          value: 'loan_drawdown'       },
          { title: '💼 Equity Injection — capital received from shareholders (DR Bank / CR Paid-up Capital)',             value: 'equity_injection'    },
          { title: '🔄 Inter-company Loan — funds from/to a related entity',                                             value: 'inter_company_loan'  },
          { title: '📤 Loan Repayment — principal repaid to lender (DR Loan Payable / CR Bank)',                         value: 'loan_repayment'      },
          { title: '💸 Dividend Payment — distribution to shareholders (DR Retained Earnings / CR Bank)',                value: 'dividend_payment'    },
          { title: '↩  Inter-company Repayment — repay funds to related entity (DR IC Loan Payable / CR Bank)',          value: 'inter_company_repay' },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:       'setup',
      name:        'direction',
      title:       '1.2b · Direction',
      type:        'string',
      readOnly:    true,
      hidden:      ({ document }) => isCapReg(document),
      description: 'Auto-derived from Funding Type. Stored for filtering and reporting.',
      options: {
        list: [
          { title: '📥 Inflow — Funds Received', value: 'inflow'  },
          { title: '📤 Outflow — Funds Paid',    value: 'outflow' },
        ],
      },
      components: { input: AutoFundingDirectionInput },
    }),

    defineField({
      group:    'setup',
      name:     'status',
      title:    '1.3 · Status',
      type:     'string',
      initialValue: 'draft',
      options: {
        list: [
          { title: '📝 Draft',     value: 'draft'     },
          { title: '✅ Confirmed', value: 'confirmed' },
          { title: '🚫 Voided',   value: 'voided'    },
        ],
      },
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:      'setup',
      name:       'date',
      title:      '1.4 · Transaction Date',
      type:       'date',
      validation: Rule => Rule.required(),
    }),

    defineField({
      group:       'setup',
      name:        'party',
      title:       '1.5 · Counterparty',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'The bank, investor, or related entity on the other side of this transaction.',
      options:     { disableNew: true },
      hidden:      ({ document }) => isCapReg(document),
      validation:  Rule => Rule.custom((value, context) => {
        if (isCapReg(context.document)) return true
        if (!value) return 'Required'
        return true
      }),
    }),

    defineField({
      group:       'setup',
      name:        'accountCode',
      title:       '1.6 · Balance Sheet GL Account',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      components:  { input: GlFundingAccountInput },
      description: 'The liability, equity, or receivable account this transaction affects (e.g. Loan Payable, Share Capital, Retained Earnings, IC Loan Receivable).',
      hidden:      ({ document }) => isCapReg(document),
      validation:  Rule => Rule.custom((value, context) => {
        if (isCapReg(context.document)) return true
        if (!value) return 'Required'
        return true
      }),
    }),

    defineField({
      group:       'setup',
      name:        'relatedFunding',
      title:       '1.7 · Related Funding Record',
      type:        'reference',
      to:          [{ type: 'funding' }],
      options:     { disableNew: true },
      description: 'Link a repayment or inter-company repayment back to its original drawdown. Enables the balance tracker below.',
      hidden:      ({ document }) => !OUTFLOW_TYPES.includes(document?.fundingType as string),
    }),

    defineField({
      group:       'setup',
      name:        'balanceSummary',
      title:       'Loan Balance',
      type:        'string',
      readOnly:    true,
      components:  { input: FundingBalanceSummary },
      description: 'Remaining balance on this facility after all linked repayments.',
      hidden:      ({ document }) => !INFLOW_TYPES.includes(document?.fundingType as string),
    }),

    // ── Board resolution (equity injection, dividend, capital registration) ────

    defineField({
      group:       'setup',
      name:        'boardResolutionDate',
      title:       '1.8 · Board Resolution Date',
      type:        'date',
      hidden:      ({ document }) => !['equity_injection', 'dividend_payment'].includes(document?.fundingType as string) && !isCapReg(document),
      description: 'Date of the board / shareholders resolution authorising this transaction.',
    }),

    defineField({
      group:       'setup',
      name:        'boardResolutionRef',
      title:       '1.9 · Board Resolution Reference',
      type:        'string',
      hidden:      ({ document }) => !['equity_injection', 'dividend_payment'].includes(document?.fundingType as string) && !isCapReg(document),
      description: 'Resolution number or meeting reference for audit trail.',
    }),

    // ── Capital Registration fields ───────────────────────────────────────────

    defineField({
      group:       'setup',
      name:        'newRegisteredCapital',
      title:       '1.10 · New Registered Capital (THB)',
      type:        'number',
      hidden:      ({ document }) => !isCapReg(document),
      validation:  Rule => Rule.custom((value, context) => {
        if (!isCapReg(context.document)) return true
        if (value == null) return 'Required — enter the new authorized capital amount'
        if ((value as number) <= 0) return 'Must be greater than 0'
        return true
      }),
      description: 'New authorized/registered capital amount as filed with DBD (ทุนจดทะเบียนใหม่).',
    }),

    defineField({
      group:       'setup',
      name:        'dBDRef',
      title:       '1.11 · DBD Filing Reference',
      type:        'string',
      hidden:      ({ document }) => !isCapReg(document),
      description: 'DBD registration document number or filing reference (เลขที่หนังสือรับรอง / คำขอจดทะเบียน).',
    }),

    defineField({
      group:       'setup',
      name:        'registeredCapitalAccount',
      title:       '1.12 · Registered Capital GL Account',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      components:  { input: RegCapAccountInput },
      hidden:      ({ document }) => !isCapReg(document),
      description: 'The equity GL account for ทุนจดทะเบียน (e.g. 310000). Its balance will appear as a disclosure note on the balance sheet and be excluded from the equity total.',
      validation:  Rule => Rule.custom((value, context) => {
        if (!isCapReg(context.document)) return true
        if (!value) return 'Required — select the registered capital GL account (e.g. 310000·ทุนจดทะเบียน)'
        return true
      }),
    }),

    // ── Group 2: Execution ────────────────────────────────────────────────────

    defineField({
      group:       'execution',
      name:        'bankAccount',
      title:       '2.1 · Bank Account',
      type:        'reference',
      to:          [{ type: 'accountCode' }],
      options:     { disableNew: true },
      components:  { input: BankAccountInput },
      description: 'Company bank / cash GL account through which this transaction flows.',
      hidden:      ({ document }) => isCapReg(document),
      validation:  Rule => Rule.custom((value, context) => {
        if (isCapReg(context.document)) return true
        if (!value) return 'Required'
        return true
      }),
    }),

    defineField({
      group:        'execution',
      name:         'amount',
      title:        '2.2 · Amount (THB)',
      type:         'number',
      description:  'Transaction amount in THB (principal only — interest is recorded separately via Payment).',
      hidden:       ({ document }) => isCapReg(document),
      validation:   Rule => Rule.custom((value, context) => {
        if (isCapReg(context.document)) return true
        if (value == null) return 'Required'
        return true
      }),
    }),

    defineField({
      group:        'execution',
      name:         'currency',
      title:        '2.3 · Currency',
      type:         'string',
      initialValue: 'THB',
      hidden:       ({ document }) => isCapReg(document),
      options: {
        list: [
          { title: 'THB — Thai Baht',        value: 'THB'   },
          { title: 'USD — US Dollar',        value: 'USD'   },
          { title: 'EUR — Euro',             value: 'EUR'   },
          { title: 'JPY — Japanese Yen',     value: 'JPY'   },
          { title: 'Other',                  value: 'other' },
        ],
      },
    }),

    defineField({
      group:       'execution',
      name:        'exchangeRate',
      title:       '2.4 · Exchange Rate (to THB)',
      type:        'number',
      description: 'Only required if currency is not THB.',
      hidden:      ({ document }) => isCapReg(document) || (document?.currency as string) === 'THB' || !document?.currency,
    }),

    defineField({
      group:       'execution',
      name:        'paymentMethod',
      title:       '2.5 · Transfer Method',
      type:        'string',
      hidden:      ({ document }) => isCapReg(document),
      options: {
        list: [
          { title: '🏦 Bank Transfer',        value: 'transfer' },
          { title: '📄 Cheque',               value: 'cheque'   },
          { title: '🌐 International SWIFT',  value: 'swift'    },
          { title: '💵 Cash',                value: 'cash'     },
        ],
      },
    }),

    defineField({
      group:       'execution',
      name:        'bankReference',
      title:       '2.6 · Bank Reference / Slip No.',
      type:        'string',
      hidden:      ({ document }) => isCapReg(document),
      description: 'Transfer confirmation number or cheque number.',
    }),

    // ── WHT on dividend (10% for individuals) ─────────────────────────────────

    defineField({
      group:        'execution',
      name:         'whtRate',
      title:        '2.7 · Withholding Tax Rate (Dividend)',
      type:         'string',
      hidden:       ({ document }) => (document?.fundingType as string) !== 'dividend_payment',
      description:  'Dividends paid to individual shareholders are subject to 10% WHT.',
      initialValue: 'none',
      options: {
        list: [
          { title: 'None (juristic person recipient)',   value: 'none' },
          { title: '10% (individual shareholder)',       value: '10'   },
        ],
      },
    }),

    defineField({
      group:       'execution',
      name:        'whtAmount',
      title:       '2.8 · WHT Amount (THB)',
      type:        'number',
      hidden:      ({ document }) => (document?.fundingType as string) !== 'dividend_payment' || (document?.whtRate as string) === 'none',
      description: 'Withholding tax deducted from dividend. Net payout = Amount − WHT.',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'execution',
      name:        'loanTermMonths',
      title:       '2.9 · Loan Term (months)',
      type:        'number',
      hidden:      ({ document }) => !['loan_drawdown', 'inter_company_loan'].includes(document?.fundingType as string),
      description: 'Total term of the loan facility in months. For reference only.',
      validation:  Rule => Rule.min(1),
    }),

    defineField({
      group:       'execution',
      name:        'interestRatePercent',
      title:       '2.10 · Interest Rate (% p.a.)',
      type:        'number',
      hidden:      ({ document }) => !['loan_drawdown', 'inter_company_loan'].includes(document?.fundingType as string),
      description: 'Annual interest rate of the loan. Interest payments are recorded separately in Payment (interest_payment mode).',
      validation:  Rule => Rule.min(0),
    }),

    defineField({
      group:       'execution',
      name:        'maturityDate',
      title:       '2.11 · Maturity / Due Date',
      type:        'date',
      hidden:      ({ document }) => !['loan_drawdown', 'inter_company_loan'].includes(document?.fundingType as string),
      description: 'Date the loan principal is due for full repayment.',
    }),

    defineField({
      group:       'execution',
      name:        'supportingDocs',
      title:       '2.12 · Supporting Documents',
      type:        'array',
      description: 'Upload loan agreements, transfer slips, board resolutions, DBD registration certificates, etc.',
      of: [defineArrayMember({
        type:   'object',
        name:   'fundingDoc',
        fields: [
          defineField({
            name:    'docType',
            title:   'Document Type',
            type:    'string',
            options: {
              list: [
                { title: 'Loan Agreement',              value: 'loan_agreement'      },
                { title: 'Transfer Slip',               value: 'transfer_slip'       },
                { title: 'Board Resolution',            value: 'board_resolution'    },
                { title: 'Share Certificate',           value: 'share_certificate'   },
                { title: 'WHT Certificate',             value: 'wht_certificate'     },
                { title: 'DBD Registration Certificate', value: 'dbd_certificate'    },
                { title: 'Other',                       value: 'other'               },
              ],
            },
            validation: Rule => Rule.required(),
          }),
          defineField({ name: 'file',  title: 'File',  type: 'file', options: { accept: '.pdf,image/*' } }),
          defineField({ name: 'note',  title: 'Note',  type: 'string' }),
        ],
        preview: {
          select: { docType: 'docType', note: 'note' },
          prepare({ docType, note }: { docType?: string; note?: string }) {
            const icons: Record<string, string> = {
              loan_agreement: '📋', transfer_slip: '🏦', board_resolution: '📄',
              share_certificate: '📜', wht_certificate: '🧾', dbd_certificate: '🏛', other: '📎',
            }
            return {
              title:    `${icons[docType ?? ''] ?? '📎'} ${docType ?? 'Document'}`,
              subtitle: note ?? '',
            }
          },
        },
      })],
    }),

    defineField({
      group: 'execution',
      name:  'internalNotes',
      title: '2.13 · Internal Notes',
      type:  'text',
      rows:  3,
    }),

    defineField({
      group:    'execution',
      name:     'voidedAt',
      title:    'Voided At',
      type:     'datetime',
      readOnly: true,
      hidden:   ({ document }) => (document?.status as string) !== 'voided',
    }),

    defineField({
      group:    'execution',
      name:     'voidedReason',
      title:    'Void Reason',
      type:     'string',
      hidden:   ({ document }) => (document?.status as string) !== 'voided',
      validation: Rule => Rule.custom((value, context) => {
        if ((context.document?.status as string) !== 'voided') return true
        if (!value?.trim()) return 'A reason is required when voiding a funding record.'
        return true
      }),
    }),

    // Accounting entry — not applicable for capital registration
    { ...accountingEntryField, hidden: ({ document }: any) => isCapReg(document) } as any,

  ],

  preview: {
    select: {
      number:               'fundingNumber',
      fundingCategory:      'fundingCategory',
      fundingType:          'fundingType',
      direction:            'direction',
      status:               'status',
      party:                'party.legalName_en',
      amount:               'amount',
      newRegisteredCapital: 'newRegisteredCapital',
      date:                 'date',
    },
    prepare({ number, fundingCategory, fundingType, direction, status, party, amount, newRegisteredCapital, date }: {
      number?: string; fundingCategory?: string; fundingType?: string; direction?: string; status?: string
      party?: string; amount?: number; newRegisteredCapital?: number; date?: string
    }) {
      const capReg = fundingCategory === 'capital_register' || (!fundingCategory && fundingType === 'capital_register')
      const typeIcon: Record<string, string> = {
        loan_drawdown:       '📥',
        equity_injection:    '💼',
        inter_company_loan:  '🔄',
        loan_repayment:      '📤',
        dividend_payment:    '💸',
        inter_company_repay: '↩',
        capital_register:    '📋',
      }
      const typeLabel: Record<string, string> = {
        loan_drawdown:       'Loan Drawdown',
        equity_injection:    'Equity Injection',
        inter_company_loan:  'IC Loan',
        loan_repayment:      'Loan Repayment',
        dividend_payment:    'Dividend',
        inter_company_repay: 'IC Repayment',
        capital_register:    'Capital Registration',
      }
      const statusLabel: Record<string, string> = {
        draft: '📝 Draft', confirmed: '✅ Confirmed', voided: '🚫 Voided',
      }
      const directionLabel: Record<string, string> = {
        inflow: '📥 In', outflow: '📤 Out',
      }
      const icon    = capReg ? '📋' : (typeIcon[fundingType ?? '']  ?? '💰')
      const label   = capReg ? 'Capital Registration' : (typeLabel[fundingType ?? ''] ?? fundingType ?? '—')
      const display = capReg
        ? (newRegisteredCapital != null ? `${Number(newRegisteredCapital).toLocaleString()} THB` : '')
        : (amount != null ? `${Number(amount).toLocaleString()} THB` : '')
      return {
        title:    `${icon} ${label}${party ? ` — ${party}` : ''}`,
        subtitle: [
          number ?? '(no number)',
          fundingType !== 'capital_register' ? (directionLabel[direction ?? ''] ?? '') : '',
          statusLabel[status ?? ''] ?? '',
          display,
          date ?? '',
        ].filter(Boolean).join('  ·  '),
      }
    },
  },
})
