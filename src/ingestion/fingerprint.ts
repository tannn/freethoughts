import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

export interface SourceFingerprint {
  size: number;
  mtime: number;
  sha256: string;
}

export const captureSourceFingerprint = (sourcePath: string): SourceFingerprint => {
  const stat = statSync(sourcePath);
  const bytes = readFileSync(sourcePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  return {
    size: stat.size,
    mtime: Math.trunc(stat.mtimeMs),
    sha256
  };
};
