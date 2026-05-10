/**
 * AutoSubmitDateInput
 *
 * Custom input for the `submittedDate` field.
 * Watches `paymentStatus` — when it becomes "submitted" and the field is empty,
 * auto-fills with today's date.
 * Renders the default Sanity date picker so the user can still change it.
 */

import { useEffect }    from 'react'
import { set, useFormValue } from 'sanity'

export function AutoSubmitDateInput(props: any) {
  const { value, onChange } = props
  const paymentStatus = useFormValue(['paymentStatus']) as string | undefined

  useEffect(() => {
    if (paymentStatus === 'submitted' && !value) {
      const today = new Date().toISOString().split('T')[0]  // YYYY-MM-DD
      onChange(set(today))
    }
  }, [paymentStatus, value, onChange])

  // Render the default date picker — we only add auto-fill behaviour
  return props.renderDefault(props)
}
