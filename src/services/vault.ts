import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';
import { createMarkdownLink, createWikiLink } from '../lib/links.js';
import {
  appendMarkdownBody,
  appendToSection,
  type Frontmatter,
  mergeFrontmatter,
  normalizeTags,
  parseMarkdownDocument,
  stringifyMarkdownDocument,
  upsertSection,
} from '../lib/markdown.js';
import {
  ensureExtension,
  getNoteTitleFromPath,
  listVaultFilesByExtension,
  normalizeRelativeVaultPath,
  resolveNoteLocation,
  resolveVaultPath,
} from '../lib/paths.js';
import { assertVersionTokenMatches, buildVersionToken } from './conflicts.js';

export type NoteLookup = {
  path?: string | undefined;
  title?: string | undefined;
};

export type NoteRecord = {
  title: string;
  relativePath: string;
  absolutePath: string;
  content: string;
  body: string;
  frontmatter: Frontmatter;
  versionToken: string;
  wikiLink: string;
  markdownLink: string;
  modifiedTime: string;
};

export type CreateNoteInput = {
  title: string;
  path?: string | undefined;
  folder?: string | undefined;
  body?: string | undefined;
  frontmatter?: Frontmatter | undefined;
  tags?: string[] | undefined;
  aliases?: string[] | undefined;
  overwrite?: boolean | undefined;
};

export type UpdateNoteInput = NoteLookup & {
  body?: string | undefined;
  heading?: string | undefined;
  headingContent?: string | undefined;
  frontmatter?: Frontmatter | undefined;
  expectedVersionToken?: string | undefined;
  force?: boolean | undefined;
};

export type AppendNoteInput = NoteLookup & {
  content: string;
  heading?: string | undefined;
  frontmatter?: Frontmatter | undefined;
  folder?: string | undefined;
  createIfMissing?: boolean | undefined;
  expectedVersionToken?: string | undefined;
  force?: boolean | undefined;
};

export class VaultService {
  constructor(private readonly config: AppConfig) {}

  async noteExists(relativePath: string): Promise<boolean> {
    try {
      const info = await stat(resolveVaultPath(this.config.vaultRoot, relativePath));
      return info.isFile();
    } catch {
      return false;
    }
  }

  async createNote(input: CreateNoteInput): Promise<NoteRecord> {
    const location = resolveNoteLocation({
      vaultRoot: this.config.vaultRoot,
      title: input.title,
      folder: input.path ? input.folder : input.folder ?? this.config.defaultNoteFolder,
      notePath: input.path,
      extension: this.config.noteExtension,
    });

    if (!input.overwrite && (await this.noteExists(location.relativePath))) {
      throw new Error(`Note already exists: ${location.relativePath}`);
    }

    const nextFrontmatter = this.prepareFrontmatter(
      input.frontmatter ?? {},
      input.title,
      input.tags,
      input.aliases,
    );

    return this.writeNote(location.relativePath, input.body ?? '', nextFrontmatter);
  }

  async readNote(input: NoteLookup): Promise<NoteRecord> {
    const location = await this.resolveExistingNote(input);
    return this.readNoteByPath(location.relativePath);
  }

  async updateNote(input: UpdateNoteInput): Promise<NoteRecord> {
    const current = await this.readNote(input);
    this.assertWritable(input.expectedVersionToken, current.versionToken, input.force);

    const shouldReplaceBody = input.body !== undefined;
    const shouldUpdateSection = input.heading !== undefined && input.headingContent !== undefined;
    const shouldMergeFrontmatter = input.frontmatter !== undefined;

    if (!shouldReplaceBody && !shouldUpdateSection && !shouldMergeFrontmatter) {
      throw new Error('No note updates were provided.');
    }

    let nextBody = shouldReplaceBody ? input.body ?? '' : current.body;

    if (shouldUpdateSection && input.heading) {
      nextBody = upsertSection(nextBody, input.heading, input.headingContent ?? '');
    }

    const nextFrontmatter = shouldMergeFrontmatter
      ? mergeFrontmatter(current.frontmatter, input.frontmatter ?? {})
      : current.frontmatter;

    return this.writeNote(current.relativePath, nextBody, nextFrontmatter);
  }

  async appendToNote(input: AppendNoteInput): Promise<NoteRecord> {
    const existing = await this.tryReadNote(input);

    if (!existing) {
      if (!input.createIfMissing) {
        throw new Error('Note not found. Use createIfMissing to create it during append.');
      }

      const createdTitle = input.title ?? (input.path ? getNoteTitleFromPath(input.path) : undefined);

      if (!createdTitle) {
        throw new Error('A title or path is required to create a missing note during append.');
      }

      const body = input.heading
        ? upsertSection('', input.heading, input.content)
        : appendMarkdownBody('', input.content);

      return this.createNote({
        title: createdTitle,
        path: input.path,
        folder: input.folder,
        body,
        frontmatter: input.frontmatter,
      });
    }

    this.assertWritable(input.expectedVersionToken, existing.versionToken, input.force);

    const nextBody = input.heading
      ? appendToSection(existing.body, input.heading, input.content)
      : appendMarkdownBody(existing.body, input.content);
    const nextFrontmatter = input.frontmatter
      ? mergeFrontmatter(existing.frontmatter, input.frontmatter)
      : existing.frontmatter;

    return this.writeNote(existing.relativePath, nextBody, nextFrontmatter);
  }

