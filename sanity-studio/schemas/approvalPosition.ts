import { defineField, defineType } from 'sanity'

/**
 * ApprovalPosition — a company position with a shared email address.
 * Approval is tied to the position, not the individual.
 * Staff turnover does not require schema changes.
 */
export default defineType({
  name:  'approvalPosition',
  title: 'Approval Position',
  type:  'document',

  fields: [
    defineField({ name: 'title',       title: 'Position Title', type: 'string', validation: Rule => Rule.required() }),
    defineField({ name: 'email',       title: 'Email Address',  type: 'string', validation: Rule => Rule.required().email() }),
    defineField({ name: 'description', title: 'Description',    type: 'string' }),
    defineField({ name: 'isActive',    title: 'Active',         type: 'boolean', initialValue: true }),
  ],

  preview: {
    select: { title: 'title', subtitle: 'email', active: 'isActive' },
    prepare({ title, subtitle, active }) {
      return {
        title:    `${active === false ? '(Inactive) ' : ''}${title ?? '—'}`,
        subtitle: subtitle ?? '—',
      }
    },
  },
})
