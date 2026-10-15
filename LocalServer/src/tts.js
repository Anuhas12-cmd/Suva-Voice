import { spawn } from 'child_process';
import { rm } from 'fs/promises';
import { languageFromText, openingPrompts, resolveAudio } from '../../Backend/src/services/audioLibrary.js';

let player = null;
let generation = 0;
let queue = [];

function killPlayer() {
  if (player && !player.killed) player.kill();
  player = null;
}

function play(file, mine, removeAfter, onDone) {
  const safe = file.replace(/'/g, "''");
  player = spawn('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;public class SuvaMci{[DllImport("winmm.dll", CharSet=CharSet.Auto)]public static extern int mciSendString(string c, System.Text.StringBuilder r, int l, System.IntPtr h);}'; [void][SuvaMci]::mciSendString('open ''${safe}'' type mpegvideo alias suva', $null, 0, [IntPtr]::Zero); [void][SuvaMci]::mciSendString('play suva wait', $null, 0, [IntPtr]::Zero); [void][SuvaMci]::mciSendString('close suva', $null, 0, [IntPtr]::Zero)`
  ], { windowsHide: true });
  player.on('exit', () => {
    if (mine === generation) player = null;
    if (removeAfter) rm(file, { force: true }).catch(() => {});
    if (mine === generation && onDone) onDone();
  });
}

function playNext(mine) {
  if (mine !== generation) return;
  const file = queue.shift();
  if (!file) return;
  play(file, mine, false, () => playNext(mine));
}

export function speakCall(prompt, attempt = 1) {
  stopSpeaking();
  const language = languageFromText(prompt);
  if (!language) {
    console.warn('Call language was not recognised. No audio was played.');
    return;
  }
  const files = [];
  for (const id of openingPrompts(attempt)) {
    try {
      files.push(resolveAudio(id, language).file);
    } catch (error) {
      console.warn(error.message);
      return;
    }
  }
  queue = files;
  playNext(generation);
}

export function stopSpeaking() {
  generation += 1;
  queue = [];
  killPlayer();
}
