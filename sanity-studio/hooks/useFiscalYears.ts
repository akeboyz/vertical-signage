import { useState, useEffect } from 'react'
import { useClient }           from 'sanity'

export interface FiscalYearOption {
  id:    string  // 'fy-2025'
  label: string  // 'FY 2025'
  from:  string  // '2025-01-01'
  to:    string  // '2025-12-31'
}

const pad = (n: number) => String(n).padStart(2, '0')

function fyDates(endYear: number, endMonth: number): { from: string; to: string } {
  // End: last day of endMonth in endYear
  // new Date(year, month, 0) with 1-indexed month gives last day of that month
  const endDay = new Date(endYear, endMonth, 0).getDate()
  const to     = `${endYear}-${pad(endMonth)}-${pad(endDay)}`

  // Start: first day of the month after endMonth in (endYear - 1)
  // Using endMonth as-is (1-indexed) as the JS month argument naturally gives month+1
  const startD = new Date(endYear - 1, endMonth, 1)
  const from   = `${startD.getFullYear()}-${pad(startD.getMonth() + 1)}-${pad(startD.getDate())}`

  return { from, to }
}

export function useFiscalYears(count = 5): FiscalYearOption[] {
  const client  = useClient({ apiVersion: '2024-01-01' })
  const [options, setOptions] = useState<FiscalYearOption[]>([])

  useEffect(() => {
    client
      .fetch<{ fiscalYearEndMonth?: number } | null>(
        `*[_type == "fiscalYearConfig" && _id == "fiscal-year-config"][0]{ fiscalYearEndMonth }`
      )
      .then(cfg => {
        const endMonth = cfg?.fiscalYearEndMonth
        if (!endMonth) return

        const now          = new Date()
        // Current FY year: if today is on or before the year-end date of this calendar year → same year
        const thisYearEnd  = new Date(now.getFullYear(), endMonth, 0) // last day of endMonth this year
        const currentFY    = now <= thisYearEnd ? now.getFullYear() : now.getFullYear() + 1

        const opts: FiscalYearOption[] = []
        for (let i = 0; i < count; i++) {
          const year     = currentFY - i
          const { from, to } = fyDates(year, endMonth)
          opts.push({ id: `fy-${year}`, label: `FY ${year}`, from, to })
        }
        setOptions(opts)
      })
      .catch(() => {})
  }, [client, count]) // eslint-disable-line react-hooks/exhaustive-deps

  return options
}
