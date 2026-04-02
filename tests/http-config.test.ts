import { describe, expect, it } from 'vitest';

import { loadHttpServerConfig } from '../src/http-config.js';

describe('http server config', () => {
  it('uses localhost defaults when HTTP settings are omitted', () => {
    expect(loadHttpServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3000,
      allowedHosts: undefined,
    });
  });

  it('accepts explicit host and port overrides', () => {
    expect(
      loadHttpServerConfig({
        MCP_HTTP_HOST: 'localhost',
        MCP_HTTP_PORT: '4321',
      }),
    ).toEqual({
      host: 'localhost',
      port: 4321,
      allowedHosts: undefined,
    });
  });

  it('allows Docker host access by default when binding all interfaces', () => {
    expect(
      loadHttpServerConfig({
        MCP_HTTP_HOST: '0.0.0.0',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['localhost', '127.0.0.1', 'host.docker.internal', 'obsidian-mcp', '[::1]'],
    });
  });

  it('accepts explicit allowed host overrides', () => {
    expect(
      loadHttpServerConfig({
        MCP_HTTP_HOST: '0.0.0.0',
        MCP_HTTP_ALLOWED_HOSTS: 'localhost, host.docker.internal, obsidian-mcp, localhost',
      }),
    ).toEqual({
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['localhost', 'host.docker.internal', 'obsidian-mcp'],
    });
  });

  it('rejects invalid ports', () => {
    expect(() => loadHttpServerConfig({ MCP_HTTP_PORT: '70000' })).toThrow(/invalid mcp_http_port/i);
  });
});
