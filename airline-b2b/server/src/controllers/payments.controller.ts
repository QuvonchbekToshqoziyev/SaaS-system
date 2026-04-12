import { Request, Response } from 'express';
import { prisma } from '../db';

export const processPayment = async (req: Request, res: Response) => {
  const { firmId, flightId, amount, currency, method, metadata } = req.body;
  
  if (!amount || !firmId || !flightId || !currency || !method) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (method === 'card' && (!metadata || !metadata.transaction_reference)) {
    return res.status(400).json({ error: 'Card requires transaction_reference in metadata' });
  }

  if (method === 'cash' && (!metadata || !metadata.date)) {
     return res.status(400).json({ error: 'Cash requires date in metadata' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      let exRate = 1.0;
      if (currency !== 'USD') {
        const rate = await tx.currencyRate.findFirst({
          where: { targetCurrency: currency },
          orderBy: { recordedAt: 'desc' }
        });
        if (rate) exRate = Number(rate.rate);
      }

      await tx.transaction.create({
        data: {
          firmId,
          flightId,
          type: 'PAYMENT',
          originalAmount: amount,
          currency,
          exchangeRate: exRate,
          baseAmount: Number(amount) / exRate,
          paymentMethod: method,
          metadata
        }
      });
    });
    res.json({ success: true, message: 'Payment recorded' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
};
