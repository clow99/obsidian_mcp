import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import * as z from 'zod/v4';

import type { AppConfig } from '../config.js';
import type { AttachmentService } from '../services/attachments.js';
import type { SearchService } from '../services/search.js';
import type { SemanticRetrievalService } from '../services/semantic-retrieval.js';
import type { TemplateService } from '../services/templates.js';
import type { VaultService } from '../services/vault.js';

const frontmatterSchema = z.record(z.string(), z.unknown());

export const noteLookupSchema = z
  .object({
    path: z.string().min(1).optional().describe('Vault-relative note path, with or without .md.'),
    title: z.string().min(1).optional().describe('Exact note title if no path is provided.'),
  })
  .refine((value) => Boolean(value.path || value.title), {
    message: 'Provide either a note path or a note title.',
  });

export const createNoteInputSchema = z.object({
  title: z.string().min(1).describe('Displayed note title.'),
  path: z.string().min(1).optional().describe('Optional vault-relative note path override.'),
  folder: z.string().min(1).optional().describe('Optional target folder when path is not supplied.'),
  body: z.string().optional().default('').describe('Markdown body to write into the note.'),
  frontmatter: frontmatterSchema.optional().describe('Frontmatter fields to add or merge.'),
  tags: z.array(z.string().min(1)).optional().describe('Tag list to store in frontmatter.'),
  aliases: z.array(z.string().min(1)).optional().describe('Aliases to store in frontmatter.'),
  template: z.string().min(1).optional().describe('Optional template name relative to the template folder.'),
});

export const readNoteInputSchema = noteLookupSchema;

export const updateNoteInputSchema = noteLookupSchema.extend({
  body: z.string().optional().describe('Replace the entire Markdown body with this content.'),
  heading: z.string().min(1).optional().describe('Heading to update inside the note.'),
  headingContent: z.string().optional().describe('Replacement content for the target heading.'),
  frontmatter: frontmatterSchema.optional().describe('Frontmatter values to merge into the note.'),
  expectedVersionToken: z.string().min(1).optional().describe('Version token returned by read_note.'),
  force: z.boolean().optional().default(false).describe('Override safe update checks.'),
}).refine(
  (value) => value.body !== undefined || value.headingContent !== undefined || value.frontmatter !== undefined,
  {
    message: 'Provide body, headingContent, or frontmatter to update the note.',
  },
);

export const appendToNoteInputSchema = noteLookupSchema.extend({
  content: z.string().min(1).describe('Markdown content to append.'),
  heading: z.string().min(1).optional().describe('Optional heading to append under.'),
  folder: z.string().min(1).optional().describe('Folder to use if the note is created during append.'),
  frontmatter: frontmatterSchema.optional().describe('Frontmatter values to merge during append.'),
  createIfMissing: z.boolean().optional().default(false).describe('Create the note if it does not exist.'),
  expectedVersionToken: z.string().min(1).optional().describe('Version token returned by read_note.'),
  force: z.boolean().optional().default(false).describe('Override safe update checks.'),
});

export const upsertFrontmatterInputSchema = noteLookupSchema.extend({
  frontmatter: frontmatterSchema.describe('Frontmatter values to merge into the note.'),
  expectedVersionToken: z.string().min(1).optional().describe('Version token returned by read_note.'),
  force: z.boolean().optional().default(false).describe('Override safe update checks.'),
});

export const searchNotesInputSchema = z.object({
  query: z.string().min(1).optional().describe('Text query to search within note bodies and titles.'),
  title: z.string().min(1).optional().describe('Filter notes by title substring.'),
  folder: z.string().min(1).optional().describe('Restrict results to a vault-relative folder.'),
  tag: z.string().min(1).optional().describe('Filter notes containing an exact tag.'),
  limit: z.number().int().min(1).max(100).optional().default(20).describe('Maximum results to return.'),
});

export const semanticSearchInputSchema = z.object({
  query: z.string().min(1).describe('Natural-language query to search semantically across indexed notes.'),
  folder: z.string().min(1).optional().describe('Optional vault-relative folder filter.'),
  title: z.string().min(1).optional().describe('Optional note-title filter.'),
  tag: z.string().min(1).optional().describe('Optional exact tag filter.'),
  limit: z.number().int().min(1).max(50).optional().default(8).describe('Maximum semantic matches to return.'),
});

export const relevantContextInputSchema = z.object({
  query: z.string().min(1).describe('Question or prompt that needs vault context.'),
  folder: z.string().min(1).optional().describe('Optional vault-relative folder filter.'),
  title: z.string().min(1).optional().describe('Optional note-title filter.'),
  tag: z.string().min(1).optional().describe('Optional exact tag filter.'),
  maxChunks: z.number().int().min(1).max(20).optional().default(6).describe('Maximum chunks to return in the context bundle.'),
});

export const appendDailyNoteInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Daily note date as YYYY-MM-DD.'),
  content: z.string().min(1).describe('Markdown content to append to the daily note.'),
  heading: z.string().min(1).optional().describe('Optional heading to append under.'),
  template: z.string().min(1).optional().describe('Template to use if the daily note must be created.'),
  frontmatter: frontmatterSchema.optional().describe('Frontmatter values to merge into the daily note.'),
  expectedVersionToken: z.string().min(1).optional().describe('Version token returned by read_note.'),
  force: z.boolean().optional().default(false).describe('Override safe update checks.'),
});

export const createNoteFromTemplateInputSchema = z.object({
  title: z.string().min(1).describe('Displayed note title.'),
  template: z.string().min(1).describe('Template name relative to the template folder.'),
  path: z.string().min(1).optional().describe('Optional vault-relative note path override.'),
  folder: z.string().min(1).optional().describe('Optional target folder when path is not supplied.'),
  body: z.string().optional().default('').describe('Markdown content to append after the template body.'),
  frontmatter: frontmatterSchema.optional().describe('Frontmatter values to merge after template rendering.'),
  tags: z.array(z.string().min(1)).optional().describe('Tag list to store in frontmatter.'),
  aliases: z.array(z.string().min(1)).optional().describe('Aliases to store in frontmatter.'),
});

export const createAttachmentReferenceInputSchema = z.object({
  filename: z.string().min(1).describe('Attachment file name.'),
  dataBase64: z.string().min(1).describe('Base64 payload or data URL for the attachment.'),
  folder: z.string().min(1).optional().describe('Optional attachment folder override.'),
  notePath: z.string().min(1).optional().describe('Optional note path used to co-locate attachments.'),
});

export const reindexNoteInputSchema = noteLookupSchema;

export type ToolDependencies = {
  config: AppConfig;
  vault: VaultService;
  search: SearchService;
  semantic: SemanticRetrievalService;
  templates: TemplateService;
  attachments: AttachmentService;
};

export type McpToolServer = McpServer;

export function createSuccessResult(message: string, data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `${message}\n${JSON.stringify(data, null, 2)}`,
      },
    ],
    structuredContent: {
      result: data,
    },
  };
}

export function createErrorResult(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: 'text' as const,
        text: `Error: ${message}`,
      },
    ],
    structuredContent: {
      error: message,
    },
    isError: true,
  };
}

export function buildTemplateVariables(title: string, notePath?: string): Record<string, string> {
  const now = new Date();
  const date = formatDate(now);
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const datetime = `${date}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return {
    title,
    notePath: notePath ?? '',
    date,
    time,
    datetime,
  };
}

function formatDate(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
