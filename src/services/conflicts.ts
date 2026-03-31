import { createHash } from 'node:crypto';
import type { Stats } from 'node:fs';

export type VersionTokenParts = {
  hash: string;
  mtimeMs: number;
  size: number;
};

export function buildVersionToken(content: string, stats: Stats): string {
  const parts: VersionTokenParts = {
    hash: createHash('sha256').update(content).digest('hex'),
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };

  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

export function parseVersionToken(token: string): VersionTokenParts {
  const raw = Buffer.from(token, 'base64url').toString('utf8');
  return JSON.parse(raw) as VersionTokenParts;
}

export function assertVersionTokenMatches(expected: string, current: string): void {
  if (expected !== current) {
    throw new Error('Version conflict detected. Read the note again before retrying the update.');
  }
}
