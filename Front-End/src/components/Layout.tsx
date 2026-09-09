import type { ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Brand, Wordmark } from './Brand';

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <header className="hairline-b fixed inset-x-0 top-0 z-30 flex items-center justify-between bg-background/85 px-5 py-3 backdrop-blur-sm">
      <Brand />
      {right ?? <Wordmark />}
    </header>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return (
    <main className="grid-bg flex min-h-screen flex-col px-5 pb-16 pt-24">
      {children}
    </main>
  );
}

export function Panel({
  eyebrow,
  headline,
  children,
  width = 'max-w-xl',
  backTo,
}: {
  eyebrow?: ReactNode;
  headline: ReactNode;
  children: ReactNode;
  width?: string;
  backTo?: string;
}) {
  return (
    <div className={`w-full ${width} mx-auto flex flex-col`}>
      {backTo ? (
        <Link
          to={backTo}
          className="label-caps mb-5 flex w-fit items-center gap-2 text-on-surface-variant transition-colors hover:text-on-tertiary-container"
        >
          <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          {backTo === '/' ? 'Back to home' : 'Back'}
        </Link>
      ) : null}
      <div className="mb-4 flex items-end justify-between border-b border-on-tertiary-container pb-2">
        <div>
          <div className="label-caps text-on-surface-variant">
            {eyebrow ?? 'TRANSIT / SECURE ACCESS'}
          </div>
          <h1 className="mt-1 text-[22px] font-extrabold tracking-wide text-on-surface">
            {headline}
          </h1>
        </div>
        <StatusBlock />
      </div>
      <div className="hairline bg-surface p-6">{children}</div>
    </div>
  );
}

function StatusBlock() {
  return (
    <div className="data-mono label-caps m-0 flex items-center gap-2 text-[11px] text-on-surface-variant">
      <span className="inline-block h-1.5 w-1.5 rounded-none bg-on-tertiary-container" />
      ONLINE
    </div>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="hairline flex items-center gap-2 border-error bg-error/5 px-3 py-2">
      <span className="material-symbols-outlined text-[16px] text-error">error</span>
      <span className="data-mono text-[12px] text-error">{message}</span>
    </div>
  );
}

export function SignOutButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => {
        localStorage.removeItem('transit.session');
        navigate('/');
      }}
      className="label-caps flex items-center gap-2 text-on-surface-variant transition-colors hover:text-error"
    >
      <span className="material-symbols-outlined text-[18px]">logout</span>
      Sign out
    </button>
  );
}