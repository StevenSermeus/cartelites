const { expo } = require('./app.json');

module.exports = () => {
  const development = process.env.APP_VARIANT === 'development';
  return {
    ...expo,
    name: development ? 'Mew Dev' : expo.name,
    scheme: development ? 'cartelites-dev' : 'cartelites',
    ios: {
      ...expo.ios,
      bundleIdentifier: development ? 'dev.wdee.cartelites.dev' : expo.ios.bundleIdentifier,
    },
  };
};
