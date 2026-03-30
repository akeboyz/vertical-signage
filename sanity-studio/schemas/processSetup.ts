import { defineField, defineType, defineArrayMember } from 'sanity'
import { TranslateFromSelect }    from '../components/TranslateFromSelect'
import { FormulaBaseFieldSelect }   from '../components/FormulaBaseFieldSelect'
import { FormulaAmountFieldSelect } from '../components/FormulaAmountFieldSelect'
import { StepDocKeySelect }   from '../components/StepDocKeySelect'
import { StepFieldKeySelect } from '../components/StepFieldKeySelect'

/**
 * Process Setup — configures both the Contract Phase and Installation Phase
 * for a given deal/product type (e.g. "Vertical LED 55" Indoor").
 *
 * Replaces the old "Contract Type" concept.
 * Internal _type remains 'contractType' for backwards compatibility with existing data.
 *
 * Section 1 — Contract Phase Config  (numbering, templates, dynamic fields)
 * Section 2 — Installation Phase Config  (required stages, install fields, checklist)
 */
export default defineType({
  name:  'contractType',       // ← internal name kept for data compatibility
  title: 'Process Setup',
  type:  'document',

  groups: [
    { name: 'identity', title: 'Identity'       },
    { name: 'asset',    title: 'Asset Config'   },
    { name: 'workflow', title: 'Pipeline Steps' },
    { name: 'contract', title: 'Contract Phase' },
  ],

  fields: [

    // ── Identity ────────────────────────────────────────────────────────────────

    defineField({
      group:       'identity',
      name:        'name',
      title:       'Process Name',
      type:        'string',
      description: 'e.g. "Vertical LED 55\\" Indoor", "Outdoor Billboard"',
      validation:  Rule => Rule.required(),
    }),

    defineField({
      group:       'identity',
      name:        'isActive',
      title:       'Active',
      type:        'boolean',
      description: 'Inactive setups are hidden from selectors.',
      initialValue: true,
    }),

    defineField({
      group:       'identity',
      name:        'description',
      title:       'Description',
      type:        'text',
      rows:        2,
      description: 'Optional internal note about when to use this process setup.',
    }),

    defineField({
      group:        'identity',
      name:         'useProjectSite',
      title:        'Requires Project Site',
      type:         'boolean',
      description:  'Show the Project Site reference field on activities using this setup.',
      initialValue: true,
    }),

    defineField({
      group:        'identity',
      name:         'useParty',
      title:        'Requires Party',
      type:         'boolean',
      description:  'Show the Party reference field on activities using this setup.',
      initialValue: true,
    }),

    defineField({
      group:        'identity',
      name:         'useForProcurement',
      title:        'Use for Procurement',
      type:         'boolean',
      description:  'Mark this as the Process Setup for Procurement documents. Only one setup should have this enabled.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useForPayment',
      title:        'Use for Payment',
      type:         'boolean',
      description:  'Mark this as the Process Setup for Payment documents. Only one setup should have this enabled.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'useAssetConfig',
      title:        'Use Asset Config',
      type:         'boolean',
      description:  'Enable Asset Types and Spec Fields for processes that involve physical assets (e.g. Procurement, Installation). Disable for Rent Space or other non-asset processes.',
      initialValue: false,
    }),

    defineField({
      group:        'identity',
      name:         'usePaymentStatus',
      title:        'Show Payment Status on Procurement',
      type:         'boolean',
      description:  'Show a Payment Status summary field on Procurement documents using this setup.',
      initialValue: true,
    }),

    defineField({
      group:        'identity',
      name:         'useProcurementStatus',
      title:        'Show Procurement Status on Payment',
      type:         'boolean',
      description:  'Show a Procurement Status summary field on Payment documents using this setup.',
      initialValue: true,
    }),

    // ── Asset Config ─────────────────────────────────────────────────────────────

    defineField({
      group:       'asset',
      name:        'assetTypes',
      title:       'Asset Types',
      type:        'array',
      description: 'Define the types of assets used in this process (e.g. LED Screen, Media Player, Application). Each type has its own spec fields for comparison and tracking.',
      hidden:      ({ document }) => !(document?.useAssetConfig as boolean),
      of: [defineArrayMember({
        type:  'object',
        name:  'assetType',
        title: 'Asset Type',
        fields: [
          defineField({
            name:        'key',
            title:       'Key',
            type:        'string',
            description: 'Machine-readable identifier, no spaces. e.g. "led_screen", "media_player", "application".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'name',
            title:       'Display Name',
            type:        'string',
            description: 'Human-readable name shown in Asset and Procurement forms. e.g. "LED Screen 55\\"", "Media Player".',
            validation:  Rule => Rule.required(),
          }),
          defineField({
            name:        'specGroups',
            title:       'Spec Groups',
            type:        'array',
            description: 'Group spec fields into sections (e.g. Basic Info, Display Spec, Hardware). Each group has a name and its own list of fields.',
            of: [defineArrayMember({
              type:  'object',
              name:  'specGroup',
              title: 'Spec Group',
              fields: [
                defineField({
                  name:        'groupName',
                  title:       'Group Name',
                  type:        'string',
                  description: 'Section header shown in Asset / Procurement forms. e.g. "Basic Info", "Display Spec", "Network".',
                  validation:  Rule => Rule.required(),
                }),
                defineField({
                  name:        'specFields',
                  title:       'Spec Fields',
                  type:        'array',
                  description: 'Fields in this group.',
                  of: [defineArrayMember({
                    type:  'object',
                    name:  'specField',
                    title: 'Spec Field',
                    fields: [
                      defineField({
                        name:        'key',
                        title:       'Key',
                        type:        'string',
                        description: 'Machine-readable identifier. e.g. "resolution", "brightness", "sim_provider".',
                        validation:  Rule => Rule.required(),
                      }),
                      defineField({
                        name:        'label',
                        title:       'Label',
                        type:        'string',
                        description: 'Display name shown on Asset / Procurement forms. e.g. "Resolution", "Brightness (nits)".',
                        validation:  Rule => Rule.required(),
                      }),
                      defineField({
                        name:         'fieldType',
                        title:        'Field Type',
                        type:         'string',
                        initialValue: 'string',
                        options: {
                          list: [
                            { title: 'Short text', value: 'string' },
                            { title: 'Number',     value: 'number' },
                            { title: 'Long text',  value: 'text'   },
                            { title: 'Yes / No',   value: 'yes_no' },
                          ],
                        },
                        validation: Rule => Rule.required(),
                      }),
                    ],
                    preview: {
                      select: { title: 'label', subtitle: 'fieldType', key: 'key' },
                      prepare({ title, subtitle, key }: { title?: string; subtitle?: string; key?: string }) {
                        return { title: title ?? '—', subtitle: `{{${key ?? '?'}}} · ${subtitle ?? 'string'}` }
                      },
                    },
                  })],
                }),
              ],
              preview: {
                select: { groupName: 'groupName', fields: 'specFields' },
                prepare({ groupName, fields }: { groupName?: string; fields?: any[] }) {
                  return {
                    title:    groupName ?? '—',
                    subtitle: `${(fields ?? []).length} field(s)`,
                  }
                },
              },
            })],
          }),
        ],
        preview: {
          select: { name: 'name', key: 'key', groups: 'specGroups' },
          prepare({ name, key, groups }: { name?: string; key?: string; groups?: any[] }) {
            const fieldCount = (groups ?? []).reduce((sum: number, g: any) => sum + (g.specFields?.length ?? 0), 0)
            return {
              title:    name ?? key ?? '—',
              subtitle: `key: ${key ?? '?'} · ${(groups ?? []).length} group(s) · ${fieldCount} field(s)`,
            }
          },
        },
      })],
    }),

    // ── Pipeline Steps ───────────────────────────────────────────────────────────

    defineField({
      group:       'workflow',
      name:        'steps',
      title:       'Pipeline Steps',
      type:        'array',
      description: 'Define the stages of this process. Each step advances automatically when its trigger condition is met.',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name:        'key',
              title:       'Key',
              type:        'string',
              description: 'Machine-readable identifier. e.g. "quotation_approved", "contract_signed".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'label',
              title:       'Label',
              type:        'string',
              description: 'Display name shown in the pipeline bar. e.g. "Quotation Approved".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:         'tone',
              title:        'Colour',
              type:         'string',
              description:  'Colour of this step in the pipeline bar.',
              initialValue: 'default',
              options: {
                list: [
                  { title: 'Default (grey)',  value: 'default'  },
                  { title: 'Positive (green)', value: 'positive' },
                  { title: 'Caution (yellow)', value: 'caution'  },
                  { title: 'Critical (red)',   value: 'critical' },
                ],
              },
            }),
            defineField({
              name:        'triggerType',
              title:       'Trigger',
              type:        'string',
              description: 'What event moves the activity to this step.',
              validation:  Rule => Rule.required(),
              options: {
                list: [
                  { title: '🌱 Created — when the activity is first created',           value: 'created'        },
                  { title: '📨 Doc Submitted — document sent for approval',             value: 'doc_submitted'  },
                  { title: '✅ Doc Approved — document fully approved',                  value: 'doc_approved'   },
                  { title: '❌ Doc Rejected — document rejected by an approver',         value: 'doc_rejected'   },
                  { title: '📄 Doc Generated — Google Doc successfully generated',      value: 'doc_generated'  },
                  { title: '🔑 Field Equals — a field reaches a specific value',        value: 'field_equals'   },
                ],
              },
            }),

            // Shown only for doc_* triggers
            defineField({
              name:        'docKey',
              title:       'Document',
              type:        'string',
              description: 'Which document does this trigger apply to?',
              hidden:      ({ parent }: any) => !['doc_submitted','doc_approved','doc_rejected','doc_generated'].includes(parent?.triggerType),
              components:  { input: StepDocKeySelect },
            }),

            // Shown only for field_equals trigger
            defineField({
              name:        'fieldKey',
              title:       'Field',
              type:        'string',
              description: 'Which field to watch.',
              hidden:      ({ parent }: any) => parent?.triggerType !== 'field_equals',
              components:  { input: StepFieldKeySelect },
            }),
            defineField({
              name:        'fieldValue',
              title:       'Value',
              type:        'string',
              description: 'The value that triggers this step. For Yes/No fields use "yes". e.g. "yes", "paid", "done".',
              hidden:      ({ parent }: any) => parent?.triggerType !== 'field_equals',
            }),
          ],
          preview: {
            select: {
              label:       'label',
              triggerType: 'triggerType',
              docKey:      'docKey',
              fieldKey:    'fieldKey',
              fieldValue:  'fieldValue',
              tone:        'tone',
            },
            prepare({ label, triggerType, docKey, fieldKey, fieldValue, tone }: {
              label?: string; triggerType?: string; docKey?: string
              fieldKey?: string; fieldValue?: string; tone?: string
            }) {
              const toneIcon: Record<string, string> = {
                positive: '🟢', caution: '🟡', critical: '🔴', default: '⚪',
              }
              const triggerDesc =
                triggerType === 'created'       ? 'on create'
                : triggerType === 'doc_submitted' ? `doc submitted → ${docKey ?? '?'}`
                : triggerType === 'doc_approved'  ? `doc approved → ${docKey ?? '?'}`
                : triggerType === 'doc_rejected'  ? `doc rejected → ${docKey ?? '?'}`
                : triggerType === 'doc_generated' ? `doc generated → ${docKey ?? '?'}`
                : triggerType === 'field_equals'  ? `${fieldKey ?? '?'} = "${fieldValue ?? '?'}"`
                : triggerType ?? '?'
              return {
                title:    `${toneIcon[tone ?? 'default'] ?? '⚪'} ${label ?? '—'}`,
                subtitle: triggerDesc,
              }
            },
          },
        }),
      ],
    }),

    // ── Contract Phase ───────────────────────────────────────────────────────────

    defineField({
      group:       'contract',
      name:        'documents',
      title:       'Documents',
      type:        'array',
      description: 'Each entry defines one document this process can generate (e.g. Quotation, Contract, Receipt).',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name:        'key',
              title:       'Key',
              type:        'string',
              description: 'Machine-readable identifier used as the document type. e.g. "quotation", "contract", "receipt". Must be unique within this process.',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'name',
              title:       'Document Name',
              type:        'string',
              description: 'Display name shown in the Generate tab. e.g. "Rental Quotation", "Rental Agreement".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'description',
              title:       'Description',
              type:        'string',
              description: 'Optional note shown in the Generate tab.',
            }),
            defineField({
              name:        'numberPrefix',
              title:       'Number Prefix',
              type:        'string',
              description: 'e.g. "QTJ" → generates QTJ-2026-03-001. 2–5 uppercase letters.',
              validation:  Rule => Rule.required().uppercase().min(2).max(5),
            }),
            defineField({
              name:        'templateId',
              title:       'Google Doc Template ID',
              type:        'string',
              description: 'The ID from the Google Doc URL: docs.google.com/document/d/THIS_PART/edit',
            }),
          ],
          preview: {
            select: { name: 'name', prefix: 'numberPrefix', key: 'key' },
            prepare({ name, prefix, key }: { name?: string; prefix?: string; key?: string }) {
              return {
                title:    name ?? key ?? '—',
                subtitle: `key: ${key ?? '?'} · prefix: ${prefix ?? '?'}`,
              }
            },
          },
        }),
      ],
    }),

    defineField({
      group:       'contract',
      name:        'projectSiteFields',
      title:       'Project Site Fields',
      type:        'array',
      description: 'Select which Project Site fields to include in this activity form.',
      of:          [{ type: 'string' }],
      options: {
        list: [
          { title: 'Project Name (EN)',           value: 'projectEn'                },
          { title: 'Project Name (TH)',           value: 'projectTh'                },
          { title: 'Address',                     value: 'address'                  },
          { title: 'BTS / MRT Station',           value: 'btsStation'               },
          { title: 'Area',                        value: 'area'                     },
          { title: 'Total Units',                 value: 'totalUnits'               },
          { title: 'No. of Buildings',            value: 'numberOfBuildings'        },
          { title: 'No. of Parking',              value: 'numberOfParking'          },
          { title: 'Common Fees',                 value: 'commonFees'               },
          { title: 'Total Project Area',          value: 'totalProjectArea'         },
          { title: 'Developer',                   value: 'developer'                },
          { title: 'Completion Year',             value: 'completionYear'           },
          { title: '% Sold',                      value: 'percentSold'              },
          { title: 'Owner Occupied & Rented',     value: 'ownerOccupiedRented'      },
          { title: 'Contact Person',              value: 'contactPerson'            },
          { title: 'Telephone',                   value: 'telephone'                },
          { title: 'Property Management Company', value: 'propertyManagementCompany'},
          { title: 'Email Address',               value: 'emailAddress'             },
        ],
      },
    }),

    defineField({
      group:       'contract',
      name:        'partyFields',
      title:       'Party Fields',
      type:        'array',
      description: 'Select which Party fields to include in this activity form.',
      of:          [{ type: 'string' }],
      options: {
        list: [
          { title: 'Legal Name (Thai)',        value: 'legalName_th'   },
          { title: 'Legal Name (English)',     value: 'legalName_en'   },
          { title: 'Tax ID',                   value: 'taxId'          },
          { title: 'Company Registration No.', value: 'registrationNo' },
          { title: 'Contact Person / Manager in-charge', value: 'juristicManager'},
          { title: 'First Name',               value: 'firstName'      },
          { title: 'Last Name',                value: 'lastName'        },
          { title: 'National ID',              value: 'nationalId'     },
          { title: 'Phone',                    value: 'phone'          },
          { title: 'Email',                    value: 'email'          },
          { title: 'LINE ID',                  value: 'lineId'         },
          { title: 'Address',                  value: 'addressFull'    },
          { title: 'VAT Number',               value: 'vatNumber'      },
          { title: 'Billing Address',          value: 'billingAddress' },
        ],
      },
    }),

    defineField({
      group:       'contract',
      name:        'fieldDefinitions',
      title:       'Activity Dynamic Fields',
      type:        'array',
      description: 'Define the fields for this contract type. The Key must match the {{placeholder}} used in your Google Doc template.',
      of: [
        defineArrayMember({
          type: 'object',
          fields: [
            defineField({
              name:        'key',
              title:       'Key',
              type:        'string',
              description: 'Machine-readable, no spaces. e.g. "rentalRate" → used as {{rentalRate}} in the template.',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:        'label',
              title:       'Label',
              type:        'string',
              description: 'Human-readable label shown in the contract form. e.g. "Rental Rate".',
              validation:  Rule => Rule.required(),
            }),
            defineField({
              name:         'fieldType',
              title:        'Field Type',
              type:         'string',
              initialValue: 'string',
              options: {
                list: [
                  { title: 'Short text',    value: 'string'        },
                  { title: 'Number',        value: 'number'        },
                  { title: 'Date',          value: 'date'          },
                  { title: 'Long text',     value: 'text'          },
                  { title: 'Yes / No',      value: 'yes_no'        },
                ],
              },
              validation: Rule => Rule.required(),
            }),
            defineField({
              name:         'required',
              title:        'Required',
              type:         'boolean',
              initialValue: false,
            }),
            defineField({
              name:         'showInEmail',
              title:        'Show in approval email',
              type:         'boolean',
              initialValue: true,
            }),
            defineField({
              name:         'isMaterialTerm',
              title:        'Material Term (protected after approval)',
              type:         'boolean',
              description:  'If checked, changes to this field after contract approval will block document generation and require re-approval.',
              initialValue: false,
            }),
            defineField({
              name:        'hint',
              title:       'Field Description / Hint',
              type:        'string',
              description: 'Optional helper text shown below the input. e.g. "Enter monthly rate in THB, numbers only".',
            }),
            defineField({
              name:        'formula',
              title:       'Date Formula (Auto-calculate)',
              type:        'object',
              description: 'For date fields only. Auto-fills this field by adding a duration to another date field.',
              options:     { collapsible: true, collapsed: true },
              fields: [
                defineField({
                  name:        'baseField',
                  title:       'Start from field',
                  type:        'string',
                  description: 'Pick the date field to calculate from. Publish first if the list is empty.',
                  components:  { input: FormulaBaseFieldSelect },
                }),
                defineField({
                  name:        'amountField',
                  title:       'Add (from field)',
                  type:        'string',
                  description: 'Pick a number/text field whose value is the duration to add.',
                  components:  { input: FormulaAmountFieldSelect },
                }),
                defineField({
                  name:         'unit',
                  title:        'Unit',
                  type:         'string',
                  initialValue: 'months',
                  options: {
                    list: [
                      { title: 'Days',   value: 'days'   },
                      { title: 'Months', value: 'months' },
                      { title: 'Years',  value: 'years'  },
                    ],
                  },
                }),
              ],
            }),
            defineField({
              name:        'translateFrom',
              title:       'Auto-translate from field',
              type:        'string',
              description: 'Pick a field to translate from. Publish this Process Setup first if the list is empty.',
              components:  { input: TranslateFromSelect },
            }),
            defineField({
              name:         'translateTargetLang',
              title:        'Translate to language',
              type:         'string',
              description:  'Target language for the auto-translate button.',
              initialValue: 'English',
              hidden:       ({ parent }: any) => !parent?.translateFrom,
              options: {
                list: [
                  { title: 'English', value: 'English' },
                  { title: 'Thai',    value: 'Thai'    },
                ],
              },
            }),
            defineField({
              name:         'retrieveFromProjectSite',
              title:        'Retrieve from Project Site',
              type:         'boolean',
              description:  'Show a "Retrieve from Project Site" button on this field.',
              initialValue: false,
            }),
            defineField({
              name:        'retrieveFromPsKey',
              title:       'Project Site Field Key',
              type:        'string',
              description: 'Which project site field to pull the value from. Only needed if the project site field key differs from this field\'s key.',
              hidden:      ({ parent }: any) => !parent?.retrieveFromProjectSite,
              options: {
                list: [
                  { title: 'Project Name (EN)',           value: 'projectEn'                 },
                  { title: 'Project Name (TH)',           value: 'projectTh'                 },
                  { title: 'Address',                     value: 'address'                   },
                  { title: 'BTS / MRT Station',           value: 'btsStation'                },
                  { title: 'Area',                        value: 'area'                      },
                  { title: 'Total Units',                 value: 'totalUnits'                },
                  { title: 'No. of Buildings',            value: 'numberOfBuildings'         },
                  { title: 'No. of Parking',              value: 'numberOfParking'           },
                  { title: 'Common Fees',                 value: 'commonFees'                },
                  { title: 'Total Project Area',          value: 'totalProjectArea'          },
                  { title: 'Developer',                   value: 'developer'                 },
                  { title: 'Completion Year',             value: 'completionYear'            },
                  { title: '% Sold',                      value: 'percentSold'               },
                  { title: 'Owner Occupied & Rented',     value: 'ownerOccupiedRented'       },
                  { title: 'Contact Person',              value: 'contactPerson'             },
                  { title: 'Telephone',                   value: 'telephone'                 },
                  { title: 'Property Management Company', value: 'propertyManagementCompany' },
                  { title: 'Email Address',               value: 'emailAddress'              },
                ],
              },
            }),
          ],
          preview: {
            select: { title: 'label', key: 'key', type: 'fieldType', tf: 'translateFrom', tl: 'translateTargetLang', fb: 'formula.baseField', fa: 'formula.amountField', fu: 'formula.unit', rfps: 'retrieveFromProjectSite', isMaterialTerm: 'isMaterialTerm' },
            prepare({ title, key, type, tf, tl, fb, fa, fu, rfps, isMaterialTerm }: { title?: string; key?: string; type?: string; tf?: string; tl?: string; fb?: string; fa?: string; fu?: string; rfps?: boolean; isMaterialTerm?: boolean }) {
              const extras = [
                isMaterialTerm ? '🔒 material term' : '',
                tf   ? `✨ → ${tl ?? 'English'} from {{${tf}}}` : '',
                fb && fa ? `📅 {{${fb}}} + {{${fa}}} ${fu ?? 'months'}` : '',
                rfps ? '↙ retrieve from project' : '',
              ].filter(Boolean).join(' · ')
              return {
                title:    title ?? '—',
                subtitle: `{{${key ?? '?'}}} · ${type ?? 'string'}${extras ? ` · ${extras}` : ''}`,
              }
            },
          },
        }),
      ],
    }),

  ],

  preview: {
    select: { title: 'name', docs: 'documents', active: 'isActive' },
    prepare({ title, docs, active }: { title?: string; docs?: { key?: string; numberPrefix?: string }[]; active?: boolean }) {
      const summary = (docs ?? [])
        .map(d => `${d.numberPrefix ?? '?'} (${d.key ?? '?'})`)
        .join(' · ')
      return {
        title:    `${active === false ? '(Inactive) ' : ''}${title ?? '—'}`,
        subtitle: summary || 'No documents configured',
      }
    },
  },
})
