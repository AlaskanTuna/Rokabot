/**
 * Roka's kaomoji, grouped by feeling. A handful are offered each turn by the reply shape, so the faces keep
 * changing instead of settling on whatever a short list put first (#337 measured 18 distinct faces per 50
 * replies on Haiku against 31 on Flash Lite). Every face stays inside what markdownGuard can render as typed.
 */
import type { ToneKey } from './tones.js'

export type FaceGroup =
  | 'happy'
  | 'teasing'
  | 'flustered'
  | 'smug'
  | 'pouty'
  | 'soft'
  | 'sad'
  | 'surprised'
  | 'fired'
  | 'furious'

export const FACES: Record<FaceGroup, readonly string[]> = {
  happy: [
    '(≧▽≦)',
    '(´▽｀)',
    '(◕‿◕✿)',
    '(＾▽＾)',
    '(✿◠‿◠)',
    '(⌒▽⌒)',
    '(´∀｀)',
    '(＾ω＾)',
    '(ﾉ◕ヮ◕)ﾉ',
    '(๑˃ᴗ˂)ﻭ',
    '(・ω・)ノ',
    '(๑•́ ▽ •́๑)'
  ],
  teasing: ['(¬‿¬)', '(≖‿≖)', '(・∀・)', '(￣ー￣)', '(๑¯ω¯๑)', '(ꈍᴗꈍ)', 'σ(≧ε≦σ)', '(•̀ᴗ•́)', '(¬ω¬)', '(ㆁωㆁ)'],
  flustered: [
    '(⁄ ⁄•⁄ω⁄•⁄ ⁄)',
    '(,,>﹏<,,)',
    '(〃ω〃)',
    '(//▽//)',
    '(>///<)',
    '(〃▽〃)',
    '(⸝⸝•̀ ᴗ •́⸝⸝)',
    '(//∇//)',
    '(〃＞＿＜;〃)',
    '(*/ω＼*)',
    '(//>_<//)'
  ],
  smug: ['(￣▽￣)', '(￣ω￣)', '( ˘▽˘)っ', '(￣ー￣)ｂ', '( •̀ ω •́ )✧', '(^_^)v', '(￣∀￣)', '(￣ε￣)'],
  pouty: ['(｀へ´)', '(￣^￣)', '(ㆆ_ㆆ)', '(¬_¬)', '(｡•ˇ‸ˇ•｡)', '(〃｀3´〃)', '(・へ・)', '(💢・ω・)'],
  soft: [
    '( ˘ω˘ )',
    '(´-ω-｀)',
    '(｡•ᴗ•｡)',
    '(◡‿◡✿)',
    '(´｡• ᵕ •｡｀)',
    '(ᴗ˳ᴗ)',
    '(っ˘ω˘ς )',
    '(｡◕‿◕｡)',
    '(˶ᵔ ᵕ ᵔ˶)',
    '(´ε｀ )'
  ],
  sad: ['(´・ω・｀)', '(╥﹏╥)', '(´；ω；｀)', '(´•ω•̥)', '(´△｀)', '(｡•́︿•̀｡)', '(ಥ﹏ಥ)', '(｡ŏ﹏ŏ)', '(T▽T)'],
  surprised: ['(⊙_⊙)', '(°ロ°)', '(゜o゜)', '(ﾟДﾟ)', '(✪ω✪)', '(⊙▽⊙)', '(・□・;)', '(O_O)', '(ﾟoﾟ;)'],
  fired: ['(๑•̀ㅂ•́)و✧', '(ง •̀_•́)ง', '(•̀ᴗ•́)و', '(◣_◢)', '(｀・ω・´)ゞ', 'ᕦ(ò_óˇ)ᕤ', '(ﾉ｀Д´)ﾉ', '(๑•̀ㅁ•́๑)✧'],
  // Offered only when a message crosses a hard line. In everyday annoyance the rage face read as real anger, and
  // users echoed it back until it was in a third of her replies (v4).
  furious: ['(╬ಠ益ಠ)', '(ノಠ益ಠ)ノ', '(╬｀皿´)', '(╯°□°)╯', '(♯｀∧´)']
}

/** Which feelings each mood draws its faces from. */
export const TONE_FACES: Record<ToneKey, readonly FaceGroup[]> = {
  playful: ['happy', 'teasing', 'smug'],
  sincere: ['soft', 'sad'],
  domestic: ['soft', 'happy'],
  flustered: ['flustered', 'surprised'],
  curious: ['surprised', 'happy'],
  annoyed: ['pouty', 'teasing'],
  tender: ['soft', 'flustered'],
  confident: ['smug', 'happy'],
  nostalgic: ['soft', 'sad'],
  mischievous: ['smug', 'teasing'],
  sleepy: ['soft', 'sad'],
  competitive: ['fired', 'smug', 'pouty']
}
