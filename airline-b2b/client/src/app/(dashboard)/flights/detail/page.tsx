"use client";

import { useEffect, useState, Suspense } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Plane, Tag, DollarSign, Briefcase, Activity, CheckCircle, Clock } from 'lucide-react';

function FlightDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id");
  const [data, setData] = useState<any>(null);
  const [firms, setFirms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Modal State
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedFirmId, setSelectedFirmId] = useState<string>('');

  const fetchData = async () => {
    try {
      if (!id) return;
      const [reportRes, ticketsRes, firmsRes] = await Promise.all([
        api.get(`/reports/flight?flight_id=${id}`),
        api.get(`/tickets?flight_id=${id}`),
        api.get('/auth/users') // assuming this gets list of users including firms
      ]);
      
      const report = Array.isArray(reportRes.data) 
        ? reportRes.data.find((r: any) => r.flight_id === Number(id)) || reportRes.data[0] 
        : reportRes.data;

      setData({ report, tickets: ticketsRes.data });
      
      // Filter out only firm users if possible, and dedupe by firmId
      const firmUsersRaw = firmsRes.data.filter((u: any) => u.role === 'FIRM' && u.firmId);
      const firmUsersByFirmId = new Map<string, any>();
      for (const firmUser of firmUsersRaw) {
        if (!firmUsersByFirmId.has(firmUser.firmId)) {
          firmUsersByFirmId.set(firmUser.firmId, firmUser);
        }
      }
      const firmUsers = Array.from(firmUsersByFirmId.values());

      setFirms(firmUsers);
      if (firmUsers.length > 0) setSelectedFirmId(firmUsers[0].firmId);

    } catch (err: any) {
      toast.error('Failed to load details. Ensure you are an Admin.');
    } finally {
      if (loading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const openAllocateModal = (ticketId: string) => {
    setSelectedTicketId(ticketId);
    setIsAllocateModalOpen(true);
  };

  const handleAllocateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketId || !selectedFirmId) return;
    
    try {
      await api.post(`/tickets/allocate`, { ticketId: selectedTicketId, firmId: selectedFirmId });
      toast.success('Ticket allocated successfully');
      setIsAllocateModalOpen(false);
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

  if (loading) {
    return (
      <div className="text-center text-slate-400 py-12">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-fuchsia-500" />
        <p className="mt-2">Loading flight details...</p>
      </div>
    );
  }

  const summary = data?.report || {};
  const tickets = data?.tickets || [];

  return (
    <div className="space-y-8 text-white">
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-bold">Flight #{id} Details</h2>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center gap-2 text-yellow-400 mb-2">
            <Clock size={16} />
            <span className="text-sm font-medium">Total Debt (Payable)</span>
          </div>
          <div className="text-3xl font-bold">${Number(summary.total_allocated || 0).toFixed(2)}</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center gap-2 text-green-400 mb-2">
            <Activity size={16} />
            <span className="text-sm font-medium">Total Revenue (Sales)</span>
          </div>
          <div className="text-3xl font-bold">${Number(summary.total_sales || 0).toFixed(2)}</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center gap-2 text-fuchsia-400 mb-2">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">Total Payments</span>
          </div>
          <div className="text-3xl font-bold">${Number(summary.total_payments || 0).toFixed(2)}</div>
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-5">
          <div className="flex items-center gap-2 text-slate-300 mb-2">
            <DollarSign size={16} />
            <span className="text-sm font-medium">Outstanding Debt</span>
          </div>
          <div className="text-3xl font-bold">
            ${Number((summary.total_allocated || 0) - (summary.total_payments || 0)).toFixed(2)}
          </div>
        </div>

        {user?.role?.toUpperCase() !== 'FIRM' && (
          <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-5 lg:col-span-auto">
            <div className="flex items-center gap-2 text-indigo-400 mb-2">
              <span className="text-sm font-medium">Profit (Revenue - Debt)</span>
            </div>
            <div className="text-3xl font-bold text-indigo-400">
              ${Number((summary.total_sales || 0) - (summary.total_allocated || 0)).toFixed(2)}
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800">
          <h3 className="text-lg font-bold">Tickets Inventory</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800 text-sm text-slate-300">
                <th className="p-4 font-semibold">Ticket ID</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Price / Currency</th>
                <th className="p-4 font-semibold">Assigned Firm</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-sm">
              {tickets.map((ticket: any) => (
                <tr key={ticket.id} className="hover:bg-slate-800/50 transition">
                  <td className="p-4 text-slate-100 font-medium">
                    <div className="flex items-center gap-2">
                      <Tag size={14} className="text-slate-500" />
                      {ticket.id.slice(0, 8)}...
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold inline-block border ${
                      ticket.status === 'AVAILABLE' ? 'bg-green-900/30 text-green-400 border-green-700/50' : 
                      ticket.status === 'ASSIGNED' ? 'bg-yellow-900/30 text-yellow-400 border-yellow-700/50' : 
                      'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      {ticket.status}
                    </span>
                  </td>
                  <td className="p-4 text-slate-300 font-medium">
                    {Number(ticket.price).toFixed(2)} {ticket.currency}
                  </td>
                  <td className="p-4 text-slate-400">
                    <div className="flex items-center gap-2">
                      {ticket.assignedFirmId && <Briefcase size={14} className="text-slate-500" />}
                      {ticket.assignedFirm?.name || ticket.assignedFirmId || '—'}
                    </div>
                  </td>
                  <td className="p-4 text-right space-x-3">
                    {['SUPERADMIN', 'ADMIN'].includes(user?.role?.toUpperCase() || '') && ticket.status === 'AVAILABLE' && (
                      <button 
                        onClick={() => openAllocateModal(ticket.id)} 
                        className="px-3 py-1 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/40 rounded transition border border-yellow-600/50 font-medium"
                      >
                        Allocate
                      </button>
                    )}
                    {ticket.status === 'ASSIGNED' && (
                      <button 
                        onClick={() => handleSell(ticket.id)} 
                        className="px-3 py-1 bg-fuchsia-600/20 text-fuchsia-400 hover:bg-fuchsia-600/40 rounded transition border border-fuchsia-600/50 font-medium"
                      >
                        Mark Sold
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    <Plane className="mx-auto h-8 w-8 mb-2 opacity-50" />
                    No tickets found for this flight.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocate Modal */}
      {isAllocateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-xl font-bold text-white mb-4">Allocate Ticket</h3>
            
            <form onSubmit={handleAllocateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Select Firm</label>
                {firms.length > 0 ? (
                  <select
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-fuchsia-500 transition"
                    value={selectedFirmId}
                    onChange={(e) => setSelectedFirmId(e.target.value)}
                    required
                  >
                    <option value="" disabled>-- Select a Firm --</option>
                    {firms.map((f: any) => (
                      <option key={f.firmId} value={f.firmId}>
                        {(f.firm?.name || f.email) + ` (ID: ${String(f.firmId).slice(0, 8)}...)`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-fuchsia-500 transition"
                    placeholder="Enter Firm UUID"
                    value={selectedFirmId}
                    onChange={(e) => setSelectedFirmId(e.target.value)}
                  />
                )}
              </div>
              
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg transition"
                >
                  Allocate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlightDetailsPage() {
  return (
    <Suspense fallback={
      <div className="text-center text-slate-400 py-12">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-fuchsia-500" />
      </div>
    }>
      <FlightDetailContent />
    </Suspense>
  )
}
