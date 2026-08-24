import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';

function findLocalVersion() {
  let localVersion = null;
  const cwd = process.cwd();
  
  // Method 1: Node resolution
  try {
    const req = createRequire(cwd + '/');
    const pkgPath = req.resolve('nexus-agents/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    localVersion = pkg.version;
  } catch (e) {
    // ignore
  }
  
  if (localVersion) return localVersion;
  
  // Method 2: Walk up looking for package.json with name "nexus-agents"
  let currentDir = cwd;
  while (true) {
    const pkgPath = join(currentDir, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'nexus-agents' && pkg.version) {
          return pkg.version;
        }
      } catch (e) {
        // ignore
      }
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

console.log("Local version:", findLocalVersion());
