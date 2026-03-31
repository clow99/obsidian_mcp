import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';
import { chunkMarkdownDocument } from '../lib/chunking.js';
import { type EmbeddingsProvider, embedTextBatches } from '../lib/embeddings.js';
import {
  type SemanticIndexStatus,
  type SemanticIndexedChunk,
  SemanticIndexStore,
} from '../lib/index-store.js';
import { createWikiLink } from '../lib/links.js';
import { parseMarkdownDocument } from '../lib/markdown.js';
import {
  ensureExtension,
  getNoteTitleFromPath,
  listVaultFilesByExtension,
  normalizeFolderPath,
  normalizeRelativeVaultPath,
  resolveVaultPath,
} from '../lib/paths.js';

export type SemanticSearchInput = {
  query: string;
  folder?: string | undefined;
  title?: string | undefined;
  tag?: string | undefined;
  limit?: number | undefined;
};

export type RelevantContextInput = {
  query: string;
  folder?: string | undefined;
  title?: string | undefined;
  tag?: string | undefined;
  maxChunks?: number | undefined;
};

export type SemanticSearchResult = {
  noteTitle: string;
  notePath: string;
  wikiLink: string;
  heading: string | null;
  headingPath: string[];
  tags: string[];
  modifiedTime: string;
  content: string;
  snippet: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
};

export type RelevantContextResult = {
  query: string;
  contextText: string;
  chunks: SemanticSearchResult[];
  sources: Array<{
    noteTitle: string;
    notePath: string;
    wikiLink: string;
  }>;
};

type IndexableNote = {
  notePath: string;
  noteTitle: string;
  body: string;
  frontmatter: Record<string, unknown>;
  modifiedTime: string;
};

export class SemanticRetrievalService {
  private readonly indexStore: SemanticIndexStore;

  constructor(
    private readonly config: AppConfig,
    private readonly embeddingsProvider: EmbeddingsProvider,
  ) {
    this.indexStore = new SemanticIndexStore(config);
  }

  async semanticSearch(input: SemanticSearchInput): Promise<SemanticSearchResult[]> {
    const snapshot = await this.loadQueryableIndex();
    const queryEmbedding = await this.embedQuery(input.query);
    const normalizedFolder = normalizeFolderPath(input.folder);
    const normalizedTitle = input.title?.trim().toLowerCase();
    const normalizedTag = input.tag?.trim().toLowerCase();
    const queryTokens = tokenize(input.query);
    const limit = Math.max(1, Math.min(input.limit ?? this.config.semanticTopK, 50));

    return snapshot.chunks
      .filter((chunk) => this.matchesFilters(chunk, normalizedFolder, normalizedTitle, normalizedTag))
      .map((chunk) => this.rankChunk(chunk, queryEmbedding, input.query, queryTokens, normalizedFolder))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async getRelevantContext(input: RelevantContextInput): Promise<RelevantContextResult> {
    const chunks = await this.semanticSearch({
      query: input.query,
      folder: input.folder,
      title: input.title,
      tag: input.tag,
      limit: input.maxChunks ?? this.config.semanticTopK,
    });
    const sources = Array.from(
      new Map(
        chunks.map((chunk) => [
          chunk.notePath,
          {
            noteTitle: chunk.noteTitle,
            notePath: chunk.notePath,
            wikiLink: chunk.wikiLink,
          },
        ]),
      ).values(),
    );
    const contextText = chunks
      .map((chunk, index) =>
        [
          `[${index + 1}] ${chunk.noteTitle}`,
          `Path: ${chunk.notePath}`,
          chunk.heading ? `Heading: ${chunk.headingPath.join(' > ')}` : undefined,
          `Score: ${chunk.score.toFixed(4)}`,
          chunk.content,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n---\n\n');

    return {
      query: input.query,
      contextText,
      chunks,
      sources,
    };
  }

  async reindexVault(): Promise<SemanticIndexStatus> {
    const notePaths = await listVaultFilesByExtension(this.config.vaultRoot, this.config.noteExtension, '', {
      excludedPaths: [this.config.semanticIndexFolder],
    });
    const notes = await Promise.all(notePaths.map((notePath) => this.loadNoteForIndexing(notePath)));
    const chunks = notes.flatMap((note) =>
      chunkMarkdownDocument({
        notePath: note.notePath,
        noteTitle: note.noteTitle,
        body: note.body,
        frontmatter: note.frontmatter,
        modifiedTime: note.modifiedTime,
        chunkSize: this.config.semanticChunkSize,
        chunkOverlap: this.config.semanticChunkOverlap,
      }),
    );
    const embeddings = await embedTextBatches(
      this.embeddingsProvider,
      chunks.map((chunk) => buildEmbeddingInput(chunk)),
      this.config.semanticBatchSize,
    );
    const snapshot = {
      version: 1,
      embeddingModel: this.embeddingsProvider.modelName,
      generatedAt: new Date().toISOString(),
      chunks: chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index] ?? [],
      })),
    };

