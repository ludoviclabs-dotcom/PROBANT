/* eslint-disable @typescript-eslint/no-require-imports -- Next's scoped consumer loads a CommonJS package. */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { globSync: directoryGlob } = require('tinyglobby');

const MAX_PATTERN_LENGTH = 4096;
const MAX_PATTERN_DEPTH = 64;

function validatePattern(pattern) {
  if (typeof pattern !== 'string' || !pattern || pattern.length > MAX_PATTERN_LENGTH) {
    throw new TypeError('Next rootDir requires a non-empty pattern of at most 4096 characters');
  }
  if (pattern.startsWith('!') || pattern.includes('\u0000')) {
    throw new TypeError('Next rootDir does not accept negated patterns or NUL characters');
  }
  const depths = { '{': 0, '[': 0, '(': 0 };
  const openingFor = { '}': '{', ']': '[', ')': '(' };
  for (let i = 0; i < pattern.length; i += 1) {
    const character = pattern[i];
    if (character === '\\') {
      i += 1;
      continue;
    }
    if ('{[('.includes(character)) {
      depths[character] += 1;
      if (Object.values(depths).reduce((sum, value) => sum + value, 0) > MAX_PATTERN_DEPTH) throw new RangeError('Next rootDir pattern nesting exceeds 64');
    } else if (openingFor[character] && depths[openingFor[character]] > 0) {
      depths[openingFor[character]] -= 1;
    }
  }
}

function normalizeDirectory(directory) {
  const normalized = path.posix.normalize(directory.replace(/\\/g, '/'));
  return normalized === path.posix.parse(normalized).root || /^[A-Za-z]:\/$/.test(normalized) ? normalized : normalized.replace(/\/+$/, '');
}

/**
 * The sole supported API is the Next ESLint plugin's directory root lookup.
 * Next maps array rootDir settings to individual string calls before this API.
 * This replacement contains no fast-glob/micromatch/braces implementation.
 */
function globSync(pattern, options) {
  if (!options || options.onlyDirectories !== true || Object.keys(options).some(key => key !== 'onlyDirectories')) {
    throw new TypeError('Next rootDir glob adapter supports only { onlyDirectories: true }');
  }
  validatePattern(pattern);
  if (!/[*?\[\]{}()!]/.test(pattern)) {
    // tinyglobby treats an absolute cwd literal as an empty pattern. A direct
    // directory check also ensures a literal root does not include descendants.
    try {
      return fs.statSync(pattern).isDirectory() ? [normalizeDirectory(pattern)] : [];
    } catch (error) {
      if (error && ['ENOENT', 'ENOTDIR'].includes(error.code)) return [];
      throw error;
    }
  }
  const directories = directoryGlob(pattern, {
    onlyDirectories: true,
    expandDirectories: false,
    absolute: path.isAbsolute(pattern),
  });
  return [...new Set(directories.map(normalizeDirectory))];
}

module.exports = { globSync };
