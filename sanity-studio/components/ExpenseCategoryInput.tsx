/**
 * ExpenseCategoryInput
 *
 * Dropdown that loads expense categories from the Process Setup
 * document marked with useForExpense === true.
 * When a category is selected, also patches the hidden costGroup field.
 */

import { useEffect, useState, useCallback }  from 'react'
import { useClient, useFormValue }           from 'sanity'
import { set, unset }                        from 'sanity'
import type { StringInputProps }             from 'sanity'
import { Select, Stack, Text, Flex, Spinner, Box } from '@sanity/ui'

interface ExpenseCategory {
  key:          string
  name:         string
  costGroup?:   string
  description?: string
}

export function ExpenseCategoryInput(props: StringInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const docId  = useFormValue(['_id']) as string | undefined

  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    client
      .fetch<{ expenseCategories?: ExpenseCategory[] }>(
        `*[_type == "contractType" && useForExpense == true && isActive == true][0]{ expenseCategories }`,
      )
      .then(r => setCategories(r?.expenseCategories ?? []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const key    = e.target.value
    const target = docId ?? ''
    if (key) {
      props.onChange(set(key))
      const cat = categories.find(c => c.key === key)
      if (target) client.patch(target).set({ costGroup: cat?.costGroup ?? 'general', expenseCategoryName: cat?.name ?? key }).commit().catch(() => {})
    } else {
      props.onChange(unset())
      if (target) client.patch(target).unset(['costGroup', 'expenseCategoryName']).commit().catch(() => {})
    }
  }, [docId, categories, props, client])

  if (loading) {
    return (
      <Flex align="center" gap={2}>
        <Spinner muted />
        <Text size={1} muted>Loading categories…</Text>
      </Flex>
    )
  }

  if (categories.length === 0) {
    return (
      <Stack space={2}>
        {props.renderDefault(props)}
        <Text size={0} muted>
          No expense categories found. Add categories to a Process Setup with "Use for Expenses" enabled.
        </Text>
      </Stack>
    )
  }

  const selectedCat = categories.find(c => c.key === (props.value ?? ''))

  return (
    <Stack space={2}>
      <Select value={props.value ?? ''} onChange={handleChange} disabled={props.readOnly}>
        <option value="">— Select category —</option>
        {categories.map(cat => (
          <option key={cat.key} value={cat.key}>{cat.name}</option>
        ))}
      </Select>

      {selectedCat?.description && (
        <Box style={{
          background:   '#FFFBEB',
          border:       '1px solid #FCD34D',
          borderLeft:   '4px solid #F59E0B',
          borderRadius: 6,
          padding:      '8px 12px',
        }}>
          <Flex gap={2} align="flex-start">
            <span style={{ fontSize: 14, flexShrink: 0 }}>ℹ️</span>
            <Text size={1} style={{ color: '#78350F', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {selectedCat.description}
            </Text>
          </Flex>
        </Box>
      )}
    </Stack>
  )
}
