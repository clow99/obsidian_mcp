import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';
import type { MarkdownChunk } from './chunking.js';

export const SEMANTIC_INDEX_VERSION = 1;

export type SemanticIndexedChunk = MarkdownChunk & {
  embedding: number[];
};

export type SemanticIndexSnapshot = {
  version: number;
  embeddingModel: string;
  generatedAt: string;
  chunks: SemanticIndexedChunk[];
};

export type SemanticIndexStatus = {
  exists: boolean;
  indexFolder: string;
  indexFile: string;
  embeddingModel: string | null;
  generatedAt: string | null;
  noteCount: number;
  chunkCount: number;
};

export class SemanticIndexStore {
  constructor(private readonly config: Pick<AppConfig, 'semanticIndexRoot' | 'semanticIndexFilePath' | 'semanticIndexFolder' | 'semanticIndexFileRelativePath'>) {}

  async readIndex(): Promise<SemanticIndexSnapshot | undefined> {
    try {
      const rawIndex = await readFile(this.config.semanticIndexFilePath, 'utf8');
      const parsed = JSON.parse(rawIndex) as SemanticIndexSnapshot;

      if (parsed.version !== SEMANTIC_INDEX_VERSION || !Array.isArray(parsed.chunks)) {
        throw new Error('Unsupported semantic index format.');
      }

      return parsed;
    } catch (error) {
      if (isFileMissingError(error)) {
        return undefined;
      }

      throw error;
    }
  }

  async writeIndex(snapshot: SemanticIndexSnapshot): Promise<void> {
    await mkdir(this.config.semanticIndexRoot, { recursive: true });
    await writeFile(this.config.semanticIndexFilePath, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  async replaceNoteChunks(
    notePath: string,
    chunks: SemanticIndexedChunk[],
    embeddingModel: string,
  ): Promise<SemanticIndexSnapshot> {
    const existingIndex = (await this.readIndex()) ?? createEmptySnapshot(embeddingModel);
    const nextChunks = existingIndex.chunks
      .filter((chunk) => chunk.notePath !== notePath)
      .concat(chunks)
      .sort((left, right) => left.notePath.localeCompare(right.notePath) || left.order - right.order);
    const nextIndex: SemanticIndexSnapshot = {
      version: SEMANTIC_INDEX_VERSION,
      embeddingModel,
      generatedAt: new Date().toISOString(),
      chunks: nextChunks,
    };

    await this.writeIndex(nextIndex);

    return nextIndex;
  }

  async removeNoteChunks(notePath: string): Promise<SemanticIndexSnapshot | undefined> {
    const existingIndex = await this.readIndex();

    if (!existingIndex) {
      return undefined;
    }

    const nextIndex: SemanticIndexSnapshot = {
      version: SEMANTIC_INDEX_VERSION,
      embeddingModel: existingIndex.embeddingModel,
      generatedAt: new Date().toISOString(),
      chunks: existingIndex.chunks.filter((chunk) => chunk.notePath !== notePath),
    };

    if (nextIndex.chunks.length === 0) {
      await this.deleteIndex();
      return undefined;
    }

    await this.writeIndex(nextIndex);

    return nextIndex;
  }

  async deleteIndex(): Promise<void> {
    await rm(this.config.semanticIndexRoot, { recursive: true, force: true });
  }

  toStatus(snapshot?: SemanticIndexSnapshot): SemanticIndexStatus {
    if (!snapshot) {
      return {
        exists: false,
        indexFolder: this.config.semanticIndexFolder,
        indexFile: this.config.semanticIndexFileRelativePath,
        embeddingModel: null,
        generatedAt: null,
        noteCount: 0,
        chunkCount: 0,
      };
    }

    return {
      exists: true,
      indexFolder: this.config.semanticIndexFolder,
      indexFile: this.config.semanticIndexFileRelativePath,
      embeddingModel: snapshot.embeddingModel,
      generatedAt: snapshot.generatedAt,
      noteCount: new Set(snapshot.chunks.map((chunk) => chunk.notePath)).size,
      chunkCount: snapshot.chunks.length,
    };
  }
}

function createEmptySnapshot(embeddingModel: string): SemanticIndexSnapshot {
  return {
    version: SEMANTIC_INDEX_VERSION,
    embeddingModel,
    generatedAt: new Date().toISOString(),
    chunks: [],
  };
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}
