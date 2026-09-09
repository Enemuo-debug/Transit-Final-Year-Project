import { Navigate } from 'react-router-dom';
import { getSession } from '../lib/api';
import { SignOutButton } from '../components/Layout';
import { StatusPill } from '../components/Brand';

export function ResponderDashboard() {
  const session = getSession();

  if (!session || session.role !== 'RESPONDER') {
    return <Navigate to="/signup/responder" replace />;
  }

  const responder = session.user as { id?: number; email?: string; name?: string; agency_type?: string };

  return (
    <div className="grid-bg min-h-screen">
      <header className="hairline-b sticky top-0 z-30 flex items-center justify-between bg-background/85 px-6 py-3 backdrop-blur-sm">
        <div>
          <div className="label-caps text-[15px] font-extrabold tracking-[0.2em] text-on-surface">
            TRANSIT
          </div>
          <div className="label-caps mt-0.5 text-[9px] tracking-[0.3em] text-on-surface-variant">
            Mission Control&nbsp;/&nbsp;Responder
          </div>
        </div>
        <SignOutButton />
      </header>

      <div className="flex min-h-screen flex-col px-6 py-24">
        <div className="w-full max-w-3xl">
          <div className="hairline-b mb-6 flex items-end justify-between border-on-tertiary-container pb-3">
            <div>
              <div className="label-caps text-on-surface-variant">CLEARANCE / GRANTED</div>
              <h1 className="mt-2 text-[30px] font-extrabold leading-none tracking-tight text-on-surface">
                RESPONDER CONSOLE
              </h1>
            </div>
            <StatusPill label={responder.agency_type ?? 'UNIT'} tone="red" />
          </div>

          <div className="hairline bg-surface p-6">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center bg-on-tertiary-container/20 hairline">
                <span className="material-symbols-outlined text-[22px] text-on-tertiary-container">
                  local_police
                </span>
              </div>
              <div>
                <div className="label-caps text-on-surface-variant">SIGNED IN AS</div>
                <div className="mt-1 text-[18px] font-bold text-on-surface">
                  {responder.name ?? 'Unknown responder'}
                </div>
                <div className="data-mono mt-0.5 text-[12px] text-on-surface-variant">
                  {responder.email} · ID-{responder.id ?? '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="hairline bg-surface-dim p-4">
                <div className="label-caps text-on-surface-variant">AGENCY</div>
                <div className="data-mono mt-2 text-[22px] text-on-surface">
                  {responder.agency_type ?? '—'}
                </div>
                <div className="data-mono text-[10px] text-on-surface-variant">Unit classification</div>
              </div>
              <div className="hairline bg-surface-dim p-4">
                <div className="label-caps text-on-surface-variant">STATUS</div>
                <div className="data-mono mt-2 text-[22px] text-on-tertiary-container">STANDBY</div>
                <div className="data-mono text-[10px] text-on-surface-variant">Awaiting dispatch</div>
              </div>
              <div className="hairline bg-surface-dim p-4">
                <div className="label-caps text-on-surface-variant">NEXT</div>
                <div className="data-mono mt-2 text-[22px] text-on-surface">—

                </div>
                <div className="data-mono text-[10px] text-on-surface-variant">No active alerts</div>
              </div>
            </div>

            <div className="hairline-b mt-6 mb-5" />
            <div className="label-caps flex items-center justify-between text-on-surface-variant">
              <span>Dashboard placeholder</span>
              <span className="data-mono text-[11px]">MOD-02 / STANDBY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}