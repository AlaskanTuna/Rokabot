// Values come from the Discord web client's shipped CSS (visual-refresh build, Oct 2026): theme tokens, the cozy
// message module, markup, and the Components V2 modules. gg sans is proprietary, so Noto Sans (its own fallback) stands in.
export const PREVIEW_STYLES = `
:root {
  --font-primary: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-code: 'gg mono', 'Source Code Pro', Consolas, 'Andale Mono WT', 'Andale Mono', 'Lucida Console', 'Lucida Sans Typewriter', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Liberation Mono', 'Nimbus Mono L', Monaco, 'Courier New', Courier, monospace;
  --brand: #5865f2;
  --brand-hover: #4452bb;
  --white: #ffffff;
  --message-hover: rgba(151, 151, 159, 0.122);
  --mod-subtle: rgba(151, 151, 159, 0.122);
  --mention-bg: rgba(88, 101, 242, 0.239);
  --code-bg: rgba(88, 101, 242, 0.078);
  --filled-border: rgba(255, 255, 255, 0.078);
  --success: #008545;
  --success-hover: #006c37;
  --danger: #d22d39;
  --danger-hover: #a9232e;
  --reaction-reacted-bg: rgba(88, 101, 242, 0.239);
  --shadow-low: 0 1px 4px 0 rgba(0, 0, 0, 0.14);
}

.theme-ash {
  color-scheme: dark;
  --bg-chat: #323339;
  --surface-high: #393a41;
  --mod-normal: rgba(151, 151, 159, 0.161);
  --mod-strong: rgba(151, 151, 159, 0.2);
  --text-strong: #ffffff;
  --text-default: #f3f3f4;
  --text-subtle: #c5c6ca;
  --text-muted: #abacb2;
  --chat-text-muted: #9d9ea5;
  --text-link: #76aff6;
  --text-code: #ffffff;
  --border-subtle: rgba(151, 151, 159, 0.122);
  --border-normal: rgba(151, 151, 159, 0.2);
  --border-muted: rgba(151, 151, 159, 0.039);
  --spine: #595a63;
  --mention-fg: #cdd7ff;
  --spoiler-hidden: #7d7e87;
  --spoiler-hidden-hover: #9d9ea5;
  --secondary-bg: rgba(151, 151, 159, 0.122);
  --secondary-bg-hover: rgba(151, 151, 159, 0.161);
  --secondary-text: #ffffff;
  --input-bg: rgba(0, 0, 0, 0.078);
  --input-border: rgba(151, 151, 159, 0.2);
  --reaction-reacted-text: #dfe4ff;
  --code-keyword: #ffbdb9;
  --code-string: #96dda9;
  --code-comment: #b3b3b9;
  --code-number: #fcc0a1;
  --code-title: #bccaff;
  --code-type: #ffb6ed;
  --code-attribute: #abcfff;
  --code-builtin: #ffc252;
}

.theme-dark {
  color-scheme: dark;
  --bg-chat: #1a1a1e;
  --surface-high: #242429;
  --mod-normal: rgba(151, 151, 159, 0.161);
  --mod-strong: rgba(151, 151, 159, 0.2);
  --text-strong: #fbfbfb;
  --text-default: #efeff1;
  --text-subtle: #abacb2;
  --text-muted: #96979e;
  --chat-text-muted: #81828a;
  --text-link: #4d96ee;
  --text-code: #e4e4e6;
  --border-subtle: rgba(151, 151, 159, 0.122);
  --border-normal: rgba(151, 151, 159, 0.2);
  --border-muted: rgba(151, 151, 159, 0.039);
  --spine: #474851;
  --mention-fg: #a9bbff;
  --spoiler-hidden: #666770;
  --spoiler-hidden-hover: #84858d;
  --secondary-bg: rgba(151, 151, 159, 0.122);
  --secondary-bg-hover: rgba(151, 151, 159, 0.161);
  --secondary-text: #fbfbfb;
  --input-bg: rgba(0, 0, 0, 0.122);
  --input-border: rgba(151, 151, 159, 0.2);
  --reaction-reacted-text: #b9c8ff;
  --code-keyword: #ff9691;
  --code-string: #73c48b;
  --code-comment: #999aa1;
  --code-number: #efa275;
  --code-title: #9db0ff;
  --code-type: #ff8be2;
  --code-attribute: #82b7f8;
  --code-builtin: #f49f00;
}

.theme-onyx {
  color-scheme: dark;
  --bg-chat: #000000;
  --surface-high: #0a0a0c;
  --mod-normal: rgba(151, 151, 159, 0.2);
  --mod-strong: rgba(151, 151, 159, 0.239);
  --text-strong: #dcdcdf;
  --text-default: #d4d5d8;
  --text-subtle: #96979e;
  --text-muted: #81828a;
  --chat-text-muted: #73747d;
  --text-link: #2781e7;
  --text-code: #c9cace;
  --border-subtle: rgba(151, 151, 159, 0.2);
  --border-normal: rgba(151, 151, 159, 0.239);
  --border-muted: rgba(151, 151, 159, 0.161);
  --spine: #383940;
  --mention-fg: #8ca0fd;
  --spoiler-hidden: #595a63;
  --spoiler-hidden-hover: #767780;
  --secondary-bg: rgba(151, 151, 159, 0.122);
  --secondary-bg-hover: rgba(151, 151, 159, 0.2);
  --secondary-text: #dcdcdf;
  --input-bg: rgba(0, 0, 0, 0.122);
  --input-border: rgba(151, 151, 159, 0.239);
  --reaction-reacted-text: #9aadff;
  --code-keyword: #f67774;
  --code-string: #57af74;
  --code-comment: #888991;
  --code-number: #e18752;
  --code-title: #8195fb;
  --code-type: #ff59d5;
  --code-attribute: #5ea0f1;
  --code-builtin: #dc8d00;
}

.theme-light {
  color-scheme: light;
  --bg-chat: #fbfbfb;
  --surface-high: #ffffff;
  --mod-normal: rgba(151, 151, 159, 0.161);
  --mod-strong: rgba(151, 151, 159, 0.239);
  --text-strong: #28282d;
  --text-default: #2e2e34;
  --text-subtle: #595a63;
  --text-muted: #6c6d76;
  --chat-text-muted: #70717a;
  --text-link: #006dd4;
  --text-code: #36373e;
  --border-subtle: rgba(151, 151, 159, 0.278);
  --border-normal: rgba(151, 151, 159, 0.4);
  --border-muted: rgba(151, 151, 159, 0.2);
  --spine: #c5c6ca;
  --mention-fg: #2e3c88;
  --code-bg: rgba(88, 101, 242, 0.039);
  --spoiler-hidden: #8f9097;
  --spoiler-hidden-hover: #70717a;
  --secondary-bg: rgba(151, 151, 159, 0.122);
  --secondary-bg-hover: rgba(151, 151, 159, 0.161);
  --secondary-text: #28282d;
  --input-bg: rgba(0, 0, 0, 0.02);
  --input-border: rgba(151, 151, 159, 0.4);
  --reaction-reacted-text: #273478;
  --shadow-low: 0 1px 4px 0 rgba(0, 0, 0, 0.08);
  --code-keyword: #a9232e;
  --code-string: #006734;
  --code-comment: #696a73;
  --code-number: #963b03;
  --code-title: #404eb1;
  --code-type: #9b277e;
  --code-attribute: #0158ab;
  --code-builtin: #884800;
}

* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--bg-chat);
  color: var(--text-default);
  font-family: var(--font-primary);
  font-size: 16px;
  line-height: 1;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
img { display: block; }

.app { height: 100%; display: flex; }
.chat { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; background: var(--bg-chat); }

.channel-header {
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-subtle);
}
.channel-icon { color: var(--text-muted); flex: 0 0 auto; }
.channel-name { margin: 0; font-size: 16px; line-height: 20px; font-weight: 600; color: var(--text-strong); }
.toolbar { margin-left: auto; }
.theme-picker { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.theme-picker select {
  font: inherit;
  color: var(--text-default);
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 4px;
  padding: 2px 6px;
}

.messages { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; }
.message-list { list-style: none; margin: 0; padding: 0 0 26px; }

.message-item { position: relative; outline: none; }
.message {
  position: relative;
  padding: 2px 24px 2px 72px;
  border-start-end-radius: 4px;
  border-end-end-radius: 4px;
  overflow-wrap: break-word;
}
.message:hover { background: var(--message-hover); }
.message.group-start { margin-top: 1.0625rem; min-height: 2.75rem; }

.avatar {
  position: absolute;
  left: 16px;
  margin-top: 2px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  overflow: hidden;
  z-index: 1;
}

.message-header {
  margin: 0;
  display: block;
  font-size: 1rem;
  font-weight: 400;
  line-height: 1.375rem;
  min-height: 1.375rem;
  color: var(--text-muted);
  white-space: break-spaces;
}
.header-text { margin-inline-end: 0.25rem; }
.username {
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.375rem;
  color: var(--text-strong);
  cursor: pointer;
  overflow-wrap: break-word;
}
.username:hover { text-decoration: underline; }
.bot-tag {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  position: relative;
  top: 0.1rem;
  height: 0.9375rem;
  margin-inline-start: 0.25rem;
  margin-top: 0.2em;
  padding: 0 0.275rem;
  border-radius: 4px;
  background: var(--brand);
  color: var(--white);
  font-size: 0.625rem;
  text-transform: uppercase;
  vertical-align: top;
  text-indent: 0;
}
.bot-tag-text {
  position: relative;
  font-size: 0.8rem;
  line-height: 0.9375rem;
  font-weight: 600;
  vertical-align: top;
}
.message-timestamp {
  display: inline-block;
  height: 1.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.375rem;
  color: var(--chat-text-muted);
  vertical-align: baseline;
  cursor: default;
}
.message-gutter-time {
  position: absolute;
  left: 0;
  width: 56px;
  text-align: right;
  font-size: 0.6875rem;
  line-height: 1.375rem;
  color: var(--chat-text-muted);
  visibility: hidden;
  pointer-events: none;
}
.message:hover .message-gutter-time { visibility: visible; }

.reply-context {
  position: relative;
  display: flex;
  align-items: center;
  height: 18px;
  margin-bottom: 4px;
  font-size: 0.875rem;
  line-height: 1.125rem;
  color: var(--text-default);
  white-space: pre;
}
.reply-context::before {
  content: '';
  position: absolute;
  left: -36px;
  right: calc(100% + 4px);
  top: 50%;
  bottom: -2px;
  border-top: 2px solid var(--spine);
  border-left: 2px solid var(--spine);
  border-start-start-radius: 6px;
}
.reply-avatar { width: 16px; height: 16px; border-radius: 50%; flex: 0 0 auto; margin-inline-end: 0.25rem; }
.reply-username { font-weight: 500; color: var(--text-strong); opacity: 0.64; flex: 0 0 auto; margin-inline-end: 0.25rem; }
.reply-text { overflow: hidden; text-overflow: ellipsis; min-width: 0; color: var(--text-subtle); }
.reply-text.markup { font-size: inherit; line-height: inherit; white-space: nowrap; color: var(--text-subtle); }
.reply-text .emoji { width: 1rem; height: 1rem; }
.interaction-used { margin-inline-end: 0.25rem; }
.command-name {
  background: var(--mention-bg);
  border-radius: 3px;
  color: var(--text-link);
  font-weight: 500;
  padding: 0 2px;
}
.command-name:hover { background: var(--brand); color: var(--white); }

.markup {
  font-size: 1rem;
  line-height: 1.375rem;
  color: var(--text-default);
  white-space: break-spaces;
  word-wrap: break-word;
  user-select: text;
}
.markup strong { font-weight: 700; }
.markup .link { color: var(--text-link); text-decoration: none; }
.markup .link:hover { text-decoration: underline; }
.markup h1, .markup h2, .markup h3 {
  margin: 16px 0 8px;
  font-family: var(--font-primary);
  font-weight: 700;
  line-height: 1.375em;
  color: var(--text-strong);
}
.markup h1 { font-size: 1.5rem; }
.markup h2 { font-size: 1.25rem; }
.markup h3 { font-size: 1rem; }
.markup h1:first-child, .markup h2:first-child { margin-top: 8px; }
.markup h3:first-child { margin-top: 4px; }
.markup .subtext {
  display: block;
  font-size: 0.875rem;
  line-height: 1.20313rem;
  color: var(--text-subtle);
}
.markup .blockquote { display: flex; margin-block: 4px; }
.markup .blockquote-bar { width: 4px; min-width: 4px; border-radius: 4px; background: var(--spine); }
.markup blockquote {
  margin: 0;
  padding-inline: 12px 8px;
  max-width: 90%;
  color: var(--text-subtle);
  text-indent: 0;
}
.markup ul, .markup ol {
  margin-block: 4px 0;
  margin-inline: 16px 0;
  padding: 0;
  list-style-position: outside;
}
.markup ul { list-style-type: disc; }
.markup ul ul { list-style-type: circle; }
.markup ol { list-style-type: decimal; margin-inline-start: calc(0.4em + var(--totalCharacters, 1) * 0.6em); }
.markup li { margin-bottom: 4px; }
.markup code.inline {
  font-family: var(--font-code);
  font-size: 85%;
  line-height: 1.125rem;
  padding: 0 0.2em;
  margin: -0.2em 0;
  border-radius: 4px;
  background: var(--code-bg);
  border: 1px solid var(--border-normal);
  text-indent: 0;
  white-space: pre-wrap;
}
.markup pre.codeblock {
  margin: 6px 0 0;
  max-width: 90%;
  border-radius: 4px;
  font-family: var(--font-code);
  font-size: 0.75rem;
  line-height: 1rem;
  white-space: pre-wrap;
}
.markup pre.codeblock code {
  display: block;
  padding: 0.5em;
  border-radius: 4px;
  border: 1px solid var(--border-normal);
  background: var(--code-bg);
  color: var(--text-code);
  font-family: var(--font-code);
  font-size: 0.875rem;
  line-height: 1.125rem;
  overflow-x: auto;
  white-space: pre-wrap;
  text-indent: 0;
}
.hljs-doctag, .hljs-keyword, .hljs-meta .hljs-keyword, .hljs-template-tag, .hljs-template-variable, .hljs-variable.language_, .hljs-section, .hljs-deletion { color: var(--code-keyword); }
.hljs-type, .hljs-name, .hljs-quote, .hljs-selector-pseudo, .hljs-selector-tag { color: var(--code-type); }
.hljs-title, .hljs-title.class_, .hljs-title.function_ { color: var(--code-title); }
.hljs-attr, .hljs-attribute, .hljs-bullet, .hljs-link { color: var(--code-attribute); }
.hljs-meta, .hljs-symbol, .hljs-built_in { color: var(--code-builtin); }
.hljs-number { color: var(--code-number); }
.hljs-string, .hljs-meta .hljs-string, .hljs-addition { color: var(--code-string); }
.hljs-code, .hljs-comment, .hljs-formula { color: var(--code-comment); }
.hljs-section, .hljs-strong { font-weight: 700; }
.hljs-emphasis { font-style: italic; }
.hljs-link { text-decoration: underline; }
.markup .mention {
  border-radius: 3px;
  padding: 0 2px;
  font-weight: 500;
  unicode-bidi: plaintext;
  background: var(--mention-bg);
  color: var(--mention-fg);
  cursor: pointer;
}
.markup .mention:hover { background: var(--brand); color: var(--white); }
.mention-icon { display: inline-block; width: 1em; height: 1em; margin-inline-end: 4px; margin-bottom: 0.2rem; vertical-align: middle; }
.markup .timestamp { background: var(--mod-normal); border-radius: 3px; padding: 0 2px; }
.markup .spoiler {
  border-radius: 4px;
  background: var(--spoiler-hidden);
  color: transparent;
  cursor: pointer;
  transition: background-color 0.2s ease;
}
.markup .spoiler:hover { background: var(--spoiler-hidden-hover); }
.markup .spoiler .spoiler-content { opacity: 0; }
.markup .spoiler.revealed { background: var(--mod-subtle); color: inherit; cursor: auto; }
.markup .spoiler.revealed .spoiler-content { opacity: 1; }
.emoji {
  display: inline-block;
  width: 1.375em;
  height: 1.375em;
  object-fit: contain;
  vertical-align: bottom;
}
.emoji.jumbo { width: 3rem; height: 3rem; min-height: 3rem; }

.message-accessories {
  display: grid;
  grid-auto-flow: row;
  grid-row-gap: 0.25rem;
  grid-template-columns: repeat(auto-fill, minmax(100%, 1fr));
  padding-block: 0.125rem;
  position: relative;
}

.components { display: flex; flex-direction: column; row-gap: 6px; width: 100%; }
.components.is-v2 { align-items: stretch; max-width: min(600px, 100%); row-gap: 8px; width: fit-content; }

.cv2-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-high);
  overflow: hidden;
}
.cv2-container.has-accent { position: relative; }
.cv2-container.has-accent::before {
  content: '';
  position: absolute;
  top: 0;
  inset-inline-start: 0;
  width: 4px;
  height: 100%;
  background-color: var(--accent-color);
}
.cv2-container.spoiler-container > * { filter: blur(44px); pointer-events: none; }

.cv2-text { overflow-wrap: anywhere; }
.cv2-text > h1:first-child, .cv2-text > h2:first-child, .cv2-text > h3:first-child { margin-top: 0; }
.cv2-text > h1:last-child, .cv2-text > h2:last-child, .cv2-text > h3:last-child { margin-bottom: 0; }
.cv2-text blockquote, .cv2-text pre.codeblock { max-width: unset; }
.cv2-text.reduced { font-size: 0.875rem; line-height: calc(1.375rem * 0.875); }
.cv2-text.reduced .subtext { font-size: 0.75rem; line-height: calc(1.375rem * 0.75); }

.cv2-section { display: flex; gap: 12px; justify-content: space-between; }
.cv2-section-content { display: flex; flex: 1; flex-direction: column; row-gap: 4px; min-width: 0; }
.cv2-section.center .cv2-section-content { justify-content: center; }
.cv2-section-accessory { display: flex; align-items: flex-start; min-width: 0; }
.cv2-section-accessory:empty { display: none; }
.cv2-thumbnail { width: 85px; height: 85px; max-width: 85px; max-height: 85px; border-radius: 8px; overflow: hidden; }
.cv2-thumbnail img, .cv2-thumbnail video { width: 100%; height: 100%; object-fit: cover; }

.cv2-separator.divider { border-bottom: 1px solid var(--mod-strong); }
.cv2-separator.spacing-large { margin: 8px 0; }

.cv2-gallery { display: flex; flex-direction: column; gap: 4px; width: 100%; max-width: 600px; border-radius: 8px; overflow: hidden; }
.cv2-gallery-item { position: relative; min-width: 0; min-height: 0; overflow: hidden; border-radius: 2px; background: var(--mod-subtle); }
.cv2-gallery-item img, .cv2-gallery-item video { width: 100%; height: 100%; object-fit: cover; }
.cv2-gallery.count-1 { width: fit-content; max-width: 100%; }
.cv2-gallery.count-1 .cv2-gallery-item { border-radius: 8px; background: none; }
.cv2-gallery.count-1 .cv2-gallery-item img, .cv2-gallery.count-1 .cv2-gallery-item video { width: auto; height: auto; max-width: 100%; max-height: 350px; object-fit: contain; }
.gallery-row { display: flex; gap: 4px; }
.gallery-row > .cv2-gallery-item { flex: 1; }
.gallery-row.one > .cv2-gallery-item { height: 280px; }
.gallery-row.two > .cv2-gallery-item { aspect-ratio: 1; max-height: 280px; }
.gallery-row.three { height: 350px; }
.gallery-row.three > .cv2-gallery-item { flex: 2; }
.gallery-column { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.gallery-column > .cv2-gallery-item { flex: 1; }
.gallery-grid.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 4px; height: 350px; }
.gallery-grid.three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.gallery-grid.three > .cv2-gallery-item { aspect-ratio: 1 / 1; }

.cv2-file {
  display: flex;
  align-items: center;
  width: 432px;
  max-width: 100%;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-high);
  box-shadow: var(--shadow-low);
}
.cv2-file-icon { flex: 0 0 auto; width: 30px; height: 40px; margin-inline-end: 8px; }
.cv2-file-meta { display: flex; flex-direction: column; min-width: 0; }
.cv2-file-name { color: var(--text-link); font-size: 1rem; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv2-file-name:hover { text-decoration: underline; }
.cv2-file-size { color: var(--text-muted); font-size: 12px; line-height: 1.3333; }

.cv2-action-row { display: flex; flex-wrap: wrap; gap: 8px; }
.cv2-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: auto;
  height: 32px;
  min-height: 32px;
  min-width: 60px;
  padding: 3px 11px;
  border: 1px solid var(--filled-border);
  border-radius: 8px;
  background: var(--brand);
  color: var(--white);
  font-family: var(--font-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 18px;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  transition: background-color 170ms ease, color 170ms ease;
}
.cv2-button-emoji { display: flex; margin-inline-end: 4px; }
.cv2-button-emoji:last-child { margin-inline-end: 0; }
.cv2-button-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 1; }
.cv2-button-link-icon { margin-inline-start: 8px; flex-shrink: 0; }
.cv2-button.style-primary:hover, .cv2-button.style-premium:hover { background: var(--brand-hover); }
.cv2-button.style-secondary, .cv2-button.style-link {
  background: var(--secondary-bg);
  border-color: var(--border-muted);
  color: var(--secondary-text);
}
.cv2-button.style-secondary:hover, .cv2-button.style-link:hover { background: var(--secondary-bg-hover); }
.cv2-button.style-success { background: var(--success); }
.cv2-button.style-success:hover { background: var(--success-hover); }
.cv2-button.style-danger { background: var(--danger); }
.cv2-button.style-danger:hover { background: var(--danger-hover); }
.cv2-button[disabled], .cv2-button.disabled { opacity: 0.5; cursor: not-allowed; }

.cv2-select {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: center;
  width: 400px;
  max-width: 100%;
  min-height: 40px;
  padding: 8px 8px 8px 12px;
  border: 1px solid var(--input-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-default);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
}
.cv2-select-placeholder { color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv2-select-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv2-select-chevron { color: var(--text-default); }
.cv2-select.disabled { opacity: 0.5; cursor: not-allowed; }

.media-spoiler { position: relative; width: 100%; height: 100%; cursor: pointer; overflow: hidden; background: var(--spoiler-hidden); }
.media-spoiler img, .media-spoiler video { filter: blur(44px); pointer-events: none; }
.media-spoiler-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 8px 12px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.6);
  color: #e4e4e6;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
.media-spoiler:hover .media-spoiler-label { background: rgba(0, 0, 0, 0.88); color: var(--white); }
.media-spoiler.revealed { background: none; }
.media-spoiler.revealed img, .media-spoiler.revealed video { filter: none; }
.media-spoiler.revealed .media-spoiler-label { display: none; }

.embed {
  display: grid;
  max-width: max-content;
  border-radius: 4px;
  background: var(--surface-high);
  border: 1px solid var(--border-subtle);
  border-inline-start: 4px solid var(--embed-color, var(--border-normal));
}
.embed-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) min-content;
  max-width: 516px;
  padding: 0.5rem 1rem 1rem 0.75rem;
}
.embed-grid > * { grid-column: 1; min-width: 0; }
.embed-grid > * + * { margin-top: 8px; }
.embed-author { font-size: 0.875rem; font-weight: 600; color: var(--text-strong); }
.embed-title { font-size: 1rem; font-weight: 600; color: var(--text-strong); }
.embed-description, .embed-field-value { font-size: 14px; line-height: 18px; white-space: pre-line; }
.embed-fields { display: grid; grid-template-columns: repeat(12, 1fr); gap: 8px; }
.embed-field { grid-column: 1 / 13; font-size: 14px; line-height: 18px; }
.embed-field.inline { grid-column: span 4; }
.embed-field-name { font-weight: 600; color: var(--text-strong); margin-bottom: 2px; }
.embed-image { margin-top: 16px; }
.embed-image img { max-width: 400px; border-radius: 4px; }
.embed-thumbnail { grid-column: 2; grid-row: 1 / 8; margin-inline-start: 16px; margin-top: 8px; }
.embed-thumbnail img { width: 80px; height: 80px; object-fit: contain; border-radius: 4px; }
.embed-footer { font-size: 12px; font-weight: 500; color: var(--text-muted); }
.embed .emoji { width: 18px; height: 18px; }

.reactions { display: flex; flex-wrap: wrap; align-items: center; padding-top: 0.125rem; padding-bottom: 0.375rem; margin-bottom: -0.5rem; }
.reaction {
  display: flex;
  align-items: center;
  margin: 0 0.25rem 0.25rem 0;
  padding: 0.125rem 0.375rem;
  border: 1px solid transparent;
  border-radius: 0.5rem;
  background: var(--mod-subtle);
  cursor: pointer;
}
.reaction .emoji { width: 1.25rem; height: 1.25rem; margin: 0.125rem 0; }
.reaction-count { margin-inline-start: 0.375rem; font-size: 0.875rem; font-weight: 600; color: var(--text-subtle); }
.reaction.reacted { background: var(--reaction-reacted-bg); border-color: var(--brand); }
.reaction.reacted .reaction-count { color: var(--reaction-reacted-text); }

.composer { flex: 0 0 auto; padding: 0 16px 24px; }
.composer-box {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 0 16px;
  border-radius: 8px;
  background: var(--input-bg);
  border: 1px solid var(--border-subtle);
}
.composer-placeholder { color: var(--text-muted); font-size: 1rem; }
`

export const PREVIEW_SCRIPT = `
document.addEventListener('click', (event) => {
  const spoiler = event.target.closest('.spoiler, .media-spoiler')
  if (spoiler) spoiler.classList.add('revealed')
})
const picker = document.getElementById('theme')
const applyTheme = (theme) => {
  document.documentElement.className = 'theme-' + theme
  if (picker) picker.value = theme
}
try {
  const saved = localStorage.getItem('roka-preview-theme')
  if (saved) applyTheme(saved)
} catch {}
if (picker) {
  picker.value = document.documentElement.className.replace('theme-', '')
  picker.addEventListener('change', () => {
    applyTheme(picker.value)
    try { localStorage.setItem('roka-preview-theme', picker.value) } catch {}
  })
}
window.addEventListener('DOMContentLoaded', () => {
  if (!window.hljs) return
  for (const block of document.querySelectorAll('pre.codeblock code[data-lang]')) {
    const language = block.dataset.lang
    if (window.hljs.getLanguage(language)) {
      block.innerHTML = window.hljs.highlight(block.textContent, { language }).value
    }
  }
})
const log = document.querySelector('.messages')
if (log) log.scrollTop = log.scrollHeight
`
