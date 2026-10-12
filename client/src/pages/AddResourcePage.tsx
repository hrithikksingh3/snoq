import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Link as LinkIcon, RotateCcw, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { draftStore } from '../lib/draft';
import type { Analysis, Draft, Resource, ResourceList } from '../types';
import { Button, Card, Pill } from '../components/ui';
import { useToast } from '../hooks/useToast';

const blank: Analysis = { title:'', description:null, resourceType:'Other', categories:[], subcategories:[], tags:[], topics:[], capabilities:[], useCases:[], targetAudience:[], sourcePlatform:null, author:null, language:null, isAITool:false, aiCapabilities:[], summary:null, keywords:[] };
const toArray = (value:string) => value.split(',').map(item=>item.trim()).filter(Boolean);

export function AddResourcePage() {
  const navigate=useNavigate(), queryClient=useQueryClient();
  const restored=useMemo(()=>draftStore.read(),[]);
  const [mode,setMode]=useState<'URL'|'DOCUMENT'>(restored?.kind??'URL');
  const [url,setUrl]=useState(restored?.url??'');
  const [draft,setDraft]=useState<Draft>(restored??{...blank,kind:'URL'});
  const [documentFile,setDocumentFile]=useState<File|null>(null);
  const {data:listsData}=useQuery({queryKey:['lists'],queryFn:()=>api<{lists:ResourceList[]}>('/lists')});
  const { notify } = useToast();
  const set = (key:keyof Draft,value:unknown) => setDraft(current=>({...current,[key]:value}));
  const aiProvenance=(ai:{status:string;provider:string|null;model:string|null})=>({provider:ai.provider,model:ai.model,primaryProvider:null,fallbackProvider:null,status:ai.status==='FAILED'?'FAILED' as const:'SUCCESS' as const});
  const urlAnalysis=useMutation({
    mutationFn:()=>api<{analysis:Analysis;ai:{status:string;provider:string|null;model:string|null;fallbackUsed:boolean};source:{url:string;normalizedUrl:string;thumbnailUrl?:string;faviconUrl?:string}}>('/resources/analyze-url',{method:'POST',body:JSON.stringify({url})}),
    onSuccess:data=>{void queryClient.invalidateQueries({queryKey:['membership']});setDraft({...data.analysis,kind:'URL',url:data.source.url,normalizedUrl:data.source.normalizedUrl,thumbnailUrl:data.source.thumbnailUrl,faviconUrl:data.source.faviconUrl,provenance:aiProvenance(data.ai)});notify(data.ai.status==='FAILED'?'AI analysis is unavailable. You can continue manually.':data.ai.fallbackUsed?'Analysis completed with the fallback AI provider.':'AI metadata is ready to review.',data.ai.status==='FAILED'?'info':'success');},
    onError:reason=>notify(reason instanceof Error?reason.message:'Could not analyze this URL','error')
  });
  const documentAnalysis=useMutation({
    mutationFn:(file:File)=>{const form=new FormData();form.append('file',file);return api<{analysis:Analysis;ai:{status:string;provider:string|null;model:string|null};document:{originalFilename:string;mimeType:string;size:number}}>('/resources/analyze-document',{method:'POST',body:form});},
    onSuccess:data=>{void queryClient.invalidateQueries({queryKey:['membership']});setDraft({...data.analysis,kind:'DOCUMENT',provenance:aiProvenance(data.ai)});notify(data.ai.status==='FAILED'?'AI analysis is unavailable. Complete the details manually; the document will upload only when you save.':'Document metadata is ready to review. The file will upload only when you save.',data.ai.status==='FAILED'?'info':'success');},
    onError:reason=>notify(reason instanceof Error?`${reason.message}. Complete the details manually; the document will upload only when you save.`:'Could not analyze this document. Complete the details manually; the document will upload only when you save.','error')
  });
  const save=useMutation({
    mutationFn:()=>{if(mode==='DOCUMENT'){if(!documentFile)throw new Error('Choose a document before saving');const form=new FormData();form.append('file',documentFile);form.append('payload',JSON.stringify({...draft,kind:mode,document:undefined}));return api<{resource:Resource}>('/resources',{method:'POST',body:form});}return api<{resource:Resource}>('/resources',{method:'POST',body:JSON.stringify({...draft,kind:mode})});},
    onSuccess:()=>{draftStore.clear();void queryClient.invalidateQueries({queryKey:['resources']});void queryClient.invalidateQueries({queryKey:['dashboard']});void queryClient.invalidateQueries({queryKey:['categories']});notify('Resource saved to your vault.');navigate('/library');},
    onError:reason=>notify(reason instanceof Error?reason.message:'Could not save resource','error')
  });
  useEffect(()=>{if(draft.title||url||draft.document)draftStore.write({...draft,kind:mode,url});},[draft,url,mode]);
  useEffect(()=>{if(restored)notify('An unfinished draft was restored.','info');},[notify,restored]);
  const reset=()=>{setDraft({...blank,kind:mode});setDocumentFile(null);setUrl('');draftStore.clear();notify('Draft cleared.','info');};
  const selectDocument=(file:File)=>{setDocumentFile(file);setDraft({...blank,kind:'DOCUMENT',title:file.name.replace(/\.[^.]+$/,''),resourceType:'Document'});notify('Analyzing document metadata. The file stays on this device until you save.','info');documentAnalysis.mutate(file);};
  return <div className="mx-auto max-w-4xl">
    <div className="mb-8"><p className="text-sm font-semibold text-vault-600">Capture it while it matters</p><h1 className="mt-2 text-3xl font-bold">Add to your vault</h1><p className="mt-2 text-slate-500">AI builds the first draft. You keep the final say.</p></div>
    <div className="mb-6 flex w-fit rounded-xl bg-slate-100 p-1">
      <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode==='URL'?'bg-white shadow-sm':'text-slate-500'}`} onClick={()=>setMode('URL')}><LinkIcon className="mr-2 inline" size={16}/>URL</button>
      <button className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode==='DOCUMENT'?'bg-white shadow-sm':'text-slate-500'}`} onClick={()=>setMode('DOCUMENT')}><FileUp className="mr-2 inline" size={16}/>Document</button>
    </div>
    <Card className="p-5 sm:p-7">
      {mode==='URL'?<form className="flex flex-col gap-3 sm:flex-row" onSubmit={event=>{event.preventDefault();if(url&&!urlAnalysis.isPending)urlAnalysis.mutate();}}><input className="field flex-1" type="url" value={url} onChange={event=>setUrl(event.target.value)} placeholder="Paste a useful URL"/><Button type="submit" disabled={!url||urlAnalysis.isPending}>{urlAnalysis.isPending?'Analyzing…':<><Sparkles className="mr-2" size={16}/>Analyze with AI</>}</Button></form>:<label className="grid cursor-pointer place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center hover:border-vault-500"><FileUp className="mb-3 text-vault-600"/><span className="font-semibold">{documentFile?documentFile.name:'Drop a document or choose a file'}</span><span className="mt-1 text-sm text-slate-500">PDF, DOCX, TXT, JSON, CSV, Markdown, or HTML · 10 MB max</span><input className="sr-only" type="file" accept=".pdf,.docx,.txt,.md,.json,.csv,.html,.htm" onChange={event=>event.target.files?.[0]&&selectDocument(event.target.files[0])}/></label>}
    </Card>
    {(draft.title||documentFile)&&<MetadataForm draft={draft} lists={listsData?.lists??[]} set={set} saving={save.isPending} onSave={()=>save.mutate()} onReset={reset}/>} 
  </div>;
}

