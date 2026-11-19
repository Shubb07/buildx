import { describe, it, expect } from 'vitest';
import { parseLang, translate } from '../src/i18n/core';

describe('languages', () => {
  const dicts = { kn: { 'Add to cart': 'ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿ', 'Get it by {date}': '{date} ರೊಳಗೆ ಪಡೆಯಿರಿ' } };

  it('reads only known language codes from the cookie', () => {
    expect(parseLang('kn')).toBe('kn');
    expect(parseLang('hi')).toBe('hi');
    expect(parseLang('fr')).toBeNull();
    expect(parseLang(undefined)).toBeNull();
  });

  it('translates, fills values, and falls back to English when a text is missing', () => {
    expect(translate(dicts, 'kn', 'Add to cart')).toBe('ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿ');
    expect(translate(dicts, 'kn', 'Get it by {date}', { date: 'Tue, 25 Nov' })).toBe('Tue, 25 Nov ರೊಳಗೆ ಪಡೆಯಿರಿ');
    expect(translate(dicts, 'kn', 'Not translated yet')).toBe('Not translated yet');
    expect(translate(dicts, 'hi', 'Add to cart')).toBe('Add to cart');
    expect(translate(dicts, 'en', 'Get it by {date}', { date: 'today' })).toBe('Get it by today');
  });
});
