const tg = window.Telegram?.WebApp || null;

const state = {
  products: [],
  categories: [],
  currentProduct: null,
  selectedVariant: null,
  selected: {
    color: "",
    memory: "",
    country: "",
    sim_type: ""
  },
  searchQuery: "",
  activeCategory: null
};

const $ = (id) => document.getElementById(id);

function initTelegram() {
  if (!tg) return;

  try {
    tg.ready();
    tg.expand();

    if (tg.setHeaderColor) {
      tg.setHeaderColor("#08080a");
    }

    if (tg.setBackgroundColor) {
      tg.setBackgroundColor("#08080a");
    }
  } catch {}
}

function initData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const init = {
    ...options,
    headers
  };

  if (initData()) {
    headers["x-telegram-init-data"] = initData();
  }

  const response = await fetch(url, init);

  let data = {};

  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data?.error ||
      `HTTP ${response.status}`
    );
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(price, currency = "RUB") {
  const value = Number(price);

  if (!Number.isFinite(value)) {
    return "—";
  }

  const symbols = {
    RUB: "₽",
    USD: "$",
    EUR: "€"
  };

  const symbol =
    symbols[currency] || currency || "";

  return `${new Intl.NumberFormat("ru-RU").format(value)} ${symbol}`;
}

function imageUrl(product) {
  if (!product) return "";

  if (product.image_url) {
    return product.image_url;
  }

  if (product.image_id) {
    return `/api/images/${encodeURIComponent(product.image_id)}`;
  }

  return "";
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function openTelegramLink(url) {
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return;
  }

  window.open(url, "_blank");
}

function openExternalLink(url) {
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }

  window.open(url, "_blank");
}

/* =========================================================
   NAVIGATION
========================================================= */

function showHome() {
  $("productPage")?.classList.add("hidden");
  $("homePage")?.classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  state.currentProduct = null;
  state.selectedVariant = null;
}

function showProductPage(product) {
  if (!product) return;

  state.currentProduct = product;
  state.selectedVariant = null;

  state.selected = {
    color: "",
    memory: "",
    country: "",
    sim_type: ""
  };

  $("homePage")?.classList.add("hidden");
  $("productPage")?.classList.remove("hidden");

  renderProductPage();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function openProductById(id) {
  const product = state.products.find(
    (item) => String(item.id) === String(id)
  );

  if (!product) return;

  showProductPage(product);
}

/* =========================================================
   IMAGE
========================================================= */

function renderProductImage(product) {
  const img = $("productImage");
  const placeholder = $("productImagePlaceholder");

  if (!img || !placeholder) return;

  const url = imageUrl(product);

  if (url) {
    img.src = url;
    img.alt = product.name || "IRoom";
    img.classList.remove("hidden");
    placeholder.classList.add("hidden");

    img.onerror = () => {
      img.classList.add("hidden");
      placeholder.classList.remove("hidden");
    };
  } else {
    img.removeAttribute("src");
    img.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }
}

/* =========================================================
   PRODUCT CARDS
========================================================= */

function getProductMinPrice(product) {
  const variants = (product.variants || [])
    .filter((variant) => variant.active !== false);

  if (!variants.length) {
    return null;
  }

  return variants.reduce(
    (lowest, variant) => {
      const price = Number(variant.price);

      if (!Number.isFinite(price)) {
        return lowest;
      }

      if (!lowest || price < lowest.price) {
        return {
          price,
          currency: variant.currency || "RUB"
        };
      }

      return lowest;
    },
    null
  );
}

function productCard(product, compact = false) {
  const price = getProductMinPrice(product);
  const image = imageUrl(product);

  const cardClass = compact
    ? "product-card product-card-compact"
    : "product-card";

  return `
    <article
      class="${cardClass}"
      data-product-id="${escapeHtml(product.id)}"
    >

      <button
        class="product-card-button"
        type="button"
        data-open-product="${escapeHtml(product.id)}"
      >

        <div class="product-card-image-wrap">

          ${
            image
              ? `
                <img
                  class="product-card-image"
                  src="${escapeHtml(image)}"
                  alt="${escapeHtml(product.name)}"
                  loading="lazy"
                >
              `
              : `
                <div class="product-card-placeholder">
                  IRoom
                </div>
              `
          }

          ${
            product.is_new
              ? `
                <span class="product-new-badge">
                  Новинка
                </span>
              `
              : ""
          }

        </div>

        <div class="product-card-content">

          ${
            product.category_name
              ? `
                <div class="product-card-category">
                  ${escapeHtml(product.category_name)}
                </div>
              `
              : ""
          }

          <h3 class="product-card-name">
            ${escapeHtml(product.name)}
          </h3>

          <div class="product-card-bottom">

            <span class="product-card-price">
              ${
                price
                  ? `от ${formatPrice(
                      price.price,
                      price.currency
                    )}`
                  : "Цена уточняется"
              }
            </span>

            <span class="product-card-arrow">
              →
            </span>

          </div>

        </div>

      </button>

    </article>
  `;
}

/* =========================================================
   NEW PRODUCTS
========================================================= */

function renderNewProducts() {
  const container = $("newProducts");

  if (!container) return;

  const products = state.products.filter(
    (product) => product.is_new
  );

  if (!products.length) {
    container.innerHTML = `
      <div class="carousel-empty">
        Скоро здесь появятся новые товары.
      </div>
    `;

    return;
  }

  container.innerHTML = products
    .map((product) => productCard(product, true))
    .join("");

  bindProductButtons(container);
}

/* =========================================================
   CATEGORIES
========================================================= */

function renderCategories() {
  const container = $("categories");

  if (!container) return;

  const allButton = `
    <button
      class="category-chip ${
        !state.activeCategory
          ? "active"
          : ""
      }"
      type="button"
      data-category=""
    >
      Все
    </button>
  `;

  const categories = state.categories
    .map(
      (category) => `
        <button
          class="category-chip ${
            state.activeCategory === category.id
              ? "active"
              : ""
          }"
          type="button"
          data-category="${escapeHtml(category.id)}"
        >
          ${escapeHtml(category.name)}
        </button>
      `
    )
    .join("");

  container.innerHTML =
    allButton + categories;

  container
    .querySelectorAll("[data-category]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset.category || null;

          state.activeCategory = id;

          renderCategories();
          renderCatalog();

          $("catalogSection")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      );
    });
}

