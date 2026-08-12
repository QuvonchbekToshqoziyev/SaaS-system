import { Request, Response } from 'express';
import { writeAuditLog } from '../utils/audit';
import {
  AuthUser,
  ServiceError,
  createEmployeeService,
  getEmployeeSalaryHistoryService,
  listEmployeesService,
  softDeleteEmployeeService,
  updateEmployeeService,
} from '../services/employees.service';

function getAuthUser(req: Request): AuthUser {
  return ((req as any).user || {}) as AuthUser;
}

function sendError(res: Response, err: unknown, fallback: string) {
  if (err instanceof ServiceError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  return res.status(400).json({ error: err instanceof Error ? err.message : fallback });
}

export const listEmployees = async (req: Request, res: Response) => {
  try {
    const rows = await listEmployeesService(getAuthUser(req), { firmId: req.query.firmId });
    return res.json(rows);
  } catch (err) {
    return sendError(res, err, 'Failed to list employees');
  }
};

export const getEmployeeSalaryHistory = async (req: Request, res: Response) => {
  try {
    const result = await getEmployeeSalaryHistoryService(getAuthUser(req), String(req.params.id || ''));
    return res.json(result);
  } catch (err) {
    return sendError(res, err, 'Failed to load salary history');
  }
};

export const createEmployee = async (req: Request, res: Response) => {
  try {
    const employee = await createEmployeeService(getAuthUser(req), req.body || {});
    await writeAuditLog(req, {
      action: 'CREATE',
      entityType: 'employee',
      entityId: employee.id,
      entityLabel: employee.name,
      summary: `Created employee ${employee.name}`,
      after: employee,
    });
    if (employee.kassaDesk) {
      await writeAuditLog(req, {
        action: 'CREATE',
        entityType: 'kassaDesk',
        entityId: employee.kassaDesk.id,
        entityLabel: employee.kassaDesk.name,
        summary: `Created kassa desk ${employee.kassaDesk.name} for kassir ${employee.name}`,
        after: employee.kassaDesk,
      });
    }
    return res.status(201).json(employee);
  } catch (err) {
    return sendError(res, err, 'Failed to create employee');
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const result = await updateEmployeeService(getAuthUser(req), id, req.body || {});
    await writeAuditLog(req, {
      action: 'UPDATE',
      entityType: 'employee',
      entityId: result.after.id,
      entityLabel: result.after.name,
      summary: `Updated employee ${result.after.name}`,
      before: result.before,
      after: result.after,
      metadata: { fields: result.fields },
    });
    return res.json(result.after);
  } catch (err) {
    return sendError(res, err, 'Failed to update employee');
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const result = await softDeleteEmployeeService(getAuthUser(req), id, { reason: req.body?.reason });
    await writeAuditLog(req, {
      action: 'SOFT_DELETE',
      entityType: 'employee',
      entityId: id,
      entityLabel: result.before.name,
      summary: `Soft deleted employee ${result.before.name}`,
      before: result.before,
      after: result.after,
    });
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, err, 'Failed to delete employee');
  }
};
