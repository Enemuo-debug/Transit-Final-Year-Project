import { Link } from 'react-router-dom';
import { TopBar, Center, Panel } from '../components/Layout';

const ROLES = [
  {
    to: '/signin/organization',
    icon: 'domain',
    title: 'Organization',
    subtitle: 'Fleet operations & command console',
    eyebrow: 'COMPANY ACCESS',
  },
  {
    to: '/signin/responder',
    icon: 'biotech',
    title: 'Responder',
    subtitle: 'Emergency unit & dispatch console',
    eyebrow: 'RESPONDER ACCESS',
  },
] as const;

export function SignIn() {
  return (
    <div className="grid-bg min-h-screen">
      <TopBar />
      <Center>
        <Panel eyebrow="TRANSIT / SECURE ACCESS" headline="Sign in to Mission Control" backTo="/">
          <div className="flex flex-col gap-4">
            {ROLES.map((role) => (
              <Link
                key={role.to}
                to={role.to}
                className="hairline group flex items-center justify-between bg-surface-dim px-4 py-4 transition-colors hover:border-on-tertiary-container"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center bg-on-tertiary-container/10 hairline">
                    <span className="material-symbols-outlined text-[20px] text-on-tertiary-container">
                      {role.icon}
                    </span>
                  </div>
                  <div>
                    <div className="label-caps text-[10px] text-on-surface-variant">{role.eyebrow}</div>
                    <div className="mt-0.5 text-[16px] font-bold text-on-surface">{role.title}</div>
                    <div className="data-mono text-[11px] text-on-surface-variant">{role.subtitle}</div>
                  </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant transition-transform group-hover:translate-x-1 group-hover:text-on-tertiary-container">
                  arrow_forward
                </span>
              </Link>
            ))}
            <div className="hairline-b mt-2 pt-4 text-center">
              <span className="data-mono text-[12px] text-on-surface-variant">
                No account yet?{' '}
                <Link to="/signup/organization" className="text-on-tertiary-container hover:underline">
                  Register your organization
                </Link>
              </span>
            </div>
          </div>
        </Panel>
      </Center>
    </div>
  );
}