import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalyzeRequest, Catalog } from '../../../api/client'
import { Caption, Label } from '../../../components/ui'
import { buildRequest, checkFile, parseCsv, type ParsedCsv } from './parseCsv'

interface Props {
  catalog: Catalog
  onChange: (request: AnalyzeRequest | null, notes: string[]) => void
}

/** Parses in the browser. Nothing is sent until the review step's Analyse button is pressed. */
export function CsvUpload({ catalog, onChange }: Props) {
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedCsv | null>(null)
  const [row, setRow] = useState(0)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const input = useRef<HTMLInputElement>(null)

  const built = useMemo(() => (parsed && parsed.rows.length ? buildRequest(parsed, catalog, row, mapping) : null), [parsed, catalog, row, mapping])
  useEffect(() => {
    onChange(built?.request ?? null, built?.notes ?? [])
  }, [built, onChange])

  const choose = async (file: File | undefined) => {
    setParsed(null)
    setMapping({})
    setRow(0)
    if (!file) return
    const problem = checkFile(file)
    setFileError(problem)
    setFileName(file.name)
    if (problem) return
    const p = parseCsv(await file.text(), catalog)
    if (p.rows.length === 0) setFileError('The file has no data rows. Add at least one row under the header.')
    else setParsed(p)
  }

  const mappable = catalog.features.map((f) => f.column).filter((c) => !parsed || !Object.values(parsed.recognised).includes(c))
  const preview = parsed?.rows.slice(0, 5) ?? []
  const cols = parsed?.headers.slice(0, 6) ?? []

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="inline-flex cursor-pointer items-center rounded-sm border border-rule px-4 py-2 font-mono text-[0.78rem] uppercase tracking-[0.14em] hover:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-accent">
          Choose a .csv file
          <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0])} />
        </label>
        <a href="/spinalytics_template.csv" download className="font-mono text-[0.78rem] uppercase tracking-[0.14em] text-accent underline-offset-4 hover:underline">
          Download the template
        </a>
        {fileName && <span className="font-mono text-sm text-muted">{fileName}</span>}
      </div>
      <p className="mt-3 max-w-prose text-sm text-muted">
        Up to 2 MB. The file is read in your browser; only the values you confirm in the review step are sent. Column names must match the template exactly; nothing is mapped for you.
      </p>
      {fileError && <p role="alert" className="mt-4 text-large">▲ {fileError}</p>}

      {parsed && (
        <div className="mt-6 space-y-6">
          <div>
            <Label>Columns</Label>
            <p className="mt-1 text-sm" data-testid="csv-summary">
              {Object.keys(parsed.recognised).length} recognised · {parsed.unrecognised.length} not recognised · {parsed.missingColumns.length} catalog columns absent
            </p>
          </div>

          {parsed.rows.length > 1 && (
            <div>
              <label className="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted" htmlFor="csv-row">
                Row to analyse ({parsed.rows.length} rows)
              </label>
              <select id="csv-row" value={row} onChange={(e) => setRow(Number(e.target.value))} className="mt-1 block rounded-sm border border-rule bg-surface px-3 py-2">
                {parsed.rows.map((_, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}
                    {parsed.duplicateRows.includes(i) ? ' (duplicate of an earlier row)' : ''}
                  </option>
                ))}
              </select>
              {parsed.duplicateRows.length > 0 && <p className="mt-2 text-sm text-review">◐ {parsed.duplicateRows.length} duplicate row(s) found.</p>}
            </div>
          )}

          {parsed.unrecognised.length > 0 && (
            <div>
              <Label>Unrecognised columns</Label>
              <p className="mt-1 text-sm text-muted">These are ignored unless you choose a matching column yourself.</p>
              <ul className="mt-3 space-y-2">
                {parsed.unrecognised.map((h) => (
                  <li key={h} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-mono">{h}</span>
                    <label className="sr-only" htmlFor={`map-${h}`}>
                      Map {h} to
                    </label>
                    <select id={`map-${h}`} value={mapping[h] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value }))} className="max-w-xs rounded-sm border border-rule bg-surface px-2 py-1">
                      <option value="">Ignore this column</option>
                      {mappable.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <figure className="overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-rule font-mono text-muted">
                  {cols.map((h) => (
                    <th key={h} scope="col" className="py-2 pr-3 font-normal">{h}</th>
                  ))}
                  <th scope="col" className="py-2 font-normal">…</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {preview.map((r, i) => (
                  <tr key={i} className={`border-b border-rule ${i === row ? 'bg-surface' : ''}`}>
                    {cols.map((_, j) => {
                      const bad = built?.badCells.some((b) => b.row === i && b.header === parsed.headers[j])
                      return (
                        <td key={j} className={`py-1.5 pr-3 ${bad ? 'text-large' : ''}`}>
                          {r[j] ?? ''}
                        </td>
                      )
                    })}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
            <Caption label="TABLE 1">Preview of the first rows and columns. Cells that are not valid numbers are shown in red and treated as missing.</Caption>
          </figure>
        </div>
      )}
    </div>
  )
}
