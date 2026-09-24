/* =========================================================
   TELEGRAM
========================================================= */

let tg = null;

const ADMIN_IDS = [
  "5082864281",
  "5975037118"
];

function getTelegram() {
  try {
    return window.Telegram?.WebApp || null;
  } catch {
    return null;
  }
}

function getInitData() {
  const telegram = getTelegram();

  return String(
    telegram?.initData || ""
  );
}

function getTelegramUser() {
  const telegram = getTelegram();

  return telegram?.initDataUnsafe?.user || null;
}

function telegramUserId() {
  const user =
    getTelegramUser();

  return String(
    user?.id || ""
  );
}

function isAdmin() {
  return ADMIN_IDS.includes(
    telegramUserId()
  );
}

function waitForTelegram(
  timeout = 7000
) {
  return new Promise(
    (resolve) => {
      const started =
        Date.now();

      const check = () => {
        tg = getTelegram();

        const hasTelegram =
          Boolean(tg);

        const hasInitData =
          Boolean(
            tg?.initData
          );

        const hasUser =
          Boolean(
            tg?.initDataUnsafe
              ?.user
              ?.id
          );

        if (
          hasTelegram &&
          (
            hasInitData ||
            hasUser
          )
        ) {
          resolve(true);
          return;
        }

        if (
          Date.now() -
            started >=
          timeout
        ) {
          resolve(
            Boolean(tg)
          );
          return;
        }

        setTimeout(
          check,
          100
        );
      };

      check();
    }
  );
}

function initTelegram() {
  tg = getTelegram();

  if (!tg) {
    return false;
  }

  try {
    tg.ready();

    tg.expand();

    if (
      typeof tg.setHeaderColor ===
      "function"
    ) {
      tg.setHeaderColor(
        "#09090b"
      );
    }

    if (
      typeof tg.setBackgroundColor ===
      "function"
    ) {
      tg.setBackgroundColor(
        "#09090b"
      );
    }

    if (
      typeof tg.disableVerticalSwipes ===
      "function"
    ) {
      tg.disableVerticalSwipes();
    }
  } catch (error) {
    console.warn(
      "Telegram init error:",
      error
    );
  }

  return true;
}


/* =========================================================
   STATE
========================================================= */

let products = [];
let categories = [];
let banners = [];
let reservationCards = [];
let pickupPoints = [];
let orders = [];
let settings = {};

let currentProduct = null;
let currentCategory = null;
let currentBanner = null;
let currentReservationCard = null;
let currentPickupPoint = null;
let currentOrder = null;

let currentOrderStatusFilter =
  "all";

let currentReservationFilter =
  "all";


/* =========================================================
   HELPERS
========================================================= */

