import { Button, Caption, Label, NumberCell, Panel, Rule, StatusBadge, SyntheticBadge, type Status } from '../components/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useTheme } from '../theme/ThemeProvider'

const SWATCHES = ['bg', 'surface', 'rule', 'text', 'muted', 'accent', 'within', 'review', 'large', 'missing', 'bone']
const STATUSES: Status[] = ['within', 'review', 'large_deviation', 'missing']

export default function Styleguide() {
  useDocumentTitle('Styleguide')
  const { theme } = useTheme()
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-16 lg:px-10">
      <Label>Styleguide · {theme} theme</Label>
      <h1 className="mt-4 text-5xl">
        Tokens and <em className="text-accent">primitives</em>.
      </h1>

      <section className="mt-12" aria-labelledby="sg-colour">
        <Rule number="01" title="Colour tokens" />
        <h2 id="sg-colour" className="sr-only">
          Colour tokens
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          {SWATCHES.map((name) => (
            <li key={name}>
              <div className="h-14 rounded-sm border border-rule" style={{ background: `var(--${name})` }} />
              <p className="mt-2 font-mono text-[0.72rem] uppercase tracking-[0.12em] text-muted">--{name}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="sg-type">
        <Rule number="02" title="Type" />
        <h2 id="sg-type" className="mt-4 text-4xl">
          Display in Fraunces with one <em className="text-accent">italic</em> word
        </h2>
        <p className="mt-3 max-w-prose">Body text is IBM Plex Sans. Labels, numbers and captions are IBM Plex Mono.</p>
        <p className="mt-3 font-mono text-sm uppercase tracking-[0.16em] text-muted">Mono label · 0123456789</p>
      </section>

      <section className="mt-12" aria-labelledby="sg-status">
        <Rule number="03" title="Status" />
        <h2 id="sg-status" className="sr-only">
          Status badges
        </h2>
        <div className="mt-6 flex flex-wrap gap-8">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="sg-parts">
        <Rule number="04" title="Components" />
        <h2 id="sg-parts" className="sr-only">
          Components
        </h2>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <SyntheticBadge />
        </div>
        <Panel className="mt-6 max-w-md" as="div">
          <Label>Panel</Label>
          <p className="mt-2">Surface with a hairline border and a 2 px corner.</p>
        </Panel>
        <figure className="mt-6 max-w-md">
          <div className="grid grid-cols-2 gap-2 border-b border-rule py-2">
            <span>L3 width</span>
            <NumberCell value={44.123} unit="mm" />
            <span>Segmental angle</span>
            <NumberCell value={-1.2} unit="°" digits={1} signed />
            <span>Percentage</span>
            <NumberCell value={null} />
          </div>
          <Caption label="TABLE 3">Numbers are tabular, right-aligned and carry a unit.</Caption>
        </figure>
      </section>
    </div>
  )
}
