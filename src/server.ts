import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

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

const config = loadConfig();
const vaultService = new VaultService(config);
const searchService = new SearchService(config);
const templateService = new TemplateService(config);
const attachmentService = new AttachmentService(config);
const embeddingsProvider = new OpenAIEmbeddingsProvider(config);
const semanticRetrievalService = new SemanticRetrievalService(config, embeddingsProvider);

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

const dependencies = {
  config,
  vault: vaultService,
  search: searchService,
  semantic: semanticRetrievalService,
  templates: templateService,
  attachments: attachmentService,
};

registerNoteTools(server, dependencies);
registerSearchTools(server, dependencies);
registerSemanticTools(server, dependencies);
registerMetadataTools(server, dependencies);
registerJournalTools(server, dependencies);
registerTemplateTools(server, dependencies);
registerAttachmentTools(server, dependencies);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
