const tg = window.Telegram?.WebApp;

let products = [];
let categories = [];
let currentProduct = null;
let currentOrder = null;
let currentUser = null;
let orders = [];
let storeConfig = null;

let selectedCategory = null;
let selectedVariant = null;

let selectedOptions = {
  color: null,
  memory: null,
  sim: null,
  region: null
};

let appliedPromoCode = "";

const ACTIVE_PROMO_CODES = [
  "конор",
  "ютуб"
];

/* =========================================================
   PROMOCODES
========================================================= */

function normalizePromoCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isPromoCodeActive(value) {
  return ACTIVE_PROMO_CODES.includes(
    normalizePromoCode(value)
  );
}

function getPromoCodeDisplay(value) {
  return String(value || "").trim();
}

/* =========================================================
   STATUS
========================================================= */

const STATUS_INFO = {
  new: {
    text: "Новый",
    className: "status-new"
  },

  confirmed: {
    text: "Подтверждён",
    className: "status-confirmed"
  },

  processing: {
    text: "В обработке",
    className: "status-processing"
  },

  ready: {
    text: "Готов к выдаче",
    className: "status-ready"
  },

  completed: {
    text: "Завершён",
    className: "status-completed"
  },

  cancelled: {
    text: "Отменён",
    className: "status-cancelled"
  },

  rejected: {
    text: "Отменён",
    className: "status-cancelled"
  }
};

const RESERVATION_INFO = {
  not_required: {
    text: "Не требуется",
    className: "reservation-none"
  },

  pending_payment: {
    text: "Ожидает оплаты",
    className: "reservation-payment"
  },

  pending: {
    text: "Ожидает оплаты",
    className: "reservation-payment"
  },

  awaiting_confirmation: {
    text: "Ожидает проверки",
    className: "reservation-check"
  },

  confirmed: {
    text: "Залог подтверждён",
    className: "reservation-confirmed"
  },

  rejected: {
    text: "Залог отклонён",
    className: "reservation-rejected"
  }
};

/* =========================================================
   TELEGRAM
========================================================= */

function initTelegram() {
  try {
    if (!tg) return;

    tg.ready();
    tg.expand();

    tg.setHeaderColor?.("#050505");
    tg.setBackgroundColor?.("#050505");
  } catch (error) {
    console.error("Telegram:", error);
  }
}

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 12000);

  try {
    const headers = {
      ...(options.body instanceof FormData
        ? {}
        : {
            "Content-Type": "application/json"
          }),
      ...(options.headers || {})
    };

    const initData = tg?.initData || "";

    if (initData) {
      headers["x-telegram-init-data"] = initData;
    }

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        `HTTP ${response.status}`
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function unwrap(data, key) {
  if (!data) return [];

  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data[key])) {
    return data[key];
  }

  if (Array.isArray(data.items)) {
    return data.items;
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0 ₽";
  }

  return `${number.toLocaleString("ru-RU")} ₽`;
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getProductImage(product) {
  return (
    product?.image_url ||
    product?.image ||
    product?.cover ||
    ""
  );
}

function getProductPrice(product) {
  const value =
    product?.price ??
    product?.base_price ??
    product?.current_price ??
    0;

  return Number(value) || 0;
}

function getVariantId(variant) {
  return (
    variant?.id ??
    variant?.variant_id ??
    ""
  );
}

function getVariantName(variant) {
  if (!variant) return "";

  const parts = [
    variant.color
      ? `Цвет: ${variant.color}`
      : "",

    variant.memory
      ? `Память: ${variant.memory}`
      : "",

    variant.sim_type
      ? `SIM: ${variant.sim_type}`
      : "",

    variant.region
      ? `Регион: ${variant.region}`
      : ""
  ].filter(Boolean);

  if (parts.length) {
    return parts.join(" • ");
  }

  return (
    variant.name ||
    variant.title ||
    variant.variant_text ||
    ""
  );
}

function getVariantPrice(variant, product) {
  if (
    variant?.price !== undefined &&
    variant?.price !== null &&
    variant?.price !== ""
  ) {
    return Number(variant.price) || 0;
  }

  return getProductPrice(product);
}

function getReservationAmount() {
  const amount =
    Number(
      storeConfig?.reservation_amount ??
      storeConfig?.reservation?.amount ??
      storeConfig?.reservation_card?.amount ??
      0
    );

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function getReservationText() {
  return String(
    storeConfig?.reservation_text ??
    storeConfig?.reservation?.text ??
    ""
  ).trim();
}

function getReservationCardText() {
  const card =
    storeConfig?.reservation_card ||
    storeConfig?.reservation?.card ||
    null;

  if (!card) {
    return "";
  }

  return String(
    card.card_number ||
    card.number ||
    card.requisites ||
    card.details ||
    card.text ||
    ""
  ).trim();
}

function getPickupText() {
  return String(
    storeConfig?.pickup_text ||
    ""
  ).trim();
}

function getDeliveryText() {
  return String(
    storeConfig?.delivery_text ||
    ""
  ).trim();
}

/* =========================================================
   PRODUCT OPTIONS
========================================================= */

function normalizeProductOption(option) {
  if (typeof option === "string") {
    return {
      name: option.trim(),
      surcharge: 0
    };
  }

  if (!option || typeof option !== "object") {
    return null;
  }

  const name =
    option.name ??
    option.title ??
    option.value ??
    option.label ??
    "";

  if (!String(name).trim()) {
    return null;
  }

  const surcharge = Number(
    option.surcharge ??
    option.extra ??
    option.extra_price ??
    option.extraPrice ??
    option.price_add ??
    0
  );

  return {
    name: String(name).trim(),
    surcharge: Number.isFinite(surcharge)
      ? surcharge
      : 0
  };
}

function getProductPriceOptions(product) {
  const source =
    product?.price_options ??
    product?.priceOptions ??
    {};

  return {
    colors: Array.isArray(source.colors)
      ? source.colors
          .map(normalizeProductOption)
          .filter(Boolean)
      : [],

    memories: Array.isArray(source.memories)
      ? source.memories
          .map(normalizeProductOption)
          .filter(Boolean)
      : [],

    sims: Array.isArray(source.sims)
      ? source.sims
          .map(normalizeProductOption)
          .filter(Boolean)
      : [],

    regions: Array.isArray(source.regions)
      ? source.regions
          .map(normalizeProductOption)
          .filter(Boolean)
      : []
  };
}

function hasPriceOptions(product) {
  const options =
    getProductPriceOptions(product);

  return Boolean(
    options.colors.length ||
    options.memories.length ||
    options.sims.length ||
    options.regions.length
  );
}

function getSelectedOptionsPrice(product) {
  let price = getProductPrice(product);

  const options =
    getProductPriceOptions(product);

  const groups = [
    ["color", options.colors],
    ["memory", options.memories],
    ["sim", options.sims],
    ["region", options.regions]
  ];

  groups.forEach(([key, list]) => {
    const selected =
      selectedOptions[key];

    if (!selected) return;

    const option = list.find(
      item =>
        String(item.name) ===
        String(selected)
    );

    if (option) {
      price +=
        Number(option.surcharge) || 0;
    }
  });

  return price;
}

function getSelectedOptionsText() {
  const parts = [];

  if (selectedOptions.color) {
    parts.push(
      `Цвет: ${selectedOptions.color}`
    );
  }

  if (selectedOptions.memory) {
    parts.push(
      `Память: ${selectedOptions.memory}`
    );
  }

  if (selectedOptions.sim) {
    parts.push(
      `SIM: ${selectedOptions.sim}`
    );
  }

  if (selectedOptions.region) {
    parts.push(
      `Регион: ${selectedOptions.region}`
    );
  }

  return parts.join(" • ");
}

function getSelectedOptionsPayload() {
  const result = {};

  if (selectedOptions.color) {
    result.color =
      selectedOptions.color;
  }

  if (selectedOptions.memory) {
    result.memory =
      selectedOptions.memory;
  }

  if (selectedOptions.sim) {
    result.sim =
      selectedOptions.sim;
  }

  if (selectedOptions.region) {
    result.region =
      selectedOptions.region;
  }

  return result;
}

function resetProductSelections() {
  selectedOptions = {
    color: null,
    memory: null,
    sim: null,
    region: null
  };

  selectedVariant = null;
}

/* =========================================================
   UI
========================================================= */

function showToast(message) {
  const toast =
    document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

function haptic(type = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred(type);
  } catch {}
}

function openTelegram(url) {
  try {
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
      return;
    }
  } catch {}

  window.open(
    url,
    "_blank",
    "noopener"
  );
}

