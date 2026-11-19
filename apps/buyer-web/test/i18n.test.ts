import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { CATALOG_CATEGORIES } from '@sthiva/web-core';
import { DICTIONARIES } from '../lib/i18n';

// Every English text the code passes to t('...') must have a Kannada and a Hindi translation, and a
// translation must keep the same {placeholders}. Otherwise part of a page quietly stays in English.

const ROOT = join(__dirname, '..');
const BS = String.fromCharCode(92);
const T_CALL = new RegExp(`\\bt\\(\\s*(?:'((?:[^'${BS}${BS}]|${BS}${BS}.)*)'|"((?:[^"${BS}${BS}]|${BS}${BS}.)*)")`, 'g');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === 'node_modules' || name.startsWith('.') ? [] : sourceFiles(p);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [p] : [];
  });
}

function textsInCode(): Map<string, string> {
  const found = new Map<string, string>();
  for (const f of [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'components'))]) {
    for (const m of readFileSync(f, 'utf8').matchAll(T_CALL)) {
      const text = (m[1] ?? m[2]).split(`${BS}'`).join("'");
      if (!found.has(text)) found.set(text, f.slice(ROOT.length + 1));
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

    it(`${lang}: every material category, tagline and group is translated`, () => {
      const missing = CATALOG_CATEGORIES.flatMap((c) => [c.name, c.tagline, ...(c.groups ?? [])])
        .filter((text): text is string => !!text && !DICTIONARIES[lang][text]);
      expect(missing).toEqual([]);
    });
  }
});
