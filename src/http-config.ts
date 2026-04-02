export type HttpServerConfig = {
  host: string;
  port: number;
  allowedHosts?: string[];
};

export function loadHttpServerConfig(env: NodeJS.ProcessEnv = process.env): HttpServerConfig {
  const host = parseHost(env.MCP_HTTP_HOST);
  const port = parsePort(env.MCP_HTTP_PORT);
  const allowedHosts = parseAllowedHosts(env.MCP_HTTP_ALLOWED_HOSTS, host);

  const config: HttpServerConfig = {
    host,
    port,
  };

  if (allowedHosts) {
    config.allowedHosts = allowedHosts;
  }

  return config;
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

function parseAllowedHosts(value: string | undefined, host: string): string[] | undefined {
  const trimmed = value?.trim();

  if (trimmed) {
    const hosts = trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    return hosts.length > 0 ? [...new Set(hosts)] : undefined;
  }

  if (host !== '0.0.0.0' && host !== '::') {
    return undefined;
  }

  return ['localhost', '127.0.0.1', 'host.docker.internal', 'obsidian-mcp', '[::1]'];
}