/* =========================================================
   PAGES
========================================================= */

const PAGE_IDS = [
  "homePage",
  "catalogPage",
  "profilePage",
  "ordersPage",
  "productPage",
  "orderPage",
  "checkoutPage"
];

function hideAllPages() {
  PAGE_IDS.forEach(id => {
    document
      .getElementById(id)
      ?.classList.add("hidden");
  });
}

function showPage(name) {
  hideAllPages();

  const map = {
    home: "homePage",
    catalog: "catalogPage",
    profile: "profilePage",
    orders: "ordersPage",
    product: "productPage",
    order: "orderPage",
    checkout: "checkoutPage"
  };

  const page =
    document.getElementById(
      map[name]
    );

  if (!page) return;

  page.classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "instant"
  });
}

/* =========================================================
   DRAWER
========================================================= */

function openDrawer() {
  document
    .getElementById("drawerOverlay")
    ?.classList.remove("hidden");

  document
    .getElementById("catalogDrawer")
    ?.classList.add("open");

  haptic();
}

function closeDrawer() {
  document
    .getElementById("catalogDrawer")
    ?.classList.remove("open");

  setTimeout(() => {
    document
      .getElementById("drawerOverlay")
      ?.classList.add("hidden");
  }, 220);
}

function renderDrawerCategories() {
  const container =
    document.getElementById(
      "drawerCategories"
    );

  if (!container) return;

  if (!categories.length) {
    container.innerHTML = `
      <div class="drawer-empty">
        Категории пока не добавлены
      </div>
    `;

    return;
  }

  container.innerHTML =
    categories
      .map(category => {
        return `
          <button
            class="drawer-category"
            type="button"
            data-category-id="${escapeHtml(
              category.id
            )}"
          >
            <span>
              ${escapeHtml(
                category.name ||
                category.title ||
                "Категория"
              )}
            </span>

            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6"></path>
            </svg>
          </button>
        `;
      })
      .join("");

  container
    .querySelectorAll(
      ".drawer-category"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          selectedCategory =
            button.dataset.categoryId;

          closeDrawer();

          renderCatalogPage();
          showPage("catalog");

          haptic();
        }
      );
    });
}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {
  document
    .getElementById("menuButton")
    ?.addEventListener(
      "click",
      openDrawer
    );

  document
    .getElementById("drawerOverlay")
    ?.addEventListener(
      "click",
      closeDrawer
    );

  document
    .getElementById("closeDrawerButton")
    ?.addEventListener(
      "click",
      closeDrawer
    );

  document
    .querySelector(
      '[data-category-id="all"]'
    )
    ?.addEventListener(
      "click",
      () => {
        selectedCategory = null;

        closeDrawer();

        renderCatalogPage();
        showPage("catalog");

        haptic();
      }
    );

  document
    .getElementById("logoButton")
    ?.addEventListener(
      "click",
      () => {
        closeDrawer();
        showPage("home");
        haptic();
      }
    );

  document
    .getElementById("profileButton")
    ?.addEventListener(
      "click",
      () => {
        closeDrawer();

        renderProfile();
        showPage("profile");

        haptic();
      }
    );

  document
    .getElementById("cartButton")
    ?.addEventListener(
      "click",
      async () => {
        closeDrawer();

        await loadOrders();

        showPage("orders");

        haptic();
      }
    );

  document
    .getElementById("bannerCatalogButton")
    ?.addEventListener(
      "click",
      () => {
        selectedCategory = null;

        renderCatalogPage();
        showPage("catalog");

        haptic();
      }
    );

  document
    .getElementById("newAllButton")
    ?.addEventListener(
      "click",
      () => {
        selectedCategory = null;

        renderCatalogPage();
        showPage("catalog");

        haptic();
      }
    );

  document
    .getElementById("popularAllButton")
    ?.addEventListener(
      "click",
      () => {
        selectedCategory = null;

        renderCatalogPage();
        showPage("catalog");

        haptic();
      }
    );

  document
    .getElementById("drawerOrdersButton")
    ?.addEventListener(
      "click",
      async () => {
        closeDrawer();

        await loadOrders();

        showPage("orders");

        haptic();
      }
    );

  document
    .getElementById("drawerManagerButton")
    ?.addEventListener(
      "click",
      () => {
        closeDrawer();

        openContact(
          "Здравствуйте! Нужна помощь по IRoom."
        );
      }
    );

  document
    .getElementById("profileOrdersButton")
    ?.addEventListener(
      "click",
      async () => {
        await loadOrders();

        showPage("orders");
      }
    );

  document
    .getElementById(
      "emptyOrdersCatalogButton"
    )
    ?.addEventListener(
      "click",
      () => {
        selectedCategory = null;

        renderCatalogPage();
        showPage("catalog");
      }
    );

  document
    .getElementById("productBackButton")
    ?.addEventListener(
      "click",
      () => {
        showPage("catalog");
      }
    );

  document
    .getElementById("orderBackButton")
    ?.addEventListener(
      "click",
      async () => {
        await loadOrders();

        showPage("orders");
      }
    );

  document
    .getElementById(
      "checkoutBackButton"
    )
    ?.addEventListener(
      "click",
      () => {
        showPage("product");
      }
    );
}

/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {
  const button =
    document.getElementById(
      "searchButton"
    );

  const close =
    document.getElementById(
      "closeSearchButton"
    );

  const panel =
    document.getElementById(
      "searchPanel"
    );

  const input =
    document.getElementById(
      "searchInput"
    );

  if (!panel || !input) return;

  button?.addEventListener(
    "click",
    () => {
      panel.classList.remove(
        "hidden"
      );

      setTimeout(() => {
        input.focus();
      }, 80);

      haptic();
    }
  );

  close?.addEventListener(
    "click",
    () => {
      panel.classList.add(
        "hidden"
      );

      input.value = "";

      renderSearchResults("");
    }
  );

  input.addEventListener(
    "input",
    () => {
      renderSearchResults(
        input.value
      );
    }
  );
}

function renderSearchResults(query) {
  const container =
    document.getElementById(
      "searchResults"
    );

  if (!container) return;

  const text =
    String(query || "")
      .trim()
      .toLowerCase();

  if (!text) {
    container.innerHTML = `
      <div class="search-empty">
        Начните вводить название товара
      </div>
    `;

    return;
  }

  const result =
    products.filter(product => {
      const name =
        String(
          product.name || ""
        ).toLowerCase();

      const description =
        String(
          product.description || ""
        ).toLowerCase();

      return (
        name.includes(text) ||
        description.includes(text)
      );
    });

  if (!result.length) {
    container.innerHTML = `
      <div class="search-empty">
        Ничего не найдено
      </div>
    `;

    return;
  }

  container.innerHTML =
    result.map(productCard).join("");

  bindProductCards(container);
}

/* =========================================================
   PRODUCT CARDS
========================================================= */

