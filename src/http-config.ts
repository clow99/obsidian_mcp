export type HttpServerConfig = {
  host: string;
  port: number;
};

export function loadHttpServerConfig(env: NodeJS.ProcessEnv = process.env): HttpServerConfig {
  const host = parseHost(env.MCP_HTTP_HOST);
  const port = parsePort(env.MCP_HTTP_PORT);

  return {
    host,
    port,
  };
}

function parseHost(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '127.0.0.1';
}

function parsePort(value: string | undefined): number {
  if (value === undefined || !value.trim()) {
    return 3000;
  }

  const parsed = Number.parseInt(value.trim(), 10);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid MCP_HTTP_PORT value: ${value}`);
  }

  return parsed;
}
