import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import inviteRoutes from './routes/invites';
import ticketRoutes from './routes/tickets';
import paymentRoutes from './routes/payments';
import reportRoutes from './routes/reports';
import transactionRoutes from './routes/transactions';
import flightRoutes from './routes/flights';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/invites', inviteRoutes);
app.use('/tickets', ticketRoutes);
app.use('/payments', paymentRoutes);
app.use('/reports', reportRoutes);
app.use('/transactions', transactionRoutes);
app.use('/flights', flightRoutes);

const PORT = parseInt(process.env.PORT || '5000', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
