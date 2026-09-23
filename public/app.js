const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#080808");
  tg.setBackgroundColor("#080808");
}

const state = {
  products: [],
  categories: [],
  currentProduct: null,
  currentCategory: null,
  searchQuery: "",
  selected: {
    memory: null,
    color: null,
    country: null,
    sim: null
  },
  admin: false
};

const $ = (id) => document.getElementById(id);

const homePage = $("homePage");
const productPage = $("productPage");
const adminPage = $("adminPage");

const productsContainer = $("products");
const newProductsContainer = $("newProducts");
const categoriesContainer = $("categories");

const productContent = $("productContent");
const catalogTitle = $("catalogTitle");

const searchPanel = $("searchPanel");
const searchInput = $("searchInput");

const loader = $("loader");
const toast = $("toast");

const adminButton = $("adminButton");


/* =========================
   API
========================= */

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (tg?.initData) {
    headers["x-telegram-init-data"] = tg.initData;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Ошибка ${response.status}`
    );
  }

  return data;
}


/* =========================
   UI HELPERS
========================= */

function showLoader(show = true) {
  if (!loader) return;

  loader.hidden = !show;
}

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Цена по запросу";
  }

  return `${number.toLocaleString("ru-RU")} ₽`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;

  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {}

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}


/* =========================
   DATA NORMALIZATION
========================= */

function normalizeProduct(product) {
  const variants = Array.isArray(product?.variants)
    ? product.variants
    : [];

  return {
    ...product,

    id: product.id,

    name:
      product.name ||
      product.title ||
      "Товар",

    title:
      product.title ||
      product.name ||
      "Товар",

    description:
      product.description ||
      "",

    image_url:
      product.image_url ||
      product.image ||
      "",

    price:
      Number(product.price) || 0,

    category_id:
      product.category_id ||
      product.categoryId ||
      null,

    variants
  };
}

function normalizeCategory(category) {
  return {
    ...category,

    id: category.id,

    name:
      category.name ||
      category.title ||
      "Категория"
  };
}


/* =========================
   LOAD STORE
========================= */

async function loadStore() {
  try {
    showLoader(true);

    const [productsResponse, categoriesResponse] =
      await Promise.all([
        api("/api/products"),
        api("/api/categories")
      ]);

    const products =
      Array.isArray(productsResponse)
        ? productsResponse
        : productsResponse.products || [];

    const categories =
      Array.isArray(categoriesResponse)
        ? categoriesResponse
        : categoriesResponse.categories || [];

    state.products = products
      .map(normalizeProduct)
      .filter((product) => product.active !== false);

    state.categories = categories
      .map(normalizeCategory)
      .filter((category) => category.active !== false);

    renderCategories();
    renderNewProducts();
    renderProducts();

    await checkAdmin();

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось загрузить магазин"
    );
  } finally {
    showLoader(false);
  }
}


/* =========================
   CATEGORIES
========================= */

function renderCategories() {
  if (!categoriesContainer) return;

  const allButton = `
    <button
      class="category-chip ${!state.currentCategory ? "active" : ""}"
      type="button"
      data-category-id=""
    >
      Все
    </button>
  `;

  const buttons = state.categories
    .map((category) => {
      const active =
        String(state.currentCategory || "") ===
        String(category.id);

      return `
        <button
          class="category-chip ${active ? "active" : ""}"
          type="button"
          data-category-id="${escapeHtml(category.id)}"
        >
          ${escapeHtml(category.name)}
        </button>
      `;
    })
    .join("");

  categoriesContainer.innerHTML =
    allButton + buttons;

  categoriesContainer
    .querySelectorAll("[data-category-id]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const categoryId =
          button.dataset.categoryId || null;

        state.currentCategory = categoryId;

        renderCategories();
        renderProducts();

        if (catalogTitle) {
          if (!categoryId) {
            catalogTitle.textContent = "Каталог";
          } else {
            const category =
              state.categories.find(
                (item) =>
                  String(item.id) ===
                  String(categoryId)
              );

            catalogTitle.textContent =
              category?.name || "Каталог";
          }
        }

        document
          .getElementById("catalogSection")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
      });
    });
}


/* =========================
   PRODUCT FILTERING
========================= */

function getVisibleProducts() {
  let products = [...state.products];

  if (state.currentCategory) {
    products = products.filter(
      (product) =>
        String(product.category_id) ===
        String(state.currentCategory)
    );
  }

  const query =
    state.searchQuery.trim().toLowerCase();

  if (query) {
    products = products.filter((product) => {
      const text = [
        product.name,
        product.title,
        product.description
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });
  }

  return products;
}


/* =========================
   PRODUCT CARD
========================= */

function productCard(product) {
  const image = product.image_url
    ? `
      <img
        class="product-image"
        src="${escapeHtml(product.image_url)}"
        alt="${escapeHtml(product.name)}"
        loading="lazy"
      />
    `
    : `
      <div class="product-image-placeholder">
        IRoom
      </div>
    `;

  const variantPrice =
    getLowestVariantPrice(product);

  const price =
    variantPrice ||
    product.price;

  return `
    <article
      class="product-card"
      data-product-id="${escapeHtml(product.id)}"
    >

      <div class="product-image-wrap">
        ${image}

        ${
          product.is_new
            ? `
              <div class="product-card-badge">
                НОВИНКА
              </div>
            `
            : ""
        }
      </div>

      <div class="product-card-info">

        <h3 class="product-card-title">
          ${escapeHtml(product.name)}
        </h3>

        ${
          product.description
            ? `
              <div class="product-card-subtitle">
                ${escapeHtml(
                  shortText(product.description, 55)
                )}
              </div>
            `
            : ""
        }

        <div class="product-card-price">
          ${formatPrice(price)}
        </div>

      </div>

    </article>
  `;
}

function shortText(text, max) {
  const value = String(text || "");

  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max - 1)}…`;
}

