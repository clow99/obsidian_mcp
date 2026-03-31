import { createHash } from 'node:crypto';

import { type Frontmatter, normalizeTags } from './markdown.js';

export type MarkdownChunk = {
  id: string;
  notePath: string;
  noteTitle: string;
  heading: string | null;
  headingPath: string[];
  tags: string[];
  modifiedTime: string;
  order: number;
  text: string;
};

export type ChunkMarkdownDocumentInput = {
  notePath: string;
  noteTitle: string;
  body: string;
  frontmatter: Frontmatter;
  modifiedTime: string;
  chunkSize: number;
  chunkOverlap: number;
};

type Section = {
  headingPath: string[];
  text: string;
};

export function chunkMarkdownDocument(input: ChunkMarkdownDocumentInput): MarkdownChunk[] {
  const sections = splitMarkdownIntoSections(input.body);
  const tags = normalizeTags(input.frontmatter.tags);
  const chunks: MarkdownChunk[] = [];
  let order = 0;

  for (const section of sections) {
    const sectionText = buildSectionText(section.headingPath, section.text);

    for (const text of splitTextIntoChunks(sectionText, input.chunkSize, input.chunkOverlap)) {
      chunks.push({
        id: createStableChunkId(input.notePath, section.headingPath, order, text),
        notePath: input.notePath,
        noteTitle: input.noteTitle,
        heading: section.headingPath.at(-1) ?? null,
        headingPath: [...section.headingPath],
        tags,
        modifiedTime: input.modifiedTime,
        order,
        text,
      });
      order += 1;
    }
  }

  return chunks;
}

function splitMarkdownIntoSections(markdownBody: string): Section[] {
  const normalizedBody = markdownBody.replace(/\r\n/g, '\n').trim();

  if (!normalizedBody) {
    return [];
  }

  const lines = normalizedBody.split('\n');
  const sections: Section[] = [];
  let activeHeadingPath: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const text = buffer.join('\n').trim();

    if (!text) {
      buffer = [];
      return;
    }

    sections.push({
      headingPath: [...activeHeadingPath],
      text,
    });
    buffer = [];
  };

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

    if (!headingMatch) {
      buffer.push(line);
      continue;
    }

    flush();

    const headingLevel = (headingMatch[1] ?? '#').length;
    const headingText = headingMatch[2]?.trim() ?? '';
    const nextHeadingPath = activeHeadingPath.slice(0, headingLevel - 1);
    nextHeadingPath[headingLevel - 1] = headingText;
    activeHeadingPath = nextHeadingPath.filter(Boolean);
  }

  flush();

  return sections.length > 0 ? sections : [{ headingPath: [], text: normalizedBody }];
}

function buildSectionText(headingPath: string[], sectionText: string): string {
  if (headingPath.length === 0) {
    return sectionText.trim();
  }

  return [`Heading: ${headingPath.join(' > ')}`, sectionText.trim()]
    .filter(Boolean)
    .join('\n\n');
}

function splitTextIntoChunks(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const normalizedText = text.trim();

  if (!normalizedText) {
    return [];
  }

  if (normalizedText.length <= chunkSize) {
    return [normalizedText];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    let end = Math.min(normalizedText.length, start + chunkSize);

    if (end < normalizedText.length) {
      const paragraphBreak = normalizedText.lastIndexOf('\n\n', end);
      const lineBreak = normalizedText.lastIndexOf('\n', end);
      const sentenceBreak = normalizedText.lastIndexOf('. ', end);
      const breakpoints = [paragraphBreak, lineBreak, sentenceBreak].filter(
        (candidate) => candidate > start + Math.floor(chunkSize * 0.5),
      );

      if (breakpoints.length > 0) {
        end = Math.max(...breakpoints);
      }
    }

    const nextChunk = normalizedText.slice(start, end).trim();

    if (nextChunk) {
      chunks.push(nextChunk);
    }

    if (end >= normalizedText.length) {
      break;
    }

    start = Math.max(end - chunkOverlap, start + 1);
  }

  return deduplicateAdjacentChunks(chunks);
}

function deduplicateAdjacentChunks(chunks: string[]): string[] {
  return chunks.filter((chunk, index) => index === 0 || chunk !== chunks[index - 1]);
}

function createStableChunkId(
  notePath: string,
  headingPath: string[],
  order: number,
  text: string,
): string {
  return createHash('sha256')
    .update(notePath)
    .update('\u0000')
    .update(headingPath.join(' > '))
    .update('\u0000')
    .update(String(order))
    .update('\u0000')
    .update(text)
    .digest('hex')
    .slice(0, 24);
}
