import fs from 'fs';
const files = [
  'src/components/CardStack.tsx',
  'src/components/Settings.tsx',
  'src/components/SubscriptionGate.tsx',
  'src/components/Dashboard.tsx',
  'src/hooks/usePullToRefresh.ts',
  'src/hooks/useStockAnalysis.ts',
  'src/hooks/useSwipeNavigation.ts'
];
for (const f of files) {
  const c = fs.readFileSync(f, 'utf8');
  if (!c.includes("import React")) {
    fs.writeFileSync(f, `import React from 'react';\n` + c);
  }
}