function productCard(product) {
  const image =
    getProductImage(product);

  const price =
    getProductPrice(product);

  const oldPrice =
    product.old_price ||
    product.oldPrice ||
    null;

  return `
    <article
      class="product-card"
      data-product-id="${escapeHtml(
        product.id
      )}"
    >
      <div class="product-image-wrap">

        ${
          image
            ? `
              <img
                class="product-image"
                src="${escapeHtml(image)}"
                alt="${escapeHtml(
                  product.name || ""
                )}"
                loading="lazy"
              >
            `
            : `
              <div class="product-image-placeholder"></div>
            `
        }

        ${
          product.is_new ||
          product.new ||
          product.badge
            ? `
              <span class="product-badge">
                ${
                  typeof product.badge ===
                  "string"
                    ? escapeHtml(
                        product.badge
                      )
                    : "NEW"
                }
              </span>
            `
            : ""
        }

      </div>

      <div class="product-card-content">

        <h3>
          ${escapeHtml(
            product.name ||
            "Товар"
          )}
        </h3>

        <div>
          <span class="product-price">
            ${formatPrice(price)}
          </span>

          ${
            oldPrice
              ? `
                <span class="product-old-price">
                  ${formatPrice(
                    oldPrice
                  )}
                </span>
              `
              : ""
          }
        </div>

      </div>
    </article>
  `;
}

function bindProductCards(container) {
  container
    .querySelectorAll(
      ".product-card"
    )
    .forEach(card => {
      card.addEventListener(
        "click",
        () => {
          openProduct(
            card.dataset.productId
          );
        }
      );
    });
}

function renderNewProducts() {
  const container =
    document.getElementById(
      "newProducts"
    );

  if (!container) return;

  const result =
    products.filter(
      product =>
        product.is_new ||
        product.new ||
        product.badge
    );

  const source =
    result.length
      ? result
      : products.slice(0, 8);

  if (!source.length) {
    container.innerHTML = `
      <div class="products-empty">
        Новинок пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    source.map(productCard).join("");

  bindProductCards(container);
}

function renderPopularProducts() {
  const container =
    document.getElementById(
      "popularProducts"
    );

  if (!container) return;

  const source =
    [...products]
      .sort(
        (a, b) =>
          Number(
            b.sales ||
            b.orders_count ||
            0
          ) -
          Number(
            a.sales ||
            a.orders_count ||
            0
          )
      )
      .slice(0, 8);

  if (!source.length) {
    container.innerHTML = `
      <div class="products-empty">
        Популярных товаров пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    source.map(productCard).join("");

  bindProductCards(container);
}

/* =========================================================
   CATALOG
========================================================= */

function renderCatalogPage() {
  const categoriesContainer =
    document.getElementById(
      "catalogPageCategories"
    );

  const productsContainer =
    document.getElementById(
      "catalogPageProducts"
    );

  if (
    !categoriesContainer ||
    !productsContainer
  ) {
    return;
  }

  categoriesContainer.innerHTML = `
    <button
      class="category-filter ${
        selectedCategory === null
          ? "active"
          : ""
      }"
      data-category-id="all"
      type="button"
    >
      Все
    </button>

    ${categories
      .map(
        category => `
          <button
            class="category-filter ${
              String(
                selectedCategory
              ) ===
              String(category.id)
                ? "active"
                : ""
            }"
            data-category-id="${escapeHtml(
              category.id
            )}"
            type="button"
          >
            ${escapeHtml(
              category.name ||
              category.title ||
              "Категория"
            )}
          </button>
        `
      )
      .join("")}
  `;

  categoriesContainer
    .querySelectorAll(
      ".category-filter"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          selectedCategory =
            button.dataset
              .categoryId === "all"
              ? null
              : button.dataset
                  .categoryId;

          renderCatalogPage();

          haptic();
        }
      );
    });

  let list = [...products];

  if (selectedCategory !== null) {
    list = list.filter(product => {
      return (
        String(
          product.category_id ??
          product.categoryId ??
          ""
        ) ===
        String(selectedCategory)
      );
    });
  }

  if (!list.length) {
    productsContainer.innerHTML = `
      <div class="empty-state">
        <h3>
          Товаров пока нет
        </h3>

        <p>
          В этой категории пока нет товаров.
        </p>
      </div>
    `;

    return;
  }

  productsContainer.innerHTML =
    list.map(productCard).join("");

  bindProductCards(
    productsContainer
  );
}

/* =========================================================
   PRODUCT
========================================================= */

function findProduct(id) {
  return products.find(
    product =>
      String(product.id) ===
      String(id)
  );
}

async function openProduct(productId) {
  let product =
    findProduct(productId);

  try {
    const data =
      await api(
        `/api/products/${encodeURIComponent(
          productId
        )}`
      );

    product =
      data?.product ||
      product;
  } catch (error) {
    console.error(
      "openProduct:",
      error
    );
  }

  if (!product) {
    showToast(
      "Товар не найден"
    );

    return;
  }

  currentProduct = product;

  const variants =
    Array.isArray(
      product.variants
    )
      ? product.variants
      : [];

  resetProductSelections();

  if (
    !hasPriceOptions(product) &&
    variants.length
  ) {
    selectedVariant =
      variants[0] || null;
  }

  appliedPromoCode = "";

  renderProductDetails();

  showPage("product");

  haptic();
}

function renderOptionGroup(
  title,
  key,
  options
) {
  if (!options.length) {
    return "";
  }

  return `
    <div class="variants-block">

      <div class="variants-title">
        ${escapeHtml(title)}
      </div>

      <div class="variants-list">

        ${options
          .map(option => {
            const active =
              String(
                selectedOptions[key]
              ) ===
              String(option.name);

            return `
              <button
                class="variant-button ${
                  active
                    ? "active"
                    : ""
                }"
                type="button"
                data-option-group="${escapeHtml(
                  key
                )}"
                data-option-name="${escapeHtml(
                  option.name
                )}"
              >
                <span>
                  ${escapeHtml(
                    option.name
                  )}
                </span>

                ${
                  Number(
                    option.surcharge
                  )
                    ? `
                      <span>
                        +${formatPrice(
                          option.surcharge
                        )}
                      </span>
                    `
                    : ""
                }
              </button>
            `;
          })
          .join("")}

      </div>
    </div>
  `;
}

