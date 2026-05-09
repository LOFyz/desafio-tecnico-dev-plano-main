const { composePlugins, withNx } = require('@nx/rspack');

module.exports = composePlugins(withNx(), (config) => {
  config.module ??= {};
  config.module.rules ??= [];

  // @nx/rspack extensionAlias maps .js → .ts, so rspack finds @josephg/resolvable/index.ts
  // (which ships as a raw TypeScript file). Transpile it as CJS and mark javascript/auto
  // to prevent the ESM/CJS runtime conflict when bundled.
  config.module.rules.unshift({
    test: /index\.ts$/,
    include: /\/@josephg\/resolvable\//,
    type: 'javascript/auto',
    use: [
      {
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript' },
            target: 'es2021',
          },
          module: { type: 'commonjs', strict: false },
        },
      },
    ],
  });

  return config;
});
