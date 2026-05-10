export type DerivedStatus =
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'renewed'
  | 'suspended'
  | 'terminated'

export interface DeriveStatusParams {
  startDate?:               string
  endDate?:                 string
  noticePeriodDays?:        number
  isSuspended?:             boolean
  terminationEffectiveDate?: string
  renewalHistory?:          Array<{ newEndDate?: string }>
}

export interface DeriveStatusResult {
  status: DerivedStatus
  detail?: string
}

function parseDay(iso: string): Date {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  return d
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

export function deriveContractStatus(p: DeriveStatusParams): DeriveStatusResult {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // 1. Terminated — effective date reached
  if (p.terminationEffectiveDate) {
    const termDate = parseDay(p.terminationEffectiveDate)
    if (termDate <= today) {
      return { status: 'terminated', detail: `Effective ${fmt(p.terminationEffectiveDate)}` }
    }
  }

  // 2. Manually suspended
  if (p.isSuspended) {
    return { status: 'suspended', detail: 'Manually suspended' }
  }

  // Effective end date: most recent renewal's newEndDate, else top-level endDate
  const lastRenewalEnd = p.renewalHistory?.length
    ? p.renewalHistory[p.renewalHistory.length - 1]?.newEndDate
    : undefined
  const effectiveEndIso = lastRenewalEnd ?? p.endDate

  if (effectiveEndIso) {
    const endDay  = parseDay(effectiveEndIso)
    const diffMs  = endDay.getTime() - today.getTime()
    const diffDays = Math.ceil(diffMs / 86_400_000)

    // 3. Expired
    if (diffDays < 0) {
      return { status: 'expired', detail: `Expired ${fmt(effectiveEndIso)}` }
    }

    // 4. Expiring soon
    const noticeDays = p.noticePeriodDays ?? 30
    if (diffDays <= noticeDays) {
      return {
        status: 'expiring_soon',
        detail:  `Expires in ${diffDays} day${diffDays !== 1 ? 's' : ''} — ${fmt(effectiveEndIso)}`,
      }
    }
  }

  // 5. Renewed (has renewal history, not expired/expiring)
  if (p.renewalHistory && p.renewalHistory.length > 0) {
    const detail = effectiveEndIso ? `Renewed — ends ${fmt(effectiveEndIso)}` : 'Renewed'
    return { status: 'renewed', detail }
  }

  // 6. Active
  const termNote = p.terminationEffectiveDate
    ? ` · Termination scheduled ${fmt(p.terminationEffectiveDate)}`
    : ''
  const detail = effectiveEndIso
    ? `Until ${fmt(effectiveEndIso)}${termNote}`
    : termNote || undefined
  return { status: 'active', detail: detail || undefined }
}

export const STATUS_ICON: Record<DerivedStatus, string> = {
  active:        '🟢',
  expiring_soon: '🟡',
  expired:       '⏰',
  renewed:       '🔵',
  suspended:     '⏸',
  terminated:    '🔴',
}

export const STATUS_LABEL: Record<DerivedStatus, string> = {
  active:        'Active',
  expiring_soon: 'Expiring Soon',
  expired:       'Expired',
  renewed:       'Renewed',
  suspended:     'Suspended',
  terminated:    'Terminated',
}

export const STATUS_TONE: Record<DerivedStatus, 'default' | 'positive' | 'caution' | 'critical'> = {
  active:        'positive',
  expiring_soon: 'caution',
  expired:       'critical',
  renewed:       'positive',
  suspended:     'caution',
  terminated:    'critical',
}
