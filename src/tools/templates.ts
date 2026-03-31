import { mergeFrontmatter } from '../lib/markdown.js';

import {
  buildTemplateVariables,
  createErrorResult,
  createNoteFromTemplateInputSchema,
  createSuccessResult,
  type McpToolServer,
  type ToolDependencies,
} from './types.js';

export function registerTemplateTools(server: McpToolServer, dependencies: ToolDependencies): void {
  server.registerTool(
    'create_note_from_template',
    {
      description: 'Create a new note from an Obsidian template and merge additional fields.',
      inputSchema: createNoteFromTemplateInputSchema,
    },
    async (input) => {
      try {
        const renderedTemplate = await dependencies.templates.renderTemplate(
          input.template,
          buildTemplateVariables(input.title, input.path),
        );
        const body = [renderedTemplate.body.trim(), input.body.trim()].filter(Boolean).join('\n\n');
        const frontmatter = mergeFrontmatter(renderedTemplate.frontmatter, input.frontmatter ?? {});
        const note = await dependencies.vault.createNote({
          title: input.title,
          path: input.path,
          folder: input.folder,
          body,
          frontmatter,
          tags: input.tags,
          aliases: input.aliases,
        });

        return createSuccessResult('Template note created.', note);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );
}
