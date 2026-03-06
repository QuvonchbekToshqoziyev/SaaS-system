import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { winstonLoggerConfig } from './logger/logger.config';

// Winston handles uncaughtException & unhandledRejection via its
// exceptionHandlers / rejectionHandlers (see logger.config.ts),
// but we still keep a safety net so the process doesn't exit:
process.on('uncaughtException', () => { /* logged by winston */ });
process.on('unhandledRejection', () => { /* logged by winston */ });

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: winstonLoggerConfig,
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Validation  
  app.useGlobalPipes( 
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true, 
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Swagger API Documentation
  const config = new DocumentBuilder()
    .setTitle('Aniq Hisob Platform API')
    .setDescription(
      `## Aniq Hisob - SaaS Accounting Platform\n\nA comprehensive platform for accounting firms and their clients to:\n- **Communicate** via real-time chat\n- **Manage finances** with income/expense tracking\n- **Monitor cash flow** with dashboards and reports\n- **Manage inventory**, employees, and counterparties\n- **Control access** with role-based permissions\n\n### Roles\n- **Platform Admin** - Full system access\n- **Accountant Admin** - Accounting firm administrator\n- **Accountant** - Accounting firm employee\n- **Client Admin** - Client company administrator\n- **Client User** - Client company employee\n- **Viewer** - Read-only access\n\n### Authentication\nAll endpoints (except login/register) require a Bearer JWT token.`,
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication & authorization')
    .addTag('Users', 'User management')
    .addTag('Companies', 'Company management')
    .addTag('Transactions', 'Income/expense tracking')
    .addTag('Counterparties', 'Client/supplier management')
    .addTag('Inventory', 'Inventory management')
    .addTag('Employees', 'Employee management')
    .addTag('Branches', 'Branch management')
    .addTag('Reports', 'Financial reports & analytics')
    .addTag('Chat', 'Real-time communication')
    .addTag('Audit', 'Audit logging')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
  ========================================================
    Aniq Hisob Platform
  ========================================================
    Frontend:  http://localhost:${port}
    API Base:  http://localhost:${port}/api/v1
    Swagger:   http://localhost:${port}/api/docs
    WebSocket: ws://localhost:${port}/chat
  ========================================================
  `);
}
bootstrap();
 