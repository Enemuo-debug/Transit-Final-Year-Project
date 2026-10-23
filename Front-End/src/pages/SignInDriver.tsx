import { useState, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { TopBar, Center, Panel, ErrorNote } from '../components/Layout';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { driverLogin, setSession, errorLabel } from '../lib/api';

export function SignInDriver() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reason = params.get('notice');
  const noticeText =
    reason === 'stream_conflict'
      ? 'Another device tried to stream this bus. Both sessions were invalidated. Ask your dispatcher for a new code.'
      : reason === 'session_invalid'
        ? 'Your session is no longer valid. Ask your dispatcher for a new code.'
        : null;
  const [session_code, setSessionCode] = useState('');
  const [plate_number, setPlateNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await driverLogin({ session_code, plate_number });
      setSession({
        token: result.token,
        user: result.user as unknown as Record<string, unknown>,
        role: 'DRIVER',
      });
      navigate('/dashboard/driver');
    } catch (err) {
      setError(errorLabel(err instanceof Error ? err.message : 'REQUEST_FAILED'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid-bg min-h-screen">
      <TopBar />
      <Center>
        <Panel eyebrow="TRANSIT / DRIVER" headline="Driver sign in" backTo="/signin">
          {noticeText ? (
            <div className="hairline mb-4 border-error/50 bg-error/5 p-3 data-mono text-[12px] leading-relaxed text-error">
              {noticeText}
            </div>
          ) : null}
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label="Session Code"
              icon="vpn_key"
              value={session_code}
              onChange={(v) => setSessionCode(v.toUpperCase())}
              placeholder="e.g. XD4WJ4"
              autoComplete="off"
            />
            <Field
              label="Bus Plate Number"
              icon="local_shipping"
              value={plate_number}
              onChange={(v) => setPlateNumber(v.toUpperCase())}
              placeholder="e.g. ABC-123-XY"
              autoComplete="off"
            />
            <ErrorNote message={error} />
            <Button type="submit" disabled={busy || !session_code || !plate_number}>
              {busy ? 'Signing in…' : 'Link to bus & start'}
            </Button>
            <div className="hairline-b mt-2 pt-4 text-center">
              <span className="data-mono text-[12px] text-on-surface-variant">
                Need a code? Ask your{' '}
                <Link to="/signin/organization" className="text-on-tertiary-container hover:underline">
                  dispatcher
                </Link>{' '}
                to generate one. Codes expire 10 minutes after creation and can be used once.
              </span>
            </div>
          </form>
        </Panel>
      </Center>
    </div>
  );
}
