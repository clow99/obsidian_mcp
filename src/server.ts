import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createObsidianMcpServer, createToolDependencies } from './app.js';

async function main(): Promise<void> {
  const server = createObsidianMcpServer(createToolDependencies());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
