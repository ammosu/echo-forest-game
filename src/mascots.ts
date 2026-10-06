import characters from '../assets/characters.json';
import { tr } from './i18n';

// Mascots have a Chinese and an English name; look them up by id or English name (the race engine keys on the latter).
const find = (key: string) => characters.characters.find(c => c.id === key || c.name === key);
/** Name tag: "安寶 Anbo" in Chinese, "Anbo" in English. */
export const mascotLabel = (key: string) => { const c = find(key); return c ? tr(`${c.nameZh} ${c.name}`, c.name) : key; };
/** Name inside a sentence: "安寶" in Chinese, "Anbo" in English. */
export const mascotName = (key: string) => { const c = find(key); return c ? tr(c.nameZh, c.name) : key; };
/** Name tag for small picker buttons: Chinese on one line, English in smaller type below. */
export const mascotTag = (key: string) => { const c = find(key); return c ? tr(`${c.nameZh}<small class="mascot-en">${c.name}</small>`, c.name) : key; };
