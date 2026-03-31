import matter from 'gray-matter';

export type Frontmatter = Record<string, unknown>;

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, '\n');
}

function ensureTrailingNewline(value: string): string {
  const normalized = normalizeLineEndings(value).trimEnd();
  return normalized ? `${normalized}\n` : '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeValues(baseValue: unknown, nextValue: unknown): unknown {
  if (Array.isArray(baseValue) && Array.isArray(nextValue)) {
    return Array.from(new Set([...baseValue, ...nextValue]));
  }

  if (isPlainObject(baseValue) && isPlainObject(nextValue)) {
    return mergeFrontmatter(baseValue, nextValue);
  }

  return nextValue;
}

export function parseMarkdownDocument(content: string): {
  frontmatter: Frontmatter;
  body: string;
} {
  const parsed = matter(normalizeLineEndings(content));

  return {
    frontmatter: { ...parsed.data },
    body: parsed.content,
  };
}

export function stringifyMarkdownDocument(frontmatter: Frontmatter, body: string): string {
  const normalizedBody = ensureTrailingNewline(body);

  if (Object.keys(frontmatter).length === 0) {
    return normalizedBody;
  }

  return normalizeLineEndings(matter.stringify(normalizedBody, frontmatter));
}

export function mergeFrontmatter(
  base: Frontmatter,
  updates: Frontmatter,
): Frontmatter {
  const merged: Frontmatter = { ...base };

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }

    merged[key] = key in merged ? mergeValues(merged[key], value) : value;
  }

  return merged;
}

export function normalizeTags(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function appendMarkdownBody(existingBody: string, contentToAppend: string): string {
  const current = normalizeLineEndings(existingBody).trimEnd();
  const addition = normalizeLineEndings(contentToAppend).trim();

  if (!addition) {
    return ensureTrailingNewline(current);
  }

  if (!current) {
    return ensureTrailingNewline(addition);
  }

  return `${current}\n\n${addition}\n`;
}

type HeadingRange = {
  start: number;
  contentStart: number;
  end: number;
};

function findHeadingRange(body: string, heading: string): HeadingRange | undefined {
  const normalized = normalizeLineEndings(body);
  const headingPattern = new RegExp(`^(#{1,6})\\s+${escapeRegExp(heading)}\\s*$`, 'gim');
  const match = headingPattern.exec(normalized);

  if (!match || match.index === undefined) {
    return undefined;
  }

  const headingLevel = match[1]?.length ?? 1;
  const start = match.index;
  const lineEnd = normalized.indexOf('\n', start);
  const contentStart = lineEnd === -1 ? normalized.length : lineEnd + 1;
  const nextHeadingPattern = new RegExp(`^#{1,${headingLevel}}\\s+.+$`, 'gim');
  nextHeadingPattern.lastIndex = contentStart;
  const nextMatch = nextHeadingPattern.exec(normalized);

  return {
    start,
    contentStart,
    end: nextMatch?.index ?? normalized.length,
  };
}

export function upsertSection(body: string, heading: string, content: string, level = 2): string {
  const normalized = normalizeLineEndings(body);
  const section = findHeadingRange(normalized, heading);
  const nextContent = normalizeLineEndings(content).trim();

  if (!section) {
    const prefix = normalized.trimEnd();
    const separator = prefix ? '\n\n' : '';
    return `${prefix}${separator}${'#'.repeat(level)} ${heading}\n\n${nextContent}\n`;
  }

  const headingLine = normalized.slice(section.start, section.contentStart).replace(/\n?$/, '\n');
  const before = normalized.slice(0, section.start);
  const after = normalized.slice(section.end).replace(/^\n+/, '\n');
  return `${before}${headingLine}${nextContent ? `${nextContent}\n` : ''}${after}`;
}

export function appendToSection(body: string, heading: string, content: string, level = 2): string {
  const normalized = normalizeLineEndings(body);
  const section = findHeadingRange(normalized, heading);

  if (!section) {
    return upsertSection(normalized, heading, content, level);
  }

  const currentSectionBody = normalized.slice(section.contentStart, section.end).trim();
  const merged = currentSectionBody
    ? `${currentSectionBody}\n\n${normalizeLineEndings(content).trim()}`
    : normalizeLineEndings(content).trim();

  return upsertSection(normalized, heading, merged, level);
}
