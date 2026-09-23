const tg = window.Telegram?.WebApp;

let products = [];
let categories = [];
let currentProduct = null;
let currentOrder = null;
let selectedCategory = null;
let selectedVariants = {};
let currentUser = null;
let orders = [];

const STATUS_INFO = {
  new: {
    text: "Новый",
    className: "status-new"
  },

  processing: {
    text: "В обработке",
    className: "status-processing"
  },

  awaiting_payment: {
    text: "Ожидает оплаты",
    className: "status-payment"
  },

  reserved: {
    text: "Забронирован",
    className: "status-reserved"
  },

  completed: {
    text: "Завершён",
    className: "status-completed"
  },

  cancelled: {
    text: "Отменён",
    className: "status-cancelled"
  }
};


/* =========================================================
   TELEGRAM
========================================================= */

function initTelegram() {
  try {
    if (!tg) {
      return;
    }

    tg.ready();
    tg.expand();

    if (tg.setHeaderColor) {
      tg.setHeaderColor("#050505");
    }

    if (tg.setBackgroundColor) {
      tg.setBackgroundColor("#050505");
    }
  } catch (error) {
    console.error("Telegram init:", error);
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

    const initData =
      tg?.initData || "";

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
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        `HTTP ${response.status}`
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}


function unwrap(data, key) {
  if (!data) {
    return [];
  }

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


function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString(
    "ru-RU",
    {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }
  );
}


function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
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
    product?.price ||
    product?.current_price ||
    0
  );
}


function getVariantId(variant) {
  return (
    variant?.id ??
    variant?.variant_id ??
    ""
  );
}


function getVariantName(variant) {
  return (
    variant?.name ||
    variant?.title ||
    variant?.variant_text ||
    ""
  );
}


function getVariantPrice(variant, product) {
  if (
    variant?.price !== undefined &&
    variant?.price !== null &&
    variant?.price !== ""
  ) {
    return Number(variant.price);
  }

  return getProductPrice(product);
}


function getStatusInfo(status) {
  return (
    STATUS_INFO[status] ||
    {
      text: status || "Новый",
      className: "status-new"
    }
  );
}


function showToast(message) {
  const toast =
    document.getElementById("toast");

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(
    showToast.timer
  );

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}


function haptic(style = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred(style);
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
  "ordersPage",
  "orderPage",
  "profilePage",
  "productPage"
];


function hideAllPages() {
  PAGE_IDS.forEach((id) => {
    const page =
      document.getElementById(id);

    if (page) {
      page.classList.add("hidden");
    }
  });
}


function setActiveNav(pageName) {
  document
    .querySelectorAll(".bottom-nav-item")
    .forEach((button) => {
      button.classList.remove("active");
    });

  const map = {
    home: "navHome",
    catalog: "navCatalog",
    orders: "navOrders",
    profile: "navProfile"
  };

  const id = map[pageName];

  if (id) {
    document
      .getElementById(id)
      ?.classList.add("active");
  }
}


function showPage(pageName) {
  hideAllPages();

  const pageMap = {
    home: "homePage",
    catalog: "catalogPage",
    orders: "ordersPage",
    profile: "profilePage",
    order: "orderPage",
    product: "productPage"
  };

  const pageId =
    pageMap[pageName];

  if (!pageId) {
    return;
  }

  document
    .getElementById(pageId)
    ?.classList.remove("hidden");

  const bottomNavigation =
    document.getElementById(
      "bottomNavigation"
    );

  if (
    bottomNavigation
  ) {
    if (
      pageName === "product" ||
      pageName === "order"
    ) {
      bottomNavigation.classList.add(
        "hidden"
      );
    } else {
      bottomNavigation.classList.remove(
        "hidden"
      );
    }
  }

  if (
    pageName === "home" ||
    pageName === "catalog" ||
    pageName === "orders" ||
    pageName === "profile"
  ) {
    setActiveNav(pageName);
  }

  window.scrollTo({
    top: 0,
    behavior: "instant"
  });
}


