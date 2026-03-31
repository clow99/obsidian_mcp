import {
  createErrorResult,
  createSuccessResult,
  searchNotesInputSchema,
  type McpToolServer,
  type ToolDependencies,
} from './types.js';

export function registerSearchTools(server: McpToolServer, dependencies: ToolDependencies): void {
  server.registerTool(
    'search_notes',
    {
      description: 'Search vault notes by text, title, folder, or tag.',
      inputSchema: searchNotesInputSchema,
    },
    async (input) => {
      try {
        const results = await dependencies.search.searchNotes(input);
        return createSuccessResult('Search complete.', {
          count: results.length,
          results,
        });
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );
}
