const { composePlugins, withNx } = require('@nx/rspack');
const rspack = require('@rspack/core');

module.exports = composePlugins(withNx(), (config) => {
  config.plugins ??= [];
  // `pg` lazily requires the optional native binding `pg-native` inside a
  // try/catch. We never use it; tell rspack to skip resolving it so the
  // module-not-found warning stops cluttering the build output.
  config.plugins.push(
    new rspack.IgnorePlugin({
      resourceRegExp: /^pg-native$/,
    }),
  );
  return config;
});
