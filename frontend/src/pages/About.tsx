import { RevealWords } from '../components/fx'
import { Caption, Label, Rule } from '../components/ui'
import { Reveal } from '../motion/Reveal'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

const SECTIONS = [
  {
    n: '01',
    title: 'What this is',
    body: [
      'Spinalytics is a research and education prototype for exploring spinal measurements. It compares each vertebra, disc and regional angle with a reference built from synthetic data and highlights where a profile departs from it.',
      'It is not a medical device. It does not diagnose, treat or recommend anything, and nothing it shows should be used for decisions about care.',
    ],
  },
  {
    n: '02',
    title: 'The comparison',
    body: [
      'Every measurement is compared only with the same measurement at the same level, using the matching sex group when sex is given. For each one the application shows the difference, the percentage difference (lengths only), a z-score and a percentile.',
      'Status uses demonstration thresholds on the z-score: within reference up to 2, review from 2 to 3.5, larger deviation above 3.5. These are not clinical cut-offs. Because about 270 comparisons are made, a few land outside the central range by chance, so the overall statement uses limits calibrated on validation data rather than a single flag.',
    ],
  },
  {
    n: '03',
    title: 'The model score',
    body: [
      'A separate model looks at the whole pattern after removing overall body size, and gives a score between 0 and 1 for how much it resembles the unusual training examples. It is not the probability of disease.',
      'The model abstains when any spine measurement is missing, when values lie far outside what it learned from, or when its score falls in an uncertain band. Missing values are never filled in.',
    ],
  },
  {
    n: '04',
    title: 'Limits',
    body: [
      'Reference and model come from generated data with invented effect sizes. C1 and C2 are not measured, because the same measurements do not apply to them. Pixel-level or image analysis is outside this version.',
      'The optional AI assistant, when enabled, can explain a result in words. It never calculates or changes a result.',
    ],
  },
]

export default function About() {
  useDocumentTitle('Method and limits')
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-16 lg:px-10">
      <Label>Method and limits</Label>
      <h1 className="mt-4 max-w-3xl text-5xl">
        <RevealWords parts={[{ text: 'How a result is' }, { text: 'made', accent: true }, { text: ', and where it stops.' }]} />
      </h1>
      <div className="mt-14 grid gap-12 lg:grid-cols-2">
        {SECTIONS.map((s) => (
          <Reveal key={s.n} delay={(Number(s.n) % 2) * 0.08}>
          <section aria-labelledby={`about-${s.n}`}>
            <Rule number={s.n} />
            <h2 id={`about-${s.n}`} className="mt-3 text-3xl">
              {s.title}
            </h2>
            {s.body.map((p) => (
              <p key={p.slice(0, 24)} className="mt-4 max-w-[34rem] text-muted">
                {p}
              </p>
            ))}
          </section>
          </Reveal>
        ))}
      </div>
      <figure className="mt-16 max-w-3xl">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-rule font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">
              <th scope="col" className="py-2 pr-4 font-normal">
                Status
              </th>
              <th scope="col" className="py-2 pr-4 font-normal">
                Meaning
              </th>
              <th scope="col" className="py-2 font-normal">
                |z| range
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-rule">
              <th scope="row" className="py-3 pr-4 font-normal text-within">
                ● Within reference
              </th>
              <td className="py-3 pr-4 text-muted">Close to the reference for that level</td>
              <td className="py-3 font-mono tabular-nums">up to 2</td>
            </tr>
            <tr className="border-b border-rule">
              <th scope="row" className="py-3 pr-4 font-normal text-review">
                ◐ Review
              </th>
              <td className="py-3 pr-4 text-muted">Outside the central range; worth a closer look</td>
              <td className="py-3 font-mono tabular-nums">2 to 3.5</td>
            </tr>
            <tr className="border-b border-rule">
              <th scope="row" className="py-3 pr-4 font-normal text-large">
                ▲ Larger deviation
              </th>
              <td className="py-3 pr-4 text-muted">Far from the reference</td>
              <td className="py-3 font-mono tabular-nums">above 3.5</td>
            </tr>
            <tr className="border-b border-rule">
              <th scope="row" className="py-3 pr-4 font-normal text-missing">
                ○ Missing
              </th>
              <td className="py-3 pr-4 text-muted">No value was provided, so nothing is compared</td>
              <td className="py-3 font-mono">—</td>
            </tr>
          </tbody>
        </table>
        <Caption label="TABLE 2">Status words and demonstration thresholds. Non-clinical.</Caption>
      </figure>
    </div>
  )
}
