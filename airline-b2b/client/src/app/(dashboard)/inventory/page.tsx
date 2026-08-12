"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Boxes, ClipboardList, LayoutDashboard, PackagePlus, Pencil, RefreshCw, Search, ShoppingCart, Trash2, Truck, Users } from 'lucide-react';

type Named = { id: string; name: string; code?: string; currency?: string; type?: string; isActive?: boolean; parentId?: string | null; phone?: string | null; kind?: string };
type Bootstrap = { categories: Named[]; units: Named[]; warehouses: Named[]; suppliers: Named[]; customers: Named[]; accounts: Named[]; contractorFirms: Named[] };
type Product = { id: string; sku: string; barcode?: string | null; name: string; minimumStock: string; defaultPurchasePrice?: string | null; defaultSalePrice?: string | null; currency: string; tracksBatch: boolean; tracksExpiry: boolean; category: Named; unit: Named };
type StockRow = { product: Product; physicalStock: string; reservedQuantity: string; availableStock: string; averageUnitCost: string; inventoryValue: string; minimumStock: string; status: string; nearestExpiry?: string | null };
type Dashboard = {
  products: number; physicalStock: string; availableStock: string; inventoryValue: string; monthPurchases: string; monthSales: string; revenue: string; cogs: string; grossProfit: string; expiredBatches: number;
  kpis?: { totalSku: number; inStockSku: number; zeroStockSku: number; lowStockSku: number; reservedStock: string; expiringSoonBatches: number; expiredBatches: number; topInventoryProduct?: StockRow | null; topSoldProduct?: StockRow | null; slowMovingProduct?: StockRow | null; inventoryTurnover: string; deadStockValue: string };
  productStatuses?: Array<StockRow & { warehouse?: Named | null; lastPurchasePrice?: string; salePrice?: string; lastReceipt?: string | null; lastIssue?: string | null }>;
};
type DocumentRow = { id: string; documentNumber: string; documentDate: string; type: string; status: string; netAmount: string; currency: string; warehouse: Named; supplier?: Named | null; customer?: Named | null; lines: Array<{ id: string; quantity: string; unitPrice: string; product: Product; batch?: { batchNumber: string; expiryDate?: string | null } | null }> };
type Report = { summary: { incomingQuantity: string; outgoingQuantity: string; inventoryIncrease: string; inventoryDecrease: string; revenue: string; cogs: string; grossProfit: string }; rows: Array<{ id: string; movementDate: string; documentNumber?: string | null; movementType: string; quantity: string; unitCost: string; totalCost: string; enteredBy: string; counterparty?: string | null; product: Product; warehouse: Named; financialEntries: Array<{ debitAccount: string; creditAccount: string; amount: string }> }> };

const tabs = [
  ['dashboard', 'Dashboard'], ['products', 'Mahsulotlar'], ['receipt', 'Kirim'], ['issue', 'Chiqim'], ['sale', 'Sotuv'],
  ['stock', 'Qoldiq'], ['batches', 'Partiyalar'], ['count', 'Inventarizatsiya'], ['warehouses', 'Omborlar'],
  ['suppliers', 'Yetkazib beruvchilar'], ['customers', 'Mijozlar'], ['reports', 'Hisobotlar'], ['settings', 'Sozlamalar'], ['audit', 'Audit tarixi'],
] as const;
type Tab = typeof tabs[number][0];

