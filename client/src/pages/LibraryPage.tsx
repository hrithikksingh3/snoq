import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ChevronLeft, ChevronRight, Download, Edit3, ExternalLink, Eye, FileSpreadsheet, FileText, RefreshCw, Search, Star, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Resource } from '../types';
import { Button, Card, Pill } from '../components/ui';
import { useToast } from '../hooks/useToast';

const apiRoot = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';
type ResourcePage = { resources: Resource[]; total: number; page: number; pageSize: number; totalPages: number };
type LegacyResourceResponse = { resources: Resource[] | ResourcePage };
type Category = { id: string; name: string };

export function LibraryPage({ favorite = false, archived = false }: { favorite?: boolean; archived?: boolean }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [kind, setKind] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<Resource | null>(null);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [deleting, setDeleting] = useState<Resource | null>(null);
  const [params] = useSearchParams();
  const listId = params.get('list');
  const qc = useQueryClient();
  const { notify } = useToast();
  const query = new URLSearchParams();
  if (favorite) query.set('favorite', 'true');
  if (archived) query.set('archived', 'true');
  if (search) query.set('search', search);
  if (listId) query.set('list', listId);
  if (kind) query.set('kind', kind);
  if (category) query.set('category', category);
  query.set('sort', sort);
  query.set('page', String(page));
  query.set('limit', '18');

  const { data: response, isLoading, isError, error, refetch } = useQuery({ queryKey: ['resources', query.toString()], queryFn: () => api<ResourcePage | Resource[] | LegacyResourceResponse>(`/resources?${query}`), retry: 1 });
  const data: ResourcePage | undefined = Array.isArray(response)
    ? { resources: response, total: response.length, page: 1, pageSize: response.length, totalPages: 1 }
    : response && 'resources' in response && !Array.isArray(response.resources) && 'total' in response.resources
      ? response.resources
      : response && 'resources' in response
        ? { resources: response.resources as Resource[], total: (response.resources as Resource[]).length, page: 1, pageSize: (response.resources as Resource[]).length, totalPages: 1 }
        : undefined;
  const { data: categoryData } = useQuery({ queryKey: ['categories', 'active-resources'], queryFn: () => api<{ categories: Category[] }>('/categories') });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['resources'] }); void qc.invalidateQueries({ queryKey: ['dashboard'] }); void qc.invalidateQueries({ queryKey: ['categories'] }); };
  const action = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'favorite' | 'archive' | 'restore' }) => api(`/resources/${id}/${action}`, { method: 'POST' }), onSuccess: (_data, variables) => { refresh(); notify(variables.action === 'favorite' ? 'Favorite updated.' : variables.action === 'archive' ? 'Resource archived.' : 'Resource restored.'); }, onError: () => notify('That resource could not be updated.', 'error') });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api(`/resources/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }), onSuccess: () => { refresh(); setEditing(null); notify('Resource details saved.'); }, onError: (reason) => notify(reason instanceof Error ? reason.message : 'Could not save resource changes.', 'error') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/resources/${id}`, { method: 'DELETE' }), onSuccess: () => { refresh(); setDeleting(null); notify('Resource deleted.'); }, onError: (reason) => notify(reason instanceof Error ? reason.message : 'Could not delete resource.', 'error') });
  const title = archived ? 'Archived resources' : favorite ? 'Favorites' : listId ? 'List resources' : 'Your library';
  const change = (setValue: (value: string) => void) => (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => { setValue(event.target.value); setPage(1); };
  const clearFilters = () => { setSearch(''); setSort('newest'); setKind(''); setCategory(''); setPage(1); };
  const filtering = Boolean(search || kind || category || sort !== 'newest');

  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-vault-600">{archived ? 'Stored away' : listId ? 'Curated collection' : 'Searchable knowledge'}</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-1 text-sm text-slate-500">{data ? `${data.total.toLocaleString()} resource${data.total === 1 ? '' : 's'}` : isError ? 'Could not load your vault' : 'Loading your vault'}</p></div><div className="flex flex-wrap gap-2">{!archived && !favorite && <Link className="btn-muted" to="/settings#reports"><FileSpreadsheet className="mr-2" size={16} />Reports</Link>}{listId && <Link className="btn-muted" to="/lists"><X className="mr-2" size={16} />All lists</Link>}</div></div>
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_150px_150px_170px_auto]"><div className="relative"><Search className="absolute left-3 top-3 text-slate-400" size={18} /><input className="field pl-10" placeholder="Search titles, tags, categories, or descriptions" value={search} onChange={change(setSearch)} /></div><select className="field" aria-label="Filter by kind" value={kind} onChange={change(setKind)}><option value="">All resources</option><option value="URL">Links and tools</option><option value="DOCUMENT">Documents</option></select><select className="field" aria-label="Filter by category" value={category} onChange={change(setCategory)}><option value="">All categories</option>{categoryData?.categories.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select><select className="field" aria-label="Sort resources" value={sort} onChange={change(setSort)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="updated">Recently updated</option><option value="favorites">Favorites first</option><option value="title">Title A–Z</option></select>{filtering && <button className="px-3 text-sm font-semibold text-slate-500 hover:text-vault-600" onClick={clearFilters}>Clear</button>}</div></section>
    {isLoading ? <p className="text-slate-500">Loading resources…</p> : isError ? <Card className="py-16 text-center"><h2 className="font-bold">Your resources could not be loaded</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{error instanceof Error ? error.message : 'Please try again.'}</p><Button variant="muted" className="mt-5" onClick={() => void refetch()}><RefreshCw className="mr-2" size={16} />Try again</Button></Card> : <><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data?.resources.map((resource) => <ResourceCard key={resource.id} resource={resource} archived={archived} pending={action.isPending || update.isPending || remove.isPending} onPreview={() => setPreview(resource)} onEdit={() => setEditing(resource)} onDelete={() => setDeleting(resource)} onAction={(next) => action.mutate({ id: resource.id, action: next })} />)}
      {data?.resources.length === 0 && <Card className="col-span-full py-16 text-center"><h2 className="font-bold">Nothing here yet</h2><p className="mt-2 text-sm text-slate-500">Try a different search, adjust the filters, or add your next useful find.</p>{!archived && !favorite && <Link className="btn-primary mt-5" to="/add">Add resource</Link>}</Card>}
    </div>{data && data.totalPages > 1 && <nav className="mt-7 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm" aria-label="Resource pages"><p className="text-slate-500">Page {data.page} of {data.totalPages}</p><div className="flex gap-2"><Button variant="muted" className="px-3" disabled={data.page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={17} />Previous</Button><Button variant="muted" className="px-3" disabled={data.page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight className="ml-1" size={17} /></Button></div></nav>}</>}
    {preview && <DocumentPreview resource={preview} onClose={() => setPreview(null)} />}
    {editing && <EditResourceDialog key={editing.id} resource={editing} saving={update.isPending} onClose={() => setEditing(null)} onSave={(payload) => update.mutate({ id: editing.id, payload })} />}
    {deleting && <DeleteResourceDialog resource={deleting} deleting={remove.isPending} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting.id)} />}
  </>;
}

