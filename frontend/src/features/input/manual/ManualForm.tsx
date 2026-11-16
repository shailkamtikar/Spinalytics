import { memo, useEffect, useState } from 'react'
import { getSampleCase, getSampleCases, type AnalyzeRequest, type Catalog, type CatalogFeature, type SampleCaseSummary } from '../../../api/client'
import { Button, Label } from '../../../components/ui'
import { fieldIssue, groupByRegion, humanLabel, useManualForm, type RegionGroup } from './useManualForm'

interface Props {
  catalog: Catalog
  onChange: (request: AnalyzeRequest, notes: string[], blockers: string[]) => void
}

const REASONS: Record<string, string> = {
  age_years: 'Reference groups can differ with age.',
  sex_male: 'Used only to choose the matching reference group.',
  height_cm: 'Body size scales vertebral dimensions.',
  weight_kg: 'Used with height for BMI context.',
  bmi: 'Body-mass index, if you know it.',
  smoker: 'Linked to disc height in the synthetic data.',
  physical_activity_level: '0 sedentary, 1 light, 2 moderate, 3 very active.',
  heavy_lifting_occupation: 'Linked to disc patterns in the synthetic data.',
  family_history_spinal_condition: 'A close relative has a spinal condition.',
  prior_spinal_injury: 'A previous spinal injury is reported.',
  prior_spinal_surgery: 'Previous spinal surgery is reported.',
  bone_density_t_score: 'Lower means lower bone density.',
  osteoporosis_diagnosis: 'An osteoporosis diagnosis is reported.',
  back_pain_score_0_10: 'Self-rated, 0 none to 10 worst.',
  neck_pain_score_0_10: 'Self-rated, 0 none to 10 worst.',
  limb_numbness_or_tingling: 'Numbness or tingling in an arm or leg.',
}

const Field = memo(function Field({ f, value, onChange }: { f: CatalogFeature; value: string; onChange: (column: string, raw: string) => void }) {
  const issue = fieldIssue(value, f)
  const id = `f-${f.column}`
  return (
    <div>
      <label htmlFor={id} className="block text-sm">
        {humanLabel(f)}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(f.column, e.target.value)}
          aria-invalid={issue?.kind === 'error' || undefined}
          aria-describedby={issue ? `${id}-msg` : undefined}
          className={`w-28 rounded-sm border bg-surface px-2 py-1.5 text-right font-mono tabular-nums ${issue?.kind === 'error' ? 'border-large' : issue ? 'border-review' : 'border-rule'}`}
        />
        <span className="font-mono text-xs text-muted">{f.unit}</span>
      </div>
      {issue && (
        <p id={`${id}-msg`} className={`mt-1 text-xs ${issue.kind === 'error' ? 'text-large' : 'text-review'}`}>
          {issue.kind === 'error' ? '▲' : '◐'} {issue.message}
        </p>
      )}
    </div>
  )
})

function LevelRow({ level, values, onChange, startOpen }: { level: RegionGroup['levels'][number]; values: Record<string, string>; onChange: (c: string, v: string) => void; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const entered = level.features.filter((f) => (values[f.column] ?? '').trim() !== '').length
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="border-b border-rule py-2">
      <summary className="flex cursor-pointer items-center justify-between py-1 font-mono text-sm">
        <span>{level.title}</span>
        <span className="text-xs text-muted tabular-nums">
          {entered} / {level.features.length} entered
        </span>
      </summary>
      {open && (
        <div className="grid gap-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {level.features.map((f) => (
            <Field key={f.column} f={f} value={values[f.column] ?? ''} onChange={onChange} />
          ))}
        </div>
      )}
    </details>
  )
}

