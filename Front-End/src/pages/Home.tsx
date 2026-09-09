import { Link } from 'react-router-dom';

const NAV = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/signup/organization', icon: 'dashboard_customize', label: 'Command' },
  { to: '/signup/responder', icon: 'biotech', label: 'Telemetry' },
  { to: '/signup/organization', icon: 'inventory', label: 'Assets' },
] as const;

const BOTTOM_NAV = [
  { to: '/', icon: 'home', label: 'Home' },
  { to: '/signup/organization', icon: 'grid_view', label: 'Command' },
  { to: '/signup/responder', icon: 'sensors', label: 'Live' },
  { to: '/signup/organization', icon: 'local_shipping', label: 'Assets' },
] as const;

const TECH_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAI-1diGF6X--7--8OzOMpqaQjKaHxzj_Ukm_bMP07iWm9LW7DoW3zwUm928PwHX5bSdaZNvqt-kRN1891vKHVvIaovnaQFjWBa-g0u3c-2Njrpvj_4pV_SbOkFi7Pkbxc-DDsD_Ak5IodaHPIOyJ5b-SpM5Y1oJ91pkxCCt3992FK2RpndZaNlGFWLCVIXVvAClZBZf73u97DQ3UUoj7mxpsrzpZnuEjlPIq74_pgyhF14JB0VfIOXocRQdSRJZaNOgurD0D7smQ';

const MAP_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBO1mch-oUvoG_5R2Oso2swsNXfDOowvZ_1-q2Y3BSKvD8u2Q51uy_03694Xy0vedrvD5_exHzSwykhm8GzKfA69jRJi8IOOYdCUSvExtXoNAVg_GZf-ep46bdaNpkLJyQsRNniRn8D58mKUH4-g4PIMMPjugJL55zZfrwKQ4PDxP3xvUjulo_bnNStAam4gyiFH5ePA92sz_qyzj-CHCMWviyrYdIdeqbhWO_lTJUzjN3pOA8KaVQc6GZG9bp5062PfwAwdddMRQ';

