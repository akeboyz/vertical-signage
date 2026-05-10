/**
 * PaymentModeInput
 *
 * Custom radio-button group for the Payment Mode field.
 * Identical options to the schema's list, but each <input> carries a
 * data-testid="payment-mode-{value}" so Cowork can target it directly.
 */
import { set }               from 'sanity'
import type { StringInputProps } from 'sanity'
import { Stack, Text }       from '@sanity/ui'

const OPTIONS = [
  { title: '🛒 Procurement Payment — pay against a Procurement record',       value: 'procurement'              },
  { title: '📅 Installment Payment — follow-up payment in a series',          value: 'installment'              },
  { title: '💳 Direct Payment — one-off payment without a Procurement record', value: 'direct_expense'          },
  { title: '🏠 Rent Payment — monthly rent expense paid to landlord',           value: 'rent_payment'            },
  { title: '🔧 Service Contract Payment — recurring service fee to vendor',    value: 'service_contract_payment' },
] as const

export function PaymentModeInput(props: StringInputProps) {
  return (
    <Stack space={3}>
      {OPTIONS.map(opt => (
        <label
          key={opt.value}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <input
            type="radio"
            name="paymentMode"
            data-testid={`payment-mode-${opt.value}`}
            value={opt.value}
            checked={props.value === opt.value}
            disabled={props.readOnly}
            onChange={() => props.onChange(set(opt.value))}
            style={{ accentColor: 'var(--card-focus-ring-color, #2B6CB0)', cursor: 'pointer' }}
          />
          <Text size={1}>{opt.title}</Text>
        </label>
      ))}
    </Stack>
  )
}
