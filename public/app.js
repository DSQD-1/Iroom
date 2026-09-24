const tg = window.Telegram?.WebApp;

let products = [];
let categories = [];
let orders = [];
let currentUser = null;
let currentProduct = null;
let currentOrder = null;
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

const ACTIVE_PROMO_CODES = ["конор", "ютуб"];

const STATUS_INFO = {
  new: { text: "Новый", className: "status-new" },
  confirmed: { text: "Подтверждён", className: "status-confirmed" },
  processing: { text: "В обработке", className: "status-processing" },
  ready: { text: "Готов к выдаче", className: "status-ready" },
  completed: { text: "Завершён", className: "status-completed" },
  cancelled: { text: "Отменён", className: "status-cancelled" },
  rejected: { text: "Отменён", className: "status-cancelled" }
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
  } catch (e) {
    console.error(e);
  }
}

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    12000
  );

  try {
    const headers = {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    };

    if (tg?.initData) {
      headers["x-telegram-init-data"] = tg.initData;
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
  if (Array.isArray(data)) return data;
  if (Array.isArray(data[key])) return data[key];
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
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
  return Number(
    product?.price ??
    product?.base_price ??
    product?.current_price ??
    0
  ) || 0;
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

  return parts.length
    ? parts.join(" • ")
    : (
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

/* =========================================================
   PROMO
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

  return {
    name: String(name).trim(),
    surcharge:
      Number(
        option.surcharge ??
        option.extra ??
        option.extra_price ??
        option.extraPrice ??
        option.price_add ??
        0
      ) || 0
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
  const o = getProductPriceOptions(product);

  return Boolean(
    o.colors.length ||
    o.memories.length ||
    o.sims.length ||
    o.regions.length
  );
}

function getSelectedOptionsPrice(product) {
  let price = getProductPrice(product);

  const options =
    getProductPriceOptions(product);

  [
    ["color", options.colors],
    ["memory", options.memories],
    ["sim", options.sims],
    ["region", options.regions]
  ].forEach(([key, list]) => {
    const selected = selectedOptions[key];

    if (!selected) return;

    const option = list.find(
      item =>
        String(item.name) ===
        String(selected)
    );

    if (option) {
      price += Number(option.surcharge) || 0;
    }
  });

  return price;
}

function getSelectedOptionsText() {
  return [
    selectedOptions.color
      ? `Цвет: ${selectedOptions.color}`
      : "",

    selectedOptions.memory
      ? `Память: ${selectedOptions.memory}`
      : "",

    selectedOptions.sim
      ? `SIM: ${selectedOptions.sim}`
      : "",

    selectedOptions.region
      ? `Регион: ${selectedOptions.region}`
      : ""
  ].filter(Boolean).join(" • ");
}

function getSelectedOptionsPayload() {
  const result = {};

  Object.keys(selectedOptions).forEach(key => {
    if (selectedOptions[key]) {
      result[key] = selectedOptions[key];
    }
  });

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

function validateSelectedOptions() {
  if (!currentProduct) {
    return {
      ok: false,
      error: "Товар не выбран"
    };
  }

  if (!hasPriceOptions(currentProduct)) {
    return { ok: true };
  }

  const options =
    getProductPriceOptions(currentProduct);

  const groups = [
    ["color", "Цвет", options.colors],
    ["memory", "Память", options.memories],
    ["sim", "SIM", options.sims],
    ["region", "Регион", options.regions]
  ];

  for (const [key, name, list] of groups) {
    if (!list.length) continue;

    if (!selectedOptions[key]) {
      return {
        ok: false,
        error: `Выберите: ${name}`
      };
    }
  }

  return { ok: true };
}

/* =========================================================
   CART
========================================================= */

const CART_KEY = "iroom_cart";

let cart = [];

function loadCart() {
  try {
    const saved =
      localStorage.getItem(CART_KEY);

    cart = saved
      ? JSON.parse(saved)
      : [];

    if (!Array.isArray(cart)) {
      cart = [];
    }
  } catch {
    cart = [];
  }

  updateCartBadge();
}

function saveCart() {
  try {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify(cart)
    );
  } catch {}

  updateCartBadge();
}

function getCartItemKey(
  product,
  variant,
  options
) {
  return [
    product?.id || "",
    variant?.id || "",
    options?.color || "",
    options?.memory || "",
    options?.sim || "",
    options?.region || ""
  ].join(":");
}

function getCurrentProductCartData() {
  if (!currentProduct) return null;

  const validation =
    validateSelectedOptions();

  if (!validation.ok) {
    showToast(validation.error);
    return null;
  }

  const useOptions =
    hasPriceOptions(currentProduct);

  const price =
    useOptions
      ? getSelectedOptionsPrice(
          currentProduct
        )
      : selectedVariant
        ? getVariantPrice(
            selectedVariant,
            currentProduct
          )
        : getProductPrice(
            currentProduct
          );

  const options =
    useOptions
      ? getSelectedOptionsPayload()
      : {};

  const variantText =
    useOptions
      ? getSelectedOptionsText()
      : selectedVariant
        ? getVariantName(
            selectedVariant
          )
        : "";

  return {
    key: getCartItemKey(
      currentProduct,
      selectedVariant,
      options
    ),

    product_id:
      currentProduct.id,

    variant_id:
      selectedVariant
        ? getVariantId(selectedVariant)
        : null,

    name:
      currentProduct.name ||
      "Товар",

    image:
      getProductImage(currentProduct),

    price,

    variant_text:
      variantText,

    options,

    quantity: 1
  };
}

function addCurrentProductToCart() {
  const item =
    getCurrentProductCartData();

  if (!item) return;

  const existing =
    cart.find(
      entry =>
        entry.key === item.key
    );

  if (existing) {
    existing.quantity =
      Number(existing.quantity || 1) + 1;
  } else {
    cart.push(item);
  }

  saveCart();

  haptic("medium");

  showToast(
    "Товар добавлен в корзину"
  );
}

function getCartCount() {
  return cart.reduce(
    (sum, item) =>
      sum +
      Math.max(
        Number(item.quantity) || 0,
        0
      ),
    0
  );
}

function getCartTotal() {
  return cart.reduce(
    (sum, item) =>
      sum +
      Number(item.price || 0) *
        Math.max(
          Number(item.quantity) || 1,
          1
        ),
    0
  );
}

function updateCartBadge() {
  const badge =
    document.getElementById(
      "cartBadge"
    );

  if (!badge) return;

  const count = getCartCount();

  if (!count) {
    badge.classList.add("hidden");
    badge.textContent = "";
    return;
  }

  badge.textContent =
    count > 99
      ? "99+"
      : String(count);

  badge.classList.remove("hidden");
}

function changeCartQuantity(key, delta) {
  const item =
    cart.find(
      entry => entry.key === key
    );

  if (!item) return;

  item.quantity =
    Math.max(
      1,
      Number(item.quantity || 1) +
        delta
    );

  saveCart();
  renderCart();
}

function removeCartItem(key) {
  cart =
    cart.filter(
      item => item.key !== key
    );

  saveCart();
  renderCart();

  showToast(
    "Товар удалён из корзины"
  );
}

function clearCart() {
  cart = [];
  saveCart();
  renderCart();
}

/* =========================================================
   CART PAGE
========================================================= */

function openCart() {
  renderCart();
  showPage("cart");
  haptic();
}

function renderCart() {
  const container =
    document.getElementById(
      "cartContent"
    );

  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `
      <div class="empty-state cart-empty-state">

        <div class="empty-state-icon">
          🛒
        </div>

        <h3>
          Корзина пуста
        </h3>

        <p>
          Добавьте товары, чтобы оформить заказ.
        </p>

        <button
          class="primary-button"
          id="emptyCartCatalogButton"
          type="button"
        >
          Перейти в каталог
        </button>

      </div>
    `;

    document
      .getElementById(
        "emptyCartCatalogButton"
      )
      ?.addEventListener(
        "click",
        () => {
          selectedCategory = null;
          renderCatalogPage();
          showPage("catalog");
        }
      );

    updateCartBadge();
    return;
  }

  container.innerHTML = `
    <div class="cart-items">

      ${cart.map(item => `
        <article
          class="cart-item"
          data-cart-key="${escapeHtml(item.key)}"
        >

          ${
            item.image
              ? `
                <img
                  class="cart-item-image"
                  src="${escapeHtml(item.image)}"
                  alt=""
                >
              `
              : `
                <div class="cart-item-image cart-item-placeholder"></div>
              `
          }

          <div class="cart-item-content">

            <div class="cart-item-name">
              ${escapeHtml(item.name)}
            </div>

            ${
              item.variant_text
                ? `
                  <div class="cart-item-variant">
                    ${escapeHtml(item.variant_text)}
                  </div>
                `
                : ""
            }

            <div class="cart-item-price">
              ${formatPrice(item.price)}
            </div>

            <div class="cart-item-controls">

              <button
                type="button"
                class="cart-quantity-button"
                data-cart-action="minus"
                data-cart-key="${escapeHtml(item.key)}"
              >
                −
              </button>

              <span class="cart-quantity">
                ${Number(item.quantity || 1)}
              </span>

              <button
                type="button"
                class="cart-quantity-button"
                data-cart-action="plus"
                data-cart-key="${escapeHtml(item.key)}"
              >
                +
              </button>

              <button
                type="button"
                class="cart-remove-button"
                data-cart-action="remove"
                data-cart-key="${escapeHtml(item.key)}"
              >
                Удалить
              </button>

            </div>

          </div>

        </article>
      `).join("")}

    </div>

    <div class="cart-summary">

      <div class="cart-summary-row">
        <span>Товаров</span>
        <strong>${getCartCount()}</strong>
      </div>

      <div class="cart-summary-total">
        <span>Итого</span>
        <strong>
          ${formatPrice(getCartTotal())}
        </strong>
      </div>

      <button
        id="cartCheckoutButton"
        class="primary-button"
        type="button"
      >
        Оформить заказ
      </button>

      <button
        id="clearCartButton"
        class="secondary-button"
        type="button"
      >
        Очистить корзину
      </button>

    </div>
  `;

  container
    .querySelectorAll(
      "[data-cart-action]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const action =
            button.dataset.cartAction;

          const key =
            button.dataset.cartKey;

          if (action === "minus") {
            changeCartQuantity(
              key,
              -1
            );
          }

          if (action === "plus") {
            changeCartQuantity(
              key,
              1
            );
          }

          if (action === "remove") {
            removeCartItem(key);
          }
        }
      );
    });

  document
    .getElementById(
      "clearCartButton"
    )
    ?.addEventListener(
      "click",
      clearCart
    );

  document
    .getElementById(
      "cartCheckoutButton"
    )
    ?.addEventListener(
      "click",
      openCartCheckout
    );

  updateCartBadge();
}