/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {
  document
    .getElementById("navHome")
    ?.addEventListener(
      "click",
      () => {
        haptic();
        showPage("home");
      }
    );

  document
    .getElementById("navCatalog")
    ?.addEventListener(
      "click",
      () => {
        haptic();
        renderCatalogPage();
        showPage("catalog");
      }
    );

  document
    .getElementById("navOrders")
    ?.addEventListener(
      "click",
      async () => {
        haptic();
        showPage("orders");
        await loadOrders();
      }
    );

  document
    .getElementById("navProfile")
    ?.addEventListener(
      "click",
      () => {
        haptic();
        renderProfile();
        showPage("profile");
      }
    );

  document
    .getElementById("logoButton")
    ?.addEventListener(
      "click",
      () => {
        showPage("home");
      }
    );

  document
    .getElementById("heroCatalogButton")
    ?.addEventListener(
      "click",
      () => {
        renderCatalogPage();
        showPage("catalog");
      }
    );

  document
    .getElementById("emptyOrdersCatalogButton")
    ?.addEventListener(
      "click",
      () => {
        renderCatalogPage();
        showPage("catalog");
      }
    );

  document
    .getElementById("profileOrdersButton")
    ?.addEventListener(
      "click",
      async () => {
        showPage("orders");
        await loadOrders();
      }
    );

  document
    .getElementById("orderBackButton")
    ?.addEventListener(
      "click",
      () => {
        showPage("orders");
        loadOrders();
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
}


/* =========================================================
   USER
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
      "loadCurrentUser:",
      error
    );
  }
}


function renderProfile() {
  const nameElement =
    document.getElementById(
      "profileName"
    );

  const usernameElement =
    document.getElementById(
      "profileUsername"
    );

  const avatarElement =
    document.getElementById(
      "profileAvatar"
    );

  if (!currentUser) {
    if (nameElement) {
      nameElement.textContent =
        "Покупатель";
    }

    if (usernameElement) {
      usernameElement.textContent =
        "Telegram";
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

  const name =
    fullName ||
    currentUser.username ||
    "Покупатель";

  if (nameElement) {
    nameElement.textContent = name;
  }

  if (usernameElement) {
    usernameElement.textContent =
      currentUser.username
        ? `@${currentUser.username}`
        : "Telegram";
  }

  if (avatarElement) {
    avatarElement.textContent =
      String(name)
        .charAt(0)
        .toUpperCase();
  }
}


/* =========================================================
   CATEGORIES
========================================================= */

function renderCategories() {
  const container =
    document.getElementById(
      "categories"
    );

  if (!container) {
    return;
  }

  if (!categories.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML =
    categories
      .map((category) => {
        const id =
          category.id;

        const image =
          category.image_url ||
          category.image ||
          "";

        return `
          <button
            class="category-card ${
              String(selectedCategory) ===
              String(id)
                ? "active"
                : ""
            }"
            type="button"
            data-category-id="${escapeHtml(id)}"
          >
            ${
              image
                ? `
                  <img
                    src="${escapeHtml(image)}"
                    alt=""
                  >
                `
                : `
                  <div class="category-placeholder">
                    I
                  </div>
                `
            }

            <span>
              ${escapeHtml(
                category.name ||
                category.title ||
                "Категория"
              )}
            </span>
          </button>
        `;
      })
      .join("");

  container
    .querySelectorAll(
      ".category-card"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          selectedCategory =
            button.dataset.categoryId;

          renderCategories();
          renderCatalog();

          document
            .getElementById(
              "catalogSection"
            )
            ?.scrollIntoView({
              behavior: "smooth"
            });
        }
      );
    });
}


/* =========================================================
   PRODUCT CARDS
========================================================= */

