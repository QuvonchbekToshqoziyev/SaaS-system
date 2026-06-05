"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlightCreateSchema = void 0;
const zod_1 = require("zod");
exports.FlightCreateSchema = zod_1.z.object({
    flightNumber: zod_1.z.string().min(1, 'Flight number is required'),
    departure: zod_1.z.string(),
    arrival: zod_1.z.string(),
    ticketCount: zod_1.z.number().int().positive(),
    ticketPrice: zod_1.z.number().nonnegative(),
    currency: zod_1.z.string().length(3),
});
