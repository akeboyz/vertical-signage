import { defineField, defineType } from 'sanity'

/**
 * Sale Opportunity — tracks a property sale deal from inquiry to closing.
 *
 * Pipeline: inquiry → viewing → offer → under_contract → closed / lost
 *
 * Created manually by sales team, or promoted from a qualified Lead.
 * Buyer is linked via Party reference.
 */
export default defineType({
  name:  'saleOpportunity',
  title: 'Sale Opportunity',
  type:  'document',

  groups: [
    { name: 'overview', title: 'Overview', default: true },
    { name: 'unit',     title: 'Unit Details'            },
    { name: 'notes',    title: 'Notes'                   },
  ],

  fields: [

    // ── Overview ──────────────────────────────────────────────────────────────

    defineField({
      group:      'overview',
      name:       'dealStage',
      title:      'Deal Stage',
      type:       'string',
      options: {
        list: [
          { title: '📋 Inquiry',          value: 'inquiry'        },
          { title: '🏠 Viewing',          value: 'viewing'        },
          { title: '📝 Offer Made',        value: 'offer'          },
          { title: '📄 Under Contract',   value: 'under_contract' },
          { title: '🏆 Closed / Won',     value: 'closed'         },
          { title: '❌ Lost',             value: 'lost'           },
        ],
        layout: 'radio',
      },
      initialValue: 'inquiry',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'overview',
      name:        'buyer',
      title:       'Buyer',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'Link to the Party record for this buyer.',
    }),

    defineField({
      group:       'overview',
      name:        'lead',
      title:       'Source Lead',
      type:        'reference',
      to:          [{ type: 'lead' }],
      description: 'The lead this opportunity was promoted from, if any.',
    }),

    defineField({
      group:  'overview',
      name:   'assignedAgent',
      title:  'Assigned Agent',
      type:   'string',
    }),

    defineField({
      group:  'overview',
      name:   'targetCloseDate',
      title:  'Target Close Date',
      type:   'date',
    }),

    defineField({
      group:  'overview',
      name:   'offerPriceTHB',
      title:  'Offer Price (THB)',
      type:   'number',
    }),

    // ── Unit Details ──────────────────────────────────────────────────────────

    defineField({
      group:  'unit',
      name:   'projectName',
      title:  'Project Name',
      type:   'string',
    }),

    defineField({
      group:  'unit',
      name:   'unitNumber',
      title:  'Unit Number',
      type:   'string',
    }),

    defineField({
      group:  'unit',
      name:   'unitType',
      title:  'Unit Type',
      type:   'string',
      options: {
        list: [
          { title: 'Studio',       value: 'studio'    },
          { title: '1 Bedroom',    value: '1bed'      },
          { title: '2 Bedrooms',   value: '2bed'      },
          { title: '3 Bedrooms',   value: '3bed'      },
          { title: 'Penthouse',    value: 'penthouse' },
          { title: 'Commercial',   value: 'commercial'},
          { title: 'Other',        value: 'other'     },
        ],
      },
    }),

    defineField({
      group:       'unit',
      name:        'floorArea',
      title:       'Floor Area (sqm)',
      type:        'number',
    }),

    defineField({
      group:       'unit',
      name:        'floor',
      title:       'Floor',
      type:        'string',
    }),

    defineField({
      group:       'unit',
      name:        'listPriceTHB',
      title:       'List Price (THB)',
      type:        'number',
    }),

    defineField({
      group:       'unit',
      name:        'financingType',
      title:       'Financing Type',
      type:        'string',
      options: {
        list: [
          { title: 'Cash',          value: 'cash'     },
          { title: 'Bank Loan',     value: 'loan'     },
          { title: 'Installment',   value: 'installment' },
          { title: 'Other',         value: 'other'    },
        ],
      },
    }),

    // ── Notes ─────────────────────────────────────────────────────────────────

    defineField({
      group: 'notes',
      name:  'notes',
      title: 'Notes',
      type:  'text',
      rows:  5,
    }),

  ],

  preview: {
    select: {
      projectName: 'projectName',
      unitNumber:  'unitNumber',
      dealStage:   'dealStage',
      buyerName:   'buyer.legalName_th',
      buyerFirst:  'buyer.firstName',
    },
    prepare({ projectName, unitNumber, dealStage, buyerName, buyerFirst }) {
      const stageEmoji: Record<string, string> = {
        inquiry:        '📋',
        viewing:        '🏠',
        offer:          '📝',
        under_contract: '📄',
        closed:         '🏆',
        lost:           '❌',
      }
      const title = [projectName, unitNumber].filter(Boolean).join(' · ') || '(No unit)'
      const buyer = buyerName ?? buyerFirst ?? 'No buyer'
      return {
        title,
        subtitle: `${stageEmoji[dealStage] ?? ''} ${buyer}`,
      }
    },
  },
})
