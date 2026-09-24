import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { runMigrations } from './migrations.js';

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(join(DATA_DIR, 'drop-by.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

runMigrations(db);

export default db;
