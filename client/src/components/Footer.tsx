import { Link } from 'react-router-dom';
import { siteConfig } from '../lib/site-config';

const links = [
  { label: 'Library', to: '/library' },
  { label: 'Documentation', to: '/docs' },
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
];

export function Footer() {
  return (
    <footer data-tour="app-footer" className="shrink-0 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur sm:px-8 sm:py-3">
      <div className="app-container text-[13px] sm:hidden">
        <div className="flex items-center gap-2 text-slate-500"><span className="font-bold text-ink">{siteConfig.productName}</span><span className="text-slate-300">·</span><span>Your AI-organized resource space</span></div>
        <nav className="mt-3" style={{ display: 'flex', alignItems: 'center', columnGap: '18px', flexWrap: 'nowrap' }} aria-label="Footer navigation">
          {links.map((link) => <Link key={link.label} className="shrink-0 whitespace-nowrap py-0.5 text-slate-500 transition hover:text-ink" to={link.to}>{link.label === 'Documentation' ? 'Documents' : link.label}</Link>)}
        </nav>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {siteConfig.productName}</span>
          <span>Built by <a className="font-semibold text-slate-600 transition hover:text-ink" href={siteConfig.codersvoice.url} target="_blank" rel="noopener noreferrer">Codersvoice</a></span>
        </div>
      </div>
      <div className="app-container hidden gap-3 text-xs sm:grid sm:grid-cols-[1fr_auto] sm:items-center lg:grid-cols-[1fr_auto_1fr]">
        <div className="flex items-center gap-2 text-slate-500"><span className="font-bold text-ink">{siteConfig.productName}</span><span className="text-slate-300">·</span><span>Your AI-organized resource space</span></div>
        <nav className="grid grid-cols-2 gap-x-5 gap-y-2 sm:flex sm:items-center sm:gap-5" aria-label="Footer navigation">{links.map((link) => <Link key={link.label} className="py-1 text-slate-500 transition hover:text-ink" to={link.to}>{link.label}</Link>)}</nav>
        <p className="border-t border-slate-100 pt-3 text-left text-slate-500 sm:col-span-2 sm:border-0 sm:pt-0 lg:col-span-1 lg:text-right">Built with care by <a className="font-semibold text-slate-600 transition hover:text-ink" href={siteConfig.codersvoice.url} target="_blank" rel="noopener noreferrer">Codersvoice</a>.</p>
      </div>
    </footer>
  );
}
