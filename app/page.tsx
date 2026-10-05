const stores = ["PokePulls", "TCG Kauppa", "SwagyKarp", "Prisma"];
const products = ["Elite Trainer Box", "Booster Box / Display", "Booster Bundle", "Ultra-Premium Collection Day / Night"];

export default function Home() {
  return (
    <main>
      <section className="hero">
        <div className="badge">30TH ANNIVERSARY MONITOR</div>
        <h1>PokeDexAlert</h1>
        <p>Simple stock alerts for the Pokémon 30th Anniversary products you actually want.</p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Stores</h2>
          {stores.map((x) => <div className="row" key={x}><span>{x}</span><strong>ON</strong></div>)}
        </article>
        <article className="card">
          <h2>Watching</h2>
          {products.map((x) => <div className="row" key={x}><span>{x}</span><span>✓</span></div>)}
        </article>
      </section>

      <section className="card info">
        <h2>How it works</h2>
        <p>One checker discovers matching 30th Anniversary listings, checks their product pages, uses Prisma availability data when possible, and emails only when an item changes into an available state.</p>
        <p>No auto-buying. No browser worker. No extra retailers. Checkout stays manual.</p>
      </section>
    </main>
  );
}
