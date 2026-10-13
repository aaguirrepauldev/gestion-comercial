import { PORT } from './config.js';
import app from './app.js';
import { startBackupSchedule } from './backup.js';

startBackupSchedule();
app.listen(PORT, () => console.log(`API escuchando en http://localhost:${PORT}/api`));
