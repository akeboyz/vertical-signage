/**
 * fieldDefs.ts — static metadata describing every importable field
 * for each schema type.
 *
 * These mirror the actual Sanity schemas (schemas/projectSite.ts and
 * schemas/contract.ts) but are kept as a separate static list so the
 * import tool stays independent of runtime schema introspection.
 *
 * Read-only / backend-written fields (generatedGoogleDocId, etc.) are
 * intentionally excluded.
 */

import type { FieldDef } from '../types'

export const projectSiteFields: FieldDef[] = [
  { name: 'projectName',               label: 'Project Name',                type: 'string', required: true,  isIdentifier: true  },
  { name: 'address',                   label: 'Address',                     type: 'text',   required: false, isIdentifier: false },
  { name: 'btsStation',                label: 'BTS / MRT Station',           type: 'string', required: false, isIdentifier: false },
  { name: 'area',                      label: 'Area',                        type: 'string', required: false, isIdentifier: false },
  { name: 'googleMapUrl',              label: 'Google Map URL',              type: 'url',    required: false, isIdentifier: false },
  { name: 'totalUnits',                label: 'Total Units',                 type: 'number', required: false, isIdentifier: false },
  { name: 'numberOfBuildings',         label: 'No. of Buildings',            type: 'number', required: false, isIdentifier: false },
  { name: 'numberOfParking',           label: 'No. of Parking',              type: 'number', required: false, isIdentifier: false },
  { name: 'commonFees',                label: 'Common Fees',                 type: 'string', required: false, isIdentifier: false },
  { name: 'totalProjectArea',          label: 'Total Project Area',          type: 'string', required: false, isIdentifier: false },
  { name: 'developer',                 label: 'Developer',                   type: 'string', required: false, isIdentifier: false },
  { name: 'completionYear',            label: 'Completion Year',             type: 'number', required: false, isIdentifier: false },
  { name: 'percentSold',               label: '% Sold',                      type: 'number', required: false, isIdentifier: false },
  { name: 'ownerOccupiedRented',       label: 'Owner Occupied & Rented',     type: 'string', required: false, isIdentifier: false },
  { name: 'competitionAtSite',         label: 'Competition at Site',         type: 'text',   required: false, isIdentifier: false },
  { name: 'contactPerson',             label: 'Contact Person',              type: 'string', required: false, isIdentifier: false },
  { name: 'telephone',                 label: 'Telephone',                   type: 'string', required: false, isIdentifier: false },
  { name: 'propertyManagementCompany', label: 'Property Management Company', type: 'string', required: false, isIdentifier: false },
  { name: 'emailAddress',              label: 'Email Address',               type: 'string', required: false, isIdentifier: false },
]

export const contractFields: FieldDef[] = [
  { name: 'quotationNumber', label: 'Quotation Number',           type: 'string', required: true,  isIdentifier: true  },
  { name: 'customerName',    label: 'Customer Name',              type: 'string', required: true,  isIdentifier: false },
  { name: 'companyName',     label: 'Company Name',               type: 'string', required: false, isIdentifier: false },
  { name: 'quotationDate',   label: 'Quotation Date (YYYY-MM-DD)',type: 'date',   required: false, isIdentifier: false },
  { name: 'rentalAddress',   label: 'Address',                    type: 'text',   required: false, isIdentifier: false },
  { name: 'rentalRate',      label: 'Rental Rate',                type: 'string', required: false, isIdentifier: false },
  { name: 'electricity',     label: 'Electricity',                type: 'string', required: false, isIdentifier: false },
  { name: 'specificSpot',    label: 'Specific Spot',              type: 'string', required: false, isIdentifier: false },
  { name: 'startingDate',    label: 'Starting Date (YYYY-MM-DD)', type: 'date',   required: false, isIdentifier: false },
  { name: 'endingDate',      label: 'Ending Date (YYYY-MM-DD)',   type: 'date',   required: false, isIdentifier: false },
  { name: 'terms',           label: 'Terms',                      type: 'text',   required: false, isIdentifier: false },
  { name: 'note',            label: 'Note',                       type: 'text',   required: false, isIdentifier: false },
  // Synthetic field — used only to resolve the projectSite reference.
  // The value is looked up by projectName and converted to a _ref before writing.
  {
    name: '_projectName',
    label: 'Project Name (for lookup)',
    type: 'string',
    required: false,
    isIdentifier: false,
    isRelationshipKey: true,
  },
]

/** Return the field definitions for a given schema target. */
export function getFieldDefs(target: 'projectSite' | 'contract'): FieldDef[] {
  return target === 'projectSite' ? projectSiteFields : contractFields
}

/** Return the identifier field for a given schema target. */
export function getIdentifierField(target: 'projectSite' | 'contract'): FieldDef {
  return getFieldDefs(target).find(f => f.isIdentifier)!
}
