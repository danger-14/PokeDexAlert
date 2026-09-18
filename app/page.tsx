import StoreManager from "./StoreManager";
import TestAlertPanel from "./TestAlertPanel";

export default function Home() {
  return (
    <main className="app-shell">
      <header className="minimal-header">
        <div>
          <h1>PokeDexAlert</h1>

          <p>
            Product availability
            monitor
          </p>
        </div>

        <span className="monitor-live">
          <span />
          Monitoring
        </span>
      </header>

      <StoreManager />

      <TestAlertPanel />
    </main>
  );
}
