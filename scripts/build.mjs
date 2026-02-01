import path from 'path';
import * as esbuild from 'esbuild';
import { writeThirdPartyNotices } from '@rnx-kit/third-party-notices';

const watch = false;
const minify = true;
const sourcemap = true;

const outFile = path.resolve('out/extension.cjs');
const outDir = path.dirname(outFile);
const sourceMapFile = `${outFile}.map`;
const noticesFile = path.join(outDir, 'THIRD_PARTY_NOTICES.txt');

/** @returns {esbuild.Plugin} */
function thirdPartyNoticesPlugin() {
  return {
    name: 'third-party-notices',
    setup(build) {
      build.onEnd(async () => {
        if (!sourcemap) {
          return;
        }
        await writeThirdPartyNotices({
          rootPath: outDir,
          sourceMapFile,
          outputFile: noticesFile
        });
      });
    }
  };
}

/** @type {esbuild.BuildOptions} */
const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: outFile,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  minify,
  sourcemap,
  plugins: [thirdPartyNoticesPlugin()]
};

if (watch) {
  const context = await esbuild.context(buildOptions);
  await context.watch();
} else {
  await esbuild.build(buildOptions);
}