function renderProductDetails() {
  const container =
    document.getElementById(
      "productDetails"
    );

  if (
    !container ||
    !currentProduct
  ) {
    return;
  }

  const product =
    currentProduct;

  const image =
    getProductImage(product);

  const variants =
    Array.isArray(
      product.variants
    )
      ? product.variants
      : [];

  const priceOptions =
    getProductPriceOptions(
      product
    );

  const usePriceOptions =
    hasPriceOptions(product);

  const price =
    usePriceOptions
      ? getSelectedOptionsPrice(
          product
        )
      : selectedVariant
        ? getVariantPrice(
            selectedVariant,
            product
          )
        : getProductPrice(
            product
          );

  const selectedText =
    usePriceOptions
      ? getSelectedOptionsText()
      : selectedVariant
        ? getVariantName(
            selectedVariant
          )
        : "";

  let optionsHtml = "";

  if (usePriceOptions) {
    optionsHtml = `
      ${renderOptionGroup(
        "Цвет",
        "color",
        priceOptions.colors
      )}

      ${renderOptionGroup(
        "Память",
        "memory",
        priceOptions.memories
      )}

      ${renderOptionGroup(
        "SIM",
        "sim",
        priceOptions.sims
      )}

      ${renderOptionGroup(
        "Регион",
        "region",
        priceOptions.regions
      )}
    `;
  } else if (variants.length) {
    optionsHtml = `
      <div class="variants-block">

        <div class="variants-title">
          Комплектация
        </div>

        <div class="variants-list">

          ${variants
            .map(variant => {
              const active =
                String(
                  getVariantId(
                    variant
                  )
                ) ===
                String(
                  getVariantId(
                    selectedVariant
                  )
                );

              return `
                <button
                  class="variant-button ${
                    active
                      ? "active"
                      : ""
                  }"
                  type="button"
                  data-variant-id="${escapeHtml(
                    getVariantId(
                      variant
                    )
                  )}"
                >
                  <span>
                    ${escapeHtml(
                      getVariantName(
                        variant
                      )
                    )}
                  </span>

                  <span>
                    ${formatPrice(
                      getVariantPrice(
                        variant,
                        product
                      )
                    )}
                  </span>
                </button>
              `;
            })
            .join("")}

        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="product-detail-image-wrap">

      ${
        image
          ? `
            <img
              class="product-detail-image"
              src="${escapeHtml(image)}"
              alt="${escapeHtml(
                product.name || ""
              )}"
            >
          `
          : `
            <div class="product-detail-image-placeholder"></div>
          `
      }

    </div>

    <div class="product-detail-content">

      <div class="section-kicker">
        IRoom Store
      </div>

      <h1 class="product-detail-title">
        ${escapeHtml(
          product.name ||
          "Товар"
        )}
      </h1>

      <div class="product-detail-price">
        ${formatPrice(price)}
      </div>

      ${
        selectedText
          ? `
            <div class="product-detail-selected">
              ${escapeHtml(
                selectedText
              )}
            </div>
          `
          : ""
      }

      ${
        product.old_price
          ? `
            <div class="product-detail-old-price">
              ${formatPrice(
                product.old_price
              )}
            </div>
          `
          : ""
      }

      ${
        product.description
          ? `
            <div class="product-description">
              ${escapeHtml(
                product.description
              )}
            </div>
          `
          : ""
      }

      ${optionsHtml}

      <div class="product-actions">

        <button
          id="buyProductButton"
          class="primary-button"
          type="button"
        >
          Купить в один клик
        </button>

        <button
          id="addToCartButton"
          class="secondary-button"
          type="button"
        >
          Добавить в корзину
        </button>

      </div>

    </div>
  `;

  container
    .querySelectorAll(
      "[data-option-group]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const group =
            button.dataset
              .optionGroup;

          const name =
            button.dataset
              .optionName;

          if (
            !group ||
            !name
          ) {
            return;
          }

          selectedOptions[
            group
          ] = name;

          haptic("light");

          renderProductDetails();
        }
      );
    });

  container
    .querySelectorAll(
      "[data-variant-id]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const variant =
            variants.find(
              item =>
                String(
                  getVariantId(
                    item
                  )
                ) ===
                String(
                  button.dataset
                    .variantId
                )
            );

          if (!variant) {
            return;
          }

          selectedVariant =
            variant;

          renderProductDetails();

          haptic("light");
        }
      );
    });

  document
    .getElementById(
      "buyProductButton"
    )
    ?.addEventListener(
      "click",
      openCheckout
    );

  document
    .getElementById(
      "addToCartButton"
    )
    ?.addEventListener(
      "click",
      async () => {
        await openCheckout();
      }
    );
}

/* =========================================================
   CHECKOUT
========================================================= */

async function openCheckout() {
  if (!currentProduct) {
    return;
  }

  const validation =
    validateSelectedOptions();

  if (!validation.ok) {
    showToast(
      validation.error
    );

    return;
  }

  appliedPromoCode = "";

  renderCheckout();

  showPage("checkout");

  haptic("medium");
}

function renderCheckout() {
  const container =
    document.getElementById(
      "checkoutContent"
    );

  if (
    !container ||
    !currentProduct
  ) {
    return;
  }

  const product =
    currentProduct;

  const image =
    getProductImage(product);

  const usePriceOptions =
    hasPriceOptions(product);

  const price =
    usePriceOptions
      ? getSelectedOptionsPrice(
          product
        )
      : selectedVariant
        ? getVariantPrice(
            selectedVariant,
            product
          )
        : getProductPrice(
            product
          );

  const variantText =
    usePriceOptions
      ? (
          getSelectedOptionsText() ||
          "Стандартная комплектация"
        )
      : selectedVariant
        ? getVariantName(
            selectedVariant
          )
        : "Стандартная комплектация";

  const reservationAmount =
    getReservationAmount();

  const reservationText =
    getReservationText();

  const cardText =
    getReservationCardText();

  container.innerHTML = `
    <div class="checkout-card">

      <div class="checkout-title">
        Товар
      </div>

      <div class="checkout-product">

        ${
          image
            ? `
              <img
                src="${escapeHtml(image)}"
                alt=""
              >
            `
            : `
              <div class="checkout-product-placeholder"></div>
            `
        }

        <div>

          <div class="checkout-product-name">
            ${escapeHtml(
              product.name ||
              "Товар"
            )}
          </div>

          <div class="checkout-product-variant">
            ${escapeHtml(
              variantText
            )}
          </div>

          <div class="checkout-price">
            ${formatPrice(price)}
          </div>

        </div>
      </div>
    </div>

    <div class="checkout-card">

      <div class="checkout-title">
        Получение
      </div>

      <div class="checkout-options">

        <button
          id="pickupOption"
          class="checkout-option active"
          type="button"
          data-type="pickup"
        >
          Самовывоз
        </button>

        <button
          id="deliveryOption"
          class="checkout-option"
          type="button"
          data-type="delivery"
        >
          Доставка
        </button>

      </div>

      <div id="checkoutAddress"></div>

    </div>

    <div class="checkout-card">

      <div class="checkout-title">
        Оплата
      </div>

      <div class="checkout-note">
        Онлайн оплачивается только залог.
        Остаток суммы оплачивается наличными
        при получении заказа.
      </div>

    </div>

    ${
      reservationAmount > 0
        ? `
          <div class="checkout-card reservation-box">

            <div class="checkout-title">
              Залог
            </div>

            <div class="reservation-amount">
              ${formatPrice(
                reservationAmount
              )}
            </div>

            ${
              reservationText
                ? `
                  <div class="checkout-note">
                    ${escapeHtml(
                      reservationText
                    )}
                  </div>
                `
                : `
                  <div class="checkout-note">
                    Для оформления заказа необходимо
                    внести залог.
                  </div>
                `
            }

            ${
              cardText
                ? `
                  <div class="reservation-card-number">
                    ${escapeHtml(
                      cardText
                    )}
                  </div>

                  <button
                    id="copyReservationButton"
                    class="copy-card-button"
                    type="button"
                  >
                    Скопировать реквизиты
                  </button>
                `
                : `
                  <div class="reservation-card-number">
                    Реквизиты уточняются у магазина
                  </div>
                `
            }

          </div>
        `
        : ""
    }

    <div class="checkout-card">

      <div class="checkout-title">
        Промокод
      </div>

      <div class="promo-code-row">

        <input
          id="checkoutPromoCode"
          class="checkout-input"
          type="text"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          placeholder="Введите промокод"
          value="${escapeHtml(
            getPromoCodeDisplay(
              appliedPromoCode
            )
          )}"
        >

        <button
          id="applyPromoButton"
          class="secondary-button promo-apply-button"
          type="button"
        >
          Применить
        </button>

      </div>

      <div
        id="promoCodeStatus"
        class="promo-code-status"
      ></div>

    </div>

    <div class="checkout-card">

      <div class="checkout-title">
        Комментарий
      </div>

      <input
        id="checkoutComment"
        class="checkout-input"
        placeholder="Комментарий к заказу"
      >

    </div>

    <button
      id="checkoutSubmitButton"
      class="primary-button checkout-submit"
      type="button"
    >
      Оформить заказ
    </button>
  `;

  setupCheckoutEvents();

  renderCheckoutAddress("pickup");
}

/* =========================================================
   PROMO
========================================================= */

