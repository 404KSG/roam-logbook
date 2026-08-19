import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const argumentValue = name => {
    const inline = process.argv.find(argument => argument.startsWith(`${name}=`));
    if (inline) {
        const value = inline.slice(name.length + 1);
        if (!value) throw new Error(`${name} requires a value`);
        return value;
    }
    const index = process.argv.indexOf(name);
    if (index < 0) return null;
    const value = process.argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
    return value;
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
