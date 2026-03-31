import { getLinkTargetFromPath, getNoteTitleFromPath, normalizeRelativeVaultPath } from './paths.js';

export function createWikiLink(notePath: string, alias?: string): string {
  const target = getLinkTargetFromPath(notePath);
  return alias ? `[[${target}|${alias}]]` : `[[${target}]]`;
}

export function createMarkdownLink(notePath: string, label?: string): string {
  const relativePath = normalizeRelativeVaultPath(notePath);
  const nextLabel = label ?? getNoteTitleFromPath(notePath);
  return `[${nextLabel}](${relativePath.replace(/ /g, '%20')})`;
}

export function createAttachmentWikiEmbed(filePath: string, alias?: string): string {
  const target = normalizeRelativeVaultPath(filePath);
  return alias ? `![[${target}|${alias}]]` : `![[${target}]]`;
}

export function createAttachmentMarkdownLink(filePath: string, label?: string): string {
  const relativePath = normalizeRelativeVaultPath(filePath);
  const nextLabel = label ?? relativePath.split('/').at(-1) ?? relativePath;
  return `[${nextLabel}](${relativePath.replace(/ /g, '%20')})`;
}
