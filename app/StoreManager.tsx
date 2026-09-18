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

  product_name:
    | string
    | null;

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
  product:
    ProductStatus;

  checkedAt:
    string;
};

const STATE_LABELS: Record<
  ProductStatus["state"],
  string
> = {
  in_stock:
    "In stock",

  preorder:
    "Preorder",

  coming_soon:
    "Coming soon",

  fully_booked:
    "Fully booked",

  out_of_stock:
    "Out of stock",

  watch_only:
    "Unavailable",

  unknown:
    "Unknown",
};

function isPresetStore(
  name: string,
) {
  const normalized =
    name.toLowerCase();

  return (
    normalized.includes(
      "k-citymarket",
    ) &&
    normalized.includes(
      "jumbo",
    )
  );
}

export default function StoreManager() {
  const [
    monitors,
    setMonitors,
  ] =
    useState<
      Monitor[]
    >([]);

  const [
    expandedStore,
    setExpandedStore,
  ] =
    useState<
      string | null
    >(null);

  const [
    statuses,
    setStatuses,
  ] =
    useState<
      Record<
        string,
        StatusResult
      >
    >({});

  const [
    checking,
    setChecking,
  ] =
    useState<
      Record<
        string,
        boolean
      >
    >({});

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false,
    );

  const [
    message,
    setMessage,
  ] =
    useState(
      "",
    );

  /*
   * Add product/store panel
   */

  const [
    showAdd,
    setShowAdd,
  ] =
    useState(
      false,
    );

  const [
    addProductStore,
    setAddProductStore,
  ] =
    useState<
      string | null
    >(null);

  const [
    storeName,
    setStoreName,
  ] =
    useState(
      "",
    );

  const [
    productName,
    setProductName,
  ] =
    useState(
      "",
    );

  const [
    productUrl,
    setProductUrl,
  ] =
    useState(
      "",
    );

  /*
   * Editing store
   */

  const [
    editingStore,
    setEditingStore,
  ] =
    useState<
      string | null
    >(null);

  const [
    editedStoreName,
    setEditedStoreName,
  ] =
    useState(
      "",
    );

  /*
   * Admin secret is only needed
   * when changing configuration.
   */

  const [
    adminSecret,
    setAdminSecret,
  ] =
    useState(
      "",
    );

  /* ====================================================
     Load monitors
     ==================================================== */

  const loadStores =
    useCallback(
      async () => {
        try {
          const response =
            await fetch(
              "/api/stores",
              {
                cache:
                  "no-store",
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
                "Could not load monitored stores.",
            );
          }

          setMonitors(
            data.stores,
          );
        } catch (
          error
        ) {
          setMessage(
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      void loadStores();
    },
    [
      loadStores,
    ],
  );

  /* ====================================================
     Group product rows by store
     ==================================================== */

  const stores =
    useMemo(
      () => {
        const grouped =
          new Map<
            string,
            Monitor[]
          >();

        for (
          const monitor of monitors
        ) {
          const store =
            monitor.name.trim();

          const current =
            grouped.get(
              store,
            ) || [];

          current.push(
            monitor,
          );

          grouped.set(
            store,
            current,
          );
        }

        return [
          ...grouped.entries(),
        ];
      },
      [
        monitors,
      ],
    );

  /* ====================================================
     Live status
     ==================================================== */

  async function checkMonitor(
    monitor: Monitor,
  ) {
    setChecking(
      (
        current,
      ) => ({
        ...current,

        [monitor.id]:
          true,
      }),
    );

    try {
      const response =
        await fetch(
          `/api/stores/status?id=${encodeURIComponent(
            monitor.id,
          )}`,
          {
            cache:
              "no-store",
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

      setStatuses(
        (
          current,
        ) => ({
          ...current,

          [monitor.id]:
            {
              product:
                data.product,

              checkedAt:
                data.checkedAt,
            },
        }),
      );
    } catch (
      error
    ) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );
    } finally {
      setChecking(
        (
          current,
        ) => ({
          ...current,

          [monitor.id]:
            false,
        }),
      );
    }
  }

  async function toggleStore(
    store: string,
    products: Monitor[],
  ) {
    if (
      expandedStore ===
      store
    ) {
      setExpandedStore(
        null,
      );

      return;
    }

    setExpandedStore(
      store,
    );

    /*
     * Clicking a store performs
     * fresh live checks.
     */

    await Promise.all(
      products.map(
        (product) =>
          checkMonitor(
            product,
          ),
      ),
    );
  }

  /* ====================================================
     Open add store
     ==================================================== */

  function openNewStore() {
    setAddProductStore(
      null,
    );

    setStoreName(
      "",
    );

    setProductName(
      "",
    );

    setProductUrl(
      "",
    );

    setShowAdd(
      true,
    );
  }

  /* ====================================================
     Add product to existing store
     ==================================================== */

  function openAddProduct(
    store: string,
  ) {
    setAddProductStore(
      store,
    );

    setStoreName(
      store,
    );

    setProductName(
      "",
    );

    setProductUrl(
      "",
    );

    setShowAdd(
      true,
    );
  }

  function closeAddPanel() {
    setShowAdd(
      false,
    );

    setAddProductStore(
      null,
    );

    setStoreName(
      "",
    );

    setProductName(
      "",
    );

    setProductUrl(
      "",
    );
  }

  /* ====================================================
     Jumbo preset
     ==================================================== */

  function useJumboPreset() {
    setStoreName(
      "K-Citymarket Jumbo",
    );

    setAddProductStore(
      "K-Citymarket Jumbo",
    );

    setShowAdd(
      true,
    );
  }

  /* ====================================================
     Save product
     ==================================================== */

  async function addMonitor(
    event: FormEvent,
  ) {
    event.preventDefault();

    setSaving(
      true,
    );

    setMessage(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/stores",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json",

              "x-admin-secret":
                adminSecret,
            },

            body:
              JSON.stringify({
                name:
                  storeName,

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
            "Could not add product.",
        );
      }

      const addedStore =
        storeName;

      closeAddPanel();

      setMessage(
        `${productName} added to ${addedStore}.`,
      );

      await loadStores();

      setExpandedStore(
        addedStore,
      );
    } catch (
      error
    ) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  /* ====================================================
     Edit store
     ==================================================== */

  function openEditStore(
    store: string,
  ) {
    setEditingStore(
      store,
    );

    setEditedStoreName(
      store,
    );

    setExpandedStore(
      store,
    );
  }

  async function saveStoreName() {
    if (
      !editingStore
    ) {
      return;
    }

    setSaving(
      true,
    );

    setMessage(
      "",
    );

    try {
      const response =
        await fetch(
          "/api/stores",
          {
            method:
              "PATCH",

            headers: {
              "content-type":
                "application/json",

              "x-admin-secret":
                adminSecret,
            },

            body:
              JSON.stringify({
                oldName:
                  editingStore,

                newName:
                  editedStoreName,
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
            "Could not update store.",
        );
      }

      const newName =
        editedStoreName;

      setEditingStore(
        null,
      );

      setEditedStoreName(
        "",
      );

      setExpandedStore(
        newName,
      );

      setMessage(
        "Store updated.",
      );

      await loadStores();
    } catch (
      error
    ) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );
    } finally {
      setSaving(
        false,
      );
    }
  }

  /* ====================================================
     Remove one product
     ==================================================== */

  async function removeMonitor(
    monitor: Monitor,
  ) {
    const confirmed =
      window.confirm(
        `Stop monitoring ${
          monitor.product_name ||
          "this product"
        }?`,
      );

    if (
      !confirmed
    ) {
      return;
    }

    if (
      !adminSecret
    ) {
      setMessage(
        "Enter your admin password in Add monitor or Edit store before removing a product.",
      );

      return;
    }

    try {
      const response =
        await fetch(
          "/api/stores",
          {
            method:
              "DELETE",

            headers: {
              "content-type":
                "application/json",

              "x-admin-secret":
                adminSecret,
            },

            body:
              JSON.stringify({
                id:
                  monitor.id,
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
            "Could not remove product.",
        );
      }

      setStatuses(
        (
          current,
        ) => {
          const next = {
            ...current,
          };

          delete next[
            monitor.id
          ];

          return next;
        },
      );

      setMessage(
        "Product removed.",
      );

      await loadStores();
    } catch (
      error
    ) {
      setMessage(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );
    }
  }

  /* ====================================================
     UI
     ==================================================== */

  return (
    <section className="monitor-dashboard">
      <div className="dashboard-toolbar">
        <div>
          <h2>
            Monitored stores
          </h2>

          <p>
            {
              stores.length
            }{" "}
            {
              stores.length ===
              1
                ? "store"
                : "stores"
            }
          </p>
        </div>

        <button
          className="add-monitor-button"
          type="button"
          onClick={
            showAdd
              ? closeAddPanel
              : openNewStore
          }
        >
          {showAdd
            ? "Close"
            : "+ Add store"}
        </button>
      </div>

      {/* ADD STORE / PRODUCT */}

      {showAdd && (
        <div className="add-monitor-panel">
          <div className="add-panel-header">
            <div>
              <strong>
                {addProductStore
                  ? `Add product to ${addProductStore}`
                  : "Add store"}
              </strong>

              <span>
                {addProductStore
                  ? "Add another product to this store."
                  : "Add a store and its first product."}
              </span>
            </div>
          </div>

          {!addProductStore && (
            <div className="preset-line">
              <span>
                Preset
              </span>

              <button
                type="button"
                onClick={
                  useJumboPreset
                }
              >
                K-Citymarket Jumbo
              </button>
            </div>
          )}

          <form
            className="monitor-form"
            onSubmit={
              addMonitor
            }
          >
            <label>
              Store

              <input
                value={
                  storeName
                }
                onChange={(
                  event,
                ) =>
                  setStoreName(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="MaxGaming"
                required
                readOnly={
                  Boolean(
                    addProductStore,
                  )
                }
              />
            </label>

            <label>
              Product

              <input
                value={
                  productName
                }
                onChange={(
                  event,
                ) =>
                  setProductName(
                    event
                      .target
                      .value,
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
                value={
                  productUrl
                }
                onChange={(
                  event,
                ) =>
                  setProductUrl(
                    event
                      .target
                      .value,
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
                value={
                  adminSecret
                }
                onChange={(
                  event,
                ) =>
                  setAdminSecret(
                    event
                      .target
                      .value,
                  )
                }
                placeholder="ADMIN_SECRET"
                required
              />
            </label>

            <button
              className="save-monitor-button"
              disabled={
                saving
              }
            >
              {saving
                ? "Saving..."
                : addProductStore
                  ? "Add product"
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

      {/* STORE LIST */}

      <div className="stores-list">
        {loading ? (
          <p className="empty-state">
            Loading stores...
          </p>
        ) : stores.length ===
          0 ? (
          <p className="empty-state">
            No stores are being
            monitored yet.
          </p>
        ) : (
          stores.map(
            ([
              store,
              products,
            ]) => {
              const expanded =
                expandedStore ===
                store;

              const preset =
                isPresetStore(
                  store,
                );

              return (
                <div
                  key={
                    store
                  }
                  className="store-panel"
                >
                  <div className="store-header">
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

                    <div className="store-header-actions">
                      <button
                        type="button"
                        onClick={() =>
                          openAddProduct(
                            store,
                          )
                        }
                        title="Add product"
                      >
                        + Product
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openEditStore(
                            store,
                          )
                        }
                        title="Edit store"
                      >
                        Edit
                      </button>
                    </div>
                  </div>

                  {/* EDIT STORE */}

                  {editingStore ===
                    store && (
                    <div className="edit-store-panel">
                      <label>
                        Store name

                        <input
                          value={
                            editedStoreName
                          }
                          onChange={(
                            event,
                          ) =>
                            setEditedStoreName(
                              event
                                .target
                                .value,
                            )
                          }
                        />
                      </label>

                      <label>
                        Admin password

                        <input
                          type="password"
                          value={
                            adminSecret
                          }
                          onChange={(
                            event,
                          ) =>
                            setAdminSecret(
                              event
                                .target
                                .value,
                            )
                          }
                          placeholder="ADMIN_SECRET"
                        />
                      </label>

                      <div className="edit-store-actions">
                        <button
                          type="button"
                          onClick={
                            saveStoreName
                          }
                          disabled={
                            saving
                          }
                        >
                          {saving
                            ? "Saving..."
                            : "Save"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setEditingStore(
                              null,
                            )
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* PRODUCTS */}

                  {expanded && (
                    <div className="store-products">
                      {products.map(
                        (
                          monitor,
                        ) => {
                          const result =
                            statuses[
                              monitor
                                .id
                            ];

                          const status =
                            result
                              ?.product;

                          const isChecking =
                            checking[
                              monitor
                                .id
                            ];

                          return (
                            <article
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
                                  disabled={
                                    isChecking
                                  }
                                  onClick={() =>
                                    checkMonitor(
                                      monitor,
                                    )
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
                                  {status.statusText && (
                                    <div>
                                      <span>
                                        Store
                                        status
                                      </span>

                                      <strong>
                                        {
                                          status.statusText
                                        }
                                      </strong>
                                    </div>
                                  )}

                                  {status.stockText && (
                                    <div>
                                      <span>
                                        Stock
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
                                          hour:
                                            "2-digit",

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
                            </article>
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
