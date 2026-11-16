import { Label } from '../components/ui'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

/** Used for routes whose screens are built in a later milestone. */
export default function Placeholder({ title }: { title: string }) {
  useDocumentTitle(title)
  return (
    <div className="mx-auto max-w-[1280px] px-6 py-24 lg:px-10">
      <Label>Coming in a later milestone</Label>
      <h1 className="mt-4 text-5xl">{title}</h1>
    </div>
  )
}