/* =========================================================
   CATALOG
========================================================= */

function getVisibleProducts() {
  let products = [...state.products];

  if (state.activeCategory) {
    products = products.filter(
      (product) =>
        String(product.category_id) ===
        String(state.activeCategory)
    );
  }

  const query =
    state.searchQuery
      .trim()
      .toLowerCase();

  if (query) {
    products = products.filter((product) => {
      const haystack = [
        product.name,
        product.description,
        product.category_name,
        ...(product.variants || []).flatMap(
          (variant) => [
            variant.memory,
            variant.color,
            variant.country,
            variant.sim_type
          ]
        )
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  return products;
}

function renderCatalog() {
  const container = $("catalog");
  const count = $("catalogCount");
  const empty = $("emptyState");

  if (!container) return;

  const products =
    getVisibleProducts();

  if (count) {
    count.textContent =
      products.length
        ? `${products.length}`
        : "";
  }

  if (!products.length) {
    container.innerHTML = "";

    empty?.classList.remove("hidden");

    return;
  }

  empty?.classList.add("hidden");

  container.innerHTML =
    products
      .map((product) =>
        productCard(product)
      )
      .join("");

  bindProductButtons(container);
}

/* =========================================================
   SEARCH
========================================================= */

function openSearch() {
  const searchBox = $("searchBox");

  if (!searchBox) return;

  searchBox.classList.add("active");

  setTimeout(() => {
    $("searchInput")?.focus();
  }, 50);
}

function closeSearch() {
  const searchBox = $("searchBox");

  if (!searchBox) return;

  searchBox.classList.remove("active");
}

function performSearch(value) {
  state.searchQuery = value || "";

  const hasQuery =
    state.searchQuery.trim().length > 0;

  $("searchResultsSection")
    ?.classList.toggle(
      "hidden",
      !hasQuery
    );

  if (hasQuery) {
    const results =
      getVisibleProducts();

    const container =
      $("searchResults");

    if (container) {
      container.innerHTML =
        results.length
          ? results
              .map((product) =>
                productCard(product)
              )
              .join("")
          : "";

      bindProductButtons(container);
    }

    $("newSection")
      ?.classList.toggle(
        "hidden",
        hasQuery
      );

    $("categoriesSection")
      ?.classList.toggle(
        "hidden",
        hasQuery
      );

    $("catalogSection")
      ?.classList.toggle(
        "hidden",
        hasQuery
      );

    $("emptyState")
      ?.classList.toggle(
        "hidden",
        results.length > 0
      );

    return;
  }

  $("newSection")
    ?.classList.remove("hidden");

  $("categoriesSection")
    ?.classList.remove("hidden");

  $("catalogSection")
    ?.classList.remove("hidden");

  renderCatalog();
}

/* =========================================================
   PRODUCT BUTTONS
========================================================= */

function bindProductButtons(container) {
  container
    .querySelectorAll("[data-open-product]")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          openProductById(
            button.dataset.openProduct
          );
        }
      );
    });
}

