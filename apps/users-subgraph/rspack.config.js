const { composePlugins, withNx } = require('@nx/rspack');

module.exports = composePlugins(withNx(), (config) => {
  // `pg` lazily requires the optional native binding `pg-native` inside a
  // try/catch. We never use it; alias to `false` so rspack short-circuits
  // resolution and stops emitting "Module not found: pg-native" on every
  // build. Avoids needing `@rspack/core` as a direct workspace dep
  // (it's hoisted via pnpm but not resolvable from the app dir).
  config.resolve ??= {};
  config.resolve.alias ??= {};
  config.resolve.alias['pg-native'] = false;
  return config;
});