  async upsertFrontmatter(input: NoteLookup & {
    frontmatter: Frontmatter;
    expectedVersionToken?: string | undefined;
    force?: boolean | undefined;
  }): Promise<NoteRecord> {
    const current = await this.readNote(input);
    this.assertWritable(input.expectedVersionToken, current.versionToken, input.force);
    const nextFrontmatter = mergeFrontmatter(current.frontmatter, input.frontmatter);
    return this.writeNote(current.relativePath, current.body, nextFrontmatter);
  }

  private prepareFrontmatter(
    frontmatter: Frontmatter,
    title: string,
    tags?: string[],
    aliases?: string[],
  ): Frontmatter {
    let nextFrontmatter = mergeFrontmatter({}, frontmatter);

    if (typeof nextFrontmatter.title !== 'string' || !nextFrontmatter.title.trim()) {
      nextFrontmatter = mergeFrontmatter(nextFrontmatter, { title });
    }

    if (tags && tags.length > 0) {
      nextFrontmatter = mergeFrontmatter(nextFrontmatter, {
        tags: Array.from(new Set([...normalizeTags(nextFrontmatter.tags), ...tags])),
      });
    }

    if (aliases && aliases.length > 0) {
      const existingAliases = Array.isArray(nextFrontmatter.aliases)
        ? nextFrontmatter.aliases.map((value) => String(value))
        : [];
      nextFrontmatter = mergeFrontmatter(nextFrontmatter, {
        aliases: Array.from(new Set([...existingAliases, ...aliases])),
      });
    }

    return nextFrontmatter;
  }

  private assertWritable(
    expectedVersionToken: string | undefined,
    currentVersionToken: string,
    force: boolean | undefined,
  ): void {
    if (force || this.config.allowUnsafeOverwrite) {
      return;
    }

    if (!expectedVersionToken) {
      throw new Error('expectedVersionToken is required for safe note updates.');
    }

    assertVersionTokenMatches(expectedVersionToken, currentVersionToken);
  }

  private async readNoteByPath(relativePath: string): Promise<NoteRecord> {
    const normalizedPath = ensureExtension(
      normalizeRelativeVaultPath(relativePath),
      this.config.noteExtension,
    );
    const absolutePath = resolveVaultPath(this.config.vaultRoot, normalizedPath);
    const [rawContent, fileStats] = await Promise.all([
      readFile(absolutePath, 'utf8'),
      stat(absolutePath),
    ]);
    const { frontmatter, body } = parseMarkdownDocument(rawContent);

    return {
      title:
        typeof frontmatter.title === 'string' && frontmatter.title.trim()
          ? frontmatter.title
          : getNoteTitleFromPath(normalizedPath),
      relativePath: normalizedPath,
      absolutePath,
      content: rawContent.replace(/\r\n/g, '\n'),
      body,
      frontmatter,
      versionToken: buildVersionToken(rawContent, fileStats),
      wikiLink: createWikiLink(normalizedPath),
      markdownLink: createMarkdownLink(normalizedPath),
      modifiedTime: fileStats.mtime.toISOString(),
    };
  }

  private async writeNote(
    relativePath: string,
    body: string,
    frontmatter: Frontmatter,
  ): Promise<NoteRecord> {
    const absolutePath = resolveVaultPath(this.config.vaultRoot, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    const serialized = stringifyMarkdownDocument(frontmatter, body);
    await writeFile(absolutePath, serialized, 'utf8');
    return this.readNoteByPath(relativePath);
  }

  private async resolveExistingNote(input: NoteLookup): Promise<{ relativePath: string }> {
    if (input.path) {
      const relativePath = ensureExtension(
        normalizeRelativeVaultPath(input.path),
        this.config.noteExtension,
      );

      if (!(await this.noteExists(relativePath))) {
        throw new Error(`Note not found: ${relativePath}`);
      }

      return { relativePath };
    }

    if (!input.title) {
      throw new Error('A note path or title is required.');
    }

    const files = await listVaultFilesByExtension(this.config.vaultRoot, this.config.noteExtension, '', {
      excludedPaths: [this.config.semanticIndexFolder],
    });
    const matches = files.filter(
      (filePath) => getNoteTitleFromPath(filePath).toLowerCase() === input.title?.trim().toLowerCase(),
    );

    if (matches.length === 0) {
      throw new Error(`Unable to find a note named \"${input.title}\".`);
    }

    if (matches.length > 1) {
      throw new Error(
        `Multiple notes named \"${input.title}\" were found. Use a path instead: ${matches.join(', ')}`,
      );
    }

    return { relativePath: matches[0] ?? '' };
  }

  private async tryReadNote(input: NoteLookup): Promise<NoteRecord | undefined> {
    try {
      return await this.readNote(input);
    } catch {
      return undefined;
    }
  }
}
