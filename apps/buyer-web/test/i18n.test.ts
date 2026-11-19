import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { CATALOG_CATEGORIES, catalogItems } from '@sthiva/web-core';
import { DICTIONARIES } from '../lib/i18n';

// Every English text the code passes to t('...') must have a Kannada and a Hindi translation, and a
// translation must keep the same {placeholders}. Otherwise part of a page quietly stays in English.

const ROOT = join(__dirname, '..');
const BS = String.fromCharCode(92);
// t('...') translates; tx('...') marks text kept in a list that is translated later
const T_CALL = new RegExp(`\\btx?\\(\\s*(?:'((?:[^'${BS}${BS}]|${BS}${BS}.)*)'|"((?:[^"${BS}${BS}]|${BS}${BS}.)*)")`, 'g');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name.startsWith('.') ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [p] : [];
  });
}

// PageHead and EmptyState translate the plain text passed to them (components/account/AccountUI.tsx)
const SHARED_TAG = /<(PageHead|EmptyState)\b[\s\S]*?\/?>/g;
const SHARED_PROP = /\b(eyebrow|title|accent|body)="([^"]+)"|\blabel: '([^']+)'/g;

function textsInCode(): Map<string, string> {
  const found = new Map<string, string>();
  const add = (text: string, f: string) => { if (!found.has(text)) found.set(text, f.slice(ROOT.length + 1)); };
  // The shared PIN box (packages/web-core) shows on this site too
  const shared = join(ROOT, '..', '..', 'packages', 'web-core', 'src', 'location');
  for (const f of [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'components')), ...sourceFiles(join(ROOT, 'lib')), ...sourceFiles(shared)]) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(T_CALL)) add((m[1] ?? m[2]).split(`${BS}'`).join("'"), f);
    for (const tag of src.matchAll(SHARED_TAG)) {
      const props: Record<string, string> = {};
      for (const p of tag[0].matchAll(SHARED_PROP)) props[p[1] ?? 'label'] = p[2] ?? p[3];
      // A title with an accent word is translated as one sentence (PageHead)
      if (props.title && props.accent) {
        add(`${props.title} ${props.accent}`, f);
        delete props.title;
        delete props.accent;
      }
      for (const v of Object.values(props)) add(v, f);
    }
  }
  return found;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  const texts = textsInCode();

  it('finds the translated texts in the code', () => {
    expect(texts.size).toBeGreaterThan(80);
  });

  for (const lang of ['kn', 'hi'] as const) {
    it(`every text in the code has a ${lang === 'kn' ? 'Kannada' : 'Hindi'} translation`, () => {
      const missing = [...texts].filter(([text]) => !DICTIONARIES[lang][text]).map(([text, file]) => `${file}: ${text}`);
      expect(missing).toEqual([]);
    });

    it(`${lang} translations keep the same {placeholders}`, () => {
      const wrong = Object.entries(DICTIONARIES[lang])
        .filter(([en, tr]) => placeholders(en).join() !== placeholders(tr).join())
        .map(([en]) => en);
      expect(wrong).toEqual([]);
    });

    it(`${lang}: every material category, tagline, group, selling unit and size label is translated`, () => {
      const missing = CATALOG_CATEGORIES.flatMap((c) => [
        c.name, c.tagline, ...(c.groups ?? []),
        ...catalogItems(c.slug).flatMap((i) => [...i.soldAs.map((s) => s.label), ...i.variants.map((v) => v.label)]),
      ])
        .filter((text): text is string => !!text && !DICTIONARIES[lang][text]);
      expect(missing).toEqual([]);
    });
  }
});
