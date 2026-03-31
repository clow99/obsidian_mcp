import path from 'node:path';

import { mergeFrontmatter } from '../lib/markdown.js';
import { normalizeRelativeVaultPath } from '../lib/paths.js';

import {
  appendDailyNoteInputSchema,
  buildTemplateVariables,
  createErrorResult,
  createSuccessResult,
  type McpToolServer,
  type ToolDependencies,
} from './types.js';

export function registerJournalTools(server: McpToolServer, dependencies: ToolDependencies): void {
  server.registerTool(
    'append_daily_note',
    {
      description: 'Append content to a daily note, creating it from a template if needed.',
      inputSchema: appendDailyNoteInputSchema,
    },
    async (input) => {
      try {
        const date = input.date ?? getCurrentDate();
        const dailyFolder = normalizeRelativeVaultPath(dependencies.config.dailyNotesFolder);
        const notePath = path.posix.join(dailyFolder, `${date}${dependencies.config.noteExtension}`);
        const exists = await dependencies.vault.noteExists(notePath);

        if (!exists) {
          let initialBody = '';
          let initialFrontmatter = input.frontmatter ?? {};

          if (input.template) {
            const renderedTemplate = await dependencies.templates.renderTemplate(
              input.template,
              buildTemplateVariables(date, notePath),
            );
            initialBody = renderedTemplate.body;
            initialFrontmatter = mergeFrontmatter(renderedTemplate.frontmatter, initialFrontmatter);
          }

          await dependencies.vault.createNote({
            title: date,
            path: notePath,
            body: initialBody,
            frontmatter: initialFrontmatter,
          });
        }

        const note = await dependencies.vault.appendToNote({
          path: notePath,
          content: input.content,
          heading: input.heading,
          frontmatter: exists ? input.frontmatter : undefined,
          expectedVersionToken: exists ? input.expectedVersionToken : undefined,
          force: input.force,
        });

        return createSuccessResult('Daily note updated.', note);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );
}

function getCurrentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
