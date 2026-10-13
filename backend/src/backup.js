import fs from 'node:fs';
import path from 'node:path';
import { copyDatabase } from './db.js';
import { BACKUP_DIR, BACKUP_INTERVAL_HOURS, BACKUP_KEEP } from './config.js';
import { fileStamp } from './time.js';

const BACKUP_FILE = /^app-.*\.db$/;
const listBackups = () => fs.readdirSync(BACKUP_DIR).filter((f) => BACKUP_FILE.test(f)).sort();

// Copia la base y después borra las copias más viejas.
export function backupNow() {
  const file = copyDatabase(path.join(BACKUP_DIR, `app-${fileStamp()}.db`));
  for (const old of listBackups().slice(0, -BACKUP_KEEP)) fs.rmSync(path.join(BACKUP_DIR, old));
  return file;
}

// Hace un backup al arrancar si el último es más viejo que el intervalo, y después uno por intervalo.
export function startBackupSchedule() {
  if (!(BACKUP_INTERVAL_HOURS > 0)) return;
  const intervalMs = BACKUP_INTERVAL_HOURS * 60 * 60 * 1000;

  const run = () => {
    try {
      console.log(`Backup creado: ${backupNow()}`);
    } catch (err) {
      console.error('No se pudo crear el backup de la base:', err);
    }
  };

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const last = listBackups().at(-1);
  const lastAt = last ? fs.statSync(path.join(BACKUP_DIR, last)).mtimeMs : 0;
  if (Date.now() - lastAt >= intervalMs) run();
  setInterval(run, intervalMs).unref();
}
