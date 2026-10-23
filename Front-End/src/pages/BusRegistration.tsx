import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  getSession,
  getMyBuses,
  registerBus,
  updateBus,
  deleteBus,
  getMySessions,
  getJourneys,
  createSession,
  deactivateSession,
  errorLabel,
  type Bus,
  type DriverSession,
} from '../lib/api';
import { OrgShell } from '../components/OrgShell';

const STATUSES = ['ACTIVE', 'MAINTENANCE', 'OFFLINE'] as const;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Available',
  ON_JOURNEY: 'On journey',
  MAINTENANCE: 'Maintenance',
  OFFLINE: 'Offline',
};

type SessionState = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

function sessionState(session: DriverSession, now: number): SessionState {
  if (!session.is_active) return 'REVOKED';
  if (session.consumed_at) return 'USED';
  return Date.parse(session.expires_at) > now ? 'ACTIVE' : 'EXPIRED';
}

function secondsLeft(session: DriverSession, now: number): number {
  return Math.max(0, Math.floor((Date.parse(session.expires_at) - now) / 1000));
}

export function BusRegistration() {
  const session = getSession();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [plateNumber, setPlateNumber] = useState('');
  const [capacity, setCapacity] = useState('');
  const [status, setStatus] = useState<string>(STATUSES[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<DriverSession[]>([]);
  const [activeBusIds, setActiveBusIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<{
    plate_number: string;
    capacity: string;
    status: string;
  }>({ plate_number: '', capacity: '', status: STATUSES[0] });
  const [editBusy, setEditBusy] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<DriverSession | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const companyId = (session?.user?.id as number) ?? 0;

  function loadSessions() {
    getMySessions()
      .then(({ sessions: list }) => {
        setSessions(list);
        setGeneratedCode((current) => {
          if (current) {
            const same = list.find((row) => row.id === current.id);
            if (same && sessionState(same, Date.now()) === 'ACTIVE') return same;
          }
          // After a reload, restore the newest still-valid code from the database.
          return list.find((row) => sessionState(row, Date.now()) === 'ACTIVE') ?? null;
        });
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!session) return;
    getMyBuses()
      .then((list) => setBuses(list.filter((b) => b.company_id === companyId)))
      .catch(() => {})
      .finally(() => setLoading(false));
    loadSessions();
    getJourneys('ACTIVE')
      .then((list) => setActiveBusIds(new Set(list.map((j) => j.bus_id))))
      .catch(() => {});
  }, [session, companyId]);

  // Keep the list in sync with the backend sweep, even if this tab stays open.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(loadSessions, 30000);
    return () => clearInterval(id);
  }, [session, companyId]);

  // Drive the countdown without refetching.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const blockingSessionFor = (plate: string) =>
    sessions.find((s) => {
      if (s.plate_number !== plate) return false;
      const state = sessionState(s, now);
      return state === 'ACTIVE' || state === 'USED';
    });

  const generatedRemaining = generatedCode ? secondsLeft(generatedCode, now) : 0;

  function formatCountdown(seconds: number): string {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      seconds % 60,
    ).padStart(2, '0')}`;
  }

  if (!session || session.role !== 'COMPANY') {
    return <Navigate to="/signin/organization" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const bus = await registerBus({
        company_id: companyId,
        plate_number: plateNumber,
        capacity: Number(capacity),
        status: status as 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE',
      });
      setBuses((prev) => [...prev, bus]);
      setPlateNumber('');
      setCapacity('');
      setStatus(STATUSES[0]);
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: number) {
    if (!window.confirm('Remove this asset? It is soft-deleted (kept for audit).')) return;
    setError(null);
    try {
      await deleteBus(id);
      setBuses((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    }
  }

  function startEdit(bus: Bus) {
    setEditingId(bus.id);
    setEditDraft({
      plate_number: bus.plate_number,
      capacity: String(bus.capacity),
      status: bus.status,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(id: number) {
    if (editBusy) return;
    setEditBusy(true);
    setError(null);
    try {
      const updated = await updateBus(id, {
        plate_number: editDraft.plate_number,
        capacity: Number(editDraft.capacity),
        status: editDraft.status as 'ACTIVE' | 'MAINTENANCE' | 'OFFLINE',
      });
      setBuses((prev) => prev.map((b) => (b.id === id ? updated : b)));
      setEditingId(null);
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setEditBusy(false);
    }
  }

  async function onGenerateSession(plate: string) {
    if (sessionBusy) return;
    setSessionError(null);
    setSessionBusy(plate);
    try {
      const created = await createSession(plate);
      setSessions((prev) => [created, ...prev.filter((s) => s.id !== created.id)]);
      setGeneratedCode(created);
      setNow(Date.now());
    } catch (err) {
      setSessionError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setSessionBusy(null);
    }
  }

  async function onDeactivateSession(id: number) {
    try {
      const updated = await deactivateSession(id);
      setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
      if (generatedCode?.id === id) setGeneratedCode(null);
    } catch {
      // silent
    }
  }

  function copyCode(code: string) {
    navigator.clipboard?.writeText(code).catch(() => {});
  }

  return (
    <OrgShell active="fleet" title="FLEET & ASSETS" subtitle="FLEET MANAGEMENT">
      <div className="w-full max-w-3xl">
        {/* Assets */}
        <div className="hairline bg-surface-container-low p-md">
          <div className="mb-sm font-label-caps text-label-caps text-on-surface-variant">NEW ASSET</div>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="label-caps text-on-surface-variant">PLATE NUMBER</span>
              <div className="flex items-center gap-2 bg-surface-dim px-3 hairline transition-colors focus-within:border-on-tertiary-container">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">pin</span>
                <input
                  type="text"
                  value={plateNumber}
                  onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                  placeholder="ABC-123-XY"
                  className="w-full bg-transparent py-3 text-[14px] text-on-surface placeholder:text-outline"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="label-caps text-on-surface-variant">CAPACITY</span>
              <div className="flex items-center gap-2 bg-surface-dim px-3 hairline transition-colors focus-within:border-on-tertiary-container">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">group</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  placeholder="e.g. 45"
                  className="w-full bg-transparent py-3 text-[14px] text-on-surface placeholder:text-outline"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="label-caps text-on-surface-variant">STATUS</span>
              <div className="grid grid-cols-3 gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`label-caps px-3 py-2.5 transition-colors ${
                      status === s
                        ? 'bg-on-tertiary-container text-white'
                        : 'bg-surface-dim text-on-surface-variant hairline hover:text-on-surface'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="hairline flex items-center gap-2 border-error bg-error/5 px-3 py-2">
                <span className="material-symbols-outlined text-[16px] text-error">error</span>
                <span className="data-mono text-[12px] text-error">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !plateNumber || !capacity}
              className="cursor-pointer bg-on-tertiary-container py-3 font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Registering…' : 'Register Asset'}
            </button>
          </form>
        </div>

        {/* Fleet list */}
        <div className="mt-md hairline bg-surface-container-low p-md">
          <div className="mb-sm font-label-caps text-label-caps text-on-surface-variant">
            REGISTERED ASSETS ({buses.length})
          </div>
          {loading ? (
            <div className="data-mono text-[12px] text-on-surface-variant">Loading…</div>
          ) : buses.length === 0 ? (
            <div className="data-mono text-[12px] text-on-surface-variant">
              No assets registered yet. Use the form above to add your first bus.
            </div>
          ) : (
            <div className="flex flex-col gap-gutter">
              {buses.map((bus) =>
                editingId === bus.id ? (
                  <div key={bus.id} className="hairline grid grid-cols-12 items-center gap-2 bg-surface-dim p-2">
                    <input
                      className="col-span-4 hairline bg-transparent px-2 py-1 data-mono text-[12px] text-on-surface"
                      value={editDraft.plate_number}
                      onChange={(e) =>
                        setEditDraft((d) => ({ ...d, plate_number: e.target.value.toUpperCase() }))
                      }
                    />
                    <input
                      className="col-span-2 hairline bg-transparent px-2 py-1 data-mono text-[12px] text-on-surface"
                      type="number"
                      min={1}
                      max={100}
                      value={editDraft.capacity}
                      onChange={(e) => setEditDraft((d) => ({ ...d, capacity: e.target.value }))}
                    />
                    <select
                      className="col-span-3 hairline bg-surface-dim px-2 py-1 data-mono text-[11px] text-on-surface"
                      value={editDraft.status}
                      onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value }))}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <div className="col-span-3 flex justify-end gap-1">
                      <button
                        onClick={() => void saveEdit(bus.id)}
                        disabled={editBusy}
                        className="label-caps bg-on-tertiary-container px-3 py-1.5 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="label-caps hairline px-3 py-1.5 text-on-surface-variant hover:text-on-surface"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={bus.id} className="hairline flex items-center justify-between bg-surface p-sm">
                    <div className="flex items-center gap-md">
                      <div className="flex h-8 w-8 items-center justify-center bg-on-tertiary-container/10 hairline">
                        <span className="material-symbols-outlined text-[18px] text-on-tertiary-container">
                          local_shipping
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="label-caps text-on-surface">{bus.plate_number}</span>
                          {activeBusIds.has(bus.id) || bus.status === 'ON_JOURNEY' ? (
                            <span className="label-caps bg-on-tertiary-container/10 px-1.5 py-0.5 text-[9px] text-on-tertiary-container">
                              ON JOURNEY
                            </span>
                          ) : null}
                        </div>
                        <div className="data-mono text-[11px] text-on-surface-variant">
                          {bus.capacity} seats
                          {activeBusIds.has(bus.id) || bus.status === 'ON_JOURNEY'
                            ? ''
                            : ` · ${STATUS_LABEL[bus.status] ?? bus.status}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(bus)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center transition-colors hover:bg-surface-container-high"
                        title="Edit asset"
                      >
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-on-surface">
                          edit
                        </span>
                      </button>
                      <button
                        onClick={() => onDelete(bus.id)}
                        className="flex h-7 w-7 cursor-pointer items-center justify-center transition-colors hover:bg-error/10"
                        title="Delete asset"
                      >
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant hover:text-error">
                          delete
                        </span>
                      </button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* Driver sessions */}
        <div className="mt-md hairline bg-surface-container-low p-md">
          <div className="mb-sm flex items-center justify-between">
            <div className="font-label-caps text-label-caps text-on-surface-variant">DRIVER SESSIONS</div>
            <span className="data-mono text-[11px] text-on-surface-variant">
              {sessions.filter((s) => s.is_active).length} ACTIVE
            </span>
          </div>

          {generatedCode && (
            <div className="mb-md flex items-center justify-between bg-on-tertiary-container p-sm">
              <div className="flex items-center gap-md">
                <span className="material-symbols-outlined text-white">key</span>
                <div>
                  <div className="data-mono text-[11px] text-white/70">
                    {generatedRemaining > 0 ? 'NEW SESSION' : 'EXPIRED CODE'} ·{' '}
                    {generatedCode.plate_number}
                  </div>
                  <div className="data-mono text-[20px] font-bold tracking-[0.25em] text-white">
                    {generatedCode.session_code}
                  </div>
                  <div className="data-mono text-[10px] text-white/70">
                    {generatedRemaining > 0
                      ? `EXPIRES IN ${formatCountdown(generatedRemaining)}`
                      : 'AWAITING SWEEP'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => copyCode(generatedCode.session_code)}
                className="hairline flex cursor-pointer items-center gap-1 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-white/20"
              >
                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                COPY
              </button>
            </div>
          )}

          {sessionError && (
            <div className="hairline mb-md flex items-center gap-2 border-error bg-error/5 px-3 py-2">
              <span className="material-symbols-outlined text-[16px] text-error">error</span>
              <span className="data-mono text-[12px] text-error">{sessionError}</span>
            </div>
          )}

          <div className="data-mono mb-sm text-[12px] text-on-surface-variant">
            Generate a code so a driver can pair their phone with an asset. The driver signs in with
            this code plus the plate number.
          </div>

          <div className="mb-md flex flex-wrap gap-gutter">
            {buses.map((bus) => {
              const blocking = blockingSessionFor(bus.plate_number);
              const blockingState = blocking ? sessionState(blocking, now) : null;
              return (
                <button
                  key={bus.id}
                  onClick={() => onGenerateSession(bus.plate_number)}
                  disabled={Boolean(blocking) || sessionBusy === bus.plate_number}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 data-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    blocking
                      ? 'bg-surface-dim text-on-surface-variant hairline'
                      : 'border border-on-tertiary-container bg-transparent text-on-tertiary-container hover:bg-on-tertiary-container/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">vpn_key</span>
                  {sessionBusy === bus.plate_number
                    ? 'GENERATING…'
                    : blocking
                      ? `${bus.plate_number} · ${blockingState === 'ACTIVE' ? 'CODE ACTIVE' : 'DRIVER LINKED'}`
                      : `CREATE CODE · ${bus.plate_number}`}
                </button>
              );
            })}
            {buses.length === 0 && (
              <div className="data-mono text-[12px] text-on-surface-variant">
                Register an asset first to create driver sessions.
              </div>
            )}
          </div>

          {sessions.length > 0 ? (
            <div className="flex flex-col gap-gutter">
              {sessions.map((s) => {
                const state = sessionState(s, now);
                const remaining = state === 'ACTIVE' ? secondsLeft(s, now) : 0;
                const dotClass =
                  state === 'ACTIVE'
                    ? 'bg-green-500'
                    : state === 'EXPIRED'
                      ? 'bg-error'
                      : 'bg-outline';

                return (
                  <div
                    key={s.id}
                    className="hairline flex items-center justify-between bg-surface p-sm"
                  >
                    <div className="flex items-center gap-md">
                      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                      <div>
                        <div className="data-mono text-[13px] font-bold tracking-[0.2em] text-on-surface">
                          {s.session_code}
                        </div>
                        <div className="data-mono text-[11px] text-on-surface-variant">
                          {s.plate_number} · {state} ·{' '}
                          {new Date(s.created_at).toLocaleString()}
                        </div>
                        {state === 'ACTIVE' && (
                          <div className="data-mono text-[10px] text-on-surface-variant">
                            EXPIRES IN {formatCountdown(remaining)}
                          </div>
                        )}
                      </div>
                    </div>
                    {(state === 'ACTIVE' || state === 'USED') && (
                      <button
                        onClick={() => onDeactivateSession(s.id)}
                        className="flex h-7 cursor-pointer items-center gap-1 px-2 text-[11px] font-bold text-error transition-colors hover:bg-error/10"
                      >
                        <span className="material-symbols-outlined text-[16px]">lock</span>
                        {state === 'USED' ? 'RELEASE' : 'REVOKE'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="data-mono text-[12px] text-on-surface-variant">No sessions yet.</div>
          )}
        </div>
      </div>
    </OrgShell>
  );
}
