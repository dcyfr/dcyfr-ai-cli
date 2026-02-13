---
"@dcyfr/ai-cli": major
---

Initial release of standalone CLI package

**Breaking Changes:**
- CLI extracted from dcyfr-ai-nodejs into standalone @dcyfr/ai-cli package
- Consumers must now install @dcyfr/ai-cli separately

**Features:**
- Dual mode support: Binary CLI + Library API
- Cross-platform compatibility (macOS, Windows, Linux)
- Full TypeScript support with type definitions
- Comprehensive test suite (38 tests, 100% pass rate)
- npm provenance tracking for supply chain security

**Library Mode API:**
```typescript
import { runCLI } from '@dcyfr/ai-cli';

const result = await runCLI(['status']);
console.log(result.exitCode, result.stdout, result.stderr);
```

**Binary Mode:**
```bash
npm install -g @dcyfr/ai-cli
dcyfr-cli --help
```