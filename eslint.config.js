import globals from 'globals';

/**
 * The point of this config is `no-undef`.
 *
 * The unit tests only cover the pure layers (time math, org parsing, stats), so
 * a typo inside a Roam-facing code path is invisible to them — it only shows up
 * as a runtime ReferenceError in the app. Static analysis catches exactly that.
 */
export default [
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.browser },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
            'no-redeclare': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
        },
    },
    {
        files: ['test/**/*.js', 'build.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: { ...globals.node, ...globals.browser },
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['error', { args: 'none' }],
        },
    },
];
