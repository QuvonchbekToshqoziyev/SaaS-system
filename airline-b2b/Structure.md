# airline-b2b Project Structure

A monorepo-style project containing client, server, and shared components.

## Components

### 1. client/

- **Framework**: Next.js (TypeScript).
- **Role**: Frontend user interface.
- **Key Files**:
  - `src/`: Main application logic.
  - `next.config.ts`: Next.js configuration.
  - `eslint.config.mjs`: Linting rules.
  - `AGENTS.md` & `CLAUDE.md`: Local agent instructions.
  - 

### 2. server/

- **Framework**: Node.js (TypeScript).
- **Database**: Prisma ORM.
- **Testing**: Vitest.
- **Key Files**:
  - `prisma.config.ts`: Database configuration.
  - `vitest.config.ts`: Test runner configuration.

### 3. shared/

- **Role**: Common logic shared between client and server.
- **Key Files**:
  - `types.ts`: Shared TypeScript interfaces.
  - `validation.ts`: Shared validation logic.

## Workflow

- Shared logic should be modified in `shared/` and verified for compatibility in both `client/` and `server/`.
- Use PM2 for process management as seen in the root `.pm2` directory.

