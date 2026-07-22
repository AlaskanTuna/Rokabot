export type CaptureKind = 'reply' | 'send' | 'editReply' | 'followUp' | 'react' | 'typing'

export interface CaptureSink {
  record(record: { kind: CaptureKind; payload: unknown }): void
}

export class HarnessCollection<K, V> extends Map<K, V> {
  filter(predicate: (value: V, key: K, collection: this) => boolean): HarnessCollection<K, V> {
    const filtered = new HarnessCollection<K, V>()
    for (const [key, value] of this) {
      if (predicate(value, key, this)) filtered.set(key, value)
    }
    return filtered
  }

  map<T>(mapper: (value: V, key: K, collection: this) => T): T[] {
    const mapped: T[] = []
    for (const [key, value] of this) {
      mapped.push(mapper(value, key, this))
    }
    return mapped
  }
}

export interface UserSpec {
  id?: string
  bot?: boolean
  username?: string
  displayName?: string
}

export interface FakeUser {
  id: string
  bot: boolean
  username: string
  displayName: string
}

export function makeUser(spec: UserSpec = {}): FakeUser {
  return {
    id: spec.id ?? 'user-1',
    bot: spec.bot ?? false,
    username: spec.username ?? 'user',
    displayName: spec.displayName ?? spec.username ?? 'User'
  }
}

export interface MemberSpec {
  displayName?: string
  user?: UserSpec
}

export interface FakeMember {
  displayName: string
  user: FakeUser
}

export function makeMember(spec: MemberSpec = {}): FakeMember {
  const user = makeUser(spec.user)
  return {
    displayName: spec.displayName ?? user.displayName,
    user
  }
}

export interface GuildSpec {
  me?: MemberSpec | null
}

export interface FakeGuild {
  members: {
    me: FakeMember | null
  }
}

export function makeGuild(spec: GuildSpec = {}): FakeGuild {
  return {
    members: {
      me: spec.me === null ? null : makeMember(spec.me)
    }
  }
}

export interface ComponentSpec {
  type: number
  content?: string
  components?: readonly ComponentSpec[]
  label?: string
}

export interface ComponentData {
  type: number
  content?: string
  components?: ComponentData[]
  label?: string
}

export interface FakeComponent {
  toJSON(): ComponentData
}

function makeComponent(spec: ComponentSpec): FakeComponent {
  return {
    toJSON: () => ({
      type: spec.type,
      ...(spec.content === undefined ? {} : { content: spec.content }),
      ...(spec.components === undefined
        ? {}
        : { components: spec.components.map((component) => makeComponent(component).toJSON()) }),
      ...(spec.label === undefined ? {} : { label: spec.label })
    })
  }
}

export interface AttachmentSpec {
  id?: string
  url: string
  contentType?: string | null
}

export interface FakeAttachment {
  id: string
  url: string
  contentType: string | null
}

function makeAttachments(attachments: readonly AttachmentSpec[] = []): HarnessCollection<string, FakeAttachment> {
  return new HarnessCollection(
    attachments.map((attachment, index) => [
      attachment.id ?? String(index),
      {
        id: attachment.id ?? String(index),
        url: attachment.url,
        contentType: attachment.contentType ?? null
      }
    ])
  )
}

export interface EmbedSpec {
  author?: { name?: string }
  title?: string
  description?: string
  fields?: readonly { name: string; value: string }[]
  footer?: { text?: string }
  image?: { url?: string }
  thumbnail?: { url?: string }
}

export interface PollAnswerSpec {
  id?: string
  text?: string
}

export interface PollSpec {
  question: string | { text: string }
  answers?: readonly (string | PollAnswerSpec)[]
}

export interface FakePoll {
  question: { text: string }
  answers: HarnessCollection<string, PollAnswerSpec>
}

function makePoll(spec: PollSpec | null | undefined): FakePoll | null {
  if (!spec) return null

  return {
    question: { text: typeof spec.question === 'string' ? spec.question : spec.question.text },
    answers: new HarnessCollection(
      (spec.answers ?? []).map((answer, index) => {
        const value = typeof answer === 'string' ? { text: answer } : answer
        return [value.id ?? String(index), value]
      })
    )
  }
}

export interface SnapshotSpec {
  id?: string
  content?: string
  components?: readonly ComponentSpec[]
  embeds?: readonly EmbedSpec[]
  attachments?: readonly AttachmentSpec[]
}

