import { useQuery } from '@tanstack/react-query';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Component, useEffect, type PropsWithChildren } from 'react';
import { Layout } from './components/Layout';
import { PublicLayout } from './components/PublicLayout';
import { api } from './lib/api';
import { AddResourcePage } from './pages/AddResourcePage';
import { DashboardPage } from './pages/DashboardPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { InformationPage } from './pages/InformationPage';
import { LibraryPage } from './pages/LibraryPage';
import { LandingPage } from './pages/LandingPage';
import { ListsPage } from './pages/ListsPage';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SettingsPage } from './pages/SettingsPage';
import { SharedListPage } from './pages/SharedListPage';
import { PricingPage } from './pages/PricingPage';
import { AdminPage } from './pages/AdminPage';

type SessionUser={id:string;email:string;name:string|null;role:string};
function Guard() {
  const { data, isLoading } = useQuery({ queryKey: ['me'], queryFn: () => api<{ user: { id: string; email: string; name: string | null; role:string } }>('/auth/me'), retry: false });
  if (isLoading) return <div className="grid min-h-screen place-items-center text-slate-500">Opening your vault…</div>;
  return data ? <Layout /> : <Navigate to="/login" replace />;
}

function AdminGuard(){
  const {data,isLoading}=useQuery({queryKey:['me'],queryFn:()=>api<{user:SessionUser}>('/auth/me'),retry:false,refetchOnMount:'always'});
  if(isLoading)return <div className="grid min-h-screen place-items-center text-slate-500">Checking administrator access…</div>;
  return data?.user.role==='ADMIN'?<AdminPage/>:<Navigate to="/dashboard" replace/>;
}

function PageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const pages: Record<string, [string, string]> = {
      '/': ['SNOQ | Your AI-powered resource vault', 'Organize useful links, documents, and ideas in your SNOQ vault.'],
      '/dashboard': ['SNOQ Dashboard | Your resource vault', 'Your private SNOQ dashboard for resources, documents, and lists.'],
      '/docs': ['SNOQ Documentation | Organize your knowledge', 'Learn how to save, organize, search, and revisit resources in SNOQ.'],
      '/about': ['About SNOQ | Built by Codersvoice', 'Learn about SNOQ, the AI-powered resource vault built by Codersvoice.'],
      '/privacy': ['SNOQ Privacy | Your vault belongs to you', 'Read how SNOQ handles account information and saved resources.'],
      '/terms': ['SNOQ Terms | Responsible use', 'Read the SNOQ terms for using your resource vault responsibly.'],
    };
    const [title, description] = pages[pathname] ?? ['SNOQ | Your AI-powered resource vault', 'SNOQ by Codersvoice is an AI-powered resource vault.'];
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  }, [pathname]);
  return null;
}

class AppErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() {}
  render() { return this.state.failed ? <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center"><div><p className="text-sm font-semibold text-vault-600">SNOQ needs a refresh</p><h1 className="mt-2 text-2xl font-bold">We could not open this page.</h1><p className="mt-2 text-slate-500">Your saved resources are safe. Refresh to try again.</p><button className="btn-primary mt-6" onClick={() => window.location.reload()}>Refresh SNOQ</button></div></main> : this.props.children; }
}

export function App() {
  return <AppErrorBoundary><PageMeta /><Routes>
    <Route element={<PublicLayout />}>
      <Route path="/" element={<LandingPage />} />
      <Route path="/share/:slug" element={<SharedListPage />} />
      <Route path="/login" element={<LoginPage />} /><Route path="/forgot-password" element={<ForgotPasswordPage />} /><Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/docs" element={<InformationPage />} /><Route path="/about" element={<InformationPage />} /><Route path="/privacy" element={<InformationPage />} /><Route path="/terms" element={<InformationPage />} />
    </Route>
    <Route element={<Guard />}>
      <Route path="/dashboard" element={<DashboardPage />} /><Route path="/library" element={<LibraryPage />} /><Route path="/lists" element={<ListsPage />} /><Route path="/favorites" element={<LibraryPage favorite />} /><Route path="/archived" element={<LibraryPage archived />} /><Route path="/add" element={<AddResourcePage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/pricing" element={<PricingPage />} /><Route path="/admin" element={<AdminGuard />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AppErrorBoundary>;
}
