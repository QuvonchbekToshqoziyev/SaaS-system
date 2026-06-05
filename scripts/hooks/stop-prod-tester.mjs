import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function readStdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return safeJsonParse(text);
}

async function run() {
  const input = (await readStdinJson()) || {};

  // VS Code hook payload uses snake_case for this field.
  const stopHookActive = Boolean(input.stop_hook_active);

  // Prevent infinite loops if a previous Stop hook already blocked.
  if (stopHookActive) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const strict = process.env.PROD_TESTER_STRICT === '1';
  const inviteFlow = process.env.PROD_TESTER_INVITE_FLOW === '1';

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, '..', '..');
  const testerScript = path.join(repoRoot, 'scripts', 'prod-tester.mjs');

  const args = [testerScript];
  if (strict) args.push('--strict');
  if (inviteFlow) args.push('--invite-flow');

  const exitCode = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (d) => process.stderr.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));

    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode === 0) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        decision: 'block',
        reason: 'Production tests failed. Fix issues and rerun.',
      },
      systemMessage: 'Production tests failed (see Hooks output).',
    }),
  );
}

run().catch((err) => {
  // Ensure we only write JSON to stdout.
  process.stderr.write(String(err?.message || err));
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        decision: 'block',
        reason: 'Production tester hook failed to run.',
      },
      systemMessage: 'Production tester hook failed to run (see Hooks output).',
    }),
  );
});