function applyPromoCode() {
  const input =
    document.getElementById(
      "checkoutPromoCode"
    );

  const status =
    document.getElementById(
      "promoCodeStatus"
    );

  if (!input || !status) {
    return;
  }

  const rawCode =
    input.value.trim();

  if (!rawCode) {
    appliedPromoCode = "";

    status.textContent =
      "Введите промокод";

    status.classList.remove(
      "success",
      "error"
    );

    status.classList.add(
      "error"
    );

    haptic("light");

    return;
  }

  if (
    !isPromoCodeActive(
      rawCode
    )
  ) {
    appliedPromoCode = "";

    status.textContent =
      "Промокод не найден или больше не действует";

    status.classList.remove(
      "success",
      "error"
    );

    status.classList.add(
      "error"
    );

    haptic("light");

    return;
  }

  appliedPromoCode =
    getPromoCodeDisplay(
      rawCode
    );

  input.value =
    appliedPromoCode;

  status.textContent =
    `Промокод «${appliedPromoCode}» применён`;

  status.classList.remove(
    "success",
    "error"
  );

  status.classList.add(
    "success"
  );

  showToast(
    "Промокод применён"
  );

  haptic("medium");
}

function clearPromoCode() {
  appliedPromoCode = "";

  const input =
    document.getElementById(
      "checkoutPromoCode"
    );

  const status =
    document.getElementById(
      "promoCodeStatus"
    );

  if (input) {
    input.value = "";
  }

  if (status) {
    status.textContent = "";

    status.classList.remove(
      "success",
      "error"
    );
  }
}

/* =========================================================
   CHECKOUT ADDRESS
========================================================= */

function renderCheckoutAddress(type) {
  const container =
    document.getElementById(
      "checkoutAddress"
    );

  if (!container) {
    return;
  }

  if (type === "delivery") {
    container.innerHTML = `
      ${
        getDeliveryText()
          ? `
            <div class="checkout-address-info">
              ${escapeHtml(
                getDeliveryText()
              )}
            </div>
          `
          : ""
      }

      <input
        id="deliveryCity"
        class="checkout-input"
        placeholder="Город"
      >

      <input
        id="deliveryStreet"
        class="checkout-input"
        placeholder="Улица"
      >

      <input
        id="deliveryHouse"
        class="checkout-input"
        placeholder="Дом"
      >

      <input
        id="deliveryApartment"
        class="checkout-input"
        placeholder="Квартира"
      >
    `;

    return;
  }

  container.innerHTML = `
    <div class="checkout-address-info">
      ${
        getPickupText()
          ? escapeHtml(
              getPickupText()
            )
          : `
            Самовывоз из магазина IRoom.
            Точный адрес подтверждает менеджер
            после оформления заказа.
          `
      }
    </div>
  `;
}

function setupCheckoutEvents() {
  const pickup =
    document.getElementById(
      "pickupOption"
    );

  const delivery =
    document.getElementById(
      "deliveryOption"
    );

  pickup?.addEventListener(
    "click",
    () => {
      pickup.classList.add(
        "active"
      );

      delivery?.classList.remove(
        "active"
      );

      renderCheckoutAddress(
        "pickup"
      );
    }
  );

  delivery?.addEventListener(
    "click",
    () => {
      delivery.classList.add(
        "active"
      );

      pickup?.classList.remove(
        "active"
      );

      renderCheckoutAddress(
        "delivery"
      );
    }
  );

  document
    .getElementById(
      "applyPromoButton"
    )
    ?.addEventListener(
      "click",
      applyPromoCode
    );

  document
    .getElementById(
      "checkoutPromoCode"
    )
    ?.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
          "Enter"
        ) {
          event.preventDefault();

          applyPromoCode();
        }
      }
    );

  document
    .getElementById(
      "copyReservationButton"
    )
    ?.addEventListener(
      "click",
      async () => {
        const text =
          getReservationCardText();

        if (!text) {
          showToast(
            "Реквизиты пока не указаны"
          );

          return;
        }

        try {
          await navigator.clipboard.writeText(
            text
          );

          showToast(
            "Реквизиты скопированы"
          );
        } catch {
          showToast(
            "Не удалось скопировать"
          );
        }
      }
    );

  document
    .getElementById(
      "checkoutSubmitButton"
    )
    ?.addEventListener(
      "click",
      createOrder
    );
}

/* =========================================================
   VALIDATE OPTIONS
========================================================= */

function validateSelectedOptions() {
  if (!currentProduct) {
    return {
      ok: false,
      error: "Товар не выбран"
    };
  }

  if (
    !hasPriceOptions(
      currentProduct
    )
  ) {
    return {
      ok: true
    };
  }

  const options =
    getProductPriceOptions(
      currentProduct
    );

  const groups = [
    {
      key: "color",
      name: "Цвет",
      list: options.colors
    },

    {
      key: "memory",
      name: "Память",
      list: options.memories
    },

    {
      key: "sim",
      name: "SIM",
      list: options.sims
    },

    {
      key: "region",
      name: "Регион",
      list: options.regions
    }
  ];

  for (const group of groups) {
    if (!group.list.length) {
      continue;
    }

    if (!selectedOptions[group.key]) {
      return {
        ok: false,
        error:
          `Выберите: ${group.name}`
      };
    }

    const exists =
      group.list.some(
        option =>
          String(
            option.name
          ) ===
          String(
            selectedOptions[
              group.key
            ]
          )
      );

    if (!exists) {
      return {
        ok: false,
        error:
          `Недопустимый вариант: ${group.name}`
      };
    }
  }

  return {
    ok: true
  };
}

/* =========================================================
   CREATE ORDER
========================================================= */

async function createOrder() {
  if (!currentProduct) {
    return;
  }

  const button =
    document.getElementById(
      "checkoutSubmitButton"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "Оформляем...";
  }

  try {
    const product =
      currentProduct;

    const validation =
      validateSelectedOptions();

    if (!validation.ok) {
      throw new Error(
        validation.error
      );
    }

    const usePriceOptions =
      hasPriceOptions(product);

    const price =
      usePriceOptions
        ? getSelectedOptionsPrice(
            product
          )
        : selectedVariant
          ? getVariantPrice(
              selectedVariant,
              product
            )
          : getProductPrice(
              product
            );

    const variantText =
      usePriceOptions
        ? getSelectedOptionsText()
        : selectedVariant
          ? getVariantName(
              selectedVariant
            )
          : "";

    const delivery =
      Boolean(
        document
          .getElementById(
            "deliveryOption"
          )
          ?.classList.contains(
            "active"
          )
      );

    const comment =
      document
        .getElementById(
          "checkoutComment"
        )
        ?.value ||
      "";

    const promoInput =
      document.getElementById(
        "checkoutPromoCode"
      );

    const enteredPromoCode =
      promoInput?.value?.trim() ||
      "";

    if (enteredPromoCode) {
      if (
        !isPromoCodeActive(
          enteredPromoCode
        )
      ) {
        throw new Error(
          "Промокод не найден или больше не действует"
        );
      }

      appliedPromoCode =
        getPromoCodeDisplay(
          enteredPromoCode
        );
    }

    let deliveryCity = "";
    let deliveryStreet = "";
    let deliveryHouse = "";
    let deliveryApartment = "";

    if (delivery) {
      deliveryCity =
        document.getElementById(
          "deliveryCity"
        )?.value?.trim() ||
        "";

      deliveryStreet =
        document.getElementById(
          "deliveryStreet"
        )?.value?.trim() ||
        "";

      deliveryHouse =
        document.getElementById(
          "deliveryHouse"
        )?.value?.trim() ||
        "";

      deliveryApartment =
        document.getElementById(
          "deliveryApartment"
        )?.value?.trim() ||
        "";

      if (
        !deliveryCity ||
        !deliveryStreet ||
        !deliveryHouse
      ) {
        throw new Error(
          "Заполните город, улицу и дом"
        );
      }
    }

    const reservationAmount =
      getReservationAmount();

    const payload = {
      product_id:
        product.id,

      variant_id:
        selectedVariant
          ? getVariantId(
              selectedVariant
            )
          : null,

      product_name:
        product.name ||
        "Товар",

      variant_text:
        variantText,

      selected_options:
        usePriceOptions
          ? getSelectedOptionsPayload()
          : null,

      price,

      promo_code:
        appliedPromoCode ||
        null,

      payment_method:
        "cash",

      reservation_amount:
        reservationAmount,

      fulfillment_type:
        delivery
          ? "delivery"
          : "pickup",

      receiving_type:
        delivery
          ? "delivery"
          : "pickup",

      delivery_type:
        delivery
          ? "delivery"
          : "pickup",

      delivery_city:
        deliveryCity,

      delivery_street:
        deliveryStreet,

      delivery_house:
        deliveryHouse,

      delivery_apartment:
        deliveryApartment,

      address:
        delivery
          ? [
              deliveryCity,
              deliveryStreet,
              deliveryHouse
                ? `д. ${deliveryHouse}`
                : "",
              deliveryApartment
                ? `кв. ${deliveryApartment}`
                : ""
            ]
              .filter(Boolean)
              .join(", ")
          : "Самовывоз",

      comment,

      customer_comment:
        comment
    };

    const data =
      await api(
        "/api/orders",
        {
          method: "POST",
          body:
            JSON.stringify(
              payload
            )
        }
      );

    currentOrder =
      data?.order ||
      null;

    if (!currentOrder) {
      throw new Error(
        "Сервер не вернул заказ"
      );
    }

    showToast(
      "Заказ создан"
    );

    await loadOrders();

    await openOrder(
      currentOrder.id
    );
  } catch (error) {
    console.error(
      "createOrder:",
      error
    );

    showToast(
      error.message ||
      "Не удалось создать заказ"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        "Оформить заказ";
    }
  }
}

