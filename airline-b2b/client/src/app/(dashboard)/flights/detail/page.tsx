"use client";

import { useEffect, useState, Suspense } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

function FlightDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchData = async () => {
    try {
      if (!id) return;
      const [reportRes, ticketsRes] = await Promise.all([
        api.get(`/reports/flight?flight_id=${id}`),
        api.get(`/tickets?flight_id=${id}`),
      ]);
      
      const report = Array.isArray(reportRes.data) 
        ? reportRes.data.find(r => r.flight_id === Number(id)) || reportRes.data[0] 
        : reportRes.data;

      setData({ report, tickets: ticketsRes.data });
    } catch (err: any) {
      toast.error('Failed to load flight details');
    } finally {
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleAllocate = async (ticketId: string) => {
    const firmId = window.prompt("Enter the exact Firm UUID to allocate this ticket to:");
    if (!firmId) return;
    try {
      await api.post(`/tickets/allocate`, { ticketId, firmId });
      toast.success('Ticket allocated successfully');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to allocate ticket');
    }
  };

  const handleSell = async (ticketId: string) => {
    if (!window.confirm("Confirm marking this ticket as SOLD?")) return;
    try {
      await api.post(`/tickets/sell`, { ticketId });
      toast.success('Ticket marked as sold');
      fetchData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to sell ticket');
    }
  };

  if (loading) return <div>Loading details...</div>;

  const summary = data?.report || {};
  const tickets = data?.tickets || [];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Flight #{id} Details</h2>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Total Debt (Payable)</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{Number(summary.total_allocated || 0).toFixed(2)}</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Total Revenue (Sales)</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{Number(summary.total_sales || 0).toFixed(2)}</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Total Payments</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{Number(summary.total_payments || 0).toFixed(2)}</dd>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-gray-500 truncate">Outstanding Debt</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">
            {Number((summary.total_allocated || 0) - (summary.total_payments || 0)).toFixed(2)}
          </dd>
        </div>
        {user?.role !== 'firm' && (
          <div className="bg-white overflow-hidden shadow rounded-lg px-4 py-5 sm:p-6 lg:col-span-4">
            <dt className="text-sm font-medium text-gray-500 truncate">Profit (Revenue - Debt)</dt>
            <dd className="mt-1 text-3xl font-semibold text-gray-900 text-green-600">
              {Number((summary.total_sales || 0) - (summary.total_allocated || 0)).toFixed(2)}
            </dd>
          </div>
        )}
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Tickets</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price / Currency</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Firm</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tickets.map((ticket: any) => (
                <tr key={ticket.id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ticket.id}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${ticket.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' : ticket.status === 'ASSIGNED' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {Number(ticket.price).toFixed(2)} {ticket.currency}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{ticket.assignedFirm?.name || ticket.assignedFirmId || 'None'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    {user?.role?.toUpperCase() === 'SUPERADMIN' && ticket.status === 'AVAILABLE' && (
                      <button onClick={() => handleAllocate(ticket.id)} className="text-yellow-600 hover:text-yellow-900">Allocate (Debt)</button>
                    )}
                    {ticket.status === 'ASSIGNED' && (
                      <button onClick={() => handleSell(ticket.id)} className="text-indigo-600 hover:text-indigo-900">Mark Sold (Revenue)</button>
                    )}
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">No tickets found for this flight.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function FlightDetailsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FlightDetailContent />
    </Suspense>
  )
}
