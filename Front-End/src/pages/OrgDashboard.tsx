import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getSession } from '../lib/api';
import { SignOutButton } from '../components/Layout';
import { StatusPill } from '../components/Brand';
import { LiveMap } from '../components/LiveMap';
import { useLivePositions } from '../lib/telemetry';

export function OrgDashboard() {
  const session = getSession();
  const navigate = useNavigate();
  const { positions, connected } = useLivePositions();

  if (!session || session.role !== 'COMPANY') {
    return <Navigate to="/signup/organization" replace />;
  }

  const company = session.user as { id?: number; email?: string; company_name?: string };

  function goTo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    navigate('/dashboard/organization');
  }

  return (
    <div className="grid-bg min-h-screen">
      <header className="hairline-b sticky top-0 z-30 flex items-center justify-between bg-background/85 px-6 py-3 backdrop-blur-sm">
        <div>
          <div className="label-caps text-[15px] font-extrabold tracking-[0.2em] text-on-surface">
            TRANSIT
          </div>
          <div className="label-caps mt-0.5 text-[9px] tracking-[0.3em] text-on-surface-variant">
            Mission Control&nbsp;/&nbsp;Organization
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
                ORGANIZATION CONSOLE
              </h1>
            </div>
            <StatusPill label="Online" tone="red" />
          </div>

          <form onSubmit={goTo}>
            <div className="hairline bg-surface p-6">
              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center bg-on-tertiary-container/20 hairline">
                  <span className="material-symbols-outlined text-[22px] text-on-tertiary-container">
                    domain
                  </span>
                </div>
                <div>
                  <div className="label-caps text-on-surface-variant">SIGNED IN AS</div>
                  <div className="mt-1 text-[18px] font-bold text-on-surface">
                    {company.company_name ?? 'Unknown organization'}
                  </div>
                  <div className="data-mono mt-0.5 text-[12px] text-on-surface-variant">
                    {company.email} · ID-{company.id ?? '—'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="hairline bg-surface-dim p-4">
                  <div className="label-caps text-on-surface-variant">FLEET</div>
                  <div className="data-mono mt-2 text-[22px] text-on-surface">0</div>
                  <div className="data-mono text-[10px] text-on-surface-variant">Buses assigned</div>
                </div>
                <div className="hairline bg-surface-dim p-4">
                  <div className="label-caps text-on-surface-variant">STATUS</div>
                  <div className="data-mono mt-2 text-[22px] text-on-tertiary-container">READY</div>
                  <div className="data-mono text-[10px] text-on-surface-variant">Operations nominal</div>
                </div>
                <div className="hairline bg-surface-dim p-4">
                  <div className="label-caps text-on-surface-variant">NEXT</div>
                  <div className="data-mono mt-2 text-[22px] text-on-surface">—

                  </div>
                  <div className="data-mono text-[10px] text-on-surface-variant">Awaiting directives</div>
                </div>
              </div>

              <div className="hairline-b mt-6 mb-5" />

              <div className="mb-4 flex items-center justify-between">
                <div className="label-caps text-on-surface-variant">LIVE FLEET TELEMETRY</div>
                <StatusPill label={connected ? 'Streaming' : 'Offline'} tone={connected ? 'red' : undefined} />
              </div>
              <LiveMap positions={positions} center={{ lat: 9.082, lng: 8.6753 }} zoom={5} height="280px" />
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {positions.length === 0 ? (
                  <div className="data-mono text-[11px] text-on-surface-variant">
                    No vehicles reporting. Connect the driver app to begin streaming.
                  </div>
                ) : (
                  positions.map((p) => (
                    <div key={p.deviceId} className="hairline bg-surface-dim px-3 py-2">
                      <div className="label-caps text-on-surface-variant">{p.deviceId}</div>
                      <div className="data-mono mt-1 text-[12px] text-on-surface">
                        {p.lat.toFixed(5)}, {p.lng.toFixed(5)} · {p.speed.toFixed(1)} km/h
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="hairline-b mt-6 mb-5" />
              <div className="label-caps flex items-center justify-between text-on-surface-variant">
                <span>Dashboard placeholder</span>
                <span className="data-mono text-[11px]">MOD-01 / STANDBY</span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}