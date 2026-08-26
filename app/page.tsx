export default function Home() {
  return (
    <main>
      <span className="pill">Monitor ready</span>

      <h1>PokeDexAlert</h1>

      <p>
        Monitoring PokePulls, TCG Kauppa, and Swagykarp for Pokémon
        30th Anniversary products.
      </p>

      <ul>
        <li>Elite Trainer Boxes (ETBs)</li>
        <li>Booster Boxes and Booster Displays</li>
        <li>Booster Bundles</li>
        <li>Ultra-Premium Collections (UPCs)</li>
      </ul>

      <p>
        Alerts will be sent when a matching product becomes available
        for purchase or preorder.
      </p>

      <p>
        Protected checking endpoint: <code>/api/check-stock</code>
      </p>
    </main>
  );
}