/* =========================================================
   VARIANT OPTIONS
========================================================= */

function uniqueValues(variants, key) {
  const values = [];

  for (const variant of variants) {
    if (variant.active === false) {
      continue;
    }

    const value =
      String(variant[key] || "").trim();

    if (
      value &&
      !values.includes(value)
    ) {
      values.push(value);
    }
  }

  return values;
}

function getActiveVariants() {
  return (state.currentProduct?.variants || [])
    .filter(
      (variant) =>
        variant.active !== false
    );
}

function selectedMatchesVariant(
  variant,
  key
) {
  const selected =
    state.selected[key];

  if (!selected) {
    return true;
  }

  return String(variant[key] || "") ===
    String(selected);
}

function variantCanBeSelected(
  variant,
  key,
  value
) {
  if (variant.active === false) {
    return false;
  }

  const keys = [
    "color",
    "memory",
    "country",
    "sim_type"
  ];

  return keys.every((otherKey) => {
    if (otherKey === key) {
      return String(
        variant[otherKey] || ""
      ) === String(value);
    }

    const selected =
      state.selected[otherKey];

    if (!selected) {
      return true;
    }

    return (
      String(
        variant[otherKey] || ""
      ) === String(selected)
    );
  });
}

function findMatchingVariant() {
  const variants =
    getActiveVariants();

  if (!variants.length) {
    return null;
  }

  return (
    variants.find((variant) => {
      return [
        "color",
        "memory",
        "country",
        "sim_type"
      ].every((key) => {
        const selected =
          state.selected[key];

        if (!selected) {
          return true;
        }

        return (
          String(
            variant[key] || ""
          ) === String(selected)
        );
      });
    }) || null
  );
}

function ensureValidSelections() {
  const variants =
    getActiveVariants();

  const keys = [
    "color",
    "memory",
    "country",
    "sim_type"
  ];

  for (const key of keys) {
    const selected =
      state.selected[key];

    if (!selected) {
      continue;
    }

    const stillPossible =
      variants.some((variant) =>
        variantCanBeSelected(
          variant,
          key,
          selected
        )
      );

    if (!stillPossible) {
      state.selected[key] = "";
    }
  }

  const exact =
    findMatchingVariant();

  if (exact) {
    state.selectedVariant = exact;
  } else {
    state.selectedVariant = null;
  }
}

function renderOptionGroup({
  selectorId,
  optionsId,
  selectedId,
  key
}) {
  const selector =
    $(selectorId);

  const optionsContainer =
    $(optionsId);

  const selectedText =
    $(selectedId);

  if (
    !selector ||
    !optionsContainer ||
    !selectedText
  ) {
    return;
  }

  const variants =
    getActiveVariants();

  const values =
    uniqueValues(
      variants,
      key
    );

  if (!values.length) {
    selector.classList.add("hidden");
    return;
  }

  selector.classList.remove("hidden");

  selectedText.textContent =
    state.selected[key] || "";

  optionsContainer.innerHTML =
    values
      .map((value) => {
        const active =
          state.selected[key] === value;

        const possible =
          variants.some((variant) =>
            variantCanBeSelected(
              variant,
              key,
              value
            )
          );

        return `
          <button
            class="variant-option ${
              active ? "active" : ""
            } ${
              possible ? "" : "disabled"
            }"
            type="button"
            data-variant-key="${escapeHtml(key)}"
            data-variant-value="${escapeHtml(value)}"
            ${possible ? "" : "disabled"}
          >
            ${escapeHtml(value)}
          </button>
        `;
      })
      .join("");

  optionsContainer
    .querySelectorAll(
      "[data-variant-key]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const optionKey =
            button.dataset.variantKey;

          const value =
            button.dataset.variantValue;

          state.selected[optionKey] =
            value;

          ensureValidSelections();

          renderVariantSelectors();
          renderSelectedVariant();
        }
      );
    });
}

