import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(process.cwd() + '/');
try {
  const pkgPath = require.resolve('nexus-agents/package.json');
  console.log(JSON.parse(readFileSync(pkgPath, 'utf8')).version);
} catch (e) {
  console.log("Not found");
}