/* =========================================================
   CART CHECKOUT
========================================================= */

let checkoutCartMode = false;

function openCartCheckout() {
  if (!cart.length) {
    showToast("Корзина пуста");
    return;
  }

  checkoutCartMode = true;

  appliedPromoCode = "";

  renderCartCheckout();

  showPage("checkout");

  haptic("medium");
}

function renderCartCheckout() {
  const container =
    document.getElementById(
      "checkoutContent"
    );

  if (!container) return;

  const reservationAmount =
    Number(
      storeConfig?.reservation_amount ??
      storeConfig?.reservation?.amount ??
      0
    ) || 0;

  const reservationText =
    String(
      storeConfig?.reservation_text ||
      ""
    );

  const cardText =
    getReservationCardText();

  container.innerHTML = `
    <div class="checkout-card">

      <div class="checkout-title">
        Заказ
      </div>

      <div class="checkout-cart-list">

        ${cart.map(item => `
          <div class="checkout-cart-item">

            ${
              item.image
                ? `
                  <img
                    src="${escapeHtml(item.image)}"
                    alt=""
                  >
                `
                : `
                  <div class="checkout-product-placeholder"></div>
                `
            }

            <div>

              <div class="checkout-product-name">
                ${escapeHtml(item.name)}
              </div>

              ${
                item.variant_text
                  ? `
                    <div class="checkout-product-variant">
                      ${escapeHtml(item.variant_text)}
                    </div>
                  `
                  : ""
              }

              <div>
                × ${Number(item.quantity || 1)}
              </div>

              <div class="checkout-price">
                ${formatPrice(
                  Number(item.price) *
                  Number(item.quantity || 1)
                )}
              </div>

            </div>

          </div>
        `).join("")}

      </div>

      <div class="cart-summary-total">
        <span>Итого</span>
        <strong>
          ${formatPrice(getCartTotal())}
        </strong>
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
        >
          Самовывоз
        </button>

        <button
          id="deliveryOption"
          class="checkout-option"
          type="button"
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
        Остаток оплачивается наличными
        при получении.
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
              ${formatPrice(reservationAmount)}
            </div>

            <div class="checkout-note">
              ${
                escapeHtml(
                  reservationText ||
                  "Для оформления заказа необходимо внести залог."
                )
              }
            </div>

            ${
              cardText
                ? `
                  <div class="reservation-card-number">
                    ${escapeHtml(cardText)}
                  </div>

                  <button
                    id="copyReservationButton"
                    class="copy-card-button"
                    type="button"
                  >
                    Скопировать реквизиты
                  </button>
                `
                : ""
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
          placeholder="Введите промокод"
        >

        <button
          id="applyPromoButton"
          class="secondary-button"
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
   SINGLE PRODUCT CHECKOUT
========================================================= */

function openCheckout() {
  if (!currentProduct) return;

  const validation =
    validateSelectedOptions();

  if (!validation.ok) {
    showToast(validation.error);
    return;
  }

  checkoutCartMode = false;

  appliedPromoCode = "";

  renderSingleCheckout();

  showPage("checkout");

  haptic("medium");
}

function renderSingleCheckout() {
  const container =
    document.getElementById(
      "checkoutContent"
    );

  if (!container || !currentProduct) {
    return;
  }

  const product =
    currentProduct;

  const useOptions =
    hasPriceOptions(product);

  const price =
    useOptions
      ? getSelectedOptionsPrice(product)
      : selectedVariant
        ? getVariantPrice(
            selectedVariant,
            product
          )
        : getProductPrice(product);

  const variantText =
    useOptions
      ? getSelectedOptionsText()
      : selectedVariant
        ? getVariantName(selectedVariant)
        : "";

  const reservationAmount =
    Number(
      storeConfig?.reservation_amount ??
      storeConfig?.reservation?.amount ??
      0
    ) || 0;

  container.innerHTML = `
    <div class="checkout-card">

      <div class="checkout-title">
        Товар
      </div>

      <div class="checkout-product">

        ${
          getProductImage(product)
            ? `
              <img
                src="${escapeHtml(
                  getProductImage(product)
                )}"
                alt=""
              >
            `
            : `
              <div class="checkout-product-placeholder"></div>
            `
        }

        <div>

          <div class="checkout-product-name">
            ${escapeHtml(product.name)}
          </div>

          ${
            variantText
              ? `
                <div class="checkout-product-variant">
                  ${escapeHtml(variantText)}
                </div>
              `
              : ""
          }

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
        >
          Самовывоз
        </button>

        <button
          id="deliveryOption"
          class="checkout-option"
          type="button"
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
        Остаток оплачивается наличными
        при получении.
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
              ${formatPrice(reservationAmount)}
            </div>

            <div class="checkout-note">
              ${
                escapeHtml(
                  storeConfig?.reservation_text ||
                  "Для оформления заказа необходимо внести залог."
                )
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
                    id="copyReservationButton"
                    class="copy-card-button"
                    type="button"
                  >
                    Скопировать реквизиты
                  </button>
                `
                : ""
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
          placeholder="Введите промокод"
        >

        <button
          id="applyPromoButton"
          class="secondary-button"
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
   CHECKOUT EVENTS
========================================================= */

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
      pickup.classList.add("active");
      delivery?.classList.remove("active");

      renderCheckoutAddress("pickup");
    }
  );

  delivery?.addEventListener(
    "click",
    () => {
      delivery.classList.add("active");
      pickup?.classList.remove("active");

      renderCheckoutAddress("delivery");
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
        if (event.key === "Enter") {
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
      copyReservation
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

function copyReservation() {
  const text =
    getReservationCardText();

  if (!text) {
    showToast(
      "Реквизиты пока не указаны"
    );
    return;
  }

  navigator.clipboard
    ?.writeText(text)
    .then(() =>
      showToast(
        "Реквизиты скопированы"
      )
    )
    .catch(() =>
      showToast(
        "Не удалось скопировать"
      )
    );
}

function renderCheckoutAddress(type) {
  const container =
    document.getElementById(
      "checkoutAddress"
    );

  if (!container) return;

  if (type === "delivery") {
    container.innerHTML = `
      ${
        storeConfig?.delivery_text
          ? `
            <div class="checkout-address-info">
              ${escapeHtml(
                storeConfig.delivery_text
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
        storeConfig?.pickup_text
          ? escapeHtml(
              storeConfig.pickup_text
            )
          : "Самовывоз из магазина IRoom."
      }
    </div>
  `;
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

  if (!input || !status) return;

  const value =
    normalizePromoCode(input.value);

  if (!value) {
    status.textContent =
      "Введите промокод";
    status.className =
      "promo-code-status error";
    return;
  }

  if (!isPromoCodeActive(value)) {
    appliedPromoCode = "";
    status.textContent =
      "Промокод не найден или больше не действует";
    status.className =
      "promo-code-status error";
    return;
  }

  appliedPromoCode =
    input.value.trim();

  status.textContent =
    `Промокод «${appliedPromoCode}» применён`;

  status.className =
    "promo-code-status success";

  showToast("Промокод применён");
}

/* =========================================================
   CREATE ORDER
========================================================= */

async function createOrder() {
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
    const delivery =
      document
        .getElementById(
          "deliveryOption"
        )
        ?.classList.contains(
          "active"
        );

    const comment =
      document
        .getElementById(
          "checkoutComment"
        )
        ?.value
        ?.trim() || "";

    const promo =
      document
        .getElementById(
          "checkoutPromoCode"
        )
        ?.value
        ?.trim() || "";

    if (promo && !isPromoCodeActive(promo)) {
      throw new Error(
        "Промокод не найден или больше не действует"
      );
    }

    if (promo) {
      appliedPromoCode = promo;
    }

    let deliveryCity = "";
    let deliveryStreet = "";
    let deliveryHouse = "";
    let deliveryApartment = "";

    if (delivery) {
      deliveryCity =
        document.getElementById(
          "deliveryCity"
        )?.value?.trim() || "";

      deliveryStreet =
        document.getElementById(
          "deliveryStreet"
        )?.value?.trim() || "";

      deliveryHouse =
        document.getElementById(
          "deliveryHouse"
        )?.value?.trim() || "";

      deliveryApartment =
        document.getElementById(
          "deliveryApartment"
        )?.value?.trim() || "";

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
      Number(
        storeConfig?.reservation_amount ??
        storeConfig?.reservation?.amount ??
        0
      ) || 0;

    let payload;

    if (checkoutCartMode) {
      payload = {
        product_id:
          cart[0]?.product_id || null,

        product_name:
          cart.length === 1
            ? cart[0].name
            : `Корзина (${cart.length} товаров)`,

        variant_id:
          cart.length === 1
            ? cart[0].variant_id
            : null,

        variant_text:
          cart.length === 1
            ? cart[0].variant_text
            : cart.map(
                item =>
                  `${item.name} × ${item.quantity}`
              ).join(" | "),

        selected_options:
          cart.length === 1
            ? cart[0].options
            : null,

        price: getCartTotal(),

        quantity: getCartCount(),

        cart_items: cart,

        promo_code:
          appliedPromoCode || null,

        payment_method: "cash",

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
        customer_comment: comment
      };
    } else {
      if (!currentProduct) {
        throw new Error(
          "Товар не выбран"
        );
      }

      const validation =
        validateSelectedOptions();

      if (!validation.ok) {
        throw new Error(
          validation.error
        );
      }

      const useOptions =
        hasPriceOptions(
          currentProduct
        );

      const price =
        useOptions
          ? getSelectedOptionsPrice(
              currentProduct
            )
          : selectedVariant
            ? getVariantPrice(
                selectedVariant,
                currentProduct
              )
            : getProductPrice(
                currentProduct
              );

      payload = {
        product_id:
          currentProduct.id,

        variant_id:
          selectedVariant
            ? getVariantId(
                selectedVariant
              )
            : null,

        product_name:
          currentProduct.name,

        variant_text:
          useOptions
            ? getSelectedOptionsText()
            : selectedVariant
              ? getVariantName(
                  selectedVariant
                )
              : "",

        selected_options:
          useOptions
            ? getSelectedOptionsPayload()
            : null,

        price,

        quantity: 1,

        promo_code:
          appliedPromoCode || null,

        payment_method: "cash",

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
        customer_comment: comment
      };
    }

    const data =
      await api(
        "/api/orders",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

    currentOrder =
      data?.order || null;

    if (!currentOrder) {
      throw new Error(
        "Сервер не вернул заказ"
      );
    }

    if (checkoutCartMode) {
      clearCart();
      checkoutCartMode = false;
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
   PAGES
========================================================= */

const PAGE_IDS = [
  "homePage",
  "catalogPage",
  "profilePage",
  "ordersPage",
  "cartPage",
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
    cart: "cartPage",
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
    .getElementById(
      "drawerOverlay"
    )
    ?.classList.remove("hidden");

  document
    .getElementById(
      "catalogDrawer"
    )
    ?.classList.add("open");
}

function closeDrawer() {
  document
    .getElementById(
      "catalogDrawer"
    )
    ?.classList.remove("open");

  setTimeout(() => {
    document
      .getElementById(
        "drawerOverlay"
      )
      ?.classList.add("hidden");
  }, 220);
}

function renderDrawerCategories() {
  const container =
    document.getElementById(
      "drawerCategories"
    );

  if (!container) return;

  container.innerHTML =
    categories.length
      ? categories.map(category => `
          <button
            class="drawer-category"
            type="button"
            data-category-id="${escapeHtml(category.id)}"
          >
            <span>
              ${escapeHtml(
                category.name ||
                category.title ||
                "Категория"
              )}
            </span>

            <span>›</span>
          </button>
        `).join("")
      : `
        <div class="drawer-empty">
          Категории пока не добавлены
        </div>
      `;

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
        }
      );
    });
}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {
  document
    .getElementById(
      "menuButton"
    )
    ?.addEventListener(
      "click",
      openDrawer
    );

  document
    .getElementById(
      "drawerOverlay"
    )
    ?.addEventListener(
      "click",
      closeDrawer
    );

  document
    .getElementById(
      "closeDrawerButton"
    )
    ?.addEventListener(
      "click",
      closeDrawer
    );

  document
    .getElementById(
      "logoButton"
    )
    ?.addEventListener(
      "click",
      () => {
        closeDrawer();
        showPage("home");
      }
    );

  /*
   * ВАЖНО:
   * КОРЗИНА теперь открывает КОРЗИНУ,
   * а не заказы.
   */
  document
    .getElementById(
      "cartButton"
    )
    ?.addEventListener(
      "click",
      () => {
        closeDrawer();
        openCart();
      }
    );

  /*
   * Заказы теперь только в профиле.
   */
  document
    .getElementById(
      "profileButton"
    )
    ?.addEventListener(
      "click",
      () => {
        closeDrawer();
        renderProfile();
        showPage("profile");
      }
    );

  document
    .getElementById(
      "profileOrdersButton"
    )
    ?.addEventListener(
      "click",
      async () => {
        await loadOrders();
        showPage("orders");
      }
    );

  document
    .getElementById(
      "drawerOrdersButton"
    )
    ?.addEventListener(
      "click",
      async () => {
        closeDrawer();
        await loadOrders();
        showPage("orders");
      }
    );

  document
    .getElementById(
      "drawerManagerButton"
    )
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
    .getElementById(
      "bannerCatalogButton"
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
    .getElementById(
      "newAllButton"
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
    .getElementById(
      "popularAllButton"
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
    .getElementById(
      "productBackButton"
    )
    ?.addEventListener(
      "click",
      () => showPage("catalog")
    );

  document
    .getElementById(
      "orderBackButton"
    )
    ?.addEventListener(
      "click",
      () => showPage("orders")
    );

  document
    .getElementById(
      "checkoutBackButton"
    )
    ?.addEventListener(
      "click",
      () => {
        if (checkoutCartMode) {
          showPage("cart");
        } else {
          showPage("product");
        }
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

      setTimeout(
        () => input.focus(),
        80
      );
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

  container.innerHTML =
    result.length
      ? result.map(productCard).join("")
      : `
        <div class="search-empty">
          Ничего не найдено
        </div>
      `;

  bindProductCards(container);
}

/* =========================================================
   PRODUCTS
========================================================= */

function productCard(product) {
  const image =
    getProductImage(product);

  const price =
    getProductPrice(product);

  return `
    <article
      class="product-card"
      data-product-id="${escapeHtml(product.id)}"
    >

      <div class="product-image-wrap">

        ${
          image
            ? `
              <img
                class="product-image"
                src="${escapeHtml(image)}"
                alt="${escapeHtml(product.name || "")}"
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
                  typeof product.badge === "string"
                    ? escapeHtml(product.badge)
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
            product.name || "Товар"
          )}
        </h3>

        <span class="product-price">
          ${formatPrice(price)}
        </span>

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
        () =>
          openProduct(
            card.dataset.productId
          )
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

  container.innerHTML =
    source.length
      ? source.map(productCard).join("")
      : `
        <div class="products-empty">
          Новинок пока нет
        </div>
      `;

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

  container.innerHTML =
    source.length
      ? source.map(productCard).join("")
      : `
        <div class="products-empty">
          Популярных товаров пока нет
        </div>
      `;

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

    ${categories.map(category => `
      <button
        class="category-filter ${
          String(selectedCategory) ===
          String(category.id)
            ? "active"
            : ""
        }"
        data-category-id="${escapeHtml(category.id)}"
        type="button"
      >
        ${escapeHtml(
          category.name ||
          category.title ||
          "Категория"
        )}
      </button>
    `).join("")}
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
            button.dataset.categoryId ===
            "all"
              ? null
              : button.dataset.categoryId;

          renderCatalogPage();
        }
      );
    });

  let list = [...products];

  if (selectedCategory !== null) {
    list =
      list.filter(
        product =>
          String(
            product.category_id ??
            product.categoryId ??
            ""
          ) ===
          String(selectedCategory)
      );
  }

  productsContainer.innerHTML =
    list.length
      ? list.map(productCard).join("")
      : `
        <div class="empty-state">
          <h3>Товаров пока нет</h3>
          <p>
            В этой категории пока нет товаров.
          </p>
        </div>
      `;

  bindProductCards(
    productsContainer
  );
}

/* =========================================================
   PRODUCT PAGE
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
        `/api/products/${encodeURIComponent(productId)}`
      );

    product =
      data?.product ||
      product;
  } catch {}

  if (!product) {
    showToast("Товар не найден");
    return;
  }

  currentProduct = product;

  resetProductSelections();

  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  if (
    !hasPriceOptions(product) &&
    variants.length
  ) {
    selectedVariant =
      variants[0];
  }

  renderProductDetails();

  showPage("product");
}

function renderOptionGroup(
  title,
  key,
  options
) {
  if (!options.length) return "";

  return `
    <div class="variants-block">

      <div class="variants-title">
        ${escapeHtml(title)}
      </div>

      <div class="variants-list">

        ${options.map(option => `
          <button
            class="variant-button ${
              String(selectedOptions[key]) ===
              String(option.name)
                ? "active"
                : ""
            }"
            type="button"
            data-option-group="${escapeHtml(key)}"
            data-option-name="${escapeHtml(option.name)}"
          >
            <span>
              ${escapeHtml(option.name)}
            </span>

            ${
              Number(option.surcharge)
                ? `
                  <span>
                    +${formatPrice(option.surcharge)}
                  </span>
                `
                : ""
            }

          </button>
        `).join("")}

      </div>
    </div>
  `;
}

function renderProductDetails() {
  const container =
    document.getElementById(
      "productDetails"
    );

  if (!container || !currentProduct) {
    return;
  }

  const product =
    currentProduct;

  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  const options =
    getProductPriceOptions(product);

  const useOptions =
    hasPriceOptions(product);

  const price =
    useOptions
      ? getSelectedOptionsPrice(product)
      : selectedVariant
        ? getVariantPrice(
            selectedVariant,
            product
          )
        : getProductPrice(product);

  let optionsHtml = "";

  if (useOptions) {
    optionsHtml = `
      ${renderOptionGroup(
        "Цвет",
        "color",
        options.colors
      )}

      ${renderOptionGroup(
        "Память",
        "memory",
        options.memories
      )}

      ${renderOptionGroup(
        "SIM",
        "sim",
        options.sims
      )}

      ${renderOptionGroup(
        "Регион",
        "region",
        options.regions
      )}
    `;
  } else if (variants.length) {
    optionsHtml = `
      <div class="variants-block">

        <div class="variants-title">
          Комплектация
        </div>

        <div class="variants-list">

          ${variants.map(variant => `
            <button
              class="variant-button ${
                String(
                  getVariantId(
                    selectedVariant
                  )
                ) ===
                String(
                  getVariantId(
                    variant
                  )
                )
                  ? "active"
                  : ""
              }"
              data-variant-id="${escapeHtml(
                getVariantId(variant)
              )}"
              type="button"
            >
              <span>
                ${escapeHtml(
                  getVariantName(variant)
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
          `).join("")}

        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="product-detail-image-wrap">

      ${
        getProductImage(product)
          ? `
            <img
              class="product-detail-image"
              src="${escapeHtml(
                getProductImage(product)
              )}"
              alt="${escapeHtml(product.name || "")}"
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
        ${escapeHtml(product.name)}
      </h1>

      <div class="product-detail-price">
        ${formatPrice(price)}
      </div>

      ${
        product.old_price
          ? `
            <div class="product-detail-old-price">
              ${formatPrice(product.old_price)}
            </div>
          `
          : ""
      }

      ${
        product.description
          ? `
            <div class="product-description">
              ${escapeHtml(product.description)}
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
          selectedOptions[
            button.dataset.optionGroup
          ] =
            button.dataset.optionName;

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
          selectedVariant =
            variants.find(
              variant =>
                String(
                  getVariantId(variant)
                ) ===
                String(
                  button.dataset.variantId
                )
            ) || null;

          renderProductDetails();
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
      addCurrentProductToCart
    );
}

/* =========================================================
   ORDERS
========================================================= */

async function loadOrders() {
  try {
    const data =
      await api("/api/orders");

    orders =
      unwrap(data, "orders");

    renderOrders();
  } catch (error) {
    console.error(
      "Orders:",
      error
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
      getReservationStatus(order)
    ] ||
    RESERVATION_INFO.pending_payment
  );
}

function orderCard(order) {
  const status =
    STATUS_INFO[order.status] ||
    STATUS_INFO.new;

  const reservation =
    getReservationInfo(order);

  const product =
    findProduct(order.product_id);

  const image =
    getProductImage(product);

  const reservationAmount =
    Number(order.reservation_amount) || 0;

  return `
    <article
      class="order-card"
      data-order-id="${escapeHtml(order.id)}"
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
          class="order-status ${status.className}"
        >
          ${escapeHtml(status.text)}
        </span>

      </div>

      <div class="order-card-product">

        ${
          image
            ? `
              <img
                src="${escapeHtml(image)}"
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
            ${formatPrice(order.price)}
          </div>

        </div>

      </div>

      ${
        reservationAmount
          ? `
            <div class="order-reservation-status ${reservation.className}">
              <span>Залог:</span>
              <strong>
                ${escapeHtml(
                  reservation.text
                )}
              </strong>
            </div>
          `
          : ""
      }

      <div class="order-card-bottom">
        <span>Подробнее</span>
        <span>›</span>
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

  if (!list || !empty) return;

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
    orders.map(orderCard).join("");

  list
    .querySelectorAll(
      ".order-card"
    )
    .forEach(card => {
      card.addEventListener(
        "click",
        () =>
          openOrder(
            card.dataset.orderId
          )
      );
    });
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

  if (!container) return;

  container.innerHTML = `
    <div class="small-loader"></div>
    <span>Загружаем заказ...</span>
  `;

  try {
    const data =
      await api(
        `/api/orders/${encodeURIComponent(
          orderId
        )}`
      );

    currentOrder =
      data?.order || null;

    if (!currentOrder) {
      throw new Error(
        "Заказ не найден"
      );
    }

    renderOrderDetails();
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Заказ не найден</h3>
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
        () => showPage("orders")
      );
  }
}

