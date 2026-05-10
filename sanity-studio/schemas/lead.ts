import { defineField, defineType } from 'sanity'

/**
 * Lead — a qualified property inquiry being tracked in the CRM.
 *
 * New leads are auto-created by the Firebase Function when a Firestore
 * lead document is written (kiosk/web submission). The contact fields
 * are copied from Firestore at sync time.
 *
 * Sales team works leads through: new → contacted → qualified → won / lost
 *
 * When a lead qualifies, create a Party record and link it here.
 * For rent leads → create a Contract.
 * For sale leads → create a Sale Opportunity (Phase F).
 */
export default defineType({
  name:  'lead',
  title: 'Lead',
  type:  'document',

  groups: [
    { name: 'overview', title: 'Overview', default: true },
    { name: 'contact',  title: 'Contact Info'            },
    { name: 'notes',    title: 'Notes'                   },
  ],

  fields: [

    // ── Overview ──────────────────────────────────────────────────────────────

    defineField({
      group:       'overview',
      name:        'status',
      title:       'Status',
      type:        'string',
      options: {
        list: [
          { title: '🆕 New',          value: 'new'       },
          { title: '📞 Contacted',    value: 'contacted' },
          { title: '✅ Qualified',    value: 'qualified' },
          { title: '🏆 Won',          value: 'won'       },
          { title: '❌ Lost',         value: 'lost'      },
        ],
        layout: 'radio',
      },
      initialValue: 'new',
      validation:   Rule => Rule.required(),
    }),

    defineField({
      group:  'overview',
      name:   'interestType',
      title:  'Interest Type',
      type:   'string',
      options: {
        list: [
          { title: '📺 Signage Rental (Rent)', value: 'rent' },
          { title: '🏠 Property Purchase (Sale)', value: 'sale' },
        ],
        layout: 'radio',
      },
    }),

    defineField({
      group:  'overview',
      name:   'source',
      title:  'Lead Source',
      type:   'string',
      options: {
        list: [
          { title: '🖥️ Kiosk',      value: 'kiosk'    },
          { title: '🌐 Web',         value: 'web'      },
          { title: '🤝 Referral',    value: 'referral' },
          { title: '👋 Direct',      value: 'direct'   },
          { title: 'Other',          value: 'other'    },
        ],
      },
      initialValue: 'kiosk',
    }),

    defineField({
      group:       'overview',
      name:        'party',
      title:       'Linked Party',
      type:        'reference',
      to:          [{ type: 'party' }],
      description: 'Link to a Party record once the contact is confirmed and qualified.',
    }),

    defineField({
      group:  'overview',
      name:   'assignedTo',
      title:  'Assigned To',
      type:   'string',
      description: 'Sales person responsible for this lead.',
    }),

    defineField({
      group:  'overview',
      name:   'followUpDate',
      title:  'Next Follow-up Date',
      type:   'date',
    }),

    defineField({
      group:    'overview',
      name:     'firestoreLeadId',
      title:    'Firestore Lead ID',
      type:     'string',
      readOnly: true,
      description: 'Auto-set when synced from Firestore. Do not edit.',
    }),

    // ── Contact Info ──────────────────────────────────────────────────────────

    defineField({
      group:       'contact',
      name:        'contactName',
      title:       'Contact Name',
      type:        'string',
      description: 'Name as submitted in the inquiry form.',
    }),

    defineField({
      group:  'contact',
      name:   'contactPhone',
      title:  'Phone',
      type:   'string',
    }),

    defineField({
      group:  'contact',
      name:   'contactEmail',
      title:  'Email',
      type:   'string',
    }),

    defineField({
      group:  'contact',
      name:   'contactLineId',
      title:  'LINE ID',
      type:   'string',
    }),

    defineField({
      group:       'contact',
      name:        'unitInterest',
      title:       'Unit / Property of Interest',
      type:        'string',
      description: 'Unit ID or description from the inquiry.',
    }),

    defineField({
      group:  'contact',
      name:   'preferredTime',
      title:  'Preferred Contact / Viewing Time',
      type:   'string',
    }),

    defineField({
      group:  'contact',
      name:   'budget',
      title:  'Budget (THB)',
      type:   'number',
    }),

    // ── Notes ─────────────────────────────────────────────────────────────────

    defineField({
      group:  'notes',
      name:   'notes',
      title:  'Notes',
      type:   'text',
      rows:   5,
    }),

  ],

  preview: {
    select: {
      name:         'contactName',
      status:       'status',
      interestType: 'interestType',
      source:       'source',
    },
    prepare({ name, status, interestType, source }) {
      const statusEmoji: Record<string, string> = {
        new: '🆕', contacted: '📞', qualified: '✅', won: '🏆', lost: '❌',
      }
      const typeLabel: Record<string, string> = { rent: 'Rent', sale: 'Sale' }
      return {
        title:    name ?? '(No name)',
        subtitle: [statusEmoji[status] ?? '', typeLabel[interestType ?? ''] ?? '', source].filter(Boolean).join(' · '),
      }
    },
  },
})