export interface FakeSnapshot {
  content?: string
  components: FakeComponent[]
  embeds: EmbedSpec[]
  attachments: HarnessCollection<string, FakeAttachment>
}

function makeSnapshots(snapshots: readonly SnapshotSpec[] = []): HarnessCollection<string, FakeSnapshot> {
  return new HarnessCollection(
    snapshots.map((snapshot, index) => [
      snapshot.id ?? String(index),
      {
        ...(snapshot.content === undefined ? {} : { content: snapshot.content }),
        components: (snapshot.components ?? []).map(makeComponent),
        embeds: [...(snapshot.embeds ?? [])],
        attachments: makeAttachments(snapshot.attachments)
      }
    ])
  )
}

export interface StickerSpec {
  id?: string
  name: string
}

export interface FakeSticker {
  id: string
  name: string
}

function makeStickers(stickers: readonly StickerSpec[] = []): HarnessCollection<string, FakeSticker> {
  return new HarnessCollection(
    stickers.map((sticker, index) => [
      sticker.id ?? String(index),
      { id: sticker.id ?? String(index), name: sticker.name }
    ])
  )
}

export interface FakeSentMessage {
  delete(): Promise<void>
}

function makeSentMessage(): FakeSentMessage {
  return {
    delete: async () => {}
  }
}

function record(sink: CaptureSink | undefined, kind: CaptureKind, payload: unknown): void {
  sink?.record({ kind, payload })
}

export interface ChannelSpec {
  id?: string
  sink?: CaptureSink
  messages?: ReadonlyMap<string, FakeMessage> | Record<string, FakeMessage>
}

export interface FakeChannel {
  id: string
  messages: {
    fetch(id: string): Promise<FakeMessage>
  }
  send(payload: unknown): Promise<FakeSentMessage>
  sendTyping(): Promise<void>
}

function toMessageMap(messages: ChannelSpec['messages']): Map<string, FakeMessage> {
  if (!messages) return new Map()
  return messages instanceof Map ? new Map(messages) : new Map(Object.entries(messages))
}

export function makeChannel(spec: ChannelSpec = {}): FakeChannel {
  const messages = toMessageMap(spec.messages)

  return {
    id: spec.id ?? 'channel-1',
    messages: {
      fetch: async (id) => {
        const message = messages.get(id)
        if (!message) throw new Error(`Referenced message not found: ${id}`)
        return message
      }
    },
    send: async (payload) => {
      record(spec.sink, 'send', payload)
      return makeSentMessage()
    },
    sendTyping: async () => {
      record(spec.sink, 'typing', undefined)
    }
  }
}

export interface MessageSpec {
  author?: UserSpec
  mentions?: Iterable<string>
  channelId?: string
  guildId?: string | null
  guild?: FakeGuild | null
  member?: MemberSpec | null
  content?: string
  components?: readonly ComponentSpec[]
  reference?: { messageId: string } | string | null
  channel?: FakeChannel
  referencedMessages?: ReadonlyMap<string, FakeMessage> | Record<string, FakeMessage>
  attachments?: readonly AttachmentSpec[]
  embeds?: readonly EmbedSpec[]
  poll?: PollSpec | null
  messageSnapshots?: readonly SnapshotSpec[]
  stickers?: readonly StickerSpec[]
  sink?: CaptureSink
}

export interface FakeMessage {
  author: FakeUser
  mentions: {
    has(id: string): boolean
  }
  channelId: string
  guildId: string | null
  guild: FakeGuild | null
  member: FakeMember | null
  content: string
  components: FakeComponent[]
  reference: { messageId: string } | null
  channel: FakeChannel
  attachments: HarnessCollection<string, FakeAttachment>
  embeds: EmbedSpec[]
  poll: FakePoll | null
  messageSnapshots: HarnessCollection<string, FakeSnapshot>
  stickers: HarnessCollection<string, FakeSticker>
  react(emoji: string): Promise<FakeMessage>
  reply(payload: unknown): Promise<FakeSentMessage>
}

