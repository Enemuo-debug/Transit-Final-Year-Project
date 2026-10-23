import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getSession, clearSession } from '../lib/api';
import { ThemeToggle } from './ThemeToggle';

export type OrgNavKey = 'dashboard' | 'routes' | 'journeys' | 'incidents' | 'fleet';

const NAV: Array<{ key: OrgNavKey; icon: string; label: string; to: string }> = [
  { key: 'dashboard', icon: 'dashboard', label: 'Dashboard', to: '/dashboard/organization' },
  { key: 'routes', icon: 'route', label: 'Routes', to: '/dashboard/organization/routes' },
  { key: 'journeys', icon: 'local_shipping', label: 'Journeys', to: '/dashboard/organization/journeys' },
  { key: 'incidents', icon: 'warning', label: 'Incidents', to: '/dashboard/organization/incidents' },
  { key: 'fleet', icon: 'directions_bus', label: 'Fleet', to: '/dashboard/organization/buses' },
];

export function OrgShell({
  active,
  title,
  subtitle,
  actions,
  children,
}: {
  active: OrgNavKey;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const session = getSession();
  const navigate = useNavigate();
  const operator = (session?.user ?? {}) as { company_name?: string; email?: string };
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="controller flex min-h-screen flex-col font-body-md">
      <header className="fixed top-0 z-50 flex h-14 w-full items-center justify-between border-b border-outline-variant bg-surface/95 px-6 backdrop-blur-sm">
        <div className="flex items-center gap-md">
          <Link
            to="/dashboard/organization"
            className="text-[20px] font-extrabold leading-none tracking-tighter text-primary"
          >
            TRANSIT
          </Link>
          <div className="mx-xs h-5 w-gutter bg-outline-variant" />
          <span className="label-caps text-on-surface-variant">
            {operator.company_name ?? 'OPERATOR'}
          </span>
        </div>
        <div className="flex items-center gap-md">
          <span className="data-mono hidden items-center gap-1 text-[10px] text-on-surface-variant sm:flex">
            <span className="h-1.5 w-1.5 animate-pulse bg-green-400" />
            SYS_READY
          </span>
          <span className="data-mono hidden text-[10px] text-on-surface-variant sm:inline">
            {clock}
          </span>
          <ThemeToggle />
          <Link
            to="/dashboard/organization/incidents"
            className="material-symbols-outlined text-[20px] text-on-surface-variant transition-colors hover:text-primary"
            title="Incidents"
          >
            notifications
          </Link>
          <button
            onClick={() => {
              clearSession();
              navigate('/');
            }}
            className="label-caps flex items-center gap-xs text-on-surface-variant transition-colors hover:text-error"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Logout
          </button>
        </div>
      </header>

      <div className="mt-14 flex flex-1">
        <nav className="fixed left-0 top-14 z-40 flex h-[calc(100vh-56px)] w-60 flex-col border-r border-outline-variant bg-surface-container-low py-5">
          <div className="flex flex-col gap-1">
            {NAV.map((item) => {
              const isActive = item.key === active;
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  className={`group flex items-center gap-md border-l-2 py-3 pl-4 pr-5 transition-all duration-150 ${
                    isActive
                      ? 'border-on-tertiary-container bg-surface-container-high text-primary'
                      : 'border-transparent text-on-surface-variant hover:border-outline-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                  <span className="label-caps">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-auto px-5">
            <div className="data-mono text-[11px] leading-relaxed text-on-surface-variant/70">
              TRANSIT · Emergency Response
              <br />
              v1.0 · FYP
            </div>
          </div>
        </nav>

        <main className="ml-60 flex w-full flex-col">
          <div className="flex items-end justify-between border-b border-outline-variant bg-surface-container-lowest px-6 py-4">
            <div>
              <div className="label-caps text-on-surface-variant">{subtitle ?? 'COMMAND CENTER'}</div>
              <h1 className="mt-1 text-[26px] font-bold tracking-wide text-on-surface lg:text-[30px]">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-sm">{actions}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto w-full max-w-[1600px]">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
