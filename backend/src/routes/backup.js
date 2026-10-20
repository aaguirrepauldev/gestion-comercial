import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import { copyDatabase } from '../db.js';
import { fileStamp } from '../time.js';

const router = Router();

// Descarga una copia de la base en el momento, para guardarla fuera del servidor.
router.get('/', (_req, res, next) => {
  const name = `gestion-comercial-${fileStamp()}.db`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-'));
  const file = copyDatabase(path.join(dir, name));
  res.download(file, name, (err) => {
    fs.rmSync(dir, { recursive: true, force: true });
    if (err && !res.headersSent) next(err);
  });
});

export default router;
