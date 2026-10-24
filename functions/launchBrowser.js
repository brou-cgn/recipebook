/**
 * Starts the serverless Chromium (@sparticuz/chromium) through puppeteer-core.
 * @sparticuz/chromium is ESM-only since v131; Node >= 22.12 loads it via require().
 */
const LAUNCH_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-blink-features=AutomationControlled',
];

/**
 * @return {Promise<import('puppeteer-core').Browser>}
 */
async function launchBrowser() {
  const puppeteer = require('puppeteer-core');
  const chromiumModule = require('@sparticuz/chromium');
  const chromium = chromiumModule.default || chromiumModule;

  const args = await puppeteer.defaultArgs({args: chromium.args, headless: 'shell'});
  return puppeteer.launch({
    args: args.concat(LAUNCH_FLAGS),
    defaultViewport: {width: 1280, height: 800},
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  });
}

module.exports = {launchBrowser};