function renderVariantSelectors() {
  renderOptionGroup({
    selectorId: "colorSelector",
    optionsId: "colorOptions",
    selectedId: "selectedColor",
    key: "color"
  });

  renderOptionGroup({
    selectorId: "memorySelector",
    optionsId: "memoryOptions",
    selectedId: "selectedMemory",
    key: "memory"
  });

  renderOptionGroup({
    selectorId: "countrySelector",
    optionsId: "countryOptions",
    selectedId: "selectedCountry",
    key: "country"
  });

  renderOptionGroup({
    selectorId: "simSelector",
    optionsId: "simOptions",
    selectedId: "selectedSim",
    key: "sim_type"
  });
}

/* =========================================================
   SELECT DEFAULT VARIANT
========================================================= */

function selectInitialVariant() {
  const variants =
    getActiveVariants();

  if (!variants.length) {
    state.selectedVariant = null;
    return;
  }

  const first = variants[0];

  const keys = [
    "color",
    "memory",
    "country",
    "sim_type"
  ];

  for (const key of keys) {
    if (first[key]) {
      state.selected[key] =
        first[key];
    }
  }

  state.selectedVariant =
    first;
}

/* =========================================================
   PRODUCT PAGE
========================================================= */

function renderProductPage() {
  const product =
    state.currentProduct;

  if (!product) return;

  renderProductImage(product);

  const category =
    $("productCategory");

  if (category) {
    category.textContent =
      product.category_name || "";
  }

  const name =
    $("productName");

  if (name) {
    name.textContent =
      product.name || "";
  }

  const description =
    $("productMeta");

  if (description) {
    description.textContent =
      product.description || "";
    description.classList.toggle(
      "hidden",
      !product.description
    );
  }

  selectInitialVariant();

  renderVariantSelectors();
  renderSelectedVariant();
}

function renderSelectedVariant() {
  const variant =
    state.selectedVariant;

  const price =
    $("productPrice");

  const stock =
    $("productStock");

  if (!variant) {
    if (price) {
      price.textContent =
        "Выберите конфигурацию";
    }

    if (stock) {
      stock.textContent = "";
    }

    return;
  }

  if (price) {
    price.textContent =
      formatPrice(
        variant.price,
        variant.currency
      );
  }

  if (stock) {
    if (Number(variant.stock) > 0) {
      stock.textContent =
        `В наличии: ${variant.stock} шт.`;
      stock.classList.remove(
        "out-of-stock"
      );
    } else {
      stock.textContent =
        "Нет в наличии";
      stock.classList.add(
        "out-of-stock"
      );
    }
  }
}

function getVariantConfiguration(
  variant
) {
  if (!variant) return "";

  const parts = [
    variant.memory,
    variant.color,
    variant.country,
    variant.sim_type
  ].filter(Boolean);

  return parts.join(" · ");
}

/* =========================================================
   MESSAGE MODAL
========================================================= */

function openMessageModal({
  title,
  text,
  actions = []
}) {
  const modal =
    $("messageModal");

  const titleElement =
    $("messageModalTitle");

  const textElement =
    $("messageModalText");

  const actionsElement =
    $("messageModalActions");

  if (
    !modal ||
    !titleElement ||
    !textElement ||
    !actionsElement
  ) {
    return;
  }

  titleElement.textContent =
    title || "IRoom";

  textElement.textContent =
    text || "";

  actionsElement.innerHTML =
    actions
      .map(
        (action, index) => `
          <button
            type="button"
            class="${
              action.primary
                ? "primary-button"
                : "secondary-button"
            }"
            data-modal-action="${index}"
          >
            ${escapeHtml(action.label)}
          </button>
        `
      )
      .join("");

  actionsElement
    .querySelectorAll(
      "[data-modal-action]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const index =
            Number(
              button.dataset.modalAction
            );

          actions[index]?.onClick?.();
        }
      );
    });

  modal.classList.remove("hidden");
}

function closeMessageModal() {
  $("messageModal")
    ?.classList.add("hidden");
}

/* =========================================================
   BOOKING
========================================================= */

