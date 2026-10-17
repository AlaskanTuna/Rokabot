import { PreviewPanel } from '../components/editor/PreviewPanel'
import { PackFileScreen } from './identity/PackFileScreen'

// Faces are a few characters long, so each face group packs into a denser grid; comedy bits are sentences.
const LAYOUT =
  '[&_[data-path^=faces]_ul]:grid-cols-[repeat(auto-fill,minmax(104px,1fr))] [&_[data-path$=bits]_ul]:grid-cols-1'

export default function VoiceScreen() {
  return (
    <PackFileScreen
      title="Voice"
      file="voice.yml"
      blurb="the reply-shape dice"
      formClassName={LAYOUT}
      aside={(path) => <PreviewPanel file={path} />}
    />
  )
}