const $ = (id) =>
  document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function num(
  value,
  fallback = 0
) {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function formatPrice(value) {
  return `${num(
    value
  ).toLocaleString(
    "ru-RU"
  )} ₽`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
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
   API
========================================================= */

async function api(
  url,
  options = {}
) {
  const headers = {
    ...(options.headers || {})
  };

  const initData =
    getInitData();

  if (initData) {
    headers[
      "x-telegram-init-data"
    ] = initData;
  }

  if (
    options.body &&
    typeof options.body !==
      "string" &&
    !(options.body instanceof
      FormData)
  ) {
    headers[
      "Content-Type"
    ] =
      "application/json";

    options = {
      ...options,
      body: JSON.stringify(
        options.body
      )
    };
  }

  const response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    );

  let data = {};

  try {
    data =
      await response.json();
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
   UI
========================================================= */

function toast(
  message,
  type = "normal"
) {
  let element =
    document.querySelector(
      ".admin-toast"
    );

  if (!element) {
    element =
      document.createElement(
        "div"
      );

    element.className =
      "admin-toast";

    document.body.appendChild(
      element
    );
  }

  element.textContent =
    message;

  element.dataset.type =
    type;

  element.classList.add(
    "show"
  );

  clearTimeout(
    element._timer
  );

  element._timer =
    setTimeout(
      () => {
        element.classList.remove(
          "show"
        );
      },
      2800
    );
}

function haptic(
  type = "light"
) {
  try {
    const telegram =
      getTelegram();

    telegram?.HapticFeedback?.impactOccurred(
      type
    );
  } catch {}
}

function closeModal(id) {
  const modal =
    $(id);

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "open"
  );

  modal.style.display =
    "none";
}

function openModal(id) {
  const modal =
    $(id);

  if (!modal) {
    return;
  }

  modal.style.display =
    "flex";

  requestAnimationFrame(
    () => {
      modal.classList.add(
        "open"
      );
    }
  );
}

function closeAllModals() {
  document
    .querySelectorAll(
      ".modal, .admin-modal"
    )
    .forEach(
      (modal) => {
        modal.classList.remove(
          "open"
        );

        modal.style.display =
          "none";
      }
    );
}


/* =========================================================
   STATUS
========================================================= */

const ORDER_STATUS = {
  new: {
    text: "Новый",
    className:
      "status-new"
  },

  confirmed: {
    text: "Подтверждён",
    className:
      "status-confirmed"
  },

  processing: {
    text: "В обработке",
    className:
      "status-processing"
  },

  ready: {
    text: "Готов к выдаче",
    className:
      "status-ready"
  },

  completed: {
    text: "Завершён",
    className:
      "status-completed"
  },

  cancelled: {
    text: "Отменён",
    className:
      "status-cancelled"
  },

  rejected: {
    text: "Отменён",
    className:
      "status-cancelled"
  }
};

const RESERVATION_STATUS = {
  not_required: {
    text: "Без залога",
    className:
      "status-none"
  },

  pending_payment: {
    text: "Ожидает оплаты",
    className:
      "status-payment"
  },

  pending: {
    text: "Ожидает оплаты",
    className:
      "status-payment"
  },

  awaiting_confirmation: {
    text: "Ожидает проверки",
    className:
      "status-review"
  },

  confirmed: {
    text: "Залог подтверждён",
    className:
      "status-confirmed"
  },

  rejected: {
    text: "Залог отклонён",
    className:
      "status-cancelled"
  }
};

function orderStatusHtml(
  status
) {
  const info =
    ORDER_STATUS[
      status
    ] || {
      text:
        status ||
        "Новый",
      className:
        "status-new"
    };

  return `
    <span class="status-badge ${info.className}">
      ${esc(info.text)}
    </span>
  `;
}

function reservationStatusHtml(
  status
) {
  const info =
    RESERVATION_STATUS[
      status
    ] || {
      text:
        status || "—",
      className:
        "status-none"
    };

  return `
    <span class="status-badge ${info.className}">
      ${esc(info.text)}
    </span>
  `;
}


/* =========================================================
   NAVIGATION
========================================================= */

function activateTab(
  tabName
) {
  document
    .querySelectorAll(
      "[data-tab]"
    )
    .forEach(
      (button) => {
        button.classList.toggle(
          "active",
          button.dataset.tab ===
            tabName
        );
      }
    );

  document
    .querySelectorAll(
      "[data-section]"
    )
    .forEach(
      (section) => {
        section.classList.toggle(
          "active",
          section.dataset.section ===
            tabName
        );
      }
    );

  if (
    window.history &&
    window.history.replaceState
  ) {
    window.history.replaceState(
      null,
      "",
      `#${tabName}`
    );
  }

  if (
    tabName ===
    "products"
  ) {
    loadProducts();
  }

  if (
    tabName ===
    "categories"
  ) {
    loadCategories();
  }

  if (
    tabName ===
    "banners"
  ) {
    loadBanners();
  }

  if (
    tabName ===
    "reservation"
  ) {
    loadReservationCards();
    loadSettings();
  }

  if (
    tabName ===
    "pickup"
  ) {
    loadPickupPoints();
  }

  if (
    tabName ===
    "orders"
  ) {
    loadOrders();
  }

  if (
    tabName ===
    "settings"
  ) {
    loadSettings();
  }
}

function setupNavigation() {
  document
    .querySelectorAll(
      "[data-tab]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            haptic();

            activateTab(
              button.dataset
                .tab
            );
          }
        );
      }
    );

  const hash =
    location.hash.replace(
      "#",
      ""
    );

  activateTab(
    hash ||
      "products"
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {
  const total =
    orders.length;

  const newOrders =
    orders.filter(
      (order) =>
        order.status ===
        "new"
    ).length;

  const reviewOrders =
    orders.filter(
      (order) =>
        order.reservation_status ===
        "awaiting_confirmation"
    ).length;

  const pendingPayments =
    orders.filter(
      (order) =>
        order.reservation_status ===
          "pending_payment" ||
        order.reservation_status ===
          "pending"
    ).length;

  const ready =
    orders.filter(
      (order) =>
        order.status ===
        "ready"
    ).length;

  const completed =
    orders.filter(
      (order) =>
        order.status ===
        "completed"
    ).length;

  const mappings = {
    totalOrders:
      total,

    ordersCount:
      total,

    newOrders:
      newOrders,

    newOrdersCount:
      newOrders,

    reservationReviewCount:
      reviewOrders,

    pendingReservationCount:
      pendingPayments,

    readyOrdersCount:
      ready,

    completedOrdersCount:
      completed
  };

  Object.entries(
    mappings
  ).forEach(
    ([id, value]) => {
      const element =
        $(id);

      if (element) {
        element.textContent =
          value;
      }
    }
  );
}


/* =========================================================
   PRODUCTS
========================================================= */

async function loadProducts() {
  try {
    const data =
      await api(
        "/api/admin/products"
      );

    products =
      data.products ||
      [];

    renderProducts();

    updateDashboard();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

function renderProducts() {
  const container =
    $(
      "productsList"
    ) ||
    $(
      "adminProductsList"
    ) ||
    document.querySelector(
      "[data-products-list]"
    );

  if (!container) {
    return;
  }

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        Товаров пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    products
      .map(
        (product) => {
          const image =
            product.image_url ||
            (
              Array.isArray(
                product.images
              )
                ? product
                    .images[0]
                : ""
            );

          return `
            <div class="admin-card product-admin-card">
              <div class="admin-product-image">
                ${
                  image
                    ? `
                      <img
                        src="${esc(
                          image
                        )}"
                        alt=""
                      >
                    `
                    : `
                      <div class="no-image">
                        Нет фото
                      </div>
                    `
                }
              </div>

              <div class="admin-card-content">
                <div class="admin-card-title">
                  ${esc(
                    product.name
                  )}
                </div>

                <div class="admin-card-price">
                  ${formatPrice(
                    product.price
                  )}
                </div>

                ${
                  product.old_price
                    ? `
                      <div class="admin-card-old-price">
                        ${formatPrice(
                          product.old_price
                        )}
                      </div>
                    `
                    : ""
                }

                <div class="admin-card-meta">
                  ID: ${product.id}
                </div>

                <div class="admin-card-actions">
                  <button
                    class="admin-button secondary"
                    onclick="editProduct(${product.id})"
                  >
                    Изменить
                  </button>

                  <button
                    class="admin-button danger"
                    onclick="deleteProduct(${product.id})"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          `;
        }
      )
      .join("");
}

function fillProductForm(
  product = null
) {
  const form =
    $(
      "productForm"
    );

  if (!form) {
    return;
  }

  currentProduct =
    product;

  const set = (
    id,
    value
  ) => {
    const element =
      $(id);

    if (element) {
      element.value =
        value ?? "";
    }
  };

  set(
    "productName",
    product?.name
  );

  set(
    "productDescription",
    product?.description
  );

  set(
    "productPrice",
    product?.price
  );

  set(
    "productOldPrice",
    product?.old_price
  );

  set(
    "productImage",
    product?.image_url
  );

  set(
    "productCategory",
    product?.category_id
  );

  set(
    "productImages",
    Array.isArray(
      product?.images
    )
      ? product.images.join(
          "\n"
        )
      : ""
  );

  const options =
    typeof product?.price_options ===
    "string"
      ? (() => {
          try {
            return JSON.parse(
              product.price_options
            );
          } catch {
            return {};
          }
        })()
      : product?.price_options ||
        {};

  set(
    "productColors",
    serializeOptions(
      options.colors
    )
  );

  set(
    "productMemories",
    serializeOptions(
      options.memories
    )
  );

  set(
    "productSims",
    serializeOptions(
      options.sims
    )
  );

  set(
    "productRegions",
    serializeOptions(
      options.regions
    )
  );

  const isNew =
    $(
      "productIsNew"
    );

  if (isNew) {
    isNew.checked =
      Boolean(
        product?.is_new
      );
  }
}

function serializeOptions(
  list
) {
  if (!Array.isArray(list)) {
    return "";
  }

  return list
    .map(
      (item) => {
        if (
          typeof item ===
          "string"
        ) {
          return item;
        }

        const name =
          item?.name ||
          "";

        const surcharge =
          num(
            item?.surcharge ||
              item?.extra ||
              item?.extra_price ||
              0
          );

        return surcharge
          ? `${name}|${surcharge}`
          : name;
      }
    )
    .filter(Boolean)
    .join("\n");
}

function parseOptions(
  value
) {
  return String(
    value || ""
  )
    .split("\n")
    .map(
      (line) =>
        line.trim()
    )
    .filter(Boolean)
    .map(
      (line) => {
        const parts =
          line.split("|");

        return {
          name:
            String(
              parts[0] || ""
            ).trim(),

          surcharge:
            num(
              parts[1] || 0
            )
        };
      }
    );
}

function getProductOptions() {
  return {
    colors:
      parseOptions(
        $(
          "productColors"
        )?.value
      ),

    memories:
      parseOptions(
        $(
          "productMemories"
        )?.value
      ),

    sims:
      parseOptions(
        $(
          "productSims"
        )?.value
      ),

    regions:
      parseOptions(
        $(
          "productRegions"
        )?.value
      )
  };
}

function openProductModal(
  product = null
) {
  fillProductForm(
    product
  );

  const title =
    $(
      "productModalTitle"
    );

  if (title) {
    title.textContent =
      product
        ? "Изменить товар"
        : "Новый товар";
  }

  openModal(
    "productModal"
  );
}

window.editProduct =
  function (
    id
  ) {
    const product =
      products.find(
        (item) =>
          Number(item.id) ===
          Number(id)
      );

    if (!product) {
      return;
    }

    openProductModal(
      product
    );
  };

window.deleteProduct =
  async function (
    id
  ) {
    if (
      !confirm(
        "Удалить этот товар?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/products/${id}`,
        {
          method:
            "DELETE"
        }
      );

      toast(
        "Товар удалён"
      );

      await loadProducts();
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };

async function saveProduct() {
  try {
    const images =
      String(
        $(
          "productImages"
        )?.value || ""
      )
        .split("\n")
        .map(
          (x) =>
            x.trim()
        )
        .filter(Boolean);

    const payload = {
      name:
        $(
          "productName"
        )?.value.trim() ||
        "",

      description:
        $(
          "productDescription"
        )?.value.trim() ||
        "",

      price:
        num(
          $(
            "productPrice"
          )?.value
        ),

      old_price:
        num(
          $(
            "productOldPrice"
          )?.value
        ),

      image_url:
        $(
          "productImage"
        )?.value.trim() ||
        "",

      category_id:
        $(
          "productCategory"
        )?.value ||
        null,

      images,

      price_options:
        getProductOptions(),

      is_new:
        Boolean(
          $(
            "productIsNew"
          )?.checked
        )
    };

    if (!payload.name) {
      throw new Error(
        "Введите название товара"
      );
    }

    const id =
      currentProduct?.id;

    await api(
      id
        ? `/api/admin/products/${id}`
        : "/api/admin/products",
      {
        method:
          id
            ? "PUT"
            : "POST",

        body:
          payload
      }
    );

    toast(
      id
        ? "Товар обновлён"
        : "Товар создан"
    );

    closeModal(
      "productModal"
    );

    await loadProducts();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}


/* =========================================================
   CATEGORIES
========================================================= */

async function loadCategories() {
  try {
    const data =
      await api(
        "/api/admin/categories"
      );

    categories =
      data.categories ||
      [];

    renderCategories();
    fillCategorySelect();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

function renderCategories() {
  const container =
    $(
      "categoriesList"
    ) ||
    $(
      "adminCategoriesList"
    ) ||
    document.querySelector(
      "[data-categories-list]"
    );

  if (!container) {
    return;
  }

  if (!categories.length) {
    container.innerHTML = `
      <div class="empty-state">
        Категорий пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    categories
      .map(
        (category) => `
          <div class="admin-card">
            <div class="admin-card-content">
              <div class="admin-card-title">
                ${esc(
                  category.name
                )}
              </div>

              <div class="admin-card-meta">
                ID: ${category.id}
              </div>

              <div class="admin-card-actions">
                <button
                  class="admin-button secondary"
                  onclick="editCategory(${category.id})"
                >
                  Изменить
                </button>

                <button
                  class="admin-button danger"
                  onclick="deleteCategory(${category.id})"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        `
      )
      .join("");
}

function fillCategorySelect() {
  const select =
    $(
      "productCategory"
    );

  if (!select) {
    return;
  }

  const current =
    select.value;

  select.innerHTML = `
    <option value="">
      Без категории
    </option>

    ${categories
      .map(
        (category) => `
          <option value="${category.id}">
            ${esc(
              category.name
            )}
          </option>
        `
      )
      .join("")}
  `;

  if (current) {
    select.value =
      current;
  }
}

function openCategoryModal(
  category = null
) {
  currentCategory =
    category;

  const title =
    $(
      "categoryModalTitle"
    );

  if (title) {
    title.textContent =
      category
        ? "Изменить категорию"
        : "Новая категория";
  }

  const name =
    $(
      "categoryName"
    );

  if (name) {
    name.value =
      category?.name ||
      "";
  }

  const image =
    $(
      "categoryImage"
    );

  if (image) {
    image.value =
      category?.image_url ||
      "";
  }

  openModal(
    "categoryModal"
  );
}

window.editCategory =
  function (
    id
  ) {
    const category =
      categories.find(
        (item) =>
          Number(item.id) ===
          Number(id)
      );

    if (category) {
      openCategoryModal(
        category
      );
    }
  };

window.deleteCategory =
  async function (
    id
  ) {
    if (
      !confirm(
        "Удалить категорию?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/categories/${id}`,
        {
          method:
            "DELETE"
        }
      );

      toast(
        "Категория удалена"
      );

      await loadCategories();
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };

async function saveCategory() {
  try {
    const payload = {
      name:
        $(
          "categoryName"
        )?.value.trim() ||
        "",

      image_url:
        $(
          "categoryImage"
        )?.value.trim() ||
        ""
    };

    if (!payload.name) {
      throw new Error(
        "Введите название"
      );
    }

    const id =
      currentCategory?.id;

    await api(
      id
        ? `/api/admin/categories/${id}`
        : "/api/admin/categories",
      {
        method:
          id
            ? "PUT"
            : "POST",

        body:
          payload
      }
    );

    toast(
      id
        ? "Категория обновлена"
        : "Категория создана"
    );

    closeModal(
      "categoryModal"
    );

    await loadCategories();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}


/* =========================================================
   BANNERS
========================================================= */

async function loadBanners() {
  try {
    const data =
      await api(
        "/api/admin/banners"
      );

    banners =
      data.banners ||
      [];

    renderBanners();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

function renderBanners() {
  const container =
    $(
      "bannersList"
    ) ||
    $(
      "adminBannersList"
    ) ||
    document.querySelector(
      "[data-banners-list]"
    );

  if (!container) {
    return;
  }

  if (!banners.length) {
    container.innerHTML = `
      <div class="empty-state">
        Баннеров пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    banners
      .map(
        (banner) => `
          <div class="admin-card">
            ${
              banner.image_url
                ? `
                  <div class="admin-banner-preview">
                    <img
                      src="${esc(
                        banner.image_url
                      )}"
                      alt=""
                    >
                  </div>
                `
                : ""
            }

            <div class="admin-card-content">
              <div class="admin-card-title">
                ${esc(
                  banner.title ||
                    "Без названия"
                )}
              </div>

              <div class="admin-card-meta">
                ${
                  banner.active
                    ? "Активен"
                    : "Скрыт"
                }
              </div>

              <div class="admin-card-actions">
                <button
                  class="admin-button secondary"
                  onclick="editBanner(${banner.id})"
                >
                  Изменить
                </button>

                <button
                  class="admin-button danger"
                  onclick="deleteBanner(${banner.id})"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        `
      )
      .join("");
}

function openBannerModal(
  banner = null
) {
  currentBanner =
    banner;

  const title =
    $(
      "bannerModalTitle"
    );

  if (title) {
    title.textContent =
      banner
        ? "Изменить баннер"
        : "Новый баннер";
  }

  const fields = {
    bannerTitle:
      banner?.title ||
      "",

    bannerSubtitle:
      banner?.subtitle ||
      "",

    bannerImage:
      banner?.image_url ||
      "",

    bannerButtonText:
      banner?.button_text ||
      "",

    bannerButtonUrl:
      banner?.button_url ||
      "",

    bannerSort:
      banner?.sort_order ??
      0
  };

  Object.entries(
    fields
  ).forEach(
    ([id, value]) => {
      const element =
        $(id);

      if (element) {
        element.value =
          value;
      }
    }
  );

  const active =
    $(
      "bannerActive"
    );

  if (active) {
    active.checked =
      banner
        ? Boolean(
            banner.active
          )
        : true;
  }

  openModal(
    "bannerModal"
  );
}

window.editBanner =
  function (
    id
  ) {
    const banner =
      banners.find(
        (item) =>
          Number(item.id) ===
          Number(id)
      );

    if (banner) {
      openBannerModal(
        banner
      );
    }
  };

window.deleteBanner =
  async function (
    id
  ) {
    if (
      !confirm(
        "Удалить баннер?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/banners/${id}`,
        {
          method:
            "DELETE"
        }
      );

      toast(
        "Баннер удалён"
      );

      await loadBanners();
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };

async function saveBanner() {
  try {
    const payload = {
      title:
        $(
          "bannerTitle"
        )?.value.trim() ||
        "",

      subtitle:
        $(
          "bannerSubtitle"
        )?.value.trim() ||
        "",

      image_url:
        $(
          "bannerImage"
        )?.value.trim() ||
        "",

      button_text:
        $(
          "bannerButtonText"
        )?.value.trim() ||
        "",

      button_url:
        $(
          "bannerButtonUrl"
        )?.value.trim() ||
        "",

      active:
        Boolean(
          $(
            "bannerActive"
          )?.checked
        ),

      sort_order:
        num(
          $(
            "bannerSort"
          )?.value
        )
    };

    const id =
      currentBanner?.id;

    await api(
      id
        ? `/api/admin/banners/${id}`
        : "/api/admin/banners",
      {
        method:
          id
            ? "PUT"
            : "POST",

        body:
          payload
      }
    );

    toast(
      id
        ? "Баннер обновлён"
        : "Баннер создан"
    );

    closeModal(
      "bannerModal"
    );

    await loadBanners();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}


/* =========================================================
   RESERVATION
========================================================= */

async function loadReservationCards() {
  try {
    const data =
      await api(
        "/api/admin/reservation-cards"
      );

    reservationCards =
      data.reservation_cards ||
      [];

    renderReservationCards();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

function renderReservationCards() {
  const container =
    $(
      "reservationCardsList"
    ) ||
    $(
      "adminReservationCardsList"
    ) ||
    document.querySelector(
      "[data-reservation-cards-list]"
    );

  if (!container) {
    return;
  }

  if (
    !reservationCards.length
  ) {
    container.innerHTML = `
      <div class="empty-state">
        Реквизитов пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    reservationCards
      .map(
        (card) => `
          <div class="admin-card">
            <div class="admin-card-content">
              <div class="admin-card-title">
                ${esc(
                  card.title ||
                    "Реквизиты"
                )}

                ${
                  card.is_default
                    ? `
                      <span class="default-label">
                        Основные
                      </span>
                    `
                    : ""
                }
              </div>

              <div class="admin-card-meta">
                Залог:
                <b>
                  ${formatPrice(
                    card.amount
                  )}
                </b>
              </div>

              ${
                card.card_number
                  ? `
                    <div class="admin-card-meta">
                      ${esc(
                        card.card_number
                      )}
                    </div>
                  `
                  : ""
              }

              ${
                card.recipient
                  ? `
                    <div class="admin-card-meta">
                      Получатель:
                      ${esc(
                        card.recipient
                      )}
                    </div>
                  `
                  : ""
              }

              <div class="admin-card-meta">
                ${
                  card.active
                    ? "Активны"
                    : "Отключены"
                }
              </div>

              <div class="admin-card-actions">
                <button
                  class="admin-button secondary"
                  onclick="editReservationCard(${card.id})"
                >
                  Изменить
                </button>

                <button
                  class="admin-button danger"
                  onclick="deleteReservationCard(${card.id})"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        `
      )
      .join("");
}

function openReservationCardModal(
  card = null
) {
  currentReservationCard =
    card;

  const title =
    $(
      "reservationCardModalTitle"
    );

  if (title) {
    title.textContent =
      card
        ? "Изменить реквизиты"
        : "Новые реквизиты";
  }

  const fields = {
    reservationCardTitle:
      card?.title ||
      "",

    reservationCardNumber:
      card?.card_number ||
      "",

    reservationCardRecipient:
      card?.recipient ||
      "",

    reservationCardRequisites:
      card?.requisites ||
      "",

    reservationCardAmount:
      card?.amount ??
      0
  };

  Object.entries(
    fields
  ).forEach(
    ([id, value]) => {
      const element =
        $(id);

      if (element) {
        element.value =
          value;
      }
    }
  );

  const active =
    $(
      "reservationCardActive"
    );

  if (active) {
    active.checked =
      card
        ? Boolean(
            card.active
          )
        : true;
  }

  const defaultInput =
    $(
      "reservationCardDefault"
    );

  if (defaultInput) {
    defaultInput.checked =
      Boolean(
        card?.is_default
      );
  }

  openModal(
    "reservationCardModal"
  );
}

window.editReservationCard =
  function (
    id
  ) {
    const card =
      reservationCards.find(
        (item) =>
          Number(item.id) ===
          Number(id)
      );

    if (card) {
      openReservationCardModal(
        card
      );
    }
  };

window.deleteReservationCard =
  async function (
    id
  ) {
    if (
      !confirm(
        "Удалить эти реквизиты?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/reservation-cards/${id}`,
        {
          method:
            "DELETE"
        }
      );

      toast(
        "Реквизиты удалены"
      );

      await loadReservationCards();
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };

async function saveReservationCard() {
  try {
    const payload = {
      title:
        $(
          "reservationCardTitle"
        )?.value.trim() ||
        "",

      card_number:
        $(
          "reservationCardNumber"
        )?.value.trim() ||
        "",

      recipient:
        $(
          "reservationCardRecipient"
        )?.value.trim() ||
        "",

      requisites:
        $(
          "reservationCardRequisites"
        )?.value.trim() ||
        "",

      amount:
        num(
          $(
            "reservationCardAmount"
          )?.value
        ),

      active:
        Boolean(
          $(
            "reservationCardActive"
          )?.checked
        ),

      is_default:
        Boolean(
          $(
            "reservationCardDefault"
          )?.checked
        )
    };

    const id =
      currentReservationCard?.id;

    await api(
      id
        ? `/api/admin/reservation-cards/${id}`
        : "/api/admin/reservation-cards",
      {
        method:
          id
            ? "PUT"
            : "POST",

        body:
          payload
      }
    );

    toast(
      id
        ? "Реквизиты обновлены"
        : "Реквизиты добавлены"
    );

    closeModal(
      "reservationCardModal"
    );

    await loadReservationCards();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}


/* =========================================================
   PICKUP
========================================================= */

async function loadPickupPoints() {
  try {
    const data =
      await api(
        "/api/admin/pickup-points"
      );

    pickupPoints =
      data.pickup_points ||
      [];

    renderPickupPoints();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

function renderPickupPoints() {
  const container =
    $(
      "pickupPointsList"
    ) ||
    $(
      "adminPickupPointsList"
    ) ||
    document.querySelector(
      "[data-pickup-list]"
    );

  if (!container) {
    return;
  }

  if (!pickupPoints.length) {
    container.innerHTML = `
      <div class="empty-state">
        Точек выдачи пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    pickupPoints
      .map(
        (point) => `
          <div class="admin-card">
            <div class="admin-card-content">
              <div class="admin-card-title">
                ${esc(
                  point.title ||
                    "Точка выдачи"
                )}
              </div>

              <div class="admin-card-meta">
                ${esc(
                  point.address ||
                    "Адрес не указан"
                )}
              </div>

              <div class="admin-card-meta">
                ${
                  point.active
                    ? "Активна"
                    : "Скрыта"
                }
              </div>

              <div class="admin-card-actions">
                <button
                  class="admin-button secondary"
                  onclick="editPickupPoint(${point.id})"
                >
                  Изменить
                </button>

                <button
                  class="admin-button danger"
                  onclick="deletePickupPoint(${point.id})"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        `
      )
      .join("");
}

function openPickupModal(
  point = null
) {
  currentPickupPoint =
    point;

  const title =
    $(
      "pickupModalTitle"
    );

  if (title) {
    title.textContent =
      point
        ? "Изменить точку"
        : "Новая точка";
  }

  const fields = {
    pickupTitle:
      point?.title ||
      "",

    pickupAddress:
      point?.address ||
      "",

    pickupDirections:
      point?.directions_url ||
      "",

    pickupVideo:
      point?.video_url ||
      ""
  };

  Object.entries(
    fields
  ).forEach(
    ([id, value]) => {
      const element =
        $(id);

      if (element) {
        element.value =
          value;
      }
    }
  );

  const active =
    $(
      "pickupActive"
    );

  if (active) {
    active.checked =
      point
        ? Boolean(
            point.active
          )
        : true;
  }

  openModal(
    "pickupModal"
  );
}

window.editPickupPoint =
  function (
    id
  ) {
    const point =
      pickupPoints.find(
        (item) =>
          Number(item.id) ===
          Number(id)
      );

    if (point) {
      openPickupModal(
        point
      );
    }
  };

window.deletePickupPoint =
  async function (
    id
  ) {
    if (
      !confirm(
        "Удалить точку выдачи?"
      )
    ) {
      return;
    }

    try {
      await api(
        `/api/admin/pickup-points/${id}`,
        {
          method:
            "DELETE"
        }
      );

      toast(
        "Точка удалена"
      );

      await loadPickupPoints();
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };

async function savePickupPoint() {
  try {
    const payload = {
      title:
        $(
          "pickupTitle"
        )?.value.trim() ||
        "",

      address:
        $(
          "pickupAddress"
        )?.value.trim() ||
        "",

      directions_url:
        $(
          "pickupDirections"
        )?.value.trim() ||
        "",

      video_url:
        $(
          "pickupVideo"
        )?.value.trim() ||
        "",

      active:
        Boolean(
          $(
            "pickupActive"
          )?.checked
        )
    };

    if (!payload.title) {
      throw new Error(
        "Введите название точки"
      );
    }

    if (!payload.address) {
      throw new Error(
        "Введите адрес"
      );
    }

    const id =
      currentPickupPoint?.id;

    await api(
      id
        ? `/api/admin/pickup-points/${id}`
        : "/api/admin/pickup-points",
      {
        method:
          id
            ? "PUT"
            : "POST",

        body:
          payload
      }
    );

    toast(
      id
        ? "Точка обновлена"
        : "Точка создана"
    );

    closeModal(
      "pickupModal"
    );

    await loadPickupPoints();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}


/* =========================================================
   SETTINGS
========================================================= */

async function loadSettings() {
  try {
    const data =
      await api(
        "/api/admin/settings"
      );

    settings =
      data.settings ||
      {};

    fillSettings();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

function fillSettings() {
  const mapping = {
    storeName:
      "store_name",

    contactUsername:
      "contact_username",

    contactUrl:
      "contact_url",

    channelUsername:
      "channel_username",

    channelUrl:
      "channel_url",

    telegramUsername:
      "telegram_username",

    telegramUrl:
      "telegram_url",

    reservationAmount:
      "reservation_amount",

    reservationText:
      "reservation_text",

    deliveryText:
      "delivery_text",

    pickupText:
      "pickup_text"
  };

  Object.entries(
    mapping
  ).forEach(
    ([id, key]) => {
      const element =
        $(id);

      if (!element) {
        return;
      }

      element.value =
        settings[key] ??
        "";
    }
  );
}

async function saveSettings() {
  try {
    const mapping = {
      store_name:
        "storeName",

      contact_username:
        "contactUsername",

      contact_url:
        "contactUrl",

      channel_username:
        "channelUsername",

      channel_url:
        "channelUrl",

      telegram_username:
        "telegramUsername",

      telegram_url:
        "telegramUrl",

      reservation_amount:
        "reservationAmount",

      reservation_text:
        "reservationText",

      delivery_text:
        "deliveryText",

      pickup_text:
        "pickupText"
    };

    const payload = {};

    Object.entries(
      mapping
    ).forEach(
      ([key, id]) => {
        const element =
          $(id);

        if (element) {
          payload[key] =
            element.value;
        }
      }
    );

    await api(
      "/api/admin/settings",
      {
        method:
          "PUT",

        body:
          payload
      }
    );

    toast(
      "Настройки сохранены"
    );

    await loadSettings();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}


/* =========================================================
   ORDERS
========================================================= */

async function loadOrders() {
  try {
    const data =
      await api(
        "/api/admin/orders"
      );

    orders =
      data.orders ||
      [];

    renderOrderFilters();
    renderOrders();
    updateDashboard();
  } catch (error) {
    toast(
      error.message,
      "error"
    );
  }
}

function renderOrderFilters() {
  const container =
    $(
      "orderFilters"
    ) ||
    document.querySelector(
      "[data-order-filters]"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="admin-filter-group">
      <button
        class="admin-filter ${
          currentOrderStatusFilter ===
          "all"
            ? "active"
            : ""
        }"
        data-order-status="all"
      >
        Все
      </button>

      <button
        class="admin-filter ${
          currentOrderStatusFilter ===
          "new"
            ? "active"
            : ""
        }"
        data-order-status="new"
      >
        Новые
      </button>

      <button
        class="admin-filter ${
          currentOrderStatusFilter ===
          "confirmed"
            ? "active"
            : ""
        }"
        data-order-status="confirmed"
      >
        Подтверждённые
      </button>

      <button
        class="admin-filter ${
          currentOrderStatusFilter ===
          "processing"
            ? "active"
            : ""
        }"
        data-order-status="processing"
      >
        В обработке
      </button>

      <button
        class="admin-filter ${
          currentOrderStatusFilter ===
          "ready"
            ? "active"
            : ""
        }"
        data-order-status="ready"
      >
        Готовые
      </button>

      <button
        class="admin-filter ${
          currentOrderStatusFilter ===
          "completed"
            ? "active"
            : ""
        }"
        data-order-status="completed"
      >
        Завершённые
      </button>

      <button
        class="admin-filter ${
          currentOrderStatusFilter ===
          "cancelled"
            ? "active"
            : ""
        }"
        data-order-status="cancelled"
      >
        Отменённые
      </button>
    </div>

    <div class="admin-filter-group reservation-filter-group">
      <button
        class="admin-filter ${
          currentReservationFilter ===
          "all"
            ? "active"
            : ""
        }"
        data-reservation-filter="all"
      >
        Все залоги
      </button>

      <button
        class="admin-filter ${
          currentReservationFilter ===
          "pending_payment"
            ? "active"
            : ""
        }"
        data-reservation-filter="pending_payment"
      >
        🟡 Ждут оплаты
      </button>

      <button
        class="admin-filter ${
          currentReservationFilter ===
          "awaiting_confirmation"
            ? "active"
            : ""
        }"
        data-reservation-filter="awaiting_confirmation"
      >
        🟠 На проверке
      </button>

      <button
        class="admin-filter ${
          currentReservationFilter ===
          "confirmed"
            ? "active"
            : ""
        }"
        data-reservation-filter="confirmed"
      >
        🟢 Подтверждены
      </button>

      <button
        class="admin-filter ${
          currentReservationFilter ===
          "rejected"
            ? "active"
            : ""
        }"
        data-reservation-filter="rejected"
      >
        🔴 Отклонены
      </button>
    </div>
  `;

  container
    .querySelectorAll(
      "[data-order-status]"
    )
    .forEach(
      (button) => {
        button.onclick =
          () => {
            currentOrderStatusFilter =
              button.dataset
                .orderStatus;

            renderOrderFilters();
            renderOrders();
          };
      }
    );

  container
    .querySelectorAll(
      "[data-reservation-filter]"
    )
    .forEach(
      (button) => {
        button.onclick =
          () => {
            currentReservationFilter =
              button.dataset
                .reservationFilter;

            renderOrderFilters();
            renderOrders();
          };
      }
    );
}

function orderMatchesFilters(
  order
) {
  const statusMatch =
    currentOrderStatusFilter ===
      "all" ||
    order.status ===
      currentOrderStatusFilter ||
    (
      currentOrderStatusFilter ===
        "cancelled" &&
      order.status ===
        "rejected"
    );

  const reservation =
    order.reservation_status ||
    "not_required";

  const reservationMatch =
    currentReservationFilter ===
      "all" ||
    (
      currentReservationFilter ===
        "pending_payment" &&
      (
        reservation ===
          "pending_payment" ||
        reservation ===
          "pending"
      )
    ) ||
    reservation ===
      currentReservationFilter;

  return (
    statusMatch &&
    reservationMatch
  );
}

function renderOrders() {
  const container =
    $(
      "ordersList"
    ) ||
    $(
      "adminOrdersList"
    ) ||
    document.querySelector(
      "[data-orders-list]"
    );

  if (!container) {
    return;
  }

  const filtered =
    orders.filter(
      orderMatchesFilters
    );

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        Заказов по выбранному фильтру нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    filtered
      .map(
        (order) => {
          const needsReview =
            order.reservation_status ===
            "awaiting_confirmation";

          return `
            <div
              class="
                admin-card
                order-admin-card
                ${
                  needsReview
                    ? "needs-review"
                    : ""
                }
              "
            >
              <div class="order-admin-top">
                <div>
                  <div class="admin-card-title">
                    ${esc(
                      order.display_id ||
                        `IR-${
                          1000 +
                          order.id
                        }`
                    )}
                  </div>

                  <div class="admin-card-meta">
                    ${formatDate(
                      order.created_at
                    )}
                  </div>
                </div>

                ${orderStatusHtml(
                  order.status
                )}
              </div>

              <div class="order-admin-product">
                <b>
                  ${esc(
                    order.product_name ||
                      "Товар"
                  )}
                </b>

                ${
                  order.variant_text
                    ? `
                      <div class="admin-card-meta">
                        ${esc(
                          order.variant_text
                        )}
                      </div>
                    `
                    : ""
                }
              </div>

              <div class="order-admin-info">
                <div>
                  <span>Клиент</span>
                  <b>
                    ${esc(
                      order.customer_name ||
                        "Покупатель"
                    )}
                  </b>
                </div>

                <div>
                  <span>Сумма</span>
                  <b>
                    ${formatPrice(
                      order.price
                    )}
                  </b>
                </div>

                <div>
                  <span>Залог</span>
                  <b>
                    ${formatPrice(
                      order.reservation_amount
                    )}
                  </b>
                </div>

                <div>
                  <span>Получение</span>
                  <b>
                    ${esc(
                      order.fulfillment_type ===
                        "delivery"
                        ? "Доставка"
                        : "Самовывоз"
                    )}
                  </b>
                </div>
              </div>

              <div class="order-reservation-row">
                <span>Статус залога</span>

                ${reservationStatusHtml(
                  order.reservation_status
                )}
              </div>

              ${
                needsReview
                  ? `
                    <div class="reservation-alert">
                      <b>
                        🟠 Требуется проверка залога
                      </b>

                      <span>
                        Клиент сообщил об оплате.
                      </span>
                    </div>
                  `
                  : ""
              }

              <div class="admin-card-actions">
                <button
                  class="admin-button primary"
                  onclick="openOrder(${order.id})"
                >
                  Открыть заказ
                </button>
              </div>
            </div>
          `;
        }
      )
      .join("");
}

window.openOrder =
  async function (
    id
  ) {
    try {
      const data =
        await api(
          `/api/admin/orders/${id}`
        );

      currentOrder =
        data.order;

      renderOrderModal(
        currentOrder
      );

      openModal(
        "orderModal"
      );
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };

function renderOrderModal(
  order
) {
  const title =
    $(
      "orderModalTitle"
    );

  if (title) {
    title.textContent =
      order.display_id ||
      `IR-${
        1000 +
        order.id
      }`;
  }

  const container =
    $(
      "orderModalContent"
    ) ||
    $(
      "orderDetails"
    );

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="order-detail-block">
      <div class="order-detail-label">
        Товар
      </div>

      <div class="order-detail-value">
        ${esc(
          order.product_name ||
            "Товар"
        )}
      </div>

      ${
        order.variant_text
          ? `
            <div class="order-detail-muted">
              ${esc(
                order.variant_text
              )}
            </div>
          `
          : ""
      }
    </div>

    <div class="order-detail-grid">
      <div class="order-detail-block">
        <div class="order-detail-label">
          Цена
        </div>

        <div class="order-detail-value">
          ${formatPrice(
            order.price
          )}
        </div>
      </div>

      <div class="order-detail-block">
        <div class="order-detail-label">
          Залог
        </div>

        <div class="order-detail-value">
          ${formatPrice(
            order.reservation_amount
          )}
        </div>
      </div>
    </div>

    <div class="order-detail-block">
      <div class="order-detail-label">
        Клиент
      </div>

      <div class="order-detail-value">
        ${esc(
          order.customer_name ||
            "Покупатель"
        )}
      </div>

      ${
        order.customer_username
          ? `
            <div class="order-detail-muted">
              ${esc(
                order.customer_username
              )}
            </div>
          `
          : ""
      }

      <div class="order-detail-muted">
        Telegram ID:
        ${esc(
          order.telegram_user_id
        )}
      </div>
    </div>

    <div class="order-detail-block">
      <div class="order-detail-label">
        Получение
      </div>

      <div class="order-detail-value">
        ${
          order.fulfillment_type ===
          "delivery"
            ? "Доставка"
            : "Самовывоз"
        }
      </div>

      ${
        order.address
          ? `
            <div class="order-detail-muted">
              ${esc(
                order.address
              )}
            </div>
          `
          : ""
      }
    </div>

    ${
      order.customer_comment
        ? `
          <div class="order-detail-block">
            <div class="order-detail-label">
              Комментарий
            </div>

            <div class="order-comment">
              ${esc(
                order.customer_comment
              )}
            </div>
          </div>
        `
        : ""
    }

    <div class="order-detail-block">
      <div class="order-detail-label">
        Статус заказа
      </div>

      <select
        id="modalOrderStatus"
        class="admin-select"
      >
        ${renderOrderStatusOptions(
          order.status
        )}
      </select>

      <button
        class="admin-button primary full-width"
        onclick="saveOrderStatus()"
      >
        Сохранить статус заказа
      </button>
    </div>

    <div class="order-detail-block reservation-admin-block">
      <div class="order-detail-label">
        Статус залога
      </div>

      ${reservationStatusHtml(
        order.reservation_status
      )}

      <select
        id="modalReservationStatus"
        class="admin-select"
      >
        ${renderReservationStatusOptions(
          order.reservation_status
        )}
      </select>

      <button
        class="admin-button primary full-width"
        onclick="saveReservationStatus()"
      >
        Сохранить статус залога
      </button>
    </div>

    ${
      order.reservation_paid_at
        ? `
          <div class="order-detail-muted">
            Заявка на оплату:
            ${formatDate(
              order.reservation_paid_at
            )}
          </div>
        `
        : ""
    }

    <div class="order-detail-status-summary">
      <div>
        <span>Заказ</span>
        ${orderStatusHtml(
          order.status
        )}
      </div>

      <div>
        <span>Залог</span>
        ${reservationStatusHtml(
          order.reservation_status
        )}
      </div>
    </div>
  `;
}

function renderOrderStatusOptions(
  current
) {
  return Object.entries(
    ORDER_STATUS
  )
    .map(
      ([value, info]) => `
        <option
          value="${value}"
          ${
            value ===
            current
              ? "selected"
              : ""
          }
        >
          ${esc(
            info.text
          )}
        </option>
      `
    )
    .join("");
}

function renderReservationStatusOptions(
  current
) {
  return `
    <option
      value="pending_payment"
      ${
        current ===
          "pending_payment" ||
        current ===
          "pending"
          ? "selected"
          : ""
      }
    >
      🟡 Ожидает оплаты
    </option>

    <option
      value="awaiting_confirmation"
      ${
        current ===
        "awaiting_confirmation"
          ? "selected"
          : ""
      }
    >
      🟠 Ожидает проверки
    </option>

    <option
      value="confirmed"
      ${
        current ===
        "confirmed"
          ? "selected"
          : ""
      }
    >
      🟢 Залог подтверждён
    </option>

    <option
      value="rejected"
      ${
        current ===
        "rejected"
          ? "selected"
          : ""
      }
    >
      🔴 Залог отклонён
    </option>

    <option
      value="not_required"
      ${
        current ===
        "not_required"
          ? "selected"
          : ""
      }
    >
      Без залога
    </option>
  `;
}

window.saveOrderStatus =
  async function () {
    if (!currentOrder) {
      return;
    }

    const select =
      $(
        "modalOrderStatus"
      );

    if (!select) {
      return;
    }

    try {
      await api(
        `/api/admin/orders/${currentOrder.id}/status`,
        {
          method:
            "PUT",

          body: {
            status:
              select.value
          }
        }
      );

      toast(
        "Статус заказа сохранён"
      );

      haptic(
        "medium"
      );

      currentOrder.status =
        select.value;

      renderOrderModal(
        currentOrder
      );

      await loadOrders();
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };

window.saveReservationStatus =
  async function () {
    if (!currentOrder) {
      return;
    }

    const select =
      $(
        "modalReservationStatus"
      );

    if (!select) {
      return;
    }

    try {
      await api(
        `/api/admin/orders/${currentOrder.id}/reservation`,
        {
          method:
            "PUT",

          body: {
            reservation_status:
              select.value
          }
        }
      );

      toast(
        "Статус залога сохранён"
      );

      haptic(
        "medium"
      );

      currentOrder.reservation_status =
        select.value;

      renderOrderModal(
        currentOrder
      );

      await loadOrders();
    } catch (error) {
      toast(
        error.message,
        "error"
      );
    }
  };


/* =========================================================
   UPLOAD
========================================================= */

async function uploadFile(
  file
) {
  if (!file) {
    return null;
  }

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  const headers = {};

  const initData =
    getInitData();

  if (initData) {
    headers[
      "x-telegram-init-data"
    ] = initData;
  }

  const response =
    await fetch(
      "/api/admin/upload",
      {
        method:
          "POST",

        headers,

        body:
          formData
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data.error ||
        "Не удалось загрузить файл"
    );
  }

  return data.url;
}

function setupUploadInput(
  inputId,
  targetId
) {
  const input =
    $(inputId);

  const target =
    $(targetId);

  if (
    !input ||
    !target
  ) {
    return;
  }

  input.addEventListener(
    "change",
    async () => {
      const file =
        input.files?.[0];

      if (!file) {
        return;
      }

      try {
        toast(
          "Загрузка..."
        );

        const url =
          await uploadFile(
            file
          );

        target.value =
          url;

        toast(
          "Файл загружен"
        );
      } catch (error) {
        toast(
          error.message,
          "error"
        );
      }
    }
  );
}


/* =========================================================
   BUTTONS
========================================================= */

function setupButtons() {
  const map = {
    addProductButton:
      () =>
        openProductModal(),

    newProductButton:
      () =>
        openProductModal(),

    addCategoryButton:
      () =>
        openCategoryModal(),

    newCategoryButton:
      () =>
        openCategoryModal(),

    addBannerButton:
      () =>
        openBannerModal(),

    newBannerButton:
      () =>
        openBannerModal(),

    addReservationCardButton:
      () =>
        openReservationCardModal(),

    newReservationCardButton:
      () =>
        openReservationCardModal(),

    addPickupButton:
      () =>
        openPickupModal(),

    addPickupPointButton:
      () =>
        openPickupModal(),

    saveProductButton:
      saveProduct,

    saveCategoryButton:
      saveCategory,

    saveBannerButton:
      saveBanner,

    saveReservationCardButton:
      saveReservationCard,

    savePickupButton:
      savePickupPoint,

    savePickupPointButton:
      savePickupPoint,

    saveSettingsButton:
      saveSettings
  };

  Object.entries(
    map
  ).forEach(
    ([id, handler]) => {
      const element =
        $(id);

      if (!element) {
        return;
      }

      element.addEventListener(
        "click",
        (event) => {
          event.preventDefault();

          handler();
        }
      );
    }
  );

  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            closeModal(
              button.dataset
                .closeModal
            );
          }
        );
      }
    );

  document
    .querySelectorAll(
      ".modal-backdrop, .admin-modal-backdrop"
    )
    .forEach(
      (backdrop) => {
        backdrop.addEventListener(
          "click",
          (event) => {
            if (
              event.target !==
              backdrop
            ) {
              return;
            }

            const modal =
              backdrop.closest(
                ".modal, .admin-modal"
              );

            if (
              modal?.id
            ) {
              closeModal(
                modal.id
              );
            }
          }
        );
      }
    );
}


/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {
  const input =
    $(
      "orderSearch"
    ) ||
    $(
      "ordersSearch"
    );

  if (!input) {
    return;
  }

  input.addEventListener(
    "input",
    () => {
      const query =
        input.value
          .trim()
          .toLowerCase();

      document
        .querySelectorAll(
          ".order-admin-card"
        )
        .forEach(
          (card) => {
            card.style.display =
              !query ||
              card.textContent
                .toLowerCase()
                .includes(
                  query
                )
                ? ""
                : "none";
          }
        );
    }
  );
}


/* =========================================================
   AUTO REFRESH
========================================================= */

let refreshTimer =
  null;

function startAutoRefresh() {
  clearInterval(
    refreshTimer
  );

  refreshTimer =
    setInterval(
      async () => {
        const activeTab =
          document.querySelector(
            "[data-tab].active"
          )?.dataset.tab;

        if (
          activeTab ===
          "orders"
        ) {
          try {
            await loadOrders();
          } catch {}
        }
      },
      30000
    );
}


/* =========================================================
   AUTH
========================================================= */

function showAccessDenied(
  id
) {
  document.body.innerHTML = `
    <div class="admin-access-denied">
      <div class="admin-access-card">
        <div class="admin-access-title">
          Доступ запрещён
        </div>

        <div class="admin-access-text">
          Этот аккаунт не является администратором.
        </div>

        <div class="admin-access-id">
          ID: ${esc(
            id ||
              "не определён"
          )}
        </div>
      </div>
    </div>
  `;
}

function showAuthError(
  message
) {
  document.body.innerHTML = `
    <div class="admin-access-denied">
      <div class="admin-access-card">
        <div class="admin-access-title">
          Ошибка авторизации
        </div>

        <div class="admin-access-text">
          ${esc(
            message ||
              "Не удалось проверить доступ"
          )}
        </div>

        <div class="admin-access-text" style="margin-top:12px">
          Закройте Mini App и откройте админку заново через Telegram.
        </div>
      </div>
    </div>
  `;
}

async function checkAdmin() {
  /*
    Telegram WebApp может появиться
    не сразу после загрузки JS.

    Поэтому сначала ждём SDK,
    затем получаем initData.
  */

  await waitForTelegram(
    7000
  );

  initTelegram();

  const initData =
    getInitData();

  const userId =
    telegramUserId();

  /*
    Если initData ещё нет,
    не делаем мгновенный отказ.
    Даём Telegram ещё немного времени.
  */

  if (!initData) {
    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          500
        )
    );

    tg = getTelegram();
  }

  const finalInitData =
    getInitData();

  const finalUserId =
    telegramUserId();

  if (
    !finalInitData
  ) {
    showAuthError(
      "Telegram initData не получен."
    );

    return false;
  }

  if (
    !ADMIN_IDS.includes(
      finalUserId
    )
  ) {
    showAccessDenied(
      finalUserId
    );

    return false;
  }

  try {
    await api(
      "/api/admin/me"
    );

    return true;
  } catch (error) {
    console.error(
      "Admin auth error:",
      error
    );

    showAuthError(
      error.message
    );

    return false;
  }
}


/* =========================================================
   BOOT
========================================================= */

async function boot() {
  try {
    /*
      Сначала ждём Telegram,
      а уже после этого запускаем
      проверку администратора.
    */

    await waitForTelegram(
      7000
    );

    initTelegram();

    const allowed =
      await checkAdmin();

    if (!allowed) {
      return;
    }

    setupNavigation();
    setupButtons();
    setupSearch();

    setupUploadInput(
      "productImageFile",
      "productImage"
    );

    setupUploadInput(
      "categoryImageFile",
      "categoryImage"
    );

    setupUploadInput(
      "bannerImageFile",
      "bannerImage"
    );

    setupUploadInput(
      "pickupVideoFile",
      "pickupVideo"
    );

    try {
      await Promise.all([
        loadProducts(),
        loadCategories(),
        loadOrders(),
        loadBanners(),
        loadReservationCards(),
        loadPickupPoints(),
        loadSettings()
      ]);
    } catch (error) {
      console.error(
        "Admin data loading error:",
        error
      );

      toast(
        error.message ||
          "Не удалось загрузить данные",
        "error"
      );
    }

    startAutoRefresh();
  } catch (error) {
    console.error(
      "Admin boot error:",
      error
    );

    showAuthError(
      error.message
    );
  }
}


/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    boot,
    {
      once: true
    }
  );
} else {
  boot();
}


/* =========================================================
   GLOBAL FUNCTIONS
========================================================= */

window.openProductModal =
  openProductModal;

window.openCategoryModal =
  openCategoryModal;

window.openBannerModal =
  openBannerModal;

window.openReservationCardModal =
  openReservationCardModal;

window.openPickupModal =
  openPickupModal;

window.loadProducts =
  loadProducts;

window.loadCategories =
  loadCategories;

window.loadBanners =
  loadBanners;

window.loadOrders =
  loadOrders;

window.loadReservationCards =
  loadReservationCards;

window.loadPickupPoints =
  loadPickupPoints;

window.loadSettings =
  loadSettings;

window.saveProduct =
  saveProduct;

window.saveCategory =
  saveCategory;

window.saveBanner =
  saveBanner;

window.saveReservationCard =
  saveReservationCard;

window.savePickupPoint =
  savePickupPoint;

window.saveSettings =
  saveSettings;