function ResourceCard({ resource, archived, pending, onAction, onPreview, onEdit, onDelete }: { resource: Resource; archived: boolean; pending: boolean; onAction: (action: 'favorite' | 'archive' | 'restore') => void; onPreview: () => void; onEdit: () => void; onDelete: () => void }) {
  return <Card className="flex min-h-64 flex-col p-5"><div className="flex justify-between gap-3"><Pill tone={resource.isAITool ? 'green' : 'blue'}>{resource.resourceType}</Pill><div className="flex gap-1.5"><button aria-label={resource.isFavorite ? 'Remove from favorites' : 'Add to favorites'} title={resource.isFavorite ? 'Remove from favorites' : 'Add to favorites'} disabled={pending} className={`grid h-9 w-9 place-items-center rounded-lg border transition disabled:opacity-50 ${resource.isFavorite ? 'border-amber-400 bg-amber-400 text-amber-950 shadow-md shadow-amber-500/20 hover:bg-amber-300' : 'border-amber-300 bg-amber-50 text-amber-700 hover:-translate-y-0.5 hover:bg-amber-100'}`} onClick={() => onAction('favorite')}><Star size={16} fill={resource.isFavorite ? 'currentColor' : 'none'} /></button><button aria-label={archived ? 'Restore resource' : 'Archive resource'} title={archived ? 'Restore resource' : 'Archive resource'} disabled={pending} className={`grid h-9 w-9 place-items-center rounded-lg border transition disabled:opacity-50 ${archived ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:-translate-y-0.5 hover:bg-emerald-100' : 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:-translate-y-0.5 hover:bg-indigo-100'}`} onClick={() => onAction(archived ? 'restore' : 'archive')}>{archived ? <Undo2 size={16} /> : <Archive size={16} />}</button><button aria-label="Edit resource" title="Edit resource" disabled={pending} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:-translate-y-0.5 hover:border-vault-300 hover:bg-vault-50 hover:text-vault-600" onClick={onEdit}><Edit3 size={16} /></button></div></div>
    <h2 className="mt-5 line-clamp-2 font-bold">{resource.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{resource.description || resource.summary || 'Add a description to make this easier to rediscover.'}</p>
    {(resource.lists ?? []).length > 0 && <p className="mt-3 truncate text-xs font-semibold text-vault-600">{(resource.lists ?? []).map(({ list }) => list.name).join(' · ')}</p>}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5"><div className="flex flex-wrap gap-1">{(resource.tags ?? []).slice(0, 2).map(({ tag }) => <Pill key={tag.name} tone="gray">{tag.name}</Pill>)}</div><div className="flex gap-1"><button className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" onClick={onDelete} title="Delete resource" aria-label="Delete resource" disabled={pending}><Trash2 size={17} /></button>{resource.url && <a className="rounded-lg p-2 text-vault-600 hover:bg-vault-50" href={resource.url} target="_blank" rel="noreferrer" title="Open website"><ExternalLink size={18} /></a>}{resource.document && <><button className="rounded-lg p-2 text-vault-600 hover:bg-vault-50" onClick={onPreview} title="View document" aria-label="View document"><Eye size={18} /></button><a className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50" href={`${apiRoot}/resources/${resource.id}/document/download`} title="Download document"><Download size={18} /></a></>}</div></div>
  </Card>;
}

function EditResourceDialog({ resource, saving, onClose, onSave }: { resource: Resource; saving: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => void }) {
  const [title, setTitle] = useState(resource.title);
  const [description, setDescription] = useState(resource.description ?? '');
  const [resourceType, setResourceType] = useState(resource.resourceType);
  const [categories, setCategories] = useState((resource.categories ?? []).map(({ category }) => category.name).join(', '));
  const [tags, setTags] = useState((resource.tags ?? []).map(({ tag }) => tag.name).join(', '));
  const values = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Edit resource"><section className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6"><div><p className="text-sm font-semibold text-vault-600">Resource details</p><h2 className="mt-1 text-xl font-bold">Edit resource</h2></div><button className="rounded-xl p-2 text-slate-400 hover:bg-slate-100" onClick={onClose} aria-label="Close edit dialog"><X size={19} /></button></header><form className="max-h-[70vh] overflow-y-auto p-5 sm:p-6" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), description: description.trim() || null, resourceType: resourceType.trim() || 'Other', categories: values(categories), tags: values(tags) }); }}><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="label">Title</span><input className="field" required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span className="label">Resource type</span><input className="field" value={resourceType} onChange={(event) => setResourceType(event.target.value)} /></label><label><span className="label">Categories</span><input className="field" value={categories} onChange={(event) => setCategories(event.target.value)} placeholder="Design, developer tools" /></label><label className="sm:col-span-2"><span className="label">Tags</span><input className="field" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Comma-separated tags" /></label><label className="sm:col-span-2"><span className="label">Description</span><textarea className="field min-h-28" value={description} onChange={(event) => setDescription(event.target.value)} /></label></div><div className="mt-6 flex justify-end gap-3"><Button type="button" variant="muted" onClick={onClose}>Cancel</Button><Button disabled={!title.trim() || saving}>{saving ? 'Saving…' : 'Save changes'}</Button></div></form></section></div>;
}

