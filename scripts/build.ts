/**
 * Compiles leaffocus into a standalone executable (no Bun/Node needed to run it; the `claude` CLI still is).
 *
 * Usage: `bun scripts/build.ts [target]`, e.g. `bun-linux-x64`, `bun-darwin-arm64`, `bun-windows-x64`.
 * Omit `target` to build for the current machine. Output: `dist/leaffocus-<target>[.exe]` or `dist/leaffocus`.
 */
import type { BunPlugin, Build } from 'bun';

const target = process.argv[2] as Build.CompileTarget | undefined;
const outfile = `dist/leaffocus${target ? `-${target.replace(/^bun-/, '')}` : ''}${target?.includes('windows') ? '.exe' : ''}`;

/**
 * Ink loads `react-devtools-core` only when `DEV=true` and it is installed; it is not a dependency here,
 * but the bundler still tries to resolve it. Replace it with an empty module.
 */
const stubDevtools: BunPlugin = {
  name: 'stub-react-devtools-core',
  setup(build) {
    build.onResolve({ filter: /^react-devtools-core$/ }, () => ({ path: 'react-devtools-core', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {};', loader: 'js' }));
  },
};

const result = await Bun.build({
  entrypoints: ['index.tsx'],
  compile: target ? { target, outfile } : { outfile },
  minify: true,
  plugins: [stubDevtools],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
console.log(`Built ${outfile}`);
