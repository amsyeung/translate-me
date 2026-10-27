/** Styles for the highlight popover. Lives inside a shadow root, so page CSS can't reach it and it can't leak out. */
export const POPOVER_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.tm {
  --bg: #ffffff;
  --fg: #1f1f1f;
  --muted: #71717a;
  --border: #e4e4e7;
  --hover: #f4f4f5;
  --accent: #2563eb;
  --warn: #b45309;
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", "PingFang HK", "Microsoft JhengHei", sans-serif;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .tm { --bg: #27272a; --fg: #f4f4f5; --muted: #a1a1aa; --border: #3f3f46; --hover: #3f3f46; --accent: #60a5fa; --warn: #fbbf24; }
}

.card {
  position: fixed;
  display: flex;
  flex-direction: column;
  min-width: 240px;
  width: max-content;
  max-width: min(440px, calc(100vw - 16px));
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.18), 0 2px 6px rgba(0,0,0,.08);
  pointer-events: auto;
  animation: tm-in .15s ease-out;
}
@keyframes tm-in { from { opacity: 0; transform: translateY(4px); } }
@media (prefers-reduced-motion: reduce) { .card { animation: none; } }

.head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 4px 10px;
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;
}
.head:active { cursor: grabbing; }
.head .arrow { color: var(--muted); font-size: 12px; }
.head .spacer { flex: 1; }

select {
  font: 12px/1.2 inherit;
  font-family: inherit;
  color: var(--muted);
  background: transparent;
  border: 0;
  outline: none;
  max-width: 150px;
  padding: 2px 0;
  cursor: pointer;
}
select:hover, select:focus-visible { color: var(--fg); }
option { color: #1f1f1f; background: #fff; }

.body {
  padding: 8px 12px 4px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
  font-size: 15px;
  user-select: text;
  cursor: text;
}
.body.dim { opacity: .55; }
.status { color: var(--muted); font-size: 13px; }
.status.warn { color: var(--warn); }
button.action { margin-top: 8px; padding: 0 10px; border: 1px solid var(--border); color: var(--accent); font-weight: 600; }
.bar { height: 3px; margin-top: 6px; border-radius: 2px; background: var(--border); overflow: hidden; }
.bar > i { display: block; height: 100%; background: var(--accent); width: 0; transition: width .2s; }

.foot {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px 6px 6px;
}
.foot .spacer { flex: 1; }
.foot .hint { color: var(--muted); font-size: 11px; padding-right: 4px; }

button {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 26px;
  height: 26px;
  padding: 0 5px;
  border-radius: 6px;
  color: var(--muted);
  font: 12px/1 inherit;
  font-family: inherit;
  cursor: pointer;
}
button:hover { background: var(--hover); color: var(--fg); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button[aria-pressed="true"] { color: var(--accent); }
button[disabled] { opacity: .35; pointer-events: none; }
svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

.icon-trigger {
  position: fixed;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 50%;
  background: var(--bg);
  color: var(--accent);
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0,0,0,.18);
  pointer-events: auto;
}
.icon-trigger:hover { background: var(--hover); }

.pill {
  position: fixed;
  right: 16px;
  bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 6px 6px 12px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 999px;
  box-shadow: 0 6px 20px rgba(0,0,0,.18);
  font-size: 13px;
  pointer-events: auto;
}
`

const svg = (path: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`

export const ICONS = {
  speaker: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  check: svg('<path d="m5 12 5 5 9-10"/>'),
  pin: svg('<path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v6"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  translate: svg('<path d="M4 5h9M8.5 3v2M6 5c1 3.5 3.5 6 6 7.5M11 5c-1 3.5-3.5 6.5-7 8"/><path d="m13 21 4-9 4 9M14.5 18h5"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/><path d="M15 20h5"/>'),
}

/** Extra styles for the writing tools card (on top of POPOVER_CSS). */
export const WRITER_CSS = `
.writer { min-width: 300px; max-width: min(480px, calc(100vw - 16px)); }
.tabs { display: flex; gap: 2px; flex-wrap: wrap; }
.tabs button { height: 24px; padding: 0 8px; font-size: 12px; border-radius: 999px; }
.tabs button[aria-selected="true"] { background: var(--accent); color: #fff; }
.diff ins { text-decoration: none; background: rgba(34,197,94,.22); border-radius: 3px; }
.diff del { color: var(--muted); text-decoration: line-through; text-decoration-color: rgba(239,68,68,.8); }
.note { color: var(--muted); font-size: 12px; margin-top: 6px; }
button.primary { background: var(--accent); color: #fff; padding: 0 12px; font-weight: 600; }
button.primary:hover { background: var(--accent); color: #fff; filter: brightness(1.08); }
`
