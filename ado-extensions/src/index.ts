import { readBaseProject } from './base-project.js';
import { baseInspectorExtension } from './extensions/base-inspector.js';
import { bhms21AccountingExtension } from './extensions/bhms21-accounting.js';
import { documentsExtension } from './extensions/documents.js';
import { taxExtension } from './extensions/tax.js';
import { payrollExtension } from './extensions/payroll.js';
import { notificationsExtension } from './extensions/notifications.js';
import { reportingExtension } from './extensions/reporting.js';
import { ExtensionRegistry } from './registry.js';

const base = await readBaseProject();
const registry = new ExtensionRegistry();
registry.register(baseInspectorExtension);
registry.register(bhms21AccountingExtension);
registry.register(documentsExtension);
registry.register(taxExtension);
registry.register(payrollExtension);
registry.register(notificationsExtension);
registry.register(reportingExtension);

if (process.argv[2] === 'snapshot') {
  console.log(JSON.stringify(base, null, 2));
} else {
  if (!base.versionConsistent) {
    throw new Error(`Base version mismatch: expected ${base.version}, client=${base.clientVersion}, server=${base.serverVersion}`);
  }
  const initialization = await registry.initializeAll(base);
  const ok = initialization.every((result) => result.ok);
  console.log(JSON.stringify({ ok, extensions: registry.list(), initialization }, null, 2));
  if (!ok) process.exitCode = 1;
}
