import { defineField, defineType } from 'sanity'

/**
 * ApprovalRequest — one record per stage per approval flow.
 * Written by the backend; read-only in Studio.
 * Provides a full audit trail of who approved what and when.
 */
export default defineType({
  name:  'approvalRequest',
  title: 'Approval Request',
  type:  'document',

  fields: [
    defineField({ name: 'contract',     title: 'Contract',      type: 'reference', to: [{ type: 'contract' }], readOnly: true }),
    defineField({ name: 'documentType', title: 'Document Type', type: 'string',    readOnly: true }), // quotation | contract
    defineField({ name: 'stage',        title: 'Stage',         type: 'number',    readOnly: true }),
    defineField({ name: 'totalStages',  title: 'Total Stages',  type: 'number',    readOnly: true }),
    defineField({ name: 'stageLabel',   title: 'Stage Label',   type: 'string',    readOnly: true }),
    defineField({ name: 'approver',     title: 'Approver',      type: 'reference', to: [{ type: 'approvalPosition' }], readOnly: true }),
    defineField({ name: 'approvalRule', title: 'Rule Applied',  type: 'reference', to: [{ type: 'approvalRule' }],     readOnly: true }),

    defineField({
      name:     'status',
      title:    'Status',
      type:     'string',
      readOnly: true,
      options:  { list: [
        { title: '⏳ Pending',   value: 'pending'   },
        { title: '✓ Approved',  value: 'approved'  },
        { title: '✗ Rejected',  value: 'rejected'  },
        { title: '— Cancelled', value: 'cancelled' },
        { title: '⏸ Waiting',   value: 'waiting'   }, // later stages before their turn
      ]},
    }),

    defineField({ name: 'requestedAt',     title: 'Requested At',     type: 'datetime', readOnly: true }),
    defineField({ name: 'respondedAt',     title: 'Responded At',     type: 'datetime', readOnly: true }),
    defineField({ name: 'rejectionReason', title: 'Rejection Reason', type: 'text',     readOnly: true }),

    // Hidden — used to verify approval links in emails
    defineField({ name: 'token', title: 'Token', type: 'string', hidden: true, readOnly: true }),
  ],

  preview: {
    select: {
      contract:     'contract.quotationNumber',
      contractNum:  'contract.contractNumber',
      docType:      'documentType',
      stage:        'stage',
      total:        'totalStages',
      approver:     'approver.title',
      status:       'status',
    },
    prepare({ contract, contractNum, docType, stage, total, approver, status }) {
      const ref    = contractNum ?? contract ?? '—'
      const icon   = status === 'approved' ? '✓' : status === 'rejected' ? '✗' : status === 'cancelled' ? '—' : '⏳'
      return {
        title:    `${ref} — ${docType ?? ''} Stage ${stage ?? '?'}/${total ?? '?'}`,
        subtitle: `${icon} ${approver ?? '—'}`,
      }
    },
  },
})