function DeleteResourceDialog({ resource, deleting, onClose, onConfirm }: { resource: Resource; deleting: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Confirm resource deletion"><section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-600"><Trash2 size={21} /></div><h2 className="mt-5 text-xl font-bold">Delete this resource?</h2><p className="mt-2 text-sm leading-6 text-slate-500"><span className="font-semibold text-ink">{resource.title}</span> will be removed from your vault. This cannot be undone.</p><div className="mt-7 flex justify-end gap-3"><Button variant="muted" onClick={onClose} disabled={deleting}>Cancel</Button><Button variant="danger" onClick={onConfirm} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete resource'}</Button></div></section></div>;
}

function DocumentPreview({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const document = resource.document!;
  const isPdf = document.mimeType === 'application/pdf';
  const canReadAsText = /^(text\/|application\/json)/.test(document.mimeType) || /\.(md|txt|json|csv|html?)$/i.test(document.originalFilename);
  useEffect(() => { if (!canReadAsText) return; void fetch(`${apiRoot}/resources/${resource.id}/document/view`, { credentials: 'include' }).then((response) => response.ok ? response.text() : Promise.reject()).then((value) => setText(value)).catch(() => setText('This document could not be loaded. You can still download the original file.')); }, [canReadAsText, resource.id]);
  return <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Preview ${document.originalFilename}`}><section className="flex h-[min(720px,calc(100vh-2rem))] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-vault-50 text-vault-600"><FileText size={18} /></span><div className="min-w-0"><p className="truncate font-semibold">{document.originalFilename}</p><p className="text-xs text-slate-500">Document preview</p></div></div><div className="flex shrink-0 gap-2"><a className="btn-muted px-3" href={`${apiRoot}/resources/${resource.id}/document/download`}><Download size={16} /><span className="ml-1 hidden sm:inline">Download</span></a><button className="btn-muted px-3" onClick={onClose} aria-label="Close preview"><X size={18} /></button></div></header>{isPdf ? <iframe className="min-h-0 flex-1 bg-slate-100" src={`${apiRoot}/resources/${resource.id}/document/view`} title={document.originalFilename} /> : canReadAsText ? <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-5 font-mono text-sm leading-6 text-slate-700">{text ?? 'Loading document…'}</pre> : <div className="grid flex-1 place-items-center p-8 text-center"><div><FileText className="mx-auto text-vault-600" size={36} /><h2 className="mt-4 font-bold">Preview is not available for this file type</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Download the original {document.originalFilename.split('.').pop()?.toUpperCase()} file to view it in its compatible application.</p></div></div>}</section></div>;
}
