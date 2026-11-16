import { ButtonLink, Label } from '../components/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export default function NotFound() {
  useDocumentTitle('Page not found')
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10">
      <Label>Error 404</Label>
      <h1 className="mt-4 text-5xl">
        Page <em className="text-accent">not found</em>
      </h1>
      <p className="mt-4 max-w-prose text-muted">There is nothing at this address.</p>
      <ButtonLink to="/" className="mt-8">
        Back to the start
      </ButtonLink>
    </div>
  )
}
