import { Card, Stack, Heading, Text, Box, Badge } from '@sanity/ui'

function Divider() {
  return <Box style={{ borderTop: '1px solid var(--card-border-color)', margin: '4px 0' }} />
}

/**
 * HowToTool — step-by-step guide for non-technical staff.
 * Registered as a Studio tool so it's always accessible from the sidebar.
 */
export function HowToTool() {
  return (
    <Card padding={5} height="fill" overflow="auto">
      <Stack space={6} style={{ maxWidth: 720, margin: '0 auto' }}>

        <Stack space={2}>
          <Heading size={3}>How-To Guide</Heading>
          <Text size={2} muted>
            Step-by-step instructions for common tasks. No coding required.
          </Text>
        </Stack>

        <Divider />

        {/* ── Add a new Contract Type ────────────────────────────────────────── */}
        <Section
          badge="Contract Types"
          title="Add a new contract type (e.g. Service Contract)"
          steps={[
            'In the left sidebar, click Contract Types.',
            'Click the + button (top right) to create a new type.',
            'Fill in Contract Type Name (e.g. "Service Contract") and Quotation Name (e.g. "Service Quotation").',
            'Enter a unique Contract Number Prefix (2–5 uppercase letters, e.g. "SVC") and Quotation Number Prefix (e.g. "QTS").',
            'Open your Google Docs template, copy the long ID from the URL:\n  docs.google.com/document/d/THIS_PART/edit\nPaste it into Contract Google Doc Template ID and Quotation Google Doc Template ID.',
            'Click Publish. The new type is now available in every Contract form.',
          ]}
          note="You do NOT need to touch any code or Netlify settings — the template IDs are stored here in Studio."
        />

        <Divider />

        {/* ── Create a contract ─────────────────────────────────────────────── */}
        <Section
          badge="Contracts"
          title="Create a new contract / quotation"
          steps={[
            'Click Contracts in the sidebar, then + to create a new one.',
            'Select a Project Site and a Contract Type.',
            'Fill in Customer Name and all Rental Details.',
            'In the Quotation Number field, click "🔢 Generate Number" to auto-assign the next number.',
            'Click Publish (top right) when done.',
          ]}
        />

        <Divider />

        {/* ── Request approval ──────────────────────────────────────────────── */}
        <Section
          badge="Approval"
          title="Request approval for a quotation or contract"
          steps={[
            'Open the contract and click the Approval tab.',
            'Enter your email address in the Notification Email field — you will receive the generated document when approved.',
            'Click "Request Quotation Approval". An email is sent to the first approver.',
            'Once the quotation is approved, the "Request Contract Approval" button becomes available.',
            'When all stages are approved, the document is generated automatically and sent to your email.',
          ]}
          note="Quotation must be approved before you can request contract approval. If approval is rejected, edit the document and request again."
        />

        <Divider />

        {/* ── Cancel a stuck approval ───────────────────────────────────────── */}
        <Section
          badge="Approval"
          title="Cancel a pending approval (e.g. wrong email sent)"
          steps={[
            'Open the contract and click the Approval tab.',
            'Under the pending step, click "Cancel Pending Approval".',
            'The status resets to Not Requested. You can now request again.',
          ]}
        />

        <Divider />

        {/* ── Generate a document manually ─────────────────────────────────── */}
        <Section
          badge="Generate"
          title="Generate a document manually"
          steps={[
            'Open the contract and click the Generate tab.',
            'The Quotation card and Rental Agreement card each show their approval status.',
            'If approved, click "Generate Quotation" or "Generate Agreement".',
            'The Google Doc link and PDF download appear once complete.',
          ]}
          note="Generation is locked until the document is approved. Auto-generation happens automatically on final approval — manual generation is only needed to regenerate after edits."
        />

        <Divider />

        {/* ── Approver setup ────────────────────────────────────────────────── */}
        <Section
          badge="Approval Rules"
          title="Add or change approvers"
          steps={[
            'Click Approver Positions to add a new person (name + email).',
            'Click Approval Rules → open the relevant rule (or create one).',
            'Add or reorder stages, assigning an Approver Position to each.',
            'Optionally uncheck fields under "Toggle Fields in Email" to hide them from the approval email.',
            'Publish the rule. The next approval request will use the updated stages.',
          ]}
        />

        <Divider />

        {/* ── Google Doc template tips ──────────────────────────────────────── */}
        <Section
          badge="Google Docs"
          title="Edit a Google Doc template"
          steps={[
            'Open the template in Google Docs.',
            'Placeholders use double curly braces, e.g. {{customerName}}, {{rentalRate}}, {{startingDate}}.',
            'Do not change the placeholder text — only move or style them.',
            'Save. The next generation will pick up the changes automatically.',
          ]}
          note="The template ID in the URL never changes even after edits, so you do not need to update anything in Studio."
        />

      </Stack>
    </Card>
  )
}

// ── Helper component ─────────────────────────────────────────────────────────

function Section({
  badge,
  title,
  steps,
  note,
}: {
  badge:  string
  title:  string
  steps:  string[]
  note?:  string
}) {
  return (
    <Stack space={3}>
      <Stack space={2}>
        <Badge tone="primary" radius={2} style={{ alignSelf: 'flex-start' }}>{badge}</Badge>
        <Heading size={1}>{title}</Heading>
      </Stack>
      <Stack space={2} as="ol">
        {steps.map((step, i) => (
          <Box key={i} paddingLeft={2}>
            <Text size={1} style={{ whiteSpace: 'pre-wrap' }}>
              <span style={{ fontWeight: 600, marginRight: 8 }}>{i + 1}.</span>{step}
            </Text>
          </Box>
        ))}
      </Stack>
      {note && (
        <Card padding={3} radius={2} tone="caution" border>
          <Text size={1}>💡 {note}</Text>
        </Card>
      )}
    </Stack>
  )
}
