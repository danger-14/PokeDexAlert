"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Monitor = {
  id: string;
  name: string;
  product_name: string | null;
  listing_url: string;
  created_at: string;
};

type ProductStatus = {
  monitorId?: string;
  identityKey?: string;
  storeProductId?: string;
  ean?: string;
  store: string;
  title: string;
  url: string;
  price?: string;
  sku?: string;
  stockText?: string;
  statusText?: string;
  state:
    | "in_stock"
    | "preorder"
    | "coming_soon"
    | "fully_booked"
    | "out_of_stock"
    | "watch_only"
    | "unknown";
  available: boolean;
  evidence: string[];
};

type StatusResult = {
  product: ProductStatus;
  checkedAt: string;
};

const STATE_LABELS: Record<ProductStatus["state"], string> = {
  in_stock: "In stock",
  preorder: "Preorder",
  coming_soon: "Coming soon",
  fully_booked: "Fully booked",
  out_of_stock: "Out of stock",
  watch_only: "Unavailable",
  unknown: "Unknown",
};

function isPresetStore(name: string) {
  const normalized = name.toLowerCase();

  return (
    normalized.includes("k-citymarket") &&
    normalized.includes("jumbo")
  );
}

function getHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function StoreManager() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [adminSecret, setAdminSecret] = useState("");

  const [expandedStore, setExpandedStore] = useState<string | null>(null);

  const [statuses, setStatuses] = useState<
    Record<string, StatusResult>
  >({});

  const [checking, setChecking] = useState<Record<string, boolean>>({});
  const [statusErrors, setStatusErrors] = useState<Record<string, string>>({});

  const [showNewStore, setShowNewStore] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreProduct, setNewStoreProduct] = useState("");
  const [newStoreUrl, setNewStoreUrl] = useState("");

  const [addingProductTo, setAddingProductTo] = useState<string | null>(null);
  const [addProductName, setAddProductName] = useState("");
  const [inheritedProductUrl, setInheritedProductUrl] = useState("");
  const [useDifferentUrl, setUseDifferentUrl] = useState(false);
  const [differentProductUrl, setDifferentProductUrl] = useState("");

  const [editingProduct, setEditingProduct] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState("");
  const [editProductUrl, setEditProductUrl] = useState("");

  const [storeSettings, setStoreSettings] = useState<string | null>(null);
  const [renamedStore, setRenamedStore] = useState("");

  const [saving, setSaving] = useState(false);

  const loadStores = useCallback(async () => {
    try {
      const response = await fetch("/api/stores", {
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(
          data.error || "Could not load monitored stores.",
        );
      }

      setMonitors(data.stores);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const stores = useMemo(() => {
    const grouped = new Map<string, Monitor[]>();

    for (const monitor of monitors) {
      const name = monitor.name.trim();
      const current = grouped.get(name) || [];
      current.push(monitor);
      grouped.set(name, current);
    }

    return [...grouped.entries()];
  }, [monitors]);

  async function checkMonitor(monitor: Monitor) {
    setChecking((current) => ({
      ...current,
      [monitor.id]: true,
    }));

    setStatusErrors((current) => ({
      ...current,
      [monitor.id]: "",
    }));

    try {
      const response = await fetch(
        `/api/stores/status?id=${encodeURIComponent(monitor.id)}`,
        {
          cache: "no-store",
        },
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Status check failed.");
      }

      setStatuses((current) => ({
        ...current,
        [monitor.id]: {
          product: data.product,
          checkedAt: data.checkedAt,
        },
      }));
    } catch (error) {
      setStatusErrors((current) => ({
        ...current,
        [monitor.id]:
          error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setChecking((current) => ({
        ...current,
        [monitor.id]: false,
      }));
    }
  }

  async function toggleStore(store: string, products: Monitor[]) {
    if (expandedStore === store) {
      setExpandedStore(null);
      return;
    }

    setExpandedStore(store);

    await Promise.all(
      products.map((product) => checkMonitor(product)),
    );
  }

  function useJumboPreset() {
    setNewStoreName("K-Citymarket Jumbo");
  }

  async function addNewStore(event: FormEvent) {
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
          name: newStoreName,
          productName: newStoreProduct,
          productUrl: newStoreUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not add store.");
      }

      const createdName = newStoreName;

      setNewStoreName("");
      setNewStoreProduct("");
      setNewStoreUrl("");
      setShowNewStore(false);
      setMessage("Store added.");

      await loadStores();
      setExpandedStore(createdName);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function startAddProduct(store: string, products: Monitor[]) {
    const existingUrl = products[0]?.listing_url || "";

    setAddingProductTo(store);
    setAddProductName("");
    setInheritedProductUrl(existingUrl);
    setDifferentProductUrl(existingUrl);
    setUseDifferentUrl(false);
    setExpandedStore(store);
  }

  function cancelAddProduct() {
    setAddingProductTo(null);
    setAddProductName("");
    setUseDifferentUrl(false);
    setDifferentProductUrl("");
  }

  async function addProduct(event: FormEvent) {
    event.preventDefault();

    if (!addingProductTo) return;

    const sourceUrl = useDifferentUrl
      ? differentProductUrl
      : inheritedProductUrl;

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
          name: addingProductTo,
          productName: addProductName,
          productUrl: sourceUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not add product.");
      }

      const store = addingProductTo;
      cancelAddProduct();
      setMessage("Product added.");

      await loadStores();
      setExpandedStore(store);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function startEditProduct(monitor: Monitor) {
    setEditingProduct(monitor.id);
    setEditProductName(monitor.product_name || "");
    setEditProductUrl(monitor.listing_url);
  }

  function cancelEditProduct() {
    setEditingProduct(null);
    setEditProductName("");
    setEditProductUrl("");
  }

  async function saveProduct(monitor: Monitor) {
    setSaving(true);
    setMessage("");

    const updatedName = editProductName;
    const updatedUrl = editProductUrl;

    try {
      const response = await fetch("/api/stores", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          kind: "product",
          id: monitor.id,
          productName: updatedName,
          productUrl: updatedUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not update product.");
      }

      cancelEditProduct();
      setMessage("Product updated.");
      await loadStores();

      await checkMonitor({
        ...monitor,
        product_name: updatedName,
        listing_url: updatedUrl,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct(monitor: Monitor) {
    const confirmed = window.confirm(
      `Stop monitoring ${monitor.product_name || "this product"}?`,
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/stores", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          kind: "product",
          id: monitor.id,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not remove product.");
      }

      cancelEditProduct();

      setStatuses((current) => {
        const next = { ...current };
        delete next[monitor.id];
        return next;
      });

      setStatusErrors((current) => {
        const next = { ...current };
        delete next[monitor.id];
        return next;
      });

      setMessage("Product removed.");
      await loadStores();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  function toggleStoreSettings(store: string) {
    if (storeSettings === store) {
      setStoreSettings(null);
      return;
    }

    setStoreSettings(store);
    setRenamedStore(store);
  }

  async function saveStoreName(currentName: string) {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/stores", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          kind: "store",
          oldName: currentName,
          newName: renamedStore,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not rename store.");
      }

      const nextName = renamedStore;
      setStoreSettings(null);
      setExpandedStore(nextName);
      setMessage("Store renamed.");
      await loadStores();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeWholeStore(store: string) {
    const confirmed = window.confirm(
      `Remove ${store} and every product monitored under it?`,
    );

    if (!confirmed) return;

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/stores", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminSecret,
        },
        body: JSON.stringify({
          kind: "store",
          name: store,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Could not remove store.");
      }

      setStoreSettings(null);
      setExpandedStore(null);
      setMessage("Store removed.");
      await loadStores();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="monitor-dashboard">
      <div className="dashboard-toolbar">
        <div>
          <h2>Monitored stores</h2>
          <p>
            {stores.length} {stores.length === 1 ? "store" : "stores"}
          </p>
        </div>

        <button
          className="tool-button"
          type="button"
          onClick={() => setShowNewStore((current) => !current)}
        >
          {showNewStore ? "Close" : "+ Add store"}
        </button>
      </div>

      {showNewStore && (
        <form className="editor-panel" onSubmit={addNewStore}>
          <div className="editor-heading">
            <strong>Add store</strong>
            <span>Add the store and its first product.</span>
          </div>

          <div className="preset-line">
            <span>Preset</span>
            <button
              type="button"
              className="tool-button compact"
              onClick={useJumboPreset}
            >
              K-Citymarket Jumbo
            </button>
          </div>

          <div className="editor-grid">
            <label>
              Store name
              <input
                value={newStoreName}
                onChange={(event) => setNewStoreName(event.target.value)}
                placeholder="Prisma"
                required
              />
            </label>

            <label>
              First product
              <input
                value={newStoreProduct}
                onChange={(event) => setNewStoreProduct(event.target.value)}
                placeholder="30th Anniversary ETB"
                required
              />
            </label>

            <label className="wide">
              Store / product URL
              <input
                type="url"
                value={newStoreUrl}
                onChange={(event) => setNewStoreUrl(event.target.value)}
                placeholder="https://..."
                required
              />
            </label>

            <label className="wide">
              Admin password
              <input
                type="password"
                value={adminSecret}
                onChange={(event) => setAdminSecret(event.target.value)}
                required
              />
            </label>
          </div>

          <div className="editor-actions">
            <button
              type="submit"
              className="tool-button strong"
              disabled={saving}
            >
              {saving ? "Saving..." : "Start monitoring"}
            </button>
          </div>
        </form>
      )}

      {message && <p className="dashboard-message">{message}</p>}

      <div className="stores-list">
        {loading ? (
          <p className="empty-state">Loading stores...</p>
        ) : stores.length === 0 ? (
          <p className="empty-state">No stores are being monitored yet.</p>
        ) : (
          stores.map(([store, products]) => {
            const expanded = expandedStore === store;
            const preset = isPresetStore(store);
            const sourceUrl = products[0]?.listing_url || "";

            return (
              <section key={store} className="store-panel">
                <div className="store-header">
                  <button
                    type="button"
                    className="store-row"
                    onClick={() => toggleStore(store, products)}
                  >
                    <div className="store-main">
                      <div className="store-title-line">
                        <strong>{store}</strong>
                        <span
                          className={preset ? "type-badge preset" : "type-badge"}
                        >
                          {preset ? "Preset" : "Custom"}
                        </span>
                      </div>

                      <span className="store-domain">
                        {getHostname(sourceUrl)}
                      </span>

                      <span className="product-count">
                        {products.length} {products.length === 1 ? "product" : "products"} monitored
                      </span>
                    </div>

                    <span className={`chevron ${expanded ? "open" : ""}`}>
                      ›
                    </span>
                  </button>

                  <button
                    type="button"
                    className="menu-button"
                    aria-label="Store settings"
                    onClick={() => toggleStoreSettings(store)}
                  >
                    •••
                  </button>
                </div>

                {storeSettings === store && (
                  <div className="store-settings-panel">
                    <label>
                      Store name
                      <input
                        value={renamedStore}
                        onChange={(event) => setRenamedStore(event.target.value)}
                      />
                    </label>

                    <label>
                      Admin password
                      <input
                        type="password"
                        value={adminSecret}
                        onChange={(event) => setAdminSecret(event.target.value)}
                      />
                    </label>

                    <div className="editor-actions">
                      <button
                        type="button"
                        className="tool-button"
                        disabled={saving}
                        onClick={() => saveStoreName(store)}
                      >
                        Rename store
                      </button>

                      <button
                        type="button"
                        className="tool-button danger"
                        disabled={saving}
                        onClick={() => removeWholeStore(store)}
                      >
                        Remove store
                      </button>
                    </div>
                  </div>
                )}

                {expanded && (
                  <div className="store-content">
                    <div className="store-content-toolbar">
                      <span>Products</span>

                      <button
                        type="button"
                        className="tool-button compact"
                        onClick={() => startAddProduct(store, products)}
                      >
                        + Add product
                      </button>
                    </div>

                    {addingProductTo === store && (
                      <form className="inline-editor" onSubmit={addProduct}>
                        <div className="editor-heading">
                          <strong>Add product</strong>
                          <span>
                            Using {getHostname(inheritedProductUrl)} as the source.
                          </span>
                        </div>

                        <label>
                          Product name
                          <input
                            value={addProductName}
                            onChange={(event) => setAddProductName(event.target.value)}
                            placeholder="30th Anniversary UPC"
                            required
                          />
                        </label>

                        <label className="checkbox-row">
                          <input
                            type="checkbox"
                            checked={useDifferentUrl}
                            onChange={(event) => setUseDifferentUrl(event.target.checked)}
                          />
                          <span>Use a different URL for this product</span>
                        </label>

                        {useDifferentUrl && (
                          <label>
                            Product URL
                            <input
                              type="url"
                              value={differentProductUrl}
                              onChange={(event) => setDifferentProductUrl(event.target.value)}
                              required
                            />
                          </label>
                        )}

                        <label>
                          Admin password
                          <input
                            type="password"
                            value={adminSecret}
                            onChange={(event) => setAdminSecret(event.target.value)}
                            required
                          />
                        </label>

                        <div className="editor-actions">
                          <button
                            type="submit"
                            className="tool-button strong"
                            disabled={saving}
                          >
                            {saving ? "Adding..." : "Add product"}
                          </button>

                          <button
                            type="button"
                            className="tool-button"
                            onClick={cancelAddProduct}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    <div className="store-products">
                      {products.map((monitor) => {
                        const result = statuses[monitor.id];
                        const status = result?.product;
                        const isChecking = checking[monitor.id];
                        const statusError = statusErrors[monitor.id];
                        const editing = editingProduct === monitor.id;

                        /*
                         * IMPORTANT:
                         * Once the scanner resolves the exact product page,
                         * Open should use that URL instead of the original
                         * category/search URL stored on the monitor.
                         */
                        const openUrl = status?.url || monitor.listing_url;

                        return (
                          <article className="product-card" key={monitor.id}>
                            <div className="product-card-header">
                              <div className="product-title-area">
                                <strong>{monitor.product_name || "Product"}</strong>

                                {status && (
                                  <span className={`status-badge ${status.state}`}>
                                    {STATE_LABELS[status.state]}
                                  </span>
                                )}
                              </div>

                              <div className="product-tools">
                                <button
                                  type="button"
                                  className="tool-button compact"
                                  disabled={isChecking}
                                  onClick={() => checkMonitor(monitor)}
                                >
                                  {isChecking ? "Checking..." : "Refresh"}
                                </button>

                                <a
                                  className="tool-button compact"
                                  href={openUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Open
                                </a>

                                <button
                                  type="button"
                                  className="tool-button compact"
                                  onClick={() => startEditProduct(monitor)}
                                >
                                  Edit
                                </button>
                              </div>
                            </div>

                            {isChecking && !status ? (
                              <p className="checking-text">Checking store...</p>
                            ) : status ? (
                              <div className="status-summary">
                                {status.statusText && <span>{status.statusText}</span>}
                                {status.price && <span>{status.price}</span>}
                                {status.stockText && status.stockText !== status.statusText && (
                                  <span>{status.stockText}</span>
                                )}
                                {status.ean && <span>EAN {status.ean}</span>}
                                {result && (
                                  <span>
                                    Checked{" "}
                                    {new Date(result.checkedAt).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                )}
                              </div>
                            ) : statusError ? (
                              <p className="status-error">
                                Check failed: {statusError}
                              </p>
                            ) : (
                              <p className="checking-text">Status not checked yet.</p>
                            )}

                            {editing && (
                              <div className="product-editor">
                                <label>
                                  Product name
                                  <input
                                    value={editProductName}
                                    onChange={(event) => setEditProductName(event.target.value)}
                                  />
                                </label>

                                <label>
                                  Source URL
                                  <input
                                    type="url"
                                    value={editProductUrl}
                                    onChange={(event) => setEditProductUrl(event.target.value)}
                                  />
                                </label>

                                <label>
                                  Admin password
                                  <input
                                    type="password"
                                    value={adminSecret}
                                    onChange={(event) => setAdminSecret(event.target.value)}
                                  />
                                </label>

                                <div className="editor-actions">
                                  <button
                                    type="button"
                                    className="tool-button strong"
                                    disabled={saving}
                                    onClick={() => saveProduct(monitor)}
                                  >
                                    Save changes
                                  </button>

                                  <button
                                    type="button"
                                    className="tool-button"
                                    onClick={cancelEditProduct}
                                  >
                                    Cancel
                                  </button>

                                  <button
                                    type="button"
                                    className="tool-button danger"
                                    disabled={saving}
                                    onClick={() => removeProduct(monitor)}
                                  >
                                    Remove product
                                  </button>
                                </div>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
    </section>
  );
}
