import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AppConfig } from '../src/config.js';
import type { EmbeddingsProvider } from '../src/lib/embeddings.js';
import { SemanticRetrievalService } from '../src/services/semantic-retrieval.js';

class MockEmbeddingsProvider implements EmbeddingsProvider {
  readonly modelName = 'mock-embedding';

  async embedTexts(texts: string[]): Promise<number[][]> {
    return texts.map((text) => toVector(text));
  }
}

describe('semantic retrieval', () => {
  it('indexes notes in the hidden folder and returns semantic matches', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'obsidian-mcp-semantic-'));
    await mkdir(path.join(vaultRoot, 'Inbox'), { recursive: true });
    await mkdir(path.join(vaultRoot, 'People'), { recursive: true });
    await mkdir(path.join(vaultRoot, '.obsidian-mcp', 'semantic-index'), { recursive: true });

    await writeFile(
      path.join(vaultRoot, 'Inbox', 'Docker Deployment.md'),
      [
        '---',
        'title: Docker Deployment',
        'tags:',
        '  - devops',
        '---',
        '',
        '## Plan',
        '',
        'Deploy the docker compose stack locally and test the container startup sequence.',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(vaultRoot, 'People', 'Wellbeing.md'),
      [
        '---',
        'title: Wellbeing',
        'tags:',
        '  - health',
        '---',
        '',
        '## Notes',
        '',
        'Track burnout, stress levels, rest, and workload trends for healthier planning.',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(vaultRoot, '.obsidian-mcp', 'semantic-index', 'Ignored.md'),
      '# Ignore me\n\nThis hidden file should never be indexed as a note.\n',
      'utf8',
    );

    const config = createTestConfig(vaultRoot);
    const service = new SemanticRetrievalService(config, new MockEmbeddingsProvider());

    const initialStatus = await service.getIndexStatus();
    expect(initialStatus.exists).toBe(false);

    const status = await service.reindexVault();
    expect(status.exists).toBe(true);
    expect(status.noteCount).toBe(2);
    expect(status.indexFile).toBe('.obsidian-mcp/semantic-index/index.json');

    const storedIndex = JSON.parse(await readFile(config.semanticIndexFilePath, 'utf8')) as {
      chunks: Array<{ notePath: string }>;
    };
    expect(storedIndex.chunks.some((chunk) => chunk.notePath.includes('.obsidian-mcp'))).toBe(false);

    const results = await service.semanticSearch({
      query: 'how should i deploy the docker compose app locally?',
      limit: 2,
    });

    expect(results[0]?.noteTitle).toBe('Docker Deployment');
    expect(results[0]?.wikiLink).toBe('[[Inbox/Docker Deployment]]');

    const context = await service.getRelevantContext({
      query: 'how should i deploy the docker compose app locally?',
      maxChunks: 2,
    });

    expect(context.contextText).toContain('Docker Deployment');
    expect(context.sources.some((source) => source.noteTitle === 'Docker Deployment')).toBe(true);
  });

  it('reindexes a single note after it changes', async () => {
    const vaultRoot = await mkdtemp(path.join(os.tmpdir(), 'obsidian-mcp-semantic-'));
    await mkdir(path.join(vaultRoot, 'Inbox'), { recursive: true });

    const notePath = path.join(vaultRoot, 'Inbox', 'Scratchpad.md');
    await writeFile(
      notePath,
      ['## Notes', '', 'This note describes docker rollout steps and compose updates.'].join('\n'),
      'utf8',
    );

    const config = createTestConfig(vaultRoot);
    const service = new SemanticRetrievalService(config, new MockEmbeddingsProvider());
    await service.reindexVault();

    await writeFile(
      notePath,
      ['## Notes', '', 'This note now focuses on burnout, stress, and recovery planning.'].join('\n'),
      'utf8',
    );

    const status = await service.reindexNote('Inbox/Scratchpad.md');
    expect(status.noteCount).toBe(1);

    const results = await service.semanticSearch({
      query: 'how do i track burnout and stress?',
      limit: 1,
    });

    expect(results[0]?.notePath).toBe('Inbox/Scratchpad.md');
    expect(results[0]?.content.toLowerCase()).toContain('burnout');
  });
});

function createTestConfig(vaultRoot: string): AppConfig {
  return {
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
}

function toVector(text: string): number[] {
  const normalized = text.toLowerCase();
  return [
    countMatches(normalized, /\bdocker\b|\bdeploy\b|\bcompose\b/g),
    countMatches(normalized, /\bburnout\b|\bstress\b|\brecovery\b/g),
    countMatches(normalized, /\bobsidian\b|\bagent\b|\bsemantic\b/g),
    normalized.length / 1000,
  ];
}

function countMatches(value: string, pattern: RegExp): number {
  return value.match(pattern)?.length ?? 0;
}
