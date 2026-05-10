/**
 * withTestId(testId) — factory that returns a Sanity custom input wrapper.
 *
 * Renders the default Sanity input inside a plain <div data-testid="…">.
 * Works for any field type (string, number, date, reference, …) because it
 * delegates all rendering to props.renderDefault(props).
 *
 * Usage in schema:
 *   components: { input: withTestId('sc-vendor-input') }
 *
 * Cowork can then target the native input with:
 *   querySelector('[data-testid="sc-vendor-input"] input')
 */
export function withTestId(testId: string) {
  function TestIdWrapper(props: any) {
    return <div data-testid={testId}>{props.renderDefault(props)}</div>
  }
  TestIdWrapper.displayName = `WithTestId(${testId})`
  return TestIdWrapper
}
