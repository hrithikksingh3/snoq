import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';

export function PublicLayout() {
  return <div className="public-shell flex h-screen overflow-hidden flex-col"><div className="min-h-0 flex-1 overflow-y-auto"><Outlet /></div><Footer /></div>;
}
