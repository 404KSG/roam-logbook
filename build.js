import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const argumentValue = name => {
    const inline = process.argv.find(argument => argument.startsWith(`${name}=`));
    if (inline) return inline.slice(name.length + 1);
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
};

const outfile = argumentValue('--outfile') || process.env.RLB_BUILD_OUTFILE || 'extension.js';

const config = {
    entryPoints: ['src/extension.js'],
    bundle: true,
    outfile,
    format: 'esm',
    target: 'es2020',
};

if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('Watching for changes...');
} else {
    await esbuild.build(config);
    console.log('Build complete');
}
