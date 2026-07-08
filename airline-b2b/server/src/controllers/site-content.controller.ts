import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../db';
import { defaultLoginPageContent, normalizeLoginPageContent } from '../lib/login-content';
import { writeAuditLog } from '../utils/audit';

const LOGIN_PAGE_KEY = 'login-page';

type AuthUser = {
  role?: Role | string;
};

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function canEditSiteContent(role: unknown) {
  return String(role || '').toUpperCase() === 'SUPERADMIN';
}

export const getLoginPageContent = async (_req: Request, res: Response) => {
  const record = await prisma.siteContent.findUnique({
    where: { key: LOGIN_PAGE_KEY },
  });

  const content = normalizeLoginPageContent(record?.value ?? defaultLoginPageContent);
  return res.json({ key: LOGIN_PAGE_KEY, content });
};

export const updateLoginPageContent = async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  if (!canEditSiteContent(authUser.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const content = normalizeLoginPageContent((req.body as any)?.content ?? req.body);
  const before = await prisma.siteContent.findUnique({ where: { key: LOGIN_PAGE_KEY } });

  const saved = await prisma.siteContent.upsert({
    where: { key: LOGIN_PAGE_KEY },
    create: {
      key: LOGIN_PAGE_KEY,
      value: content,
    },
    update: {
      value: content,
    },
  });

  await writeAuditLog(req, {
    action: before ? 'UPDATE' : 'CREATE',
    entityType: 'siteContent',
    entityId: LOGIN_PAGE_KEY,
    entityLabel: LOGIN_PAGE_KEY,
    summary: 'Updated login page content',
    before,
    after: saved,
  });

  return res.json({ key: LOGIN_PAGE_KEY, content: normalizeLoginPageContent(saved.value) });
};