function PersonSection({ fields, values, onChange }: { fields: CatalogFeature[]; values: Record<string, string>; onChange: (c: string, v: string) => void }) {
  return (
    <section aria-labelledby="person-title" className="mt-10">
      <h3 id="person-title" className="text-2xl">Person details <span className="text-muted">(all optional)</span></h3>
      <p className="mt-2 max-w-prose text-sm text-muted">There are no fields for a name, e-mail, phone number or date of birth. Each item below is here only because it changes which reference is used or what the model can use.</p>
      <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => {
          const id = `p-${f.column}`
          const binary = f.value_type === 'int' && f.max_supported === 1
          const options = f.column === 'physical_activity_level' ? ['0', '1', '2', '3'] : null
          return (
            <div key={f.column}>
              <label htmlFor={id} className="block text-sm">{f.column.replace(/_/g, ' ')}{f.unit && !['0/1', '0-3', '0-10'].includes(f.unit) ? ` (${f.unit})` : ''}</label>
              {binary || options ? (
                <select id={id} value={values[f.column] ?? ''} onChange={(e) => onChange(f.column, e.target.value)} className="mt-1 block w-40 rounded-sm border border-rule bg-surface px-2 py-1.5">
                  <option value="">Not given</option>
                  {binary ? (
                    <>
                      <option value="0">No{f.column === 'sex_male' ? ' (female)' : ''}</option>
                      <option value="1">Yes{f.column === 'sex_male' ? ' (male)' : ''}</option>
                    </>
                  ) : (
                    options!.map((o) => <option key={o} value={o}>{o}</option>)
                  )}
                </select>
              ) : (
                <input id={id} inputMode="decimal" value={values[f.column] ?? ''} onChange={(e) => onChange(f.column, e.target.value)} className="mt-1 block w-40 rounded-sm border border-rule bg-surface px-2 py-1.5 text-right font-mono tabular-nums" />
              )}
              <p className="mt-1 text-xs text-muted">{REASONS[f.column] ?? f.description}</p>
              {(() => {
                const issue = fieldIssue(values[f.column] ?? '', f)
                return issue ? <p className={`text-xs ${issue.kind === 'error' ? 'text-large' : 'text-review'}`}>{issue.message}</p> : null
              })()}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export function ManualForm({ catalog, onChange }: Props) {
  const form = useManualForm(catalog)
  const groups = groupByRegion(catalog)
  const [region, setRegion] = useState<RegionGroup['region']>('cervical')
  const [samples, setSamples] = useState<SampleCaseSummary[]>([])
  const [sampleId, setSampleId] = useState('')
  const [prefillError, setPrefillError] = useState(false)

  useEffect(() => {
    getSampleCases().then(setSamples, () => setSamples([]))
  }, [])
  useEffect(() => {
    onChange(form.request, form.warnings, form.blockers)
  }, [form.request, form.warnings, form.blockers, onChange])

  const doPrefill = async () => {
    if (!sampleId) return
    try {
      form.prefill((await getSampleCase(sampleId)).request)
      setPrefillError(false)
    } catch {
      setPrefillError(true)
    }
  }
  const current = groups.find((g) => g.region === region)!
  const enteredIn = (g: RegionGroup) => g.levels.flatMap((l) => l.features).filter((f) => (form.values[f.column] ?? '').trim() !== '').length

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="prefill" className="block font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">Prefill from a sample case</label>
          <select id="prefill" value={sampleId} onChange={(e) => setSampleId(e.target.value)} className="mt-1 block max-w-xs rounded-sm border border-rule bg-surface px-2 py-2">
            <option value="">Choose a case…</option>
            {samples.map((s, i) => (
              <option key={s.case_id} value={s.case_id}>{String(i + 1).padStart(2, '0')} · {s.title}</option>
            ))}
          </select>
        </div>
        <Button variant="secondary" onClick={doPrefill} disabled={!sampleId}>Prefill</Button>
        {prefillError && <span role="alert" className="text-sm text-large">▲ Could not load that case.</span>}
      </div>

      <div role="tablist" aria-label="Spine region" className="mt-8 flex flex-wrap gap-2 border-b border-rule">
        {groups.map((g) => (
          <button
            key={g.region}
            role="tab"
            type="button"
            aria-selected={g.region === region}
            onClick={() => setRegion(g.region)}
            className={`-mb-px border-b-2 px-4 py-2 font-mono text-[0.78rem] uppercase tracking-[0.12em] ${g.region === region ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}
          >
            {g.region} <span className="tabular-nums text-muted">{enteredIn(g)} / {g.total}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={`${region} measurements`}>
        <Label className="mt-4 block">All lengths in millimetres, angles in degrees. Leave a box empty if you do not have the value.</Label>
        {current.levels.map((l, i) => (
          <LevelRow key={`${region}-${l.level}`} level={l} values={form.values} onChange={form.setValue} startOpen={i === 0} />
        ))}
      </div>
      <PersonSection fields={form.personFields} values={form.person} onChange={form.setPersonValue} />
    </div>
  )
}
