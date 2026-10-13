// Borra la base local y la vuelve a crear con los datos de ejemplo.
import fs from 'node:fs';
import { DB_PATH } from './config.js';

for (const file of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) fs.rmSync(file, { force: true });
await import('./db.js');
