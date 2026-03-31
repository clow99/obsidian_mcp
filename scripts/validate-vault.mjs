import { access, constants, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? '/vault';

async function main() {
  const resolved = path.resolve(vaultPath);
  await access(resolved, constants.R_OK | constants.W_OK);
  const info = await stat(resolved);

  if (!info.isDirectory()) {
    throw new Error(`Vault path is not a directory: ${resolved}`);
  }

  process.stdout.write(JSON.stringify({ vaultPath: resolved, ok: true }, null, 2));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
