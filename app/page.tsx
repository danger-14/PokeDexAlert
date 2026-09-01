import StoreManager from "./StoreManager";

const builtInStores = [
  "PokePulls",
  "TCG Kauppa",
  "Swagykarp",
];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <span className="pill">
          Monitor active
        </span>

        <h1>PokeDexAlert</h1>

        <p className="hero-copy">
          Monitoring Finnish stores for Pokémon
          30th Anniversary products and sending
          direct purchase links when stock appears.
        </p>

        <div className="filter-grid">
          <div>
            <span>Products</span>
            <strong>
              ETB, Booster Box, Bundle and UPC
            </strong>
          </div>

          <div>
            <span>Schedule</span>
            <strong>Every 5 minutes</strong>
          </div>

          <div>
            <span>Built-in stores</span>
            <strong>
              {builtInStores.length} active
            </strong>
          </div>
        </div>

        <div className="built-in-stores">
          {builtInStores.map((store) => (
            <span key={store}>{store}</span>
          ))}
        </div>
      </section>

      <StoreManager />
    </main>
  );
}
