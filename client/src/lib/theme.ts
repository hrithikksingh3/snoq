export type Theme='light'|'dark'|'system';
const key='snoq:theme';
export function applyTheme(theme:Theme) { const dark=theme==='dark'||(theme==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',dark);localStorage.setItem(key,theme); }
export function currentTheme():Theme { const saved=localStorage.getItem(key);return saved==='light'||saved==='dark'||saved==='system'?saved:'system'; }
