import { readFile } from 'node:fs/promises';

import type { AppConfig } from '../config.js';
import { createWikiLink } from '../lib/links.js';
import { normalizeTags, parseMarkdownDocument } from '../lib/markdown.js';
import {
  getNoteTitleFromPath,
  listVaultFilesByExtension,
  normalizeFolderPath,
  resolveVaultPath,
} from '../lib/paths.js';

export type SearchNotesInput = {
  query?: string | undefined;
  title?: string | undefined;
  folder?: string | undefined;
  tag?: string | undefined;
  limit?: number | undefined;
};

export type SearchNoteResult = {
  title: string;
  relativePath: string;
  wikiLink: string;
  tags: string[];
  snippet: string;
};

export class SearchService {
  constructor(private readonly config: AppConfig) {}

  async searchNotes(input: SearchNotesInput): Promise<SearchNoteResult[]> {
    const files = await listVaultFilesByExtension(this.config.vaultRoot, this.config.noteExtension, '', {
      excludedPaths: [this.config.semanticIndexFolder],
    });
    const normalizedFolder = normalizeFolderPath(input.folder);
    const normalizedTitle = input.title?.trim().toLowerCase();
    const normalizedQuery = input.query?.trim().toLowerCase();
    const normalizedTag = input.tag?.trim().toLowerCase();
    const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
    const results: SearchNoteResult[] = [];

    for (const relativePath of files) {
      if (normalizedFolder && !relativePath.startsWith(`${normalizedFolder}/`) && relativePath !== normalizedFolder) {
        continue;
      }

      const absolutePath = resolveVaultPath(this.config.vaultRoot, relativePath);
      const content = await readFile(absolutePath, 'utf8');
      const parsed = parseMarkdownDocument(content);
      const title =
        typeof parsed.frontmatter.title === 'string' && parsed.frontmatter.title.trim()
          ? parsed.frontmatter.title
          : getNoteTitleFromPath(relativePath);
      const tags = normalizeTags(parsed.frontmatter.tags);
      const titleMatches = normalizedTitle ? title.toLowerCase().includes(normalizedTitle) : true;
      const tagMatches = normalizedTag
        ? tags.some((tag) => tag.toLowerCase() === normalizedTag)
        : true;
      const haystack = `${title}\n${parsed.body}`.toLowerCase();
      const queryMatches = normalizedQuery ? haystack.includes(normalizedQuery) : true;

      if (!titleMatches || !tagMatches || !queryMatches) {
        continue;
      }

      results.push({
        title,
        relativePath,
        wikiLink: createWikiLink(relativePath),
        tags,
        snippet: buildSnippet(parsed.body, input.query),
      });

      if (results.length >= limit) {
        break;
      }
    }

    return results;
  }
}

function buildSnippet(body: string, query: string | undefined): string {
  const trimmedBody = body.trim();

  if (!trimmedBody) {
    return '';
  }

  if (!query) {
    return trimmedBody.slice(0, 200);
  }

  const normalizedBody = trimmedBody.replace(/\s+/g, ' ');
  const matchIndex = normalizedBody.toLowerCase().indexOf(query.trim().toLowerCase());

  if (matchIndex === -1) {
    return normalizedBody.slice(0, 200);
  }

  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(normalizedBody.length, matchIndex + query.length + 100);
  return normalizedBody.slice(start, end);
}
