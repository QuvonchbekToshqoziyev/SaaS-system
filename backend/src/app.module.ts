import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { TransactionsModule } from './transactions/transactions.module';
import { CounterpartiesModule } from './counterparties/counterparties.module';
import { InventoryModule } from './inventory/inventory.module';
import { EmployeesModule } from './employees/employees.module';
import { BranchesModule } from './branches/branches.module';
import { ReportsModule } from './reports/reports.module';
import { ChatModule } from './chat/chat.module';
import { AuditModule } from './audit/audit.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { HealthModule } from './health/health.module';

import {
  User,
  Company,
  Branch,
  Transaction,
  Counterparty,
  InventoryItem,
  Employee,
  AuditLog,
  ChatMessage,
  ChatRoom,
  SubscriptionPlanDetail,
  Payment,
} from './entities';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Serve frontend static files
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'frontend', 'dist'),
      exclude: ['/api/{*path}'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USERNAME', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'aniq_hisob'),
        entities: [
          User,
          Company,
          Branch,
          Transaction,
          Counterparty,
          InventoryItem,
          Employee,
          AuditLog,
          ChatMessage,
          ChatRoom,
          SubscriptionPlanDetail,
          Payment,
        ],
        synchronize: configService.get<string>('NODE_ENV', 'development') === 'development',
        logging: ['error', 'warn'],
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    CompaniesModule,
    TransactionsModule,
    CounterpartiesModule,
    InventoryModule,
    EmployeesModule,
    BranchesModule,
    ReportsModule,
    ChatModule,
    AuditModule,
    SubscriptionsModule,
    PaymentsModule,
    HealthModule,
  ],
})
export class AppModule {}
