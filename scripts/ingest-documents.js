/**
 * ingest-documents.js — Re-ingests all documents in server/knowledge-base.
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
