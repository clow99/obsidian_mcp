import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';
import { createAttachmentMarkdownLink, createAttachmentWikiEmbed } from '../lib/links.js';
import {
  normalizeFolderPath,
  normalizeRelativeVaultPath,
  resolveVaultPath,
  sanitizeAttachmentFileName,
} from '../lib/paths.js';

export type CreateAttachmentInput = {
  filename: string;
  dataBase64: string;
  folder?: string | undefined;
  notePath?: string | undefined;
};

export type AttachmentReference = {
  relativePath: string;
  wikiEmbed: string;
  markdownLink: string;
};

export class AttachmentService {
  constructor(private readonly config: AppConfig) {}

  async createAttachmentReference(input: CreateAttachmentInput): Promise<AttachmentReference> {
    const filename = sanitizeAttachmentFileName(input.filename);
    const derivedFolder = input.notePath
      ? path.posix.dirname(normalizeRelativeVaultPath(input.notePath))
      : undefined;
    const configuredFolder = normalizeFolderPath(input.folder ?? this.config.attachmentsFolder);
    const relativeFolder = derivedFolder && derivedFolder !== '.'
      ? path.posix.join(configuredFolder ?? '', derivedFolder)
      : configuredFolder;
    const relativePath = relativeFolder ? path.posix.join(relativeFolder, filename) : filename;
    const absolutePath = resolveVaultPath(this.config.vaultRoot, relativePath);

    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, decodeBase64Payload(input.dataBase64));

    return {
      relativePath,
      wikiEmbed: createAttachmentWikiEmbed(relativePath),
      markdownLink: createAttachmentMarkdownLink(relativePath),
    };
  }
}

function decodeBase64Payload(payload: string): Buffer {
  const normalized = payload.includes('base64,')
    ? payload.slice(payload.indexOf('base64,') + 'base64,'.length)
    : payload;
  return Buffer.from(normalized, 'base64');
}
