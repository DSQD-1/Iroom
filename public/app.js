(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();

    try {
      tg.setHeaderColor("#070707");
      tg.setBackgroundColor("#070707");

      if (typeof tg.setBottomBarColor === "function") {
        tg.setBottomBarColor("#070707");
      }
    } catch {}
  }

  const state = {
    products: [],
    categories: [],
    currentProduct: null,
    currentCategory: null,
    search: "",
    selected: {
      memory: "",
      color: "",
      country: "",
      sim: ""
    }
  };

  const $ = (selector) => document.querySelector(selector);

  const $$ = (selector) =>
    Array.from(document.querySelectorAll(selector));

  const initData = () => tg?.initData || "";

  async function api(url, options = {}) {
    const headers = {
      "x-telegram-init-data": initData(),
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        `Ошибка ${response.status}`
      );
    }

    return data;
  }

  function esc(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value, currency = "RUB") {
    const number = Number(value || 0);

    try {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: 0
      }).format(number);
    } catch {
      return `${number.toLocaleString("ru-RU")} ₽`;
    }
  }

  function toast(message) {
    let element = $("#toast");

    if (!element) {
      element = document.createElement("div");
      element.id = "toast";
      element.className = "toast";
      document.body.appendChild(element);
    }

    element.textContent = message;
    element.classList.add("show");

    clearTimeout(element._timer);

    element._timer = setTimeout(() => {
      element.classList.remove("show");
    }, 2400);
  }

  function setLoading(show) {
    const loader = $("#loader");

    if (loader) {
      loader.hidden = !show;
    }
  }

  function haptic() {
    try {
      tg?.HapticFeedback?.impactOccurred("light");
    } catch {}
  }

  function getProductsArray(data) {
    if (Array.isArray(data)) return data;

    return (
      data?.products ||
      data?.items ||
      data?.data ||
      []
    );
  }

  function getCategoriesArray(data) {
    if (Array.isArray(data)) return data;

    return (
      data?.categories ||
      data?.items ||
      data?.data ||
      []
    );
  }

  function getVariants(product) {
    if (Array.isArray(product?.variants)) {
      return product.variants;
    }

    return [];
  }

  function productImage(product) {
    return (
      product?.image_url ||
      product?.image ||
      product?.cover_url ||
      ""
    );
  }

  function categoryName(product) {
    if (product?.category_name) {
      return product.category_name;
    }

    const category = state.categories.find(
      (item) =>
        String(item.id) === String(product?.category_id)
    );

    return category?.name || "";
  }

  async function loadCategories() {
    const data = await api("/api/categories");

    state.categories = getCategoriesArray(data);

    renderCategories();
  }

  async function loadProducts() {
    const params = new URLSearchParams();

    if (state.currentCategory) {
      params.set(
        "category",
        state.currentCategory
      );
    }

    if (state.search) {
      params.set("search", state.search);
    }

    const query = params.toString();

    const data = await api(
      `/api/products${query ? `?${query}` : ""}`
    );

    state.products = getProductsArray(data);

    renderProducts();
  }

  function renderCategories() {
    const container =
      $("#categories");

    if (!container) return;

    const all = `
      <button
        class="category-chip ${
          !state.currentCategory ? "active" : ""
        }"
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
              String(state.currentCategory) ===
              String(category.id)
                ? "active"
                : ""
            }"
            data-category="${esc(category.id)}"
          >
            ${esc(category.name)}
          </button>
        `
      )
      .join("");

    container.innerHTML = all + categories;

    $$("#categories [data-category]").forEach(
      (button) => {
        button.addEventListener("click", async () => {
          haptic();

          state.currentCategory =
            button.dataset.category || null;

          await loadProducts();
        });
      }
    );
  }

  function renderProducts() {
    const catalog =
      $("#catalog");

    if (!catalog) return;

    const products = state.products.filter(
      (product) =>
        product.active !== false
    );

    if (!products.length) {
      catalog.innerHTML = `
        <div class="empty-state">
          <strong>Товаров пока нет</strong>
          <br>
          <span>
            Попробуй изменить поиск или категорию.
          </span>
        </div>
      `;
    } else {
      catalog.innerHTML = products
        .map(productCard)
        .join("");
    }

    bindProductCards();

    renderNewProducts(products);
  }

  function productCard(product) {
    const image = productImage(product);
    const variants = getVariants(product);

    const firstVariant =
      variants.find(
        (variant) =>
          variant.active !== false
      ) || variants[0];

    const price =
      firstVariant?.price ??
      product.price ??
      0;

    const currency =
      firstVariant?.currency ||
      product.currency ||
      "RUB";

    return `
      <article
        class="product-card"
        data-product-id="${esc(product.id)}"
      >

        <div class="product-image ${
          image ? "" : "placeholder"
        }">

          ${
            image
              ? `
                <img
                  src="${esc(image)}"
                  alt="${esc(product.name || "")}"
                  loading="lazy"
                />
              `
              : "IR"
          }

          ${
            product.is_new
              ? `<span class="new-badge">Новинка</span>`
              : ""
          }

        </div>

        <div class="product-card-body">

          ${
            categoryName(product)
              ? `
                <div class="product-card-category">
                  ${esc(categoryName(product))}
                </div>
              `
              : ""
          }

          <div class="product-card-name">
            ${esc(product.name || "Товар")}
          </div>

          <div class="product-card-price">
            ${money(price, currency)}
          </div>

        </div>

      </article>
    `;
  }

  function renderNewProducts(products) {
    const container =
      $("#newProducts");

    if (!container) return;

    const newest = products
      .filter((product) => product.is_new)
      .slice(0, 12);

    if (!newest.length) {
      const fallback = products.slice(0, 8);

      container.innerHTML = fallback
        .map(productCard)
        .join("");
    } else {
      container.innerHTML = newest
        .map(productCard)
        .join("");
    }

    bindProductCards();
  }

  function bindProductCards() {
    $$(".product-card").forEach(
      (card) => {
        card.onclick = () => {
          const id =
            card.dataset.productId;

          openProduct(id);
        };
      }
    );
  }

  async function openProduct(id) {
    haptic();
    setLoading(true);

    try {
      const data = await api(
        `/api/products/${encodeURIComponent(id)}`
      );

      const product =
        data?.product ||
        data;

      state.currentProduct = product;

      state.selected = {
        memory: "",
        color: "",
        country: "",
        sim: ""
      };

      showProductPage();
      renderProduct();

      window.scrollTo({
        top: 0,
        behavior: "instant"
      });
    } catch (error) {
      console.error(error);
      toast(
        error.message ||
        "Не удалось открыть товар"
      );
    } finally {
      setLoading(false);
    }
  }

  function showHome() {
    const home = $("#homePage");
    const product = $("#productPage");
    const admin = $("#adminPage");

    if (admin) {
      admin.hidden = true;
    }

    if (home) {
      home.hidden = false;
    }

    if (product) {
      product.hidden = true;
    }

    document
      .querySelector(".footer")
      ?.removeAttribute("hidden");

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
  }

  function showProductPage() {
    const home = $("#homePage");
    const product = $("#productPage");
    const admin = $("#adminPage");

    if (home) {
      home.hidden = true;
    }

    if (admin) {
      admin.hidden = true;
    }

    if (product) {
      product.hidden = false;
    }

    document
      .querySelector(".footer")
      ?.removeAttribute("hidden");
  }

  function renderProduct() {
    const product =
      state.currentProduct;

    const container =
      $("#productContent");

    if (!product || !container) {
      return;
    }

    const image =
      productImage(product);

    const variants =
      getVariants(product).filter(
        (variant) =>
          variant.active !== false
      );

    const memories =
      uniqueValues(
        variants,
        "memory"
      );

    const colors =
      uniqueValues(
        variants,
        "color"
      );

    const countries =
      uniqueValues(
        variants,
        "country"
      );

    const sims =
      uniqueValues(
        variants,
        "sim"
      );

    container.innerHTML = `
      <div class="product-detail">

        <button
          class="back-button"
          id="productBack"
        >
          <span>‹</span>
          Назад
        </button>

        <div class="product-detail-image ${
          image ? "" : "product-placeholder"
        }">

          ${
            image
              ? `
                <img
                  src="${esc(image)}"
                  alt="${esc(product.name || "")}"
                />
              `
              : `
                <div
                  style="
                    color:#ff4f9a;
                    font-size:40px;
                    font-weight:800;
                  "
                >
                  IR
                </div>
              `
          }

        </div>

        <div class="product-detail-info">

          ${
            categoryName(product)
              ? `
                <div class="product-detail-category">
                  ${esc(categoryName(product))}
                </div>
              `
              : ""
          }

          <h1>
            ${esc(product.name || "Товар")}
          </h1>

          ${
            product.description
              ? `
                <div class="product-description">
                  ${esc(product.description)}
                </div>
              `
              : ""
          }

          ${variantBlock(
            "Память",
            "memory",
            memories
          )}

          ${variantBlock(
            "Цвет",
            "color",
            colors
          )}

          ${variantBlock(
            "Страна",
            "country",
            countries
          )}

          ${variantBlock(
            "SIM",
            "sim",
            sims
          )}

          <div
            class="product-current-price"
            id="currentProductPrice"
          >
            ${getCurrentPrice()}
          </div>

          <div class="product-actions">

            <button
              class="primary-button"
              id="bookProduct"
            >
              Забронировать
            </button>

            <button
              class="secondary-button"
              id="consultProduct"
            >
              Проконсультироваться
            </button>

          </div>

        </div>

      </div>
    `;

    $("#productBack")?.addEventListener(
      "click",
      showHome
    );

    $$(".variant-button").forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            const type =
              button.dataset.variantType;

            const value =
              button.dataset.variantValue;

            state.selected[type] = value;

            renderProduct();
          }
        );
      }
    );

    $("#bookProduct")?.addEventListener(
      "click",
      () => openBooking(false)
    );

    $("#consultProduct")?.addEventListener(
      "click",
      () => openBooking(true)
    );
  }

  function uniqueValues(
    variants,
    key
  ) {
    return [
      ...new Set(
        variants
          .map((variant) =>
            String(variant?.[key] || "").trim()
          )
          .filter(Boolean)
      )
    ];
  }

  function variantBlock(
    label,
    type,
    values
  ) {
    if (!values.length) {
      return "";
    }

    return `
      <div class="variant-section">

        <div class="variant-label">
          ${label}
        </div>

        <div class="variant-options">

          ${values
            .map(
              (value) => `
                <button
                  class="variant-button ${
                    state.selected[type] === value
                      ? "active"
                      : ""
                  }"
                  data-variant-type="${type}"
                  data-variant-value="${esc(value)}"
                >
                  ${esc(value)}
                </button>
              `
            )
            .join("")}

        </div>

      </div>
    `;
  }

  function selectedVariant() {
    const product =
      state.currentProduct;

    const variants =
      getVariants(product).filter(
        (variant) =>
          variant.active !== false
      );

    if (!variants.length) {
      return null;
    }

    let matching =
      variants.filter((variant) => {
        return Object.entries(
          state.selected
        ).every(([key, value]) => {
          if (!value) return true;

          return String(
            variant?.[key] || ""
          ) === String(value);
        });
      });

    if (!matching.length) {
      matching = variants;
    }

    return matching[0] || null;
  }

  function getCurrentPrice() {
    const product =
      state.currentProduct;

    const variant =
      selectedVariant();

    const price =
      variant?.price ??
      product?.price ??
      0;

    const currency =
      variant?.currency ||
      product?.currency ||
      "RUB";

    return money(price, currency);
  }

  function openBooking(consultation) {
    const product =
      state.currentProduct;

    if (!product) return;

    const variant =
      selectedVariant();

    const price =
      variant?.price ??
      product.price ??
      0;

    const currency =
      variant?.currency ||
      product.currency ||
      "RUB";

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

    const configuration =
      parts.join(" ");

    let text;

    if (consultation) {
      text =
        `Здравствуйте! Хочу проконсультироваться по ${product.name}` +
        (configuration
          ? ` ${configuration}`
          : "") +
        `.`;
    } else {
      text =
        `Здравствуйте! Хочу забронировать ${product.name}` +
        (configuration
          ? ` ${configuration}`
          : "") +
        ` — ${money(price, currency)}.`;
    }

    const url =
      `https://t.me/iroom_24?text=${encodeURIComponent(
        text
      )}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(url);
    } else {
      window.location.href = url;
    }
  }

  async function checkAdminButton() {
    const button =
      $("#adminButton");

    if (!button) return;

    try {
      const result =
        await api("/api/admin/me");

      const isAdmin =
        Boolean(result?.isAdmin);

      button.hidden = !isAdmin;

      if (isAdmin) {
        button.onclick = async () => {
          haptic();

          if (
            window.IRoomAdmin?.open
          ) {
            await window.IRoomAdmin.open();
          }
        };
      }
    } catch {
      button.hidden = true;
    }
  }

  function setupSearch() {
    const button =
      $("#searchButton");

    const panel =
      $("#searchPanel");

    const input =
      $("#searchInput");

    if (!button || !panel) {
      return;
    }

    button.addEventListener(
      "click",
      () => {
        panel.hidden = !panel.hidden;

        if (!panel.hidden) {
          setTimeout(
            () => input?.focus(),
            50
          );
        }
      }
    );

    input?.addEventListener(
      "input",
      async (event) => {
        state.search =
          event.target.value.trim();

        state.currentCategory = null;

        await loadProducts();
      }
    );
  }

  function setupLogo() {
    $$(".logo").forEach(
      (logo) => {
        logo.addEventListener(
          "click",
          showHome
        );
      }
    );
  }

  function setupBackButtons() {
    $$(".back-button").forEach(
      (button) => {
        if (
          button.id !==
          "productBack"
        ) {
          button.addEventListener(
            "click",
            showHome
          );
        }
      }
    );
  }

  async function init() {
    setLoading(true);

    try {
      setupSearch();
      setupLogo();
      setupBackButtons();

      await Promise.all([
        loadCategories(),
        loadProducts()
      ]);

      await checkAdminButton();
    } catch (error) {
      console.error(error);

      toast(
        error.message ||
        "Не удалось загрузить магазин"
      );
    } finally {
      setLoading(false);
    }
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();