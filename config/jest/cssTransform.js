// CSS-Importe liefern in Tests ein leeres Modul – wie bisher unter
// react-scripts (config/jest/cssTransform.js aus Create React App).
module.exports = {
  process() {
    return { code: 'module.exports = {};' };
  },
  getCacheKey() {
    return 'cssTransform';
  },
};
