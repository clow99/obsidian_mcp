import {
  createErrorResult,
  createSuccessResult,
  type McpToolServer,
  type ToolDependencies,
  upsertFrontmatterInputSchema,
} from './types.js';

export function registerMetadataTools(server: McpToolServer, dependencies: ToolDependencies): void {
  server.registerTool(
    'upsert_frontmatter',
    {
      description: 'Safely merge frontmatter, tags, aliases, and metadata into an existing note.',
      inputSchema: upsertFrontmatterInputSchema,
    },
    async (input) => {
      try {
        const note = await dependencies.vault.upsertFrontmatter(input);
        return createSuccessResult('Frontmatter updated.', note);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );
}
