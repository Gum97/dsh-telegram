/**
 * Build the browser bundle when installing from a git checkout.
 *
 * Three install shapes reach this script, and only one of them should build:
 *
 * - **From git** (`pnpm add github:owner/repo`) — the checkout has sources but
 *   no `lib/client.js`, because that artifact is gitignored. npm runs `prepare`
 *   for git installs, which is the only hook that fires here, so this is where
 *   the bundle has to be produced. Without it the Host half installs fine and
 *   the settings card silently never appears — the worst kind of failure,
 *   because nothing reports it.
 * - **From a published tarball** — the bundle is already inside, and tsdown is
 *   a devDependency the consumer never installed. Building is impossible and
 *   unnecessary.
 * - **From a local clone during development** — `npm install` runs `prepare`,
 *   and building is exactly what is wanted.
 *
 * So: build only when the build input exists and the toolchain resolves, and
 * exit 0 otherwise. A `prepare` that fails aborts the consumer's install, so
 * this script must never turn a missing optional step into a hard error — but
 * it must also not hide a genuine build failure, which is why a tsdown that
 * exists and then fails propagates its exit code.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

/** No build input: this is a published tarball, which already ships the bundle. */
if (!existsSync(path.join(root, 'tsdown.client.ts'))) process.exit(0);

/** No toolchain: a consumer installed without devDependencies. */
try {
  require.resolve('tsdown/package.json', { paths: [root] });
} catch {
  if (!existsSync(path.join(root, 'lib', 'client.js'))) {
    console.warn(
      '[dsh-telegram] tsdown is unavailable, so the settings card was not built. ' +
        'Run `npm install && npm run build:client` in this checkout to add it.',
    );
  }
  process.exit(0);
}

const result = spawnSync('npm', ['run', 'build:client'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