function getLowestVariantPrice(product) {
  const prices = (product.variants || [])
    .map((variant) => Number(variant.price))
    .filter(
      (price) =>
        Number.isFinite(price) &&
        price > 0
    );

  if (!prices.length) {
    return null;
  }

  return Math.min(...prices);
}


/* =========================
   RENDER PRODUCTS
========================= */

function renderProducts() {
  if (!productsContainer) return;

  const products = getVisibleProducts();

  productsContainer.innerHTML =
    products.map(productCard).join("");

  const empty = $("emptyProducts");

  if (empty) {
    empty.hidden = products.length !== 0;
  }

  bindProductCards(
    productsContainer
  );
}

function renderNewProducts() {
  if (!newProductsContainer) return;

  let products = state.products.filter(
    (product) =>
      product.is_new === true ||
      product.is_new === 1 ||
      product.is_new === "1"
  );

  if (!products.length) {
    products = state.products.slice(0, 8);
  }

  newProductsContainer.innerHTML =
    products.map(productCard).join("");

  bindProductCards(
    newProductsContainer
  );
}

function bindProductCards(container) {
  container
    .querySelectorAll("[data-product-id]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const productId =
          card.dataset.productId;

        openProduct(productId);
      });
    });
}


/* =========================
   PRODUCT
========================= */

async function openProduct(productId) {
  try {
    showLoader(true);

    let product =
      state.products.find(
        (item) =>
          String(item.id) ===
          String(productId)
      );

    try {
      const response =
        await api(`/api/products/${encodeURIComponent(productId)}`);

      const remote =
        response.product || response;

      if (remote?.id) {
        product =
          normalizeProduct(remote);
      }
    } catch {}

    if (!product) {
      throw new Error("Товар не найден");
    }

    state.currentProduct = product;

    state.selected = {
      memory: null,
      color: null,
      country: null,
      sim: null
    };

    renderProduct(product);

    homePage.hidden = true;
    productPage.hidden = false;

    if ($("storeFooter")) {
      $("storeFooter").hidden = true;
    }

    if (adminButton) {
      adminButton.hidden = true;
    }

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось открыть товар"
    );
  } finally {
    showLoader(false);
  }
}


/* =========================
   PRODUCT VARIANTS
========================= */

function getVariants(product) {
  return Array.isArray(product?.variants)
    ? product.variants
    : [];
}

function getVariantValues(product, field) {
  const values = [];

  getVariants(product).forEach((variant) => {
    const value =
      variant?.[field] ??
      variant?.[`${field}_value`] ??
      null;

    if (
      value !== null &&
      value !== undefined &&
      String(value).trim()
    ) {
      const normalized =
        String(value).trim();

      if (!values.includes(normalized)) {
        values.push(normalized);
      }
    }
  });

  return values;
}

function variantMatchesSelection(
  variant,
  selected
) {
  const fields = [
    "memory",
    "color",
    "country",
    "sim"
  ];

  return fields.every((field) => {
    const selectedValue =
      selected[field];

    if (!selectedValue) {
      return true;
    }

    const variantValue =
      variant?.[field] ??
      variant?.[`${field}_value`] ??
      null;

    if (!variantValue) {
      return false;
    }

    return (
      String(variantValue).trim() ===
      String(selectedValue).trim()
    );
  });
}

