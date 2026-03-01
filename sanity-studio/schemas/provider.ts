import { defineField, defineType } from 'sanity'

// Must stay in sync with offer.ts, media.ts, playlistItem.ts, categoryConfig.ts
const CATEGORY_LIST = [
  { title: 'Food',             value: 'food' },
  { title: 'Groceries',        value: 'groceries' },
  { title: 'Services',         value: 'services' },
  { title: 'For Rent',         value: 'forRent' },
  { title: 'For Sale',         value: 'forSale' },
  { title: 'Building Updates', value: 'buildingUpdates' },
]

// Providers are GLOBAL — no project reference.
// Category and sub-category filtering lives on Offer.
// Media assets belong to individual Offer documents (media.offer reference).

export default defineType({
  name: 'provider',
  title: 'Provider',
  type: 'document',
  fields: [
    // ── Classification ────────────────────────────────────────────────────────
    defineField({
      name: 'providerType',
      title: 'Provider Type',
      type: 'string',
      options: {
        list: [
          { title: 'Shop / Restaurant',   value: 'shop' },
          { title: 'Unit Owner or Agent', value: 'unitOwnerOrAgent' },
          { title: 'Juristic Office',     value: 'juristicOffice' },
        ],
        layout: 'radio',
      },
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'category',
      title: 'Category',
      type: 'string',
      options: { list: CATEGORY_LIST },
      validation: Rule => Rule.required(),
      description: 'Primary category for this provider.',
    }),

    // ── Identity ─────────────────────────────────────────────────────────────
    defineField({
      name: 'name_th',
      title: 'Name (Thai)',
      type: 'string',
      validation: Rule => Rule.required(),
    }),
    defineField({
      name: 'name_en',
      title: 'Name (English)',
      type: 'string',
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'name_th' },
      validation: Rule => Rule.required(),
      description: 'Used in kiosk deep link /m/{category}/{slug}.',
    }),
    defineField({
      name: 'status',
      title: 'Active',
      type: 'boolean',
      initialValue: true,
      description: 'Disable to hide this provider from all kiosk views.',
    }),
    defineField({
      name: 'displayName',
      title: 'Display Name Language',
      type: 'string',
      options: {
        list: [
          { title: 'Thai only',      value: 'th' },
          { title: 'English only',   value: 'en' },
          { title: 'Both (TH / EN)', value: 'both' },
        ],
        layout: 'radio',
      },
      initialValue: 'th',
    }),

    // ── Branding ─────────────────────────────────────────────────────────────
    defineField({ name: 'logo',       title: 'Logo',        type: 'image', options: { hotspot: true } }),
    defineField({ name: 'coverImage', title: 'Cover Image', type: 'image', options: { hotspot: true } }),
    defineField({ name: 'thumbnail',  title: 'Thumbnail',   type: 'image', options: { hotspot: true } }),

    // ── Description ───────────────────────────────────────────────────────────
    defineField({ name: 'description_th', title: 'Description (Thai)',    type: 'text', rows: 3 }),
    defineField({ name: 'description_en', title: 'Description (English)', type: 'text', rows: 3 }),

    // ── Contact & Location ────────────────────────────────────────────────────
    defineField({ name: 'locationText', title: 'Location',     type: 'string', description: 'e.g. G Floor, Zone A' }),
    defineField({ name: 'mapUrl',       title: 'Map URL',       type: 'url' }),
    defineField({ name: 'phone',        title: 'Phone',         type: 'string' }),
    defineField({ name: 'lineId',       title: 'LINE ID',       type: 'string' }),
    defineField({ name: 'website',      title: 'Website',       type: 'url' }),
    defineField({ name: 'openingHours', title: 'Opening Hours', type: 'string', description: 'e.g. 10:00–22:00' }),

    // ── Handoff ───────────────────────────────────────────────────────────────
    defineField({
      name: 'defaultHandoffType',
      title: 'Default Handoff Type',
      type: 'string',
      options: {
        list: [
          { title: 'QR Code', value: 'qr' },
          { title: 'SMS',     value: 'sms' },
          { title: 'Both',    value: 'both' },
        ],
        layout: 'radio',
      },
      initialValue: 'qr',
    }),
    defineField({
      name: 'unitRef',
      title: 'Unit Reference',
      type: 'string',
      description: 'Suffix only (e.g. "406"). Combined with project.addressBaseNumber → "120/406". Rent/sale only.',
    }),
  ],

  preview: {
    select: {
      nameTh:   'name_th',
      nameEn:   'name_en',
      slug:     'slug.current',
      category: 'category',
    },
    prepare({ nameTh, nameEn, slug, category }) {
      return {
        title:    nameTh ?? nameEn ?? slug ?? '(unnamed provider)',
        subtitle: category?.toUpperCase(),
      }
    },
  },
})
