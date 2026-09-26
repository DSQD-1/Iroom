/* =========================================================
   IROOM APP — FULL FRONTEND
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
    currentOrder: null,
    me: null,
    viewedProducts: [],

    route: "home",
    categoryId: null,
    search: "",

    product: null,
    selectedOptions: {},
    aiMessages: [],

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
    ) return fallback;

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

  function mediaOf(item) {
    const raw = parseJson(item?.images, []);

    if (!Array.isArray(raw)) return [];

    return raw
      .map((entry) => {
        if (typeof entry === "string") {
          const type = /\.(mp4|webm|mov)(\?|$)/i.test(entry)
            ? "video"
            : "image";
          return { url: entry, type };
        }

        if (entry && typeof entry === "object" && entry.url) {
          return {
            url: String(entry.url),
            type: entry.type === "video" ? "video" : "image"
          };
        }

        return null;
      })
      .filter(Boolean);
  }

  function imageOf(item) {
    if (item?.image_url) {
      return item.image_url;
    }

    const media = mediaOf(item);
    return media.find((entry) => entry.type === "image")?.url || "";
  }

  function videoOf(item) {
    return mediaOf(item).find((entry) => entry.type === "video")?.url || "";
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
      JSON.stringify(state.cart)
    );

    updateCartBadge();
  }

  function cartCount() {
    return state.cart.reduce(
      (sum, item) =>
        sum + num(item.quantity, 1),
      0
    );
  }

  function cartSubtotal() {
    return state.cart.reduce(
      (sum, item) =>
        sum +
        num(item.price) *
          num(item.quantity, 1),
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
     TELEGRAM INIT
  ========================================================= */

  function initTelegram() {
    if (!tg) return;

    try {
      tg.ready();
      tg.expand();

      tg.setHeaderColor(
        "#050505"
      );

      tg.setBackgroundColor(
        "#050505"
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

    clearTimeout(toastTimer);

    toastTimer =
      setTimeout(() => {
        element.classList.remove(
          "show"
        );
      }, 2800);
  }

  function haptic(type = "light") {
    try {
      const feedback = tg?.HapticFeedback;
      if (!feedback) return;

      if (type === "success" || type === "error" || type === "warning") {
        if (typeof feedback.notificationOccurred === "function") {
          feedback.notificationOccurred(type);
        }
        return;
      }

      if (typeof feedback.impactOccurred === "function") {
        feedback.impactOccurred("light");
      }
    } catch {}
  }

  /* =========================================================
     BOOT DATA
  ========================================================= */

  async function loadInitialData() {
    const [
      categories,
      products,
      banners,
      pickup,
      config
    ] =
      await Promise.all([
        api("/api/categories"),
        api("/api/products"),
        api("/api/banners"),
        api("/api/pickup-points"),
        api("/api/store-config")
      ]);

    state.categories =
      Array.isArray(
        categories.categories
      )
        ? categories.categories
        : [];

    state.products =
      Array.isArray(
        products.products
      )
        ? products.products
        : [];

    state.banners =
      Array.isArray(
        banners.banners
      )
        ? banners.banners
        : [];

    state.pickupPoints =
      Array.isArray(
        pickup.pickup_points
      )
        ? pickup.pickup_points
        : [];

    state.config =
      config || {};

    if (
      !state.checkout.pickupPointId &&
      state.pickupPoints.length
    ) {
      state.checkout.pickupPointId =
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
      Array.isArray(data.orders)
        ? data.orders
        : [];
  }

  async function loadMe() {
    try {
      const data = await api("/api/me");
      state.me = data?.user || null;
      return state.me;
    } catch (error) {
      console.error("LOAD ME:", error);
      return state.me;
    }
  }

  function loadViewedProducts() {
    try {
      const raw = JSON.parse(localStorage.getItem("iroom_viewed_products") || "[]");
      state.viewedProducts = Array.isArray(raw) ? raw.slice(0, 12) : [];
    } catch {
      state.viewedProducts = [];
    }
  }

  function saveViewedProducts() {
    try {
      localStorage.setItem("iroom_viewed_products", JSON.stringify(state.viewedProducts.slice(0, 12)));
    } catch {}
  }

  function rememberViewedProduct(product) {
    if (!product?.id) return;
    const item = {
      id: product.id,
      name: product.name || "Товар",
      image_url: imageOf(product),
      price: product.price
    };
    state.viewedProducts = [item, ...state.viewedProducts.filter(x => String(x.id) !== String(item.id))].slice(0, 12);
    saveViewedProducts();
  }

  function updateContactLinks() {
    const manager =
      state.config.contact_url ||
      "https://t.me/iroom_24";

    const channel =
      state.config.channel_url ||
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
     ROUTER
  ========================================================= */

  function navigate(
    route,
    data = {}
  ) {
    state.route =
      route;

    if (
      data.categoryId !==
      undefined
    ) {
      state.categoryId =
        data.categoryId;
    }

    if (
      data.search !==
      undefined
    ) {
      state.search =
        data.search;
    }

    closeDrawer();

    render();
  }

  function render() {
    const screen =
      $("#screen");

    if (!screen) return;

    if (
      state.route ===
      "home"
    ) {
      renderHome(screen);
    } else if (
      state.route ===
      "catalog"
    ) {
      renderCatalog(screen);
    } else if (
      state.route ===
      "product"
    ) {
      renderProduct(screen);
    } else if (
      state.route ===
      "cart"
    ) {
      renderCart(screen);
    } else if (
      state.route ===
      "checkout"
    ) {
      renderCheckout(screen);
    } else if (
      state.route ===
      "orders"
    ) {
      renderOrders(screen);
    } else if (
      state.route ===
      "profile"
    ) {
      renderProfile(screen);
    } else if (
      state.route ===
      "order"
    ) {
      renderOrderDetail(screen);
    } else if (
      state.route ===
      "ai"
    ) {
      renderAi(screen);
    } else {
      renderHome(screen);
    }

    updateCartBadge();

    window.scrollTo({
      top:0,
      behavior:"smooth"
    });
  }

  /* =========================================================
     IROOM AI
  ========================================================= */

  function aiMessageHtml(message) {
    return `
      <div class="ai-message ${message.role === "user" ? "user" : "assistant"}">
        <div class="ai-message-name">
          ${message.role === "user" ? "Вы" : "IRoom AI"}
        </div>
        <div class="ai-message-text">${escapeHtml(message.text || "").replace(/\n/g, "<br>")}</div>
      </div>
    `;
  }

  async function loadAiActions() {
    if (!isAdmin()) return [];
    try {
      const data = await api("/api/admin/ai/actions");
      return data.actions || [];
    } catch {
      return [];
    }
  }

  async function renderAi(screen) {
    const actions = await loadAiActions();

    if (!state.aiMessages.length) {
      state.aiMessages.push({
        role: "assistant",
        text: isAdmin()
          ? "Привет! Я IRoom AI. Могу отвечать по магазину и подготовить изменения каталога. Создание товара или изменение цены выполняется только после подтверждения обоих администраторов."
          : "Привет! Я IRoom AI. Могу помочь с товарами, ценами и каталогом."
      });
    }

    screen.innerHTML = `
      <div class="screen ai-page">
        <div class="ai-header">
          <button class="back-button" data-action="back" type="button">←</button>
          <div class="ai-title-wrap">
            <div class="ai-orb">✦</div>
            <div>
              <h1>IRoom AI</h1>
              <p>${isAdmin() ? "Ассистент магазина · двойное подтверждение" : "Ассистент магазина"}</p>
            </div>
          </div>
        </div>

        <div class="ai-chat" id="aiChat">
          ${state.aiMessages.map(aiMessageHtml).join("")}
        </div>

        ${isAdmin() && actions.some(a => a.status === "pending") ? `
          <section class="ai-approvals">
            <div class="ai-section-title">Запросы на изменение</div>
            ${actions.filter(a => a.status === "pending").map(a => `
              <div class="ai-action-card">
                <div class="ai-action-top">
                  <strong>${a.action_type === "create_product" ? "Создание товара" : "Изменение цены"}</strong>
                  <span>${Array.isArray(a.approvals) ? a.approvals.length : 0}/2</span>
                </div>
                <div class="ai-action-request">${escapeHtml(a.request_text)}</div>
                <div class="ai-action-data">${escapeHtml(JSON.stringify(a.action || {}, null, 2))}</div>
                <div class="ai-action-buttons">
                  <button class="secondary-button ai-reject" data-ai-reject="${a.id}" type="button">Отклонить</button>
                  <button class="primary-button ai-approve" data-ai-approve="${a.id}" type="button">Подтвердить</button>
                </div>
              </div>
            `).join("")}
          </section>
        ` : ""}

        <form class="ai-input-wrap" id="aiForm">
          <input id="aiInput" type="text" maxlength="4000" autocomplete="off" placeholder="Например: создай iPhone 18 Pro за 149 990 ₽">
          <button class="ai-send" type="submit">↑</button>
        </form>
      </div>
    `;

    const chat = $("#aiChat");
    if (chat) chat.scrollTop = chat.scrollHeight;

    $("#aiForm")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = $("#aiInput");
      const message = input?.value.trim();
      if (!message) return;

      state.aiMessages.push({ role: "user", text: message });
      input.value = "";
      renderAi(screen);

      try {
        const data = await api("/api/ai/chat", {
          method: "POST",
          body: { message }
        });

        state.aiMessages.push({
          role: "assistant",
          text: data.answer || "Готово."
        });

        await renderAi(screen);
      } catch (error) {
        state.aiMessages.push({
          role: "assistant",
          text: `Ошибка: ${error.message || "не удалось связаться с ИИ"}`
        });
        await renderAi(screen);
      }
    });

    $$('[data-ai-approve]').forEach(button => {
      button.addEventListener("click", async () => {
        try {
          const data = await api(`/api/admin/ai/actions/${button.dataset.aiApprove}/approve`, {
            method: "POST",
            body: {}
          });
          toast(data.message || "Подтверждение принято");
          await renderAi(screen);
        } catch (error) {
          toast(error.message || "Ошибка подтверждения");
        }
      });
    });

    $$('[data-ai-reject]').forEach(button => {
      button.addEventListener("click", async () => {
        try {
          await api(`/api/admin/ai/actions/${button.dataset.aiReject}/reject`, {
            method: "POST",
            body: {}
          });
          toast("Запрос отклонён");
          await renderAi(screen);
        } catch (error) {
          toast(error.message || "Ошибка");
        }
      });
    });
  }

  /* =========================================================
     HOME
  ========================================================= */

  function renderHome(screen) {
    const banner =
      state.banners[0];

    const newest =
      state.products
        .filter(
          (item) =>
            Number(item.is_new) ===
            1
        )
        .slice(0, 6);

    const products =
      newest.length
        ? newest
        : state.products.slice(
            0,
            6
          );

    screen.innerHTML = `
      <div class="screen">

        ${
          banner
            ? `
              <section class="hero">
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

                <div class="hero-content">
                  <div class="eyebrow">
                    IROOM
                  </div>

                  <h1>
                    ${escapeHtml(
                      banner.title ||
                      "НОВИНКИ APPLE"
                    )}
                  </h1>

                  <p>
                    ${escapeHtml(
                      banner.subtitle ||
                      "Оригинальная техника · Гарантия · Выгодные цены"
                    )}
                  </p>

                  ${
                    banner.button_url
                      ? `
                        <a
                          class="primary-button"
                          href="${escapeHtml(
                            banner.button_url
                          )}"
                          target="_blank"
                          rel="noopener"
                          style="
                            display:inline-flex;
                            align-items:center;
                            text-decoration:none;
                          "
                        >
                          ${escapeHtml(
                            banner.button_text ||
                            "Смотреть →"
                          )}
                        </a>
                      `
                      : `
                        <button
                          class="primary-button"
                          data-action="catalog"
                          type="button"
                        >
                          Смотреть →
                        </button>
                      `
                  }
                </div>
              </section>
            `
            : `
              <section class="hero">
                <div class="hero-content">
                  <div class="eyebrow">
                    IROOM
                  </div>

                  <h1>
                    НОВИНКИ<br>
                    <span style="color:var(--pink)">
                      APPLE
                    </span>
                  </h1>

                  <p>
                    Оригинальная техника ·
                    Гарантия · Выгодные цены
                  </p>

                  <button
                    class="primary-button"
                    data-action="catalog"
                    type="button"
                  >
                    Смотреть →
                  </button>
                </div>
              </section>
            `
        }

        <section class="section">
          <div class="section-heading">
            <div>
              <h2>Новинки</h2>
              <p>Свежие товары IRoom</p>
            </div>

            <button
              class="text-link"
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

        <section class="section">
          <div class="section-heading">
            <div>
              <h2>Каталог</h2>
              <p>
                Выберите нужную категорию
              </p>
            </div>
          </div>

          <div class="catalog-tools">
            <button
              class="chip"
              data-category=""
              type="button"
            >
              Все
            </button>

            ${state.categories
              .slice(0,8)
              .map(
                (category) => `
                  <button
                    class="chip"
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
        </section>

      </div>
    `;

    bindDynamicEvents();
  }

  function emptyProducts() {
    return `
      <div
        style="
          grid-column:1/-1;
        "
      >
        <div class="empty">
          <div class="empty-icon">▤</div>
          <strong>Товаров пока нет</strong>
          <p>Каталог скоро пополнится</p>
        </div>
      </div>
    `;
  }

  function managerBlock() {
    const url =
      state.config.contact_url ||
      "https://t.me/iroom_24";

    return `
      <section class="section">
        <div class="manager-card">
          <div class="eyebrow">
            MANAGER
          </div>

          <h3>
            Поможем выбрать товар
          </h3>

          <p>
            Если не знаете, какую модель,
            память или регион выбрать —
            напишите менеджеру.
          </p>

          <a
            class="primary-button"
            href="${escapeHtml(url)}"
            target="_blank"
            rel="noopener"
            style="
              display:inline-flex;
              align-items:center;
              text-decoration:none;
              min-height:42px;
            "
          >
            Написать менеджеру →
          </a>
        </div>
      </section>
    `;
  }

  function managerFooter() {
    const url =
      state.config.contact_url ||
      "https://t.me/iroom_24";

    return `
      <div class="manager-footer">
        <strong>
          Нужна помощь?
        </strong>

        <p>
          Свяжитесь с менеджером IRoom
        </p>

        <a
          href="${escapeHtml(url)}"
          target="_blank"
          rel="noopener"
        >
          Связаться с менеджером
        </a>
      </div>
    `;
  }

  /* =========================================================
     CATALOG
  ========================================================= */

  function renderCatalog(screen) {
    let products =
      [...state.products];

    if (state.categoryId) {
      products =
        products.filter(
          (product) =>
            String(
              product.category_id
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
      products =
        products.filter(
          (product) =>
            [
              product.name,
              product.description
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(query)
        );
    }

    screen.innerHTML = `
      <div class="screen">

        <div class="page-head">
          <div class="eyebrow">
            CATALOG
          </div>

          <h1>Каталог</h1>

          <p>
            ${
              query
                ? `Поиск: «${escapeHtml(
                    state.search
                  )}»`
                : "Вся техника IRoom"
            }
          </p>
        </div>

        <div class="catalog-tools">
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
                      state.categoryId || ""
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

        ${
          products.length
            ? `
              <div class="product-grid">
                ${products
                  .map(
                    productCard
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="empty">
                <div class="empty-icon">⌕</div>
                <strong>
                  Ничего не найдено
                </strong>
                <p>
                  Попробуйте другой запрос
                </p>
              </div>
            `
        }

      </div>
    `;

    bindDynamicEvents();
  }

  /* =========================================================
     PRODUCT CARD
  ========================================================= */

  function productCard(product) {
    return `
      <article
        class="product-card"
        data-product-id="${escapeHtml(
          product.id
        )}"
      >
        <div class="product-image">
          ${
            imageOf(product)
              ? `
                <img
                  src="${escapeHtml(
                    imageOf(product)
                  )}"
                  alt="${escapeHtml(
                    product.name
                  )}"
                  loading="lazy"
                >
              `
              : `
                <div
                  style="
                    width:100%;
                    height:100%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    color:#555;
                    font-size:30px;
                  "
                >
                  IR
                </div>
              `
          }

          ${
            Number(
              product.is_new
            ) === 1
              ? `
                <span class="product-badge">
                  Новинка
                </span>
              `
              : ""
          }
        </div>

        <div class="product-info">
          <h3>
            ${escapeHtml(
              product.name
            )}
          </h3>

          <p>
            ${escapeHtml(
              String(
                product.description ||
                ""
              ).slice(0,80)
            )}
          </p>

          <div class="product-price">
            От ${money(product.price)}
          </div>
        </div>
      </article>
    `;
  }

  /* =========================================================
     PRODUCT
  ========================================================= */

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
        data.product;

      rememberViewedProduct(state.product);

      state.selectedOptions =
        {};

      state.route =
        "product";

      render();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось открыть товар"
      );
    }
  }

  function getPriceOptions(product) {
    const raw =
      parseJson(
        product.price_options,
        {}
      ) || {};

    return {
      colors:
        normalizeOptions(
          raw.colors ||
          raw.color
        ),

      memories:
        normalizeOptions(
          raw.memories ||
          raw.memory
        ),

      sims:
        normalizeOptions(
          raw.sims ||
          raw.sim ||
          raw.sim_type
        ),

      regions:
        normalizeOptions(
          raw.regions ||
          raw.region
        )
    };
  }

  function normalizeOptions(value) {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (
            typeof item ===
            "string"
          ) {
            return {
              name:item,
              surcharge:0
            };
          }

          return {
            name:
              String(
                item?.name ||
                item?.value ||
                ""
              ),

            surcharge:
              num(
                item?.surcharge ??
                item?.extra ??
                item?.price ??
                0
              )
          };
        })
        .filter(
          (item) =>
            item.name
        );
    }

    if (
      typeof value ===
      "object"
    ) {
      return Object.entries(
        value
      ).map(
        ([name, surcharge]) => ({
          name,
          surcharge:num(
            surcharge
          )
        })
      );
    }

    return [];
  }

  function calculateFrontendPrice(
    product,
    options
  ) {
    let result =
      num(product.price);

    const priceOptions =
      getPriceOptions(
        product
      );

    const map = [
      ["color","colors"],
      ["memory","memories"],
      ["sim","sims"],
      ["region","regions"]
    ];

    map.forEach(
      ([key, group]) => {
        const selected =
          options?.[key];

        if (!selected) return;

        const found =
          priceOptions[
            group
          ].find(
            (item) =>
              item.name ===
              selected
          );

        if (found) {
          result +=
            num(
              found.surcharge
            );
        }
      }
    );

    return result;
  }

  function makeVariantText(
    product,
    options,
    variant
  ) {
    if (variant) {
      return [
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
          : "",
        variant.name || ""
      ]
        .filter(Boolean)
        .join(" • ");
    }

    return [
      options?.color
        ? `Цвет: ${options.color}`
        : "",
      options?.memory
        ? `Память: ${options.memory}`
        : "",
      options?.sim
        ? `SIM: ${options.sim}`
        : "",
      options?.region
        ? `Регион: ${options.region}`
        : ""
    ]
      .filter(Boolean)
      .join(" • ");
  }

  function findMatchingVariant() {
    const product =
      state.product;

    if (
      !product ||
      !Array.isArray(
        product.variants
      )
    ) {
      return null;
    }

    return product.variants.find(
      (variant) =>
        (!state.selectedOptions.color ||
          variant.color ===
            state.selectedOptions.color) &&

        (!state.selectedOptions.memory ||
          variant.memory ===
            state.selectedOptions.memory) &&

        (!state.selectedOptions.sim ||
          variant.sim_type ===
            state.selectedOptions.sim) &&

        (!state.selectedOptions.region ||
          variant.region ===
            state.selectedOptions.region)
    ) || null;
  }

  function renderProduct(screen) {
    const product =
      state.product;

    if (!product) {
      navigate("catalog");
      return;
    }

    const options =
      getPriceOptions(
        product
      );

    const variant =
      findMatchingVariant();

    const currentPrice =
      variant
        ? num(
            variant.price,
            num(product.price)
          )
        : calculateFrontendPrice(
            product,
            state.selectedOptions
          );

    const optionGroups = [
      ["color","Цвет",options.colors],
      ["memory","Память",options.memories],
      ["sim","SIM",options.sims],
      ["region","Регион",options.regions]
    ].filter(
      ([, , values]) =>
        values.length
    );

    screen.innerHTML = `
      <div class="screen product-page">

        <button
          class="back-button"
          data-action="back"
          type="button"
        >
          ←
        </button>

        <div class="detail-image">
          ${
            imageOf(product)
              ? `
                <img
                  src="${escapeHtml(
                    imageOf(product)
                  )}"
                  alt="${escapeHtml(
                    product.name
                  )}"
                >
              `
              : `
                <div
                  style="
                    width:100%;
                    height:100%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:40px;
                    color:#444;
                  "
                >
                  IR
                </div>
              `
          }
        </div>

        ${
          videoOf(product)
            ? `
              <div class="detail-video">
                <video
                  src="${escapeHtml(videoOf(product))}"
                  controls
                  playsinline
                  preload="metadata"
                ></video>
              </div>
            `
            : ""
        }

        <div class="eyebrow">
          IROOM
        </div>

        <h1 class="detail-title">
          ${escapeHtml(
            product.name
          )}
        </h1>

        <div class="detail-price">
          ${money(currentPrice)}
        </div>

        ${
          optionGroups
            .map(
              ([key,label,values]) => `
                <div class="option-block">
                  <div class="option-label">
                    ${escapeHtml(label)}
                  </div>

                  <div class="option-list">
                    ${values
                      .map(
                        (option) => `
                          <button
                            class="option-button ${
                              state.selectedOptions[key] ===
                              option.name
                                ? "active"
                                : ""
                            }"
                            data-option-key="${key}"
                            data-option-value="${escapeHtml(
                              option.name
                            )}"
                            type="button"
                          >
                            ${escapeHtml(
                              option.name
                            )}
                            ${
                              num(
                                option.surcharge
                              ) > 0
                                ? ` +${money(
                                    option.surcharge
                                  )}`
                                : ""
                            }
                          </button>
                        `
                      )
                      .join("")}
                  </div>
                </div>
              `
            )
            .join("")
        }

        ${
          product.description
            ? `
              <div class="detail-description">
                ${escapeHtml(
                  product.description
                )}
              </div>
            `
            : ""
        }

        <div class="detail-actions">
          <button
            class="primary-button"
            data-action="quick-buy"
            type="button"
          >
            Купить в один клик ·
            ${money(currentPrice)}
          </button>

          <button
            class="secondary-button"
            data-action="add-cart"
            type="button"
          >
            Добавить в корзину
          </button>
        </div>
      </div>
    `;

    bindDynamicEvents();
  }

  /* =========================================================
     CART
  ========================================================= */

  function renderCart(screen) {
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
        subtotal - discount
      );

    screen.innerHTML = `
      <div class="screen">

        <div class="page-head">
          <div class="eyebrow">
            IROOM
          </div>

          <h1>Корзина</h1>

          <p>
            ${cartCount()} ${
              cartCount() === 1
                ? "товар"
                : "товаров"
            }
          </p>
        </div>

        ${
          state.cart.length
            ? `
              <div class="cart-list">
                ${state.cart
                  .map(
                    renderCartItem
                  )
                  .join("")}
              </div>

              <div class="promo-box">
                <strong>
                  Промокод
                </strong>

                <div class="promo-row">
                  <input
                    id="promoInput"
                    type="text"
                    value="${escapeHtml(
                      state.checkout
                        .promoCode
                    )}"
                    placeholder="Введите промокод"
                    autocapitalize="characters"
                  >

                  <button
                    id="promoButton"
                    type="button"
                  >
                    →
                  </button>
                </div>

                ${
                  state.checkout
                    .promoChecked
                    ? `
                      <div
                        style="
                          margin-top:8px;
                          color:${
                            discount > 0
                              ? "var(--green)"
                              : "#ff7777"
                          };
                          font-size:10px;
                        "
                      >
                        ${
                          discount > 0
                            ? `Скидка применена: ${money(
                                discount
                              )}`
                            : "Промокод не применён"
                        }
                      </div>
                    `
                    : ""
                }
              </div>

              <div class="summary">
                <div class="summary-row">
                  <span>Товары</span>
                  <strong>
                    ${money(subtotal)}
                  </strong>
                </div>

                <div class="summary-row discount">
                  <span>Скидка</span>
                  <strong>
                    −${money(discount)}
                  </strong>
                </div>

                <div class="summary-row">
                  <span>Доставка</span>
                  <strong>По согласованию</strong>
                </div>

                <div class="summary-row total">
                  <span>Итого</span>
                  <strong>
                    ${money(total)}
                  </strong>
                </div>
              </div>

              <button
                class="primary-button"
                data-action="checkout"
                type="button"
                style="
                  width:100%;
                  margin-top:10px;
                "
              >
                Оформить заказ
              </button>
            `
            : `
              <div class="empty">
                <div class="empty-icon">🛒</div>

                <strong>
                  Корзина пуста
                </strong>

                <p>
                  Добавьте товары из каталога
                </p>

                <button
                  class="primary-button"
                  data-action="catalog"
                  type="button"
                  style="margin-top:16px"
                >
                  Перейти в каталог
                </button>
              </div>
            `
        }

      </div>
    `;

    bindDynamicEvents();
  }

  function renderCartItem(item) {
    return `
      <div class="cart-item">
        <div class="cart-thumb">
          ${
            item.image_url
              ? `
                <img
                  src="${escapeHtml(
                    item.image_url
                  )}"
                  alt=""
                >
              `
              : ""
          }
        </div>

        <div>
          <h3>
            ${escapeHtml(
              item.product_name
            )}
          </h3>

          <p>
            ${escapeHtml(
              item.variant_text ||
              "Стандартная комплектация"
            )}
          </p>

          <div class="cart-item-bottom">
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
                ${item.quantity}
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

            <strong>
              ${money(
                num(item.price) *
                num(item.quantity,1)
              )}
            </strong>

            <button
              class="icon-delete"
              data-cart-delete="${escapeHtml(
                item.key
              )}"
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     CHECKOUT
  ========================================================= */

  function renderCheckout(screen) {
    const checkout =
      state.checkout;

    const subtotal =
      cartSubtotal();

    const discount =
      num(
        checkout.promoDiscount
      );

    const total =
      Math.max(
        0,
        subtotal - discount
      );

    screen.innerHTML = `
      <div class="screen checkout">

        <button
          class="back-button"
          data-action="back"
          type="button"
        >
          ←
        </button>

        <div class="page-head">
          <div class="eyebrow">
            CHECKOUT
          </div>

          <h1>Оформление</h1>
        </div>

        <div class="steps">
          <div class="step ${
            checkout.step === 1
              ? "active"
              : ""
          }">
            1 · Данные
          </div>

          <div class="step ${
            checkout.step === 2
              ? "active"
              : ""
          }">
            2 · Получение
          </div>

          <div class="step ${
            checkout.step === 3
              ? "active"
              : ""
          }">
            3 · Залог
          </div>
        </div>

        ${
          checkout.step === 1
            ? checkoutStepData()
            : checkout.step === 2
              ? checkoutStepReceiving()
              : checkoutStepReservation(
                  total
                )
        }

      </div>
    `;

    bindDynamicEvents();
  }

  function checkoutStepData() {
    return `
      <div class="field">
        <label>Имя</label>

        <input
          id="checkoutName"
          type="text"
          value="${escapeHtml(
            state.checkout.name
          )}"
          placeholder="Ваше имя"
          autocomplete="name"
        >
      </div>

      <div class="field">
        <label>Контакт</label>

        <input
          id="checkoutContact"
          type="text"
          value="${escapeHtml(
            state.checkout.contact
          )}"
          placeholder="@username или телефон"
        >
      </div>

      <div class="field">
        <label>Комментарий</label>

        <textarea
          id="checkoutComment"
          placeholder="Например, удобное время связи..."
        >${escapeHtml(
          state.checkout.comment
        )}</textarea>
      </div>

      <button
        class="primary-button"
        data-action="checkout-next"
        type="button"
        style="width:100%"
      >
        Далее →
      </button>
    `;
  }

  function checkoutStepReceiving() {
    const pickup =
      state.pickupPoints.find(
        (point) =>
          String(point.id) ===
          String(
            state.checkout
              .pickupPointId
          )
      );

    return `
      <div class="option-block" style="margin-top:0">
        <div class="option-label">
          Способ получения
        </div>

        <div class="choice-list">
          <button
            class="choice ${
              state.checkout
                .fulfillment ===
              "pickup"
                ? "active"
                : ""
            }"
            data-fulfillment="pickup"
            type="button"
          >
            <span class="choice-dot"></span>

            <span>
              <strong>
                Самовывоз
              </strong>

              <small>
                Забрать товар в точке IRoom
              </small>
            </span>
          </button>

          <button
            class="choice ${
              state.checkout
                .fulfillment ===
              "delivery"
                ? "active"
                : ""
            }"
            data-fulfillment="delivery"
            type="button"
          >
            <span class="choice-dot"></span>

            <span>
              <strong>
                Доставка
              </strong>

              <small>
                Адрес укажите ниже
              </small>
            </span>
          </button>
        </div>
      </div>

      ${
        state.checkout
          .fulfillment ===
        "pickup"
          ? `
            <div class="pickup-extra">
              <div class="option-label">
                Точка выдачи
              </div>

              <div class="choice-list">
                ${
                  state.pickupPoints.length
                    ? state.pickupPoints
                        .map(
                          (point) => `
                            <button
                              class="choice ${
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
                              <span class="choice-dot"></span>

                              <span>
                                <strong>
                                  ${escapeHtml(
                                    point.title
                                  )}
                                </strong>

                                <small>
                                  ${escapeHtml(
                                    point.address
                                  )}
                                </small>
                              </span>
                            </button>
                          `
                        )
                        .join("")
                    : `
                      <div class="empty" style="padding:20px 5px">
                        <strong>
                          Точек выдачи пока нет
                        </strong>
                      </div>
                    `
                }
              </div>

              ${
                pickup
                  ? `
                    <div
                      class="pickup-actions"
                    >
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
                              Как добраться
                            </a>
                          `
                          : ""
                      }

                    </div>
                  `
                  : ""
              }
            </div>
          `
          : `
            <div
              style="
                margin-top:14px;
              "
            >
              <div class="field">
                <label>Город</label>
                <input
                  id="deliveryCity"
                  type="text"
                  value="${escapeHtml(
                    state.checkout.city
                  )}"
                  placeholder="Москва"
                >
              </div>

              <div class="field">
                <label>Улица</label>
                <input
                  id="deliveryStreet"
                  type="text"
                  value="${escapeHtml(
                    state.checkout.street
                  )}"
                  placeholder="Тверская"
                >
              </div>

              <div
                style="
                  display:grid;
                  grid-template-columns:1fr 1fr;
                  gap:8px;
                "
              >
                <div class="field">
                  <label>Дом</label>
                  <input
                    id="deliveryHouse"
                    type="text"
                    value="${escapeHtml(
                      state.checkout.house
                    )}"
                    placeholder="12"
                  >
                </div>

                <div class="field">
                  <label>Квартира</label>
                  <input
                    id="deliveryApartment"
                    type="text"
                    value="${escapeHtml(
                      state.checkout.apartment
                    )}"
                    placeholder="25"
                  >
                </div>
              </div>
            </div>
          `
      }

      <div
        style="
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:8px;
          margin-top:8px;
        "
      >
        <button
          class="secondary-button"
          data-action="checkout-back"
          type="button"
        >
          ← Назад
        </button>

        <button
          class="primary-button"
          data-action="checkout-next"
          type="button"
        >
          Далее →
        </button>
      </div>
    `;
  }

  function checkoutStepReservation(
    total
  ) {
    const amount =
      num(
        state.config
          .reservation_amount
      );

    const rawCard =
      state.config.reservation_card;

    const card =
      typeof rawCard === "string"
        ? {
            card_number: rawCard,
            requisites: rawCard
          }
        : (rawCard || {});

    const cardNumber =
      card.card_number ||
      card.requisites ||
      "";

    const recipient =
      card.recipient ||
      state.config.reservation_recipient ||
      "";

    const instruction =
      state.config.reservation_text ||
      state.config.reservation_instruction ||
      "После перевода нажмите «Я внёс залог».";

    return `
      <div class="reservation-card">
        <div class="eyebrow">ЗАЛОГ</div>

        <h2 style="margin-bottom:6px">
          Переведите залог на карту
        </h2>

        <div style="margin-top:5px;color:#888;font-size:12px">
          Сумма залога
        </div>

        <div style="margin-top:4px;font-size:28px;font-weight:800">
          ${money(amount)}
        </div>

        <div class="requisites" style="margin-top:16px">
          <div class="requisites-row">
            <span>Карта</span>
            <strong>${escapeHtml(cardNumber || "Карта пока не указана")}</strong>
          </div>

          <div class="requisites-row">
            <span>Получатель</span>
            <strong>${escapeHtml(recipient || "—")}</strong>
          </div>

          <div class="requisites-row">
            <span>Сумма</span>
            <strong>${money(amount)}</strong>
          </div>
        </div>

        <div class="info-box">
          ${escapeHtml(instruction)}
        </div>

        <button
          class="primary-button"
          data-action="place-order"
          type="button"
          style="width:100%;margin-top:14px"
        >
          Я внёс залог
        </button>

        <button
          class="secondary-button"
          data-action="checkout-back"
          type="button"
          style="width:100%;margin-top:8px"
        >
          ← Назад
        </button>
      </div>
    `;
  }

  /* =========================================================
     PLACE ORDER
  ========================================================= */

  async function placeOrder() {
    if (!state.cart.length) {
      toast(
        "Корзина пуста"
      );
      return;
    }

    if (
      !state.checkout.name.trim()
    ) {
      state.checkout.step = 1;
      render();
      toast(
        "Введите имя"
      );
      return;
    }

    if (
      !state.checkout.contact.trim()
    ) {
      state.checkout.step = 1;
      render();
      toast(
        "Введите контакт"
      );
      return;
    }

    if (
      state.checkout.fulfillment ===
      "delivery"
    ) {
      if (
        !state.checkout.city.trim() ||
        !state.checkout.street.trim() ||
        !state.checkout.house.trim()
      ) {
        state.checkout.step = 2;
        render();
        toast(
          "Укажите город, улицу и дом"
        );
        return;
      }
    }

    if (
      state.checkout.fulfillment ===
        "pickup" &&
      !state.checkout.pickupPointId &&
      state.pickupPoints.length
    ) {
      state.checkout.step = 2;
      render();
      toast(
        "Выберите точку выдачи"
      );
      return;
    }

    const button =
      document.querySelector(
        '[data-action="place-order"]'
      );

    if (button) {
      button.disabled = true;
      button.textContent =
        "Создаём заказ…";
    }

    try {
      /*
        Backend currently creates one order per POST.
        Therefore the cart is sent sequentially.
      */

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
            state.checkout.apartment,

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
              ? state.checkout.promoCode
              : ""
        };

        const data =
          await api(
            "/api/orders",
            {
              method:"POST",
              body:payload
            }
          );

        if (data.order) {
          created.push(
            data.order
          );
        }
      }

      /* Пользователь нажал «Я внёс залог» на третьем этапе. */
      for (let index = 0; index < created.length; index++) {
        const order = created[index];

        if (
          num(order.reservation_amount) > 0 &&
          String(order.reservation_status || "") === "pending_payment"
        ) {
          try {
            const paid = await api(
              `/api/orders/${encodeURIComponent(order.id)}/reservation-paid`,
              {
                method: "POST",
                body: {}
              }
            );

            if (paid?.order) {
              created[index] = paid.order;
            }
          } catch (reservationError) {
            console.error(
              "RESERVATION PAID AFTER CHECKOUT:",
              reservationError
            );
          }
        }
      }

      state.cart = [];

      saveCart();

      state.checkout = {
        step:1,
        name:"",
        contact:"",
        comment:"",
        fulfillment:"pickup",
        pickupPointId:
          state.pickupPoints[0]
            ?.id || null,
        city:"",
        street:"",
        house:"",
        apartment:"",
        promoCode:"",
        promoDiscount:0,
        promoChecked:false
      };

      await loadOrders();

      if (created.length === 1 && created[0]?.id) {
        state.currentOrder =
          state.orders.find(
            (item) =>
              String(item.id) === String(created[0].id)
          ) || created[0];

        state.route = "order";
      } else {
        state.route = "orders";
      }

      render();

      toast(
        created.length > 1
          ? `Создано заказов: ${created.length}`
          : "Заявка на залог отправлена на проверку"
      );
    } catch (error) {
      if (button) {
        button.disabled = false;
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
      state.checkout.promoCode =
        "";

      state.checkout
        .promoDiscount = 0;

      state.checkout
        .promoChecked = false;

      render();

      return;
    }

    try {
      const data =
        await api(
          "/api/promo/validate",
          {
            method:"POST",
            body:{
              code,
              amount:
                cartSubtotal()
            }
          }
        );

      state.checkout
        .promoCode =
        code;

      state.checkout
        .promoDiscount =
        num(
          data.discount ??
          data.promo_discount ??
          0
        );

      state.checkout
        .promoChecked = true;

      render();

      toast(
        state.checkout
          .promoDiscount > 0
          ? "Промокод применён"
          : "Промокод не дал скидку"
      );
    } catch (error) {
      state.checkout
        .promoCode =
        code;

      state.checkout
        .promoDiscount = 0;

      state.checkout
        .promoChecked = true;

      render();

      toast(
        error.message ||
        "Промокод недействителен"
      );
    }
  }

  /* =========================================================
     ORDERS
  ========================================================= */

  function statusText(status) {
    const map = {
      new:"🆕 Новый",
      confirmed:"🔵 Подтверждён",
      processing:"⚙️ В обработке",
      ready:"📦 Готов к выдаче",
      completed:"🏁 Завершён",
      cancelled:"❌ Отменён"
    };

    return (
      map[status] ||
      "Заказ"
    );
  }

  function statusClass(status) {
    return [
      "new",
      "confirmed",
      "processing",
      "ready",
      "completed",
      "cancelled"
    ].includes(status)
      ? status
      : "new";
  }

  function reservationText(
    status
  ) {
    const map = {
      not_required:
        "Залог не требуется",

      pending_payment:
        "🟡 Ожидает оплаты",

      pending:
        "🟡 Ожидает оплаты",

      awaiting_confirmation:
        "🟠 Ожидает проверки",

      confirmed:
        "🟢 Залог подтверждён",

      rejected:
        "🔴 Залог отклонён"
    };

    return (
      map[status] ||
      status ||
      "—"
    );
  }

  function renderProfile(screen) {
    const user = state.me || telegramUser() || {};
    const username = user.username ? `@${user.username}` : "Username не указан";
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Пользователь Telegram";

    screen.innerHTML = `
      <div class="screen profile-page">
        <div class="page-head">
          <div class="eyebrow">PROFILE</div>
          <h1>Профиль</h1>
          <p>Ваш аккаунт IRoom</p>
        </div>

        <section class="order-card" style="margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:14px">
            <div style="width:54px;height:54px;border-radius:18px;background:var(--pink-soft);border:1px solid var(--pink-line);display:flex;align-items:center;justify-content:center;font-size:24px">
              ${escapeHtml((name[0] || "U").toUpperCase())}
            </div>
            <div>
              <strong style="font-size:18px">${escapeHtml(name)}</strong>
              <div style="color:#8c8c94;margin-top:4px">${escapeHtml(username)}</div>
            </div>
          </div>
        </section>

        <section class="section">
          <div class="section-heading">
            <div><h2>Мои заказы</h2><p>${state.orders.length ? `Заказов: ${state.orders.length}` : "История покупок"}</p></div>
            <button class="text-link" data-action="orders" type="button">Открыть →</button>
          </div>
          ${state.orders.length ? state.orders.slice(0,3).map(orderCard).join("") : `
            <div class="empty" style="padding:24px 8px"><strong>Заказов пока нет</strong><p>После оформления они появятся здесь.</p></div>
          `}
        </section>

        <section class="section">
          <div class="section-heading">
            <div><h2>Недавно просмотренные</h2><p>Товары, которые вы открывали</p></div>
          </div>
          ${state.viewedProducts.length ? `
            <div class="product-grid">
              ${state.viewedProducts.slice(0,6).map((item) => `
                <article class="product-card" data-product-id="${escapeHtml(item.id)}">
                  <div class="product-image">${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}" loading="lazy">` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#555;font-size:30px">IR</div>`}</div>
                  <div class="product-info"><h3>${escapeHtml(item.name)}</h3><div class="product-price">От ${money(item.price)}</div></div>
                </article>
              `).join("")}
            </div>
          ` : `<div class="empty" style="padding:24px 8px"><strong>Пока пусто</strong><p>Откройте товар в каталоге.</p></div>`}
        </section>
      </div>
    `;

    bindDynamicEvents();
  }

  function renderOrders(screen) {
    screen.innerHTML = `
      <div class="screen">

        <div class="page-head">
          <div class="eyebrow">
            IROOM
          </div>

          <h1>Мои заказы</h1>

          <p>
            История ваших заказов
          </p>
        </div>

        ${
          state.orders.length
            ? `
              <div class="orders-list">
                ${state.orders
                  .map(
                    orderCard
                  )
                  .join("")}
              </div>
            `
            : `
              <div class="empty">
                <div class="empty-icon">
                  ▣
                </div>

                <strong>
                  Заказов пока нет
                </strong>

                <p>
                  Оформите первую покупку
                </p>

                <button
                  class="primary-button"
                  data-action="catalog"
                  type="button"
                  style="margin-top:16px"
                >
                  Перейти в каталог
                </button>
              </div>
            `
        }

      </div>
    `;

    bindDynamicEvents();
  }

  function orderCard(order) {
    return `
      <article
        class="order-card"
        data-order-id="${escapeHtml(
          order.id
        )}"
      >
        <div class="order-card-top">

          <div>
            <h3>
              #${escapeHtml(
                order.display_id ||
                order.id
              )}
            </h3>

            <small>
              ${escapeHtml(
                formatDate(
                  order.created_at
                )
              )}
            </small>
          </div>

          <span
            class="status-pill status-${statusClass(
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

        <div
          style="
            margin-top:13px;
            font-size:12px;
            font-weight:700;
          "
        >
          ${escapeHtml(
            order.product_name ||
            "Товар"
          )}
        </div>

        <div
          style="
            margin-top:6px;
            color:#85858d;
            font-size:10px;
          "
        >
          ${escapeHtml(
            order.variant_text ||
            ""
          )}
        </div>

        <div
          style="
            display:flex;
            justify-content:space-between;
            gap:10px;
            margin-top:13px;
          "
        >
          <span
            class="reservation-pill ${
              order.reservation_status ===
              "confirmed"
                ? "confirmed"
                : ""
            }"
          >
            ${escapeHtml(
              reservationText(
                order.reservation_status
              )
            )}
          </span>

          <strong>
            ${money(
              order.price
            )}
          </strong>
        </div>
      </article>
    `;
  }

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

      state.currentOrder =
        data.order;

      state.route =
        "order";

      render();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось открыть заказ"
      );
    }
  }

  function renderOrderDetail(
    screen
  ) {
    const order =
      state.currentOrder;

    if (!order) {
      navigate("orders");
      return;
    }

    const selected =
      typeof order.selected_options ===
      "object"
        ? order.selected_options
        : parseJson(
            order.selected_options,
            {}
          );

    const optionsText =
      Object.entries(
        selected || {}
      )
        .map(
          ([key,value]) =>
            `${key}: ${value}`
        )
        .join(" · ");

    screen.innerHTML = `
      <div class="screen">

        <button
          class="back-button"
          data-action="orders"
          type="button"
        >
          ←
        </button>

        <div class="page-head">
          <div class="eyebrow">
            ORDER
          </div>

          <h1>
            #${escapeHtml(
              order.display_id ||
              order.id
            )}
          </h1>

          <p>
            ${escapeHtml(
              formatDate(
                order.created_at
              )
            )}
          </p>
        </div>

        <div class="order-card">
          <div class="order-card-top">
            <div>
              <h3>
                ${escapeHtml(
                  order.product_name ||
                  "Товар"
                )}
              </h3>

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

          ${
            optionsText
              ? `
                <div
                  style="
                    margin-top:12px;
                    color:#888;
                    font-size:10px;
                  "
                >
                  ${escapeHtml(
                    optionsText
                  )}
                </div>
              `
              : ""
          }
        </div>

        <div class="summary">
          <div class="summary-row">
            <span>Статус</span>
            <strong>
              ${escapeHtml(
                statusText(
                  order.status
                )
              )}
            </strong>
          </div>

          <div class="summary-row">
            <span>Залог</span>
            <strong>
              ${money(
                order.reservation_amount
              )}
            </strong>
          </div>

          <div class="summary-row">
            <span>Статус залога</span>
            <strong>
              ${escapeHtml(
                reservationText(
                  order.reservation_status
                )
              )}
            </strong>
          </div>

          <div class="summary-row">
            <span>Получение</span>
            <strong>
              ${
                order.fulfillment_type ===
                "delivery"
                  ? "Доставка"
                  : "Самовывоз"
              }
            </strong>
          </div>
        </div>

        ${
          order.reservation_status ===
          "pending_payment"
            ? reservationPaymentBlock(
                order
              )
            : order.reservation_status ===
              "awaiting_confirmation"
              ? `
                <div class="info-box">
                  🟠 Вы сообщили об оплате.
                  Заявка отправлена менеджеру
                  на ручную проверку.
                </div>
              `
              : order.reservation_status ===
                "confirmed"
                ? `
                  <div class="info-box">
                    🟢 Залог подтверждён.
                    Остаток оплачивается
                    наличными при получении.
                  </div>
                `
                : order.reservation_status ===
                  "rejected"
                  ? reservationPaymentBlock(
                      order,
                      true
                    )
                  : ""
        }

      </div>
    `;

    bindDynamicEvents();
  }

  function reservationPaymentBlock(
    order,
    retry = false
  ) {
    const amount =
      num(
        order.reservation_amount
      );

    const rawCard =
      state.config.reservation_card;

    const card =
      typeof rawCard === "string"
        ? {
            card_number: rawCard,
            requisites: rawCard
          }
        : (rawCard || {});

    const cardNumber =
      card.card_number ||
      card.requisites ||
      "";

    const recipient =
      card.recipient ||
      state.config.reservation_recipient ||
      "";

    return `
      <div
        class="reservation-card"
        style="margin-top:12px"
      >
        <div class="eyebrow">
          ${retry ? "DEPOSIT • ПОВТОРНАЯ ОПЛАТА" : "DEPOSIT"}
        </div>

        ${retry ? `
          <div class="info-box" style="color:#ff8585;border-color:rgba(255,80,80,.15);margin-bottom:10px">
            🔴 Предыдущая заявка на залог была отклонена. Проверьте реквизиты и отправьте подтверждение оплаты повторно.
          </div>
        ` : ""}

        <h2>
          ${money(amount)}
        </h2>

        <div class="requisites">
          <div class="requisites-row">
            <span>Реквизиты</span>
            <strong>
              ${escapeHtml(
                cardNumber ||
                "Уточните у менеджера"
              )}
            </strong>
          </div>

          <div class="requisites-row">
            <span>Получатель</span>
            <strong>
              ${escapeHtml(
                recipient ||
                "—"
              )}
            </strong>
          </div>
        </div>

        <div class="info-box">
          После оплаты нажмите
          «Я оплатил(а) залог».
          Оплата автоматически
          не подтверждается.
        </div>

        <button
          class="primary-button"
          data-reservation-paid="${escapeHtml(
            order.id
          )}"
          type="button"
          style="
            width:100%;
            margin-top:12px;
          "
        >
          Я оплатил(а) залог
        </button>
      </div>
    `;
  }

  async function reservationPaid(id) {
    const realOrderId = String(id || "").trim();

    if (!realOrderId) {
      toast("Не удалось определить ID заказа");
      return;
    }

    const button = document.querySelector(
      `[data-reservation-paid="${CSS.escape(realOrderId)}"]`
    );

    if (button) {
      button.disabled = true;
      button.textContent = "Отправляем на проверку…";
    }

    try {
      let data;

      try {
        data = await api(
          `/api/orders/${encodeURIComponent(realOrderId)}/reservation-paid`,
          { method: "POST", body: {} }
        );
      } catch (requestError) {
        /*
         * Сервер может успеть обновить статус заказа,
         * а ошибка произойти уже во время уведомления админов.
         * Поэтому обязательно проверяем заказ повторным GET.
         */
        try {
          const check = await api(
            `/api/orders/${encodeURIComponent(realOrderId)}`
          );

          if (check?.order?.reservation_status === "awaiting_confirmation") {
            data = { order: check.order };
          } else {
            throw requestError;
          }
        } catch {
          throw requestError;
        }
      }

      const updatedOrder = data?.order;

      if (!updatedOrder) {
        throw new Error("Сервер не вернул заказ после оплаты залога");
      }

      state.currentOrder = updatedOrder;
      state.orders = state.orders.map((order) =>
        String(order.id) === String(updatedOrder.id)
          ? updatedOrder
          : order
      );

      haptic("success");
      toast("Заявка отправлена на проверку");

      await loadMe();
      state.route = "profile";
      render();
    } catch (error) {
      console.error("RESERVATION PAID:", error);
      toast(error.message || "Не удалось отправить заявку");

      if (button) {
        button.disabled = false;
        button.textContent = "Я оплатил(а) залог";
      }
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
              <span class="drawer-icon">
                ›
              </span>

              <span>
                ${escapeHtml(
                  category.name
                )}
              </span>
            </button>
          `
        )
        .join("");

    $$("[data-drawer-category]")
      .forEach((button) => {
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
      });
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
     EVENTS
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
          navigate("home")
      );

    $("#cartButton")
      ?.addEventListener(
        "click",
        () =>
          navigate("cart")
      );

    $("#profileButton")
      ?.addEventListener(
        "click",
        async () => {
          try {
            await loadMe();
            await loadOrders();
            loadViewedProducts();
            navigate("profile");
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
          state.search = "";

          if (
            state.route ===
            "catalog"
          ) {
            renderCatalog(
              $("#screen")
            );
          }

          input.focus();
        }
      );

    $("#globalSearch")
      ?.addEventListener(
        "input",
        (event) => {
          state.search =
            event.target.value;

          if (
            state.route !==
            "catalog"
          ) {
            state.route =
              "catalog";
          }

          renderCatalog(
            $("#screen")
          );

          const searchInput =
            $("#globalSearch");

          if (
            searchInput &&
            document.activeElement !==
              searchInput
          ) {
            searchInput.focus();

            try {
              searchInput.setSelectionRange(
                searchInput.value.length,
                searchInput.value.length
              );
            } catch {}
          }
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

          window.location.replace(
            "/admin.html"
          );
        }
      );
  }

  function bindDynamicEvents() {
    $$("[data-product-id]")
      .forEach((card) => {
        card.addEventListener(
          "click",
          () =>
            openProduct(
              card.dataset
                .productId
            )
        );
      });

    $$("[data-action]")
      .forEach((element) => {
        element.addEventListener(
          "click",
          () =>
            handleAction(
              element.dataset
                .action
            )
        );
      });

    $$("[data-category]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            navigate(
              "catalog",
              {
                categoryId:
                  button.dataset
                    .category ||
                  null
              }
            )
        );
      });

    $$("[data-option-key]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            state.selectedOptions[
              button.dataset
                .optionKey
            ] =
              button.dataset
                .optionValue;

            renderProduct(
              $("#screen")
            );

            window.scrollTo({
              top:0,
              behavior:"smooth"
            });
          }
        );
      });

    $$("[data-cart-minus]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            changeQuantity(
              button.dataset
                .cartMinus,
              -1
            )
        );
      });

    $$("[data-cart-plus]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            changeQuantity(
              button.dataset
                .cartPlus,
              1
            )
        );
      });

    $$("[data-cart-delete]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            removeCartItem(
              button.dataset
                .cartDelete
            )
        );
      });

    $$("[data-order-id]")
      .forEach((card) => {
        card.addEventListener(
          "click",
          () =>
            openOrder(
              card.dataset
                .orderId
            )
        );
      });

    $$("[data-fulfillment]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            state.checkout
              .fulfillment =
              button.dataset
                .fulfillment;

            render();
          }
        );
      });

    $$("[data-pickup-id]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            state.checkout
              .pickupPointId =
              button.dataset
                .pickupId;

            render();
          }
        );
      });

    $$("[data-reservation-paid]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            reservationPaid(
              button.dataset
                .reservationPaid
            )
        );
      });

    $("#promoButton")
      ?.addEventListener(
        "click",
        applyPromo
      );
  }

  function handleAction(
    action
  ) {
    if (
      action ===
      "catalog"
    ) {
      navigate("catalog");
      return;
    }

    if (
      action ===
      "profile"
    ) {
      Promise.all([loadMe(), loadOrders()])
        .then(() => {
          loadViewedProducts();
          navigate("profile");
        })
        .catch((error) => toast(error.message || "Не удалось открыть профиль"));
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
        .catch((error) =>
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
      navigate("cart");
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
        navigate("catalog");
      } else if (
        state.route ===
        "checkout"
      ) {
        navigate("cart");
      } else if (
        state.route ===
        "order"
      ) {
        navigate("orders");
      } else {
        navigate("home");
      }

      return;
    }

    if (
      action ===
      "add-cart"
    ) {
      if (!state.product) return;

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
      if (!state.product) return;

      const variant =
        findMatchingVariant();

      const key =
        cartKey(
          state.product.id,
          variant?.id,
          state.selectedOptions
        );

      state.cart = [
        {
          key,

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
              ? num(variant.id)
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

          quantity:1
        }
      ];

      saveCart();

      state.checkout.step =
        1;

      navigate("checkout");

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

      navigate("checkout");

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
          !state.checkout
            .name
            .trim()
        ) {
          toast(
            "Введите имя"
          );
          return;
        }

        if (
          !state.checkout
            .contact
            .trim()
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
          "delivery"
        ) {
          if (
            !state.checkout.city ||
            !state.checkout.street ||
            !state.checkout.house
          ) {
            toast(
              "Укажите город, улицу и дом"
            );
            return;
          }
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

      state.checkout.step =
        Math.max(
          1,
          state.checkout.step - 1
        );

      render();
    }
  }

  function saveCurrentCheckoutFields() {
    saveCheckoutData();
    saveCheckoutReceiving();
  }

  function saveCheckoutData() {
    state.checkout.name =
      $("#checkoutName")
        ?.value
        .trim() ||
      state.checkout.name;

    state.checkout.contact =
      $("#checkoutContact")
        ?.value
        .trim() ||
      state.checkout.contact;

    state.checkout.comment =
      $("#checkoutComment")
        ?.value
        .trim() ||
      state.checkout.comment;
  }

  function saveCheckoutReceiving() {
    const fulfillment =
      document.querySelector(
        "[data-fulfillment].choice.active"
      )?.dataset.fulfillment;

    if (fulfillment) {
      state.checkout.fulfillment = fulfillment;
    }

    const pickupId =
      document.querySelector(
        "[data-pickup-id].choice.active"
      )?.dataset.pickupId;

    if (pickupId) {
      state.checkout.pickupPointId = pickupId;
    }

    state.checkout.city =
      $("#deliveryCity")
        ?.value
        .trim() ||
      state.checkout.city;

    state.checkout.street =
      $("#deliveryStreet")
        ?.value
        .trim() ||
      state.checkout.street;

    state.checkout.house =
      $("#deliveryHouse")
        ?.value
        .trim() ||
      state.checkout.house;

    state.checkout.apartment =
      $("#deliveryApartment")
        ?.value
        .trim() ||
      state.checkout.apartment;
  }

  /* =========================================================
     BOOT
  ========================================================= */

  async function boot() {
    initTelegram();
    bindStaticEvents();
    updateCartBadge();
    loadViewedProducts();

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
          <div class="empty" style="padding-top:90px">
            <div class="empty-icon">!</div>

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
              class="primary-button"
              id="retryButton"
              type="button"
              style="margin-top:16px"
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