import { useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { Label, Panel } from '../components/ui'
import { OVERALL_LABEL } from '../domain/wording'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useAnalysisStore } from '../state/analysisStore'

export default function Results() {
  useDocumentTitle('Results')
  const result = useAnalysisStore((s) => s.result)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [result])
  if (!result) return <Navigate to="/analyze" replace state={{ notice: 'There is no result yet. Choose an input and run an analysis first.' }} />
  const overall = OVERALL_LABEL[result.overall.state]
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-14 lg:px-10">
      <Label>Step 2 of 2 · Result</Label>
      <h1 ref={heading} tabIndex={-1} className="mt-4 text-5xl outline-none">
        {overall.title}
      </h1>
      <Panel className="mt-8" as="div">
        <p>{result.overall.reason}</p>
      </Panel>
    </div>
  )
}
