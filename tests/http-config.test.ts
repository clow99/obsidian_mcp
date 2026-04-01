import { describe, expect, it } from 'vitest';

import { loadHttpServerConfig } from '../src/http-config.js';

describe('http server config', () => {
  it('uses localhost defaults when HTTP settings are omitted', () => {
    expect(loadHttpServerConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3000,
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
    });
  });

  it('rejects invalid ports', () => {
    expect(() => loadHttpServerConfig({ MCP_HTTP_PORT: '70000' })).toThrow(/invalid mcp_http_port/i);
  });
});
