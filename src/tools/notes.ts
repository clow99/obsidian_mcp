import { mergeFrontmatter } from '../lib/markdown.js';

import {
  buildTemplateVariables,
  createErrorResult,
  createNoteInputSchema,
  createSuccessResult,
  type McpToolServer,
  readNoteInputSchema,
  type ToolDependencies,
  updateNoteInputSchema,
  appendToNoteInputSchema,
} from './types.js';

export function registerNoteTools(server: McpToolServer, dependencies: ToolDependencies): void {
  server.registerTool(
    'create_note',
    {
      description: 'Create an Obsidian-friendly Markdown note with optional template support.',
      inputSchema: createNoteInputSchema,
    },
    async (input) => {
      try {
        let body = input.body ?? '';
        let frontmatter = input.frontmatter ?? {};

        if (input.template) {
          const renderedTemplate = await dependencies.templates.renderTemplate(
            input.template,
            buildTemplateVariables(input.title, input.path),
          );
          body = [renderedTemplate.body.trim(), body.trim()].filter(Boolean).join('\n\n');
          frontmatter = mergeFrontmatter(renderedTemplate.frontmatter, frontmatter);
        }

        const note = await dependencies.vault.createNote({
          title: input.title,
          path: input.path,
          folder: input.folder,
          body,
          frontmatter,
          tags: input.tags,
          aliases: input.aliases,
        });

        return createSuccessResult('Note created.', note);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );

  server.registerTool(
    'read_note',
    {
      description: 'Read a note by path or exact title and return its current version token.',
      inputSchema: readNoteInputSchema,
    },
    async (input) => {
      try {
        const note = await dependencies.vault.readNote(input);
        return createSuccessResult('Note loaded.', note);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );

  server.registerTool(
    'update_note',
    {
      description: 'Safely replace note content, merge frontmatter, or update a specific heading.',
      inputSchema: updateNoteInputSchema,
    },
    async (input) => {
      try {
        const note = await dependencies.vault.updateNote(input);
        return createSuccessResult('Note updated.', note);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );

  server.registerTool(
    'append_to_note',
    {
      description: 'Append content to a note or to a named section without rewriting the full file.',
      inputSchema: appendToNoteInputSchema,
    },
    async (input) => {
      try {
        const note = await dependencies.vault.appendToNote(input);
        return createSuccessResult('Content appended.', note);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );
}
