import { useEffect, useState } from 'react'
import { set, unset, useClient } from 'sanity'
import type { ArrayOfObjectsInputProps } from 'sanity'

type Project = { _id: string; title: string; code: string }

/**
 * Custom input for the `excludedProjects` field on Media documents.
 *
 * Shows ALL active projects as a scrollable checklist, all pre-checked by default.
 * Unchecking a project adds it to the `excludedProjects` array (opt-out model).
 * Rechecking removes it from the array.
 *
 * Value stored: the _un_checked (excluded) project references.
 * Projects not in the array are implicitly included.
 */
export function ExcludedProjectsInput(props: ArrayOfObjectsInputProps) {
  const client = useClient({ apiVersion: '2024-01-01' })
  const [projects, setProjects] = useState<Project[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // Current excluded refs from the field value
  const excluded    = (props.value ?? []) as Array<{ _ref: string; _key: string; _type: string }>
  const excludedIds = new Set(excluded.map(e => e._ref))

  useEffect(() => {
    client
      .fetch<Project[]>(
        `*[_type == "project" && isActive == true]{ _id, title, "code": code.current } | order(title asc)`
      )
      .then(data => { setProjects(data); setLoading(false) })
      .catch(err  => { setError(err?.message ?? String(err)); setLoading(false) })
  }, [])

  function handleToggle(project: Project) {
    const isCurrentlyIncluded = !excludedIds.has(project._id)

    if (isCurrentlyIncluded) {
      // User unchecked → add to excluded list
      const next = [
        ...excluded,
        { _type: 'reference' as const, _ref: project._id, _key: project._id },
      ]
      props.onChange(set(next))
    } else {
      // User re-checked → remove from excluded list
      const next = excluded.filter(e => e._ref !== project._id)
      props.onChange(next.length === 0 ? unset() : set(next))
    }
  }

  if (loading) {
    return <p style={{ color: '#888', fontSize: '0.85em' }}>Loading active projects…</p>
  }
  if (error) {
    return <p style={{ color: 'crimson', fontSize: '0.85em' }}>Error: {error}</p>
  }
  if (projects.length === 0) {
    return <p style={{ color: '#888', fontSize: '0.85em' }}>No active projects found.</p>
  }

  const includedCount = projects.length - excludedIds.size

  return (
    <div>
      <p style={{ marginBottom: '0.5rem', fontSize: '0.82em', color: '#555' }}>
        All active projects are included by default. <strong>Uncheck</strong> to exclude a project
        from auto-add. Currently adding to <strong>{includedCount}</strong> of{' '}
        <strong>{projects.length}</strong> projects.
      </p>
      <div
        style={{
          display:       'flex',
          flexDirection: 'column',
          gap:           '0.35rem',
          maxHeight:     320,
          overflowY:     'auto',
          border:        '1px solid #ddd',
          borderRadius:  4,
          padding:       '0.5rem 0.75rem',
        }}
      >
        {projects.map(p => {
          const included = !excludedIds.has(p._id)
          return (
            <label
              key={p._id}
              style={{
                display:     'flex',
                alignItems:  'center',
                gap:         '0.5rem',
                cursor:      'pointer',
                padding:     '0.2rem 0',
                opacity:     included ? 1 : 0.5,
              }}
            >
              <input
                type="checkbox"
                checked={included}
                onChange={() => handleToggle(p)}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: '0.9em' }}>
                {p.title}
                <span style={{ color: '#888', marginLeft: '0.4em' }}>({p.code})</span>
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
