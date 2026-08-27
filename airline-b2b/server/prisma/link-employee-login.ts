import { FirmStatus, PrismaClient, Role } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

async function main() {
  const employeeId = String(process.env.EMPLOYEE_ID || '').trim();
  const loginUserId = String(process.env.LOGIN_USER_ID || '').trim();
  if (process.env.APPLY_EMPLOYEE_LOGIN_LINK !== '1' || !employeeId || !loginUserId) {
    throw new Error('Set APPLY_EMPLOYEE_LOGIN_LINK=1, EMPLOYEE_ID, and LOGIN_USER_ID');
  }

  const [employee, user] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    prisma.user.findUnique({ where: { id: loginUserId } }),
  ]);
  if (!employee || !user) throw new Error('Employee or login user was not found');
  if (employee.loginUserId && employee.loginUserId !== user.id) throw new Error('Employee is already linked to another login');
  if (employee.firmId !== user.firmId || user.role !== Role.FIRM) throw new Error('Employee and login user must belong to the same firm');

  const userStatus = employee.status === FirmStatus.ACTIVE
    ? 'ACTIVE'
    : employee.status === FirmStatus.SUSPENDED
      ? 'SUSPENDED'
      : 'DELETED';
  const deletedAt = userStatus === 'DELETED' ? employee.deletedAt || new Date() : null;

  await prisma.$transaction([
    prisma.employee.update({ where: { id: employee.id }, data: { loginUserId: user.id } }),
    prisma.user.update({
      where: { id: user.id },
      data: { status: userStatus, deletedAt, sessionVersion: { increment: 1 } },
    }),
  ]);

  console.log(JSON.stringify({ ok: true, employeeId: employee.id, loginUserId: user.id, status: userStatus }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
