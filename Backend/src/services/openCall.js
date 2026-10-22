import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { config } from '../config.js';
import { logger } from '../logger.js';

function chromePath() {
  const local = process.env.LOCALAPPDATA;
  const candidates = [
    local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) || '';
}

export function openCallOnComputer(callId, token) {
  if (!config.demoMode || !config.openCallOnComputer || process.platform !== 'win32' || !token) return false;
  const url = `http://127.0.0.1:${config.port}/call/${callId}#token=${encodeURIComponent(token)}`;
  try {
    const chrome = chromePath();
    const child = chrome
      ? spawn(chrome, ['--new-window', url], { detached: true, stdio: 'ignore' })
      : spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    logger.info(`Opened the demo call screen in ${chrome ? 'Chrome' : 'the default browser'}`);
    return true;
  } catch (error) {
    logger.warn(`The demo call screen could not be opened: ${error.message}`);
    return false;
  }
}
