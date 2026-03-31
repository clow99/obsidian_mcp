import { readdir } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_MARKDOWN_EXTENSION = '.md';

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function normalizeRelativeVaultPath(value: string): string {
  const trimmed = toPosixPath(value).trim();

  if (!trimmed) {
    throw new Error('Vault path cannot be empty.');
  }

  if (path.win32.isAbsolute(trimmed) || path.posix.isAbsolute(trimmed)) {
    throw new Error(`Expected a vault-relative path, received: ${value}`);
  }

  const normalized = path.posix.normalize(trimmed).replace(/^\.\//, '');

  if (!normalized || normalized === '.') {
    throw new Error('Vault path cannot resolve to the vault root.');
  }

  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Path escapes the vault root: ${value}`);
  }

  return normalized;
}

export function normalizeFolderPath(folder?: string): string | undefined {
  if (!folder) {
    return undefined;
  }

  return normalizeRelativeVaultPath(folder);
}

export function sanitizeFileStem(value: string): string {
  const sanitized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  return sanitized || 'Untitled';
}

export function sanitizeAttachmentFileName(filename: string): string {
  const extension = path.posix.extname(filename);
  const stem = path.posix.basename(filename, extension);
  return `${sanitizeFileStem(stem)}${extension}`;
}

export function ensureExtension(filePath: string, extension = DEFAULT_MARKDOWN_EXTENSION): string {
  return filePath.toLowerCase().endsWith(extension.toLowerCase()) ? filePath : `${filePath}${extension}`;
}

export function resolveVaultPath(vaultRoot: string, relativePath: string): string {
  const normalized = normalizeRelativeVaultPath(relativePath);
  const absolutePath = path.resolve(vaultRoot, normalized);
  const relativeToRoot = path.relative(vaultRoot, absolutePath);

  if (
    relativeToRoot === '' ||
    (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot))
  ) {
    return absolutePath;
  }

  throw new Error(`Resolved path escapes vault root: ${relativePath}`);
}

export type NoteLocation = {
  relativePath: string;
  absolutePath: string;
};

export type ResolveNoteLocationInput = {
  vaultRoot: string;
  title?: string | undefined;
  folder?: string | undefined;
  notePath?: string | undefined;
  extension?: string | undefined;
};

export function resolveNoteLocation(input: ResolveNoteLocationInput): NoteLocation {
  const extension = input.extension ?? DEFAULT_MARKDOWN_EXTENSION;
  const relativePath = input.notePath
    ? ensureExtension(normalizeRelativeVaultPath(input.notePath), extension)
    : buildRelativeNotePath(input.title, input.folder, extension);

  return {
    relativePath,
    absolutePath: resolveVaultPath(input.vaultRoot, relativePath),
  };
}

function buildRelativeNotePath(
  title: string | undefined,
  folder: string | undefined,
  extension: string,
): string {
  if (!title) {
    throw new Error('A note title is required when a note path is not provided.');
  }

  const filename = `${sanitizeFileStem(title)}${extension}`;
  const normalizedFolder = normalizeFolderPath(folder);

  return normalizedFolder ? path.posix.join(normalizedFolder, filename) : filename;
}

export function getNoteTitleFromPath(relativePath: string): string {
  const normalized = normalizeRelativeVaultPath(relativePath);
  return path.posix.basename(normalized, path.posix.extname(normalized));
}

export function getLinkTargetFromPath(relativePath: string): string {
  const normalized = normalizeRelativeVaultPath(relativePath);
  const extension = path.posix.extname(normalized);
  return extension ? normalized.slice(0, -extension.length) : normalized;
}

export type ListVaultFilesOptions = {
  excludedPaths?: string[] | undefined;
};

export function isVaultPathExcluded(
  relativePath: string,
  excludedPaths: readonly string[] = [],
): boolean {
  const normalizedPath = normalizeRelativeVaultPath(relativePath);

  return excludedPaths.some((excludedPath) => {
    const normalizedExcludedPath = normalizeRelativeVaultPath(excludedPath);
    return (
      normalizedPath === normalizedExcludedPath ||
      normalizedPath.startsWith(`${normalizedExcludedPath}/`)
    );
  });
}

export async function listVaultFilesByExtension(
  vaultRoot: string,
  extension: string,
  relativeFolder = '',
  options?: ListVaultFilesOptions,
): Promise<string[]> {
  const absoluteFolder = relativeFolder ? resolveVaultPath(vaultRoot, relativeFolder) : vaultRoot;
  const entries = await readdir(absoluteFolder, { withFileTypes: true });
  const files: string[] = [];
  const excludedPaths = options?.excludedPaths ?? [];

  for (const entry of entries) {
    const relativePath = relativeFolder ? path.posix.join(relativeFolder, entry.name) : entry.name;

    if (isVaultPathExcluded(relativePath, excludedPaths)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await listVaultFilesByExtension(vaultRoot, extension, relativePath, options)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(extension.toLowerCase())) {
      files.push(relativePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}
