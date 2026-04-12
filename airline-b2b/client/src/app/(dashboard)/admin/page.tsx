"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';

type MonthlyReportRow = {
  month: string;
  allocations: number | string;
  sales: number | string;
  payments: number | string;
};

export default function AdminDashboard() {
  const [report, setReport] = useState<MonthlyReportRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await api.get<MonthlyReportRow[]>('/reports/monthly');
        setReport(res.data);
      } catch {
        toast.error('Failed to load reports');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, []);

  if (loading) return <div>Loading reports...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Admin Overview</h2>
          <p className="mt-1 text-sm text-slate-400">Quick links and monthly reports.</p>
        </div>
        <Link
          href="/firms"
          className="inline-flex items-center justify-center px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-medium transition"
        >
          Firms
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Placeholder summary cards until we process monthly real data */}
        <div className="bg-slate-900/50 border border-slate-800 overflow-hidden rounded-lg px-4 py-5 sm:p-6">
          <dt className="text-sm font-medium text-slate-400 truncate">Total Reporting Periods</dt>
          <dd className="mt-1 text-3xl font-semibold text-white">{report?.length || 0}</dd>
        </div>
      </div>
      
      <div className="bg-slate-900/50 border border-slate-800 max-w-full overflow-x-auto rounded-lg">
        <table className="min-w-full divide-y divide-slate-800">
          <thead className="bg-slate-800/60">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Month</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Allocations (Debt)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Sales (Revenue)</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">Payments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {report?.map((r, idx: number) => (
              <tr key={idx}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">{r.month}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">{Number(r.allocations).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">{Number(r.sales).toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-200">{Number(r.payments).toFixed(2)}</td>
              </tr>
            ))}
            {(!report || report.length === 0) && (
              <tr>
                <td colSpan={4} className="px-6 py-4 text-center text-sm text-slate-400">
                  No data available yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