function MetadataForm({draft,lists,set,saving,onSave,onReset}:{draft:Draft;lists:ResourceList[];set:(key:keyof Draft,value:unknown)=>void;saving:boolean;onSave:()=>void;onReset:()=>void}) {
  return <Card className="mt-6 p-5 sm:p-7"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Review the details</h2><p className="text-sm text-slate-500">AI-generated fields are editable. Your final edit is what gets saved.</p></div><Pill tone={draft.provenance?.status==='SUCCESS'?'green':'amber'}>{draft.provenance?.status==='SUCCESS'?'AI-assisted':'Manual mode'}</Pill></div>
    <div className="grid gap-5 sm:grid-cols-2"><Field label="Title" value={draft.title} required onChange={value=>set('title',value)}/><Field label="Resource type" value={draft.resourceType} onChange={value=>set('resourceType',value)}/><Field label="Categories" value={draft.categories.join(', ')} onChange={value=>set('categories',toArray(value))}/><Field label="Tags" value={draft.tags.join(', ')} onChange={value=>set('tags',toArray(value))}/><Field label="Source" value={draft.sourcePlatform??''} onChange={value=>set('sourcePlatform',value||null)}/><Field label="Author" value={draft.author??''} onChange={value=>set('author',value||null)}/></div>
    <label className="mt-5 block"><span className="label">Description</span><textarea className="field min-h-28" value={draft.description??''} onChange={event=>set('description',event.target.value||null)}/></label><label className="mt-5 block"><span className="label">Summary</span><textarea className="field min-h-24" value={draft.summary??''} onChange={event=>set('summary',event.target.value||null)}/></label>
    <fieldset className="mt-5"><legend className="label">Add to lists</legend>{lists.length?<div className="flex flex-wrap gap-2">{lists.map(list=>{const selected=(draft.listIds??[]).includes(list.id);return <button type="button" key={list.id} className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${selected?'border-vault-500 bg-vault-50 text-vault-700':'border-slate-200 text-slate-500 hover:border-vault-300'}`} onClick={()=>set('listIds',selected?(draft.listIds??[]).filter(id=>id!==list.id):[...(draft.listIds??[]),list.id])}>{list.name}</button>})}</div>:<p className="text-sm text-slate-500">Create a list from the Lists page to organize this resource.</p>}</fieldset>
    <div className="mt-7 flex flex-wrap gap-3"><Button disabled={!draft.title.trim()||saving} onClick={onSave}>{saving?'Saving…':'Save resource'}</Button><Button variant="muted" onClick={()=>set('provenance',{provider:null,model:null,primaryProvider:null,fallbackProvider:null,status:'MANUAL'})}><Sparkles className="mr-2" size={15}/>Continue manually</Button><Button variant="muted" onClick={onReset}><RotateCcw className="mr-2" size={15}/>Reset</Button></div>
  </Card>;
}

function Field({label,value,onChange,required=false}:{label:string;value:string;onChange:(value:string)=>void;required?:boolean}) { return <label><span className="label">{label}</span><input className="field" value={value} required={required} onChange={event=>onChange(event.target.value)}/></label>; }
