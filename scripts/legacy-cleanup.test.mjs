import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('legacy Nautilus and x_vault repo assets are removed', () => {
  assert.equal(
    existsSync(path.join(rootDir, 'packages/contracts')),
    false,
    'packages/contracts should be removed once the repository is fully off x_vault',
  );

  assert.equal(
    existsSync(path.join(rootDir, 'docs/original-concept.md')),
    false,
    'obsolete original concept docs should be removed',
  );

  assert.equal(
    existsSync(path.join(rootDir, 'docs/plans')),
    false,
    'obsolete implementation plans for Nautilus/x_vault should be removed',
  );
});

test('root public entrypoints no longer reference legacy Nautilus workflows', () => {
  const packageJson = JSON.parse(
    readFileSync(path.join(rootDir, 'package.json'), 'utf8'),
  );
  const scripts = packageJson.scripts ?? {};

  assert.equal(
    'generate:test-vectors' in scripts,
    false,
    'generate:test-vectors should be removed',
  );
  assert.equal(
    'publish:contracts:mainnet' in scripts,
    false,
    'publish:contracts:mainnet should be removed',
  );

  const readme = readFileSync(path.join(rootDir, 'readme.md'), 'utf8');
  assert.equal(
    readme.includes('packages/contracts'),
    false,
    'README should not point readers at the removed contracts package',
  );
  assert.equal(
    readme.includes('publish:contracts:mainnet'),
    false,
    'README should not document the removed contracts publish command',
  );
  assert.equal(
    readme.includes('Nautilus'),
    false,
    'README should not describe Nautilus-era architecture anymore',
  );
});

test('tracked text files do not reference the retired Levo host', () => {
  const retiredHost = ['levo', 'krilly', 'ai'].join('.');
  const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
    cwd: rootDir,
  })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);

  const matches = [];
  for (const relativePath of trackedFiles) {
    const absolutePath = path.join(rootDir, relativePath);
    const buffer = readFileSync(absolutePath);
    if (buffer.includes(0)) continue;

    if (buffer.toString('utf8').includes(retiredHost)) {
      matches.push(relativePath);
    }
  }

  assert.deepEqual(
    matches,
    [],
    `tracked text files should not reference the retired Levo host: ${matches.join(', ')}`,
  );
});
