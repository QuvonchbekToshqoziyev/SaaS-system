# Aniq Hisob Platform - Backend API

**SaaS platform for accounting firms and their clients to communicate and work together.**

Built with NestJS, TypeORM, PostgreSQL, Socket.IO.

## Architecture

```
src/
├── entities/          # TypeORM entities (User, Company, Transaction, etc.)
├── auth/              # Authentication (JWT, login, register, guards)
├── users/             # User CRUD with role-based access
├── companies/         # Company management (accounting firms + clients)
├── transactions/      # Income/expense tracking with multi-currency
├── counterparties/    # Client/supplier management with debt tracking
├── inventory/         # Inventory management (barcode, stock levels)
├── employees/         # Employee management with salary history
├── branches/          # Branch management
├── reports/           # Financial reports, KPIs, analytics
├── chat/              # Real-time messaging (REST + WebSocket)
├── audit/             # Audit logging
└── common/            # Decorators, guards, interceptors
```

## Roles

| Role | Description |
|------|-------------|
| `platform_admin` | Full system access |
| `accountant_admin` | Accounting firm administrator |
| `accountant` | Accounting firm employee |
| `client_admin` | Client company administrator |
| `client_user` | Client company employee |
| `viewer` | Read-only access |

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
npm install

# Create database
createdb aniq_hisob

# Configure environment
cp .env.example .env

# Run database seed
npx ts-node src/seed.ts

# Start dev server
npm run start:dev
```

### Test Accounts (after seeding)

| Email | Password | Role |
|-------|----------|------|
| admin@aniqhisob.uz | password123 | Platform Admin |
| accountant@aniqhisob.uz | password123 | Accountant Admin |
| staff@aniqhisob.uz | password123 | Accountant |
| ceo@silkroad.uz | password123 | Client Admin |
| worker@silkroad.uz | password123 | Client User |
| director@greenvalley.uz | password123 | Client Admin |

## API Documentation

Swagger UI: **http://localhost:3000/api/docs**

## Features

- Multi-tenant architecture (accounting firms + client companies)
- Role-based access control (6 roles)
- Real-time chat via WebSocket (Socket.IO)
- Multi-currency support (UZS, USD, EUR, RUB)
- Financial reports (daily, monthly, KPIs)
- Inventory management with barcode support
- Employee management with salary history
- Counterparty debt tracking
- Audit logging
- Brute-force protection
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