    await this.indexStore.writeIndex(snapshot);

    return this.indexStore.toStatus(snapshot);
  }

  async reindexNote(notePath: string): Promise<SemanticIndexStatus> {
    const normalizedNotePath = ensureExtension(
      normalizeRelativeVaultPath(notePath),
      this.config.noteExtension,
    );

    try {
      const note = await this.loadNoteForIndexing(normalizedNotePath);
      const chunks = chunkMarkdownDocument({
        notePath: note.notePath,
        noteTitle: note.noteTitle,
        body: note.body,
        frontmatter: note.frontmatter,
        modifiedTime: note.modifiedTime,
        chunkSize: this.config.semanticChunkSize,
        chunkOverlap: this.config.semanticChunkOverlap,
      });
      const embeddings = await embedTextBatches(
        this.embeddingsProvider,
        chunks.map((chunk) => buildEmbeddingInput(chunk)),
        this.config.semanticBatchSize,
      );
      const snapshot = await this.indexStore.replaceNoteChunks(
        normalizedNotePath,
        chunks.map((chunk, index) => ({
          ...chunk,
          embedding: embeddings[index] ?? [],
        })),
        this.embeddingsProvider.modelName,
      );

      return this.indexStore.toStatus(snapshot);
    } catch (error) {
      if (!isFileMissingError(error)) {
        throw error;
      }

      const snapshot = await this.indexStore.removeNoteChunks(normalizedNotePath);
      return this.indexStore.toStatus(snapshot);
    }
  }

  async getIndexStatus(): Promise<SemanticIndexStatus> {
    const snapshot = await this.indexStore.readIndex();
    return this.indexStore.toStatus(snapshot);
  }

  private async loadQueryableIndex() {
    const snapshot = await this.indexStore.readIndex();

    if (!snapshot || snapshot.chunks.length === 0) {
      throw new Error('Semantic index is empty. Run reindex_vault before searching semantically.');
    }

    if (snapshot.embeddingModel !== this.embeddingsProvider.modelName) {
      throw new Error(
        `Semantic index was built with ${snapshot.embeddingModel}. Rebuild it for ${this.embeddingsProvider.modelName}.`,
      );
    }

    return snapshot;
  }

  private async embedQuery(query: string): Promise<number[]> {
    const [embedding] = await this.embeddingsProvider.embedTexts([query]);

    if (!embedding) {
      throw new Error('Unable to generate a query embedding.');
    }

    return embedding;
  }

  private matchesFilters(
    chunk: SemanticIndexedChunk,
    normalizedFolder: string | undefined,
    normalizedTitle: string | undefined,
    normalizedTag: string | undefined,
  ): boolean {
    if (normalizedFolder) {
      const chunkFolder = path.posix.dirname(chunk.notePath);
      const isFolderMatch =
        chunkFolder === normalizedFolder || chunk.notePath.startsWith(`${normalizedFolder}/`);

      if (!isFolderMatch) {
        return false;
      }
    }

    if (normalizedTitle && !chunk.noteTitle.toLowerCase().includes(normalizedTitle)) {
      return false;
    }

    if (
      normalizedTag &&
      !chunk.tags.some((tag) => tag.toLowerCase() === normalizedTag)
    ) {
      return false;
    }

    return true;
  }

  private rankChunk(
    chunk: SemanticIndexedChunk,
    queryEmbedding: number[],
    query: string,
    queryTokens: string[],
    normalizedFolder: string | undefined,
  ): SemanticSearchResult {
    const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding);
    const keywordScore = computeKeywordScore(queryTokens, chunk);
    const metadataBoost = computeMetadataBoost(query, queryTokens, chunk, normalizedFolder);
    const score = semanticScore * 0.78 + keywordScore * 0.17 + metadataBoost;

    return {
      noteTitle: chunk.noteTitle,
      notePath: chunk.notePath,
      wikiLink: createWikiLink(chunk.notePath),
      heading: chunk.heading,
      headingPath: chunk.headingPath,
      tags: chunk.tags,
      modifiedTime: chunk.modifiedTime,
      content: chunk.text,
      snippet: buildSnippet(chunk.text, query),
      score,
      semanticScore,
      keywordScore,
    };
  }

  private async loadNoteForIndexing(notePath: string): Promise<IndexableNote> {
    const normalizedNotePath = ensureExtension(
      normalizeRelativeVaultPath(notePath),
      this.config.noteExtension,
    );
    const absolutePath = resolveVaultPath(this.config.vaultRoot, normalizedNotePath);
    const [content, fileStats] = await Promise.all([
      readFile(absolutePath, 'utf8'),
      stat(absolutePath),
    ]);
    const parsed = parseMarkdownDocument(content);

    return {
      notePath: normalizedNotePath,
      noteTitle:
        typeof parsed.frontmatter.title === 'string' && parsed.frontmatter.title.trim()
          ? parsed.frontmatter.title
          : getNoteTitleFromPath(normalizedNotePath),
      body: parsed.body,
      frontmatter: parsed.frontmatter,
      modifiedTime: fileStats.mtime.toISOString(),
    };
  }
}