const money = (value: unknown) => Number(value || 0).toLocaleString('uz-UZ', { maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

export default function InventoryPage() {
  const { user } = useAuth();
  const role = String(user?.role || '').toUpperCase();
  const firmRole = String(user?.firmRole || '').toUpperCase();
  const canCancelInventoryDocument = role !== 'FIRM' || firmRole === 'FIRM_ADMIN' || firmRole === 'OMBOR_MUDIRI';
  const [tab, setTab] = useState<Tab>('dashboard');
  const [firmId, setFirmId] = useState(role === 'FIRM' ? String(user?.firmId || '') : '');
  const [firms, setFirms] = useState<Named[]>([]);
  const [bootstrap, setBootstrap] = useState<Bootstrap>({ categories: [], units: [], warehouses: [], suppliers: [], customers: [], accounts: [], contractorFirms: [] });
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [reportRange, setReportRange] = useState({ from: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`, to: today() });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [productDraft, setProductDraft] = useState({ sku: '', barcode: '', name: '', categoryId: '', unitId: '', minimumStock: '0', defaultPurchasePrice: '', defaultSalePrice: '', currency: 'UZS', tracksBatch: false, tracksExpiry: false });
  const [editingProductId, setEditingProductId] = useState('');
  const [categoryDraft, setCategoryDraft] = useState({ id: '', name: '', parentId: '' });
  const [unitDraft, setUnitDraft] = useState({ id: '', code: '', name: '' });
  const [partnerName, setPartnerName] = useState('');
  const [doc, setDoc] = useState({ documentNumber: '', documentDate: today(), warehouseId: '', destinationWarehouseId: '', supplierId: '', supplierFirmId: '', customerId: '', paymentStatus: 'CREDIT', paymentSourceAccountId: '', currency: 'UZS', exchangeRate: '1', type: 'PURCHASE', notes: '' });
  const [lines, setLines] = useState([{ categoryId: '', productId: '', batchNumber: '', expiryDate: '', quantity: '1', unitPrice: '0', discountAmount: '0' }]);
  const params = useMemo(() => firmId ? { firmId } : {}, [firmId]);

  useEffect(() => {
    if (role === 'FIRM') return;
    api.get('/firms').then((res) => {
      const rows = Array.isArray(res.data) ? res.data : [];
      setFirms(rows);
      setFirmId((current) => current || rows[0]?.id || '');
    }).catch(() => setError('Firmalar ro‘yxatini yuklab bo‘lmadi'));
  }, [role]);

  const load = useCallback(async () => {
    if (!firmId) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [boot, productRows, stockRows, docRows, kpis, reportRows] = await Promise.all([
        api.get('/inventory/bootstrap', { params }), api.get('/inventory/products', { params }), api.get('/inventory/stock', { params }),
        api.get('/inventory/documents', { params }), api.get('/inventory/dashboard', { params }), api.get('/inventory/reports', { params: { ...params, ...reportRange } }),
      ]);
      setBootstrap(boot.data); setProducts(productRows.data); setStock(stockRows.data); setDocuments(docRows.data); setDashboard(kpis.data); setReport(reportRows.data);
      setProductDraft((current) => ({ ...current, categoryId: current.categoryId || boot.data.categories[0]?.id || '', unitId: current.unitId || boot.data.units[0]?.id || '' }));
      setDoc((current) => ({ ...current, warehouseId: current.warehouseId || boot.data.warehouses[0]?.id || '' }));
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || 'Ombor ma’lumotlarini yuklab bo‘lmadi');
    } finally { setLoading(false); }
  }, [firmId, params, reportRange]);

  useEffect(() => { load(); }, [load]);

  const saveProduct = async () => {
    setSaving(true); setError('');
    try {
      if (editingProductId) await api.patch(`/inventory/products/${editingProductId}`, { ...productDraft, firmId });
      else await api.post('/inventory/products', { ...productDraft, firmId });
      setNotice(editingProductId ? 'Mahsulot tahrirlandi' : 'Mahsulot saqlandi');
      setEditingProductId('');
      setProductDraft((current) => ({ ...current, sku: '', barcode: '', name: '', minimumStock: '0', defaultPurchasePrice: '', defaultSalePrice: '' }));
      await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.error || 'Mahsulot saqlanmadi'); }
    finally { setSaving(false); }
  };

  const editProduct = (product: Product) => {
    setEditingProductId(product.id);
    setProductDraft({ sku: product.sku, barcode: product.barcode || '', name: product.name, categoryId: product.category.id, unitId: product.unit.id, minimumStock: String(product.minimumStock), defaultPurchasePrice: String(product.defaultPurchasePrice || ''), defaultSalePrice: String(product.defaultSalePrice || ''), currency: product.currency, tracksBatch: product.tracksBatch, tracksExpiry: product.tracksExpiry });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`${product.name} mahsulotini nofaol qilasizmi? Tarixiy ombor yozuvlari saqlanadi.`)) return;
    try { await api.delete(`/inventory/products/${product.id}`, { data: { firmId } }); setNotice('Mahsulot nofaol qilindi'); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.error || 'Mahsulot o‘chirilmadi'); }
  };

  const saveCategory = async () => {
    if (!categoryDraft.name.trim()) return;
    setSaving(true); setError('');
    try {
      if (categoryDraft.id) await api.patch(`/inventory/categories/${categoryDraft.id}`, { firmId, name: categoryDraft.name });
      else await api.post('/inventory/categories', { firmId, name: categoryDraft.name, parentId: categoryDraft.parentId || null });
      setCategoryDraft({ id: '', name: '', parentId: '' }); setNotice('Kategoriya saqlandi'); await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.error || 'Kategoriya saqlanmadi'); }
    finally { setSaving(false); }
  };

  const deleteCategory = async (category: Named) => {
    if (!window.confirm(`${category.name} kategoriyasini nofaol qilasizmi?`)) return;
    try { await api.delete(`/inventory/categories/${category.id}`, { data: { firmId } }); setNotice('Kategoriya nofaol qilindi'); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.error || 'Kategoriya o‘chirilmadi'); }
  };

  const saveUnit = async () => {
    if (!unitDraft.name.trim()) return;
    setSaving(true); setError('');
    try {
      if (unitDraft.id) await api.patch(`/inventory/units/${unitDraft.id}`, { firmId, name: unitDraft.name });
      else await api.post('/inventory/units', { firmId, code: unitDraft.code, name: unitDraft.name });
      setUnitDraft({ id: '', code: '', name: '' }); setNotice('O‘lchov birligi saqlandi'); await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.error || 'O‘lchov birligi saqlanmadi'); }
    finally { setSaving(false); }
  };

  const deleteUnit = async (unit: Named) => {
    if (!window.confirm(`${unit.name} o‘lchov birligini nofaol qilasizmi?`)) return;
    try { await api.delete(`/inventory/units/${unit.id}`, { data: { firmId } }); setNotice('O‘lchov birligi nofaol qilindi'); await load(); }
    catch (requestError: any) { setError(requestError?.response?.data?.error || 'O‘lchov birligi o‘chirilmadi'); }
  };

  const savePartner = async (kind: 'suppliers' | 'customers') => {
    if (!partnerName.trim()) return;
    setSaving(true); setError('');
    try {
      await api.post(`/inventory/${kind}`, { firmId, name: partnerName });
      setPartnerName(''); setNotice(kind === 'suppliers' ? 'Yetkazib beruvchi qo‘shildi' : 'Mijoz qo‘shildi'); await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.error || 'Saqlanmadi'); }
    finally { setSaving(false); }
  };

  const operationType = tab === 'receipt' ? (['PURCHASE', 'CUSTOMER_RETURN', 'INVENTORY_SURPLUS', 'PRODUCTION_RECEIPT', 'FREE_RECEIPT', 'OTHER_RECEIPT'].includes(doc.type) ? doc.type : 'PURCHASE') : tab === 'sale' ? 'SALE' : doc.type === 'PURCHASE' ? 'INTERNAL_USE' : doc.type;
  const saveDocument = async () => {
    setSaving(true); setError(''); setNotice('');
    try {
      await api.post('/inventory/documents/apply', { ...doc, firmId, type: operationType, lines });
      setNotice('Ombor hujjati qo‘llandi. Qoldiq va moliyaviy registrlar yangilandi.');
      setDoc((current) => ({ ...current, documentNumber: '', notes: '' }));
      setLines([{ categoryId: '', productId: '', batchNumber: '', expiryDate: '', quantity: '1', unitPrice: '0', discountAmount: '0' }]);
      await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.error || 'Ombor hujjati saqlanmadi'); }
    finally { setSaving(false); }
  };

  const cancelDocument = async (row: DocumentRow) => {
    const reason = window.prompt(`${row.documentNumber} hujjatini bekor qilish sababi`);
    if (!reason?.trim()) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api.post(`/inventory/documents/${row.id}/cancel`, { firmId, reason: reason.trim() });
      setNotice('Ombor hujjati bekor qilindi. Qoldiq va ledger reversal yozuvlari yangilandi.');
      await load();
    } catch (requestError: any) { setError(requestError?.response?.data?.error || 'Ombor hujjati bekor qilinmadi'); }
    finally { setSaving(false); }
  };

  const visibleProducts = products.filter((product) => `${product.sku} ${product.barcode || ''} ${product.name}`.toLowerCase().includes(search.toLowerCase()));
  const documentTypeRows = documents.filter((row) => tab === 'receipt' ? ['PURCHASE', 'CUSTOMER_RETURN', 'INVENTORY_SURPLUS', 'PRODUCTION_RECEIPT', 'FREE_RECEIPT', 'OTHER_RECEIPT'].includes(row.type) : tab === 'sale' ? row.type === 'SALE' : true);

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><RefreshCw className="animate-spin text-primary" /></div>;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 pb-24">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Ombor</h1>
          <p className="text-sm text-muted">Mahsulot, qoldiq, sotuv va tannarx — firmaning yagona moliyaviy hisobi bilan bog‘langan.</p>
        </div>
        <div className="flex gap-2">
          {role !== 'FIRM' && <select value={firmId} onChange={(event) => setFirmId(event.target.value)} className="compact-control min-w-52"><option value="">Firma tanlang</option>{firms.map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}</select>}
          <button type="button" onClick={load} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-bold"><RefreshCw size={16} /> Yangilash</button>
        </div>
      </div>

      {(error || notice) && <div className={`rounded-lg border px-4 py-3 text-sm font-semibold ${error ? 'border-red-500/40 bg-red-500/10 text-red-600' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'}`}>{error || notice}</div>}

      <div className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-surface p-2 scroller-minimal">
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => { setTab(key); setError(''); setNotice(''); }} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${tab === key ? 'bg-primary text-ink' : 'text-muted hover:bg-surface-2 hover:text-foreground'}`}>{label}</button>)}
      </div>

      {tab === 'dashboard' && dashboard && <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Mahsulot turi', dashboard.products, Boxes], ['Fizik qoldiq', money(dashboard.physicalStock), PackagePlus], ['Erkin qoldiq', money(dashboard.availableStock), ClipboardList],
            ['Ombor qiymati UZS', money(dashboard.inventoryValue), LayoutDashboard], ['Muddati o‘tgan partiya', dashboard.expiredBatches, AlertTriangle],
          ].map(([label, value, Icon]: any) => <div key={label} className="rounded-xl border border-border bg-surface p-4"><Icon size={20} className="mb-3 text-primary"/><div className="text-xs font-bold uppercase tracking-wide text-muted">{label}</div><div className="mt-1 text-2xl font-black text-foreground">{value}</div></div>)}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[['Oy xaridi', dashboard.monthPurchases], ['Oy sotuvi', dashboard.monthSales], ['Daromad', dashboard.revenue], ['COGS', dashboard.cogs], ['Yalpi foyda', dashboard.grossProfit]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-surface p-4"><div className="text-xs font-bold uppercase text-muted">{label}</div><div className="mt-2 text-xl font-black">{money(value)} UZS</div></div>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Jami SKU soni', dashboard.kpis?.totalSku ?? 0], ['Qoldig‘i mavjud SKU', dashboard.kpis?.inStockSku ?? 0], ['Qoldig‘i 0 SKU', dashboard.kpis?.zeroStockSku ?? 0],
            ['Kam qolgan SKU', dashboard.kpis?.lowStockSku ?? 0], ['Rezervdagi tovarlar', money(dashboard.kpis?.reservedStock)], ['Muddati yaqin partiyalar', dashboard.kpis?.expiringSoonBatches ?? 0],
            ['Eng katta inventory qiymatli mahsulot', dashboard.kpis?.topInventoryProduct?.product?.name || '—'], ['Eng ko‘p sotilgan mahsulot', dashboard.kpis?.topSoldProduct?.product?.name || '—'],
            ['Eng sekin aylanadigan mahsulot', dashboard.kpis?.slowMovingProduct?.product?.name || '—'], ['Inventory turnover', money(dashboard.kpis?.inventoryTurnover)], ['Dead stock qiymati', `${money(dashboard.kpis?.deadStockValue)} UZS`],
          ].map(([label, value]) => <button key={label} type="button" onClick={() => setTab('stock')} className="rounded-xl border border-border bg-surface p-4 text-left hover:bg-surface-2"><div className="text-xs font-bold uppercase text-muted">{label}</div><div className="mt-2 text-lg font-black">{value}</div></button>)}
        </div>
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border p-4"><h2 className="text-lg font-black">Mahsulotlar holati</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase text-muted"><th className="p-3">Mahsulot</th><th className="p-3">Kategoriya</th><th className="p-3">Ombor</th><th className="p-3">Fizik</th><th className="p-3">Rezerv</th><th className="p-3">Erkin</th><th className="p-3">Birlik</th><th className="p-3">O‘rtacha tannarx</th><th className="p-3">Jami qiymat</th><th className="p-3">Oxirgi kirim narxi</th><th className="p-3">Sotuv narxi</th><th className="p-3">Minimal</th><th className="p-3">Status</th><th className="p-3">Yaqin muddat</th><th className="p-3">Oxirgi kirim</th><th className="p-3">Oxirgi chiqim</th></tr></thead>
              <tbody>{(dashboard.productStatuses || []).map((row) => <tr key={row.product.id} className="border-b border-border/60"><td className="p-3 font-bold">{row.product.name}<div className="text-xs text-muted">{row.product.sku}</div></td><td className="p-3">{row.product.category.name}</td><td className="p-3">{row.warehouse?.name || 'Barcha omborlar'}</td><td className="p-3">{money(row.physicalStock)}</td><td className="p-3">{money(row.reservedQuantity)}</td><td className="p-3 font-bold">{money(row.availableStock)}</td><td className="p-3">{row.product.unit.name}</td><td className="p-3">{money(row.averageUnitCost)}</td><td className="p-3 font-bold">{money(row.inventoryValue)} UZS</td><td className="p-3">{money(row.lastPurchasePrice)}</td><td className="p-3">{money(row.salePrice)} {row.product.currency}</td><td className="p-3">{money(row.minimumStock)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${row.status === 'YETARLI' ? 'bg-emerald-500/10 text-emerald-700' : row.status === 'TUGAGAN' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>{row.status.replace('_', ' ')}</span></td><td className="p-3">{row.nearestExpiry ? new Date(row.nearestExpiry).toLocaleDateString('uz-UZ') : '—'}</td><td className="p-3">{row.lastReceipt ? new Date(row.lastReceipt).toLocaleDateString('uz-UZ') : '—'}</td><td className="p-3">{row.lastIssue ? new Date(row.lastIssue).toLocaleDateString('uz-UZ') : '—'}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </>}

      {tab === 'products' && <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-4 text-lg font-black">{editingProductId ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot'}</h2>
          <div className="grid gap-3">
            <input value={productDraft.sku} onChange={(e) => setProductDraft({ ...productDraft, sku: e.target.value })} placeholder="SKU: MAS-001" className="compact-control" />
            <input value={productDraft.barcode} onChange={(e) => setProductDraft({ ...productDraft, barcode: e.target.value })} placeholder="Shtrix-kod" className="compact-control" />
            <input value={productDraft.name} onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })} placeholder="Mahsulot nomi" className="compact-control" />
            <div className="grid grid-cols-2 gap-2"><select value={productDraft.categoryId} onChange={(e) => setProductDraft({ ...productDraft, categoryId: e.target.value })} className="compact-control">{bootstrap.categories.filter((row: any) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select><select value={productDraft.unitId} onChange={(e) => setProductDraft({ ...productDraft, unitId: e.target.value })} className="compact-control">{bootstrap.units.filter((row: any) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            <div className="grid grid-cols-2 gap-2"><input type="number" min="0" value={productDraft.defaultPurchasePrice} onChange={(e) => setProductDraft({ ...productDraft, defaultPurchasePrice: e.target.value })} placeholder="Xarid narxi" className="compact-control" /><input type="number" min="0" value={productDraft.defaultSalePrice} onChange={(e) => setProductDraft({ ...productDraft, defaultSalePrice: e.target.value })} placeholder="Sotuv narxi" className="compact-control" /></div>
            <input type="number" min="0" value={productDraft.minimumStock} onChange={(e) => setProductDraft({ ...productDraft, minimumStock: e.target.value })} placeholder="Minimal qoldiq" className="compact-control" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={productDraft.tracksBatch} onChange={(e) => setProductDraft({ ...productDraft, tracksBatch: e.target.checked })}/> Partiya bo‘yicha yuritilsin</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={productDraft.tracksExpiry} onChange={(e) => setProductDraft({ ...productDraft, tracksExpiry: e.target.checked })}/> Yaroqlilik muddati kuzatilsin</label>
            <div className="flex gap-2"><button type="button" disabled={saving || !productDraft.sku || !productDraft.name} onClick={saveProduct} className="min-h-11 flex-1 rounded-lg bg-primary px-4 font-black text-ink disabled:opacity-50">{editingProductId ? 'Tahrirni saqlash' : 'Saqlash'}</button>{editingProductId && <button type="button" onClick={() => setEditingProductId('')} className="rounded-lg border border-border px-3 font-bold">Bekor qilish</button>}</div>
          </div>
        </section>
        <section className="overflow-hidden rounded-xl border border-border bg-surface"><div className="flex items-center gap-2 border-b border-border p-3"><Search size={18} className="text-muted"/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom, SKU yoki shtrix-kod..." className="w-full bg-transparent outline-none"/></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted"><th className="p-3">SKU</th><th className="p-3">Nomi</th><th className="p-3">Kategoriya</th><th className="p-3">Birlik</th><th className="p-3">Minimal</th><th className="p-3">Sotuv narxi</th><th className="p-3">Amallar</th></tr></thead><tbody>{visibleProducts.map((product) => <tr key={product.id} className="border-b border-border/60"><td className="p-3 font-mono font-bold">{product.sku}</td><td className="p-3 font-bold">{product.name}<div className="text-xs text-muted">{product.barcode}</div></td><td className="p-3">{product.category.name}</td><td className="p-3">{product.unit.name}</td><td className="p-3">{money(product.minimumStock)}</td><td className="p-3">{money(product.defaultSalePrice)} {product.currency}</td><td className="p-3"><div className="flex gap-1"><button type="button" onClick={() => editProduct(product)} aria-label={`${product.name}ni tahrirlash`} className="rounded-md border border-border p-2"><Pencil size={15}/></button><button type="button" onClick={() => deleteProduct(product)} aria-label={`${product.name}ni o‘chirish`} className="rounded-md border border-red-500/30 p-2 text-red-600"><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div></section>
      </div>}

      {(['receipt', 'issue', 'sale'] as Tab[]).includes(tab) && <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-4 flex items-center gap-2">{tab === 'sale' ? <ShoppingCart className="text-primary"/> : <Truck className="text-primary"/>}<h2 className="text-lg font-black">{tab === 'receipt' ? 'Ombor kirimi' : tab === 'sale' ? 'Mahsulot sotuvi' : 'Ombor chiqimi'}</h2></div>
          <div className="grid gap-3 md:grid-cols-3">
            <input value={doc.documentNumber} onChange={(e) => setDoc({ ...doc, documentNumber: e.target.value })} placeholder="Hujjat №" className="compact-control" />
            <input type="date" value={doc.documentDate} onChange={(e) => setDoc({ ...doc, documentDate: e.target.value })} className="compact-control" />
            <select value={doc.warehouseId} onChange={(e) => setDoc({ ...doc, warehouseId: e.target.value })} className="compact-control">{bootstrap.warehouses.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            {tab === 'receipt' && <select value={operationType} onChange={(e) => setDoc({ ...doc, type: e.target.value })} className="compact-control"><option value="PURCHASE">Xarid</option><option value="CUSTOMER_RETURN">Mijozdan qaytarish</option><option value="INVENTORY_SURPLUS">Inventarizatsiya ortiqchasi</option><option value="PRODUCTION_RECEIPT">Ishlab chiqarishdan kirim</option><option value="FREE_RECEIPT">Bepul olingan</option><option value="OTHER_RECEIPT">Boshqa</option></select>}
            {tab === 'receipt' && <select value={doc.supplierFirmId || (doc.supplierId ? `local:${doc.supplierId}` : '')} onChange={(e) => setDoc({ ...doc, supplierFirmId: e.target.value.startsWith('local:') ? '' : e.target.value, supplierId: e.target.value.startsWith('local:') ? e.target.value.slice(6) : '' })} className="compact-control"><option value="">Pudratchi / yetkazib beruvchi</option><optgroup label="Firmalar bo‘limidan">{bootstrap.contractorFirms.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</optgroup>{bootstrap.suppliers.length > 0 && <optgroup label="Omborda qo‘shilgan">{bootstrap.suppliers.map((row) => <option key={row.id} value={`local:${row.id}`}>{row.name}</option>)}</optgroup>}</select>}
            {tab === 'sale' && <select value={doc.customerId} onChange={(e) => setDoc({ ...doc, customerId: e.target.value })} className="compact-control"><option value="">Mijoz</option>{bootstrap.customers.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
            {tab === 'issue' && <select value={operationType} onChange={(e) => setDoc({ ...doc, type: e.target.value })} className="compact-control"><option value="INTERNAL_USE">Ichki foydalanish</option><option value="TRANSFER">Boshqa omborga transfer</option><option value="WRITE_OFF">Brak / write-off</option><option value="SUPPLIER_RETURN">Yetkazib beruvchiga qaytarish</option><option value="EMPLOYEE_ISSUE">Xodimga berish</option><option value="INVENTORY_SHORTAGE">Inventarizatsiya kamomadi</option><option value="OTHER_ISSUE">Boshqa</option></select>}
            {operationType === 'TRANSFER' && <select value={doc.destinationWarehouseId} onChange={(e) => setDoc({ ...doc, destinationWarehouseId: e.target.value })} className="compact-control"><option value="">Qabul qiluvchi ombor</option>{bootstrap.warehouses.filter((row) => row.id !== doc.warehouseId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}
            {(tab === 'receipt' || tab === 'sale') && <><select value={doc.paymentStatus} onChange={(e) => setDoc({ ...doc, paymentStatus: e.target.value })} className="compact-control"><option value="CREDIT">Qarzga</option><option value="PAID">Darhol to‘langan</option>{tab === 'receipt' && <option value="ADVANCE">Avansdan yopildi</option>}</select>{doc.paymentStatus === 'PAID' && <select value={doc.paymentSourceAccountId} onChange={(e) => setDoc({ ...doc, paymentSourceAccountId: e.target.value })} className="compact-control"><option value="">Kassa / karta / bank</option>{bootstrap.accounts.filter((row) => !row.currency || row.currency === doc.currency).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>}</>}
            <select value={doc.currency} onChange={(e) => setDoc({ ...doc, currency: e.target.value, exchangeRate: e.target.value === 'UZS' ? '1' : doc.exchangeRate })} className="compact-control"><option>UZS</option><option>USD</option><option>EUR</option></select>
            {doc.currency !== 'UZS' && <input type="number" min="0.000001" value={doc.exchangeRate} onChange={(e) => setDoc({ ...doc, exchangeRate: e.target.value })} placeholder="Kurs UZS" className="compact-control" />}
          </div>
          <div className="mt-4 space-y-2">{lines.map((line, index) => <div key={index} className="grid gap-2 rounded-lg border border-border bg-surface-2 p-3 md:grid-cols-12">
            <label className="grid gap-1 text-xs font-bold text-muted md:col-span-2">Kategoriya<select value={line.categoryId} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, categoryId: e.target.value, productId: '' } : row))} className="compact-control font-normal text-foreground"><option value="">Barcha kategoriyalar</option>{bootstrap.categories.filter((row) => row.isActive).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-bold text-muted md:col-span-3">Mahsulot nomi<select value={line.productId} onChange={(e) => { const selected = products.find((p) => p.id === e.target.value); setLines((rows) => rows.map((row, i) => i === index ? { ...row, productId: e.target.value, categoryId: selected?.category.id || row.categoryId, unitPrice: String(tab === 'sale' ? selected?.defaultSalePrice || 0 : tab === 'receipt' ? selected?.defaultPurchasePrice || 0 : 0) } : row)); }} className="compact-control font-normal text-foreground"><option value="">Mahsulot tanlang</option>{products.filter((row) => !line.categoryId || row.category.id === line.categoryId).map((row) => <option key={row.id} value={row.id}>{row.sku} — {row.name}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-bold text-muted md:col-span-2">Soni<input type="number" min="0.0001" step="any" value={line.quantity} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} className="compact-control font-normal text-foreground" /></label>
            <label className="grid gap-1 text-xs font-bold text-muted md:col-span-2">1 dona narxi<input type="number" min="0" step="any" value={line.unitPrice} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, unitPrice: e.target.value } : row))} disabled={tab === 'issue'} className="compact-control font-normal text-foreground disabled:opacity-60" /></label>
            <div className="grid gap-1 text-xs font-bold text-muted md:col-span-2"><span>Jami summasi</span><div className="compact-control flex items-center font-black text-foreground">{money(Number(line.quantity || 0) * Number(line.unitPrice || 0))} {doc.currency}</div></div>
            <button type="button" aria-label="Mahsulot qatorini olib tashlash" onClick={() => setLines((rows) => rows.length === 1 ? rows : rows.filter((_, i) => i !== index))} className="mt-5 rounded-lg border border-red-500/30 px-2 text-red-600 md:col-span-1"><Trash2 size={16} className="mx-auto"/></button>
            <label className="grid gap-1 text-xs font-bold text-muted md:col-span-3">Partiya №<input value={line.batchNumber} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, batchNumber: e.target.value } : row))} className="compact-control font-normal text-foreground" /></label>
            {tab === 'receipt' && <label className="grid gap-1 text-xs font-bold text-muted md:col-span-3">Yaroqlilik sanasi<input type="date" value={line.expiryDate} onChange={(e) => setLines((rows) => rows.map((row, i) => i === index ? { ...row, expiryDate: e.target.value } : row))} className="compact-control font-normal text-foreground" /></label>}
          </div>)}</div>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => setLines((rows) => [...rows, { categoryId: '', productId: '', batchNumber: '', expiryDate: '', quantity: '1', unitPrice: '0', discountAmount: '0' }])} className="min-h-10 rounded-lg border border-border px-4 text-sm font-bold">+ Mahsulot qatori</button><button type="button" disabled={saving || !doc.documentNumber || lines.some((line) => !line.productId)} onClick={saveDocument} className="min-h-10 rounded-lg bg-primary px-5 font-black text-ink disabled:opacity-50">Tasdiqlash va qo‘llash</button></div>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4"><h3 className="mb-3 font-black">So‘nggi hujjatlar</h3><div className="space-y-2">{documentTypeRows.slice(0, 12).map((row) => <div key={row.id} className="rounded-lg border border-border p-3"><div className="flex justify-between gap-2"><span className="font-bold">{row.documentNumber}</span><span className="text-xs text-muted">{new Date(row.documentDate).toLocaleDateString('uz-UZ')}</span></div><div className="mt-1 text-xs text-muted">{row.type} · {row.warehouse.name}</div><div className="mt-2 font-black">{money(row.netAmount)} {row.currency}</div></div>)}</div></section>
      </div>}

      {(['stock', 'batches'] as Tab[]).includes(tab) && <section className="overflow-hidden rounded-xl border border-border bg-surface"><div className="border-b border-border p-4"><h2 className="text-lg font-black">{tab === 'batches' ? 'Partiyalar va yaroqlilik' : 'Joriy qoldiq nazorati'}</h2><p className="text-sm text-muted">Qoldiq ombor harakatlari va partiya registridan serverda hisoblanadi.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted"><th className="p-3">Mahsulot</th><th className="p-3">Fizik</th><th className="p-3">Rezerv</th><th className="p-3">Erkin</th><th className="p-3">O‘rtacha tannarx</th><th className="p-3">Qiymat UZS</th><th className="p-3">Minimal qoldiq</th><th className="p-3">Holat</th><th className="p-3">Yaqin muddat</th></tr></thead><tbody>{stock.map((row) => <tr key={row.product.id} className="border-b border-border/60"><td className="p-3"><div className="font-bold">{row.product.name}</div><div className="text-xs text-muted">{row.product.sku} · {row.product.unit.name}</div></td><td className="p-3">{money(row.physicalStock)}</td><td className="p-3">{money(row.reservedQuantity)}</td><td className="p-3 font-bold">{money(row.availableStock)}</td><td className="p-3">{money(row.averageUnitCost)}</td><td className="p-3 font-bold">{money(row.inventoryValue)}</td><td className="p-3">{money(row.minimumStock)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${row.status === 'YETARLI' ? 'bg-emerald-500/10 text-emerald-700' : row.status === 'TUGAGAN' ? 'bg-red-500/10 text-red-700' : 'bg-amber-500/10 text-amber-700'}`}>{row.status.replace('_', ' ')}</span></td><td className="p-3">{row.nearestExpiry ? new Date(row.nearestExpiry).toLocaleDateString('uz-UZ') : '—'}</td></tr>)}</tbody></table></div></section>}

      {tab === 'reports' && report && <div className="space-y-4">
        <section className="rounded-xl border border-border bg-surface p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-lg font-black">Omborchi hisoboti</h2><p className="text-sm text-muted">Ombor harakati va firmaga ± moliyaviy ta’siri ledger yozuvlaridan olinadi.</p></div><div className="flex flex-wrap gap-2"><label className="grid gap-1 text-xs font-bold text-muted">Dan<input type="date" value={reportRange.from} onChange={(e) => setReportRange({ ...reportRange, from: e.target.value })} className="compact-control font-normal text-foreground"/></label><label className="grid gap-1 text-xs font-bold text-muted">Gacha<input type="date" value={reportRange.to} onChange={(e) => setReportRange({ ...reportRange, to: e.target.value })} className="compact-control font-normal text-foreground"/></label></div></div></section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">{[['Kirim soni', report.summary.incomingQuantity], ['Chiqim soni', report.summary.outgoingQuantity], ['Inventory +', report.summary.inventoryIncrease], ['Inventory −', report.summary.inventoryDecrease], ['Daromad', report.summary.revenue], ['COGS', report.summary.cogs], ['Yalpi foyda', report.summary.grossProfit]].map(([label, value]) => <div key={label} className="rounded-xl border border-border bg-surface p-4"><div className="text-xs font-bold uppercase text-muted">{label}</div><div className="mt-2 text-lg font-black">{money(value)}{label.includes('soni') ? '' : ' UZS'}</div></div>)}</div>
        <section className="overflow-hidden rounded-xl border border-border bg-surface"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase text-muted"><th className="p-3">Sana / hujjat</th><th className="p-3">Mahsulot nomi</th><th className="p-3">Soni</th><th className="p-3">1 dona narxi</th><th className="p-3">Jami summasi</th><th className="p-3">Pudratchi</th><th className="p-3">Kim kiritdi</th><th className="p-3">Moliyaviy ta’sir</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row.id} className="border-b border-border/60 align-top"><td className="p-3"><div>{new Date(row.movementDate).toLocaleDateString('uz-UZ')}</div><div className="text-xs text-muted">{row.documentNumber || '—'} · {row.movementType}</div></td><td className="p-3 font-bold">{row.product.name}<div className="text-xs font-normal text-muted">{row.product.sku} · {row.warehouse.name}</div></td><td className="p-3">{money(row.quantity)} {row.product.unit.name}</td><td className="p-3">{money(row.unitCost)} UZS</td><td className="p-3 font-bold">{money(row.totalCost)} UZS</td><td className="p-3">{row.counterparty || '—'}</td><td className="p-3">{row.enteredBy}</td><td className="p-3">{row.financialEntries.length ? row.financialEntries.map((entry, i) => <div key={i} className="mb-1 text-xs"><span className="font-bold">D {entry.debitAccount}</span> / K {entry.creditAccount}: {money(entry.amount)}</div>) : <span className="text-muted">Moliyaviy ta’sir yo‘q</span>}</td></tr>)}</tbody></table></div></section>
      </div>}

      {(tab === 'suppliers' || tab === 'customers') && <section className="rounded-xl border border-border bg-surface p-4"><div className="mb-4 flex flex-col gap-2 sm:flex-row"><input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder={tab === 'suppliers' ? 'Yangi yetkazib beruvchi nomi' : 'Yangi mijoz nomi'} className="compact-control flex-1"/><button type="button" disabled={saving || !partnerName.trim()} onClick={() => savePartner(tab)} className="min-h-11 rounded-lg bg-primary px-5 font-black text-ink disabled:opacity-50">Qo‘shish</button></div>{tab === 'suppliers' && bootstrap.contractorFirms.length > 0 && <><h3 className="mb-2 font-black">Firmalar bo‘limidagi pudratchilar</h3><div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{bootstrap.contractorFirms.map((row) => <div key={row.id} className="rounded-lg border border-primary/30 bg-primary/5 p-4"><Users className="mb-3 text-primary" size={20}/><div className="font-black">{row.name}</div><div className="text-xs text-muted">{row.kind || 'Firma'} {row.phone ? `· ${row.phone}` : ''}</div></div>)}</div></>}<h3 className="mb-2 font-black">Ombor ro‘yxati</h3><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{bootstrap[tab].map((row) => <div key={row.id} className="rounded-lg border border-border p-4"><Users className="mb-3 text-primary" size={20}/><div className="font-black">{row.name}</div></div>)}</div></section>}

      {tab === 'warehouses' && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{bootstrap.warehouses.map((row) => <div key={row.id} className="rounded-xl border border-border bg-surface p-5"><Boxes className="mb-3 text-primary"/><div className="text-lg font-black">{row.name}</div><div className="text-sm text-muted">{row.code}</div></div>)}</section>}

      {tab === 'settings' && <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 font-black">Mahsulot kategoriyalari</h2>
          <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={categoryDraft.name} onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })} placeholder="Kategoriya nomi" className="compact-control"/>
            <select value={categoryDraft.parentId} onChange={(e) => setCategoryDraft({ ...categoryDraft, parentId: e.target.value })} disabled={Boolean(categoryDraft.id)} className="compact-control"><option value="">Yuqori kategoriya yo‘q</option>{bootstrap.categories.filter((row) => row.isActive && row.id !== categoryDraft.id).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
            <button type="button" onClick={saveCategory} disabled={saving || !categoryDraft.name.trim()} className="rounded-lg bg-primary px-4 font-black text-ink disabled:opacity-50">{categoryDraft.id ? 'Saqlash' : 'Qo‘shish'}</button>
          </div>
          <div className="space-y-2">{bootstrap.categories.map((row) => <div key={row.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${row.isActive ? 'border-border' : 'border-red-500/30 text-muted'}`}><div><span className="font-bold">{row.name}</span>{row.parentId && <span className="ml-2 text-xs text-muted">ichki kategoriya</span>}</div><div className="flex gap-1"><button type="button" onClick={() => setCategoryDraft({ id: row.id, name: row.name, parentId: row.parentId || '' })} className="rounded-md border border-border p-2" aria-label={`${row.name}ni tahrirlash`}><Pencil size={14}/></button>{row.isActive && <button type="button" onClick={() => deleteCategory(row)} className="rounded-md border border-red-500/30 p-2 text-red-600" aria-label={`${row.name}ni o‘chirish`}><Trash2 size={14}/></button>}</div></div>)}</div>
        </section>
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 font-black">O‘lchov birliklari</h2>
          <form onSubmit={(event) => { event.preventDefault(); void saveUnit(); }} aria-label="O‘lchov birligi qo‘shish" className="mb-4 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
            <input aria-label="Birlik kodi" value={unitDraft.code} onChange={(e) => setUnitDraft({ ...unitDraft, code: e.target.value.toUpperCase() })} placeholder="Kod: DONA" disabled={Boolean(unitDraft.id)} className="compact-control uppercase"/>
            <input aria-label="Birlik nomi" value={unitDraft.name} onChange={(e) => setUnitDraft({ ...unitDraft, name: e.target.value })} placeholder="Birlik nomi" className="compact-control" required/>
            <button type="submit" disabled={saving || !unitDraft.name.trim()} className="rounded-lg bg-primary px-4 font-black text-ink disabled:opacity-50">{unitDraft.id ? 'Saqlash' : 'Qo‘shish'}</button>
          </form>
          <div className="space-y-2">{bootstrap.units.map((row) => <div key={row.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${row.isActive ? 'border-border' : 'border-red-500/30 text-muted'}`}><div><span className="font-bold">{row.name}</span><span className="ml-2 text-xs text-muted">{row.code}</span></div><div className="flex gap-1"><button type="button" onClick={() => setUnitDraft({ id: row.id, code: row.code || '', name: row.name })} className="rounded-md border border-border p-2" aria-label={`${row.name}ni tahrirlash`}><Pencil size={14}/></button>{row.isActive && <button type="button" onClick={() => deleteUnit(row)} className="rounded-md border border-red-500/30 p-2 text-red-600" aria-label={`${row.name}ni o‘chirish`}><Trash2 size={14}/></button>}</div></div>)}</div>
          <p className="mt-4 text-xs text-muted">Konvertatsiya koeffitsiyenti mavjud bo‘lmasa tizim yashirin taxmin qilmaydi.</p>
        </section>
      </div>}

      {(tab === 'audit' || tab === 'count') && <section className="rounded-xl border border-border bg-surface p-4"><h2 className="mb-3 text-lg font-black">{tab === 'audit' ? 'Ombor hujjatlari auditi' : 'Inventarizatsiya'}</h2>{tab === 'count' ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">Inventarizatsiya ortiqchasi va kamomadi “Kirim” / “Chiqim” hujjatlari orqali ledgerga yoziladi. Alohida sanash dalolatnomasi oqimi keyingi bosqichda qo‘shiladi.</div> : <div className="space-y-2">{documents.map((row) => <div key={row.id} className="flex flex-col justify-between gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center"><div><span className="font-bold">{row.documentNumber}</span><span className="ml-2 text-xs text-muted">{row.type} · {row.status}</span><div className="mt-1 text-sm text-muted">{row.lines.length} qator · {money(row.netAmount)} {row.currency}</div></div><button type="button" disabled={saving || row.status !== 'APPLIED' || !canCancelInventoryDocument} onClick={() => cancelDocument(row)} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-red-500/30 px-3 text-sm font-bold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={15}/> Bekor qilish</button></div>)}</div>}</section>}
    </div>
  );
}