function buildBookingMessage() {
  const product =
    state.currentProduct;

  const variant =
    state.selectedVariant;

  if (!product || !variant) {
    return "";
  }

  const configuration =
    getVariantConfiguration(
      variant
    );

  const price =
    formatPrice(
      variant.price,
      variant.currency
    );

  return [
    "Здравствуйте! Хочу забронировать",
    `${product.name}`,
    configuration
      ? configuration
      : "",
    `— ${price}`
  ]
    .filter(Boolean)
    .join(" ");
}

async function createOrder() {
  const product =
    state.currentProduct;

  const variant =
    state.selectedVariant;

  if (!product || !variant) {
    showToast(
      "Сначала выберите конфигурацию"
    );

    return false;
  }

  try {
    const configuration =
      getVariantConfiguration(
        variant
      );

    await api(
      "/api/orders",
      {
        method: "POST",
        body: JSON.stringify({
          product_id:
            product.id,
          variant_id:
            variant.id,
          product_name:
            product.name,
          configuration,
          price:
            variant.price,
          currency:
            variant.currency || "RUB"
        })
      }
    );

    return true;
  } catch (error) {
    console.error(error);

    return false;
  }
}

async function bookProduct() {
  const product =
    state.currentProduct;

  const variant =
    state.selectedVariant;

  if (!product || !variant) {
    showToast(
      "Выберите конфигурацию"
    );

    return;
  }

  if (Number(variant.stock) <= 0) {
    showToast(
      "Этой конфигурации сейчас нет в наличии"
    );

    return;
  }

  const message =
    buildBookingMessage();

  const sent =
    await createOrder();

  if (!sent) {
    showToast(
      "Не удалось создать заявку"
    );

    return;
  }

  const username =
    "iroom_24";

  const url =
    `https://t.me/${username}?text=${encodeURIComponent(
      message
    )}`;

  openTelegramLink(url);
}

/* =========================================================
   CONSULTATION
========================================================= */