function getReservationAmount() {
  return Number(
    storeConfig?.reservation_amount ??
    storeConfig?.reservation?.amount ??
    0
  ) || 0;
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

function renderOrderDetails() {
  const container =
    document.getElementById(
      "orderDetails"
    );

  if (!container || !currentOrder) {
    return;
  }

  const order =
    currentOrder;

  const status =
    STATUS_INFO[order.status] ||
    STATUS_INFO.new;

  const reservationStatus =
    getReservationStatus(order);

  const reservation =
    getReservationInfo(order);

  const reservationAmount =
    Number(order.reservation_amount) || 0;

  const total =
    Number(order.price) || 0;

  const remaining =
    Math.max(
      total - reservationAmount,
      0
    );

  const canPay =
    reservationAmount > 0 &&
    [
      "pending_payment",
      "pending",
      "rejected"
    ].includes(
      reservationStatus
    );

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
          class="order-status ${status.className}"
        >
          ${escapeHtml(status.text)}
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
        <span>Стоимость</span>
        <strong>
          ${formatPrice(total)}
        </strong>
      </div>

      ${
        reservationAmount
          ? `
            <div class="order-payment-card">

              <div class="order-payment-card-header">

                <span>Залог</span>

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
                canPay
                  ? `
                    <div class="order-payment-description">
                      ${
                        reservationStatus ===
                        "rejected"
                          ? "Оплата не была подтверждена. Если вы уже оплатили залог, отправьте заявку повторно."
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
                reservationStatus ===
                "awaiting_confirmation"
                  ? `
                    <div class="order-payment-waiting">
                      <strong>
                        Заявка отправлена на проверку
                      </strong>

                      <span>
                        Менеджер проверит оплату.
                      </span>
                    </div>
                  `
                  : ""
              }

              ${
                reservationStatus ===
                "confirmed"
                  ? `
                    <div class="order-payment-success">
                      <strong>
                        Залог подтверждён
                      </strong>

                      <span>
                        Остаток оплачивается наличными.
                      </span>
                    </div>
                  `
                  : ""
              }

            </div>

            <div class="order-detail-price-row">
              <span>Остаток</span>
              <strong>
                ${formatPrice(remaining)}
              </strong>
            </div>
          `
          : ""
      }

      ${
        order.address
          ? `
            <div class="order-detail-price-row">
              <span>Получение</span>
              <strong>
                ${escapeHtml(order.address)}
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
                  order.comment
                )}
              </div>

            </div>
          `
          : ""
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
      copyReservation
    );
}

async function markReservationPaid() {
  if (!currentOrder) return;

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

    renderOrderDetails();

    await loadOrders();
  } catch (error) {
    showToast(
      error.message ||
      "Не удалось отправить заявку"
    );

    if (button) {
      button.disabled = false;
      button.textContent =
        "Я оплатил(а) залог";
    }
  }
}

/* =========================================================
   PROFILE
========================================================= */

async function loadCurrentUser() {
  try {
    const data =
      await api("/api/me");

    currentUser =
      data?.user || null;

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

  const adminButton =
    document.getElementById(
      "adminProfileButton"
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
      avatar.textContent = "U";
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

  /*
   * Админка открывается только
   * через отдельную кнопку профиля.
   */
  adminButton?.addEventListener(
    "click",
    () => {
      window.location.href =
        "/admin.html";
    },
    { once: true }
  );
}

/* =========================================================
   CONTACT
========================================================= */

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

function openContact(message) {
  openTelegram(
    `https://t.me/iroom_24?text=${encodeURIComponent(
      message
    )}`
  );
}

function setupContactButtons() {
  document
    .getElementById(
      "contactManagerButton"
    )
    ?.addEventListener(
      "click",
      () =>
        openContact(
          "Здравствуйте! Хочу проконсультироваться по товарам IRoom."
        )
    );

  document
    .getElementById(
      "profileManagerButton"
    )
    ?.addEventListener(
      "click",
      () =>
        openContact(
          "Здравствуйте! Нужна помощь по IRoom."
        )
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

    if (button) {
      button.classList.toggle(
        "hidden",
        !isAdmin
      );
    }

    const adminButton =
      document.getElementById(
        "adminButton"
      );

    if (adminButton) {
      adminButton.classList.toggle(
        "hidden",
        !isAdmin
      );
    }
  } catch (error) {
    console.error(
      "Admin check:",
      error
    );
  }
}

/* =========================================================
   STORE
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
  } catch {
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

  if (!track || !dots) return;

  const slides =
    track.querySelectorAll(
      ".banner-slide"
    );

  if (!slides.length) return;

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

      if (!width) return;

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
          (dot, i) =>
            dot.classList.toggle(
              "active",
              i === index
            )
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
    .getElementById(
      "app"
    )
    ?.classList.remove(
      "hidden"
    );
}

async function safeLoadStore() {
  await Promise.allSettled([
    loadProducts(),
    loadCategories(),
    loadStoreConfig(),
    loadCurrentUser()
  ]);

  renderHome();
  renderCatalogPage();
  renderProfile();

  await checkAdmin();

  /*
   * Заказы загружаем только
   * для профиля/деталей.
   * Они больше не используются
   * как содержимое корзины.
   */
  loadOrders().catch(
    console.error
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

      loadCart();

      setupNavigation();
      setupSearch();
      setupContactButtons();
      setupBanners();

      showPage("home");

      hideStartupScreen();

      await safeLoadStore();
    } catch (error) {
      console.error(
        "Startup:",
        error
      );

      hideStartupScreen();

      showToast(
        "Магазин открыт"
      );
    }
  }
);

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