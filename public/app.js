/* =========================================================
   IROOM — PREMIUM TELEGRAM MINI APP FRONTEND
   Visual layer redesigned. API/business logic preserved.
========================================================= */

(() => {
  "use strict";

  const tg = window.Telegram?.WebApp || null;

  const ADMIN_IDS = new Set([
    "5082864281",
    "5975037118"
  ]);

  const state = {
    products: [],
    categories: [],
    banners: [],
    pickupPoints: [],
    config: {},
    orders: [],

    route: "home",
    categoryId: null,
    search: "",

    product: null,
    currentOrder: null,
    selectedOptions: {},

    cart: loadCart(),

    checkout: {
      step: 1,
      name: "",
      contact: "",
      comment: "",
      fulfillment: "pickup",
      pickupPointId: null,
      city: "",
      street: "",
      house: "",
      apartment: "",
      promoCode: "",
      promoDiscount: 0,
      promoChecked: false
    }
  };

  /* =========================================================
     DOM / HELPERS
  ========================================================= */

  const $ = (selector) =>
    document.querySelector(selector);

  const $$ = (selector) =>
    [...document.querySelectorAll(selector)];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function money(value) {
    return `${num(value).toLocaleString("ru-RU")} ₽`;
  }

  function parseJson(value, fallback = null) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return fallback;
    }

    if (typeof value === "object") {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function initData() {
    return String(
      tg?.initData || ""
    );
  }

  function telegramUser() {
    return tg?.initDataUnsafe?.user || null;
  }

  function isAdmin() {
    return ADMIN_IDS.has(
      String(
        telegramUser()?.id || ""
      )
    );
  }

  function imageOf(item) {
    if (item?.image_url) {
      return item.image_url;
    }

    const images =
      parseJson(item?.images, []);

    if (
      Array.isArray(images) &&
      images.length
    ) {
      return images[0];
    }

    return "";
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return String(value);
    }

    return date.toLocaleString(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  }

  /* =========================================================
     CART
  ========================================================= */

  function loadCart() {
    try {
      const value =
        JSON.parse(
          localStorage.getItem(
            "iroom_cart"
          ) || "[]"
        );

      return Array.isArray(value)
        ? value
        : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(
      "iroom_cart",
      JSON.stringify(
        state.cart
      )
    );

    updateCartBadge();
  }

  function cartCount() {
    return state.cart.reduce(
      (sum, item) =>
        sum +
        num(
          item.quantity,
          1
        ),
      0
    );
  }

  function cartSubtotal() {
    return state.cart.reduce(
      (sum, item) =>
        sum +
        num(item.price) *
          num(
            item.quantity,
            1
          ),
      0
    );
  }

  function updateCartBadge() {
    const count =
      cartCount();

    const badge =
      $("#cartBadge");

    const drawerBadge =
      $("#drawerBadge");

    [badge, drawerBadge]
      .forEach((element) => {
        if (!element) return;

        element.textContent =
          count > 99
            ? "99+"
            : String(count);

        element.classList.toggle(
          "hidden",
          count <= 0
        );
      });
  }

  function cartKey(
    productId,
    variantId,
    options
  ) {
    return [
      productId,
      variantId || "",
      JSON.stringify(
        options || {}
      )
    ].join("|");
  }

  function addCartItem(
    product,
    options = {},
    variant = null,
    quantity = 1
  ) {
    const price =
      variant
        ? num(
            variant.price,
            num(product.price)
          )
        : calculateFrontendPrice(
            product,
            options
          );

    const key =
      cartKey(
        product.id,
        variant?.id,
        options
      );

    const existing =
      state.cart.find(
        (item) =>
          item.key === key
      );

    if (existing) {
      existing.quantity +=
        quantity;
    } else {
      state.cart.push({
        key,

        product_id:
          num(product.id),

        product_name:
          product.name,

        image_url:
          imageOf(product),

        variant_id:
          variant
            ? num(variant.id)
            : null,

        variant_text:
          makeVariantText(
            product,
            options,
            variant
          ),

        selected_options:
          options,

        price,

        quantity
      });
    }

    saveCart();

    toast(
      "Товар добавлен в корзину"
    );
  }

  function removeCartItem(key) {
    state.cart =
      state.cart.filter(
        (item) =>
          item.key !== key
      );

    saveCart();

    render();
  }

  function changeQuantity(
    key,
    delta
  ) {
    const item =
      state.cart.find(
        (entry) =>
          entry.key === key
      );

    if (!item) return;

    item.quantity += delta;

    if (item.quantity <= 0) {
      removeCartItem(key);
      return;
    }

    saveCart();

    render();
  }

  /* =========================================================
     API
  ========================================================= */

  async function api(
    url,
    options = {}
  ) {
    const headers = {
      ...(options.headers || {})
    };

    const data =
      initData();

    if (data) {
      headers[
        "x-telegram-init-data"
      ] = data;
    }

    let body =
      options.body;

    if (
      body &&
      typeof body !== "string"
    ) {
      headers[
        "Content-Type"
      ] =
        "application/json";

      body =
        JSON.stringify(body);
    }

    const response =
      await fetch(url, {
        ...options,
        headers,
        body
      });

    let result = {};

    try {
      result =
        await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        result?.error ||
        result?.message ||
        `Ошибка ${response.status}`
      );
    }

    return result;
  }

  /* =========================================================
     TELEGRAM
  ========================================================= */

  function initTelegram() {
    if (!tg) return;

    try {
      tg.ready();
      tg.expand();

      tg.setHeaderColor(
        "#070707"
      );

      tg.setBackgroundColor(
        "#070707"
      );

      if (
        typeof tg.disableVerticalSwipes ===
        "function"
      ) {
        tg.disableVerticalSwipes();
      }
    } catch {}
  }

  /* =========================================================
     TOAST
  ========================================================= */

  let toastTimer;

  function toast(message) {
    const element =
      $("#toast");

    if (!element) return;

    element.textContent =
      String(message || "");

    element.classList.add(
      "show"
    );

    clearTimeout(
      toastTimer
    );

    toastTimer =
      setTimeout(
        () => {
          element.classList.remove(
            "show"
          );
        },
        2800
      );
  }

  /* =========================================================
     INITIAL DATA
  ========================================================= */

  async function loadInitialData() {
    const jobs = [
      [
        "categories",
        "/api/categories",
        (data) =>
          Array.isArray(
            data.categories
          )
            ? data.categories
            : []
      ],

      [
        "products",
        "/api/products",
        (data) =>
          Array.isArray(
            data.products
          )
            ? data.products
            : []
      ],

      [
        "banners",
        "/api/banners",
        (data) =>
          Array.isArray(
            data.banners
          )
            ? data.banners
            : []
      ],

      [
        "pickupPoints",
        "/api/pickup-points",
        (data) =>
          Array.isArray(
            data.pickup_points
          )
            ? data.pickup_points
            : []
      ],

      [
        "config",
        "/api/store-config",
        (data) =>
          data || {}
      ]
    ];

    const results =
      await Promise.allSettled(
        jobs.map(
          (job) =>
            api(job[1])
        )
      );

    results.forEach(
      (result, index) => {
        const job =
          jobs[index];

        if (
          result.status ===
          "fulfilled"
        ) {
          state[job[0]] =
            job[2](
              result.value
            );
        } else {
          console.warn(
            "IRoom API:",
            job[1],
            result.reason
          );
        }
      }
    );

    if (
      !state.checkout
        .pickupPointId &&
      state.pickupPoints.length
    ) {
      state.checkout
        .pickupPointId =
        state.pickupPoints[0].id;
    }

    updateContactLinks();
    renderDrawerCategories();
    updateAdminButton();
  }

  async function loadOrders() {
    const data =
      await api(
        "/api/orders"
      );

    state.orders =
      Array.isArray(
        data.orders
      )
        ? data.orders
        : [];
  }

  function updateContactLinks() {
    const manager =
      state.config
        .contact_url ||
      "https://t.me/iroom_24";

    const channel =
      state.config
        .channel_url ||
      "https://t.me/iroom_market";

    const managerLink =
      $("#managerLink");

    const channelLink =
      $("#channelLink");

    if (managerLink) {
      managerLink.href =
        manager;
    }

    if (channelLink) {
      channelLink.href =
        channel;
    }
  }

  function updateAdminButton() {
    const button =
      $("#adminLink");

    if (!button) return;

    button.classList.toggle(
      "hidden",
      !isAdmin()
    );
  }

  /* =========================================================
     ROUTING
  ========================================================= */

  function navigate(
    route,
    options = {}
  ) {
    state.route =
      route;

    if (
      Object.prototype.hasOwnProperty.call(
        options,
        "categoryId"
      )
    ) {
      state.categoryId =
        options.categoryId;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        options,
        "search"
      )
    ) {
      state.search =
        options.search;
    }

    closeDrawer();

    render();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function render() {
    const screen =
      $("#screen");

    if (!screen) return;

    switch (
      state.route
    ) {
      case "catalog":
        renderCatalog(
          screen
        );
        break;

      case "product":
        renderProduct(
          screen
        );
        break;

      case "cart":
        renderCart(
          screen
        );
        break;

      case "checkout":
        renderCheckout(
          screen
        );
        break;

      case "orders":
        renderOrders(
          screen
        );
        break;

      case "order":
        renderOrderDetail(
          screen
        );
        break;

      default:
        renderHome(
          screen
        );
    }

    updateCartBadge();

    bindDynamicEvents();
  }

  /* =========================================================
     HOME
  ========================================================= */

  function bannerMarkup(
    banner
  ) {
    if (!banner) {
      return "";
    }

    return `
      <section class="hero-card">

        ${
          banner.image_url
            ? `
              <img
                src="${escapeHtml(
                  banner.image_url
                )}"
                alt=""
              >
            `
            : ""
        }

        <div class="hero-shade"></div>

        <div class="hero-content">

          <span class="eyebrow">
            IROOM / NEW DROP
          </span>

          <h1>
            ${escapeHtml(
              banner.title ||
              "Техника, которую хочется"
            )}
          </h1>

          <p>
            ${escapeHtml(
              banner.subtitle ||
              "Оригинальные устройства Apple и другая техника с сервисом IRoom."
            )}
          </p>

          <button
            class="pink-button"
            data-action="catalog"
            type="button"
          >
            Смотреть каталог
            <span>→</span>
          </button>

        </div>
      </section>
    `;
  }

  function categoryMarkup(
    category
  ) {
    return `
      <button
        class="category-tile"
        data-category="${escapeHtml(
          category.id
        )}"
        type="button"
      >
        <span class="category-arrow">
          ↗
        </span>

        <strong>
          ${escapeHtml(
            category.name
          )}
        </strong>

        <small>
          Смотреть товары
        </small>
      </button>
    `;
  }

  function productCard(
    product
  ) {
    const image =
      imageOf(product);

    return `
      <article
        class="product-card"
        data-product-id="${escapeHtml(
          product.id
        )}"
      >

        <div class="product-media">

          ${
            num(
              product.is_new
            )
              ? `
                <span class="product-tag">
                  NEW
                </span>
              `
              : ""
          }

          ${
            image
              ? `
                <img
                  src="${escapeHtml(
                    image
                  )}"
                  alt="${escapeHtml(
                    product.name
                  )}"
                  loading="lazy"
                >
              `
              : `
                <div class="no-image">
                  IRoom
                </div>
              `
          }

        </div>

        <div class="product-info">

          <div class="product-name">
            ${escapeHtml(
              product.name
            )}
          </div>

          <div class="product-meta">
            ${escapeHtml(
              product.short_description ||
              product.subtitle ||
              "Оригинальная техника"
            )}
          </div>

          <div class="product-bottom">

            <strong>
              ${money(
                product.price
              )}
            </strong>

            <span class="round-arrow">
              →
            </span>

          </div>

        </div>

      </article>
    `;
  }

  function renderHome(
    screen
  ) {
    const newest =
      state.products.filter(
        (product) =>
          num(
            product.is_new
          ) === 1
      );

    const products =
      (
        newest.length
          ? newest
          : state.products
      ).slice(0, 6);

    const popular =
      state.products.filter(
        (product) =>
          num(
            product.is_popular
          ) === 1
      );

    const popularProducts =
      (
        popular.length
          ? popular
          : state.products.slice(
              0,
              4
            )
      ).slice(0, 4);

    screen.innerHTML = `
      <div class="screen home-screen">

        ${bannerMarkup(
          state.banners[0]
        )}

        <section class="feature-strip">

          <div>
            <b>01</b>
            <span>Оригинал</span>
          </div>

          <div>
            <b>02</b>
            <span>Гарантия</span>
          </div>

          <div>
            <b>03</b>
            <span>Поддержка</span>
          </div>

        </section>

        ${
          state.categories.length
            ? `
              <section class="section">

                <div class="section-head">

                  <div>
                    <span class="eyebrow">
                      EXPLORE
                    </span>

                    <h2>
                      Категории
                    </h2>
                  </div>

                  <button
                    class="text-button"
                    data-action="catalog"
                    type="button"
                  >
                    Все →
                  </button>

                </div>

                <div class="category-grid">
                  ${state.categories
                    .slice(0, 8)
                    .map(
                      categoryMarkup
                    )
                    .join("")}
                </div>

              </section>
            `
            : ""
        }

        <section class="section">

          <div class="section-head">

            <div>
              <span class="eyebrow">
                JUST IN
              </span>

              <h2>
                Новые поступления
              </h2>
            </div>

            <button
              class="text-button"
              data-action="catalog"
              type="button"
            >
              Все →
            </button>

          </div>

          <div class="product-grid">

            ${
              products.length
                ? products
                    .map(
                      productCard
                    )
                    .join("")
                : emptyProducts()
            }

          </div>

        </section>

        ${
          popularProducts.length
            ? `
              <section class="section">

                <div class="section-head">

                  <div>
                    <span class="eyebrow">
                      CURATED
                    </span>

                    <h2>
                      Популярное
                    </h2>
                  </div>

                </div>

                <div class="product-grid">
                  ${popularProducts
                    .map(
                      productCard
                    )
                    .join("")}
                </div>

              </section>
            `
            : ""
        }

        ${managerBlock()}

        ${footerBlock()}

      </div>
    `;
  }

  function emptyProducts() {
    return `
      <div class="empty-card">

        <div class="empty-icon">
          ⌁
        </div>

        <strong>
          Товаров пока нет
        </strong>

        <p>
          Загляните позже —
          каталог обновляется.
        </p>

      </div>
    `;
  }

  function managerBlock() {
    const url =
      state.config.contact_url ||
      "https://t.me/iroom_24";

    return `
      <section class="manager-card">

        <div>

          <span class="eyebrow">
            PERSONAL MANAGER
          </span>

          <h2>
            Нужна помощь<br>
            с выбором?
          </h2>

          <p>
            Напишите менеджеру IRoom —
            подскажем наличие,
            комплектацию и условия.
          </p>

        </div>

        <a
          class="pink-button"
          href="${escapeHtml(
            url
          )}"
          target="_blank"
          rel="noopener"
        >
          Написать
          <span>↗</span>
        </a>

      </section>
    `;
  }

  function footerBlock() {
    return `
      <footer class="app-footer">

        <div class="footer-logo">
          IRoom<span>•</span>
        </div>

        <div>
          Техника. Сервис. Без лишнего.
        </div>

        <div class="footer-links">

          <a
            href="${escapeHtml(
              state.config.channel_url ||
              "https://t.me/iroom_market"
            )}"
            target="_blank"
            rel="noopener"
          >
            Telegram
          </a>

          <a
            href="${escapeHtml(
              state.config.contact_url ||
              "https://t.me/iroom_24"
            )}"
            target="_blank"
            rel="noopener"
          >
            Менеджер
          </a>

        </div>

      </footer>
    `;
  }

  /* =========================================================
     CATALOG
  ========================================================= */

  function renderCatalog(
    screen
  ) {
    let list =
      state.products.slice();

    if (state.categoryId) {
      list =
        list.filter(
          (product) =>
            String(
              product.category_id
            ) ===
              String(
                state.categoryId
              ) ||
            String(
              product.categoryId
            ) ===
              String(
                state.categoryId
              )
        );
    }

    const query =
      state.search
        .trim()
        .toLowerCase();

    if (query) {
      list =
        list.filter(
          (product) =>
            `${product.name || ""} ${
              product.short_description ||
              ""
            } ${
              product.description ||
              ""
            }`
              .toLowerCase()
              .includes(query)
        );
    }

    const title =
      query
        ? `Поиск: ${escapeHtml(
            state.search
          )}`
        : state.categoryId
          ? escapeHtml(
              state.categories.find(
                (category) =>
                  String(
                    category.id
                  ) ===
                  String(
                    state.categoryId
                  )
              )?.name ||
                "Каталог"
            )
          : "Вся техника";

    screen.innerHTML = `
      <div class="screen catalog-screen">

        <div class="page-title">

          <span class="eyebrow">
            CATALOG
          </span>

          <h1>
            ${title}
          </h1>

          <p>
            ${list.length}
            ${
              list.length === 1
                ? "товар"
                : "товаров"
            }
          </p>

        </div>

        <div class="chips">

          <button
            class="chip ${
              !state.categoryId
                ? "active"
                : ""
            }"
            data-category=""
            type="button"
          >
            Все
          </button>

          ${state.categories
            .map(
              (category) => `
                <button
                  class="chip ${
                    String(
                      state.categoryId
                    ) ===
                    String(
                      category.id
                    )
                      ? "active"
                      : ""
                  }"
                  data-category="${escapeHtml(
                    category.id
                  )}"
                  type="button"
                >
                  ${escapeHtml(
                    category.name
                  )}
                </button>
              `
            )
            .join("")}

        </div>

        <div class="catalog-count">

          <span>
            IRoom selection
          </span>

          <b>
            ${list.length}
          </b>

        </div>

        <div class="product-grid">

          ${
            list.length
              ? list
                  .map(
                    productCard
                  )
                  .join("")
              : emptyProducts()
          }

        </div>

        ${managerBlock()}

      </div>
    `;
  }

  /* =========================================================
     PRODUCT OPTIONS
  ========================================================= */

  function normalizeOptions(
    value
  ) {
    const result =
      parseJson(
        value,
        {}
      );

    return result &&
      typeof result ===
        "object" &&
      !Array.isArray(result)
      ? result
      : {};
  }

  function getPriceOptions(
    product
  ) {
    return normalizeOptions(
      product?.options ||
      product?.price_options ||
      product?.variants_options
    );
  }

  function calculateFrontendPrice(
    product,
    options
  ) {
    let price =
      num(
        product.price
      );

    const priceOptions =
      getPriceOptions(
        product
      );

    Object.values(
      priceOptions
    )
      .flat()
      .forEach(
        (option) => {
          if (
            typeof option ===
            "object" &&
            String(
              option.value ??
              option.name
            ) ===
              String(
                options?.[
                  option.key
                ]
              )
          ) {
            price =
              num(
                option.price,
                price
              );
          }
        }
      );

    return price;
  }

  function makeVariantText(
    product,
    options,
    variant
  ) {
    const parts = [];

    if (variant?.name) {
      parts.push(
        variant.name
      );
    }

    Object.entries(
      options || {}
    ).forEach(
      ([key, value]) => {
        if (value) {
          parts.push(
            `${key}: ${value}`
          );
        }
      }
    );

    return parts.join(
      " · "
    );
  }

  function findMatchingVariant() {
    if (!state.product) {
      return null;
    }

    const variants =
      parseJson(
        state.product
          .variants,
        []
      );

    if (
      !Array.isArray(
        variants
      ) ||
      !variants.length
    ) {
      return null;
    }

    return (
      variants.find(
        (variant) => {
          const options =
            normalizeOptions(
              variant.options
            );

          return Object.entries(
            state.selectedOptions
          ).every(
            ([key, value]) =>
              String(
                options[key] ??
                variant[key] ??
                ""
              ) ===
              String(value)
          );
        }
      ) ||
      variants[0]
    );
  }

  function optionGroups(
    product
  ) {
    const variants =
      parseJson(
        product?.variants,
        []
      );

    const groups = {};

    if (
      Array.isArray(
        variants
      )
    ) {
      variants.forEach(
        (variant) => {
          const options =
            normalizeOptions(
              variant.options
            );

          Object.entries(
            options
          ).forEach(
            ([key, value]) => {
              if (!groups[key]) {
                groups[key] =
                  new Set();
              }

              groups[key].add(
                String(value)
              );
            }
          );
        }
      );
    }

    const raw =
      getPriceOptions(
        product
      );

    Object.entries(
      raw
    ).forEach(
      ([key, values]) => {
        if (!groups[key]) {
          groups[key] =
            new Set();
        }

        if (
          Array.isArray(
            values
          )
        ) {
          values.forEach(
            (value) => {
              groups[key].add(
                String(
                  typeof value ===
                    "object"
                    ? (
                        value.value ??
                        value.name
                      )
                    : value
                )
              );
            }
          );
        }
      }
    );

    return Object.entries(
      groups
    ).filter(
      ([, values]) =>
        values.size
    );
  }

  async function openProduct(
    id
  ) {
    try {
      const data =
        await api(
          `/api/products/${encodeURIComponent(
            id
          )}`
        );

      state.product =
        data.product ||
        data;

      state.selectedOptions =
        {};

      state.route =
        "product";

      render();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } catch (error) {
      toast(
        error.message ||
        "Не удалось открыть товар"
      );
    }
  }

  /* =========================================================
     PRODUCT PAGE
  ========================================================= */

  function renderProduct(
    screen
  ) {
    const product =
      state.product;

    if (!product) {
      navigate(
        "catalog"
      );
      return;
    }

    const image =
      imageOf(product);

    const variant =
      findMatchingVariant();

    const price =
      variant
        ? num(
            variant.price,
            num(
              product.price
            )
          )
        : calculateFrontendPrice(
            product,
            state.selectedOptions
          );

    const groups =
      optionGroups(
        product
      );

    screen.innerHTML = `
      <div class="screen product-screen">

        <button
          class="back-link"
          data-action="back"
          type="button"
        >
          ← Каталог
        </button>

        <div class="product-hero-image">

          ${
            num(
              product.is_new
            )
              ? `
                <span class="product-tag">
                  NEW
                </span>
              `
              : ""
          }

          ${
            image
              ? `
                <img
                  src="${escapeHtml(
                    image
                  )}"
                  alt="${escapeHtml(
                    product.name
                  )}"
                >
              `
              : `
                <div class="no-image">
                  IRoom
                </div>
              `
          }

        </div>

        <div class="product-copy">

          <span class="eyebrow">
            IRoom / PRODUCT
          </span>

          <h1>
            ${escapeHtml(
              product.name
            )}
          </h1>

          <div class="big-price">
            ${money(price)}
          </div>

          <div class="stock-line">
            <span></span>
            В наличии / уточняйте комплектацию
          </div>

          <p class="description">
            ${escapeHtml(
              product.description ||
              product.short_description ||
              "Оригинальная техника с консультацией менеджера IRoom."
            )}
          </p>

          ${groups
            .map(
              ([key, values]) => `
                <div class="option-group">

                  <div class="option-title">

                    <span>
                      ${escapeHtml(
                        key
                      )}
                    </span>

                    <b>
                      ${escapeHtml(
                        state
                          .selectedOptions[
                          key
                        ] ||
                        "Выберите"
                      )}
                    </b>

                  </div>

                  <div class="option-values">

                    ${values
                      .map(
                        (value) => `
                          <button
                            class="option-pill ${
                              String(
                                state
                                  .selectedOptions[
                                  key
                                ]
                              ) ===
                              String(
                                value
                              )
                                ? "active"
                                : ""
                            }"
                            data-option-key="${escapeHtml(
                              key
                            )}"
                            data-option-value="${escapeHtml(
                              value
                            )}"
                            type="button"
                          >
                            ${escapeHtml(
                              value
                            )}
                          </button>
                        `
                      )
                      .join("")}

                  </div>

                </div>
              `
            )
            .join("")}

          <div class="product-actions">

            <button
              class="pink-button wide"
              data-action="quick-buy"
              type="button"
            >
              Купить в один клик
              <span>→</span>
            </button>

            <button
              class="ghost-button wide"
              data-action="add-cart"
              type="button"
            >
              Добавить в корзину
            </button>

          </div>

        </div>

        ${managerBlock()}

      </div>
    `;
  }

  /* =========================================================
     CART
  ========================================================= */

  function renderCart(
    screen
  ) {
    const subtotal =
      cartSubtotal();

    const discount =
      num(
        state.checkout
          .promoDiscount
      );

    const total =
      Math.max(
        0,
        subtotal -
          discount
      );

    screen.innerHTML = `
      <div class="screen cart-screen">

        <div class="page-title">

          <span class="eyebrow">
            YOUR BAG
          </span>

          <h1>
            Корзина
          </h1>

          <p>
            ${cartCount()}
            ${
              cartCount() === 1
                ? "товар"
                : "товаров"
            }
          </p>

        </div>

        ${
          state.cart.length
            ? `
              <div class="cart-items">

                ${state.cart
                  .map(
                    renderCartItem
                  )
                  .join("")}

              </div>

              <div class="promo-card">

                <div>

                  <b>
                    Промокод
                  </b>

                  <small>
                    Если у вас есть код —
                    примените его здесь.
                  </small>

                </div>

                <div class="promo-row">

                  <input
                    id="promoInput"
                    value="${escapeHtml(
                      state.checkout
                        .promoCode
                    )}"
                    placeholder="PROMO"
                  >

                  <button
                    id="promoButton"
                    type="button"
                  >
                    Применить
                  </button>

                </div>

              </div>

              <div class="total-card">

                <div>
                  <span>
                    Товары
                  </span>

                  <b>
                    ${money(
                      subtotal
                    )}
                  </b>
                </div>

                ${
                  discount
                    ? `
                      <div>
                        <span>
                          Скидка
                        </span>

                        <b>
                          − ${money(
                            discount
                          )}
                        </b>
                      </div>
                    `
                    : ""
                }

                <div class="total-main">

                  <span>
                    Итого
                  </span>

                  <strong>
                    ${money(total)}
                  </strong>

                </div>

                <button
                  class="pink-button wide"
                  data-action="checkout"
                  type="button"
                >
                  Перейти к оформлению
                  <span>→</span>
                </button>

              </div>
            `
            : emptyCart()
        }

      </div>
    `;
  }

  function emptyCart() {
    return `
      <div class="empty-card large">

        <div class="empty-icon">
          ⌂
        </div>

        <strong>
          Корзина пуста
        </strong>

        <p>
          Добавьте понравившийся товар —
          он появится здесь.
        </p>

        <button
          class="pink-button"
          data-action="catalog"
          type="button"
        >
          Открыть каталог
          <span>→</span>
        </button>

      </div>
    `;
  }

  function renderCartItem(
    item
  ) {
    const image =
      item.image_url;

    return `
      <article class="cart-item">

        <div class="cart-image">

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
                <span>
                  IR
                </span>
              `
          }

        </div>

        <div class="cart-main">

          <div class="cart-top">

            <div>

              <b>
                ${escapeHtml(
                  item.product_name
                )}
              </b>

              <small>
                ${escapeHtml(
                  item.variant_text ||
                  ""
                )}
              </small>

            </div>

            <strong>
              ${money(
                num(
                  item.price
                ) *
                num(
                  item.quantity,
                  1
                )
              )}
            </strong>

          </div>

          <div class="cart-bottom">

            <div class="quantity">

              <button
                data-cart-minus="${escapeHtml(
                  item.key
                )}"
                type="button"
              >
                −
              </button>

              <span>
                ${num(
                  item.quantity,
                  1
                )}
              </span>

              <button
                data-cart-plus="${escapeHtml(
                  item.key
                )}"
                type="button"
              >
                +
              </button>

            </div>

            <button
              class="remove-button"
              data-cart-delete="${escapeHtml(
                item.key
              )}"
              type="button"
            >
              Удалить
            </button>

          </div>

        </div>

      </article>
    `;
  }

  /* =========================================================
     CHECKOUT
  ========================================================= */

  function renderCheckout(
    screen
  ) {
    const total =
      Math.max(
        0,
        cartSubtotal() -
          num(
            state.checkout
              .promoDiscount
          )
      );

    screen.innerHTML = `
      <div class="screen checkout-screen">

        <button
          class="back-link"
          data-action="checkout-back"
          type="button"
        >
          ← Назад
        </button>

        <div class="page-title">

          <span class="eyebrow">
            CHECKOUT
          </span>

          <h1>
            Оформление
          </h1>

        </div>

        <div class="stepper">

          ${[
            "Контакты",
            "Получение",
            "Залог"
          ]
            .map(
              (
                title,
                index
              ) => `
                <div
                  class="step ${
                    state.checkout
                      .step ===
                    index + 1
                      ? "active"
                      : ""
                  } ${
                    state.checkout
                      .step >
                    index + 1
                      ? "done"
                      : ""
                  }"
                >

                  <span>
                    ${
                      state.checkout
                        .step >
                      index + 1
                        ? "✓"
                        : index + 1
                    }
                  </span>

                  <b>
                    ${title}
                  </b>

                </div>
              `
            )
            .join("")}

        </div>

        ${
          state.checkout.step ===
          1
            ? checkoutContacts()
            : state.checkout.step ===
              2
              ? checkoutReceiving()
              : checkoutDeposit(
                  total
                )
        }

      </div>
    `;
  }

  function checkoutContacts() {
    return `
      <section class="checkout-card">

        <div class="card-kicker">
          01 / КОНТАКТЫ
        </div>

        <h2>
          Как с вами связаться?
        </h2>

        <div class="field">

          <label>
            Имя
          </label>

          <input
            id="checkoutName"
            value="${escapeHtml(
              state.checkout.name
            )}"
            placeholder="Ваше имя"
          >

        </div>

        <div class="field">

          <label>
            Телефон / Telegram
          </label>

          <input
            id="checkoutContact"
            value="${escapeHtml(
              state.checkout.contact
            )}"
            placeholder="@username или +7…"
          >

        </div>

        <div class="field">

          <label>
            Комментарий
          </label>

          <textarea
            id="checkoutComment"
            placeholder="Дополнительная информация"
          >${escapeHtml(
            state.checkout.comment
          )}</textarea>

        </div>

        <button
          class="pink-button wide"
          data-action="checkout-next"
          type="button"
        >
          Далее
          <span>→</span>
        </button>

      </section>
    `;
  }

  function checkoutReceiving() {
    const pickup =
      state.pickupPoints.find(
        (point) =>
          String(point.id) ===
          String(
            state.checkout
              .pickupPointId
          )
      ) ||
      state.pickupPoints[0];

    return `
      <section class="checkout-card">

        <div class="card-kicker">
          02 / ПОЛУЧЕНИЕ
        </div>

        <h2>
          Как получить заказ?
        </h2>

        <div class="fulfillment-grid">

          <button
            class="fulfillment ${
              state.checkout
                .fulfillment ===
              "pickup"
                ? "active"
                : ""
            }"
            data-fulfillment="pickup"
            type="button"
          >

            <b>
              Самовывоз
            </b>

            <small>
              Забрать в точке IRoom
            </small>

          </button>

          <button
            class="fulfillment ${
              state.checkout
                .fulfillment ===
              "delivery"
                ? "active"
                : ""
            }"
            data-fulfillment="delivery"
            type="button"
          >

            <b>
              Доставка
            </b>

            <small>
              Курьером по адресу
            </small>

          </button>

        </div>

        ${
          state.checkout
            .fulfillment ===
          "pickup"
            ? `
              <div class="pickup-list">

                ${
                  state.pickupPoints
                    .length
                    ? state.pickupPoints
                        .map(
                          (
                            point
                          ) => `
                            <button
                              class="pickup-option ${
                                String(
                                  state.checkout
                                    .pickupPointId
                                ) ===
                                String(
                                  point.id
                                )
                                  ? "active"
                                  : ""
                              }"
                              data-pickup-id="${escapeHtml(
                                point.id
                              )}"
                              type="button"
                            >

                              <b>
                                ${escapeHtml(
                                  point.title
                                )}
                              </b>

                              <small>
                                ${escapeHtml(
                                  point.address ||
                                  ""
                                )}
                              </small>

                            </button>
                          `
                        )
                        .join("")
                    : `
                      <div class="muted">
                        Точки выдачи пока
                        не добавлены.
                      </div>
                    `
                }

              </div>

              ${
                pickup
                  ? `
                    <div class="pickup-links">

                      ${
                        pickup.directions_url
                          ? `
                            <a
                              href="${escapeHtml(
                                pickup.directions_url
                              )}"
                              target="_blank"
                              rel="noopener"
                            >
                              Как добраться ↗
                            </a>
                          `
                          : ""
                      }

                      ${
                        pickup.video_url
                          ? `
                            <a
                              href="${escapeHtml(
                                pickup.video_url
                              )}"
                              target="_blank"
                              rel="noopener"
                            >
                              Видео ↗
                            </a>
                          `
                          : ""
                      }

                    </div>
                  `
                  : ""
              }
            `
            : `
              <div class="address-grid">

                <div class="field full">

                  <label>
                    Город
                  </label>

                  <input
                    id="deliveryCity"
                    value="${escapeHtml(
                      state.checkout.city
                    )}"
                    placeholder="Москва"
                  >

                </div>

                <div class="field full">

                  <label>
                    Улица
                  </label>

                  <input
                    id="deliveryStreet"
                    value="${escapeHtml(
                      state.checkout.street
                    )}"
                    placeholder="Тверская"
                  >

                </div>

                <div class="field">

                  <label>
                    Дом
                  </label>

                  <input
                    id="deliveryHouse"
                    value="${escapeHtml(
                      state.checkout.house
                    )}"
                    placeholder="12"
                  >

                </div>

                <div class="field">

                  <label>
                    Квартира
                  </label>

                  <input
                    id="deliveryApartment"
                    value="${escapeHtml(
                      state.checkout.apartment
                    )}"
                    placeholder="25"
                  >

                </div>

              </div>
            `
        }

        <div class="two-buttons">

          <button
            class="ghost-button"
            data-action="checkout-back"
            type="button"
          >
            ← Назад
          </button>

          <button
            class="pink-button"
            data-action="checkout-next"
            type="button"
          >
            Далее →
          </button>

        </div>

      </section>
    `;
  }

  function checkoutDeposit(
    total
  ) {
    const amount =
      num(
        state.config
          .reservation_amount
      );

    const rawCard =
      state.config
        .reservation_card;

    const card =
      typeof rawCard ===
      "string"
        ? {
            card_number:
              rawCard,
            requisites:
              rawCard
          }
        : (
            rawCard || {}
          );

    const requisites =
      card.card_number ||
      card.requisites ||
      "Реквизиты уточняются";

    const recipient =
      card.recipient ||
      state.config
        .reservation_recipient ||
      "—";

    const instruction =
      state.config
        .reservation_text ||
      state.config
        .reservation_instruction ||
      "После оплаты нажмите кнопку «Я оплатил(а) залог».";

    return `
      <section class="deposit-card">

        <div class="card-kicker">
          03 / DEPOSIT
        </div>

        <div class="deposit-amount">
          ${money(amount)}
        </div>

        <span class="muted">
          Сумма залога сейчас
        </span>

        <div class="requisites">

          <div>

            <span>
              Реквизиты
            </span>

            <b>
              ${escapeHtml(
                requisites
              )}
            </b>

          </div>

          <div>

            <span>
              Получатель
            </span>

            <b>
              ${escapeHtml(
                recipient
              )}
            </b>

          </div>

          <div>

            <span>
              Остаток
            </span>

            <b>
              ${money(
                Math.max(
                  0,
                  total -
                    amount
                )
              )}
            </b>

          </div>

        </div>

        <div class="deposit-note">

          ${escapeHtml(
            instruction
          )}

          <br><br>

          Остаток оплачивается
          наличными при получении.

        </div>

        <button
          class="pink-button wide"
          data-action="place-order"
          type="button"
        >
          Оформить заказ
          <span>→</span>
        </button>

        <button
          class="ghost-button wide"
          data-action="checkout-back"
          type="button"
        >
          ← Назад
        </button>

      </section>
    `;
  }

  /* =========================================================
     PROMO
  ========================================================= */

  async function applyPromo() {
    const input =
      $("#promoInput");

    if (!input) return;

    const code =
      input.value
        .trim()
        .toUpperCase();

    if (!code) {
      toast(
        "Введите промокод"
      );
      return;
    }

    try {
      const data =
        await api(
          "/api/promo/validate",
          {
            method: "POST",
            body: {
              code
            }
          }
        );

      state.checkout
        .promoCode =
        code;

      state.checkout
        .promoChecked =
        true;

      state.checkout
        .promoDiscount =
        num(
          data.discount ||
          data.promo?.discount ||
          0
        );

      toast(
        data.message ||
        `Промокод применён: − ${money(
          state.checkout
            .promoDiscount
        )}`
      );

      render();
    } catch (error) {
      state.checkout
        .promoDiscount =
        0;

      state.checkout
        .promoChecked =
        true;

      toast(
        error.message ||
        "Промокод недействителен"
      );
    }
  }

  /* =========================================================
     PLACE ORDER
  ========================================================= */

  async function placeOrder() {
    saveCurrentCheckoutFields();

    if (!state.cart.length) {
      toast(
        "Корзина пуста"
      );
      return;
    }

    if (
      !state.checkout.name.trim()
    ) {
      state.checkout.step =
        1;

      render();

      toast(
        "Введите имя"
      );

      return;
    }

    if (
      !state.checkout.contact.trim()
    ) {
      state.checkout.step =
        1;

      render();

      toast(
        "Введите контакт"
      );

      return;
    }

    if (
      state.checkout
        .fulfillment ===
        "delivery" &&
      (
        !state.checkout.city ||
        !state.checkout.street ||
        !state.checkout.house
      )
    ) {
      state.checkout.step =
        2;

      render();

      toast(
        "Укажите город, улицу и дом"
      );

      return;
    }

    if (
      state.checkout
        .fulfillment ===
        "pickup" &&
      !state.checkout.pickupPointId &&
      state.pickupPoints.length
    ) {
      state.checkout.step =
        2;

      render();

      toast(
        "Выберите точку выдачи"
      );

      return;
    }

    const button =
      $(
        '[data-action="place-order"]'
      );

    if (button) {
      button.disabled =
        true;

      button.textContent =
        "Создаём заказ…";
    }

    try {
      const created = [];

      for (
        const item of state.cart
      ) {
        const payload = {
          product_id:
            item.product_id,

          variant_id:
            item.variant_id,

          product_name:
            item.product_name,

          variant_text:
            item.variant_text,

          selected_options:
            item.selected_options,

          fulfillment_type:
            state.checkout
              .fulfillment,

          receiving_type:
            state.checkout
              .fulfillment,

          delivery_type:
            state.checkout
              .fulfillment,

          pickup_point_id:
            state.checkout
              .fulfillment ===
            "pickup"
              ? state.checkout
                  .pickupPointId
              : null,

          delivery_city:
            state.checkout.city,

          delivery_street:
            state.checkout.street,

          delivery_house:
            state.checkout.house,

          delivery_apartment:
            state.checkout
              .apartment,

          customer_comment:
            [
              `Имя: ${state.checkout.name}`,
              `Контакт: ${state.checkout.contact}`,
              state.checkout.comment
                ? `Комментарий: ${state.checkout.comment}`
                : ""
            ]
              .filter(Boolean)
              .join("\n"),

          promo_code:
            created.length === 0
              ? state.checkout
                  .promoCode
              : ""
        };

        const data =
          await api(
            "/api/orders",
            {
              method: "POST",
              body: payload
            }
          );

        if (data.order) {
          created.push(
            data.order
          );
        }
      }

      state.cart = [];

      saveCart();

      state.checkout = {
        step: 1,
        name: "",
        contact: "",
        comment: "",
        fulfillment: "pickup",
        pickupPointId:
          state.pickupPoints[0]
            ?.id ||
          null,
        city: "",
        street: "",
        house: "",
        apartment: "",
        promoCode: "",
        promoDiscount: 0,
        promoChecked: false
      };

      await loadOrders();

      state.route =
        "orders";

      render();

      toast(
        created.length > 1
          ? `Создано заказов: ${created.length}`
          : "Заказ оформлен"
      );
    } catch (error) {
      if (button) {
        button.disabled =
          false;

        button.textContent =
          "Оформить заказ";
      }

      toast(
        error.message ||
        "Не удалось оформить заказ"
      );
    }
  }

  /* =========================================================
     ORDER STATUS
  ========================================================= */

  function statusText(
    status
  ) {
    return (
      {
        new:
          "🆕 Новый",

        confirmed:
          "🔵 Подтверждён",

        processing:
          "⚙️ В обработке",

        ready:
          "📦 Готов к выдаче",

        completed:
          "🏁 Завершён",

        cancelled:
          "❌ Отменён"
      }[status] ||
      status ||
      "—"
    );
  }

  function reservationText(
    status
  ) {
    return (
      {
        pending_payment:
          "🟡 Ожидает оплаты",

        awaiting_confirmation:
          "🟠 Ожидает проверки",

        confirmed:
          "🟢 Залог подтверждён",

        rejected:
          "🔴 Залог отклонён"
      }[status] ||
      status ||
      "—"
    );
  }

  function statusClass(
    status
  ) {
    if (
      status ===
        "completed" ||
      status ===
        "confirmed"
    ) {
      return "ok";
    }

    if (
      status ===
      "cancelled"
    ) {
      return "bad";
    }

    return "wait";
  }

  /* =========================================================
     ORDERS
  ========================================================= */

  async function openOrder(
    id
  ) {
    try {
      const data =
        await api(
          `/api/orders/${encodeURIComponent(
            id
          )}`
        );

      const order =
        data.order ||
        data;

      state.orders = [
        order,
        ...state.orders.filter(
          (item) =>
            String(
              item.id
            ) !==
            String(
              order.id
            )
        )
      ];

      state.product =
        null;

      state.currentOrder =
        order;

      state.route =
        "order";

      render();

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    } catch (error) {
      toast(
        error.message ||
        "Не удалось открыть заказ"
      );
    }
  }

  function renderOrders(
    screen
  ) {
    const orders =
      state.orders || [];

    screen.innerHTML = `
      <div class="screen orders-screen">

        <div class="page-title">

          <span class="eyebrow">
            ACCOUNT
          </span>

          <h1>
            Мои заказы
          </h1>

          <p>
            ${orders.length}
            ${
              orders.length === 1
                ? "заказ"
                : "заказов"
            }
          </p>

        </div>

        ${
          orders.length
            ? `
              <div class="orders-list">

                ${orders
                  .map(
                    orderCard
                  )
                  .join("")}

              </div>
            `
            : `
              <div class="empty-card large">

                <div class="empty-icon">
                  ◎
                </div>

                <strong>
                  Заказов пока нет
                </strong>

                <p>
                  После оформления
                  заказа он появится здесь.
                </p>

                <button
                  class="pink-button"
                  data-action="catalog"
                  type="button"
                >
                  В каталог
                  <span>→</span>
                </button>

              </div>
            `
        }

        ${managerBlock()}

      </div>
    `;
  }

  function orderCard(
    order
  ) {
    const image =
      imageOf(order);

    return `
      <button
        class="order-card"
        data-order-id="${escapeHtml(
          order.id
        )}"
        type="button"
      >

        <div class="order-card-head">

          <span class="order-number">
            ORDER #${escapeHtml(
              order.id
            )}
          </span>

          <span
            class="status-badge ${statusClass(
              order.status
            )}"
          >
            ${escapeHtml(
              statusText(
                order.status
              )
            )}
          </span>

        </div>

        <div class="order-product">

          <div class="order-thumb">

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
                  <span>
                    IR
                  </span>
                `
            }

          </div>

          <div>

            <b>
              ${escapeHtml(
                order.product_name ||
                "Товар"
              )}
            </b>

            <small>
              ${escapeHtml(
                order.variant_text ||
                ""
              )}
            </small>

          </div>

          <strong>
            ${money(
              order.price
            )}
          </strong>

        </div>

        <div class="order-footer">

          <span>
            ${formatDate(
              order.created_at
            )}
          </span>

          <span>
            ${escapeHtml(
              reservationText(
                order.reservation_status
              )
            )}
            · Подробнее →
          </span>

        </div>

      </button>
    `;
  }

  /* =========================================================
     ORDER DETAIL
  ========================================================= */

  function renderOrderDetail(
    screen
  ) {
    const order =
      state.currentOrder ||
      state.orders.find(
        (item) =>
          String(
            item.id
          ) ===
          String(
            state.orderId
          )
      );

    if (!order) {
      navigate(
        "orders"
      );
      return;
    }

    const rawCard =
      state.config
        .reservation_card;

    const card =
      typeof rawCard ===
      "string"
        ? {
            card_number:
              rawCard,
            requisites:
              rawCard
          }
        : (
            rawCard || {}
          );

    const requisites =
      card.card_number ||
      card.requisites ||
      "";

    const recipient =
      card.recipient ||
      state.config
        .reservation_recipient ||
      "";

    const image =
      imageOf(order);

    screen.innerHTML = `
      <div class="screen order-detail">

        <button
          class="back-link"
          data-action="back"
          type="button"
        >
          ← Мои заказы
        </button>

        <div class="order-status-hero">

          <span class="eyebrow">
            ORDER #${escapeHtml(
              order.id
            )}
          </span>

          <h1>
            ${escapeHtml(
              statusText(
                order.status
              )
            )}
          </h1>

          <p>
            ${formatDate(
              order.created_at
            )}
          </p>

        </div>

        <section class="checkout-card">

          <div class="order-product big">

            <div class="order-thumb">

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
                    <span>
                      IR
                    </span>
                  `
              }

            </div>

            <div>

              <b>
                ${escapeHtml(
                  order.product_name ||
                  "Товар"
                )}
              </b>

              <small>
                ${escapeHtml(
                  order.variant_text ||
                  ""
                )}
              </small>

            </div>

            <strong>
              ${money(
                order.price
              )}
            </strong>

          </div>

          <div class="detail-rows">

            <div>
              <span>
                Получение
              </span>

              <b>
                ${
                  order.fulfillment_type ===
                  "delivery"
                    ? "Доставка"
                    : "Самовывоз"
                }
              </b>
            </div>

            <div>
              <span>
                Статус заказа
              </span>

              <b>
                ${escapeHtml(
                  statusText(
                    order.status
                  )
                )}
              </b>
            </div>

            <div>
              <span>
                Залог
              </span>

              <b>
                ${money(
                  order.reservation_amount
                )}
              </b>
            </div>

            <div>
              <span>
                Статус залога
              </span>

              <b>
                ${escapeHtml(
                  reservationText(
                    order.reservation_status
                  )
                )}
              </b>
            </div>

          </div>

        </section>

        ${
          order.reservation_status ===
          "pending_payment"
            ? `
              <section class="deposit-card">

                <div class="card-kicker">
                  DEPOSIT
                </div>

                <div class="deposit-amount">
                  ${money(
                    order.reservation_amount
                  )}
                </div>

                <div class="requisites">

                  <div>

                    <span>
                      Реквизиты
                    </span>

                    <b>
                      ${escapeHtml(
                        requisites ||
                        "Уточните у менеджера"
                      )}
                    </b>

                  </div>

                  <div>

                    <span>
                      Получатель
                    </span>

                    <b>
                      ${escapeHtml(
                        recipient ||
                        "—"
                      )}
                    </b>

                  </div>

                </div>

                <div class="deposit-note">

                  После оплаты нажмите
                  кнопку ниже.
                  Оплата проверяется
                  менеджером вручную.

                </div>

                <button
                  class="pink-button wide"
                  data-reservation-paid="${escapeHtml(
                    order.id
                  )}"
                  type="button"
                >
                  Я оплатил(а) залог
                  <span>→</span>
                </button>

              </section>
            `
            : order.reservation_status ===
              "awaiting_confirmation"
              ? `
                <div class="notice orange">
                  🟠 Вы сообщили об оплате.
                  Заявка отправлена менеджеру
                  на проверку.
                </div>
              `
              : order.reservation_status ===
                "confirmed"
                ? `
                  <div class="notice green">
                    🟢 Залог подтверждён.
                    Остаток оплачивается
                    наличными при получении.
                  </div>
                `
                : order.reservation_status ===
                  "rejected"
                  ? `
                    <div class="notice red">
                      🔴 Залог отклонён.
                      Свяжитесь с менеджером.
                    </div>
                  `
                  : ""
        }

        ${managerBlock()}

      </div>
    `;
  }

  async function reservationPaid(
    id
  ) {
    try {
      await api(
        `/api/orders/${encodeURIComponent(
          id
        )}/reservation-paid`,
        {
          method: "POST"
        }
      );

      toast(
        "Заявка отправлена на проверку"
      );

      await openOrder(
        id
      );
    } catch (error) {
      toast(
        error.message ||
        "Не удалось отправить заявку"
      );
    }
  }

  /* =========================================================
     DRAWER
  ========================================================= */

  function openDrawer() {
    const drawer =
      $("#drawer");

    if (!drawer) return;

    drawer.classList.add(
      "open"
    );

    drawer.setAttribute(
      "aria-hidden",
      "false"
    );
  }

  function closeDrawer() {
    const drawer =
      $("#drawer");

    if (!drawer) return;

    drawer.classList.remove(
      "open"
    );

    drawer.setAttribute(
      "aria-hidden",
      "true"
    );
  }

  function renderDrawerCategories() {
    const container =
      $("#drawerCategories");

    if (!container) return;

    container.innerHTML =
      state.categories
        .map(
          (category) => `
            <button
              class="drawer-item"
              data-drawer-category="${escapeHtml(
                category.id
              )}"
              type="button"
            >

              <span>
                ${escapeHtml(
                  category.name
                )}
              </span>

              <b>
                →
              </b>

            </button>
          `
        )
        .join("");

    $$(
      "[data-drawer-category]"
    ).forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            navigate(
              "catalog",
              {
                categoryId:
                  button.dataset
                    .drawerCategory
              }
            );
          }
        );
      }
    );
  }

  /* =========================================================
     SEARCH
  ========================================================= */

  function toggleSearch(
    force
  ) {
    const container =
      $("#searchContainer");

    const input =
      $("#globalSearch");

    if (!container) return;

    const open =
      force !== undefined
        ? force
        : !container.classList.contains(
            "open"
          );

    container.classList.toggle(
      "open",
      open
    );

    if (open) {
      requestAnimationFrame(
        () => {
          input?.focus();
        }
      );
    }
  }

  /* =========================================================
     STATIC EVENTS
  ========================================================= */

  function bindStaticEvents() {
    $("#menuButton")
      ?.addEventListener(
        "click",
        openDrawer
      );

    $("#closeDrawer")
      ?.addEventListener(
        "click",
        closeDrawer
      );

    $("#drawerBackdrop")
      ?.addEventListener(
        "click",
        closeDrawer
      );

    $("#homeButton")
      ?.addEventListener(
        "click",
        () =>
          navigate(
            "home"
          )
      );

    $("#cartButton")
      ?.addEventListener(
        "click",
        () =>
          navigate(
            "cart"
          )
      );

    $("#profileButton")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await loadOrders();

            navigate(
              "orders"
            );
          } catch (error) {
            toast(
              error.message ||
              "Откройте приложение из Telegram"
            );
          }
        }
      );

    $("#searchButton")
      ?.addEventListener(
        "click",
        () =>
          toggleSearch()
      );

    $("#clearSearch")
      ?.addEventListener(
        "click",
        () => {
          const input =
            $("#globalSearch");

          if (!input) return;

          input.value = "";

          state.search =
            "";

          navigate(
            "catalog"
          );
        }
      );

    $("#globalSearch")
      ?.addEventListener(
        "input",
        (event) => {
          state.search =
            event.target.value;

          state.route =
            "catalog";

          render();
        }
      );

    $("#adminLink")
      ?.addEventListener(
        "click",
        () => {
          if (!isAdmin()) {
            toast(
              "Доступ запрещён"
            );
            return;
          }

          window.location.href =
            "/admin.html";
        }
      );
  }

  /* =========================================================
     DYNAMIC EVENTS
  ========================================================= */

  function bindDynamicEvents() {
    $$
      ("[data-product-id]")
      .forEach(
        (element) => {
          element.addEventListener(
            "click",
            () =>
              openProduct(
                element.dataset
                  .productId
              )
          );
        }
      );

    $$(
      "[data-action]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () =>
            handleAction(
              element.dataset
                .action
            )
        );
      }
    );

    $$(
      "[data-category]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () =>
            navigate(
              "catalog",
              {
                categoryId:
                  element.dataset
                    .category ||
                  null
              }
            )
        );
      }
    );

    $$(
      "[data-option-key]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () => {
            state
              .selectedOptions[
              element.dataset
                .optionKey
            ] =
              element.dataset
                .optionValue;

            render();
          }
        );
      }
    );

    $$(
      "[data-cart-minus]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () =>
            changeQuantity(
              element.dataset
                .cartMinus,
              -1
            )
        );
      }
    );

    $$(
      "[data-cart-plus]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () =>
            changeQuantity(
              element.dataset
                .cartPlus,
              1
            )
        );
      }
    );

    $$(
      "[data-cart-delete]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () =>
            removeCartItem(
              element.dataset
                .cartDelete
            )
        );
      }
    );

    $$(
      "[data-order-id]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () =>
            openOrder(
              element.dataset
                .orderId
            )
        );
      }
    );

    $$(
      "[data-fulfillment]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () => {
            saveCurrentCheckoutFields();

            state.checkout
              .fulfillment =
              element.dataset
                .fulfillment;

            render();
          }
        );
      }
    );

    $$(
      "[data-pickup-id]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () => {
            saveCurrentCheckoutFields();

            state.checkout
              .pickupPointId =
              element.dataset
                .pickupId;

            render();
          }
        );
      }
    );

    $$(
      "[data-reservation-paid]"
    ).forEach(
      (element) => {
        element.addEventListener(
          "click",
          () =>
            reservationPaid(
              element.dataset
                .reservationPaid
            )
        );
      }
    );

    $("#promoButton")
      ?.addEventListener(
        "click",
        applyPromo
      );
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  function handleAction(
    action
  ) {
    if (
      action ===
      "catalog"
    ) {
      navigate(
        "catalog"
      );

      return;
    }

    if (
      action ===
      "orders"
    ) {
      loadOrders()
        .then(
          () =>
            navigate(
              "orders"
            )
        )
        .catch(
          (error) =>
            toast(
              error.message
            )
        );

      return;
    }

    if (
      action ===
      "cart"
    ) {
      navigate(
        "cart"
      );

      return;
    }

    if (
      action ===
      "back"
    ) {
      if (
        state.route ===
        "product"
      ) {
        navigate(
          "catalog"
        );
      } else if (
        state.route ===
        "order"
      ) {
        navigate(
          "orders"
        );
      } else {
        navigate(
          "home"
        );
      }

      return;
    }

    if (
      action ===
      "add-cart"
    ) {
      if (!state.product)
        return;

      const variant =
        findMatchingVariant();

      addCartItem(
        state.product,
        state.selectedOptions,
        variant
      );

      return;
    }

    if (
      action ===
      "quick-buy"
    ) {
      if (!state.product)
        return;

      const variant =
        findMatchingVariant();

      state.cart = [
        {
          key:
            cartKey(
              state.product.id,
              variant?.id,
              state.selectedOptions
            ),

          product_id:
            num(
              state.product.id
            ),

          product_name:
            state.product.name,

          image_url:
            imageOf(
              state.product
            ),

          variant_id:
            variant
              ? num(
                  variant.id
                )
              : null,

          variant_text:
            makeVariantText(
              state.product,
              state.selectedOptions,
              variant
            ),

          selected_options:
            state.selectedOptions,

          price:
            variant
              ? num(
                  variant.price,
                  num(
                    state.product
                      .price
                  )
                )
              : calculateFrontendPrice(
                  state.product,
                  state.selectedOptions
                ),

          quantity: 1
        }
      ];

      saveCart();

      state.checkout.step =
        1;

      navigate(
        "checkout"
      );

      return;
    }

    if (
      action ===
      "checkout"
    ) {
      if (!state.cart.length) {
        toast(
          "Корзина пуста"
        );

        return;
      }

      state.checkout.step =
        1;

      navigate(
        "checkout"
      );

      return;
    }

    if (
      action ===
      "place-order"
    ) {
      placeOrder();

      return;
    }

    if (
      action ===
      "checkout-next"
    ) {
      if (
        state.checkout.step ===
        1
      ) {
        saveCheckoutData();

        if (
          !state.checkout.name.trim()
        ) {
          toast(
            "Введите имя"
          );

          return;
        }

        if (
          !state.checkout.contact.trim()
        ) {
          toast(
            "Введите контакт"
          );

          return;
        }

        state.checkout.step =
          2;

        render();

        return;
      }

      if (
        state.checkout.step ===
        2
      ) {
        saveCheckoutReceiving();

        if (
          state.checkout
            .fulfillment ===
            "delivery" &&
          (
            !state.checkout.city ||
            !state.checkout.street ||
            !state.checkout.house
          )
        ) {
          toast(
            "Укажите город, улицу и дом"
          );

          return;
        }

        if (
          state.checkout
            .fulfillment ===
            "pickup" &&
          !state.checkout.pickupPointId &&
          state.pickupPoints.length
        ) {
          toast(
            "Выберите точку выдачи"
          );

          return;
        }

        state.checkout.step =
          3;

        render();

        return;
      }
    }

    if (
      action ===
      "checkout-back"
    ) {
      saveCurrentCheckoutFields();

      if (
        state.checkout.step >
        1
      ) {
        state.checkout.step--;

        render();
      } else {
        navigate(
          "cart"
        );
      }
    }
  }

  /* =========================================================
     CHECKOUT SAVE
  ========================================================= */

  function saveCurrentCheckoutFields() {
    saveCheckoutData();
    saveCheckoutReceiving();
  }

  function saveCheckoutData() {
    state.checkout.name =
      $(
        "#checkoutName"
      )?.value.trim() ??
      state.checkout.name;

    state.checkout.contact =
      $(
        "#checkoutContact"
      )?.value.trim() ??
      state.checkout.contact;

    state.checkout.comment =
      $(
        "#checkoutComment"
      )?.value.trim() ??
      state.checkout.comment;
  }

  function saveCheckoutReceiving() {
    state.checkout.city =
      $(
        "#deliveryCity"
      )?.value.trim() ??
      state.checkout.city;

    state.checkout.street =
      $(
        "#deliveryStreet"
      )?.value.trim() ??
      state.checkout.street;

    state.checkout.house =
      $(
        "#deliveryHouse"
      )?.value.trim() ??
      state.checkout.house;

    state.checkout.apartment =
      $(
        "#deliveryApartment"
      )?.value.trim() ??
      state.checkout.apartment;
  }

  /* =========================================================
     BOOT
  ========================================================= */

  async function boot() {
    initTelegram();

    bindStaticEvents();

    updateCartBadge();

    try {
      await loadInitialData();

      try {
        if (initData()) {
          await api(
            "/api/me"
          );
        }
      } catch {}

      render();

    } catch (error) {
      console.error(
        "IRoom boot:",
        error
      );

      const screen =
        $("#screen");

      if (screen) {
        screen.innerHTML = `
          <div class="empty-card large">

            <div class="empty-icon">
              !
            </div>

            <strong>
              Не удалось загрузить IRoom
            </strong>

            <p>
              ${escapeHtml(
                error.message ||
                "Ошибка соединения"
              )}
            </p>

            <button
              class="pink-button"
              id="retryButton"
              type="button"
            >
              Повторить
            </button>

          </div>
        `;

        $("#retryButton")
          ?.addEventListener(
            "click",
            () =>
              boot()
          );
      }
    }
  }

  boot();

})();