"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient({});
async function main() {
    console.log('Seeding database...');
    // Create superadmin
    const hashedPassword = await bcryptjs_1.default.hash('superadmin123', 10);
    const superadmin = await prisma.user.upsert({
        where: { email: 'admin@airline.com' },
        update: {},
        create: {
            email: 'admin@airline.com',
            password: hashedPassword,
            role: 'SUPERADMIN',
        },
    });
    // Create test firm
    const firm = await prisma.firm.create({
        data: {
            name: 'Global Travels Agency',
        },
    });
    const firmHashedPassword = await bcryptjs_1.default.hash('firm123', 10);
    const firmUser = await prisma.user.upsert({
        where: { email: 'agency@airline.com' },
        update: {},
        create: {
            email: 'agency@airline.com',
            password: firmHashedPassword,
            role: 'FIRM',
            firmId: firm.id,
        },
    });
    // Create CurrencyRates
    await prisma.currencyRate.create({
        data: {
            baseCurrency: 'USD',
            targetCurrency: 'EUR',
            rate: 0.92,
            source: 'seed',
        },
    });
    // Create a Flight
    const flight = await prisma.flight.create({
        data: {
            flightNumber: 'B2B-100',
            departure: new Date(Date.now() + 86400000), // Tomorrow
            arrival: new Date(Date.now() + 86400000 + 7200000), // Tomorrow + 2h
        },
    });
    console.log('Database seeded successfully!', { superadmin: superadmin.email, firmUser: firmUser.email });
}
main()
    .catch((e) => {
    console.error(e);
})
    .finally(async () => {
    await prisma.$disconnect();
});
