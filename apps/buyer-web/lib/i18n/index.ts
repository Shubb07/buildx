import type { Dictionaries } from '@sthiva/web-core';
import { kn } from './kn';
import { hi } from './hi';

// Words for sthiva.com in Kannada and Hindi, keyed by the English text. The layout sends only the
// chosen language's list to the browser. lib/i18n/i18n.test.ts checks every t('...') text in the
// code has both translations.
export const DICTIONARIES: Required<Dictionaries> = { kn, hi };
