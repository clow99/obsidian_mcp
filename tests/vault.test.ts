import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/config.js';
import { VaultService } from '../src/services/vault.js';

describe('vault service', () => {
  it('creates, reads, and safely updates notes', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'obsidian-mcp-vault-'));
    const config: AppConfig = {
      vaultRoot,
      templateFolder: 'Templates',
      attachmentsFolder: 'Assets',
      dailyNotesFolder: 'Daily Notes',
      defaultNoteFolder: 'Inbox',
      noteExtension: '.md',
      allowUnsafeOverwrite: false,
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
      semanticEmbeddingModel: 'mock-embedding',
      semanticIndexFolder: '.obsidian-mcp/semantic-index',
      semanticIndexRoot: path.join(vaultRoot, '.obsidian-mcp', 'semantic-index'),
      semanticIndexFileRelativePath: '.obsidian-mcp/semantic-index/index.json',
      semanticIndexFilePath: path.join(vaultRoot, '.obsidian-mcp', 'semantic-index', 'index.json'),
      semanticChunkSize: 400,
      semanticChunkOverlap: 50,
      semanticTopK: 5,
      semanticBatchSize: 10,
    };
    const vault = new VaultService(config);

    const created = await vault.createNote({
      title: 'Project Plan',
      body: 'Initial body',
      frontmatter: { tags: ['project'] },
    });
    const read = await vault.readNote({ path: created.relativePath });
    const updated = await vault.updateNote({
      path: created.relativePath,
      body: 'Updated body',
      expectedVersionToken: read.versionToken,
    });

    expect(created.relativePath).toBe('Inbox/Project Plan.md');
    expect(updated.body.trim()).toBe('Updated body');

    await expect(
      vault.updateNote({
        path: created.relativePath,
        body: 'Stale update',
        expectedVersionToken: read.versionToken,
      }),
    ).rejects.toThrow(/version conflict/i);
  });

  it('ignores hidden semantic index notes when resolving by title', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'obsidian-mcp-vault-'));
    const config: AppConfig = {
      vaultRoot,
      templateFolder: 'Templates',
      attachmentsFolder: 'Assets',
      dailyNotesFolder: 'Daily Notes',
      defaultNoteFolder: 'Inbox',
      noteExtension: '.md',
      allowUnsafeOverwrite: false,
      openAiApiKey: undefined,
      openAiBaseUrl: undefined,
      semanticEmbeddingModel: 'mock-embedding',
      semanticIndexFolder: '.obsidian-mcp/semantic-index',
      semanticIndexRoot: path.join(vaultRoot, '.obsidian-mcp', 'semantic-index'),
      semanticIndexFileRelativePath: '.obsidian-mcp/semantic-index/index.json',
      semanticIndexFilePath: path.join(vaultRoot, '.obsidian-mcp', 'semantic-index', 'index.json'),
      semanticChunkSize: 400,
      semanticChunkOverlap: 50,
      semanticTopK: 5,
      semanticBatchSize: 10,
    };
    const vault = new VaultService(config);

    await vault.createNote({
      title: 'Project Plan',
      body: 'Visible note',
    });
    await mkdir(path.join(vaultRoot, '.obsidian-mcp', 'semantic-index'), { recursive: true });
    await writeFile(
      path.join(vaultRoot, '.obsidian-mcp', 'semantic-index', 'Project Plan.md'),
      '# Hidden duplicate\n',
      'utf8',
    );

    const note = await vault.readNote({ title: 'Project Plan' });

    expect(note.relativePath).toBe('Inbox/Project Plan.md');
  });
});