function productCard(product) {
  const id = product.id;
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
      data-product-id="${escapeHtml(id)}"
    >

      <div class="product-image-wrap">

        ${
          image
            ? `
              <img
                class="product-image"
                src="${escapeHtml(image)}"
                alt="${escapeHtml(
                  product.name
                )}"
                loading="lazy"
              >
            `
            : `
              <div class="product-image-placeholder">
                I
              </div>
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

        <div class="product-price-row">

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


function renderNewProducts() {
  const container =
    document.getElementById(
      "newProducts"
    );

  if (!container) {
    return;
  }

  const newProducts =
    products.filter(
      (product) =>
        product.is_new ||
        product.new ||
        product.badge
    );

  const source =
    newProducts.length
      ? newProducts
      : products.slice(0, 6);

  container.innerHTML =
    source
      .map(productCard)
      .join("");

  bindProductCards(container);
}


function renderCatalog() {
  const container =
    document.getElementById(
      "catalog"
    );

  if (!container) {
    return;
  }

  let list = [...products];

  if (selectedCategory !== null) {
    list = list.filter(
      (product) =>
        String(
          product.category_id ??
          product.categoryId ??
          ""
        ) ===
        String(selectedCategory)
    );
  }

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>
          Товаров пока нет
        </h3>

        <p>
          Попробуйте выбрать другую категорию.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    list
      .map(productCard)
      .join("");

  bindProductCards(container);
}


function renderCatalogPage() {
  const container =
    document.getElementById(
      "catalogPageProducts"
    );

  const categoriesContainer =
    document.getElementById(
      "catalogPageCategories"
    );

  if (categoriesContainer) {
    categoriesContainer.innerHTML =
      `
        <button
          class="category-filter ${
            selectedCategory === null
              ? "active"
              : ""
          }"
          type="button"
          data-category-id="all"
        >
          Все
        </button>
      ` +
      categories
        .map(
          (category) => `
            <button
              class="category-filter ${
                String(selectedCategory) ===
                String(category.id)
                  ? "active"
                  : ""
              }"
              type="button"
              data-category-id="${escapeHtml(
                category.id
              )}"
            >
              ${escapeHtml(
                category.name ||
                category.title ||
                "Категория"
              )}
            </button>
          `
        )
        .join("");

    categoriesContainer
      .querySelectorAll(
        ".category-filter"
      )
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            if (
              button.dataset.categoryId ===
              "all"
            ) {
              selectedCategory = null;
            } else {
              selectedCategory =
                button.dataset.categoryId;
            }

            renderCatalogPage();
          }
        );
      });
  }

  if (!container) {
    return;
  }

  let list = [...products];

  if (selectedCategory !== null) {
    list = list.filter(
      (product) =>
        String(
          product.category_id ??
          product.categoryId ??
          ""
        ) ===
        String(selectedCategory)
    );
  }

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>
          Ничего не найдено
        </h3>

        <p>
          В этой категории пока нет товаров.
        </p>
      </div>
    `;

    return;
  }

  container.innerHTML =
    list
      .map(productCard)
      .join("");

  bindProductCards(container);
}


function bindProductCards(container) {
  container
    .querySelectorAll(
      ".product-card"
    )
    .forEach((card) => {
      card.addEventListener(
        "click",
        () => {
          const productId =
            card.dataset.productId;

          openProduct(productId);
        }
      );
    });
}


/* =========================================================
   PRODUCT DETAIL
========================================================= */

