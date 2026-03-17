import React from 'react'

interface Props {
  messages: string[]
}

export function ErrorBadge({ messages }: Props) {
  if (messages.length === 0) return null
  return (
    <span
      title={messages.join('\n')}
      style={{
        display: 'inline-block',
        background: '#e03131',
        color: '#fff',
        borderRadius: 4,
        fontSize: 11,
        padding: '1px 6px',
        marginLeft: 4,
        cursor: 'help',
        whiteSpace: 'nowrap',
      }}
    >
      {messages.length === 1 ? messages[0] : `${messages.length} errors`}
    </span>
  )
}
