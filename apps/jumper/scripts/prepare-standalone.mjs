import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');

const ensureCopy = async (source, destination) => {
  try {
    const sourceStat = await stat(source);
    if (!sourceStat.isDirectory()) {
      return;
    }
  } catch {
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { force: true, recursive: true });
};

await ensureCopy(
  path.join(appDir, '.next/static'),
  path.join(appDir, '.next/standalone/apps/jumper/.next/static'),
);

await ensureCopy(
  path.join(appDir, 'public'),
  path.join(appDir, '.next/standalone/apps/jumper/public'),
);
