import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AppConfig } from '../config.js';
import { type Frontmatter, parseMarkdownDocument } from '../lib/markdown.js';
import { ensureExtension, normalizeRelativeVaultPath, resolveVaultPath } from '../lib/paths.js';

export type TemplateRenderResult = {
  templatePath: string;
  body: string;
  frontmatter: Frontmatter;
};

export class TemplateService {
  constructor(private readonly config: AppConfig) {}

  async renderTemplate(
    templateName: string,
    variables: Record<string, string>,
  ): Promise<TemplateRenderResult> {
    const templatePath = this.resolveTemplatePath(templateName);
    const absolutePath = resolveVaultPath(this.config.vaultRoot, templatePath);
    const rawTemplate = await readFile(absolutePath, 'utf8');
    const parsed = parseMarkdownDocument(rawTemplate);

    return {
      templatePath,
      body: replaceTemplateTokens(parsed.body, variables),
      frontmatter: replaceFrontmatterTokens(parsed.frontmatter, variables),
    };
  }

  private resolveTemplatePath(templateName: string): string {
    const normalizedTemplateName = ensureExtension(
      normalizeRelativeVaultPath(templateName),
      this.config.noteExtension,
    );
    const templateFolder = normalizeRelativeVaultPath(this.config.templateFolder);
    return path.posix.join(templateFolder, normalizedTemplateName);
  }
}

function replaceTemplateTokens(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => variables[key] ?? '');
}

function replaceFrontmatterTokens(value: Frontmatter, variables: Record<string, string>): Frontmatter {
  const entries = Object.entries(value).map(([key, item]) => [key, replaceUnknownTokens(item, variables)]);
  return Object.fromEntries(entries);
}

function replaceUnknownTokens(value: unknown, variables: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return replaceTemplateTokens(value, variables);
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceUnknownTokens(item, variables));
  }

  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceUnknownTokens(item, variables)]),
    );
  }

  return value;
}
