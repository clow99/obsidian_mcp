import {
  createErrorResult,
  createSuccessResult,
  type McpToolServer,
  reindexNoteInputSchema,
  relevantContextInputSchema,
  semanticSearchInputSchema,
  type ToolDependencies,
} from './types.js';

export function registerSemanticTools(server: McpToolServer, dependencies: ToolDependencies): void {
  server.registerTool(
    'semantic_search_notes',
    {
      description: 'Search indexed note chunks by semantic meaning, with optional folder, title, and tag filters.',
      inputSchema: semanticSearchInputSchema,
    },
    async (input) => {
      try {
        const results = await dependencies.semantic.semanticSearch(input);
        return createSuccessResult('Semantic search complete.', {
          count: results.length,
          results,
        });
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );

  server.registerTool(
    'get_relevant_context',
    {
      description: 'Return the best semantic note chunks to use as context before answering a question.',
      inputSchema: relevantContextInputSchema,
    },
    async (input) => {
      try {
        const context = await dependencies.semantic.getRelevantContext(input);
        return createSuccessResult('Relevant context gathered.', context);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );

  server.registerTool(
    'reindex_vault',
    {
      description: 'Rebuild the semantic index from the current state of the Obsidian vault.',
    },
    async () => {
      try {
        const status = await dependencies.semantic.reindexVault();
        return createSuccessResult('Semantic index rebuilt.', status);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );

  server.registerTool(
    'reindex_note',
    {
      description: 'Refresh one note inside the semantic index after it changes.',
      inputSchema: reindexNoteInputSchema,
    },
    async (input) => {
      try {
        const note = await dependencies.vault.readNote(input);
        const status = await dependencies.semantic.reindexNote(note.relativePath);
        return createSuccessResult('Semantic index refreshed for the note.', {
          notePath: note.relativePath,
          status,
        });
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );

  server.registerTool(
    'semantic_index_status',
    {
      description: 'Report semantic index status, note count, chunk count, and last rebuild time.',
    },
    async () => {
      try {
        const status = await dependencies.semantic.getIndexStatus();
        return createSuccessResult('Semantic index status loaded.', status);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );
}
