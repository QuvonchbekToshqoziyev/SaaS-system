import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Employee } from '../entities';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  UpdateSalaryDto,
} from './dto/employee.dto';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee) private empRepo: Repository<Employee>,
  ) {}

  async create(dto: CreateEmployeeDto) {
    const emp = this.empRepo.create({
      ...dto,
      hireDate: dto.hireDate ? new Date(dto.hireDate) : new Date(),
      salaryHistory: dto.salary
        ? [
            {
              amount: dto.salary,
              currency: dto.salaryCurrency || 'UZS',
              date: new Date().toISOString(),
            },
          ]
        : [],
    });
    return this.empRepo.save(emp);
  }

  async findAll(companyId: string) {
    return this.empRepo.find({
      where: { companyId, isActive: true },
      order: { lastName: 'ASC' },
    });
  }

  async findOne(id: string) {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    return emp;
  }

  async update(id: string, dto: UpdateEmployeeDto) {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    Object.assign(emp, dto);
    return this.empRepo.save(emp);
  }

  async updateSalary(id: string, dto: UpdateSalaryDto) {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');

    const history = emp.salaryHistory || [];
    history.push({
      amount: dto.amount,
      currency: dto.currency || emp.salaryCurrency,
      date: new Date().toISOString(),
      note: dto.note,
    });

    emp.salary = dto.amount;
    if (dto.currency) emp.salaryCurrency = dto.currency;
    emp.salaryHistory = history;

    return this.empRepo.save(emp);
  }

  async deactivate(id: string) {
    const emp = await this.empRepo.findOne({ where: { id } });
    if (!emp) throw new NotFoundException('Employee not found');
    emp.isActive = false;
    return this.empRepo.save(emp);
  }

  async getPayrollSummary(companyId: string) {
    const employees = await this.empRepo.find({
      where: { companyId, isActive: true },
    });

    const totalSalary = employees.reduce(
      (sum, emp) => sum + Number(emp.salary),
      0,
    );

    const byDepartment = employees.reduce(
      (acc, emp) => {
        const dept = emp.department || 'Unassigned';
        if (!acc[dept]) acc[dept] = { count: 0, totalSalary: 0 };
        acc[dept].count++;
        acc[dept].totalSalary += Number(emp.salary);
        return acc;
      },
      {} as Record<string, { count: number; totalSalary: number }>,
    );

    return {
      totalEmployees: employees.length,
      totalMonthlyPayroll: totalSalary,
      byDepartment,
    };
  }
}
