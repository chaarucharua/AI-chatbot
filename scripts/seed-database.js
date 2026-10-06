/**
 * seed-database.js — Root convenience script to seed the database and knowledge base.
 */

import { spawn } from 'child_process';
import path from 'path';

const serverDir = path.resolve('./server');
const child = spawn('node', ['src/scripts/seed.js'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: true,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
