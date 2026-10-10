// Measurements follow the Discord desktop client's cozy message layout and its Components V2 renderer.
export const PREVIEW_STYLES = `
:root {
  --font-primary: 'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  --font-code: 'gg mono', 'Source Code Pro', Consolas, 'Andale Mono WT', 'Andale Mono', 'Lucida Console', Monaco, 'Courier New', Courier, monospace;
  --brand: #5865f2;
  --brand-hover: #4752c4;
  --white: #ffffff;
  --radius-xs: 3px;
  --radius-sm: 4px;
  --radius-md: 8px;
}

.theme-dark {
  color-scheme: dark;
  --bg-chat: #1a1a1e;
  --bg-header: #1a1a1e;
  --bg-composer: #222327;
  --bg-hover: rgba(78, 80, 88, 0.15);
  --bg-container: #242429;
  --bg-mod-subtle: rgba(78, 80, 88, 0.3);
  --bg-mod-strong: rgba(78, 80, 88, 0.48);
  --bg-code: #202024;
  --bg-code-inline: #2b2c31;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-normal: rgba(255, 255, 255, 0.12);
  --border-strong: rgba(255, 255, 255, 0.2);
  --text-strong: #fbfbfb;
  --text-default: #dfe0e2;
  --text-muted: #94959c;
  --text-link: #7aa6ff;
  --interactive-normal: #b5b6be;
  --mention-bg: rgba(88, 101, 242, 0.3);
  --mention-text: #c9cdfb;
  --spoiler-hidden: #2c2d32;
  --spoiler-revealed: rgba(255, 255, 255, 0.1);
  --blockquote-bar: #4e5058;
  --button-secondary: #2f3036;
  --button-secondary-hover: #383940;
  --select-bg: #1e1e22;
  --header-shadow: 0 1px 0 rgba(255, 255, 255, 0.06);
}

.theme-ash {
  color-scheme: dark;
  --bg-chat: #323339;
  --bg-header: #323339;
  --bg-composer: #3c3d44;
  --bg-hover: rgba(0, 0, 0, 0.06);
  --bg-container: #393a41;
  --bg-mod-subtle: rgba(151, 151, 159, 0.12);
  --bg-mod-strong: rgba(151, 151, 159, 0.24);
  --bg-code: #2b2c31;
  --bg-code-inline: #3c3d44;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-normal: rgba(255, 255, 255, 0.12);
  --border-strong: rgba(255, 255, 255, 0.2);
  --text-strong: #fbfbfb;
  --text-default: #dfe0e2;
  --text-muted: #a3a4aa;
  --text-link: #7aa6ff;
  --interactive-normal: #c0c1c7;
  --mention-bg: rgba(88, 101, 242, 0.3);
  --mention-text: #c9cdfb;
  --spoiler-hidden: #26272c;
  --spoiler-revealed: rgba(255, 255, 255, 0.1);
  --blockquote-bar: #5d5f68;
  --button-secondary: #43444b;
  --button-secondary-hover: #4c4d55;
  --select-bg: #2b2c31;
  --header-shadow: 0 1px 0 rgba(0, 0, 0, 0.2);
}

.theme-onyx {
  color-scheme: dark;
  --bg-chat: #070709;
  --bg-header: #070709;
  --bg-composer: #121214;
  --bg-hover: rgba(78, 80, 88, 0.12);
  --bg-container: #121214;
  --bg-mod-subtle: rgba(78, 80, 88, 0.24);
  --bg-mod-strong: rgba(78, 80, 88, 0.4);
  --bg-code: #0f0f11;
  --bg-code-inline: #1c1c20;
  --border-subtle: rgba(255, 255, 255, 0.07);
  --border-normal: rgba(255, 255, 255, 0.1);
  --border-strong: rgba(255, 255, 255, 0.18);
  --text-strong: #fbfbfb;
  --text-default: #dfe0e2;
  --text-muted: #8a8b92;
  --text-link: #7aa6ff;
  --interactive-normal: #a9aab1;
  --mention-bg: rgba(88, 101, 242, 0.3);
  --mention-text: #c9cdfb;
  --spoiler-hidden: #1c1c20;
  --spoiler-revealed: rgba(255, 255, 255, 0.1);
  --blockquote-bar: #4e5058;
  --button-secondary: #222226;
  --button-secondary-hover: #2b2b30;
  --select-bg: #0f0f11;
  --header-shadow: 0 1px 0 rgba(255, 255, 255, 0.05);
}

.theme-light {
  color-scheme: light;
  --bg-chat: #fbfbfb;
  --bg-header: #fbfbfb;
  --bg-composer: #ffffff;
  --bg-hover: rgba(0, 0, 0, 0.03);
  --bg-container: #f3f3f4;
  --bg-mod-subtle: rgba(151, 151, 159, 0.12);
  --bg-mod-strong: rgba(151, 151, 159, 0.24);
  --bg-code: #f3f3f4;
  --bg-code-inline: #e8e8ea;
  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-normal: rgba(0, 0, 0, 0.12);
  --border-strong: rgba(0, 0, 0, 0.2);
  --text-strong: #070709;
  --text-default: #2e2f34;
  --text-muted: #5c5e66;
  --text-link: #2e5bc7;
  --interactive-normal: #4f5058;
  --mention-bg: rgba(88, 101, 242, 0.15);
  --mention-text: #4752c4;
  --spoiler-hidden: #d3d4d8;
  --spoiler-revealed: rgba(0, 0, 0, 0.06);
  --blockquote-bar: #c4c5ca;
  --button-secondary: #e3e3e6;
  --button-secondary-hover: #d7d7db;
  --select-bg: #ffffff;
  --header-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
}

* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg-chat);
  color: var(--text-default);
  font-family: var(--font-primary);
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
img { display: block; }

.app { height: 100%; display: flex; justify-content: center; }
.chat { width: 100%; height: 100%; display: flex; flex-direction: column; background: var(--bg-chat); }

.channel-header {
  flex: 0 0 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--bg-header);
  box-shadow: var(--header-shadow);
  position: relative;
  z-index: 1;
}
.channel-icon { color: var(--text-muted); flex: 0 0 auto; }
.channel-name { margin: 0; font-size: 16px; line-height: 20px; font-weight: 600; color: var(--text-strong); }
.toolbar { margin-left: auto; }
.theme-picker { font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
.theme-picker select {
  font: inherit;
  color: var(--text-default);
  background: var(--bg-mod-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}

.messages { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; }
.message-list { list-style: none; margin: 0; padding: 0; }
.list-spacer { height: 30px; }

.message {
  position: relative;
  min-height: 2.75rem;
  padding: 0.125rem 48px 0.125rem 72px;
  overflow-wrap: break-word;
  user-select: text;
}
.message:hover { background: var(--bg-hover); }
.message.group-start { margin-top: 1.0625rem; }
.message-list > .message-item:first-child .message.group-start { margin-top: 16px; }
.message:not(.group-start) { min-height: 0; }

.avatar {
  position: absolute;
  left: 16px;
  margin-top: calc(4px - 0.125rem);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
}
.reply-context + .avatar { top: calc(0.125rem + 22px); }

.message-header {
  margin: 0;
  display: block;
  font-size: 1rem;
  line-height: 1.375rem;
  font-weight: 400;
  min-height: 1.375rem;
  color: var(--text-muted);
  white-space: break-spaces;
}
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
  position: relative;
  top: -0.1rem;
  height: 0.9375rem;
  margin-left: 0.25rem;
  padding: 0 0.275rem;
  border-radius: 0.1875rem;
  background: var(--brand);
  color: var(--white);
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 0.9375rem;
  text-transform: uppercase;
  vertical-align: middle;
}
.bot-tag-text { position: relative; }
.message-timestamp {
  margin-left: 0.25rem;
  font-size: 0.75rem;
  line-height: 1.375rem;
  font-weight: 500;
  color: var(--text-muted);
  vertical-align: baseline;
  display: inline-block;
  height: 1.25rem;
  cursor: default;
}
.message-gutter-time {
  position: absolute;
  left: 0;
  width: 56px;
  text-align: right;
  font-size: 0.6875rem;
  line-height: 1.375rem;
  color: var(--text-muted);
  visibility: hidden;
  pointer-events: none;
}
.message:hover .message-gutter-time { visibility: visible; }

.reply-context {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  height: 18px;
  font-size: 0.875rem;
  line-height: 1.125rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.reply-context::before {
  content: '';
  position: absolute;
  left: -36px;
  top: 8px;
  width: 33px;
  height: 12px;
  border-left: 2px solid var(--border-strong);
  border-top: 2px solid var(--border-strong);
  border-top-left-radius: 6px;
}
.reply-avatar { width: 16px; height: 16px; border-radius: 50%; flex: 0 0 auto; }
.reply-username { font-weight: 500; color: var(--text-strong); opacity: 0.64; flex: 0 0 auto; }
.reply-text { overflow: hidden; text-overflow: ellipsis; color: var(--text-muted); min-width: 0; }
.reply-text.markup { font-size: inherit; line-height: inherit; white-space: nowrap; color: var(--text-muted); }
.reply-text .emoji { width: 1rem; height: 1rem; }
.interaction-used { color: var(--text-muted); }
.command-name { color: var(--text-link); font-weight: 500; }

.markup {
  font-size: 1rem;
  line-height: 1.375rem;
  color: var(--text-default);
  white-space: break-spaces;
  overflow-wrap: break-word;
  user-select: text;
}
.message-content { margin-left: 0; padding-left: 0; text-indent: 0; }
.markup strong { font-weight: 700; }
.markup a.link, .markup .link { color: var(--text-link); text-decoration: none; word-break: break-word; }
.markup a.link:hover { text-decoration: underline; }
.markup h1, .markup h2, .markup h3 {
  margin: 16px 0 8px;
  font-weight: 700;
  line-height: 1.375em;
  color: var(--text-strong);
  overflow-wrap: break-word;
}
.markup h1 { font-size: 1.5rem; }
.markup h2 { font-size: 1.25rem; }
.markup h3 { font-size: 1rem; }
.markup > h1:first-child, .markup > h2:first-child, .markup > h3:first-child { margin-top: 8px; }
.markup .subtext {
  display: block;
  font-size: 0.8125rem;
  line-height: 1.11719rem;
  color: var(--text-muted);
}
.markup .subtext .link { color: var(--text-link); }
.markup blockquote {
  display: flex;
  margin: 0;
  padding: 0 8px 0 12px;
  position: relative;
  max-width: 90%;
  text-indent: 0;
}
.markup blockquote::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 4px;
  background: var(--blockquote-bar);
}
.markup blockquote { display: block; }
.markup ul, .markup ol {
  margin: 4px 0 0 16px;
  padding: 0;
  list-style-position: outside;
  white-space: normal;
}
.markup ul { list-style-type: disc; }
.markup ul ul { list-style-type: circle; }
.markup ol { list-style-type: decimal; }
.markup li { margin-bottom: 4px; white-space: break-spaces; }
.markup li::marker { color: var(--text-default); }
.markup ul + *, .markup ol + * { margin-top: 0; }
.markup code.inline {
  font-family: var(--font-code);
  font-size: 0.875em;
  line-height: 1.125rem;
  padding: 0 0.2em;
  margin: -0.2em 0;
  border-radius: var(--radius-sm);
  background: var(--bg-code-inline);
  border: 1px solid var(--border-subtle);
  white-space: pre-wrap;
  text-indent: 0;
}
.markup pre.codeblock {
  margin: 6px 0 0;
  max-width: 90%;
  font-family: var(--font-code);
  white-space: pre-wrap;
}
.markup pre.codeblock code {
  display: block;
  padding: 0.5em;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--bg-code);
  color: var(--text-default);
  font-size: 0.875rem;
  line-height: 1.125rem;
  overflow-x: auto;
  white-space: pre-wrap;
  text-indent: 0;
}
.markup .mention {
  border-radius: var(--radius-xs);
  padding: 0 2px;
  font-weight: 500;
  unicode-bidi: plaintext;
  background: var(--mention-bg);
  color: var(--mention-text);
  cursor: pointer;
}
.markup .mention:hover { background: var(--brand); color: var(--white); }
.markup .timestamp {
  background: var(--bg-mod-subtle);
  border-radius: var(--radius-xs);
  padding: 0 2px;
}
.markup .spoiler {
  border-radius: var(--radius-xs);
  padding: 0 2px;
  background: var(--spoiler-hidden);
  cursor: pointer;
}
.markup .spoiler .spoiler-content { opacity: 0; }
.markup .spoiler:hover { background: color-mix(in srgb, var(--spoiler-hidden) 85%, var(--text-default)); }
.markup .spoiler.revealed { background: var(--spoiler-revealed); cursor: auto; }
.markup .spoiler.revealed .spoiler-content { opacity: 1; }
.emoji {
  display: inline-block;
  width: 1.375em;
  height: 1.375em;
  vertical-align: bottom;
  object-fit: contain;
  margin: 0 0.05em 0 0.1em;
}
.emoji.jumbo { width: 3rem; height: 3rem; min-height: 3rem; margin-bottom: 0; vertical-align: bottom; }
h1 .emoji, h2 .emoji, h3 .emoji { width: 1.375em; height: 1.375em; }
.subtext .emoji { width: 1.25em; height: 1.25em; }

.message-accessories {
  display: grid;
  grid-auto-flow: row;
  grid-row-gap: 0.25rem;
  padding: 0.125rem 0;
  text-indent: 0;
  min-height: 0;
  min-width: 0;
}

.cv2-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 600px;
  padding: 16px;
  border-radius: var(--radius-md);
  background: var(--bg-container);
  border: 1px solid var(--border-subtle);
  position: relative;
  overflow: hidden;
}
.cv2-container.has-accent { border-left: none; padding-left: 20px; }
.cv2-container.has-accent::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--accent-color);
}
.cv2-section { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
.cv2-section-content { display: flex; flex-direction: column; gap: 8px; flex: 1 1 auto; min-width: 0; }
.cv2-section-accessory { flex: 0 0 auto; display: flex; align-items: flex-start; }
.cv2-section-accessory:empty { display: none; }
.cv2-thumbnail { width: 85px; height: 85px; border-radius: var(--radius-md); overflow: hidden; }
.cv2-thumbnail img, .cv2-thumbnail video { width: 100%; height: 100%; object-fit: cover; }
.cv2-text { min-width: 0; }
.cv2-separator { flex: 0 0 auto; margin: 0; }
.cv2-separator.spacing-small { margin: 0; height: 0; }
.cv2-separator.spacing-large { margin: 8px 0; height: 0; }
.cv2-separator.divider { border-top: 1px solid var(--border-subtle); }

.cv2-gallery { display: grid; gap: 4px; border-radius: var(--radius-md); overflow: hidden; max-width: 568px; }
.cv2-gallery-item { position: relative; min-height: 0; overflow: hidden; background: var(--bg-mod-subtle); }
.cv2-gallery-item img, .cv2-gallery-item video { width: 100%; height: 100%; object-fit: cover; }
.cv2-gallery.count-1 { grid-template-columns: 1fr; }
.cv2-gallery.count-1 .cv2-gallery-item img { height: auto; max-height: 350px; object-fit: contain; }
.cv2-gallery.count-2 { grid-template-columns: 1fr 1fr; grid-auto-rows: 280px; }
.cv2-gallery.count-3 { grid-template-columns: 2fr 1fr; grid-template-rows: 172px 172px; }
.cv2-gallery.count-3 .cv2-gallery-item:first-child { grid-row: span 2; }
.cv2-gallery.count-4 { grid-template-columns: 1fr 1fr; grid-auto-rows: 172px; }
.cv2-gallery.count-5 { grid-template-columns: repeat(6, 1fr); grid-auto-rows: 172px; }
.cv2-gallery.count-5 .cv2-gallery-item:nth-child(-n + 2) { grid-column: span 3; }
.cv2-gallery.count-5 .cv2-gallery-item:nth-child(n + 3) { grid-column: span 2; }
.cv2-gallery.count-6 { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 172px; }
.cv2-gallery.count-7 { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 172px; }
.cv2-gallery.count-7 .cv2-gallery-item:first-child { grid-column: span 3; height: 280px; }
.cv2-gallery.count-8 { grid-template-columns: repeat(6, 1fr); grid-auto-rows: 172px; }
.cv2-gallery.count-8 .cv2-gallery-item:nth-child(-n + 2) { grid-column: span 3; }
.cv2-gallery.count-8 .cv2-gallery-item:nth-child(n + 3) { grid-column: span 2; }
.cv2-gallery.count-9 { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 172px; }
.cv2-gallery.count-10 { grid-template-columns: repeat(3, 1fr); grid-auto-rows: 172px; }
.cv2-gallery.count-10 .cv2-gallery-item:first-child { grid-column: span 3; height: 280px; }

.cv2-file {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 432px;
  padding: 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  background: var(--bg-mod-subtle);
}
.cv2-file-meta { display: flex; flex-direction: column; min-width: 0; }
.cv2-file-name { color: var(--text-link); font-size: 1rem; line-height: 1.375rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cv2-file-size { color: var(--text-muted); font-size: 0.75rem; line-height: 1rem; }

.cv2-action-row { display: flex; flex-wrap: wrap; gap: 8px; }
.cv2-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 60px;
  height: 32px;
  min-height: 32px;
  padding: 2px 16px;
  border: none;
  border-radius: var(--radius-md);
  font-family: var(--font-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 16px;
  color: var(--white);
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background-color 0.17s ease, color 0.17s ease;
}
.cv2-button .emoji { width: 1.375em; height: 1.375em; margin: 0; }
.cv2-button-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cv2-button.style-primary { background: var(--brand); }
.cv2-button.style-primary:hover { background: var(--brand-hover); }
.cv2-button.style-secondary, .cv2-button.style-link { background: var(--button-secondary); color: var(--text-default); }
.cv2-button.style-secondary:hover, .cv2-button.style-link:hover { background: var(--button-secondary-hover); }
.cv2-button.style-success { background: #00863a; }
.cv2-button.style-success:hover { background: #047835; }
.cv2-button.style-danger { background: #d22d39; }
.cv2-button.style-danger:hover { background: #b42831; }
.cv2-button.style-premium { background: linear-gradient(90deg, #8547c6, #b845c1 50%, #ab5d8a); }
.cv2-button[disabled], .cv2-button.disabled { opacity: 0.5; cursor: not-allowed; }
.cv2-button-link-icon { margin-left: 4px; flex: 0 0 auto; }

.cv2-select {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 400px;
  min-height: 40px;
  padding: 8px 8px 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-normal);
  background: var(--select-bg);
  color: var(--text-default);
  font-size: 1rem;
  cursor: pointer;
}
.cv2-select-placeholder { color: var(--text-muted); }
.cv2-select-chevron { color: var(--interactive-normal); flex: 0 0 auto; }
.cv2-select.disabled { opacity: 0.5; cursor: not-allowed; }

.media-spoiler { position: relative; width: 100%; height: 100%; cursor: pointer; overflow: hidden; }
.media-spoiler img, .media-spoiler video { filter: blur(44px); transform: scale(1.1); }
.media-spoiler-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 8px 12px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.6);
  color: var(--white);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.05em;
}
.media-spoiler.revealed img, .media-spoiler.revealed video { filter: none; transform: none; }
.media-spoiler.revealed .media-spoiler-label { display: none; }

.embed {
  max-width: 516px;
  border-radius: var(--radius-sm);
  border-left: 4px solid var(--embed-color, var(--border-strong));
  background: var(--bg-container);
  border-top: 1px solid var(--border-subtle);
  border-right: 1px solid var(--border-subtle);
  border-bottom: 1px solid var(--border-subtle);
}
.embed-grid {
  display: grid;
  grid-template-columns: auto min-content;
  padding: 0.5rem 1rem 1rem 0.75rem;
  gap: 0;
}
.embed-grid > * { grid-column: 1; margin-top: 8px; min-width: 0; }
.embed-author { font-size: 0.875rem; font-weight: 600; color: var(--text-strong); }
.embed-title { font-size: 1rem; font-weight: 600; color: var(--text-strong); }
.embed-description { font-size: 0.875rem; line-height: 1.125rem; }
.embed-fields { display: grid; grid-template-columns: repeat(12, 1fr); gap: 8px; }
.embed-field { grid-column: 1 / 13; font-size: 0.875rem; line-height: 1.125rem; }
.embed-field.inline { grid-column: span 4; }
.embed-field-name { font-weight: 600; color: var(--text-strong); margin-bottom: 2px; }
.embed-image img { max-width: 400px; border-radius: var(--radius-sm); }
.embed-thumbnail { grid-column: 2; grid-row: 1 / 8; margin-left: 16px; }
.embed-thumbnail img { width: 80px; height: 80px; object-fit: contain; border-radius: var(--radius-sm); }
.embed-footer { font-size: 0.75rem; line-height: 1rem; color: var(--text-muted); font-weight: 500; }

.reactions { display: flex; flex-wrap: wrap; gap: 4px; padding-top: 0.125rem; }
.reaction {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 1.5rem;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-md);
  background: var(--bg-mod-subtle);
  border: 1px solid transparent;
  cursor: pointer;
}
.reaction .emoji { width: 1rem; height: 1rem; margin: 0; }
.reaction-count { font-size: 0.875rem; font-weight: 600; color: var(--interactive-normal); min-width: 9px; text-align: center; }
.reaction.reacted { background: var(--mention-bg); border-color: var(--brand); }
.reaction.reacted .reaction-count { color: var(--mention-text); }

.composer { flex: 0 0 auto; padding: 0 16px 24px; }
.composer-box {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border-radius: var(--radius-md);
  background: var(--bg-composer);
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
if (picker) {
  picker.value = [...document.documentElement.classList].find((c) => c.startsWith('theme-')).slice(6)
  picker.addEventListener('change', () => {
    document.documentElement.className = 'theme-' + picker.value
  })
}
const log = document.querySelector('.messages')
if (log) log.scrollTop = log.scrollHeight
`
