// Starts headless Chrome for the browser suites, on any computer.
// Order: CHROME_PATH env var -> @sparticuz/chromium (if installed, used in Claude's Linux sandbox)
//        -> a normal Chrome / Edge / Chromium found in its usual install location.
import fs from 'node:fs';

const LOCAL = [
  process.env['PROGRAMFILES'] && `${process.env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['LOCALAPPDATA'] && `${process.env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
  process.env['PROGRAMFILES(X86)'] && `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  process.env['PROGRAMFILES'] && `${process.env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export async function launchBrowser(puppeteer) {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) throw new Error(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    return puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
  }
  try {
    const { default: chromium } = await import('@sparticuz/chromium');
    return await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
  const exe = LOCAL.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('No Chrome/Edge found. Install Chrome, or set CHROME_PATH to the browser .exe.');
  return puppeteer.launch({ executablePath: exe, headless: true, args: process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [] });
}
