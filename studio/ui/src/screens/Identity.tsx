import { PreviewPanel } from '../components/editor/PreviewPanel'
import { href, navigate } from '../lib/router'
import { PackFileScreen } from './identity/PackFileScreen'

const EXCLUDE = ['prompt']
// Each hour band reads as one row: the two hours side by side, its text across the full width below.
const BANDS =
  '[&_[data-path*=timeOfDay]>.grid]:grid-cols-[96px_96px_minmax(0,1fr)] [&_[data-path*=timeOfDay]>.grid>[data-path$=text]]:col-span-full'

function PromptOrderNote() {
  const target = href('prompts')
  return (
    <p className="text-small text-ink-3">
      System prompt order lives in{' '}
      <a
        href={target}
        onClick={(event) => {
          event.preventDefault()
          navigate(target)
        }}
        className="rounded-sm text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-ink"
      >
        Prompts
      </a>
      .
    </p>
  )
}

export default function IdentityScreen() {
  return (
    <PackFileScreen
      title="Identity"
      file="character.yml"
      blurb="who the character is"
      exclude={EXCLUDE}
      note={<PromptOrderNote />}
      formClassName={BANDS}
      aside={(path) => <PreviewPanel file={path} />}
    />
  )
}
