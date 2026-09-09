import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 select-none">
      <div className="flex h-10 w-10 items-center justify-center bg-on-tertiary-container/20 hairline">
        <span className="material-symbols-outlined text-[19px] text-on-tertiary-container">
          radar
        </span>
      </div>
      <div className="leading-none">
        <div className="label-caps text-[15px] font-extrabold tracking-[0.2em] text-on-surface">
          TRANSIT
        </div>
        <div className="label-caps mt-1 text-[9px] text-on-surface-variant">
          Mission Control
        </div>
      </div>
    </Link>
  );
}

export function Wordmark() {
  return (
    <div className="label-caps select-none font-extrabold tracking-[0.3em]">
      <span className="text-on-surface">TRANSIT</span>
      <span className="text-on-tertiary-container">&nbsp;/&nbsp;</span>
      <span className="text-on-surface-variant">MC</span>
    </div>
  );
}

export function StatusPill({ label, tone = 'dim' }: { label: ReactNode; tone?: 'dim' | 'red' }) {
  return (
    <div
      className={`label-caps inline-flex items-center gap-2 px-2 py-1 ${
        tone === 'red'
          ? 'bg-on-tertiary-container/10 text-on-tertiary-container'
          : 'bg-surface-container-high text-on-surface-variant'
      }`}
    >
      <span className={`h-1 w-1 ${tone === 'red' ? 'bg-on-tertiary-container' : 'bg-outline'}`} />
      {label}
    </div>
  );
}