function findSelectedVariant(product) {
  const variants =
    getVariants(product);

  if (!variants.length) {
    return null;
  }

  const exact =
    variants.find((variant) =>
      variantMatchesSelection(
        variant,
        state.selected
      )
    );

  if (exact) {
    return exact;
  }

  return null;
}

function calculateCurrentPrice(product) {
  const variant =
    findSelectedVariant(product);

  if (variant) {
    const price =
      Number(variant.price);

    if (
      Number.isFinite(price) &&
      price > 0
    ) {
      return price;
    }
  }

  return Number(product.price) || 0;
}


/* =========================
   RENDER PRODUCT PAGE
========================= */

function renderProduct(product) {
  const image = product.image_url
    ? `
      <img
        src="${escapeHtml(product.image_url)}"
        alt="${escapeHtml(product.name)}"
      />
    `
    : `
      <div class="product-image-placeholder">
        IRoom
      </div>
    `;

  const price =
    calculateCurrentPrice(product);

  const memory =
    getVariantValues(product, "memory");

  const colors =
    getVariantValues(product, "color");

  const countries =
    getVariantValues(product, "country");

  const sims =
    getVariantValues(product, "sim");

  productContent.innerHTML = `
    <div class="product-detail-image">
      ${image}
    </div>

    <div class="product-detail-info">

      ${
        product.category_name
          ? `
            <div class="product-detail-category">
              ${escapeHtml(product.category_name)}
            </div>
          `
          : ""
      }

      <h1 class="product-detail-title">
        ${escapeHtml(product.name)}
      </h1>

      <div
        id="productPrice"
        class="product-detail-price"
      >
        ${formatPrice(price)}
      </div>


      ${
        memory.length
          ? renderVariantGroup(
              "Память",
              "memory",
              memory
            )
          : ""
      }


      ${
        colors.length
          ? renderVariantGroup(
              "Цвет",
              "color",
              colors
            )
          : ""
      }


      ${
        countries.length
          ? renderVariantGroup(
              "Страна",
              "country",
              countries
            )
          : ""
      }


      ${
        sims.length
          ? renderVariantGroup(
              "SIM",
              "sim",
              sims
            )
          : ""
      }


      <div class="product-actions">

        <button
          id="bookProductButton"
          class="primary-button"
          type="button"
        >
          Забронировать
        </button>

        <button
          id="consultProductButton"
          class="secondary-button"
          type="button"
        >
          Проконсультироваться
        </button>

      </div>

    </div>
  `;

  bindVariantButtons();

  $("bookProductButton")
    ?.addEventListener(
      "click",
      bookCurrentProduct
    );

  $("consultProductButton")
    ?.addEventListener(
      "click",
      consultCurrentProduct
    );
}

function renderVariantGroup(
  title,
  field,
  values
) {
  return `
    <div
      class="variant-group"
      data-variant-group="${escapeHtml(field)}"
    >

      <div class="variant-title">
        ${escapeHtml(title)}
      </div>

      <div class="variant-options">

        ${values
          .map((value) => {
            const active =
              state.selected[field] ===
              value;

            return `
              <button
                class="variant-option ${
                  active ? "active" : ""
                }"
                type="button"
                data-variant-field="${escapeHtml(field)}"
                data-variant-value="${escapeHtml(value)}"
              >
                ${escapeHtml(value)}
              </button>
            `;
          })
          .join("")}

      </div>

    </div>
  `;
}

function bindVariantButtons() {
  productContent
    .querySelectorAll(
      "[data-variant-field]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const field =
            button.dataset.variantField;

          const value =
            button.dataset.variantValue;

          state.selected[field] =
            value;

          updateVariantUI();
        }
      );
    });
}

function updateVariantUI() {
  productContent
    .querySelectorAll(
      "[data-variant-field]"
    )
    .forEach((button) => {
      const field =
        button.dataset.variantField;

      const value =
        button.dataset.variantValue;

      button.classList.toggle(
        "active",
        state.selected[field] === value
      );
    });

  const product =
    state.currentProduct;

  if (!product) return;

  const price =
    calculateCurrentPrice(product);

  const priceElement =
    $("productPrice");

  if (priceElement) {
    priceElement.textContent =
      formatPrice(price);
  }
}


/* =========================
   TELEGRAM CONTACT
========================= */