/* =========================================================
   ORDERS
========================================================= */

async function loadOrders() {
  const loading =
    document.getElementById(
      "ordersLoading"
    );

  const empty =
    document.getElementById(
      "ordersEmpty"
    );

  const list =
    document.getElementById(
      "ordersList"
    );

  loading?.classList.remove(
    "hidden"
  );

  empty?.classList.add(
    "hidden"
  );

  if (list) {
    list.innerHTML = "";
  }

  try {
    const data =
      await api(
        "/api/orders"
      );

    orders =
      unwrap(
        data,
        "orders"
      );

    renderOrders();

    updateCartBadge();
  } catch (error) {
    console.error(
      "loadOrders:",
      error
    );

    if (list) {
      list.innerHTML = `
        <div class="empty-state">

          <h3>
            Не удалось загрузить заказы
          </h3>

          <p>
            Попробуйте ещё раз.
          </p>

          <button
            class="primary-button"
            id="retryOrdersButton"
            type="button"
          >
            Повторить
          </button>

        </div>
      `;

      document
        .getElementById(
          "retryOrdersButton"
        )
        ?.addEventListener(
          "click",
          loadOrders
        );
    }
  } finally {
    loading?.classList.add(
      "hidden"
    );
  }
}

function getReservationStatus(order) {
  return (
    order?.reservation_status ||
    "not_required"
  );
}

function getReservationInfo(order) {
  return (
    RESERVATION_INFO[
      getReservationStatus(
        order
      )
    ] ||
    RESERVATION_INFO.pending_payment
  );
}

function orderCard(order) {
  const status =
    STATUS_INFO[
      order.status
    ] ||
    STATUS_INFO.new;

  const reservation =
    getReservationInfo(
      order
    );

  const product =
    findProduct(
      order.product_id
    );

  const image =
    getProductImage(
      product
    );

  const reservationAmount =
    Number(
      order.reservation_amount
    ) || 0;

  return `
    <article
      class="order-card"
      data-order-id="${escapeHtml(
        order.id
      )}"
    >

      <div class="order-card-top">

        <div>

          <div class="order-number">
            ${escapeHtml(
              order.display_id ||
              `#${order.id}`
            )}
          </div>

          <div class="order-date">
            ${escapeHtml(
              formatDateTime(
                order.created_at
              )
            )}
          </div>

        </div>

        <span
          class="order-status ${
            status.className
          }"
        >
          ${escapeHtml(
            status.text
          )}
        </span>

      </div>

      <div class="order-card-product">

        ${
          image
            ? `
              <img
                src="${escapeHtml(
                  image
                )}"
                alt=""
              >
            `
            : `
              <div class="order-card-image-placeholder"></div>
            `
        }

        <div class="order-card-product-info">

          <h3>
            ${escapeHtml(
              order.product_name ||
              "Товар"
            )}
          </h3>

          ${
            order.variant_text
              ? `
                <div class="order-variant">
                  ${escapeHtml(
                    order.variant_text
                  )}
                </div>
              `
              : ""
          }

          <div class="order-price">
            ${formatPrice(
              order.price
            )}
          </div>

        </div>
      </div>

      ${
        reservationAmount > 0
          ? `
            <div class="order-reservation-status ${reservation.className}">

              <span>
                Залог:
              </span>

              <strong>
                ${escapeHtml(
                  reservation.text
                )}
              </strong>

            </div>
          `
          : ""
      }

      ${
        reservationAmount > 0 &&
        (
          getReservationStatus(
            order
          ) ===
            "pending_payment" ||
          getReservationStatus(
            order
          ) === "pending" ||
          getReservationStatus(
            order
          ) === "rejected"
        )
          ? `
            <div class="order-payment-hint">
              ${formatPrice(
                reservationAmount
              )} — залог
            </div>
          `
          : ""
      }

      <div class="order-card-bottom">

        <span>
          Подробнее
        </span>

        <span>
          ›
        </span>

      </div>

    </article>
  `;
}

function renderOrders() {
  const list =
    document.getElementById(
      "ordersList"
    );

  const empty =
    document.getElementById(
      "ordersEmpty"
    );

  if (!list || !empty) {
    return;
  }

  if (!orders.length) {
    empty.classList.remove(
      "hidden"
    );

    list.innerHTML = "";

    return;
  }

  empty.classList.add(
    "hidden"
  );

  list.innerHTML =
    orders
      .map(orderCard)
      .join("");

  list
    .querySelectorAll(
      ".order-card"
    )
    .forEach(card => {
      card.addEventListener(
        "click",
        () => {
          openOrder(
            card.dataset.orderId
          );
        }
      );
    });
}

function updateCartBadge() {
  const badge =
    document.getElementById(
      "cartBadge"
    );

  if (!badge) {
    return;
  }

  const active =
    orders.filter(
      order =>
        ![
          "completed",
          "cancelled",
          "rejected"
        ].includes(
          String(
            order.status
          )
        )
    ).length;

  if (!active) {
    badge.classList.add(
      "hidden"
    );

    return;
  }

  badge.textContent =
    active > 9
      ? "9+"
      : String(active);

  badge.classList.remove(
    "hidden"
  );
}

/* =========================================================
   RESERVATION PAYMENT
========================================================= */

async function markReservationPaid() {
  if (!currentOrder) {
    return;
  }

  const status =
    getReservationStatus(
      currentOrder
    );

  if (
    status !==
      "pending_payment" &&
    status !== "pending" &&
    status !== "rejected"
  ) {
    return;
  }

  const button =
    document.getElementById(
      "reservationPaidButton"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "Отправляем...";
  }

  try {
    const data =
      await api(
        `/api/orders/${encodeURIComponent(
          currentOrder.id
        )}/reservation-paid`,
        {
          method: "POST"
        }
      );

    currentOrder =
      data?.order ||
      currentOrder;

    showToast(
      "Заявка отправлена на проверку"
    );

    haptic("medium");

    renderOrderDetails();

    await loadOrders();
  } catch (error) {
    console.error(
      "markReservationPaid:",
      error
    );

    showToast(
      error.message ||
      "Не удалось отправить заявку"
    );

    if (button) {
      button.disabled = false;
      button.textContent =
        status === "rejected"
          ? "Я оплатил(а) залог снова"
          : "Я оплатил(а) залог";
    }
  }
}

/* =========================================================
   ORDER DETAIL
========================================================= */

async function openOrder(orderId) {
  showPage("order");

  const container =
    document.getElementById(
      "orderDetails"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="small-loader"></div>

    <span>
      Загружаем заказ...
    </span>
  `;

  try {
    const data =
      await api(
        `/api/orders/${encodeURIComponent(
          orderId
        )}`
      );

    currentOrder =
      data?.order ||
      null;

    if (!currentOrder) {
      throw new Error(
        "Заказ не найден"
      );
    }

    renderOrderDetails();
  } catch (error) {
    console.error(
      "openOrder:",
      error
    );

    container.innerHTML = `
      <div class="empty-state">

        <h3>
          Заказ не найден
        </h3>

        <p>
          Возможно, он был удалён.
        </p>

        <button
          class="primary-button"
          id="backOrdersButton"
          type="button"
        >
          Вернуться к заказам
        </button>

      </div>
    `;

    document
      .getElementById(
        "backOrdersButton"
      )
      ?.addEventListener(
        "click",
        () => {
          showPage(
            "orders"
          );
        }
      );
  }
}

