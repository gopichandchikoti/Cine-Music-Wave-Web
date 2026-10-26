import model from './content.model.json' with { type: 'json' }

/** Interface copy is authored in content.model.json; protocol values stay in code. */
export const content = model

/** Replace named placeholders without interpreting translated text as HTML. */
export function formatContent(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : placeholder,
  )
}
