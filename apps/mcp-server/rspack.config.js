const { composePlugins, withNx } = require('@nx/rspack');

module.exports = composePlugins(withNx(), (config) => {
  config.resolve ??= {};
  config.resolve.alias ??= {};
  // Same `pg-native` alias guard as the other Node apps — `pg` lazily
  // requires it inside a try/catch and we never use it. This stops rspack
  // from emitting "Module not found: pg-native" warnings on every build,
  // even though this app doesn't pull in `pg` directly today (defensive
  // for any transitive bring-in).
  config.resolve.alias['pg-native'] = false;
  return config;
});