export function Home() {
  return (
    <div className="bg-background text-on-surface">
      {/* Sidebar Navigation (Desktop) */}
      <nav className="bg-surface-dim fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col border-r border-outline-variant md:flex">
        <div className="flex flex-col items-start gap-xs border-b border-outline-variant p-md">
          <span className="text-primary font-display-lg text-display-lg tracking-tighter">
            TRANSIT
          </span>
          <span className="text-on-surface-variant font-label-caps text-label-caps opacity-70">
            Vigilance Alpha
          </span>
        </div>
        <div className="flex-grow py-md">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`flex items-center gap-md px-md py-sm font-bold transition-all ${
                item.label === 'Home'
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontFeatureSettings: `"dlig"` }}
              >
                {item.icon}
              </span>
              <span className="font-label-caps text-label-caps">{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="space-y-sm border-t border-outline-variant p-md">
          <a className="flex items-center gap-md py-xs text-on-surface-variant transition-colors hover:text-primary" href="#">
            <span className="material-symbols-outlined">help</span>
            <span className="font-label-caps text-label-caps">Support</span>
          </a>
          <a className="flex items-center gap-md py-xs text-on-surface-variant transition-colors hover:text-primary" href="#">
            <span className="material-symbols-outlined">history</span>
            <span className="font-label-caps text-label-caps">Logs</span>
          </a>
          <button className="bg-on-tertiary-container mt-lg w-full py-sm text-[11px] font-bold tracking-widest text-white hover:opacity-90 transition-opacity">
            EMERGENCY HALT
          </button>
        </div>
      </nav>

      {/* Top App Bar (Mobile) */}
      <header className="bg-surface fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant px-margin-safe md:hidden">
        <span className="text-primary font-display-lg font-bold tracking-tighter">TRANSIT</span>
        <div className="flex items-center gap-md">
          <span className="material-symbols-outlined text-primary">notifications</span>
          <div className="border h-8 w-8 bg-surface-container-highest border-outline" />
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="min-h-screen pt-16 md:ml-64 md:pt-0">
        {/* Hero Section */}
        <section className="relative flex h-[716px] flex-col justify-center overflow-hidden border-b border-outline-variant px-margin-safe">
          <div className="grid-pattern pointer-events-none absolute inset-0 opacity-20" />
          <div className="scanline" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 opacity-10">
            <img alt="" className="h-full w-full object-cover" src={TECH_IMAGE} />
          </div>
          <div className="relative z-20 max-w-4xl">
            <div className="border-on-tertiary-container mb-md inline-flex items-center gap-xs border px-sm py-xs">
              <span className="bg-on-tertiary-container w-2 h-2 animate-pulse" />
              <span className="text-on-tertiary-container font-label-caps tracking-widest">
                SYSTEM ONLINE // LEVEL 4 CLEARANCE
              </span>
            </div>
            <h1 className="text-primary font-display-lg mb-lg text-6xl font-bold leading-none tracking-tighter md:text-8xl">
              TRANSIT: MISSION CONTROL
            </h1>
            <div className="flex flex-col gap-gutter md:flex-row">
              <Link
                to="/signup/organization"
                className="group bg-primary text-on-primary flex items-center justify-between px-lg py-md font-bold tracking-widest transition-colors hover:bg-on-surface"
              >
                <span className="font-label-caps text-label-caps">Launch Command Dashboard</span>
                <span className="material-symbols-outlined ml-lg transition-transform group-hover:translate-x-1">
                  arrow_forward
                </span>
              </Link>
              <Link
                to="/signup/responder"
                className="text-primary border border-outline-variant px-lg py-md font-bold tracking-widest transition-colors hover:bg-surface-container-high"
              >
                <span className="font-label-caps text-label-caps">Monitor Live Telemetry</span>
              </Link>
              <Link
                to="/signup/organization"
                className="text-primary border border-outline-variant px-lg py-md font-bold tracking-widest transition-colors hover:bg-surface-container-high"
              >
                <span className="font-label-caps text-label-caps">Register New Asset</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Bento Stats Grid */}
        <section className="bg-outline-variant grid grid-cols-1 gap-gutter md:grid-cols-12">
          <div className="grid grid-cols-1 gap-gutter md:col-span-8 md:grid-cols-2">
            <div className="bg-surface p-lg">
              <span className="text-on-surface-variant mb-md block font-label-caps">Total Fleet Capacity</span>
              <div className="flex items-end gap-sm">
                <span className="text-primary font-display-lg text-5xl font-bold">14,208</span>
                <span className="text-on-tertiary-container mb-xs font-label-caps">+2.4%</span>
              </div>
              <div className="bg-surface-container-highest mt-lg h-1 w-full">
                <div className="bg-primary h-full w-3/4" />
              </div>
            </div>
            <div className="bg-surface p-lg">
              <span className="text-on-surface-variant mb-md block font-label-caps">Daily Successful Journeys</span>
              <div className="flex items-end gap-sm">
                <span className="text-primary font-display-lg text-5xl font-bold">8,942</span>
                <span className="material-symbols-outlined text-on-tertiary-container mb-xs">trending_up</span>
              </div>
              <div className="mt-lg flex gap-xs">
                <div className="bg-surface-container-high h-8 flex-grow border-t border-outline-variant" />
                <div className="bg-surface-container-highest h-10 flex-grow border-t border-outline-variant" />
                <div className="bg-primary h-12 flex-grow border-t border-outline-variant" />
                <div className="bg-surface-container-high h-8 flex-grow border-t border-outline-variant" />
              </div>
            </div>
          </div>

          <div className="bg-surface border-outline-variant p-lg md:col-span-4 md:border-l md:border-l-0">
            <div className="mb-lg flex items-center justify-between">
              <span className="text-on-surface-variant font-label-caps">System Status</span>
              <span className="material-symbols-outlined text-on-tertiary-container animate-pulse">
                sensors
              </span>
            </div>
            <div className="space-y-md">
              <div className="flex items-center justify-between border-b border-outline-variant py-sm">
                <span className="text-on-surface-variant font-body-sm">Uptime</span>
                <span className="text-primary font-data-mono">99.998%</span>
              </div>
              <div className="flex items-center justify-between border-b border-outline-variant py-sm">
                <span className="text-on-surface-variant font-body-sm">Active Nodes</span>
                <span className="text-primary font-data-mono">1,024 / 1,024</span>
              </div>
              <div className="flex items-center justify-between border-b border-outline-variant py-sm">
                <span className="text-on-surface-variant font-body-sm">Security Lvl</span>
                <span className="text-on-tertiary-container font-data-mono font-bold">
                  Level 4
                </span>
              </div>
              <div className="flex items-center justify-between py-sm">
                <span className="text-on-surface-variant font-body-sm">Latency</span>
                <span className="text-primary font-data-mono">14ms</span>
              </div>
            </div>
            <div className="bg-surface-container-low mt-lg border border-outline-variant p-md">
              <p className="text-on-surface-variant font-body-sm italic">
                “Operational integrity is the only metric that matters.”
              </p>
            </div>
          </div>
        </section>

        {/* Command Map Preview Section */}
        <section className="bg-surface min-h-[400px] p-lg">
          <div className="mb-lg flex items-end justify-between">
            <div>
              <span className="text-on-surface-variant font-label-caps">Global Asset Cluster</span>
              <h2 className="text-primary mt-xs font-headline-sm font-bold">
                Real-time Trajectory Overview
              </h2>
            </div>
            <div className="flex gap-xs">
              <button className="hover:bg-surface-container-high flex h-10 w-10 items-center justify-center border border-outline-variant transition-colors">
                <span className="material-symbols-outlined">add</span>
              </button>
              <button className="hover:bg-surface-container-high flex h-10 w-10 items-center justify-center border border-outline-variant transition-colors">
                <span className="material-symbols-outlined">remove</span>
              </button>
            </div>
          </div>
          <div className="bg-surface-container relative h-96 w-full overflow-hidden border border-outline-variant">
            <img
              alt="Global Map"
              className="h-full w-full object-cover opacity-50 grayscale contrast-125"
              src={MAP_IMAGE}
            />
            <div className="bg-background absolute left-4 top-4 border border-outline-variant p-md">
              <div className="mb-sm flex items-center gap-md">
                <span className="bg-on-tertiary-container w-2 h-2" />
                <span className="text-primary font-label-caps">Critical Alert: Sector 7</span>
              </div>
              <span className="text-on-surface-variant font-data-mono">
                Coord: 40.7128° N, 74.0060° W
              </span>
            </div>
          </div>
        </section>
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="bg-surface-container-lowest fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-outline-variant md:hidden">
        {BOTTOM_NAV.map((item, i) => (
          <Link
            key={item.label}
            to={item.to}
            className={`flex scale-95 flex-col items-center justify-center p-2 transition-transform ${
              i === 0 ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
            }`}
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="font-label-caps text-label-caps">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}