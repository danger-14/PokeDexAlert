"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

type Store = {
  id: string;
  name: string;
  listing_url: string;
  created_at: string;
};

export default function StoreManager() {
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState("");
  const [listingUrl, setListingUrl] = useState("");
  const [adminSecret, setAdminSecret] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      const response = await fetch("/api/stores", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "Could not load stores.",
        );
      }

      setStores(data.stores);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  async function addStore(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/stores", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          name,
          listingUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "Could not add store.",
        );
      }

      setName("");
      setListingUrl("");
      setMessage(`${data.store.name} was added.`);
      await loadStores();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error),
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeStore(store: Store) {
    const confirmed = window.confirm(
      `Stop monitoring ${store.name}?`,
    );

    if (!confirmed) {
      return;
    }

    setMessage("");

    try {
      const response = await fetch("/api/stores", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          id: store.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "Could not remove store.",
        );
      }

      setMessage(`${store.name} was removed.`);
      await loadStores();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }

  return (
    <section className="store-manager">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            Custom monitoring
          </span>

          <h2>Add another store</h2>
        </div>

        <span className="store-count">
          {stores.length} custom{" "}
          {stores.length === 1 ? "store" : "stores"}
        </span>
      </div>

      <p>
        Add a store&apos;s Pokémon category, search, or
        preorder page. PokeDexAlert will apply the same
        30th Anniversary product filters automatically.
      </p>

      <form onSubmit={addStore}>
        <label>
          Store name
          <input
            type="text"
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="Example: K-Citymarket"
            required
            minLength={2}
            maxLength={80}
          />
        </label>

        <label>
          Store listing or search URL
          <input
            type="url"
            value={listingUrl}
            onChange={(event) =>
              setListingUrl(event.target.value)
            }
            placeholder="https://example.fi/pokemon"
            required
          />
        </label>

        <label>
          Admin password
          <input
            type="password"
            value={adminSecret}
            onChange={(event) =>
              setAdminSecret(event.target.value)
            }
            placeholder="Your ADMIN_SECRET"
            required
            autoComplete="current-password"
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "Adding store..." : "Add store"}
        </button>
      </form>

      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}

      <div className="store-list">
        <h3>Custom stores</h3>

        {loading ? (
          <p>Loading stores...</p>
        ) : stores.length === 0 ? (
          <p>No custom stores added yet.</p>
        ) : (
          stores.map((store) => (
            <article
              className="store-card"
              key={store.id}
            >
              <div>
                <strong>{store.name}</strong>

                <a
                  href={store.listing_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {store.listing_url}
                </a>
              </div>

              <button
                type="button"
                className="remove-button"
                onClick={() => removeStore(store)}
              >
                Remove
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
