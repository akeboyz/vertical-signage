import { defineField, defineType }       from 'sanity'
import { ProjectNameTranslateInput }     from '../components/ProjectNameTranslateInput'

/**
 * Project Site — master record for a condo/property project.
 * Referenced by Contract documents.
 */
export default defineType({
  name: 'projectSite',
  title: 'Project Site',
  type: 'document',

  fields: [
    defineField({ name: 'projectEn',                 title: 'Project Name (EN)',           type: 'string', validation: Rule => Rule.required() }),
    defineField({ name: 'projectTh', title: 'Project Name (TH)', type: 'string', components: { input: ProjectNameTranslateInput } }),
    defineField({ name: 'address',                   title: 'Address',                     type: 'text',   rows: 2 }),
    defineField({ name: 'btsStation',                title: 'BTS / MRT Station',           type: 'string' }),
    defineField({ name: 'area',                      title: 'Area',                        type: 'string' }),
    defineField({ name: 'googleMapUrl',              title: 'Google Map URL',              type: 'url'    }),
    defineField({ name: 'totalUnits',                title: 'Total Units',                 type: 'number' }),
    defineField({ name: 'numberOfBuildings',         title: 'No. of Buildings',            type: 'number' }),
    defineField({ name: 'numberOfParking',           title: 'No. of Parking',              type: 'number' }),
    defineField({ name: 'commonFees',                title: 'Common Fees',                 type: 'string', description: 'e.g. "50 baht/sqm/month"' }),
    defineField({ name: 'totalProjectArea',          title: 'Total Project Area',          type: 'string', description: 'e.g. "2,400 sqm"' }),
    defineField({ name: 'developer',                 title: 'Developer',                   type: 'string' }),
    defineField({ name: 'completionYear',            title: 'Completion Year',             type: 'number' }),
    defineField({ name: 'percentSold',               title: '% Sold',                      type: 'number' }),
    defineField({ name: 'ownerOccupiedRented',       title: 'Owner Occupied & Rented',     type: 'string' }),
    defineField({ name: 'competitionAtSite',         title: 'Competition at Site',         type: 'text',   rows: 2 }),
    defineField({ name: 'contactPerson',             title: 'Contact Person',              type: 'string' }),
    defineField({ name: 'telephone',                 title: 'Telephone',                   type: 'string' }),
    defineField({ name: 'propertyManagementCompany', title: 'Property Management Company', type: 'string' }),
    defineField({ name: 'emailAddress',              title: 'Email Address',               type: 'string' }),
    defineField({ name: 'approvalStatus',      title: 'Approval Status',    type: 'string',   hidden: true }),
    defineField({ name: 'approvalResetReason', title: 'Reset Reason',       type: 'string',   hidden: true }),
    defineField({ name: 'approvedAt',          title: 'Approved At',        type: 'datetime', hidden: true }),
    defineField({ name: 'notificationEmail',   title: 'Notification Email', type: 'string',   hidden: true }),
  ],

  preview: {
    select: { title: 'projectEn', subtitle: 'projectTh' },
  },
})
