import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { assertVersionTokenMatches, buildVersionToken } from '../src/services/conflicts.js';

describe('conflict protection', () => {
  it('detects stale version tokens', async () => {
    const tempFile = path.join(
      await mkdtemp(path.join(os.tmpdir(), 'obsidian-mcp-conflicts-')),
      'note.md',
    );
    await writeFile(tempFile, 'first', 'utf8');
    const firstStats = await stat(tempFile);
    const firstToken = buildVersionToken('first', firstStats);

    await writeFile(tempFile, 'second', 'utf8');
    const secondStats = await stat(tempFile);
    const secondToken = buildVersionToken('second', secondStats);

    expect(() => assertVersionTokenMatches(firstToken, secondToken)).toThrow(/version conflict/i);
  });
});
