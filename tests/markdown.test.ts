import { describe, expect, it } from 'vitest';

import { appendToSection, mergeFrontmatter, upsertSection } from '../src/lib/markdown.js';

describe('markdown helpers', () => {
  it('merges arrays uniquely and preserves nested objects', () => {
    const merged = mergeFrontmatter(
      {
        tags: ['project', 'active'],
        metadata: { owner: 'cam' },
      },
      {
        tags: ['active', 'important'],
        metadata: { status: 'draft' },
      },
    );

    expect(merged).toEqual({
      tags: ['project', 'active', 'important'],
      metadata: { owner: 'cam', status: 'draft' },
    });
  });

  it('upserts and appends heading content without rewriting the full note', () => {
    const initial = '# Note\n\n## Tasks\n\n- first\n';
    const updated = upsertSection(initial, 'Tasks', '- replaced');
    const appended = appendToSection(updated, 'Tasks', '- second');

    expect(updated).toContain('## Tasks\n- replaced');
    expect(appended).toContain('- replaced\n\n- second');
  });
});
