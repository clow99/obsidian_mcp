import { describe, expect, it } from 'vitest';

import { chunkMarkdownDocument } from '../src/lib/chunking.js';

describe('chunking', () => {
  it('creates stable heading-aware chunks', () => {
    const input = {
      notePath: 'Inbox/Project Plan.md',
      noteTitle: 'Project Plan',
      body: [
        '## Overview',
        '',
        'This note explains the overall project plan and intended milestones.',
        '',
        '## Tasks',
        '',
        '- define the first milestone',
        '- ship the first prototype',
      ].join('\n'),
      frontmatter: {
        tags: ['project'],
      },
      modifiedTime: '2026-03-30T00:00:00.000Z',
      chunkSize: 300,
      chunkOverlap: 50,
    };

    const firstPass = chunkMarkdownDocument(input);
    const secondPass = chunkMarkdownDocument(input);

    expect(firstPass).toHaveLength(2);
    expect(firstPass.map((chunk) => chunk.heading)).toEqual(['Overview', 'Tasks']);
    expect(firstPass.map((chunk) => chunk.id)).toEqual(secondPass.map((chunk) => chunk.id));
    expect(firstPass[0]?.text).toContain('Heading: Overview');
  });
});
