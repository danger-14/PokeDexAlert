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
  product_name: string | null;
  listing_url: string;
  created_at: string;
};

export default function StoreManager() {
  const [stores, setStores] =
    useState<Store[]>([]);

  const [name, setName] =
    useState("");

  const [
    productName,
    setProductName,
  ] = useState("");

  const [
    productUrl,
    setProductUrl,
  ] = useState("");

  const [
    adminSecret,
    setAdminSecret,
  ] = useState("");

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const loadStores =
    useCallback(async () => {
      try {
        const response = await fetch(
          "/api/stores",
          {
            cache: "no-store",
          },
        );

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.ok
        ) {
          throw new Error(
            data.error ||
              "Could not load monitored products.",
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

  function useJumboPreset() {
    setName(
      "K-Citymarket Jumbo",
    );

    setMessage(
      "Jumbo selected. Paste the exact K-Ruoka product page URL and enter the product name.",
    );
  }

  async function addStore(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(
        "/api/stores",
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "x-admin-secret":
              adminSecret,
          },
          body: JSON.stringify({
            name,
            productName,
            productUrl,
          }),
        },
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.error ||
            "Could not add product monitor.",
        );
      }

      setProductName("");
      setProductUrl("");

      setMessage(
        `${
          data.store
            .product_name ||
          "Product"
        } was added.`,
      );

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

  async function removeStore(
    store: Store,
  ) {
    const confirmed =
      window.confirm(
        `Stop monitoring ${
          store.product_name ||
          store.name
        }?`,
      );

    if (!confirmed) return;

    setMessage("");

    try {
      const response = await fetch(
        "/api/stores",
        {
          method: "DELETE",
          headers: {
            "content-type":
              "application/json",
            "x-admin-secret":
              adminSecret,
          },
          body: JSON.stringify({
            id: store.id,
          }),
        },
      );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.error ||
            "Could not remove monitor.",
        );
      }

      setMessage(
        `${
          store.product_name ||
          store.name
        } was removed.`,
      );

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
            Product monitoring
          </span>

          <h2>
            Add any store + product
          </h2>
        </div>

        <span className="store-count">
          {stores.length} active{" "}
          {stores.length === 1
            ? "monitor"
            : "monitors"}
        </span>
      </div>

      <p>
        Enter the shop, the
        product you want, and its
        URL. An exact product page
        is the most reliable.
      </p>

      <div className="preset-row">
        <span>Store preset</span>

        <button
          type="button"
          className="preset-button"
          onClick={
            useJumboPreset
          }
        >
          K-Citymarket Jumbo
        </button>
      </div>

      <form onSubmit={addStore}>
        <label>
          Store name

          <input
            type="text"
            value={name}
            onChange={(event) =>
              setName(
                event.target.value,
              )
            }
            placeholder="Example: MaxGaming"
            required
            minLength={2}
            maxLength={80}
          />
        </label>

        <label>
          Product name

          <input
            type="text"
            value={productName}
            onChange={(event) =>
              setProductName(
                event.target.value,
              )
            }
            placeholder="Example: Pokémon 30th Celebration ETB"
            required
            minLength={2}
            maxLength={160}
          />
        </label>

        <label className="full-width">
          Product page URL

          <input
            type="url"
            value={productUrl}
            onChange={(event) =>
              setProductUrl(
                event.target.value,
              )
            }
            placeholder="https://shop.example/product/..."
            required
          />
        </label>

        <label className="full-width">
          Admin password

          <input
            type="password"
            value={adminSecret}
            onChange={(event) =>
              setAdminSecret(
                event.target.value,
              )
            }
            placeholder="Your ADMIN_SECRET"
            required
            autoComplete="current-password"
          />
        </label>

        <button
          type="submit"
          disabled={saving}
        >
          {saving
            ? "Adding monitor..."
            : "Monitor this product"}
        </button>
      </form>

      {message && (
        <p
          className="form-message"
          role="status"
        >
          {message}
        </p>
      )}

      <div className="store-list">
        <h3>
          Monitored products
        </h3>

        {loading ? (
          <p>
            Loading monitors...
          </p>
        ) : stores.length ===
          0 ? (
          <p>
            No products added yet.
          </p>
        ) : (
          stores.map((store) => (
            <article
              className="store-card"
              key={store.id}
            >
              <div>
                <strong>
                  {store.product_name ||
                    "Unnamed product"}
                </strong>

                <span className="store-name">
                  {store.name}
                </span>

                <a
                  href={
                    store.listing_url
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {
                    store.listing_url
                  }
                </a>
              </div>

              <button
                type="button"
                className="remove-button"
                onClick={() =>
                  removeStore(store)
                }
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
