// Two languages, picked once per page load: ?lang= in the URL, then the saved choice, then the browser language.
export type Lang = 'zh' | 'en';
const key = 'echo-forest-lang';

function pick(): Lang {
  if (typeof location === 'undefined') return 'zh'; // Engine modules also load in Node-side tests.
  const query = new URLSearchParams(location.search).get('lang');
  if (query === 'zh' || query === 'en') {
    try { localStorage.setItem(key, query); } catch { /* Optional. */ }
    return query;
  }
  try { const saved = localStorage.getItem(key); if (saved === 'zh' || saved === 'en') return saved; } catch { /* Storage blocked. */ }
  return navigator.languages?.some(l => l.toLowerCase().startsWith('zh')) || !navigator.language ? 'zh' : 'en';
}

export const lang: Lang = pick();
export const isEn = lang === 'en';

// Inline pairs keep each string next to the code that shows it: tr('開始', 'Start').
export const tr = <T>(zh: T, en: T): T => isEn ? en : zh;

export function setLang(next: Lang) {
  try { localStorage.setItem(key, next); } catch { /* The URL below still carries it. */ }
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  if (next === 'en') url.searchParams.set('lang', 'en');
  location.replace(url);
}

// The static html carries the Chinese title and description; swap them once at startup.
export function localizeDocument(title: string, description?: string) {
  document.documentElement.lang = tr('zh-Hant', 'en');
  if (!isEn) return;
  document.title = title;
  if (description) document.querySelector('meta[name="description"]')?.setAttribute('content', description);
}
