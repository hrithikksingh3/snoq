import { useQuery } from '@tanstack/react-query';
import { BarChart3, FileText, FolderOpen, Globe2, Layers3, Plus, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '../lib/api';
import { Card } from '../components/ui';
import type { Resource } from '../types';

type Dashboard = { stats: { resources: number; documents: number; favorites: number; categories: number }; categoryDistribution: { name: string; value: number }[]; recent: Resource[] };
const colors = ['#3b6df6', '#8ce0c1', '#f4b860', '#a78bfa', '#fb7185', '#38bdf8'];

const resourceVisual = (resource: Resource) => {
  if (resource.kind === 'DOCUMENT') return { Icon: FileText, color: 'bg-violet-100 text-violet-700', label: 'Document' };
  if (resource.resourceType === 'Website') return { Icon: Globe2, color: 'bg-sky-100 text-sky-700', label: 'Website' };
  return { Icon: Layers3, color: 'bg-vault-100 text-vault-600', label: resource.resourceType };
};

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<Dashboard>('/dashboard') });
  if (isLoading) return <p className="text-slate-500">Loading your vault…</p>;
  const recent = data?.recent.slice(0, 6) ?? [];
  const recentSpan = (index: number) => {
    if (recent.length === 1) return 'col-span-6';
    if (recent.length === 2 || recent.length === 4) return 'col-span-3';
    if (recent.length === 3 || recent.length === 6) return 'col-span-2';
    return index < 3 ? 'col-span-2' : 'col-span-3';
  };

  const metrics = [
    { label: 'Resources', value: data?.stats.resources ?? 0, Icon: FolderOpen, color: 'bg-vault-50 text-vault-600' },
    { label: 'Documents', value: data?.stats.documents ?? 0, Icon: FileText, color: 'bg-violet-100 text-violet-700' },
    { label: 'Favorites', value: data?.stats.favorites ?? 0, Icon: Star, color: 'bg-amber-50 text-amber-600' },
    { label: 'Categories', value: data?.stats.categories ?? 0, Icon: BarChart3, color: 'bg-emerald-50 text-emerald-700' },
  ];

  return <div className="pb-0">
    <section className="mb-5 flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.08em] text-vault-600">Your personal knowledge system</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Good to see you.</h1><p className="mt-1 max-w-xl text-sm text-slate-500">Everything worth keeping, ready when you need it.</p></div>
      <Link className="btn-primary shrink-0" to="/add"><Plus className="mr-2" size={17} />Add a resource</Link>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, Icon, color }) => <Card key={label} className="group overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-soft"><div className="flex items-start justify-between"><div className={`grid h-9 w-9 place-items-center rounded-xl ${color}`}><Icon size={18} /></div><span className="text-xs font-medium text-slate-400">In your vault</span></div><p className="mt-4 text-3xl font-bold tracking-tight">{value}</p><p className="mt-1 text-sm font-medium text-slate-500">{label}</p></Card>)}
    </section>

    <section className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="p-5 sm:p-6"><div className="flex items-start justify-between"><div><h2 className="font-bold">Knowledge map</h2><p className="mt-1 text-sm text-slate-500">Your resources by category</p></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-vault-50 text-vault-600"><BarChart3 size={18} /></span></div>
        {data?.categoryDistribution.length ? <><ResponsiveContainer width="100%" height={150}><PieChart><Pie data={data.categoryDistribution} dataKey="value" nameKey="name" innerRadius={40} outerRadius={66} paddingAngle={3} strokeWidth={0}>{data.categoryDistribution.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 12px 28px rgba(15,23,42,.18)' }} /></PieChart></ResponsiveContainer><div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">{data.categoryDistribution.slice(0, 6).map((category, index) => <div key={category.name} className="flex min-w-0 items-center gap-2 text-xs"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} /><span className="truncate text-slate-500">{category.name}</span><span className="ml-auto font-bold text-ink">{category.value}</span></div>)}</div></> : <div className="grid min-h-44 place-items-center text-center"><div><div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-vault-50 text-vault-600"><Layers3 size={19} /></div><p className="mt-3 text-sm font-semibold">Your map will build itself</p><p className="mt-1 text-sm text-slate-500">Add a resource to see your categories here.</p></div></div>}
      </Card>

      <Card className="flex h-full flex-col p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold">Recently added</h2><p className="mt-1 text-sm text-slate-500">Your latest discoveries, ready to revisit.</p></div><Link className="shrink-0 text-sm font-semibold text-vault-600 hover:text-vault-500" to="/library">View library</Link></div>
        {recent.length ? <div className="mt-4 grid min-h-0 flex-1 auto-rows-fr grid-cols-6 gap-3">{recent.map((resource, index) => { const visual = resourceVisual(resource); const TypeIcon = visual.Icon; return <Link key={resource.id} to="/library" className={`group flex min-h-[104px] flex-col rounded-xl border border-slate-100 bg-slate-50/70 p-3 transition hover:-translate-y-0.5 hover:border-vault-200 hover:bg-white hover:shadow-soft ${recentSpan(index)}`}><div className="flex items-start justify-between gap-2"><div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${visual.color}`}><TypeIcon size={16} /></div><span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white px-1.5 py-1 text-[10px] font-semibold text-slate-500"><TypeIcon size={11} />{visual.label}</span></div><p className="mt-3 truncate text-sm font-bold text-ink group-hover:text-vault-600">{resource.title}</p><p className="mt-1 truncate text-xs text-slate-500">{resource.description || resource.summary || 'No description yet'}</p></Link>; })}</div> : <div className="grid min-h-44 flex-1 place-items-center text-center"><div><div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-vault-50 text-vault-600"><Plus size={19} /></div><p className="mt-3 text-sm font-semibold">Start with one useful thing</p><p className="mt-1 text-sm text-slate-500">Your recently added resources will appear here.</p><Link className="mt-3 inline-flex text-sm font-semibold text-vault-600 hover:text-vault-500" to="/add">Add a resource</Link></div></div>}
      </Card>
    </section>
  </div>;
}
