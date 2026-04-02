import { randomUUID } from 'node:crypto';
import { type IncomingHttpHeaders, type IncomingMessage, Server, type ServerResponse } from 'node:http';

import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';

import { createObsidianMcpServer, createToolDependencies } from './app.js';
import { loadHttpServerConfig } from './http-config.js';

async function main(): Promise<void> {
  const dependencies = createToolDependencies();
  const httpConfig = loadHttpServerConfig();
  const expressOptions: Parameters<typeof createMcpExpressApp>[0] = {
    host: httpConfig.host,
  };

  if (httpConfig.allowedHosts) {
    expressOptions.allowedHosts = httpConfig.allowedHosts;
  }

  const app = createMcpExpressApp(expressOptions) as HttpApp;
  const transports = new Map<string, StreamableHTTPServerTransport>();

  app.post('/mcp', async (req: HttpRequest, res: HttpResponse) => {
    try {
      const sessionId = getSessionId(req.headers['mcp-session-id']);

      if (sessionId) {
        const transport = transports.get(sessionId);

        if (!transport) {
          res.status(404).json(createJsonRpcError('Session not found.'));
          return;
        }

        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!isInitializeRequest(req.body)) {
        res.status(400).json(createJsonRpcError('Expected an initialize request or valid session ID.'));
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (initializedSessionId) => {
          transports.set(initializedSessionId, transport);
        },
      });

      transport.onclose = () => {
        const activeSessionId = transport.sessionId;

        if (activeSessionId) {
          transports.delete(activeSessionId);
        }
      };

      const server = createObsidianMcpServer(dependencies);
      await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      process.stderr.write(
        `Error handling MCP POST request: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );

      if (!res.headersSent) {
        res.status(500).json(createJsonRpcError('Internal server error.'));
      }
    }
  });

  app.get('/mcp', async (req: HttpRequest, res: HttpResponse) => {
    try {
      const sessionId = getRequiredSessionId(req.headers['mcp-session-id']);

      if (!sessionId) {
        res.status(400).send('Missing MCP session ID.');
        return;
      }

      const transport = transports.get(sessionId);

      if (!transport) {
        res.status(404).send('Session not found.');
        return;
      }

      await transport.handleRequest(req, res);
    } catch (error) {
      process.stderr.write(
        `Error handling MCP GET request: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );

      if (!res.headersSent) {
        res.status(500).send('Internal server error.');
      }
    }
  });

  app.delete('/mcp', async (req: HttpRequest, res: HttpResponse) => {
    try {
      const sessionId = getRequiredSessionId(req.headers['mcp-session-id']);

      if (!sessionId) {
        res.status(400).send('Missing MCP session ID.');
        return;
      }

      const transport = transports.get(sessionId);

      if (!transport) {
        res.status(404).send('Session not found.');
        return;
      }

      await transport.handleRequest(req, res);
    } catch (error) {
      process.stderr.write(
        `Error handling MCP DELETE request: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );

      if (!res.headersSent) {
        res.status(500).send('Internal server error.');
      }
    }
  });

  app.get('/health', (_req: HttpRequest, res: HttpResponse) => {
    res.json({
      ok: true,
      transport: 'streamable-http',
    });
  });

  const httpServer = app.listen(httpConfig.port, httpConfig.host, () => {
    process.stdout.write(`Obsidian MCP HTTP server listening at http://${httpConfig.host}:${httpConfig.port}/mcp\n`);
  });

  const shutdown = async (signal: string) => {
    process.stderr.write(`Received ${signal}, shutting down MCP HTTP server.\n`);

    for (const transport of transports.values()) {
      await transport.close().catch(() => undefined);
    }

    transports.clear();

    await new Promise<void>((resolve, reject) => {
      httpServer.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

function createJsonRpcError(message: string) {
  return {
    jsonrpc: '2.0' as const,
    error: {
      code: -32000,
      message,
    },
    id: null,
  };
}

function getRequiredSessionId(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getSessionId(value: string | string[] | undefined): string | undefined {
  return getRequiredSessionId(value);
}

type HttpRequest = IncomingMessage & {
  body?: unknown;
  headers: IncomingHttpHeaders;
};

type HttpResponse = ServerResponse<IncomingMessage> & {
  status(code: number): HttpResponse;
  json(body: unknown): HttpResponse;
  send(body: string): HttpResponse;
};

type HttpHandler = (req: HttpRequest, res: HttpResponse) => Promise<void> | void;

type HttpApp = {
  post(path: string, handler: HttpHandler): void;
  get(path: string, handler: HttpHandler): void;
  delete(path: string, handler: HttpHandler): void;
  listen(port: number, host: string, callback: () => void): Server;
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exit(1);
});
