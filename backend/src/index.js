import { PORT } from './config.js';
import app from './app.js';
import { db } from './db.js';
import { startBackupSchedule } from './backup.js';

startBackupSchedule();
const server = app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}/api`));

// En cada redeploy la plataforma manda SIGTERM: deja terminar los pedidos en curso y cierra la base
// para que lo pendiente del WAL quede escrito en app.db.
function shutdown(signal) {
  console.log(`${signal} recibido, cerrando…`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
