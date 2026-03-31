import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  listVaultFilesByExtension,
  normalizeRelativeVaultPath,
  resolveNoteLocation,
  sanitizeAttachmentFileName,
  sanitizeFileStem,
} from '../src/lib/paths.js';

describe('paths', () => {
  it('rejects paths that escape the vault root', () => {
    expect(() => normalizeRelativeVaultPath('../secrets.md')).toThrow(/escapes the vault root/i);
  });

  it('builds Obsidian-friendly note paths from titles', () => {
    const location = resolveNoteLocation({
      vaultRoot: '/vault',
      title: 'Project: Plan',
      folder: 'Inbox',
      extension: '.md',
    });

    expect(location.relativePath).toBe('Inbox/Project Plan.md');
  });

  it('sanitizes file names without dropping readability', () => {
    expect(sanitizeFileStem('Roadmap / Q2')).toBe('Roadmap Q2');
    expect(sanitizeAttachmentFileName('diagram?.png')).toBe('diagram.png');
  });

  it('excludes hidden semantic index files from note scans', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'obsidian-mcp-paths-'));
    await mkdir(path.join(vaultRoot, 'Inbox'), { recursive: true });
    await mkdir(path.join(vaultRoot, '.obsidian-mcp', 'semantic-index'), { recursive: true });
    await writeFile(path.join(vaultRoot, 'Inbox', 'Visible.md'), '# Visible\n', 'utf8');
    await writeFile(
      path.join(vaultRoot, '.obsidian-mcp', 'semantic-index', 'Hidden.md'),
      '# Hidden\n',
      'utf8',
    );

    const files = await listVaultFilesByExtension(vaultRoot, '.md', '', {
      excludedPaths: ['.obsidian-mcp/semantic-index'],
    });

    expect(files).toEqual(['Inbox/Visible.md']);
  });
});
