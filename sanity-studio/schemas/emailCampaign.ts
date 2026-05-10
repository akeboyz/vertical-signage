import { defineField, defineType } from 'sanity'
import { CampaignBriefInput } from '../components/CampaignBriefInput'

/**
 * Email Campaign — single-page linear flow
 *
 * ① Title + audience (who to send to)
 * ② Campaign brief → click "✨ AI Generate" → fields auto-fill
 * ③ Subject, image suggestions, body TH, body EN (all generated, freely editable)
 * ④ Send log (read-only, shows after "📧 Send Campaign" is clicked)
 *
 * Recipient targeting uses party.linkedProvider to distinguish:
 *   prospects_only  – advertiser Parties with no linkedProvider
 *   clients_only    – advertiser Parties that have a linkedProvider
 *   all_advertisers – all advertiser Parties
 */
export default defineType({
  name:  'emailCampaign',
  title: 'Email Campaign',
  type:  'document',

  fields: [

    // ── ① Identity & audience ─────────────────────────────────────────────────

    defineField({
      name:        'title',
      title:       'Campaign Title',
      type:        'string',
      description: 'Internal name — not shown to recipients.',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      name:  'recipientFilter',
      title: 'Send To',
      type:  'string',
      options: {
        list: [
          { title: '🌱 Prospects Only — advertisers with no active contract', value: 'prospects_only'  },
          { title: '⭐ Clients Only — advertisers with an active Provider',   value: 'clients_only'   },
          { title: '📢 All Advertisers — everyone with the advertiser role',  value: 'all_advertisers' },
        ],
        layout: 'radio',
      },
      initialValue: 'prospects_only',
      validation:   Rule => Rule.required(),
    }),

    // ── ② Campaign brief (AI input) ───────────────────────────────────────────

    defineField({
      name:        'aiBrief',
      title:       'Campaign Idea',
      type:        'text',
      rows:        5,
      description: 'Describe your idea in plain language — promotion, target industry, tone, key message.',
      components:  { input: CampaignBriefInput },
    }),

    // ── ③ Generated content (AI fills these; freely editable) ────────────────

    defineField({
      name:        'subject',
      title:       'Email Subject',
      type:        'string',
      description: 'Auto-filled by AI — edit as needed before sending.',
    }),

    defineField({
      name:        'imageSuggestions',
      title:       'Image / Visual Suggestions',
      type:        'text',
      rows:        4,
      description: 'AI-generated visual concepts. Use as creative brief for your designer.',
    }),

    defineField({
      name:        'body_th',
      title:       'Email Body — Thai',
      type:        'text',
      rows:        14,
      description: 'Primary body sent to recipients (Thai). Auto-filled by AI — edit as needed.',
    }),

    defineField({
      name:        'body_en',
      title:       'Email Body — English',
      type:        'text',
      rows:        14,
      description: 'English version. Used as fallback if Thai body is blank.',
    }),

    // ── ④ Send status + log (system fields, set by SendCampaignAction) ────────

    defineField({
      name:         'status',
      title:        'Status',
      type:         'string',
      options: {
        list: [
          { title: '📝 Draft', value: 'draft' },
          { title: '✅ Sent',  value: 'sent'  },
        ],
        layout: 'radio',
      },
      initialValue: 'draft',
      readOnly:     true,
      description:  'Set automatically when the campaign is sent.',
    }),

    defineField({
      name:     'sentAt',
      title:    'Sent At',
      type:     'datetime',
      readOnly: true,
    }),

    defineField({
      name:     'recipientCount',
      title:    'Recipients Sent To',
      type:     'number',
      readOnly: true,
    }),

    defineField({
      name:        'sendLog',
      title:       'Send Log',
      type:        'text',
      rows:        8,
      readOnly:    true,
      description: 'Per-recipient results (OK / FAIL / SKIP).',
    }),

  ],

  preview: {
    select: {
      title:           'title',
      status:          'status',
      recipientFilter: 'recipientFilter',
      sentAt:          'sentAt',
    },
    prepare({ title, status, recipientFilter, sentAt }) {
      const icon: Record<string, string> = { draft: '📝', sent: '✅' }
      const audience: Record<string, string> = {
        all_advertisers: 'All advertisers',
        prospects_only:  'Prospects only',
        clients_only:    'Clients only',
      }
      const date = sentAt ? `  ·  ${sentAt.slice(0, 10)}` : ''
      return {
        title:    title || '(Untitled campaign)',
        subtitle: `${icon[status] ?? '📝'} ${status ?? 'draft'}  ·  ${audience[recipientFilter] ?? ''}${date}`,
      }
    },
  },
})
