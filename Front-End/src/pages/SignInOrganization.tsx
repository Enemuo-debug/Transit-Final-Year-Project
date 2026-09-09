import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { TopBar, Center, Panel, ErrorNote } from '../components/Layout';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { loginOrganization, setSession, errorLabel } from '../lib/api';

export function SignInOrganization() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await loginOrganization({ email, password });
      setSession({
        token: result.token,
        user: result.user,
        role: 'COMPANY',
      });
      navigate('/dashboard/organization');
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
        <Panel eyebrow="TRANSIT / ORGANIZATION" headline="Sign in to your organization" backTo="/signin">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field
              label="Email Address"
              icon="mail"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="ops@company.ng"
              autoComplete="email"
            />
            <Field
              label="Password"
              icon="lock"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Your password"
              autoComplete="current-password"
            />
            <ErrorNote message={error} />
            <Button type="submit" disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
            <div className="hairline-b mt-2 pt-4 text-center">
              <span className="data-mono text-[12px] text-on-surface-variant">
                Not registered yet?{' '}
                <Link to="/signup/organization" className="text-on-tertiary-container hover:underline">
                  Create an organization account
                </Link>
              </span>
            </div>
          </form>
        </Panel>
      </Center>
    </div>
  );
}