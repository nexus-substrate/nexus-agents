/**
 * Tests for text-utils utilities
 *
 * @module utils/text-utils.test
 */

import { describe, it, expect } from 'vitest';
import {
  STOPWORDS,
  tokenize,
  tokenizeToSet,
  tokenizeFiltered,
  stringifyValue,
  capitalize,
  capitalizeWords,
  capitalizeKebab,
  truncateText,
  truncateWithInfo,
  truncateSentence,
  splitLines,
  splitNonEmptyLines,
  splitTrimmedLines,
  countSentences,
  splitSentences,
  countWords,
} from './text-utils.js';

describe('text-utils', () => {
  describe('STOPWORDS', () => {
    it('contains common stopwords', () => {
      expect(STOPWORDS.has('the')).toBe(true);
      expect(STOPWORDS.has('a')).toBe(true);
      expect(STOPWORDS.has('is')).toBe(true);
      expect(STOPWORDS.has('and')).toBe(true);
    });

    it('does not contain content words', () => {
      expect(STOPWORDS.has('algorithm')).toBe(false);
      expect(STOPWORDS.has('typescript')).toBe(false);
    });
  });

  describe('tokenize', () => {
    it('tokenizes simple text', () => {
      expect(tokenize('Hello World')).toEqual(['hello', 'world']);
    });

    it('converts to lowercase', () => {
      expect(tokenize('UPPERCASE TEXT')).toEqual(['uppercase', 'text']);
    });

    it('removes punctuation', () => {
      expect(tokenize('Hello, World!')).toEqual(['hello', 'world']);
    });

    it('filters by minimum length', () => {
      expect(tokenize('a b cd efg', 2)).toEqual(['cd', 'efg']);
      expect(tokenize('a b cd efg', 3)).toEqual(['efg']);
    });

    it('handles numbers', () => {
      expect(tokenize('item1 item2')).toEqual(['item1', 'item2']);
    });

    it('handles empty string', () => {
      expect(tokenize('')).toEqual([]);
    });

    it('handles multiple spaces', () => {
      expect(tokenize('word1   word2')).toEqual(['word1', 'word2']);
    });

    it('handles special characters', () => {
      expect(tokenize('hello@world.com')).toEqual(['hello', 'world', 'com']);
    });
  });

  describe('tokenizeToSet', () => {
    it('returns unique tokens as Set', () => {
      const result = tokenizeToSet('hello hello world');
      expect(result).toBeInstanceOf(Set);
      expect(result.has('hello')).toBe(true);
      expect(result.has('world')).toBe(true);
      expect(result.size).toBe(2);
    });

    it('respects minimum length', () => {
      const result = tokenizeToSet('a bb ccc', 3);
      expect(result.has('a')).toBe(false);
      expect(result.has('bb')).toBe(false);
      expect(result.has('ccc')).toBe(true);
    });
  });

  describe('tokenizeFiltered', () => {
    it('removes stopwords', () => {
      expect(tokenizeFiltered('the quick fox')).toEqual(['quick', 'fox']);
    });

    it('keeps content words', () => {
      expect(tokenizeFiltered('algorithm and typescript')).toEqual(['algorithm', 'typescript']);
    });

    it('respects minimum length', () => {
      expect(tokenizeFiltered('the a typescript', 3)).toEqual(['typescript']);
    });

    it('handles text with only stopwords', () => {
      expect(tokenizeFiltered('the and a is')).toEqual([]);
    });
  });

  describe('stringifyValue', () => {
    it('returns string as-is', () => {
      expect(stringifyValue('hello')).toBe('hello');
    });

    it('returns empty string for null', () => {
      expect(stringifyValue(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(stringifyValue(undefined)).toBe('');
    });

    it('stringifies numbers', () => {
      expect(stringifyValue(42)).toBe('42');
    });

    it('stringifies booleans', () => {
      expect(stringifyValue(true)).toBe('true');
    });

    it('stringifies objects as JSON', () => {
      expect(stringifyValue({ key: 'value' })).toBe('{"key":"value"}');
    });

    it('stringifies arrays as JSON', () => {
      expect(stringifyValue([1, 2, 3])).toBe('[1,2,3]');
    });
  });

  describe('capitalize', () => {
    it('capitalizes first character', () => {
      expect(capitalize('hello')).toBe('Hello');
    });

    it('handles empty string', () => {
      expect(capitalize('')).toBe('');
    });

    it('handles single character', () => {
      expect(capitalize('a')).toBe('A');
    });

    it('keeps rest of string unchanged', () => {
      expect(capitalize('hELLO')).toBe('HELLO');
    });

    it('handles already capitalized', () => {
      expect(capitalize('Hello')).toBe('Hello');
    });
  });

  describe('capitalizeWords', () => {
    it('capitalizes each word', () => {
      expect(capitalizeWords('hello world')).toBe('Hello World');
    });

    it('handles single word', () => {
      expect(capitalizeWords('hello')).toBe('Hello');
    });

    it('handles empty string', () => {
      expect(capitalizeWords('')).toBe('');
    });

    it('handles multiple spaces', () => {
      expect(capitalizeWords('hello  world')).toBe('Hello  World');
    });
  });

  describe('capitalizeKebab', () => {
    it('converts kebab-case to Title Case', () => {
      expect(capitalizeKebab('hello-world')).toBe('Hello World');
    });

    it('handles single word', () => {
      expect(capitalizeKebab('hello')).toBe('Hello');
    });

    it('handles multiple hyphens', () => {
      expect(capitalizeKebab('one-two-three')).toBe('One Two Three');
    });

    it('handles empty string', () => {
      expect(capitalizeKebab('')).toBe('');
    });
  });

  describe('truncateText', () => {
    it('truncates long text with suffix', () => {
      expect(truncateText('hello world', 8)).toBe('hello...');
    });

    it('does not truncate short text', () => {
      expect(truncateText('hello', 10)).toBe('hello');
    });

    it('handles exact length', () => {
      expect(truncateText('hello', 5)).toBe('hello');
    });

    it('uses custom suffix', () => {
      expect(truncateText('hello world', 9, '…')).toBe('hello wo…');
    });

    it('handles empty suffix', () => {
      expect(truncateText('hello world', 5, '')).toBe('hello');
    });
  });

  describe('truncateWithInfo', () => {
    it('truncates with byte info', () => {
      expect(truncateWithInfo('hello world', 5)).toBe('hello\n... [truncated 6 bytes]');
    });

    it('does not truncate short text', () => {
      expect(truncateWithInfo('hello', 10)).toBe('hello');
    });

    it('handles exact length', () => {
      expect(truncateWithInfo('hello', 5)).toBe('hello');
    });
  });

  describe('truncateSentence', () => {
    it('extracts first sentence', () => {
      expect(truncateSentence('Hello world. More text.')).toBe('Hello world.');
    });

    it('handles question mark', () => {
      expect(truncateSentence('Is it done? More text.')).toBe('Is it done?');
    });

    it('handles exclamation mark', () => {
      expect(truncateSentence('Wow! More text.')).toBe('Wow!');
    });

    it('truncates if first sentence is too long', () => {
      expect(truncateSentence('This is a very long sentence that exceeds the limit.', 20)).toBe(
        'This is a very long...'
      );
    });

    it('returns full text if short enough', () => {
      expect(truncateSentence('Short.', 150)).toBe('Short.');
    });

    it('handles no sentence ending', () => {
      expect(truncateSentence('No ending', 150)).toBe('No ending');
    });
  });

  describe('splitLines', () => {
    it('splits on newlines', () => {
      expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
    });

    it('handles Windows line endings', () => {
      expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
    });

    it('preserves empty lines', () => {
      expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
    });

    it('handles single line', () => {
      expect(splitLines('hello')).toEqual(['hello']);
    });

    it('handles empty string', () => {
      expect(splitLines('')).toEqual(['']);
    });
  });

  describe('splitNonEmptyLines', () => {
    it('filters empty lines', () => {
      expect(splitNonEmptyLines('a\n\nb')).toEqual(['a', 'b']);
    });

    it('trims whitespace', () => {
      expect(splitNonEmptyLines('  a  \n  b  ')).toEqual(['a', 'b']);
    });

    it('filters whitespace-only lines', () => {
      expect(splitNonEmptyLines('a\n   \nb')).toEqual(['a', 'b']);
    });

    it('handles Windows line endings', () => {
      expect(splitNonEmptyLines('a\r\n\r\nb')).toEqual(['a', 'b']);
    });
  });

  describe('splitTrimmedLines', () => {
    it('trims but preserves empty lines', () => {
      expect(splitTrimmedLines('  a  \n\n  b  ')).toEqual(['a', '', 'b']);
    });

    it('handles Windows line endings', () => {
      expect(splitTrimmedLines('  a  \r\n  b  ')).toEqual(['a', 'b']);
    });
  });

  describe('countSentences', () => {
    it('counts period-ended sentences', () => {
      expect(countSentences('Hello. World.')).toBe(2);
    });

    it('counts question marks', () => {
      expect(countSentences('Hello? World?')).toBe(2);
    });

    it('counts exclamation marks', () => {
      expect(countSentences('Hello! World!')).toBe(2);
    });

    it('counts mixed punctuation', () => {
      expect(countSentences('Hello. World? Yes!')).toBe(3);
    });

    it('handles sentence at end of string', () => {
      expect(countSentences('Hello world.')).toBe(1);
    });

    it('returns 0 for no sentences', () => {
      expect(countSentences('hello world')).toBe(0);
    });

    it('handles empty string', () => {
      expect(countSentences('')).toBe(0);
    });

    it('handles multiple punctuation', () => {
      expect(countSentences('Really?! Yes...')).toBe(2);
    });
  });

  describe('splitSentences', () => {
    it('splits on periods', () => {
      expect(splitSentences('Hello world. Goodbye.')).toEqual(['Hello world.', 'Goodbye.']);
    });

    it('splits on question marks', () => {
      expect(splitSentences('What? Who?')).toEqual(['What?', 'Who?']);
    });

    it('splits on exclamation marks', () => {
      expect(splitSentences('Wow! Amazing!')).toEqual(['Wow!', 'Amazing!']);
    });

    it('handles mixed punctuation', () => {
      expect(splitSentences('Hello. What? Wow!')).toEqual(['Hello.', 'What?', 'Wow!']);
    });

    it('trims whitespace', () => {
      expect(splitSentences('  Hello.   World.  ')).toEqual(['Hello.', 'World.']);
    });

    it('handles single sentence', () => {
      expect(splitSentences('Hello world.')).toEqual(['Hello world.']);
    });

    it('handles no punctuation', () => {
      expect(splitSentences('hello world')).toEqual(['hello world']);
    });
  });

  describe('countWords', () => {
    it('counts words', () => {
      expect(countWords('Hello world')).toBe(2);
    });

    it('handles multiple spaces', () => {
      expect(countWords('Hello   world')).toBe(2);
    });

    it('handles leading/trailing whitespace', () => {
      expect(countWords('  Hello world  ')).toBe(2);
    });

    it('handles single word', () => {
      expect(countWords('Hello')).toBe(1);
    });

    it('handles empty string', () => {
      expect(countWords('')).toBe(0);
    });

    it('handles whitespace-only string', () => {
      expect(countWords('   ')).toBe(0);
    });

    it('handles tabs and newlines', () => {
      expect(countWords('Hello\tworld\ntest')).toBe(3);
    });
  });
});