function openTelegramWithMessage(message) {
  const username = "iroom_24";

  const url =
    `https://t.me/${username}?text=${encodeURIComponent(
      message
    )}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }
}


/* =========================
   BOOKING
========================= */

function bookCurrentProduct() {
  const product =
    state.currentProduct;

  if (!product) return;

  const variant =
    findSelectedVariant(product);

  const price =
    calculateCurrentPrice(product);

  const parts = [];

  if (state.selected.memory) {
    parts.push(
      state.selected.memory
    );
  }

  if (state.selected.color) {
    parts.push(
      state.selected.color
    );
  }

  if (state.selected.country) {
    parts.push(
      state.selected.country
    );
  }

  if (state.selected.sim) {
    parts.push(
      state.selected.sim
    );
  }

  const variantText =
    parts.length
      ? ` ${parts.join(" ")}`
      : "";

  const message =
    `Здравствуйте! Хочу забронировать ${product.name}${variantText} — ${formatPrice(price)}`;

  openTelegramWithMessage(message);
}


/* =========================
   CONSULTATION
========================= */

function consultCurrentProduct() {
  const product =
    state.currentProduct;

  if (!product) return;

  const parts = [];

  if (state.selected.memory) {
    parts.push(
      `Память: ${state.selected.memory}`
    );
  }

  if (state.selected.color) {
    parts.push(
      `Цвет: ${state.selected.color}`
    );
  }

  if (state.selected.country) {
    parts.push(
      `Страна: ${state.selected.country}`
    );
  }

  if (state.selected.sim) {
    parts.push(
      `SIM: ${state.selected.sim}`
    );
  }

  const message =
    [
      `Здравствуйте! Хочу проконсультироваться по товару: ${product.name}.`,
      parts.length
        ? parts.join("\n")
        : "",
      `Цена: ${formatPrice(
        calculateCurrentPrice(product)
      )}`
    ]
      .filter(Boolean)
      .join("\n");

  openTelegramWithMessage(message);
}


/* =========================
   SEARCH
========================= */

function openSearch() {
  if (!searchPanel) return;

  searchPanel.hidden = false;

  setTimeout(() => {
    searchInput?.focus();
  }, 50);
}

function closeSearch() {
  if (!searchPanel) return;

  searchPanel.hidden = true;

  if (searchInput) {
    searchInput.value = "";
  }

  state.searchQuery = "";

  renderProducts();
}

$("searchButton")
  ?.addEventListener(
    "click",
    openSearch
  );

$("searchClose")
  ?.addEventListener(
    "click",
    closeSearch
  );

searchInput
  ?.addEventListener(
    "input",
    () => {
      state.searchQuery =
        searchInput.value || "";

      renderProducts();
    }
  );


/* =========================
   NAVIGATION
========================= */

$("logoButton")
  ?.addEventListener(
    "click",
    () => {
      showHome();
    }
  );

$("productBack")
  ?.addEventListener(
    "click",
    () => {
      showHome();
    }
  );

function showHome() {
  state.currentProduct = null;

  productPage.hidden = true;
  adminPage.hidden = true;
  homePage.hidden = false;

  if ($("storeFooter")) {
    $("storeFooter").hidden = false;
  }

  if (adminButton) {
    adminButton.hidden =
      !state.admin;
  }

  window.scrollTo({
    top: 0,
    behavior: "instant"
  });
}


/* =========================
   ADMIN CHECK
========================= */

async function checkAdmin() {
  try {
    const response =
      await api("/api/admin/me");

    state.admin =
      Boolean(
        response?.admin ??
        response?.isAdmin ??
        response?.authorized
      );

  } catch {
    state.admin = false;
  }

  if (adminButton) {
    adminButton.hidden =
      !state.admin;
  }
}


/* =========================
   ADMIN OPEN
========================= */

adminButton
  ?.addEventListener(
    "click",
    () => {
      if (!state.admin) return;

      homePage.hidden = true;
      productPage.hidden = true;
      adminPage.hidden = false;

      if ($("storeFooter")) {
        $("storeFooter").hidden = true;
      }

      adminButton.hidden = true;

      if (
        window.IRoomAdmin &&
        typeof window.IRoomAdmin.open ===
          "function"
      ) {
        window.IRoomAdmin.open();
      }
    }
  );


$("adminBackButton")
  ?.addEventListener(
    "click",
    () => {
      if (
        window.IRoomAdmin &&
        typeof window.IRoomAdmin.close ===
          "function"
      ) {
        window.IRoomAdmin.close();
      }

      showHome();
    }
  );


/* =========================
   KEYBOARD
========================= */

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape") {
      if (
        searchPanel &&
        !searchPanel.hidden
      ) {
        closeSearch();
        return;
      }

      if (
        productPage &&
        !productPage.hidden
      ) {
        showHome();
      }
    }
  }
);


/* =========================
   START
========================= */

loadStore();