import { motion, useMotionValue, useMotionValueEvent, useScroll, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { ReferenceInfo } from '../api/client'
import { SpineSchematic } from '../components/spine/SpineSchematic'
import { loadReferenceInfo } from '../features/results/selectors'
import { SpineFigure } from '../features/spine3d/SpineFigure'
import { CountUp, EASE, Magnet, Marquee, RevealWords, Stagger, StaggerItem } from '../components/fx'
import { ButtonLink, Caption, Label, Panel, Rule } from '../components/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { Reveal } from '../motion/Reveal'
import { useReducedMotionSafe } from '../motion/useReducedMotionSafe'

const CAPTIONS = [
  'Schematic spine, C1 to L5. Scroll and the vertebrae settle into the column.',
  'Twenty-two measured vertebrae and twenty-three discs, each compared with its own reference.',
  'Sizes are illustrative, from a synthetic reference. Not anatomically exact.',
]

const STEPS = [
  { n: '01', title: 'Bring measurements', body: 'Pick a synthetic sample case, upload a CSV, or type values in by hand. Every route ends at the same review step, where nothing is changed without telling you.' },
  { n: '02', title: 'Compare level by level', body: 'Each vertebra, disc and regional angle is compared only with the same level in a synthetic reference, using the matching sex group when you give it. You get the difference, the percentage, a z-score and a percentile.' },
  { n: '03', title: 'Read what stands out', body: 'Levels that sit far from the reference are marked on the spine and in a table. A second, separate model score looks at the whole pattern and says plainly when it cannot answer.' },
]

const MARQUEE = ['C3 vertebral body height anterior', 'L4-L5 disc height', 'T7 segmental sagittal angle', 'Lumbar regional angle L1-S1', 'z-score and percentile for every level', 'Matching reference by sex', 'Model score with abstention', 'No value is ever filled in', 'Synthetic data, not a diagnosis']

const TABLE = [
  { block: 'Vertebral bodies', count: '22 levels × 6', detail: 'C3 to L5: four edge heights, width, depth' },
  { block: 'Discs and segments', count: '23 levels × 3', detail: 'C2-C3 to L5-S1: disc height, sagittal and coronal angle' },
  { block: 'Regional angles', count: '3', detail: 'Cervical C2–C7, thoracic T1–T12, lumbar L1–S1' },
  { block: 'Person context', count: '16, optional', detail: 'Age, sex, height, history. No names or contact details exist' },
]

export default function Landing() {
  useDocumentTitle('')
  const reduced = useReducedMotionSafe()
  const container = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: container, offset: ['start start', 'end end'] })
  const spreadAnimated = useTransform(scrollYProgress, [0, 0.3], [1, 0])
  const still = useMotionValue(0)
  const [caption, setCaption] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => setCaption(v < 0.18 ? 0 : v < 0.7 ? 1 : 2))
  const spreadValue = reduced ? still : spreadAnimated
  const [reference, setReference] = useState<ReferenceInfo | null>(null)

  // The 3D scene is requested only when the browser is idle, so text and the action are usable first.
  useEffect(() => {
    // phones show the 2D figure only, so they never download the 3D scene
    if (reduced || !window.matchMedia?.('(min-width: 1024px)').matches) return
    const load = () => loadReferenceInfo().then(setReference, () => {})
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const id = idle ? idle(load, { timeout: 2500 }) : window.setTimeout(load, 1200)
    return () => (idle ? (window as unknown as { cancelIdleCallback: (n: number) => void }).cancelIdleCallback(id) : clearTimeout(id))
  }, [reduced])

  return (
    <div ref={container} className="mx-auto max-w-[1280px] px-6 lg:px-10">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div>
          <section className="pb-16 pt-14 lg:min-h-[78vh] lg:pt-20" aria-labelledby="hero-title">
            <Label>Atlas plate 01 · Spinal measurement analysis</Label>
            <h1 id="hero-title" className="mt-6 text-[clamp(2.6rem,6.2vw,5rem)]">
              <RevealWords parts={[{ text: 'Read the spine' }, { text: 'level by level', accent: true }, { text: '.' }]} delay={0.1} />
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg text-muted">
              Spinalytics compares each measured vertebra, disc and angle with a reference and shows where a pattern departs from it, with the numbers and the reasoning on the page. It runs on synthetic data and explains what it cannot say.
            </p>
            <Panel className="mt-10 max-w-[34rem]" as="div">
              <Label>Start here</Label>
              <p className="mt-2">Open a synthetic sample case and see a full result in under a minute, or bring your own measurements.</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Magnet>
                  <ButtonLink to="/analyze">Start an analysis</ButtonLink>
                </Magnet>
                <Magnet>
                  <ButtonLink to="/about" variant="secondary">
                    How it works
                  </ButtonLink>
                </Magnet>
              </div>
            </Panel>
          </section>

          <Stagger className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-4" aria-label="At a glance">
            {[
              { n: 204, label: 'Measurements' },
              { n: 22, label: 'Vertebrae' },
              { n: 23, label: 'Discs' },
              { n: 3, label: 'Regional angles' },
            ].map((s) => (
              <StaggerItem key={s.label} className="bg-bg p-4">
                <CountUp value={s.n} className="font-display text-4xl" />
                <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">{s.label}</p>
              </StaggerItem>
            ))}
          </Stagger>

          <figure className="mb-16 lg:hidden" aria-label="Schematic spine">
            <SpineSchematic className="mx-auto h-[26rem] w-auto max-w-full" />
            <Caption label="FIG. 1">{CAPTIONS[2]}</Caption>
          </figure>

          <section id="how" className="py-14" aria-labelledby="how-title">
            <Reveal>
              <Rule number="01" title="How it works" />
              <h2 id="how-title" className="mt-4 text-4xl">
                Three steps, <em className="text-accent">nothing hidden</em>.
              </h2>
            </Reveal>
            <ol className="mt-10 space-y-10">
              {STEPS.map((s, i) => (
                <li key={s.n}>
                  <Reveal delay={i * 0.05}>
                    <motion.div whileHover={{ x: 6 }} transition={{ duration: 0.3, ease: EASE }} className="group grid grid-cols-[3.5rem_1fr] gap-4 border-t border-rule pt-5 transition-colors hover:border-accent">
                      <span className="font-mono text-2xl text-accent transition-transform duration-300 group-hover:scale-110">{s.n}</span>
                      <div>
                        <h3 className="text-2xl">{s.title}</h3>
                        <p className="mt-2 max-w-[34rem] text-muted">{s.body}</p>
                      </div>
                    </motion.div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </section>

          <section id="measures" className="py-14" aria-labelledby="measures-title">
            <Reveal>
              <Rule number="02" title="What it measures" />
              <h2 id="measures-title" className="mt-4 text-4xl">
                Two hundred and four <em className="text-accent">measurements</em>.
              </h2>
              <figure className="mt-8 overflow-x-auto">
                <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-rule font-mono text-[0.72rem] uppercase tracking-[0.14em] text-muted">
                      <th scope="col" className="py-2 pr-4 font-normal">
                        Block
                      </th>
                      <th scope="col" className="py-2 pr-4 font-normal">
                        Count
                      </th>
                      <th scope="col" className="py-2 font-normal">
                        Contents
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {TABLE.map((r) => (
                      <tr key={r.block} className="border-b border-rule align-top">
                        <th scope="row" className="py-3 pr-4 font-normal">
                          {r.block}
                        </th>
                        <td className="whitespace-nowrap py-3 pr-4 font-mono tabular-nums text-muted">{r.count}</td>
                        <td className="py-3 text-muted">{r.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Caption label="TABLE 1">What one analysis can contain. C1 and C2 are drawn but not measured.</Caption>
              </figure>
            </Reveal>
          </section>

          <section id="limits" className="py-14" aria-labelledby="limits-title">
            <Reveal>
              <Rule number="03" title="Limits" />
              <h2 id="limits-title" className="mt-4 text-4xl">
                What this <em className="text-accent">cannot</em> do.
              </h2>
              <ul className="mt-8 max-w-[34rem] space-y-4 text-muted">
                <li>The reference and the model were built from generated data. They say nothing about real people.</li>
                <li>A result is a pattern of numbers, not a diagnosis, and never advice about treatment.</li>
                <li>When too much is missing, or values look unlike anything it learned from, it declines to give a score and says why.</li>
              </ul>
            </Reveal>
          </section>
        </div>

        <aside className="hidden lg:block" aria-label="Figure">
          <figure className="sticky top-24 flex h-[calc(100vh-7rem)] flex-col">
            <div className="relative min-h-0 flex-1">
              <SpineFigure reference={reference} spreadValue={spreadValue} interactive={false} force2d={reduced} className="absolute inset-0" />
            </div>
            <Caption label="FIG. 1">{CAPTIONS[caption]}</Caption>
          </figure>
        </aside>
      </div>

      <div className="mt-8">
        <Marquee items={MARQUEE} />
      </div>
    </div>
  )
}
