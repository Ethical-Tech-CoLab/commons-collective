import { existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

export function browserExecutablePath() {
  if (process.env.PDF_BROWSER_PATH) {
    if (!existsSync(process.env.PDF_BROWSER_PATH)) throw new Error(`PDF_BROWSER_PATH does not exist: ${process.env.PDF_BROWSER_PATH}`);
    return process.env.PDF_BROWSER_PATH;
  }
  const candidates = [
    chromium.executablePath(),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  const browser = candidates.find(candidate => candidate && existsSync(candidate));
  if (!browser) throw new Error('No Chromium browser found. Run npx playwright install chromium, or set PDF_BROWSER_PATH.');
  return browser;
}
