import { useCallback } from 'react'
import { set, unset, useFormValue } from 'sanity'
import type { ArrayOfPrimitivesInputProps } from 'sanity'
import { Stack, Flex, Checkbox, Text, Card, Box } from '@sanity/ui'

const SUBCAT_MAP: Record<string, { title: string; value: string }[]> = {
  food: [
    { title: 'Dine-in',      value: 'dine-in' },
    { title: 'Delivery',     value: 'delivery' },
    { title: 'Recommended',  value: 'recommended' },
    { title: 'Thai Cuisine', value: 'thai-cuisine' },
    { title: 'Vegan',        value: 'vegan' },
    { title: 'Coffee',       value: 'coffee' },
    { title: 'Dessert',      value: 'dessert' },
    { title: 'Promotions',   value: 'promotions' },
  ],
  groceries: [
    { title: 'Fresh Produce',  value: 'fresh-produce' },
    { title: 'Dairy & Eggs',   value: 'dairy-eggs' },
    { title: 'Meat & Seafood', value: 'meat-seafood' },
    { title: 'Snack & Drinks', value: 'snack-drinks' },
    { title: 'Ready-to-Eat',   value: 'ready-to-eat' },
    { title: 'Household',      value: 'household' },
    { title: 'Organic',        value: 'organic' },
    { title: 'Drug Store',     value: 'drug-store' },
    { title: '24-hr Store',    value: '24hr-store' },
    { title: 'Promotions',     value: 'promotions' },
  ],
  services: [
    { title: 'Cleaning',              value: 'cleaning' },
    { title: 'Repair & Maintenance',  value: 'repair-maintenance' },
    { title: 'Renovation & Interior', value: 'renovation-interior' },
    { title: 'Moving & Delivery',     value: 'moving-delivery' },
    { title: 'Laundry & Dry Clean',   value: 'laundry-dry-clean' },
    { title: 'Pet Services',          value: 'pet-services' },
    { title: 'Beauty',                value: 'beauty' },
  ],
  forRent: [
    { title: 'Most Recent',    value: 'most-recent' },
    { title: 'Good Deal',      value: 'good-deal' },
    { title: 'One-Bed',        value: 'one-bed' },
    { title: 'Two-Bed and up', value: 'two-bed-up' },
  ],
  forSale: [
    { title: 'Most Recent',    value: 'most-recent' },
    { title: 'Good Deal',      value: 'good-deal' },
    { title: 'One-Bed',        value: 'one-bed' },
    { title: 'Two-Bed and up', value: 'two-bed-up' },
  ],
  buildingUpdates: [
    { title: 'Most Recent', value: 'most-recent' },
    { title: 'Alert',       value: 'alert' },
  ],
}

export function SubCategoriesInput(props: ArrayOfPrimitivesInputProps) {
  const { value = [], onChange } = props
  const category = useFormValue(['category']) as string | undefined
  const options = category ? (SUBCAT_MAP[category] ?? []) : []
  const current = value as string[]

  const toggle = useCallback(
    (optValue: string, checked: boolean) => {
      const next = checked
        ? [...current, optValue]
        : current.filter(v => v !== optValue)
      onChange(next.length > 0 ? set(next) : unset())
    },
    [current, onChange],
  )

  if (!category) {
    return (
      <Card padding={3} tone="caution" border radius={2}>
        <Text size={1} muted>Select a Category first.</Text>
      </Card>
    )
  }

  if (options.length === 0) {
    return (
      <Card padding={3} tone="caution" border radius={2}>
        <Text size={1} muted>No subcategories defined for "{category}".</Text>
      </Card>
    )
  }

  return (
    <Card padding={3} border radius={2}>
      <Stack space={3}>
        {options.map(opt => (
          <Flex key={opt.value} align="center" gap={3}>
            <Checkbox
              id={`subcat-${opt.value}`}
              checked={current.includes(opt.value)}
              onChange={e => toggle(opt.value, e.currentTarget.checked)}
            />
            <Box>
              <Text
                as="label"
                size={1}
                weight="medium"
                style={{ cursor: 'pointer' }}
              >
                {opt.title}
              </Text>
            </Box>
          </Flex>
        ))}
      </Stack>
    </Card>
  )
}
