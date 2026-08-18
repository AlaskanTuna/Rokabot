import { config } from '../config.js'

/** In-character response pools for rate limiting and error handling */

const DECLINE_MESSAGES = [
  'ちょっと待ってね~ Give me a moment.',
  "Mou~ I'm a bit busy right now. Hold on, okay?",
  'Ara ara~ so impatient. Just a little bit longer~',
  "Fufu~ everyone's talking at once. Let me catch my breath.",
  "Ah, sorry — I'm in the middle of something. I'll be right back!"
]

const BUSY_MESSAGES = [
  "I'm still thinking~ just a moment, okay?",
  "Mou~ hold on, I haven't finished my thought yet!",
  "Ah, wait wait — I'm still working on my answer~",
  'Fufu~ so eager. Let me finish what I was saying first!',
  "One thing at a time~ I'm almost done, I promise!"
]

const ERROR_MESSAGES = [
  'Nn... something feels off. Let me try again in a bit, okay?',
  "Ah, that's strange... my thoughts got all jumbled up. Give me a moment.",
  'Mou, I lost my train of thought... sorry about that.'
]

// Appended to a normal reply when someone attaches something she cannot open. Silence reads as
// hallucination or evasion — she answers the question and says plainly that the file was not one of them.
const UNSUPPORTED_ATTACHMENT_MESSAGES = [
  "Ah — I couldn't open that file, sorry~ Could you tell me what's in it?",
  "Mou~ that kind of file is beyond me. Describe it for me and I'll help!",
  "Nn... I can't peek inside that one. Images I can see, but not that~",
  "Sorry, that attachment isn't something I can look at — but I'm listening!"
]

export function getRandomUnsupportedAttachment(): string {
  return UNSUPPORTED_ATTACHMENT_MESSAGES[Math.floor(Math.random() * UNSUPPORTED_ATTACHMENT_MESSAGES.length)]
}

export function getRandomDecline(): string {
  return DECLINE_MESSAGES[Math.floor(Math.random() * DECLINE_MESSAGES.length)]
}

export function getRandomBusy(): string {
  return BUSY_MESSAGES[Math.floor(Math.random() * BUSY_MESSAGES.length)]
}

export function getRandomError(): string {
  return ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)]
}

/** Split long responses to fit within Discord's message character limit */
export function splitResponse(text: string, maxLength = config.discord.maxMessageLength): string[] {
  if (text.length <= maxLength) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    let splitIndex = remaining.lastIndexOf('\n', maxLength)
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', maxLength)
    }
    if (splitIndex === -1 || splitIndex < maxLength * 0.5) {
      splitIndex = maxLength
      // A hard cut lands on an arbitrary UTF-16 code unit, and Roka's replies are full of emoji, which are
      // surrogate pairs. Cutting between the halves emits two lone surrogates that Discord renders as
      // replacement characters, so step back off the pair. Never past index 1, which would stall the loop.
      const trailing = remaining.charCodeAt(splitIndex - 1)
      if (splitIndex > 1 && trailing >= 0xd800 && trailing <= 0xdbff) splitIndex -= 1
    }

    chunks.push(remaining.slice(0, splitIndex))
    remaining = remaining.slice(splitIndex).trimStart()
  }

  return chunks
}
