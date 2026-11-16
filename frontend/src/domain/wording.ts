/** The only words used for an overall result. Never "healthy", "disease" or "diagnosis". */
export const OVERALL_LABEL: Record<string, { title: string; glyph: string; tone: 'within' | 'review' | 'large' | 'missing' }> = {
  within_reference: { title: 'Within reference pattern', glyph: '●', tone: 'within' },
  unusual_pattern: { title: 'Unusual pattern detected', glyph: '▲', tone: 'large' },
  indeterminate: { title: 'Indeterminate', glyph: '○', tone: 'missing' },
}

export const MODEL_LABEL: Record<string, string> = {
  within_reference: 'Within reference pattern',
  unusual_pattern: 'Unusual pattern',
  indeterminate: 'Uncertain',
}
