import {
  createAttachmentReferenceInputSchema,
  createErrorResult,
  createSuccessResult,
  type McpToolServer,
  type ToolDependencies,
} from './types.js';

export function registerAttachmentTools(server: McpToolServer, dependencies: ToolDependencies): void {
  server.registerTool(
    'create_attachment_reference',
    {
      description: 'Store an attachment inside the vault and return Obsidian-friendly links.',
      inputSchema: createAttachmentReferenceInputSchema,
    },
    async (input) => {
      try {
        const attachment = await dependencies.attachments.createAttachmentReference(input);
        return createSuccessResult('Attachment stored.', attachment);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  );
}
