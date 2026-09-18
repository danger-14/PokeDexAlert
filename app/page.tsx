import StoreManager from "./StoreManager";
import TestAlertPanel from "./TestAlertPanel";

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="pill">
          Monitor active
        </span>

        <h1>PokeDexAlert</h1>

        <p className="hero-copy">
          Add any shop and any
          product you want to
          monitor. Alerts are sent
          only when the product is
          genuinely orderable.
        </p>

        <div className="filter-grid">
          <div>
            <span>Products</span>
            <strong>
              Whatever product you
              add
            </strong>
          </div>

          <div>
            <span>Schedule</span>
            <strong>
              Every 5 minutes
            </strong>
          </div>

          <div>
            <span>
              Safety rule
            </span>

            <strong>
              No alerts for Coming
              Soon / Fully Booked /
              Watch
            </strong>
          </div>
        </div>

        <div className="built-in-stores">
          <span>
            Preset:
            K-Citymarket Jumbo
          </span>
        </div>
      </section>

      <StoreManager />

      <TestAlertPanel />
    </main>
  );
}