function findProduct(id) {
  return products.find(
    (product) =>
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
    showToast("Товар не найден");
    return;
  }

  currentProduct = product;
  selectedVariants = {};

  renderProductDetails();

  showPage("product");
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

  const image =
    getProductImage(product);

  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  const basePrice =
    getProductPrice(product);

  let currentPrice =
    basePrice;

  if (variants.length) {
    const firstSelected =
      Object.values(
        selectedVariants
      )[0];

    if (firstSelected) {
      currentPrice =
        getVariantPrice(
          firstSelected,
          product
        );
    }
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
                product.name
              )}"
            >
          `
          : `
            <div class="product-detail-image-placeholder">
              I
            </div>
          `
      }

    </div>


    <div class="product-detail-content">

      <div class="product-detail-kicker">
        IROOM STORE
      </div>

      <h1 class="product-detail-title">
        ${escapeHtml(
          product.name ||
          "Товар"
        )}
      </h1>


      <div class="product-detail-price">
        ${formatPrice(
          currentPrice
        )}
      </div>


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


      ${
        variants.length
          ? `
            <div class="variants-block">

              <div class="variants-title">
                Вариант
              </div>

              <div
                class="variants-list"
                id="productVariants"
              >
                ${variants
                  .map(
                    (variant, index) => {
                      const id =
                        getVariantId(
                          variant
                        );

                      return `
                        <button
                          type="button"
                          class="variant-button ${
                            index === 0
                              ? "active"
                              : ""
                          }"
                          data-variant-id="${escapeHtml(
                            id
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
                    }
                  )
                  .join("")}
              </div>

            </div>
          `
          : ""
      }


      <button
        id="bookProductButton"
        class="primary-button product-book-button"
        type="button"
      >
        Забронировать
      </button>


      <button
        id="productContactButton"
        class="secondary-button product-contact-button"
        type="button"
      >
        Связаться с менеджером
      </button>

    </div>
  `;


  /*
   * По умолчанию выбираем первый вариант.
   */
  if (variants.length) {
    selectedVariants =
      {};

    const first =
      variants[0];

    selectedVariants.variant =
      first;

    document
      .querySelectorAll(
        ".variant-button"
      )
      .forEach((button, index) => {
        button.classList.toggle(
          "active",
          index === 0
        );
      });
  }


  document
    .querySelectorAll(
      ".variant-button"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const variant =
            variants.find(
              (item) =>
                String(
                  getVariantId(
                    item
                  )
                ) ===
                String(
                  button.dataset.variantId
                )
            );

          if (!variant) {
            return;
          }

          selectedVariants.variant =
            variant;

          document
            .querySelectorAll(
              ".variant-button"
            )
            .forEach((item) => {
              item.classList.remove(
                "active"
              );
            });

          button.classList.add(
            "active"
          );

          renderProductDetails();
        }
      );
    });


  document
    .getElementById(
      "bookProductButton"
    )
    ?.addEventListener(
      "click",
      () => {
        createOrder();
      }
    );


  document
    .getElementById(
      "productContactButton"
    )
    ?.addEventListener(
      "click",
      () => {
        openContact(
          `Здравствуйте! Хочу узнать подробнее о товаре «${
            product.name
          }».`
        );
      }
    );
}


/* =========================================================
   CREATE ORDER
========================================================= */

async function createOrder() {
  if (!currentProduct) {
    return;
  }

  haptic("medium");

  const button =
    document.getElementById(
      "bookProductButton"
    );

  if (button) {
    button.disabled = true;
    button.textContent =
      "Оформляем...";
  }

  try {
    const product =
      currentProduct;

    const variant =
      selectedVariants.variant ||
      null;

    const price =
      variant
        ? getVariantPrice(
            variant,
            product
          )
        : getProductPrice(
            product
          );

    const variantText =
      variant
        ? getVariantName(
            variant
          )
        : "";

    const data =
      await api(
        "/api/orders",
        {
          method: "POST",
          body: JSON.stringify({
            product_id:
              product.id,

            variant_id:
              variant
                ? getVariantId(
                    variant
                  )
                : null,

            product_name:
              product.name ||
              "Товар",

            variant_text:
              variantText,

            price
          })
        }
      );

    currentOrder =
      data?.order ||
      null;

    if (!currentOrder) {
      throw new Error(
        "Заказ не был создан"
      );
    }

    haptic("heavy");

    showToast(
      "Заказ успешно создан"
    );

    await loadOrders();

    openOrder(
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
        "Забронировать";
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

  if (loading) {
    loading.classList.remove(
      "hidden"
    );
  }

  if (empty) {
    empty.classList.add(
      "hidden"
    );
  }

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
    updateOrdersBadge();

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
            Попробуйте открыть раздел ещё раз.
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
    if (loading) {
      loading.classList.add(
        "hidden"
      );
    }
  }
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
    list.innerHTML = "";

    empty.classList.remove(
      "hidden"
    );

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
    .forEach((card) => {
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


function orderCard(order) {
  const status =
    getStatusInfo(
      order.status
    );

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
          class="order-status ${status.className}"
        >
          ${escapeHtml(
            status.text
          )}
        </span>

      </div>


      <div class="order-card-product">

        ${
          getProductImage({
            image_url:
              findProduct(
                order.product_id
              )?.image_url
          })
            ? `
              <img
                src="${escapeHtml(
                  getProductImage(
                    findProduct(
                      order.product_id
                    )
                  )
                )}"
                alt=""
              >
            `
            : `
              <div class="order-card-image-placeholder">
                I
              </div>
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


      <div class="order-card-bottom">

        <span>
          Подробнее
        </span>

        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m9 18 6-6-6-6"></path>
        </svg>

      </div>

    </article>
  `;
}


function updateOrdersBadge() {
  const badge =
    document.getElementById(
      "ordersBadge"
    );

  if (!badge) {
    return;
  }

  const activeOrders =
    orders.filter(
      (order) =>
        ![
          "completed",
          "cancelled"
        ].includes(
          String(order.status)
        )
    );

  if (!activeOrders.length) {
    badge.classList.add(
      "hidden"
    );

    return;
  }

  badge.textContent =
    activeOrders.length > 9
      ? "9+"
      : String(
          activeOrders.length
        );

  badge.classList.remove(
    "hidden"
  );
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
    <div class="orders-loading">
      <div class="small-loader"></div>
      <span>
        Загружаем заказ...
      </span>
    </div>
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
          id="backOrdersErrorButton"
          type="button"
        >
          Вернуться к заказам
        </button>
      </div>
    `;

    document
      .getElementById(
        "backOrdersErrorButton"
      )
      ?.addEventListener(
        "click",
        () => {
          showPage("orders");
          loadOrders();
        }
      );
  }
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
    getStatusInfo(
      order.status
    );

  const product =
    findProduct(
      order.product_id
    );

  const image =
    getProductImage(
      product
    );

  const timelineStatuses = [
    "new",
    "processing",
    "awaiting_payment",
    "reserved",
    "completed"
  ];

  const currentIndex =
    timelineStatuses.indexOf(
      order.status
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
              <div class="order-detail-image-placeholder">
                I
              </div>
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
          Стоимость
        </span>

        <strong>
          ${formatPrice(
            order.price
          )}
        </strong>

      </div>


      ${
        order.status ===
        "cancelled"
          ? `
            <div class="order-cancelled-box">
              Заказ отменён менеджером.
              Если это произошло по ошибке,
              свяжитесь с менеджером.
            </div>
          `
          : ""
      }


      ${
        order.status !==
        "cancelled"
          ? `
            <div class="order-timeline">

              ${timelineStatuses
                .map(
                  (item, index) => {
                    const info =
                      getStatusInfo(
                        item
                      );

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
                            info.text
                          )}
                        </div>

                      </div>
                    `;
                  }
                )
                .join("")}

            </div>
          `
          : ""
      }


      <button
        id="orderManagerButton"
        class="secondary-button"
        type="button"
      >
        Связаться с менеджером
      </button>

    </div>
  `;


  document
    .getElementById(
      "orderManagerButton"
    )
    ?.addEventListener(
      "click",
      () => {
        openContact(
          `Здравствуйте! Вопрос по заказу ${
            order.display_id ||
            order.id
          }.`
        );
      }
    );
}


