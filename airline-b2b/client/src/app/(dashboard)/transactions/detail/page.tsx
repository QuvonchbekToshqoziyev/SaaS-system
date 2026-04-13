"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useSearchParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, FileText, Hash, CreditCard } from 'lucide-react';

export default function TransactionDetailPage() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  
  const [tx, setTx] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchTx = async () => {
      try {
        const res = await api.get(`/transactions/${id}`);
        setTx(res.data);
      } catch (err: any) {
        toast.error('Failed to load transaction details');
      } finally {
        setLoading(false);
      }
    };
    fetchTx();
  }, [id]);

  if (loading) return <div className="text-center p-8">Loading transaction details...</div>;
  if (!tx) return <div className="text-center p-8 text-red-500">Transaction not found</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => router.back()} 
          className="p-2 hover:bg-surface-2 rounded-full transition"
        >
          <ArrowLeft size={24} className="text-muted" />
        </button>
        <h2 className="text-2xl font-bold text-foreground">Transaction Info</h2>
      </div>

      <div className="bg-surface shadow sm:rounded-lg overflow-hidden border border-border">
        <div className="px-4 py-5 sm:px-6 border-b border-border bg-surface-2 flex justify-between items-center">
          <div>
            <h3 className="text-lg leading-6 font-medium text-foreground flex items-center gap-2">
               Receipt <span className="text-sm font-normal text-muted">#{tx.id}</span>
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Recorded on {format(new Date(tx.createdAt || tx.created_at), 'PPP pp')}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-bold uppercase border ${
            (tx.type || '').toLowerCase() === 'sale' ? 'bg-green-900/30 text-green-300 border-green-700/50' :
            (tx.type || '').toLowerCase() === 'payable' ? 'bg-red-900/30 text-red-300 border-red-700/50' :
            (tx.type || '').toLowerCase() === 'payment' ? 'bg-indigo-900/30 text-indigo-300 border-indigo-700/50' :
            'bg-surface text-muted border-border'
          }`}>
            {tx.type}
          </span>
        </div>
        <div className="px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-border">
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-muted flex items-center gap-2">
                <FileText size={16}/> Total Value
              </dt>
              <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2 font-mono font-semibold text-lg">
                {Number(tx.originalAmount).toFixed(2)} {tx.currency}
              </dd>
            </div>
            
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-muted flex items-center gap-2">
                <FileText size={16}/> Base Amount (USD)
              </dt>
              <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2 font-mono">
                {Number(tx.baseAmount).toFixed(2)} USD 
                <span className="text-xs text-muted ml-2">(Rate: {Number(tx.exchangeRate).toFixed(4)})</span>
              </dd>
            </div>

            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-muted flex items-center gap-2">
                <Hash size={16}/> Firm Assigned
              </dt>
              <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                {tx.firm?.name || tx.firmId || 'N/A'}
              </dd>
            </div>

            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-muted flex items-center gap-2">
                <Hash size={16}/> Applied to Flight
              </dt>
              <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                {tx.flight?.flightNumber || tx.flightId || 'N/A'}
              </dd>
            </div>

            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-muted flex items-center gap-2">
                <CreditCard size={16}/> Payment Method
              </dt>
              <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2 capitalize">
                {tx.paymentMethod || 'None / Not Applicable'}
              </dd>
            </div>
            
            {tx.ticket && (
              <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6 bg-surface-2">
                <dt className="text-sm font-medium text-muted flex items-center gap-2">
                  <CheckCircle size={16}/> Associated Ticket ID
                </dt>
                <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2 font-mono">
                  {tx.ticket.id}
                </dd>
              </div>
            )}
            
            <div className="py-4 sm:py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-muted">
                Metadata payload
              </dt>
              <dd className="mt-1 text-sm text-foreground sm:mt-0 sm:col-span-2">
                <pre className="bg-surface-2 border border-border p-3 rounded-md text-xs overflow-x-auto text-muted">
                  {tx.metadata ? JSON.stringify(tx.metadata, null, 2) : '{}'}
                </pre>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