function buildEmbeddingInput(chunk: SemanticIndexedChunk | Omit<SemanticIndexedChunk, 'embedding'>): string {
  return [
    `Note title: ${chunk.noteTitle}`,
    chunk.headingPath.length > 0 ? `Heading path: ${chunk.headingPath.join(' > ')}` : undefined,
    chunk.tags.length > 0 ? `Tags: ${chunk.tags.join(', ')}` : undefined,
    chunk.text,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSnippet(text: string, query: string): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedText) {
    return '';
  }

  const matchIndex = normalizedText.toLowerCase().indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return normalizedText.slice(0, 240);
  }

  const start = Math.max(0, matchIndex - 70);
  const end = Math.min(normalizedText.length, matchIndex + normalizedQuery.length + 120);
  return normalizedText.slice(start, end);
}

function tokenize(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2),
    ),
  );
}

function computeKeywordScore(queryTokens: string[], chunk: SemanticIndexedChunk): number {
  if (queryTokens.length === 0) {
    return 0;
  }

  const chunkTokens = new Set(
    tokenize([chunk.noteTitle, chunk.headingPath.join(' '), chunk.tags.join(' '), chunk.text].join(' ')),
  );
  const overlapCount = queryTokens.filter((token) => chunkTokens.has(token)).length;

  return overlapCount / queryTokens.length;
}

function computeMetadataBoost(
  query: string,
  queryTokens: string[],
  chunk: SemanticIndexedChunk,
  normalizedFolder: string | undefined,
): number {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTitle = chunk.noteTitle.toLowerCase();
  const normalizedTags = chunk.tags.map((tag) => tag.toLowerCase());
  let boost = 0;

  if (normalizedQuery && normalizedTitle === normalizedQuery) {
    boost += 0.15;
  } else if (normalizedQuery && normalizedTitle.includes(normalizedQuery)) {
    boost += 0.08;
  }

  const titleTokens = new Set(tokenize(chunk.noteTitle));
  const titleOverlap = queryTokens.filter((token) => titleTokens.has(token)).length;
  boost += Math.min(0.12, titleOverlap * 0.04);

  const tagOverlap = queryTokens.filter((token) => normalizedTags.includes(token)).length;
  boost += Math.min(0.1, tagOverlap * 0.05);

  if (normalizedFolder) {
    const noteFolder = path.posix.dirname(chunk.notePath);
    if (noteFolder === normalizedFolder || chunk.notePath.startsWith(`${normalizedFolder}/`)) {
      boost += 0.05;
    }
  }

  return boost;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}