/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {
  const searchButton =
    document.getElementById(
      "searchButton"
    );

  const closeButton =
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

  if (!panel || !input) {
    return;
  }

  searchButton?.addEventListener(
    "click",
    () => {
      panel.classList.remove(
        "hidden"
      );

      setTimeout(() => {
        input.focus();
      }, 50);
    }
  );

  closeButton?.addEventListener(
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

  if (!container) {
    return;
  }

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

  const results =
    products.filter(
      (product) => {
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
      }
    );

  if (!results.length) {
    container.innerHTML = `
      <div class="search-empty">
        Ничего не найдено
      </div>
    `;

    return;
  }

  container.innerHTML =
    results
      .map(productCard)
      .join("");

  bindProductCards(
    container
  );
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

    const container =
      document.getElementById(
        "adminProfileButton"
      );

    if (container) {
      container.classList.toggle(
        "hidden",
        !isAdmin
      );
    }

    document
      .getElementById(
        "adminButton"
      )
      ?.addEventListener(
        "click",
        () => {
          window.location.href =
            "/admin.html";
        }
      );

  } catch (error) {
    console.error(
      "checkAdmin:",
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


async function loadStore() {
  try {
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadCurrentUser()
    ]);

    renderCategories();
    renderNewProducts();
    renderCatalog();
    renderCatalogPage();
    renderProfile();

    await checkAdmin();

  } catch (error) {
    console.error(
      "loadStore:",
      error
    );

    showToast(
      "Не удалось загрузить магазин"
    );
  } finally {
    const loader =
      document.getElementById(
        "loader"
      );

    if (loader) {
      loader.classList.add(
        "hidden"
      );
    }

    const startup =
      document.getElementById(
        "startupScreen"
      );

    const app =
      document.getElementById(
        "app"
      );

    if (startup) {
      startup.classList.add(
        "hidden"
      );
    }

    if (app) {
      app.classList.remove(
        "hidden"
      );
    }
  }
}


/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    initTelegram();

    setupNavigation();
    setupSearch();
    setupContactButtons();

    showPage("home");

    /*
     * Загрузка магазина.
     */
    await loadStore();

    /*
     * Загружаем заказы в фоне,
     * чтобы сразу показать badge.
     */
    try {
      await loadOrders();
    } catch {}
  }
);


/* =========================================================
   EMERGENCY LOADER STOP
========================================================= */

setTimeout(() => {
  const startup =
    document.getElementById(
      "startupScreen"
    );

  const app =
    document.getElementById(
      "app"
    );

  if (startup) {
    startup.classList.add(
      "hidden"
    );
  }

  if (app) {
    app.classList.remove(
      "hidden"
    );
  }
}, 12000);