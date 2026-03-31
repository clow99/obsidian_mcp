import 'dotenv/config';
import path from 'node:path';

import * as z from 'zod/v4';

import { normalizeRelativeVaultPath, resolveVaultPath } from './lib/paths.js';

const envSchema = z.object({
  OBSIDIAN_VAULT_PATH: z.string().min(1).default('/vault'),
  OBSIDIAN_TEMPLATE_FOLDER: z.string().min(1).default('Templates'),
  OBSIDIAN_ATTACHMENTS_FOLDER: z.string().min(1).default('Assets'),
  OBSIDIAN_DAILY_NOTES_FOLDER: z.string().min(1).default('Daily Notes'),
  OBSIDIAN_DEFAULT_NOTE_FOLDER: z.string().min(1).default('Inbox'),
  OBSIDIAN_NOTE_EXTENSION: z.string().min(1).default('.md'),
  OBSIDIAN_ALLOW_UNSAFE_OVERWRITE: z.boolean().default(false),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().min(1).optional(),
  OBSIDIAN_SEMANTIC_INDEX_FOLDER: z.string().min(1).default('.obsidian-mcp/semantic-index'),
  OBSIDIAN_SEMANTIC_EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
  OBSIDIAN_SEMANTIC_CHUNK_SIZE: z.number().int().positive().default(1200),
  OBSIDIAN_SEMANTIC_CHUNK_OVERLAP: z.number().int().min(0).default(200),
  OBSIDIAN_SEMANTIC_TOP_K: z.number().int().positive().default(8),
  OBSIDIAN_SEMANTIC_BATCH_SIZE: z.number().int().positive().default(50),
});

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number.parseInt(trimmed, 10);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }

  return parsed;
}

function parseOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export type AppConfig = {
  vaultRoot: string;
  templateFolder: string;
  attachmentsFolder: string;
  dailyNotesFolder: string;
  defaultNoteFolder: string;
  noteExtension: string;
  allowUnsafeOverwrite: boolean;
  openAiApiKey?: string | undefined;
  openAiBaseUrl?: string | undefined;
  semanticEmbeddingModel: string;
  semanticIndexFolder: string;
  semanticIndexRoot: string;
  semanticIndexFileRelativePath: string;
  semanticIndexFilePath: string;
  semanticChunkSize: number;
  semanticChunkOverlap: number;
  semanticTopK: number;
  semanticBatchSize: number;
};

export function loadConfig(): AppConfig {
  const parsed = envSchema.parse({
    OBSIDIAN_VAULT_PATH: process.env.OBSIDIAN_VAULT_PATH,
    OBSIDIAN_TEMPLATE_FOLDER: process.env.OBSIDIAN_TEMPLATE_FOLDER,
    OBSIDIAN_ATTACHMENTS_FOLDER: process.env.OBSIDIAN_ATTACHMENTS_FOLDER,
    OBSIDIAN_DAILY_NOTES_FOLDER: process.env.OBSIDIAN_DAILY_NOTES_FOLDER,
    OBSIDIAN_DEFAULT_NOTE_FOLDER: process.env.OBSIDIAN_DEFAULT_NOTE_FOLDER,
    OBSIDIAN_NOTE_EXTENSION: process.env.OBSIDIAN_NOTE_EXTENSION,
    OBSIDIAN_ALLOW_UNSAFE_OVERWRITE: parseBoolean(process.env.OBSIDIAN_ALLOW_UNSAFE_OVERWRITE),
    OPENAI_API_KEY: parseOptionalString(process.env.OPENAI_API_KEY),
    OPENAI_BASE_URL: parseOptionalString(process.env.OPENAI_BASE_URL),
    OBSIDIAN_SEMANTIC_INDEX_FOLDER: process.env.OBSIDIAN_SEMANTIC_INDEX_FOLDER,
    OBSIDIAN_SEMANTIC_EMBEDDING_MODEL: process.env.OBSIDIAN_SEMANTIC_EMBEDDING_MODEL,
    OBSIDIAN_SEMANTIC_CHUNK_SIZE: parseInteger(process.env.OBSIDIAN_SEMANTIC_CHUNK_SIZE),
    OBSIDIAN_SEMANTIC_CHUNK_OVERLAP: parseInteger(process.env.OBSIDIAN_SEMANTIC_CHUNK_OVERLAP),
    OBSIDIAN_SEMANTIC_TOP_K: parseInteger(process.env.OBSIDIAN_SEMANTIC_TOP_K),
    OBSIDIAN_SEMANTIC_BATCH_SIZE: parseInteger(process.env.OBSIDIAN_SEMANTIC_BATCH_SIZE),
  });

  if (parsed.OBSIDIAN_SEMANTIC_CHUNK_OVERLAP >= parsed.OBSIDIAN_SEMANTIC_CHUNK_SIZE) {
    throw new Error('OBSIDIAN_SEMANTIC_CHUNK_OVERLAP must be smaller than OBSIDIAN_SEMANTIC_CHUNK_SIZE.');
  }

  const vaultRoot = path.resolve(parsed.OBSIDIAN_VAULT_PATH);
  const semanticIndexFolder = normalizeRelativeVaultPath(parsed.OBSIDIAN_SEMANTIC_INDEX_FOLDER);
  const semanticIndexFileRelativePath = path.posix.join(semanticIndexFolder, 'index.json');

  return {
    vaultRoot,
    templateFolder: parsed.OBSIDIAN_TEMPLATE_FOLDER,
    attachmentsFolder: parsed.OBSIDIAN_ATTACHMENTS_FOLDER,
    dailyNotesFolder: parsed.OBSIDIAN_DAILY_NOTES_FOLDER,
    defaultNoteFolder: parsed.OBSIDIAN_DEFAULT_NOTE_FOLDER,
    noteExtension: parsed.OBSIDIAN_NOTE_EXTENSION.startsWith('.')
      ? parsed.OBSIDIAN_NOTE_EXTENSION
      : `.${parsed.OBSIDIAN_NOTE_EXTENSION}`,
    allowUnsafeOverwrite: parsed.OBSIDIAN_ALLOW_UNSAFE_OVERWRITE,
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiBaseUrl: parsed.OPENAI_BASE_URL,
    semanticEmbeddingModel: parsed.OBSIDIAN_SEMANTIC_EMBEDDING_MODEL,
    semanticIndexFolder,
    semanticIndexRoot: resolveVaultPath(vaultRoot, semanticIndexFolder),
    semanticIndexFileRelativePath,
    semanticIndexFilePath: resolveVaultPath(vaultRoot, semanticIndexFileRelativePath),
    semanticChunkSize: parsed.OBSIDIAN_SEMANTIC_CHUNK_SIZE,
    semanticChunkOverlap: parsed.OBSIDIAN_SEMANTIC_CHUNK_OVERLAP,
    semanticTopK: parsed.OBSIDIAN_SEMANTIC_TOP_K,
    semanticBatchSize: parsed.OBSIDIAN_SEMANTIC_BATCH_SIZE,
  };
}
