import { cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const appName = path.basename(appDir);
const standaloneAppsDir = path.join(appDir, '.next/standalone/apps');
const standaloneAppDirs = [
  path.join(standaloneAppsDir, appName),
  path.join(standaloneAppsDir, 'jumper'),
];

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

for (const standaloneAppDir of standaloneAppDirs) {
  await ensureCopy(
    path.join(appDir, '.next/static'),
    path.join(standaloneAppDir, '.next/static'),
  );

  await ensureCopy(
    path.join(appDir, 'public'),
    path.join(standaloneAppDir, 'public'),
  );
}
