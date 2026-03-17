import { defineField, defineType, defineArrayMember } from 'sanity'

/**
 * ApprovalRule — configures who must approve and under what conditions.
 *
 * Rules are evaluated in priority order (lower number = checked first).
 * The first matching rule wins. A rule with no conditions is a default
 * catch-all and should have the highest priority number.
 *
 * All conditions in one rule must be true (AND logic).
 *
 * approvalStages defines the sequential order of approvers.
 * Each stage must be completed before the next is notified.
 */
export default defineType({
  name:  'approvalRule',
  title: 'Approval Rule',
  type:  'document',

  fields: [
    defineField({
      name:  'name',
      title: 'Rule Name',
      type:  'string',
      validation: Rule => Rule.required(),
    }),

    defineField({
      name:    'documentType',
      title:   'Applies To',
      type:    'string',
      options: { list: [
        { title: 'Quotation',       value: 'quotation' },
        { title: 'Contract',        value: 'contract'  },
        { title: 'Both',            value: 'both'      },
      ]},
      validation: Rule => Rule.required(),
    }),

    defineField({
      name:         'isActive',
      title:        'Active',
      type:         'boolean',
      initialValue: true,
    }),

    defineField({
      name:        'priority',
      title:       'Priority',
      type:        'number',
      description: 'Lower number = evaluated first. Use 999 for the default catch-all rule.',
      validation:  Rule => Rule.required().min(1),
    }),

    // ── Conditions ────────────────────────────────────────────────────────────
    defineField({
      name:        'conditions',
      title:       'Conditions',
      description: 'All conditions must match (AND logic). Leave empty to match everything (default rule).',
      type:        'array',
      of: [
        defineArrayMember({
          type:   'object',
          name:   'condition',
          title:  'Condition',
          fields: [
            defineField({
              name:    'field',
              title:   'Field',
              type:    'string',
              options: { list: [
                { title: 'Rental Rate',    value: 'rentalRate'  },
                { title: 'Electricity',    value: 'electricity' },
                { title: 'Starting Date',  value: 'startingDate' },
                { title: 'Ending Date',    value: 'endingDate'  },
              ]},
            }),
            defineField({
              name:    'operator',
              title:   'Operator',
              type:    'string',
              options: { list: [
                { title: '>  (greater than)',          value: 'gt'  },
                { title: '>= (greater than or equal)', value: 'gte' },
                { title: '<  (less than)',              value: 'lt'  },
                { title: '<= (less than or equal)',     value: 'lte' },
                { title: '=  (equals)',                 value: 'eq'  },
              ]},
            }),
            defineField({
              name:        'value',
              title:       'Value',
              type:        'string',
              description: 'For numeric fields use numbers (e.g. 50000). For dates use YYYY-MM-DD.',
            }),
          ],
          preview: {
            select: { field: 'field', operator: 'operator', value: 'value' },
            prepare({ field, operator, value }) {
              return { title: `${field ?? '?'} ${operator ?? '?'} ${value ?? '?'}` }
            },
          },
        }),
      ],
    }),

    // ── Approval Stages ───────────────────────────────────────────────────────
    defineField({
      name:        'approvalStages',
      title:       'Approval Stages',
      description: 'Stages are executed in order. Each must be approved before the next is notified.',
      type:        'array',
      validation:  Rule => Rule.required().min(1),
      of: [
        defineArrayMember({
          type:   'object',
          name:   'stage',
          title:  'Stage',
          fields: [
            defineField({
              name:  'label',
              title: 'Stage Label',
              type:  'string',
              description: 'e.g. "Sales Manager Review"',
              validation: Rule => Rule.required(),
            }),
            defineField({
              name:       'approver',
              title:      'Approver',
              type:       'reference',
              to:         [{ type: 'approvalPosition' }],
              validation: Rule => Rule.required(),
            }),
          ],
          preview: {
            select: { label: 'label', approver: 'approver.title' },
            prepare({ label, approver }) {
              return { title: label ?? '—', subtitle: approver ?? '—' }
            },
          },
        }),
      ],
    }),
  ],

  preview: {
    select: { title: 'name', type: 'documentType', active: 'isActive', priority: 'priority' },
    prepare({ title, type, active, priority }) {
      return {
        title:    `${active === false ? '(Inactive) ' : ''}${title ?? '—'}`,
        subtitle: `${type ?? '—'} — priority ${priority ?? '?'}`,
      }
    },
  },
})
