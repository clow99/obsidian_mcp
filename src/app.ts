import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { loadConfig } from './config.js';
import { OpenAIEmbeddingsProvider } from './lib/embeddings.js';
import { AttachmentService } from './services/attachments.js';
import { SearchService } from './services/search.js';
import { SemanticRetrievalService } from './services/semantic-retrieval.js';
import { TemplateService } from './services/templates.js';
import { VaultService } from './services/vault.js';
import { registerAttachmentTools } from './tools/attachments.js';
import { registerJournalTools } from './tools/journal.js';
import { registerMetadataTools } from './tools/metadata.js';
import { registerNoteTools } from './tools/notes.js';
import { registerSearchTools } from './tools/search.js';
import { registerSemanticTools } from './tools/semantic.js';
import { registerTemplateTools } from './tools/templates.js';
import type { ToolDependencies } from './tools/types.js';

export function createToolDependencies(): ToolDependencies {
  const config = loadConfig();
  const vault = new VaultService(config);
  const search = new SearchService(config);
  const templates = new TemplateService(config);
  const attachments = new AttachmentService(config);
  const embeddingsProvider = new OpenAIEmbeddingsProvider(config);
  const semantic = new SemanticRetrievalService(config, embeddingsProvider);

  return {
    config,
    vault,
    search,
    semantic,
    templates,
    attachments,
  };
}

export function createObsidianMcpServer(dependencies: ToolDependencies): McpServer {
  const server = new McpServer(
    {
      name: 'obsidian-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        logging: {},
      },
      instructions:
        'Use read_note before update_note or upsert_frontmatter so you can pass expectedVersionToken for safe writes.',
    },
  );

  registerNoteTools(server, dependencies);
  registerSearchTools(server, dependencies);
  registerSemanticTools(server, dependencies);
  registerMetadataTools(server, dependencies);
  registerJournalTools(server, dependencies);
  registerTemplateTools(server, dependencies);
  registerAttachmentTools(server, dependencies);

  return server;
}
