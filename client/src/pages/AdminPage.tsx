import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgePercent, FileSpreadsheet, FileText, Mail, MessageSquare, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { Button, Card } from '../components/ui';
import { api, downloadFile } from '../lib/api';
import { useToast } from '../hooks/useToast';

type Plan={id:string;name:string;description:string|null;priceInr:number;durationDays:number;aiCredits:number;reportExportsEnabled:boolean;active:boolean;hidden:boolean;razorpayPlanId:string|null};
type Coupon={id:string;code:string;discountPercent:number;grantDays:number|null;maxRedemptions:number|null;active:boolean;validFrom:string;validUntil:string|null;plan:{name:string}|null;_count:{redemptions:number}};
type User={id:string;email:string;name:string|null;phoneNumber:string|null;role:'USER'|'ADMIN';isSuspended:boolean;_count:{resources:number;subscriptions:number}};
const blankPlan={name:'',description:'',priceInr:'29',durationDays:'30',aiCredits:'30',reportExportsEnabled:true,razorpayPlanId:''};
const blankCoupon={code:'',discountPercent:'10',planId:'',grantDays:'',maxRedemptions:'',validUntil:'',razorpayOfferId:''};
export function AdminPage() {
  const { notify } = useToast();
  const qc = useQueryClient();
  const [planForm, setPlanForm] = useState(blankPlan);
  const [couponForm, setCouponForm] = useState(blankCoupon);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api<{ users: number; resources: number; plans: number; coupons: number; activeSubscriptions: number }>('/admin/overview') });
  const plans = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api<{ plans: Plan[] }>('/admin/plans') });
  const coupons = useQuery({ queryKey: ['admin', 'coupons'], queryFn: () => api<{ coupons: Coupon[] }>('/admin/coupons') });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<{ users: User[] }>('/admin/users') });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const fail = (error: unknown) => notify(error instanceof Error ? error.message : 'Request failed', 'error');
  const savePlan = useMutation({
    mutationFn: () => {
      const data = { ...planForm, description: planForm.description || null, razorpayPlanId: planForm.razorpayPlanId || null, priceInr: Number(planForm.priceInr), durationDays: Number(planForm.durationDays), aiCredits: Number(planForm.aiCredits) };
      return editingPlan ? api(`/admin/plans/${editingPlan}`, { method: 'PATCH', body: JSON.stringify(data) }) : api('/admin/plans', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => { setPlanForm(blankPlan); setEditingPlan(null); refresh(); notify('Plan saved.'); },
    onError: fail,
  });
  const saveCoupon = useMutation({
    mutationFn: () => api('/admin/coupons', { method: 'POST', body: JSON.stringify({ ...couponForm, code: couponForm.code || undefined, planId: couponForm.planId || null, razorpayOfferId: couponForm.razorpayOfferId || null, discountPercent: Number(couponForm.discountPercent), grantDays: couponForm.grantDays ? Number(couponForm.grantDays) : null, maxRedemptions: couponForm.maxRedemptions ? Number(couponForm.maxRedemptions) : null, validUntil: couponForm.validUntil || null }) }),
    onSuccess: () => { setCouponForm(blankCoupon); refresh(); notify('Coupon created.'); },
    onError: fail,
  });
  const change = useMutation({
    mutationFn: ({ path, method = 'PATCH', data }: { path: string; method?: string; data?: object }) => api(path, { method, body: data ? JSON.stringify(data) : undefined }),
    onSuccess: refresh,
    onError: fail,
  });
  const announce = useMutation({
    mutationFn: ({ couponId, channel }: { couponId: string; channel: 'EMAIL' | 'SMS' }) => api<{ sent: number; skipped: number }>(`/admin/coupons/${couponId}/notify`, { method: 'POST', body: JSON.stringify({ channel, recipientMode: selected.length ? 'SELECTED' : 'ALL', userIds: selected }) }),
    onSuccess: result => notify(`${result.sent} message${result.sent === 1 ? '' : 's'} sent${result.skipped ? `; ${result.skipped} skipped` : ''}.`),
    onError: fail,
  });
  const stats = overview.data;
  const loading = overview.isLoading || plans.isLoading || coupons.isLoading || users.isLoading;
  const toggle = (id: string) => setSelected(value => value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  const exportReport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format);
    try { await downloadFile(`/admin/reports/${format}`, `snoq-admin-report.${format}`); notify(`${format === 'xlsx' ? 'Excel' : 'PDF'} report downloaded.`); }
    catch (error) { fail(error); }
    finally { setExporting(null); }
  };
  const editPlan = (plan: Plan) => {
    setEditingPlan(plan.id);
    setPlanForm({ name: plan.name, description: plan.description ?? '', priceInr: String(plan.priceInr), durationDays: String(plan.durationDays), aiCredits: String(plan.aiCredits), reportExportsEnabled: plan.priceInr > 0 && plan.reportExportsEnabled, razorpayPlanId: plan.razorpayPlanId ?? '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return <div className="max-w-7xl">
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><p className="text-sm font-semibold text-vault-600">SNOQ control center</p><h1 className="mt-1 text-3xl font-bold">Admin panel</h1><p className="mt-2 text-slate-500">Manage users, plans, coupons, announcements, and secure reports.</p></div>
      <p className="text-sm text-slate-500">{selected.length ? `${selected.length} selected recipient${selected.length === 1 ? '' : 's'}` : 'Announcements target all active users'}</p>
    </header>

    <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[['Users', stats?.users, Users], ['Resources', stats?.resources, ShieldCheck], ['Plans', stats?.plans, ShieldCheck], ['Coupons', stats?.coupons, BadgePercent], ['Active', stats?.activeSubscriptions, ShieldCheck]].map(([label, value, Icon]) => {
        const StatIcon = Icon as typeof Users;
        return <Card key={label as string} className="p-4"><StatIcon size={18} className="text-vault-600" /><p className="mt-3 text-2xl font-bold">{loading ? '—' : value as number}</p><p className="text-sm text-slate-500">{label as string}</p></Card>;
      })}
    </div>

    <Card className="mt-6 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Admin reports</h2><p className="mt-1 text-sm text-slate-500">Download detailed, private records for users, subscriptions, and coupons.</p></div><div className="flex flex-wrap gap-2"><Button variant="muted" className="action-info" disabled={exporting !== null} onClick={() => void exportReport('xlsx')}><FileSpreadsheet size={16} />{exporting === 'xlsx' ? 'Preparing Excel…' : 'Export Excel'}</Button><Button variant="muted" className="action-danger" disabled={exporting !== null} onClick={() => void exportReport('pdf')}><FileText size={16} />{exporting === 'pdf' ? 'Preparing PDF…' : 'Export PDF'}</Button></div></div></Card>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <Card className="p-5"><div className="flex items-center justify-between"><h2 className="font-bold">{editingPlan ? 'Edit plan' : 'Create a plan'}</h2>{editingPlan && <button className="text-sm font-semibold text-slate-500" onClick={() => { setEditingPlan(null); setPlanForm(blankPlan); }}>Cancel</button>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="field" placeholder="Plan name" value={planForm.name} onChange={event => setPlanForm({ ...planForm, name: event.target.value })} /><input className="field" type="number" placeholder="Price INR" value={planForm.priceInr} onChange={event => setPlanForm({ ...planForm, priceInr: event.target.value })} /><input className="field" type="number" placeholder="Duration in days" value={planForm.durationDays} onChange={event => setPlanForm({ ...planForm, durationDays: event.target.value })} /><input className="field" type="number" placeholder="AI credits" value={planForm.aiCredits} onChange={event => setPlanForm({ ...planForm, aiCredits: event.target.value })} /></div><input className="field mt-3" placeholder="Razorpay plan ID (optional)" value={planForm.razorpayPlanId} onChange={event => setPlanForm({ ...planForm, razorpayPlanId: event.target.value })} /><label className={`mt-3 flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold ${Number(planForm.priceInr) <= 0 ? 'cursor-not-allowed opacity-60' : ''}`}><input type="checkbox" checked={Number(planForm.priceInr) > 0 && planForm.reportExportsEnabled} disabled={Number(planForm.priceInr) <= 0} onChange={event => setPlanForm({ ...planForm, reportExportsEnabled: event.target.checked })} />Include private PDF, Excel, and email reports <span className="ml-auto text-xs font-medium text-slate-500">Paid plans only</span></label><textarea className="field mt-3 min-h-20" placeholder="Short description" value={planForm.description} onChange={event => setPlanForm({ ...planForm, description: event.target.value })} /><Button className="mt-4" disabled={!planForm.name || savePlan.isPending} onClick={() => savePlan.mutate()}>{editingPlan ? 'Save plan' : 'Create plan'}</Button></Card>
      <Card className="p-5"><h2 className="font-bold">Create a coupon</h2><p className="mt-1 text-sm text-slate-500">Expiry, usage limits, plan targeting, and Razorpay offers are supported.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="field" placeholder="Coupon code (auto if blank)" value={couponForm.code} onChange={event => setCouponForm({ ...couponForm, code: event.target.value.toUpperCase() })} /><input className="field" type="number" min="0" max="100" placeholder="Discount %" value={couponForm.discountPercent} onChange={event => setCouponForm({ ...couponForm, discountPercent: event.target.value })} /><select className="field" value={couponForm.planId} onChange={event => setCouponForm({ ...couponForm, planId: event.target.value })}><option value="">All plans</option>{plans.data?.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select><input className="field" type="number" placeholder="Usage limit" value={couponForm.maxRedemptions} onChange={event => setCouponForm({ ...couponForm, maxRedemptions: event.target.value })} /><input className="field" type="date" aria-label="Coupon expiry" value={couponForm.validUntil} onChange={event => setCouponForm({ ...couponForm, validUntil: event.target.value })} /><input className="field" type="number" placeholder="Grant days (100% coupon)" value={couponForm.grantDays} onChange={event => setCouponForm({ ...couponForm, grantDays: event.target.value })} /></div><input className="field mt-3" placeholder="Razorpay offer ID (paid discount)" value={couponForm.razorpayOfferId} onChange={event => setCouponForm({ ...couponForm, razorpayOfferId: event.target.value })} /><Button className="mt-4" disabled={saveCoupon.isPending} onClick={() => saveCoupon.mutate()}><Plus size={16} />Create coupon</Button></Card>
    </div>

    <Card className="mt-6 overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 p-5"><h2 className="font-bold">Plans</h2><span className="text-sm text-slate-500">Edit pricing, credits, reports, duration, and visibility.</span></div><div className="divide-y divide-slate-100">{plans.data?.plans.map(plan => <div key={plan.id} className="flex flex-wrap items-center gap-3 p-4"><div className="min-w-48 flex-1"><p className="font-semibold">{plan.name}</p><p className="text-sm text-slate-500">₹{plan.priceInr} · {plan.durationDays} days · {plan.aiCredits} assists · {plan.priceInr > 0 && plan.reportExportsEnabled ? 'Reports included' : 'Reports locked'} · {plan.hidden ? 'Hidden' : plan.active ? 'Visible' : 'Inactive'}</p></div><Button variant="muted" className="action-info px-3 py-2 text-xs" onClick={() => editPlan(plan)}><Pencil size={14} />Edit</Button><Button variant="muted" className="action-info px-3 py-2 text-xs" disabled={plan.priceInr <= 0} onClick={() => change.mutate({ path: `/admin/plans/${plan.id}`, data: { reportExportsEnabled: !plan.reportExportsEnabled } })}>{plan.reportExportsEnabled ? 'Lock reports' : 'Unlock reports'}</Button><Button variant="muted" className="action-warning px-3 py-2 text-xs" onClick={() => change.mutate({ path: `/admin/plans/${plan.id}`, data: { hidden: !plan.hidden } })}>{plan.hidden ? 'Unhide' : 'Hide'}</Button><Button variant="muted" className="action-danger px-3 py-2 text-xs" onClick={() => change.mutate({ path: `/admin/plans/${plan.id}`, data: { active: !plan.active } })}>{plan.active ? 'Deactivate' : 'Activate'}</Button></div>)}</div></Card>

    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <Card className="overflow-hidden"><div className="border-b border-slate-200 p-5"><h2 className="font-bold">Coupon management</h2></div><div className="divide-y divide-slate-100">{coupons.data?.coupons.map(coupon => <div key={coupon.id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{coupon.code} · {coupon.discountPercent}% off</p><p className="mt-1 text-sm text-slate-500">{coupon.plan?.name ?? 'All plans'} · {coupon._count.redemptions}{coupon.maxRedemptions ? `/${coupon.maxRedemptions}` : ''} uses · {coupon.validUntil ? `Expires ${new Date(coupon.validUntil).toLocaleDateString()}` : 'No expiry'} · {coupon.active ? 'Active' : 'Disabled'}</p></div><Button variant="muted" className="action-warning px-3 py-2 text-xs" onClick={() => change.mutate({ path: `/admin/coupons/${coupon.id}`, data: { active: !coupon.active } })}>{coupon.active ? 'Disable' : 'Enable'}</Button></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="muted" className="px-3 py-2 text-xs" disabled={announce.isPending} onClick={() => announce.mutate({ couponId: coupon.id, channel: 'EMAIL' })}><Mail size={14} />Email {selected.length ? 'selected' : 'all'}</Button><Button variant="muted" className="px-3 py-2 text-xs" disabled={announce.isPending} onClick={() => announce.mutate({ couponId: coupon.id, channel: 'SMS' })}><MessageSquare size={14} />SMS {selected.length ? 'selected' : 'all'}</Button><Button variant="muted" className="action-danger px-3 py-2 text-xs" onClick={() => { if (window.confirm(`Delete ${coupon.code}?`)) change.mutate({ path: `/admin/coupons/${coupon.id}`, method: 'DELETE' }); }}><Trash2 size={14} />Delete</Button></div></div>)}</div></Card>
      <Card className="overflow-hidden"><div className="flex items-center justify-between border-b border-slate-200 p-5"><h2 className="font-bold">User management</h2><button className="text-sm font-semibold text-vault-600" onClick={() => setSelected(selected.length ? [] : (users.data?.users.filter(user => !user.isSuspended).map(user => user.id) ?? []))}>{selected.length ? 'Clear selection' : 'Select active users'}</button></div><div className="divide-y divide-slate-100">{users.data?.users.map(user => <div key={user.id} className="flex items-center gap-3 p-4"><input type="checkbox" checked={selected.includes(user.id)} onChange={() => toggle(user.id)} aria-label={`Select ${user.email}`} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{user.name || user.email}</p><p className="truncate text-sm text-slate-500">{user.email} · {user.phoneNumber ?? 'No phone'} · {user._count.resources} resources · {user.role} · {user.isSuspended ? 'Suspended' : 'Active'}</p></div><select className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs" value={user.role} onChange={event => { const role = event.target.value; if (window.confirm(`Change ${user.email} to ${role}? This changes administrator access.`)) change.mutate({ path: `/admin/users/${user.id}`, data: { role } }); }}><option value="USER">User</option><option value="ADMIN">Admin</option></select><Button variant="muted" className="px-3 py-2 text-xs" onClick={() => { if (window.confirm(`${user.isSuspended ? 'Restore' : 'Suspend'} ${user.email}?`)) change.mutate({ path: `/admin/users/${user.id}`, data: { isSuspended: !user.isSuspended } }); }}>{user.isSuspended ? 'Restore' : 'Suspend'}</Button><Button variant="muted" className="action-danger px-3 py-2 text-xs" onClick={() => { if (window.confirm(`Delete ${user.email} and all their data?`)) change.mutate({ path: `/admin/users/${user.id}`, method: 'DELETE' }); }}><Trash2 size={14} /></Button></div>)}</div></Card>
    </div>
  </div>;
}