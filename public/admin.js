/* =========================================================
   IROOM ADMIN
   Full admin controller
   Compatible with current IRoom server.js
========================================================= */

(() => {
  "use strict";

  /* =========================================================
     TELEGRAM
  ========================================================= */

  const tg = window.Telegram?.WebApp || null;

  if (tg) {
    try {
      tg.ready();
      tg.expand();

      tg.setHeaderColor("#000000");
      tg.setBackgroundColor("#000000");
    } catch {}
  }

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const ADMIN_IDS = new Set([
    "5082864281",
    "5975037118"
  ]);

  const ORDER_STATUSES = [
    ["new", "Новый"],
    ["confirmed", "Подтверждён"],
    ["processing", "В обработке"],
    ["ready", "Готов к выдаче"],
    ["completed", "Завершён"],
    ["cancelled", "Отменён"]
  ];

  const RESERVATION_STATUSES = [
    ["not_required", "Не требуется"],
    ["pending_payment", "Ожидает оплаты"],
    ["pending", "Ожидает оплаты"],
    ["awaiting_confirmation", "Ожидает проверки"],
    ["confirmed", "Залог подтверждён"],
    ["rejected", "Залог отклонён"]
  ];

  /* =========================================================
     STATE
  ========================================================= */

  const state = {
    section: "dashboard",

    orders: [],
    products: [],
    categories: [],
    banners: [],
    promoCodes: [],
    pickupPoints: [],
    users: [],

    settings: {},

    orderFilter: "all",
    orderSearch: "",
    productSearch: "",
    userSearch: "",

    currentOrder: null,
    currentProduct: null,

    adminUser: null
  };

  /* =========================================================
     HELPERS
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

  function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function price(value) {
    return `${number(value).toLocaleString("ru-RU")} ₽`;
  }

  function formatDate(value) {
    if (!value) return "—";

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

  function telegramInitData() {
    return String(tg?.initData || "");
  }

  function telegramUser() {
    return tg?.initDataUnsafe?.user || null;
  }

  function isAdmin() {
    const id = String(
      telegramUser()?.id || ""
    );

    return ADMIN_IDS.has(id);
  }

  /* =========================================================
     API
  ========================================================= */

  async function api(url, options = {}) {
    const headers = {
      ...(options.headers || {})
    };

    const initData = telegramInitData();

    if (initData) {
      headers["x-telegram-init-data"] = initData;
    }

    let body = options.body;

    if (
      body &&
      typeof body !== "string"
    ) {
      headers["Content-Type"] =
        "application/json";

      body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      body
    });

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        `Ошибка ${response.status}`
      );
    }

    return data;
  }

  /* =========================================================
     TOAST
  ========================================================= */

  let toastTimer = null;

  function toast(message) {
    const element = $("#adminToast");

    if (!element) return;

    element.textContent = String(
      message || ""
    );

    element.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      element.classList.remove("show");
    }, 2800);
  }

  /* =========================================================
     MODAL
  ========================================================= */

  function openModal(html) {
    const backdrop = $("#modalBackdrop");
    const content = $("#modalContent");

    if (!backdrop || !content) {
      return;
    }

    content.innerHTML =
      `<div class="modal-content">${html}</div>`;

    backdrop.classList.add("open");

    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const backdrop = $("#modalBackdrop");

    if (!backdrop) return;

    backdrop.classList.remove("open");

    document.body.style.overflow = "";
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  function showSection(section) {
    const target =
      document.querySelector(
        `#section-${section}`
      );

    if (!target) return;

    state.section = section;

    $$(".admin-section").forEach(
      (element) => {
        element.classList.remove("active");
      }
    );

    target.classList.add("active");

    $$(".nav-item").forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.section === section
        );
      }
    );

    closeMobileMenu();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    if (section === "dashboard") {
      loadDashboard();
    }

    if (section === "orders") {
      loadOrders();
    }

    if (section === "products") {
      loadProducts();
    }

    if (section === "categories") {
      loadCategories();
    }

    if (section === "promocodes") {
      loadPromoCodes();
    }

    if (section === "banners") {
      loadBanners();
    }

    if (section === "reservation") {
      loadReservation();
      loadReservationSettings();
    }

    if (section === "pickup") {
      loadPickupPoints();
    }

    if (section === "users") {
      loadUsers();
    }

    if (section === "settings") {
      loadStoreSettings();
    }
  }

  /* =========================================================
     MOBILE MENU
  ========================================================= */

  function openMobileMenu() {
    $("#sidebar")?.classList.add("open");
    $("#sidebarOverlay")?.classList.add("open");
  }

  function closeMobileMenu() {
    $("#sidebar")?.classList.remove("open");
    $("#sidebarOverlay")?.classList.remove("open");
  }

  /* =========================================================
     STATUS HELPERS
  ========================================================= */

  function statusText(status) {
    const found =
      ORDER_STATUSES.find(
        ([value]) => value === status
      );

    return found?.[1] || status || "—";
  }

  function statusClass(status) {
    const allowed = [
      "new",
      "confirmed",
      "processing",
      "ready",
      "completed",
      "cancelled"
    ];

    return allowed.includes(status)
      ? status
      : "new";
  }

  function reservationText(status) {
    const found =
      RESERVATION_STATUSES.find(
        ([value]) => value === status
      );

    return found?.[1] || status || "—";
  }

  function reservationClass(status) {
    if (status === "confirmed") {
      return "reservation-confirmed";
    }

    return "reservation";
  }

  /* =========================================================
     DASHBOARD
  ========================================================= */

  async function loadDashboard() {
    try {
      const [
        ordersData,
        productsData
      ] = await Promise.all([
        api("/api/admin/orders"),
        api("/api/products")
      ]);

      state.orders =
        Array.isArray(ordersData.orders)
          ? ordersData.orders
          : [];

      state.products =
        Array.isArray(productsData.products)
          ? productsData.products
          : [];

      const total =
        state.orders.length;

      const newOrders =
        state.orders.filter(
          (order) =>
            order.status === "new"
        ).length;

      const awaitingReservation =
        state.orders.filter(
          (order) =>
            order.reservation_status ===
            "awaiting_confirmation"
        ).length;

      if ($("#statOrders")) {
        $("#statOrders").textContent =
          total;
      }

      if ($("#statNewOrders")) {
        $("#statNewOrders").textContent =
          newOrders;
      }

      if ($("#statReservation")) {
        $("#statReservation").textContent =
          awaitingReservation;
      }

      if ($("#statProducts")) {
        $("#statProducts").textContent =
          state.products.length;
      }

      renderDashboardOrders();
      updateOrdersBadge();
    } catch (error) {
      console.error(
        "Dashboard:",
        error
      );

      toast(
        error.message ||
        "Не удалось загрузить обзор"
      );
    }
  }

  function renderDashboardOrders() {
    const container =
      $("#dashboardOrders");

    if (!container) return;

    const orders =
      [...state.orders]
        .sort(
          (a, b) =>
            number(b.id) -
            number(a.id)
        )
        .slice(0, 6);

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">▣</div>
          <strong>Заказов пока нет</strong>
          <p>Новые заказы появятся здесь</p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      orders.map((order) => {
        return `
          <div
            class="order-preview-row"
            data-order-id="${escapeHtml(order.id)}"
          >
            <div class="order-main">
              <strong>
                #${escapeHtml(
                  order.display_id ||
                  `IR-${1000 + number(order.id)}`
                )}
              </strong>

              <small>
                ${escapeHtml(
                  order.product_name ||
                  "Товар"
                )}
              </small>
            </div>

            <div class="order-side">
              <strong>
                ${price(
                  order.total ??
                  order.price
                )}
              </strong>

              <small>
                <span class="status ${statusClass(order.status)}">
                  ${escapeHtml(
                    statusText(order.status)
                  )}
                </span>
              </small>
            </div>
          </div>
        `;
      }).join("");

    $$(".order-preview-row")
      .forEach((row) => {
        row.addEventListener(
          "click",
          () =>
            openOrder(
              row.dataset.orderId
            )
        );
      });
  }

  /* =========================================================
     ORDERS
  ========================================================= */

  async function loadOrders() {
    const container =
      $("#ordersTable");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/orders"
        );

      state.orders =
        Array.isArray(data.orders)
          ? data.orders
          : [];

      renderOrders();
      updateOrdersBadge();
    } catch (error) {
      console.error(
        "Orders:",
        error
      );

      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">!</div>

            <strong>
              Не удалось загрузить заказы
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  function getFilteredOrders() {
    let orders = [...state.orders];

    if (
      state.orderFilter !==
      "all"
    ) {
      orders =
        orders.filter(
          (order) =>
            order.status ===
            state.orderFilter
        );
    }

    const query =
      state.orderSearch
        .trim()
        .toLowerCase();

    if (query) {
      orders =
        orders.filter(
          (order) => {
            const text = [
              order.id,
              order.display_id,
              order.product_name,
              order.customer_name,
              order.first_name,
              order.last_name,
              order.username,
              order.telegram_user_id
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

            return text.includes(query);
          }
        );
    }

    return orders;
  }

  function renderOrders() {
    const container =
      $("#ordersTable");

    if (!container) return;

    const orders =
      getFilteredOrders();

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">▣</div>
          <strong>Заказов не найдено</strong>
          <p>Попробуйте изменить фильтр</p>
        </div>
      `;

      return;
    }

    const head = `
      <div class="table-row table-head">
        <div>Заказ</div>
        <div>Клиент / товар</div>
        <div>Сумма</div>
        <div>Статус</div>
        <div>Залог</div>
        <div></div>
      </div>
    `;

    const rows =
      orders.map((order) => {
        const customer =
          order.customer_name ||
          [
            order.first_name,
            order.last_name
          ]
            .filter(Boolean)
            .join(" ") ||
          order.username ||
          order.user_username ||
          "Клиент";

        return `
          <div
            class="table-row"
            data-order-id="${escapeHtml(order.id)}"
          >
            <div class="table-cell">
              <strong>
                #${escapeHtml(
                  order.display_id ||
                  `IR-${1000 + number(order.id)}`
                )}
              </strong>

              <small>
                ${escapeHtml(
                  formatDate(
                    order.created_at
                  )
                )}
              </small>
            </div>

            <div class="table-cell">
              <strong>
                ${escapeHtml(customer)}
              </strong>

              <small>
                ${escapeHtml(
                  order.product_name ||
                  "Товар"
                )}
              </small>
            </div>

            <div class="table-cell">
              <strong>
                ${price(
                  order.total ??
                  order.price
                )}
              </strong>
            </div>

            <div class="table-cell">
              <span class="status ${statusClass(order.status)}">
                ${escapeHtml(
                  statusText(order.status)
                )}
              </span>
            </div>

            <div class="table-cell">
              <span class="status ${reservationClass(order.reservation_status)}">
                ${escapeHtml(
                  reservationText(
                    order.reservation_status
                  )
                )}
              </span>
            </div>

            <div>
              <button
                class="row-button"
                data-open-order="${escapeHtml(order.id)}"
                type="button"
              >
                Открыть
              </button>
            </div>
          </div>
        `;
      }).join("");

    container.innerHTML =
      head + rows;

    $$("[data-open-order]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          (event) => {
            event.stopPropagation();

            openOrder(
              button.dataset.openOrder
            );
          }
        );
      });

    $$(".table-row[data-order-id]")
      .forEach((row) => {
        row.addEventListener(
          "click",
          (event) => {
            if (
              event.target.closest("button")
            ) {
              return;
            }

            openOrder(
              row.dataset.orderId
            );
          }
        );
      });
  }

  function updateOrdersBadge() {
    const badge =
      $("#ordersBadge");

    if (!badge) return;

    const count =
      state.orders.filter(
        (order) =>
          order.status === "new" ||
          order.reservation_status ===
            "awaiting_confirmation"
      ).length;

    if (count <= 0) {
      badge.classList.add("hidden");
      return;
    }

    badge.classList.remove("hidden");

    badge.textContent =
      count > 99
        ? "99+"
        : String(count);
  }

  /* =========================================================
     ORDER DETAIL
  ========================================================= */

  async function openOrder(id) {
    try {
      const data =
        await api(
          `/api/admin/orders/${encodeURIComponent(id)}`
        );

      const order =
        data.order || data;

      state.currentOrder = order;

      renderOrderModal(order);
    } catch (error) {
      toast(
        error.message ||
        "Не удалось открыть заказ"
      );
    }
  }

  function renderOrderModal(order) {
    const customer =
      order.customer_name ||
      [
        order.user_first_name,
        order.user_last_name
      ]
        .filter(Boolean)
        .join(" ") ||
      [
        order.first_name,
        order.last_name
      ]
        .filter(Boolean)
        .join(" ") ||
      order.username ||
      order.user_username ||
      "Клиент";

    const username =
      order.username ||
      order.user_username ||
      "";

    const product =
      order.product_name ||
      "Товар";

    const options =
      parseJson(
        order.selected_options,
        {}
      );

    const optionsText =
      Object.entries(options)
        .map(
          ([key, value]) =>
            `${key}: ${value}`
        )
        .join(" · ");

    openModal(`
      <div class="eyebrow">ORDER</div>

      <h2
        style="
          margin:0;
          font-size:28px;
          letter-spacing:-1px;
        "
      >
        #${escapeHtml(
          order.display_id ||
          `IR-${1000 + number(order.id)}`
        )}
      </h2>

      <p
        style="
          margin:7px 0 20px;
          color:#92929a;
          font-size:12px;
        "
      >
        ${escapeHtml(
          formatDate(order.created_at)
        )}
      </p>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:9px;
          margin-bottom:18px;
        "
      >
        <div class="order-detail-box">
          <small>Статус</small>
          <strong>
            ${escapeHtml(
              statusText(order.status)
            )}
          </strong>
        </div>

        <div class="order-detail-box">
          <small>Залог</small>
          <strong>
            ${escapeHtml(
              reservationText(
                order.reservation_status
              )
            )}
          </strong>
        </div>
      </div>

      <div
        style="
          padding:17px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:17px;
          background:rgba(255,255,255,.035);
          margin-bottom:12px;
        "
      >
        <div
          style="
            color:#777;
            font-size:10px;
            margin-bottom:6px;
          "
        >
          ТОВАР
        </div>

        <strong style="font-size:15px">
          ${escapeHtml(product)}
        </strong>

        ${
          order.variant_text
            ? `
              <div
                style="
                  margin-top:6px;
                  color:#92929a;
                  font-size:11px;
                "
              >
                ${escapeHtml(
                  order.variant_text
                )}
              </div>
            `
            : ""
        }

        ${
          optionsText
            ? `
              <div
                style="
                  margin-top:6px;
                  color:#777;
                  font-size:10px;
                "
              >
                ${escapeHtml(optionsText)}
              </div>
            `
            : ""
        }
      </div>

      <div
        style="
          padding:17px;
          border:1px solid rgba(255,255,255,.08);
          border-radius:17px;
          background:rgba(255,255,255,.035);
          margin-bottom:12px;
        "
      >
        <div
          style="
            color:#777;
            font-size:10px;
            margin-bottom:6px;
          "
        >
          КЛИЕНТ
        </div>

        <strong style="font-size:14px">
          ${escapeHtml(customer)}
        </strong>

        ${
          username
            ? `
              <div
                style="
                  margin-top:5px;
                  color:#92929a;
                  font-size:11px;
                "
              >
                @${escapeHtml(username)}
              </div>
            `
            : ""
        }

        <div
          style="
            margin-top:5px;
            color:#666;
            font-size:10px;
          "
        >
          Telegram ID:
          ${escapeHtml(
            order.telegram_user_id ||
            "—"
          )}
        </div>

        ${
          order.customer_contact
            ? `
              <div
                style="
                  margin-top:5px;
                  color:#92929a;
                  font-size:11px;
                "
              >
                Контакт:
                ${escapeHtml(
                  order.customer_contact
                )}
              </div>
            `
            : ""
        }
      </div>

      <div
        style="
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:9px;
          margin-bottom:12px;
        "
      >
        <div class="order-detail-box">
          <small>Стоимость</small>
          <strong>
            ${price(
              order.total ??
              order.price
            )}
          </strong>
        </div>

        <div class="order-detail-box">
          <small>Залог</small>
          <strong>
            ${price(
              order.reservation_amount
            )}
          </strong>
        </div>
      </div>

      ${
        order.fulfillment_type
          ? `
            <div
              style="
                padding:15px;
                margin-bottom:12px;
                border-radius:16px;
                background:rgba(255,255,255,.035);
                border:1px solid rgba(255,255,255,.07);
              "
            >
              <div
                style="
                  color:#777;
                  font-size:10px;
                  margin-bottom:6px;
                "
              >
                ПОЛУЧЕНИЕ
              </div>

              <div
                style="
                  color:#ddd;
                  font-size:12px;
                  line-height:1.5;
                "
              >
                ${escapeHtml(
                  order.fulfillment_type ===
                  "delivery"
                    ? "Доставка"
                    : "Самовывоз"
                )}
              </div>

              ${
                order.address
                  ? `
                    <div
                      style="
                        margin-top:5px;
                        color:#92929a;
                        font-size:11px;
                      "
                    >
                      ${escapeHtml(
                        order.address
                      )}
                    </div>
                  `
                  : ""
              }
            </div>
          `
          : ""
      }

      ${
        order.customer_comment ||
        order.comment
          ? `
            <div
              style="
                padding:16px;
                margin-bottom:12px;
                border-radius:16px;
                background:rgba(255,255,255,.035);
                border:1px solid rgba(255,255,255,.07);
              "
            >
              <div
                style="
                  color:#777;
                  font-size:10px;
                  margin-bottom:6px;
                "
              >
                КОММЕНТАРИЙ
              </div>

              <div
                style="
                  color:#ddd;
                  font-size:12px;
                  line-height:1.5;
                "
              >
                ${escapeHtml(
                  order.customer_comment ||
                  order.comment
                )}
              </div>
            </div>
          `
          : ""
      }

      <div
        style="
          display:flex;
          flex-direction:column;
          gap:8px;
          margin-top:17px;
        "
      >
        <label
          style="
            color:#92929a;
            font-size:10px;
          "
        >
          Статус заказа
        </label>

        <select
          id="orderStatusSelect"
          style="
            width:100%;
            min-height:45px;
            padding:0 12px;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.08);
            background:#151518;
            color:#fff;
            outline:none;
          "
        >
          ${ORDER_STATUSES.map(
            ([value, label]) => `
              <option
                value="${value}"
                ${
                  order.status === value
                    ? "selected"
                    : ""
                }
              >
                ${label}
              </option>
            `
          ).join("")}
        </select>

        <button
          class="primary-button"
          id="saveOrderStatus"
          type="button"
        >
          Сохранить статус
        </button>

        ${
          order.reservation_status ===
          "awaiting_confirmation"
            ? `
              <div
                style="
                  display:grid;
                  grid-template-columns:1fr 1fr;
                  gap:8px;
                  margin-top:5px;
                "
              >
                <button
                  class="confirm-button"
                  id="confirmReservation"
                  type="button"
                  style="
                    min-height:44px;
                    border-radius:12px;
                    cursor:pointer;
                    font-weight:700;
                    border:0;
                  "
                >
                  ✓ Подтвердить залог
                </button>

                <button
                  class="reject-button"
                  id="rejectReservation"
                  type="button"
                  style="
                    min-height:44px;
                    border-radius:12px;
                    cursor:pointer;
                    font-weight:700;
                    border:0;
                  "
                >
                  × Отклонить
                </button>
              </div>
            `
            : ""
        }
      </div>
    `);

    $("#saveOrderStatus")
      ?.addEventListener(
        "click",
        () =>
          updateOrderStatus(order.id)
      );

    $("#confirmReservation")
      ?.addEventListener(
        "click",
        () =>
          updateReservation(
            order.id,
            "confirmed"
          )
      );

    $("#rejectReservation")
      ?.addEventListener(
        "click",
        () =>
          updateReservation(
            order.id,
            "rejected"
          )
      );
  }

  async function updateOrderStatus(id) {
    const select =
      $("#orderStatusSelect");

    if (!select) return;

    try {
      await api(
        `/api/admin/orders/${encodeURIComponent(id)}/status`,
        {
          method: "PUT",
          body: {
            status: select.value
          }
        }
      );

      toast(
        "Статус заказа обновлён"
      );

      closeModal();

      await loadOrders();
      await loadDashboard();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось изменить статус"
      );
    }
  }

  async function updateReservation(
    id,
    status
  ) {
    try {
      await api(
        `/api/admin/orders/${encodeURIComponent(id)}/reservation`,
        {
          method: "PUT",
          body: {
            reservation_status: status
          }
        }
      );

      toast(
        status === "confirmed"
          ? "Залог подтверждён"
          : "Залог отклонён"
      );

      closeModal();

      await loadOrders();
      await loadReservation();
      await loadDashboard();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось изменить статус залога"
      );
    }
  }

  /* =========================================================
     PRODUCTS
  ========================================================= */

  async function loadProducts() {
    const container =
      $("#productsGrid");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/products"
        );

      state.products =
        Array.isArray(data.products)
          ? data.products
          : [];

      renderProducts();
    } catch (error) {
      console.error(
        "Products:",
        error
      );

      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">!</div>

            <strong>
              Не удалось загрузить товары
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  function renderProducts() {
    const container =
      $("#productsGrid");

    if (!container) return;

    const query =
      state.productSearch
        .trim()
        .toLowerCase();

    let products =
      [...state.products];

    if (query) {
      products =
        products.filter(
          (product) =>
            [
              product.name,
              product.title,
              product.slug,
              product.category_name
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(query)
        );
    }

    if (!products.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">▤</div>

          <strong>
            Товаров нет
          </strong>

          <p>
            Добавьте первый товар
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      products.map((product) => {
        const image =
          product.image_url ||
          product.image ||
          "";

        return `
          <article class="admin-product">
            <div class="admin-product-image">
              ${
                image
                  ? `
                    <img
                      src="${escapeHtml(image)}"
                      alt="${escapeHtml(
                        product.name || ""
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
                        color:#555;
                        font-size:30px;
                      "
                    >
                      I
                    </div>
                  `
              }
            </div>

            <div class="admin-product-info">
              <h3>
                ${escapeHtml(
                  product.name ||
                  product.title ||
                  "Товар"
                )}
              </h3>

              <p>
                ${
                  product.category_name
                    ? escapeHtml(
                        product.category_name
                      )
                    : product.category_id
                      ? `Категория #${escapeHtml(
                          product.category_id
                        )}`
                      : "Без категории"
                }
              </p>

              <div class="admin-product-price">
                ${price(product.price)}
              </div>

              ${
                Number(product.is_new) === 1
                  ? `
                    <div
                      style="
                        margin-top:6px;
                        color:#ff2d8d;
                        font-size:10px;
                        font-weight:700;
                      "
                    >
                      НОВИНКА
                    </div>
                  `
                  : ""
              }

              <div class="admin-product-actions">
                <button
                  type="button"
                  data-edit-product="${escapeHtml(product.id)}"
                >
                  Изменить
                </button>

                <button
                  type="button"
                  data-delete-product="${escapeHtml(product.id)}"
                >
                  Удалить
                </button>
              </div>
            </div>
          </article>
        `;
      }).join("");

    $$("[data-edit-product]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            openProductEditor(
              button.dataset.editProduct
            )
        );
      });

    $$("[data-delete-product]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            deleteProduct(
              button.dataset.deleteProduct
            )
        );
      });
  }

  function normalizeOptionLines(value) {
    if (!Array.isArray(value)) {
      return "";
    }

    return value
      .map((item) => {
        if (
          typeof item === "string"
        ) {
          return item;
        }

        return `${item?.name || ""}|${number(
          item?.surcharge ||
          item?.extra ||
          0
        )}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  function optionLines(value) {
    return String(value || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts =
          line.split("|");

        return {
          name:
            String(
              parts[0] || ""
            ).trim(),

          surcharge:
            number(parts[1] || 0)
        };
      })
      .filter(
        (item) => item.name
      );
  }

  function parseImages(value) {
    return String(value || "")
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function openProductEditor(id = null) {
    const product =
      state.products.find(
        (item) =>
          String(item.id) ===
          String(id)
      );

    state.currentProduct =
      product || null;

    const priceOptions =
      parseJson(
        product?.price_options,
        {}
      ) || {};

    openModal(`
      <div class="eyebrow">
        CATALOG
      </div>

      <h2
        style="
          margin:0 0 20px;
          font-size:27px;
          letter-spacing:-1px;
        "
      >
        ${
          product
            ? "Изменить товар"
            : "Новый товар"
        }
      </h2>

      <form
        id="productForm"
        class="settings-form"
        style="padding:0"
      >
        <label>
          <span>Название</span>

          <input
            id="productName"
            type="text"
            value="${escapeHtml(
              product?.name || ""
            )}"
            required
          >
        </label>

        <label>
          <span>Категория</span>

          <select
            id="productCategory"
          >
            <option value="">
              Без категории
            </option>

            ${state.categories.map(
              (category) => `
                <option
                  value="${escapeHtml(category.id)}"
                  ${
                    String(
                      product?.category_id || ""
                    ) ===
                    String(category.id)
                      ? "selected"
                      : ""
                  }
                >
                  ${escapeHtml(
                    category.name ||
                    category.title ||
                    "Категория"
                  )}
                </option>
              `
            ).join("")}
          </select>
        </label>

        <div
          style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:9px;
          "
        >
          <label>
            <span>Цена</span>

            <input
              id="productPrice"
              type="number"
              min="0"
              step="1"
              value="${escapeHtml(
                product?.price ?? ""
              )}"
              required
            >
          </label>

          <label>
            <span>Старая цена</span>

            <input
              id="productOldPrice"
              type="number"
              min="0"
              step="1"
              value="${escapeHtml(
                product?.old_price ?? ""
              )}"
            >
          </label>
        </div>

        <label>
          <span>Главное изображение URL</span>

          <input
            id="productImage"
            type="url"
            value="${escapeHtml(
              product?.image_url || ""
            )}"
            placeholder="https://..."
          >
        </label>

        <label>
          <span>
            Дополнительные изображения
            — по одному URL на строку
          </span>

          <textarea
            id="productImages"
            rows="4"
            placeholder="https://..."
          >${escapeHtml(
            Array.isArray(
              parseJson(
                product?.images,
                []
              )
            )
              ? parseJson(
                  product?.images,
                  []
                ).join("\n")
              : ""
          )}</textarea>
        </label>

        <label>
          <span>Описание</span>

          <textarea
            id="productDescription"
            rows="5"
          >${escapeHtml(
            product?.description || ""
          )}</textarea>
        </label>

        <label
          style="
            flex-direction:row;
            align-items:center;
            gap:10px;
          "
        >
          <input
            id="productIsNew"
            type="checkbox"
            ${
              Number(product?.is_new) === 1
                ? "checked"
                : ""
            }
            style="
              width:18px;
              height:18px;
              accent-color:#ff2d8d;
            "
          >

          <span>
            Показывать как «Новинка»
          </span>
        </label>

        <div
          style="
            padding:15px;
            border:1px solid rgba(255,255,255,.08);
            border-radius:16px;
            background:rgba(255,255,255,.025);
          "
        >
          <div
            style="
              color:#fff;
              font-size:13px;
              font-weight:700;
              margin-bottom:6px;
            "
          >
            Варианты цены
          </div>

          <div
            style="
              color:#777;
              font-size:10px;
              line-height:1.5;
              margin-bottom:13px;
            "
          >
            Формат строки:
            название|доплата
          </div>

          <label>
            <span>Цвета</span>

            <textarea
              id="optionColors"
              rows="3"
              placeholder="Black|0&#10;White|0&#10;Orange|5000"
            >${escapeHtml(
              normalizeOptionLines(
                priceOptions.colors
              )
            )}</textarea>
          </label>

          <label>
            <span>Память</span>

            <textarea
              id="optionMemories"
              rows="3"
              placeholder="128 GB|0&#10;256 GB|10000"
            >${escapeHtml(
              normalizeOptionLines(
                priceOptions.memories
              )
            )}</textarea>
          </label>

          <label>
            <span>SIM</span>

            <textarea
              id="optionSims"
              rows="3"
              placeholder="eSIM|0&#10;Physical SIM|0"
            >${escapeHtml(
              normalizeOptionLines(
                priceOptions.sims
              )
            )}</textarea>
          </label>

          <label>
            <span>Регион</span>

            <textarea
              id="optionRegions"
              rows="3"
              placeholder="Global|0&#10;USA|5000"
            >${escapeHtml(
              normalizeOptionLines(
                priceOptions.regions
              )
            )}</textarea>
          </label>
        </div>

        <button
          class="primary-button"
          type="submit"
        >
          ${
            product
              ? "Сохранить товар"
              : "Создать товар"
          }
        </button>
      </form>
    `);

    $("#productForm")
      ?.addEventListener(
        "submit",
        saveProduct
      );
  }

  async function saveProduct(event) {
    event.preventDefault();

    const product =
      state.currentProduct;

    const priceOptions = {
      colors: optionLines(
        $("#optionColors")?.value
      ),

      memories: optionLines(
        $("#optionMemories")?.value
      ),

      sims: optionLines(
        $("#optionSims")?.value
      ),

      regions: optionLines(
        $("#optionRegions")?.value
      )
    };

    const payload = {
      name:
        $("#productName")
          ?.value
          .trim(),

      category_id:
        $("#productCategory")
          ?.value
          ? number(
              $("#productCategory")
                .value
            )
          : null,

      price:
        number(
          $("#productPrice")
            ?.value
        ),

      old_price:
        number(
          $("#productOldPrice")
            ?.value
        ),

      image_url:
        $("#productImage")
          ?.value
          .trim(),

      images:
        parseImages(
          $("#productImages")
            ?.value
        ),

      description:
        $("#productDescription")
          ?.value
          .trim(),

      price_options:
        priceOptions,

      is_new:
        Boolean(
          $("#productIsNew")
            ?.checked
        )
    };

    try {
      if (product) {
        await api(
          `/api/admin/products/${encodeURIComponent(product.id)}`,
          {
            method: "PUT",
            body: payload
          }
        );

        toast(
          "Товар сохранён"
        );
      } else {
        await api(
          "/api/admin/products",
          {
            method: "POST",
            body: payload
          }
        );

        toast(
          "Товар создан"
        );
      }

      closeModal();

      await loadProducts();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось сохранить товар"
      );
    }
  }

  async function deleteProduct(id) {
    if (
      !confirm(
        "Удалить этот товар?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/products/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      toast(
        "Товар удалён"
      );

      await loadProducts();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось удалить товар"
      );
    }
  }

  /* =========================================================
     CATEGORIES
  ========================================================= */

  async function loadCategories() {
    const container =
      $("#categoriesGrid");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/categories"
        );

      state.categories =
        Array.isArray(data.categories)
          ? data.categories
          : [];

      renderCategories();
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">!</div>

            <strong>
              Не удалось загрузить категории
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  function renderCategories() {
    const container =
      $("#categoriesGrid");

    if (!container) return;

    if (!state.categories.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">◫</div>

          <strong>
            Категорий нет
          </strong>

          <p>
            Добавьте первую категорию
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.categories.map(
        (category) => `
          <article class="category-card">
            <h3>
              ${escapeHtml(
                category.name ||
                category.title ||
                "Категория"
              )}
            </h3>

            <p>
              ID:
              ${escapeHtml(
                category.id
              )}
            </p>

            <div class="category-actions">
              <button
                class="row-button"
                type="button"
                data-edit-category="${escapeHtml(category.id)}"
              >
                Изменить
              </button>

              <button
                class="row-button"
                type="button"
                data-delete-category="${escapeHtml(category.id)}"
              >
                Удалить
              </button>
            </div>
          </article>
        `
      ).join("");

    $$("[data-edit-category]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            editCategory(
              button.dataset.editCategory
            )
        );
      });

    $$("[data-delete-category]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            deleteCategory(
              button.dataset.deleteCategory
            )
        );
      });
  }

  function editCategory(id = null) {
    const category =
      state.categories.find(
        (item) =>
          String(item.id) ===
          String(id)
      );

    openModal(`
      <div class="eyebrow">
        CATEGORY
      </div>

      <h2
        style="
          margin:0 0 20px;
          font-size:27px;
        "
      >
        ${
          category
            ? "Изменить категорию"
            : "Новая категория"
        }
      </h2>

      <form
        id="categoryForm"
        class="settings-form"
        style="padding:0"
      >
        <label>
          <span>Название</span>

          <input
            id="categoryName"
            type="text"
            value="${escapeHtml(
              category?.name || ""
            )}"
            required
          >
        </label>

        <label>
          <span>Изображение URL</span>

          <input
            id="categoryImage"
            type="url"
            value="${escapeHtml(
              category?.image_url || ""
            )}"
            placeholder="https://..."
          >
        </label>

        <button
          class="primary-button"
          type="submit"
        >
          Сохранить
        </button>
      </form>
    `);

    $("#categoryForm")
      ?.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          const payload = {
            name:
              $("#categoryName")
                .value
                .trim(),

            image_url:
              $("#categoryImage")
                .value
                .trim()
          };

          try {
            if (category) {
              await api(
                `/api/admin/categories/${encodeURIComponent(category.id)}`,
                {
                  method: "PUT",
                  body: payload
                }
              );
            } else {
              await api(
                "/api/admin/categories",
                {
                  method: "POST",
                  body: payload
                }
              );
            }

            toast(
              "Категория сохранена"
            );

            closeModal();

            await loadCategories();
            await loadProducts();
          } catch (error) {
            toast(
              error.message ||
              "Не удалось сохранить категорию"
            );
          }
        }
      );
  }

  async function deleteCategory(id) {
    if (
      !confirm(
        "Удалить категорию?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/categories/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      toast(
        "Категория удалена"
      );

      await loadCategories();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось удалить категорию"
      );
    }
  }

  /* =========================================================
     PROMOCODES
  ========================================================= */

  async function loadPromoCodes() {
    const container =
      $("#promoGrid");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/promo-codes"
        );

      state.promoCodes =
        Array.isArray(
          data.promo_codes
        )
          ? data.promo_codes
          : [];

      renderPromoCodes();
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">%</div>

            <strong>
              Не удалось загрузить промокоды
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  function renderPromoCodes() {
    const container =
      $("#promoGrid");

    if (!container) return;

    if (!state.promoCodes.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">%</div>

          <strong>
            Промокодов пока нет
          </strong>

          <p>
            Создайте первый промокод
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.promoCodes.map(
        (promo) => {
          const discount =
            promo.discount_type ===
            "percent"
              ? `${promo.discount_value}%`
              : price(
                  promo.discount_value
                );

          const maxUses =
            number(
              promo.max_uses
            );

          return `
            <article class="promo-card">
              <div class="promo-code">
                ${escapeHtml(
                  promo.code
                )}
              </div>

              <div class="promo-discount">
                ${escapeHtml(discount)}
              </div>

              <div class="promo-meta">
                Использовано:
                ${escapeHtml(
                  promo.used_count ?? 0
                )}
                /
                ${maxUses > 0 ? maxUses : "∞"}
              </div>

              <div class="promo-meta">
                ${
                  Number(promo.active) === 1
                    ? "Активен"
                    : "Отключён"
                }
              </div>

              <div class="promo-actions">
                <button
                  class="row-button"
                  type="button"
                  data-edit-promo="${escapeHtml(promo.id)}"
                >
                  Изменить
                </button>

                <button
                  class="row-button"
                  type="button"
                  data-delete-promo="${escapeHtml(promo.id)}"
                >
                  Удалить
                </button>
              </div>
            </article>
          `;
        }
      ).join("");

    $$("[data-edit-promo]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            editPromo(
              button.dataset.editPromo
            )
        );
      });

    $$("[data-delete-promo]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            deletePromo(
              button.dataset.deletePromo
            )
        );
      });
  }

  function editPromo(id = null) {
    const promo =
      state.promoCodes.find(
        (item) =>
          String(item.id) ===
          String(id)
      );

    openModal(`
      <div class="eyebrow">
        PROMOCODE
      </div>

      <h2
        style="
          margin:0 0 20px;
          font-size:27px;
        "
      >
        ${
          promo
            ? "Изменить промокод"
            : "Новый промокод"
        }
      </h2>

      <form
        id="promoForm"
        class="settings-form"
        style="padding:0"
      >
        <label>
          <span>Код</span>

          <input
            id="promoCode"
            type="text"
            value="${escapeHtml(
              promo?.code || ""
            )}"
            required
          >
        </label>

        <label>
          <span>Тип скидки</span>

          <select id="promoType">
            <option
              value="percent"
              ${
                promo?.discount_type !==
                "fixed"
                  ? "selected"
                  : ""
              }
            >
              Процент
            </option>

            <option
              value="fixed"
              ${
                promo?.discount_type ===
                "fixed"
                  ? "selected"
                  : ""
              }
            >
              Фиксированная сумма
            </option>
          </select>
        </label>

        <label>
          <span>Размер скидки</span>

          <input
            id="promoDiscount"
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(
              promo?.discount_value ??
              ""
            )}"
            required
          >
        </label>

        <label>
          <span>Минимальная сумма заказа</span>

          <input
            id="promoMinOrder"
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(
              promo?.min_order_amount ??
              ""
            )}"
          >
        </label>

        <label>
          <span>Максимальное количество использований</span>

          <input
            id="promoMaxUses"
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(
              promo?.max_uses ??
              ""
            )}"
            placeholder="0 = без лимита"
          >
        </label>

        <label>
          <span>Срок действия</span>

          <input
            id="promoExpires"
            type="datetime-local"
            value="${escapeHtml(
              toDateTimeLocal(
                promo?.expires_at
              )
            )}"
          >
        </label>

        <label
          style="
            flex-direction:row;
            align-items:center;
            gap:10px;
          "
        >
          <input
            id="promoActive"
            type="checkbox"
            ${
              promo
                ? Number(
                    promo.active
                  ) === 1
                    ? "checked"
                    : ""
                : "checked"
            }
            style="
              width:18px;
              height:18px;
              accent-color:#ff2d8d;
            "
          >

          <span>
            Промокод активен
          </span>
        </label>

        <button
          class="primary-button"
          type="submit"
        >
          Сохранить
        </button>
      </form>
    `);

    $("#promoForm")
      ?.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          const payload = {
            code:
              $("#promoCode")
                .value
                .trim()
                .toUpperCase(),

            discount_type:
              $("#promoType").value,

            discount_value:
              number(
                $("#promoDiscount")
                  .value
              ),

            min_order_amount:
              number(
                $("#promoMinOrder")
                  .value
              ),

            max_uses:
              number(
                $("#promoMaxUses")
                  .value
              ),

            expires_at:
              fromDateTimeLocal(
                $("#promoExpires")
                  .value
              ),

            active:
              Boolean(
                $("#promoActive")
                  .checked
              )
          };

          try {
            if (promo) {
              await api(
                `/api/admin/promo-codes/${encodeURIComponent(promo.id)}`,
                {
                  method: "PUT",
                  body: payload
                }
              );
            } else {
              await api(
                "/api/admin/promo-codes",
                {
                  method: "POST",
                  body: payload
                }
              );
            }

            toast(
              "Промокод сохранён"
            );

            closeModal();

            await loadPromoCodes();
          } catch (error) {
            toast(
              error.message ||
              "Не удалось сохранить промокод"
            );
          }
        }
      );
  }

  function toDateTimeLocal(value) {
    if (!value) return "";

    const date = new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "";
    }

    const pad = (n) =>
      String(n).padStart(2, "0");

    return (
      `${date.getFullYear()}-` +
      `${pad(date.getMonth() + 1)}-` +
      `${pad(date.getDate())}T` +
      `${pad(date.getHours())}:` +
      `${pad(date.getMinutes())}`
    );
  }

  function fromDateTimeLocal(value) {
    if (!value) return null;

    const date =
      new Date(value);

    if (
      Number.isNaN(
        date.getTime()
      )
    ) {
      return null;
    }

    return date.toISOString();
  }

  async function deletePromo(id) {
    if (
      !confirm(
        "Удалить этот промокод?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/promo-codes/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      toast(
        "Промокод удалён"
      );

      await loadPromoCodes();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось удалить промокод"
      );
    }
  }

  /* =========================================================
     BANNERS
  ========================================================= */

  async function loadBanners() {
    const container =
      $("#bannersGrid");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/banners"
        );

      state.banners =
        Array.isArray(data.banners)
          ? data.banners
          : [];

      renderBanners();
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">!</div>

            <strong>
              Не удалось загрузить баннеры
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  function renderBanners() {
    const container =
      $("#bannersGrid");

    if (!container) return;

    if (!state.banners.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">▧</div>

          <strong>
            Баннеров пока нет
          </strong>

          <p>
            Добавьте баннер для главной
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.banners.map(
        (banner) => `
          <article class="banner-card">
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

            <div class="banner-overlay">
              <h3>
                ${escapeHtml(
                  banner.title ||
                  "Баннер"
                )}
              </h3>

              <p>
                ${escapeHtml(
                  banner.subtitle || ""
                )}
              </p>

              <div
                style="
                  display:flex;
                  gap:7px;
                  margin-top:12px;
                "
              >
                <button
                  class="row-button"
                  data-edit-banner="${escapeHtml(banner.id)}"
                  type="button"
                >
                  Изменить
                </button>

                <button
                  class="row-button"
                  data-delete-banner="${escapeHtml(banner.id)}"
                  type="button"
                >
                  Удалить
                </button>
              </div>
            </div>
          </article>
        `
      ).join("");

    $$("[data-edit-banner]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            editBanner(
              button.dataset.editBanner
            )
        );
      });

    $$("[data-delete-banner]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            deleteBanner(
              button.dataset.deleteBanner
            )
        );
      });
  }

  function editBanner(id = null) {
    const banner =
      state.banners.find(
        (item) =>
          String(item.id) ===
          String(id)
      );

    openModal(`
      <div class="eyebrow">
        HOME
      </div>

      <h2
        style="
          margin:0 0 20px;
          font-size:27px;
        "
      >
        ${
          banner
            ? "Изменить баннер"
            : "Новый баннер"
        }
      </h2>

      <form
        id="bannerForm"
        class="settings-form"
        style="padding:0"
      >
        <label>
          <span>Заголовок</span>

          <input
            id="bannerTitle"
            type="text"
            value="${escapeHtml(
              banner?.title || ""
            )}"
          >
        </label>

        <label>
          <span>Подзаголовок</span>

          <input
            id="bannerSubtitle"
            type="text"
            value="${escapeHtml(
              banner?.subtitle || ""
            )}"
          >
        </label>

        <label>
          <span>Изображение URL</span>

          <input
            id="bannerImage"
            type="url"
            value="${escapeHtml(
              banner?.image_url || ""
            )}"
          >
        </label>

        <label>
          <span>Текст кнопки</span>

          <input
            id="bannerButtonText"
            type="text"
            value="${escapeHtml(
              banner?.button_text || ""
            )}"
            placeholder="Подробнее"
          >
        </label>

        <label>
          <span>Ссылка кнопки</span>

          <input
            id="bannerButtonUrl"
            type="url"
            value="${escapeHtml(
              banner?.button_url || ""
            )}"
            placeholder="https://..."
          >
        </label>

        <label>
          <span>Порядок</span>

          <input
            id="bannerSort"
            type="number"
            min="0"
            step="1"
            value="${escapeHtml(
              banner?.sort_order ?? 0
            )}"
          >
        </label>

        <label
          style="
            flex-direction:row;
            align-items:center;
            gap:10px;
          "
        >
          <input
            id="bannerActive"
            type="checkbox"
            ${
              banner
                ? Number(
                    banner.active
                  ) === 1
                    ? "checked"
                    : ""
                : "checked"
            }
            style="
              width:18px;
              height:18px;
              accent-color:#ff2d8d;
            "
          >

          <span>
            Баннер активен
          </span>
        </label>

        <button
          class="primary-button"
          type="submit"
        >
          Сохранить
        </button>
      </form>
    `);

    $("#bannerForm")
      ?.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          const payload = {
            title:
              $("#bannerTitle")
                .value
                .trim(),

            subtitle:
              $("#bannerSubtitle")
                .value
                .trim(),

            image_url:
              $("#bannerImage")
                .value
                .trim(),

            button_text:
              $("#bannerButtonText")
                .value
                .trim(),

            button_url:
              $("#bannerButtonUrl")
                .value
                .trim(),

            sort_order:
              number(
                $("#bannerSort")
                  .value
              ),

            active:
              Boolean(
                $("#bannerActive")
                  .checked
              )
          };

          try {
            if (banner) {
              await api(
                `/api/admin/banners/${encodeURIComponent(banner.id)}`,
                {
                  method: "PUT",
                  body: payload
                }
              );
            } else {
              await api(
                "/api/admin/banners",
                {
                  method: "POST",
                  body: payload
                }
              );
            }

            toast(
              "Баннер сохранён"
            );

            closeModal();

            await loadBanners();
          } catch (error) {
            toast(
              error.message ||
              "Не удалось сохранить баннер"
            );
          }
        }
      );
  }

  async function deleteBanner(id) {
    if (
      !confirm(
        "Удалить баннер?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/banners/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      toast(
        "Баннер удалён"
      );

      await loadBanners();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось удалить баннер"
      );
    }
  }

  /* =========================================================
     RESERVATION
  ========================================================= */

  async function loadReservation() {
    const container =
      $("#reservationOrders");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/orders"
        );

      state.orders =
        Array.isArray(data.orders)
          ? data.orders
          : [];

      renderReservationOrders();
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">!</div>

            <strong>
              Не удалось загрузить залоги
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  async function loadReservationSettings() {
    try {
      const data =
        await api(
          "/api/admin/settings"
        );

      state.settings =
        data.settings || {};

      const amount =
        state.settings
          .reservation_amount;

      if ($("#reservationAmount")) {
        $("#reservationAmount").value =
          amount ?? "";
      }

      if ($("#reservationRecipient")) {
        $("#reservationRecipient").value =
          state.settings
            .reservation_recipient ||
          "";
      }

      if ($("#reservationCard")) {
        $("#reservationCard").value =
          state.settings
            .reservation_card ||
          "";
      }

      if ($("#reservationInstruction")) {
        $("#reservationInstruction").value =
          state.settings
            .reservation_instruction ||
          state.settings
            .reservation_text ||
          "";
      }
    } catch (error) {
      console.error(
        "Reservation settings:",
        error
      );
    }
  }

  function renderReservationOrders() {
    const container =
      $("#reservationOrders");

    if (!container) return;

    const orders =
      state.orders.filter(
        (order) =>
          order.reservation_status ===
          "awaiting_confirmation"
      );

    if (!orders.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">✓</div>

          <strong>
            Всё проверено
          </strong>

          <p>
            Нет заявок на проверку залога
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      orders.map(
        (order) => `
          <div class="reservation-order">
            <h3>
              #${escapeHtml(
                order.display_id ||
                `IR-${1000 + number(order.id)}`
              )}
            </h3>

            <p>
              ${escapeHtml(
                order.product_name ||
                "Товар"
              )}
            </p>

            <p>
              Залог:
              <strong style="color:#fff">
                ${price(
                  order.reservation_amount
                )}
              </strong>
            </p>

            <div class="reservation-actions">
              <button
                class="confirm-button"
                data-reservation-confirm="${escapeHtml(order.id)}"
                type="button"
              >
                ✓ Подтвердить
              </button>

              <button
                class="reject-button"
                data-reservation-reject="${escapeHtml(order.id)}"
                type="button"
              >
                × Отклонить
              </button>
            </div>
          </div>
        `
      ).join("");

    $$("[data-reservation-confirm]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            updateReservation(
              button.dataset
                .reservationConfirm,
              "confirmed"
            )
        );
      });

    $$("[data-reservation-reject]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            updateReservation(
              button.dataset
                .reservationReject,
              "rejected"
            )
        );
      });
  }

  async function saveReservationSettings() {
    const settings = {
      reservation_amount:
        number(
          $("#reservationAmount")
            ?.value
        ),

      reservation_recipient:
        $("#reservationRecipient")
          ?.value
          .trim(),

      reservation_card:
        $("#reservationCard")
          ?.value
          .trim(),

      reservation_instruction:
        $("#reservationInstruction")
          ?.value
          .trim()
    };

    try {
      await api(
        "/api/admin/settings",
        {
          method: "PUT",
          body: {
            settings
          }
        }
      );

      toast(
        "Настройки залога сохранены"
      );
    } catch (error) {
      toast(
        error.message ||
        "Не удалось сохранить настройки"
      );
    }
  }

  /* =========================================================
     PICKUP POINTS
  ========================================================= */

  async function loadPickupPoints() {
    const container =
      $("#pickupGrid");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/pickup-points"
        );

      state.pickupPoints =
        Array.isArray(
          data.pickup_points
        )
          ? data.pickup_points
          : [];

      renderPickupPoints();
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">⌖</div>

            <strong>
              Не удалось загрузить точки
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  function renderPickupPoints() {
    const container =
      $("#pickupGrid");

    if (!container) return;

    if (!state.pickupPoints.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">⌖</div>

          <strong>
            Точек пока нет
          </strong>

          <p>
            Добавьте точку самовывоза
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      state.pickupPoints.map(
        (point) => `
          <article class="pickup-card">
            <h3>
              ${escapeHtml(
                point.title ||
                point.name ||
                "Точка выдачи"
              )}
            </h3>

            <p>
              ${escapeHtml(
                point.address ||
                "Адрес не указан"
              )}
            </p>

            ${
              point.directions_url
                ? `
                  <p>
                    Ссылка «Как добраться»:
                    ${escapeHtml(
                      point.directions_url
                    )}
                  </p>
                `
                : ""
            }

            ${
              point.video_url
                ? `
                  <p>
                    Видео:
                    ${escapeHtml(
                      point.video_url
                    )}
                  </p>
                `
                : ""
            }

            <p>
              ${
                Number(point.active) === 1
                  ? "🟢 Активна"
                  : "⚪ Отключена"
              }
            </p>

            <div class="pickup-actions">
              <button
                class="row-button"
                type="button"
                data-edit-pickup="${escapeHtml(point.id)}"
              >
                Изменить
              </button>

              <button
                class="row-button"
                type="button"
                data-delete-pickup="${escapeHtml(point.id)}"
              >
                Удалить
              </button>
            </div>
          </article>
        `
      ).join("");

    $$("[data-edit-pickup]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            editPickup(
              button.dataset.editPickup
            )
        );
      });

    $$("[data-delete-pickup]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            deletePickup(
              button.dataset.deletePickup
            )
        );
      });
  }

  function editPickup(id = null) {
    const point =
      state.pickupPoints.find(
        (item) =>
          String(item.id) ===
          String(id)
      );

    openModal(`
      <div class="eyebrow">
        DELIVERY
      </div>

      <h2
        style="
          margin:0 0 20px;
          font-size:27px;
        "
      >
        ${
          point
            ? "Изменить точку"
            : "Новая точка"
        }
      </h2>

      <form
        id="pickupForm"
        class="settings-form"
        style="padding:0"
      >
        <label>
          <span>Название</span>

          <input
            id="pickupTitle"
            type="text"
            value="${escapeHtml(
              point?.title ||
              point?.name ||
              ""
            )}"
            required
          >
        </label>

        <label>
          <span>Адрес</span>

          <input
            id="pickupAddress"
            type="text"
            value="${escapeHtml(
              point?.address || ""
            )}"
            required
          >
        </label>

        <label>
          <span>Ссылка «Как добраться?»</span>

          <input
            id="pickupDirectionsUrl"
            type="url"
            value="${escapeHtml(
              point?.directions_url ||
              ""
            )}"
            placeholder="https://..."
          >
        </label>

        <label>
          <span>Ссылка на видео</span>

          <input
            id="pickupVideo"
            type="url"
            value="${escapeHtml(
              point?.video_url ||
              ""
            )}"
            placeholder="https://..."
          >
        </label>

        <label
          style="
            flex-direction:row;
            align-items:center;
            gap:10px;
          "
        >
          <input
            id="pickupActive"
            type="checkbox"
            ${
              point
                ? Number(
                    point.active
                  ) === 1
                    ? "checked"
                    : ""
                : "checked"
            }
            style="
              width:18px;
              height:18px;
              accent-color:#ff2d8d;
            "
          >

          <span>
            Точка активна
          </span>
        </label>

        <button
          class="primary-button"
          type="submit"
        >
          Сохранить
        </button>
      </form>
    `);

    $("#pickupForm")
      ?.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          const payload = {
            title:
              $("#pickupTitle")
                .value
                .trim(),

            address:
              $("#pickupAddress")
                .value
                .trim(),

            directions_url:
              $("#pickupDirectionsUrl")
                .value
                .trim(),

            video_url:
              $("#pickupVideo")
                .value
                .trim(),

            active:
              Boolean(
                $("#pickupActive")
                  .checked
              )
          };

          try {
            if (point) {
              await api(
                `/api/admin/pickup-points/${encodeURIComponent(point.id)}`,
                {
                  method: "PUT",
                  body: payload
                }
              );
            } else {
              await api(
                "/api/admin/pickup-points",
                {
                  method: "POST",
                  body: payload
                }
              );
            }

            toast(
              "Точка сохранена"
            );

            closeModal();

            await loadPickupPoints();
          } catch (error) {
            toast(
              error.message ||
              "Не удалось сохранить точку"
            );
          }
        }
      );
  }

  async function deletePickup(id) {
    if (
      !confirm(
        "Удалить точку выдачи?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/pickup-points/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      toast(
        "Точка удалена"
      );

      await loadPickupPoints();
    } catch (error) {
      toast(
        error.message ||
        "Не удалось удалить точку"
      );
    }
  }

  /* =========================================================
     USERS
  ========================================================= */

  async function loadUsers() {
    const container =
      $("#usersTable");

    if (container) {
      container.innerHTML =
        `<div class="loading">Загрузка</div>`;
    }

    try {
      const data =
        await api(
          "/api/admin/users"
        );

      state.users =
        Array.isArray(data.users)
          ? data.users
          : [];

      renderUsers();
    } catch (error) {
      if (container) {
        container.innerHTML = `
          <div class="empty">
            <div class="empty-icon">♙</div>

            <strong>
              Не удалось загрузить пользователей
            </strong>

            <p>
              ${escapeHtml(
                error.message
              )}
            </p>
          </div>
        `;
      }
    }
  }

  function renderUsers() {
    const container =
      $("#usersTable");

    if (!container) return;

    const query =
      state.userSearch
        .trim()
        .toLowerCase();

    let users =
      [...state.users];

    if (query) {
      users =
        users.filter(
          (user) =>
            [
              user.first_name,
              user.last_name,
              user.username,
              user.telegram_user_id
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase()
              .includes(query)
        );
    }

    if (!users.length) {
      container.innerHTML = `
        <div class="empty">
          <div class="empty-icon">♙</div>

          <strong>
            Пользователей нет
          </strong>

          <p>
            Здесь появятся клиенты магазина
          </p>
        </div>
      `;

      return;
    }

    container.innerHTML =
      users.map((user) => {
        const name =
          [
            user.first_name,
            user.last_name
          ]
            .filter(Boolean)
            .join(" ") ||
          user.username ||
          "Пользователь";

        const letter =
          String(name)
            .trim()
            .charAt(0)
            .toUpperCase();

        return `
          <div class="user-row">
            <div class="user-avatar">
              ${escapeHtml(letter)}
            </div>

            <div class="user-info">
              <strong>
                ${escapeHtml(name)}
              </strong>

              <small>
                ${
                  user.username
                    ? `@${escapeHtml(
                        user.username
                      )} · `
                    : ""
                }

                ID:
                ${escapeHtml(
                  user.telegram_user_id ||
                  user.id ||
                  "—"
                )}
              </small>
            </div>

            <div class="user-extra">
              ${escapeHtml(
                formatDate(
                  user.created_at
                )
              )}
            </div>
          </div>
        `;
      }).join("");
  }

  /* =========================================================
     STORE SETTINGS
  ========================================================= */

  async function loadStoreSettings() {
    try {
      const data =
        await api(
          "/api/admin/settings"
        );

      state.settings =
        data.settings || {};

      fillStoreSettings();
    } catch (error) {
      console.error(
        "Store settings:",
        error
      );

      toast(
        error.message ||
        "Не удалось загрузить настройки"
      );
    }
  }

  function fillStoreSettings() {
    const settings =
      state.settings;

    if ($("#storeName")) {
      $("#storeName").value =
        settings.store_name ||
        "IRoom";
    }

    if ($("#managerUsername")) {
      $("#managerUsername").value =
        settings.contact_username ||
        "@iroom_24";
    }

    if ($("#channelUsername")) {
      $("#channelUsername").value =
        settings.channel_username ||
        "@iroom_market";
    }
  }

  async function saveStoreSettings() {
    const settings = {
      store_name:
        $("#storeName")
          ?.value
          .trim(),

      contact_username:
        $("#managerUsername")
          ?.value
          .trim(),

      contact_url:
        makeTelegramUrl(
          $("#managerUsername")
            ?.value
            .trim()
        ),

      channel_username:
        $("#channelUsername")
          ?.value
          .trim(),

      channel_url:
        makeTelegramUrl(
          $("#channelUsername")
            ?.value
            .trim()
        )
    };

    try {
      await api(
        "/api/admin/settings",
        {
          method: "PUT",
          body: {
            settings
          }
        }
      );

      state.settings = {
        ...state.settings,
        ...settings
      };

      toast(
        "Настройки магазина сохранены"
      );
    } catch (error) {
      toast(
        error.message ||
        "Не удалось сохранить настройки"
      );
    }
  }

  function makeTelegramUrl(username) {
    const value =
      String(username || "")
        .trim()
        .replace(/^@/, "");

    return value
      ? `https://t.me/${value}`
      : "";
  }

  /* =========================================================
     EVENTS
  ========================================================= */

  function bindEvents() {
    /* Navigation */

    $$(".nav-item")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            showSection(
              button.dataset.section
            )
        );
      });

    $$("[data-section-link]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () =>
            showSection(
              button.dataset.sectionLink
            )
        );
      });

    /* Mobile */

    $("#mobileMenuButton")
      ?.addEventListener(
        "click",
        openMobileMenu
      );

    $("#sidebarOverlay")
      ?.addEventListener(
        "click",
        closeMobileMenu
      );

    /* Modal */

    $("#modalClose")
      ?.addEventListener(
        "click",
        closeModal
      );

    $("#modalBackdrop")
      ?.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            $("#modalBackdrop")
          ) {
            closeModal();
          }
        }
      );

    document.addEventListener(
      "keydown",
      (event) => {
        if (
          event.key === "Escape"
        ) {
          closeModal();
          closeMobileMenu();
        }
      }
    );

    /* Refresh */

    $("#refreshButton")
      ?.addEventListener(
        "click",
        () =>
          showSection(
            state.section
          )
      );

    $("#dashboardRefresh")
      ?.addEventListener(
        "click",
        loadDashboard
      );

    $("#ordersRefresh")
      ?.addEventListener(
        "click",
        loadOrders
      );

    /* Products */

    $("#addProductButton")
      ?.addEventListener(
        "click",
        () => {
          if (!state.categories.length) {
            loadCategories().then(() =>
              openProductEditor()
            );
          } else {
            openProductEditor();
          }
        }
      );

    $("#productsSearch")
      ?.addEventListener(
        "input",
        (event) => {
          state.productSearch =
            event.target.value;

          renderProducts();
        }
      );

    /* Categories */

    $("#addCategoryButton")
      ?.addEventListener(
        "click",
        () =>
          editCategory()
      );

    /* Promo */

    $("#addPromoButton")
      ?.addEventListener(
        "click",
        () =>
          editPromo()
      );

    /* Banners */

    $("#addBannerButton")
      ?.addEventListener(
        "click",
        () =>
          editBanner()
      );

    /* Pickup */

    $("#addPickupButton")
      ?.addEventListener(
        "click",
        () =>
          editPickup()
      );

    /* Orders search */

    $("#ordersSearch")
      ?.addEventListener(
        "input",
        (event) => {
          state.orderSearch =
            event.target.value;

          renderOrders();
        }
      );

    /* Order filters */

    $$("[data-order-filter]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            $$(
              "[data-order-filter]"
            ).forEach(
              (item) =>
                item.classList.remove(
                  "active"
                )
            );

            button.classList.add(
              "active"
            );

            state.orderFilter =
              button.dataset.orderFilter;

            renderOrders();
          }
        );
      });

    /* Users */

    $("#usersSearch")
      ?.addEventListener(
        "input",
        (event) => {
          state.userSearch =
            event.target.value;

          renderUsers();
        }
      );

    /* Reservation */

    $("#reservationForm")
      ?.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          await saveReservationSettings();
        }
      );

    /* Store settings */

    $("#storeSettingsForm")
      ?.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          await saveStoreSettings();
        }
      );
  }

  /* =========================================================
     ADMIN AUTH
  ========================================================= */

  async function checkAdmin() {
    const data =
      await api(
        "/api/admin/me"
      );

    state.adminUser =
      data;

    if (!isAdmin()) {
      throw new Error(
        "Этот Telegram-аккаунт не является администратором"
      );
    }

    return true;
  }

  /* =========================================================
     INIT
  ========================================================= */

  async function init() {
    bindEvents();

    try {
      await checkAdmin();
    } catch (error) {
      console.error(
        "Admin auth:",
        error
      );

      document.body.innerHTML = `
        <div
          style="
            min-height:100vh;
            display:flex;
            align-items:center;
            justify-content:center;
            padding:24px;
            background:#000;
            color:#fff;
            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
            text-align:center;
          "
        >
          <div>
            <div
              style="
                width:64px;
                height:64px;
                display:flex;
                align-items:center;
                justify-content:center;
                margin:0 auto 18px;
                border-radius:20px;
                background:rgba(255,45,141,.12);
                color:#ff2d8d;
                font-size:28px;
              "
            >
              !
            </div>

            <h2
              style="
                margin:0;
                font-size:24px;
              "
            >
              Доступ запрещён
            </h2>

            <p
              style="
                margin:9px 0 20px;
                color:#92929a;
                font-size:13px;
                line-height:1.5;
              "
            >
              ${escapeHtml(
                error.message ||
                "Не удалось проверить доступ"
              )}
            </p>

            <button
              type="button"
              onclick="location.href='/'"
              style="
                min-height:44px;
                padding:0 20px;
                border:0;
                border-radius:13px;
                background:#ff2d8d;
                color:#fff;
                font-weight:700;
                cursor:pointer;
              "
            >
              Вернуться в магазин
            </button>
          </div>
        </div>
      `;

      return;
    }

    await Promise.all([
      loadCategories(),
      loadStoreSettings()
    ]);

    await loadDashboard();
  }

  init();
})();