import { z } from 'zod';

export const FlightCreateSchema = z.object({
  flightNumber: z.string().min(1, 'Flight number is required'),
  airlineId: z.string().optional(),
  airlineName: z.string().optional(),
  departure: z.string(),
  arrival: z.string(),
  ticketCount: z.number().int().positive(),
  ticketPrice: z.number().nonnegative(),
  currency: z.string().length(3),
});

export type FlightCreateDTO = z.infer<typeof FlightCreateSchema>;
