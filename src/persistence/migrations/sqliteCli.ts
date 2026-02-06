import { execFileSync } from 'node:child_process';

export class SqliteCli {
  constructor(private readonly dbPath: string) {}

  exec(sql: string): void {
    execFileSync('sqlite3', [this.dbPath, sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }

  queryJson<T>(sql: string): T[] {
    const output = execFileSync('sqlite3', ['-json', this.dbPath, sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();

    if (!output) {
      return [];
    }

    return JSON.parse(output) as T[];
  }
}
