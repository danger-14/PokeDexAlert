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
  store: string;
  title: string;
  url: string;
  price?: string;
  sku?: string;
  stockText?: string;

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

const STATE_LABELS: Record<
  ProductStatus["state"],
  string
> = {
  in_stock: "In stock",
  preorder: "Preorder",
  coming_soon: "Coming soon",
  fully_booked: "Fully booked",
  out_of_stock: "Out of stock",
  watch_only: "Unavailable",
  unknown: "Unknown",
};

function isPresetStore(name: string) {
  return (
    name
      .toLowerCase()
      .includes("k-citymarket") &&
    name
      .toLowerCase()
      .includes("jumbo")
  );
}

export default function StoreManager() {
  const [monitors, setMonitors] =
    useState<Monitor[]>([]);

  const [expandedStore, setExpandedStore] =
    useState<string | null>(null);

  const [statuses, setStatuses] =
    useState<
      Record<string, StatusResult>
    >({});

  const [checking, setChecking] =
    useState<Record<string, boolean>>(
      {},
    );

  const [showAdd, setShowAdd] =
    useState(false);

  const [storeName, setStoreName] =
    useState("");

  const [productName, setProductName] =
    useState("");

  const [productUrl, setProductUrl] =
    useState("");

  const [adminSecret, setAdminSecret] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const loadStores =
    useCallback(async () => {
      try {
        const response =
          await fetch("/api/stores", {
            cache: "no-store",
          });

        const data =
          await response.json();

        if (
          !response.ok ||
          !data.ok
        ) {
          throw new Error(
            data.error ||
              "Could not load monitors.",
          );
        }

        setMonitors(data.stores);
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

  const stores = useMemo(() => {
    const grouped =
      new Map<string, Monitor[]>();

    for (const monitor of monitors) {
      const key =
        monitor.name.trim();

      const existing =
        grouped.get(key) || [];

      existing.push(monitor);

      grouped.set(key, existing);
    }

    return [...grouped.entries()];
  }, [monitors]);

  async function checkMonitor(
    monitor: Monitor,
  ) {
    setChecking((current) => ({
      ...current,
      [monitor.id]: true,
    }));

    try {
      const response = await fetch(
        `/api/stores/status?id=${encodeURIComponent(
          monitor.id,
        )}`,
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
            "Status check failed.",
        );
      }

      setStatuses((current) => ({
        ...current,
        [monitor.id]: {
          product: data.product,
          checkedAt:
            data.checkedAt,
        },
      }));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(error),
      );
    } finally {
      setChecking((current) => ({
        ...current,
        [monitor.id]: false,
      }));
    }
  }

  async function toggleStore(
    store: string,
    products: Monitor[],
  ) {
    if (expandedStore === store) {
      setExpandedStore(null);
      return;
    }

    setExpandedStore(store);

    await Promise.all(
      products.map((monitor) =>
        checkMonitor(monitor),
      ),
    );
  }

  function useJumboPreset() {
    setStoreName(
      "K-Citymarket Jumbo",
    );

    setShowAdd(true);
  }

  async function addMonitor(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(true);
    setMessage("");

    try {
      const response =
        await fetch("/api/stores", {
          method: "POST",

          headers: {
            "content-type":
              "application/json",

            "x-admin-secret":
              adminSecret,
          },

          body: JSON.stringify({
            name: storeName,
            productName,
            productUrl,
          }),
        });

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.ok
      ) {
        throw new Error(
          data.error ||
            "Could not add monitor.",
        );
      }

      setStoreName("");
      setProductName("");
      setProductUrl("");
      setShowAdd(false);

      setMessage(
        "Monitor added.",
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

  async function removeMonitor(
    monitor: Monitor,
  ) {
    const confirmed =
      window.confirm(
        `Remove ${monitor.product_name}?`,
      );

    if (!confirmed) return;

    try {
      const response =
        await fetch("/api/stores", {
          method: "DELETE",

          headers: {
            "content-type":
              "application/json",

            "x-admin-secret":
              adminSecret,
          },

          body: JSON.stringify({
            id: monitor.id,
          }),
        });

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
    <section className="monitor-dashboard">
      <div className="dashboard-toolbar">
        <div>
          <h2>Monitored stores</h2>

          <p>
            {stores.length}{" "}
            {stores.length === 1
              ? "store"
              : "stores"}
          </p>
        </div>

        <button
          className="add-monitor-button"
          type="button"
          onClick={() =>
            setShowAdd(
              (current) => !current,
            )
          }
        >
          {showAdd
            ? "Close"
            : "+ Add monitor"}
        </button>
      </div>

      {showAdd && (
        <div className="add-monitor-panel">
          <div className="preset-line">
            <span>Preset</span>

            <button
              type="button"
              onClick={
                useJumboPreset
              }
            >
              K-Citymarket Jumbo
            </button>
          </div>

          <form
            className="monitor-form"
            onSubmit={
              addMonitor
            }
          >
            <label>
              Store
              <input
                value={storeName}
                onChange={(event) =>
                  setStoreName(
                    event.target.value,
                  )
                }
                placeholder="MaxGaming"
                required
              />
            </label>

            <label>
              Product
              <input
                value={productName}
                onChange={(event) =>
                  setProductName(
                    event.target.value,
                  )
                }
                placeholder="30th Anniversary ETB"
                required
              />
            </label>

            <label className="wide">
              Product URL
              <input
                type="url"
                value={productUrl}
                onChange={(event) =>
                  setProductUrl(
                    event.target.value,
                  )
                }
                placeholder="https://..."
                required
              />
            </label>

            <label className="wide">
              Admin password
              <input
                type="password"
                value={adminSecret}
                onChange={(event) =>
                  setAdminSecret(
                    event.target.value,
                  )
                }
                required
              />
            </label>

            <button
              className="save-monitor-button"
              disabled={saving}
            >
              {saving
                ? "Adding..."
                : "Start monitoring"}
            </button>
          </form>
        </div>
      )}

      {message && (
        <p className="dashboard-message">
          {message}
        </p>
      )}

      <div className="stores-list">
        {loading ? (
          <p className="empty-state">
            Loading stores...
          </p>
        ) : stores.length === 0 ? (
          <p className="empty-state">
            No stores are being
            monitored yet.
          </p>
        ) : (
          stores.map(
            ([store, products]) => {
              const expanded =
                expandedStore ===
                store;

              const preset =
                isPresetStore(
                  store,
                );

              return (
                <div
                  key={store}
                  className="store-panel"
                >
                  <button
                    type="button"
                    className="store-row"
                    onClick={() =>
                      toggleStore(
                        store,
                        products,
                      )
                    }
                  >
                    <div className="store-main">
                      <div className="store-title-line">
                        <strong>
                          {store}
                        </strong>

                        <span
                          className={
                            preset
                              ? "type-badge preset"
                              : "type-badge"
                          }
                        >
                          {preset
                            ? "Preset"
                            : "Custom"}
                        </span>
                      </div>

                      <span className="product-count">
                        {
                          products.length
                        }{" "}
                        {products.length ===
                        1
                          ? "product"
                          : "products"}{" "}
                        monitored
                      </span>
                    </div>

                    <span
                      className={`chevron ${
                        expanded
                          ? "open"
                          : ""
                      }`}
                    >
                      ›
                    </span>
                  </button>

                  {expanded && (
                    <div className="store-products">
                      {products.map(
                        (monitor) => {
                          const result =
                            statuses[
                              monitor.id
                            ];

                          const status =
                            result
                              ?.product;

                          const isChecking =
                            checking[
                              monitor.id
                            ];

                          return (
                            <div
                              className="product-status-card"
                              key={
                                monitor.id
                              }
                            >
                              <div className="product-status-header">
                                <div>
                                  <strong>
                                    {monitor.product_name ||
                                      "Product"}
                                  </strong>

                                  {status && (
                                    <span
                                      className={`status-badge ${status.state}`}
                                    >
                                      {
                                        STATE_LABELS[
                                          status
                                            .state
                                        ]
                                      }
                                    </span>
                                  )}
                                </div>

                                <button
                                  className="refresh-status"
                                  type="button"
                                  onClick={() =>
                                    checkMonitor(
                                      monitor,
                                    )
                                  }
                                  disabled={
                                    isChecking
                                  }
                                >
                                  {isChecking
                                    ? "Checking..."
                                    : "Refresh"}
                                </button>
                              </div>

                              {isChecking &&
                              !status ? (
                                <p className="checking-text">
                                  Checking
                                  store...
                                </p>
                              ) : status ? (
                                <div className="status-details">
                                  {status.stockText && (
                                    <div>
                                      <span>
                                        Store
                                        stock
                                      </span>

                                      <strong>
                                        {
                                          status.stockText
                                        }
                                      </strong>
                                    </div>
                                  )}

                                  {status.price && (
                                    <div>
                                      <span>
                                        Price
                                      </span>

                                      <strong>
                                        {
                                          status.price
                                        }
                                      </strong>
                                    </div>
                                  )}

                                  {status.sku && (
                                    <div>
                                      <span>
                                        SKU
                                      </span>

                                      <strong>
                                        {
                                          status.sku
                                        }
                                      </strong>
                                    </div>
                                  )}

                                  <div>
                                    <span>
                                      Last
                                      checked
                                    </span>

                                    <strong>
                                      {new Date(
                                        result.checkedAt,
                                      ).toLocaleTimeString(
                                        [],
                                        {
                                          hour: "2-digit",
                                          minute:
                                            "2-digit",
                                        },
                                      )}
                                    </strong>
                                  </div>

                                  <div className="status-actions">
                                    <a
                                      href={
                                        status.url
                                      }
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      Open
                                      product
                                    </a>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeMonitor(
                                          monitor,
                                        )
                                      }
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="checking-text">
                                  Status
                                  unavailable.
                                </p>
                              )}
                            </div>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              );
            },
          )
        )}
      </div>
    </section>
  );
}
