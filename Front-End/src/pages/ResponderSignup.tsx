import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TopBar, Center, Panel, ErrorNote } from '../components/Layout';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { registerResponder, setSession, errorLabel } from '../lib/api';

const AGENCIES = ['POLICE', 'FRSC', 'NEMA', 'MEDICAL'] as const;

export function ResponderSignup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agency_type, setAgencyType] = useState<string>(AGENCIES[0]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await registerResponder({ name, email, password, agency_type });
      setSession({ token: result.token, user: result.user, role: 'RESPONDER' });
      navigate('/dashboard/responder');
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
        <Panel
          eyebrow="TRANSIT / RESPONDER"
          headline="Register your responder unit"
          backTo="/"
        >
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label="Agency / Responder Name"
              icon="local_police"
              value={name}
              onChange={setName}
              placeholder="Rapid Rescue Unit"
            />
            <Field
              label="Email Address"
              icon="mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="unit@rescue.ng"
              autoComplete="email"
            />
            <Field
              label="Password"
              icon="lock"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
            />
            <div className="flex flex-col gap-1.5">
              <span className="label-caps text-on-surface-variant">Agency Type</span>
              <div className="grid grid-cols-2 gap-2">
                {AGENCIES.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgencyType(a)}
                    className={`label-caps px-3 py-2.5 transition-colors ${
                      agency_type === a
                        ? 'bg-on-tertiary-container text-white'
                        : 'bg-surface-dim text-on-surface-variant hairline hover:text-on-surface'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <ErrorNote message={error} />
            <Button type="submit" disabled={busy || !name || !email || !password || !agency_type}>
              {busy ? 'Registering…' : 'Create account'}
            </Button>
            <div className="hairline-b mt-2 pt-4 text-center">
              <span className="data-mono text-[12px] text-on-surface-variant">
                Already registered?{' '}
                <Link to="/signin/responder" className="text-on-tertiary-container hover:underline">
                  Sign in to your responder unit
                </Link>
              </span>
            </div>
          </form>
        </Panel>
      </Center>
    </div>
  );
}