import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useMemo, useState, type PropsWithChildren } from 'react';
import { ToastContext, type ToastTone } from './toast-context';

type Toast = { id: number; message: string; tone: ToastTone };

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const value = useMemo(() => ({ notify(message: string, tone: ToastTone = 'success') {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id, message, tone }].slice(-3));
    if ('vibrate' in navigator) navigator.vibrate(tone === 'error' ? [35, 45, 35] : [30]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4200);
  } }), []);
  const Icon = ({ tone }: { tone: ToastTone }) => tone === 'success' ? <CheckCircle2 className="text-emerald-500" size={19} /> : tone === 'error' ? <XCircle className="text-rose-500" size={19} /> : <Info className="text-vault-500" size={19} />;
  return <ToastContext.Provider value={value}>{children}<div className="pointer-events-none fixed inset-x-4 top-4 z-[100] flex flex-col items-end gap-3 sm:left-auto sm:w-[380px]" aria-live="polite">{toasts.map((toast) => <div key={toast.id} className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft dark:bg-[#111c2e]"><Icon tone={toast.tone} /><p className="min-w-0 flex-1 text-sm font-medium text-ink">{toast.message}</p><button className="rounded-lg p-1 text-slate-400 hover:bg-slate-100" aria-label="Dismiss notification" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}><X size={16} /></button></div>)}</div></ToastContext.Provider>;
}