function renderOrderDetails() {
  const container =
    document.getElementById(
      "orderDetails"
    );

  if (
    !container ||
    !currentOrder
  ) {
    return;
  }

  const order =
    currentOrder;

  const status =
    STATUS_INFO[
      order.status
    ] ||
    STATUS_INFO.new;

  const reservationStatus =
    getReservationStatus(
      order
    );

  const reservation =
    getReservationInfo(
      order
    );

  const reservationAmount =
    Number(
      order.reservation_amount
    ) || 0;

  const product =
    findProduct(
      order.product_id
    );

  const image =
    getProductImage(
      product
    );

  const productPrice =
    Number(order.price) || 0;

  const remaining =
    Math.max(
      productPrice -
      reservationAmount,
      0
    );

  const timeline = [
    "new",
    "confirmed",
    "processing",
    "ready",
    "completed"
  ];

  const currentIndex =
    timeline.indexOf(
      order.status
    );

  const isCancelled =
    [
      "cancelled",
      "rejected"
    ].includes(
      order.status
    );

  const canPayReservation =
    reservationAmount > 0 &&
    (
      reservationStatus ===
        "pending_payment" ||
      reservationStatus ===
        "pending" ||
      reservationStatus ===
        "rejected"
    );

  const waitingReservation =
    reservationStatus ===
    "awaiting_confirmation";

  const reservationConfirmed =
    reservationStatus ===
    "confirmed";

  container.innerHTML = `
    <div class="order-detail-card">

      <div class="order-detail-heading">

        <div>

          <div class="section-kicker">
            ЗАКАЗ
          </div>

          <h1>
            ${escapeHtml(
              order.display_id ||
              `#${order.id}`
            )}
          </h1>

        </div>

        <span
          class="order-status ${
            status.className
          }"
        >
          ${escapeHtml(
            status.text
          )}
        </span>

      </div>

      <div class="order-detail-date">
        ${escapeHtml(
          formatDateTime(
            order.created_at
          )
        )}
      </div>

      <div class="order-detail-product">

        ${
          image
            ? `
              <img
                src="${escapeHtml(
                  image
                )}"
                alt=""
              >
            `
            : `
              <div class="order-detail-image-placeholder"></div>
            `
        }

        <div>

          <h2>
            ${escapeHtml(
              order.product_name ||
              "Товар"
            )}
          </h2>

          ${
            order.variant_text
              ? `
                <p>
                  ${escapeHtml(
                    order.variant_text
                  )}
                </p>
              `
              : ""
          }

        </div>
      </div>

      <div class="order-detail-price-row">

        <span>
          Стоимость товара
        </span>

        <strong>
          ${formatPrice(
            productPrice
          )}
        </strong>

      </div>

      ${
        order.promo_code
          ? `
            <div class="order-detail-price-row">

              <span>
                Промокод
              </span>

              <strong>
                ${escapeHtml(
                  order.promo_code
                )}
              </strong>

            </div>
          `
          : ""
      }

      ${
        reservationAmount > 0
          ? `
            <div class="order-payment-card">

              <div class="order-payment-card-header">

                <span>
                  Залог
                </span>

                <span
                  class="reservation-status ${reservation.className}"
                >
                  ${escapeHtml(
                    reservation.text
                  )}
                </span>

              </div>

              <div class="order-payment-amount">
                ${formatPrice(
                  reservationAmount
                )}
              </div>

              ${
                canPayReservation
                  ? `
                    <div class="order-payment-description">
                      ${
                        reservationStatus ===
                        "rejected"
                          ? "Предыдущая заявка на проверку была отклонена. Если вы уже оплатили залог, отправьте подтверждение повторно."
                          : "Переведите сумму залога по реквизитам магазина, затем нажмите кнопку ниже."
                      }
                    </div>

                    ${
                      getReservationCardText()
                        ? `
                          <div class="reservation-card-number">
                            ${escapeHtml(
                              getReservationCardText()
                            )}
                          </div>

                          <button
                            id="copyOrderReservationButton"
                            class="copy-card-button"
                            type="button"
                          >
                            Скопировать реквизиты
                          </button>
                        `
                        : ""
                    }

                    <button
                      id="reservationPaidButton"
                      class="primary-button"
                      type="button"
                    >
                      ${
                        reservationStatus ===
                        "rejected"
                          ? "Я оплатил(а) залог снова"
                          : "Я оплатил(а) залог"
                      }
                    </button>
                  `
                  : ""
              }

              ${
                waitingReservation
                  ? `
                    <div class="order-payment-waiting">
                      <strong>
                        Заявка отправлена
                      </strong>

                      <span>
                        Менеджер проверит оплату
                        и изменит статус залога.
                      </span>
                    </div>
                  `
                  : ""
              }

              ${
                reservationConfirmed
                  ? `
                    <div class="order-payment-success">
                      <strong>
                        Залог подтверждён
                      </strong>

                      <span>
                        Остаток оплачивается
                        наличными при получении.
                      </span>
                    </div>
                  `
                  : ""
              }

            </div>
          `
          : ""
      }

      ${
        reservationAmount > 0
          ? `
            <div class="order-detail-price-row">

              <span>
                Остаток к оплате
              </span>

              <strong>
                ${formatPrice(
                  remaining
                )}
              </strong>

            </div>

            <div class="checkout-note">
              Остаток оплачивается наличными
              при получении заказа.
            </div>
          `
          : ""
      }

      ${
        order.receiving_type ||
        order.delivery_type
          ? `
            <div class="order-detail-price-row">

              <span>
                Получение
              </span>

              <strong>
                ${
                  order.receiving_type ===
                    "delivery" ||
                  order.delivery_type ===
                    "delivery"
                    ? "Доставка"
                    : "Самовывоз"
                }
              </strong>

            </div>
          `
          : ""
      }

      ${
        order.address
          ? `
            <div class="order-detail-price-row">

              <span>
                Адрес
              </span>

              <strong>
                ${escapeHtml(
                  order.address
                )}
              </strong>

            </div>
          `
          : ""
      }

      ${
        order.customer_comment ||
        order.comment
          ? `
            <div class="order-comment-box">

              <div class="order-comment-title">
                Комментарий
              </div>

              <div>
                ${escapeHtml(
                  order.customer_comment ||
                  order.comment ||
                  ""
                )}
              </div>

            </div>
          `
          : ""
      }

      ${
        isCancelled
          ? `
            <div class="order-cancelled-box">
              Заказ отменён менеджером.
            </div>
          `
          : `
            <div class="order-timeline">

              ${timeline
                .map(
                  (
                    item,
                    index
                  ) => {
                    const completed =
                      currentIndex >=
                      index;

                    const active =
                      order.status ===
                      item;

                    return `
                      <div
                        class="timeline-item ${
                          completed
                            ? "completed"
                            : ""
                        } ${
                          active
                            ? "active"
                            : ""
                        }"
                      >

                        <div class="timeline-dot">
                          ${
                            completed
                              ? "✓"
                              : ""
                          }
                        </div>

                        <div class="timeline-text">
                          ${escapeHtml(
                            STATUS_INFO[
                              item
                            ]?.text ||
                            item
                          )}
                        </div>

                      </div>
                    `;
                  }
                )
                .join("")}

            </div>
          `
      }

    </div>
  `;

  document
    .getElementById(
      "reservationPaidButton"
    )
    ?.addEventListener(
      "click",
      markReservationPaid
    );

  document
    .getElementById(
      "copyOrderReservationButton"
    )
    ?.addEventListener(
      "click",
      async () => {
        const text =
          getReservationCardText();

        if (!text) {
          showToast(
            "Реквизиты пока не указаны"
          );

          return;
        }

        try {
          await navigator.clipboard.writeText(
            text
          );

          showToast(
            "Реквизиты скопированы"
          );
        } catch {
          showToast(
            "Не удалось скопировать"
          );
        }
      }
    );
}

/* =========================================================
   USER
========================================================= */

async function loadCurrentUser() {
  try {
    const data =
      await api("/api/me");

    currentUser =
      data?.user ||
      null;

    renderProfile();
  } catch (error) {
    console.error(
      "User:",
      error
    );
  }
}

function renderProfile() {
  const name =
    document.getElementById(
      "profileName"
    );

  const username =
    document.getElementById(
      "profileUsername"
    );

  const avatar =
    document.getElementById(
      "profileAvatar"
    );

  if (!currentUser) {
    if (name) {
      name.textContent =
        "Покупатель";
    }

    if (username) {
      username.textContent =
        "Telegram";
    }

    if (avatar) {
      avatar.textContent =
        "";
    }

    return;
  }

  const fullName = [
    currentUser.first_name,
    currentUser.last_name
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const displayName =
    fullName ||
    currentUser.username ||
    "Покупатель";

  if (name) {
    name.textContent =
      displayName;
  }

  if (username) {
    username.textContent =
      currentUser.username
        ? `@${currentUser.username}`
        : "Telegram";
  }

  if (avatar) {
    avatar.textContent =
      displayName
        .charAt(0)
        .toUpperCase();
  }
}

/* =========================================================
   CONTACT
========================================================= */

function openContact(message) {
  const url =
    `https://t.me/iroom_24?text=${encodeURIComponent(
      message
    )}`;

  openTelegram(url);
}

function setupContactButtons() {
  document
    .getElementById(
      "contactManagerButton"
    )
    ?.addEventListener(
      "click",
      () => {
        openContact(
          "Здравствуйте! Хочу проконсультироваться по товарам IRoom."
        );
      }
    );

  document
    .getElementById(
      "profileManagerButton"
    )
    ?.addEventListener(
      "click",
      () => {
        openContact(
          "Здравствуйте! Нужна помощь по IRoom."
        );
      }
    );
}

/* =========================================================
   ADMIN
========================================================= */

async function checkAdmin() {
  try {
    const data =
      await api(
        "/api/admin/me"
      );

    const isAdmin =
      Boolean(
        data?.is_admin ||
        data?.ok
      );

    const button =
      document.getElementById(
        "adminProfileButton"
      );

    button?.classList.toggle(
      "hidden",
      !isAdmin
    );

    const adminButton =
      document.getElementById(
        "adminButton"
      );

    if (
      adminButton &&
      !adminButton.dataset.bound
    ) {
      adminButton.dataset.bound =
        "true";

      adminButton.addEventListener(
        "click",
        () => {
          window.location.href =
            "/admin.html";
        }
      );
    }
  } catch (error) {
    console.error(
      "Admin:",
      error
    );
  }
}

/* =========================================================
   LOAD STORE
========================================================= */

async function loadProducts() {
  const data =
    await api(
      "/api/products"
    );

  products =
    unwrap(
      data,
      "products"
    );
}

async function loadCategories() {
  const data =
    await api(
      "/api/categories"
    );

  categories =
    unwrap(
      data,
      "categories"
    );
}

async function loadStoreConfig() {
  try {
    const data =
      await api(
        "/api/store-config"
      );

    storeConfig =
      data || {};
  } catch (error) {
    console.error(
      "Store config:",
      error
    );

    storeConfig = {};
  }
}

function renderHome() {
  renderNewProducts();
  renderPopularProducts();
  renderDrawerCategories();
}

/* =========================================================
   BANNERS
========================================================= */

function setupBanners() {
  const track =
    document.getElementById(
      "bannerTrack"
    );

  const dots =
    document.getElementById(
      "bannerDots"
    );

  if (!track || !dots) {
    return;
  }

  const slides =
    track.querySelectorAll(
      ".banner-slide"
    );

  if (!slides.length) {
    return;
  }

  dots.innerHTML =
    Array.from(slides)
      .map(
        (_, index) => `
          <span
            class="banner-dot ${
              index === 0
                ? "active"
                : ""
            }"
          ></span>
        `
      )
      .join("");

  track.addEventListener(
    "scroll",
    () => {
      const width =
        track.clientWidth;

      if (!width) {
        return;
      }

      const index =
        Math.round(
          track.scrollLeft /
          width
        );

      dots
        .querySelectorAll(
          ".banner-dot"
        )
        .forEach(
          (
            dot,
            dotIndex
          ) => {
            dot.classList.toggle(
              "active",
              dotIndex === index
            );
          }
        );
    }
  );
}

/* =========================================================
   STARTUP
========================================================= */

function hideStartupScreen() {
  document
    .getElementById(
      "startupScreen"
    )
    ?.classList.add(
      "hidden"
    );

  document
    .getElementById("app")
    ?.classList.remove(
      "hidden"
    );
}

async function safeLoadStore() {
  const productsPromise =
    loadProducts().catch(
      error => {
        console.error(
          "Products:",
          error
        );

        products = [];
      }
    );

  const categoriesPromise =
    loadCategories().catch(
      error => {
        console.error(
          "Categories:",
          error
        );

        categories = [];
      }
    );

  const configPromise =
    loadStoreConfig();

  const userPromise =
    loadCurrentUser().catch(
      error => {
        console.error(
          "Current user:",
          error
        );

        currentUser = null;
      }
    );

  await Promise.allSettled([
    productsPromise,
    categoriesPromise,
    configPromise,
    userPromise
  ]);

  renderHome();
  renderCatalogPage();
  renderProfile();

  checkAdmin().catch(
    error => {
      console.error(
        "Admin check:",
        error
      );
    }
  );

  loadOrders().catch(
    error => {
      console.error(
        "Initial orders:",
        error
      );
    }
  );
}

/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    try {
      initTelegram();

      setupNavigation();
      setupSearch();
      setupContactButtons();

      showPage("home");

      setupBanners();

      hideStartupScreen();

      await safeLoadStore();
    } catch (error) {
      console.error(
        "Store startup:",
        error
      );

      hideStartupScreen();

      showToast(
        "Магазин открыт, данные загружаются"
      );
    }
  }
);

/* =========================================================
   EMERGENCY FALLBACK
========================================================= */

setTimeout(() => {
  const startup =
    document.getElementById(
      "startupScreen"
    );

  if (
    startup &&
    !startup.classList.contains(
      "hidden"
    )
  ) {
    hideStartupScreen();
  }
}, 7000);