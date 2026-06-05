"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plane, ArrowRight, Calendar, Users, DollarSign, BarChart, Plus, Edit, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function FlightsPage() {
  const [flights, setFlights] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const fetchFlights = async () => {
    try {
      const res = await api.get('/flights');
      setFlights(res.data);
    } catch (err: any) {
      toast.error('Failed to load flights');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlights();
  }, []);

  const handleCreate = async () => {
    const flightNumber = window.prompt("Enter Flight Number (e.g. B2B-999):");
    if (!flightNumber) return;
    
    // Quick dummy dates for tomorrow
    const departure = new Date(Date.now() + 86400000).toISOString();
    const arrival = new Date(Date.now() + 86400000 + 7200000).toISOString();
    
    try {
      await api.post('/flights', {
        flightNumber, departure, arrival, ticketCount: 10, ticketPrice: 500, currency: 'USD'
      });
      toast.success('Flight created successfully!');
      fetchFlights();
    } catch (err: any) {
      toast.error('Failed to create flight. Admins only.');
    }
  };

  const handleEdit = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const flightNumber = window.prompt("Enter new Flight Number:");
    if (!flightNumber) return;
    
    try {
      await api.put(`/flights/${id}`, { flightNumber });
      toast.success('Flight updated!');
      fetchFlights();
    } catch (err: any) {
      toast.error('Failed to update flight. Admins only.');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    if (!window.confirm("Are you sure you want to delete this flight?")) return;
    
    try {
      await api.delete(`/flights/${id}`);
      toast.success('Flight deleted!');
      fetchFlights();
    } catch (err: any) {
      toast.error('Failed to delete flight (ensure no tickets are sold).');
    }
  };

  if (loading) {
    return (
      <div className="text-center text-slate-400">
        <Plane className="mx-auto h-12 w-12 animate-pulse text-fuchsia-500" />
        <p className="mt-2">Loading available flights...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold text-white">Available Flights</h2>
        {user?.role?.toUpperCase() === 'SUPERADMIN' && (
          <button 
            onClick={handleCreate} 
            className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-medium transition"
          >
            <Plus size={18} />
            Create Flight
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {flights.map((flight: any) => (
          <Link href={`/flights/detail?id=${flight.flight_id || flight.id}`} key={flight.flight_id || flight.id}>
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg shadow-lg hover:shadow-fuchsia-500/20 hover:border-fuchsia-700 transition-all duration-300 p-5 group">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Plane className="text-fuchsia-500" size={24} />
                  <p className="text-lg font-bold text-white truncate group-hover:text-fuchsia-400">
                    {flight.flightNumber || `Flight ${flight.flight_id || flight.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300 border border-green-700">
                    {flight.status || 'Active'}
                  </p>
                  {user?.role?.toUpperCase() === 'SUPERADMIN' && (
                    <>
                      <button onClick={(e) => handleEdit(e, flight.id)} className="text-slate-400 hover:text-fuchsia-400 transition" title="Edit">
                        <Edit size={16} />
                      </button>
                      <button onClick={(e) => handleDelete(e, flight.id)} className="text-slate-400 hover:text-red-400 transition" title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              <div className="text-sm text-slate-400 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-300">Departure:</span>
                  <span>{new Date(flight.departure).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-300">Arrival:</span>
                  <span>{new Date(flight.arrival).toLocaleString()}</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-800 grid grid-cols-3 gap-2 text-center">
                <div className="text-slate-400">
                  <p className="text-xs">Allocations</p>
                  <p className="font-bold text-lg text-yellow-400">${Number(flight.total_allocated || 0).toLocaleString()}</p>
                </div>
                <div className="text-slate-400">
                  <p className="text-xs">Sales</p>
                  <p className="font-bold text-lg text-green-400">${Number(flight.total_sales || 0).toLocaleString()}</p>
                </div>
                <div className="text-slate-400">
                  <p className="text-xs">Payments</p>
                  <p className="font-bold text-lg text-fuchsia-400">${Number(flight.total_payments || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </Link>
        ))}
        {flights.length === 0 && (
          <div className="col-span-full text-center py-12 bg-slate-900/50 border border-dashed border-slate-700 rounded-lg">
            <Plane className="mx-auto h-12 w-12 text-slate-600" />
            <h3 className="mt-2 text-lg font-medium text-white">No flights available</h3>
            <p className="mt-1 text-sm text-slate-500">Check back later or contact an administrator to add new flights.</p>
          </div>
        )}
      </div>
    </div>
  );
}