export function makeMessage(spec: MessageSpec = {}): FakeMessage {
  const channel =
    spec.channel ??
    makeChannel({
      id: spec.channelId,
      sink: spec.sink,
      messages: spec.referencedMessages
    })
  const reference = typeof spec.reference === 'string' ? { messageId: spec.reference } : (spec.reference ?? null)

  const message: FakeMessage = {
    author: makeUser(spec.author),
    mentions: {
      has: (id) => new Set(spec.mentions).has(id)
    },
    channelId: spec.channelId ?? channel.id,
    guildId: spec.guildId ?? null,
    guild: spec.guild ?? null,
    member: spec.member === null ? null : spec.member ? makeMember(spec.member) : null,
    content: spec.content ?? '',
    components: (spec.components ?? []).map(makeComponent),
    reference,
    channel,
    attachments: makeAttachments(spec.attachments),
    embeds: [...(spec.embeds ?? [])],
    poll: makePoll(spec.poll),
    messageSnapshots: makeSnapshots(spec.messageSnapshots),
    stickers: makeStickers(spec.stickers),
    react: async (emoji) => {
      record(spec.sink, 'react', emoji)
      return message
    },
    reply: async (payload) => {
      record(spec.sink, 'reply', payload)
      return makeSentMessage()
    }
  }

  return message
}

export interface ClientSpec {
  user?: UserSpec | null
  channels?: ReadonlyMap<string, FakeChannel> | Record<string, FakeChannel>
}

export interface FakeClient {
  user: FakeUser | null
  channels: {
    cache: Map<string, FakeChannel>
  }
}

function toChannelMap(channels: ClientSpec['channels']): Map<string, FakeChannel> {
  if (!channels) return new Map()
  return channels instanceof Map ? new Map(channels) : new Map(Object.entries(channels))
}

export function makeClient(spec: ClientSpec = {}): FakeClient {
  return {
    user:
      spec.user === null
        ? null
        : makeUser({ id: 'roka', bot: true, username: 'roka', displayName: 'Roka', ...spec.user }),
    channels: {
      cache: toChannelMap(spec.channels)
    }
  }
}

export interface InteractionAttachmentSpec {
  url: string
  contentType?: string | null
}

export interface InteractionSpec {
  isChatInputCommand?: boolean
  commandName?: string
  stringOptions?: Record<string, string | null | undefined>
  attachmentOptions?: Record<string, InteractionAttachmentSpec | null | undefined>
  subcommand?: string
  channelId?: string
  member?: MemberSpec | null
  user?: UserSpec
  guildId?: string | null
  sink?: CaptureSink
}

export interface FakeInteraction {
  commandName: string
  channelId: string
  member: FakeMember | null
  user: FakeUser
  guildId: string | null
  deferred: boolean
  replied: boolean
  options: {
    getString(name: string, required?: boolean): string | null
    getAttachment(name: string): InteractionAttachmentSpec | null
    getSubcommand(): string
  }
  isChatInputCommand(): boolean
  reply(payload: unknown): Promise<FakeSentMessage>
  deferReply(): Promise<void>
  editReply(payload: unknown): Promise<FakeSentMessage>
  followUp(payload: unknown): Promise<FakeSentMessage>
}

export function makeInteraction(spec: InteractionSpec = {}): FakeInteraction {
  const interaction: FakeInteraction = {
    commandName: spec.commandName ?? 'chat',
    channelId: spec.channelId ?? 'channel-1',
    member: spec.member === null ? null : spec.member ? makeMember(spec.member) : null,
    user: makeUser(spec.user),
    guildId: spec.guildId ?? null,
    deferred: false,
    replied: false,
    options: {
      getString: (name, required) => {
        const value = spec.stringOptions?.[name] ?? null
        if (required && value === null) throw new Error(`Required string option not found: ${name}`)
        return value
      },
      getAttachment: (name) => spec.attachmentOptions?.[name] ?? null,
      getSubcommand: () => spec.subcommand ?? ''
    },
    isChatInputCommand: () => spec.isChatInputCommand ?? true,
    reply: async (payload) => {
      interaction.replied = true
      record(spec.sink, 'reply', payload)
      return makeSentMessage()
    },
    deferReply: async () => {
      interaction.deferred = true
    },
    editReply: async (payload) => {
      record(spec.sink, 'editReply', payload)
      return makeSentMessage()
    },
    followUp: async (payload) => {
      record(spec.sink, 'followUp', payload)
      return makeSentMessage()
    }
  }

  return interaction
}