function consultationMessage() {
  const product =
    state.currentProduct;

  const variant =
    state.selectedVariant;

  if (!product) {
    return "";
  }

  const configuration =
    variant
      ? getVariantConfiguration(
          variant
        )
      : "";

  return [
    "Здравствуйте! Хочу проконсультироваться по",
    product.name,
    configuration
      ? `(${configuration})`
      : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function consultProduct() {
  const message =
    consultationMessage();

  if (!message) {
    return;
  }

  const url =
    `https://t.me/iroom_24?text=${encodeURIComponent(
      message
    )}`;

  openTelegramLink(url);
}

/* =========================================================
   AI CONSULTANT
========================================================= */

function openAIConsultant() {
  openMessageModal({
    title: "Консультант IRoom",
    text:
      "Напишите вопрос консультанту — он поможет подобрать товар по реальному каталогу IRoom.",
    actions: [
      {
        label: "Открыть консультанта",
        primary: true,
        onClick: () => {
          closeMessageModal();
          showAIChat();
        }
      }
    ]
  });
}

function showAIChat() {
  const current =
    state.currentProduct;

  const productContext =
    current
      ? `\n\nСейчас смотрю: ${current.name}`
      : "";

  openMessageModal({
    title: "AI-консультант",
    text:
      `Введите вопрос${productContext}`,
    actions: [
      {
        label: "Закрыть",
        primary: false,
        onClick: closeMessageModal
      }
    ]
  });

  const modal =
    $("messageModal");

  if (!modal) return;

  const card =
    modal.querySelector(
      ".modal-card"
    );

  if (!card) return;

  const existing =
    card.querySelector(
      ".ai-chat-form"
    );

  if (existing) return;

  const form =
    document.createElement("form");

  form.className =
    "ai-chat-form";

  form.innerHTML = `
    <textarea
      class="ai-chat-input"
      placeholder="Например: какой iPhone 17 Pro Max есть на 512 ГБ?"
      rows="3"
    ></textarea>

    <button
      class="primary-button"
      type="submit"
    >
      Спросить
    </button>

    <div
      class="ai-chat-answer hidden"
    ></div>
  `;

  card.insertBefore(
    form,
    card.querySelector(
      ".modal-actions"
    )
  );

  const input =
    form.querySelector(
      ".ai-chat-input"
    );

  const answer =
    form.querySelector(
      ".ai-chat-answer"
    );

  form.addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();

      const message =
        input.value.trim();

      if (!message) {
        return;
      }

      const button =
        form.querySelector(
          "button[type=submit]"
        );

      button.disabled = true;
      button.textContent =
        "Думаю…";

      answer.classList.remove(
        "hidden"
      );

      answer.textContent =
        "Ищу информацию в каталоге…";

      try {
        const data =
          await api(
            "/api/ai/chat",
            {
              method: "POST",
              body: JSON.stringify({
                message
              })
            }
          );

        answer.textContent =
          data.answer ||
          "Не удалось получить ответ.";
      } catch (error) {
        answer.textContent =
          error.message ||
          "Консультант временно недоступен.";
      } finally {
        button.disabled = false;
        button.textContent =
          "Спросить";
      }
    }
  );
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadCategories() {
  try {
    const data =
      await api(
        "/api/categories"
      );

    state.categories =
      Array.isArray(
        data.categories
      )
        ? data.categories
        : [];

    renderCategories();
  } catch (error) {
    console.error(
      "Categories load error:",
      error
    );
  }
}

async function loadProducts() {
  try {
    const data =
      await api(
        "/api/products"
      );

    state.products =
      Array.isArray(
        data.products
      )
        ? data.products
        : [];

    renderNewProducts();
    renderCatalog();
  } catch (error) {
    console.error(
      "Products load error:",
      error
    );

    const catalog =
      $("catalog");

    if (catalog) {
      catalog.innerHTML = `
        <div class="catalog-error">
          <h3>
            Не удалось загрузить каталог
          </h3>

          <p>
            Попробуйте открыть магазин ещё раз.
          </p>

          <button
            class="primary-button"
            type="button"
            id="retryCatalog"
          >
            Повторить
          </button>
        </div>
      `;

      $("retryCatalog")
        ?.addEventListener(
          "click",
          loadProducts
        );
    }
  }
}

async function checkAdmin() {
  const button =
    $("adminBottomButton");

  if (!button) return;

  try {
    const data =
      await api(
        "/api/admin/me"
      );

    if (data?.ok) {
      button.classList.remove(
        "hidden"
      );

      button.onclick = () => {
        window.location.href =
          "/admin";
      };
    }
  } catch {
    button.classList.add(
      "hidden"
    );
  }
}

/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  $("storeLogo")
    ?.addEventListener(
      "click",
      () => {
        showHome();

        state.searchQuery = "";
        state.activeCategory = null;

        const input =
          $("searchInput");

        if (input) {
          input.value = "";
        }

        $("searchResultsSection")
          ?.classList.add(
            "hidden"
          );

        renderCategories();
        renderCatalog();
      }
    );

  $("searchButton")
    ?.addEventListener(
      "click",
      openSearch
    );

  $("closeSearch")
    ?.addEventListener(
      "click",
      () => {
        closeSearch();

        const input =
          $("searchInput");

        if (input) {
          input.value = "";
        }

        state.searchQuery = "";

        performSearch("");
      }
    );

  $("searchInput")
    ?.addEventListener(
      "input",
      (event) => {
        performSearch(
          event.target.value
        );
      }
    );

  $("backButton")
    ?.addEventListener(
      "click",
      showHome
    );

  $("bookButton")
    ?.addEventListener(
      "click",
      bookProduct
    );

  $("consultButton")
    ?.addEventListener(
      "click",
      consultProduct
    );

  $("emptyResetButton")
    ?.addEventListener(
      "click",
      () => {
        state.searchQuery = "";
        state.activeCategory = null;

        const input =
          $("searchInput");

        if (input) {
          input.value = "";
        }

        $("searchResultsSection")
          ?.classList.add(
            "hidden"
          );

        renderCategories();
        renderCatalog();
      }
    );

  $("closeMessageModal")
    ?.addEventListener(
      "click",
      closeMessageModal
    );

  $("messageModal")
    ?.addEventListener(
      "click",
      (event) => {
        if (
          event.target.dataset.closeModal ===
          "true"
        ) {
          closeMessageModal();
        }
      }
    );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        closeMessageModal();
      }
    }
  );
}

/* =========================================================
   START
========================================================= */

async function init() {
  initTelegram();

  bindEvents();

  await Promise.all([
    loadCategories(),
    loadProducts(),
    checkAdmin()
  ]);
}

document.addEventListener(
  "DOMContentLoaded",
  init
);