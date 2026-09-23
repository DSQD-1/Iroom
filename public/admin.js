const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor("#0b0b0d");
  tg.setBackgroundColor("#0b0b0d");
}

const state = {
  products: [],
  categories: [],
  orders: [],
  promos: [],
  currentProduct: null,
  currentCategory: null,
  parsedPriceList: null,
  activeTab: "products",
  orderFilter: "all"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function initData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    "x-telegram-init-data": initData(),
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
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
      `Ошибка сервера: ${response.status}`
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

function formatPrice(value, currency = "RUB") {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) {
    return "0 ₽";
  }

  const symbols = {
    RUB: "₽",
    USD: "$",
    EUR: "€"
  };

  const symbol =
    symbols[currency] ||
    currency ||
    "";

  return `${new Intl.NumberFormat("ru-RU").format(
    amount
  )} ${symbol}`.trim();
}

function toast(message, type = "success") {
  const element = $("#adminToast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.className =
    `admin-toast show ${type}`;

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.className = "admin-toast";
  }, 3000);
}

function show(element) {
  if (element) {
    element.hidden = false;
    element.style.display = "";
  }
}

function hide(element) {
  if (element) {
    element.hidden = true;
  }
}

function openModal(id) {
  const modal = document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.hidden = false;
  document.body.classList.add("modal-open");
}

function closeModal(id) {
  const modal = document.getElementById(id);

  if (!modal) {
    return;
  }

  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

/* =========================================================
   ACCESS
========================================================= */

async function checkAdmin() {
  const loading = $("#adminLoading");
  const denied = $("#adminDenied");
  const app = $("#adminApp");

  try {
    await api("/api/admin/me");

    hide(loading);
    hide(denied);
    show(app);

    await loadAll();
  } catch (error) {
    console.error(error);

    hide(loading);
    hide(app);
    show(denied);

    const deniedText =
      denied?.querySelector(
        ".admin-denied-text"
      );

    if (deniedText) {
      deniedText.textContent =
        error.message ||
        "Доступ запрещён";
    }
  }
}

/* =========================================================
   LOAD ALL
========================================================= */

async function loadAll() {
  await Promise.all([
    loadProducts(),
    loadCategories(),
    loadOrders()
  ]);

  updateStats();
}

/* =========================================================
   PRODUCTS
========================================================= */

async function loadProducts() {
  try {
    const data =
      await api("/api/admin/products");

    state.products =
      Array.isArray(data.products)
        ? data.products
        : [];

    renderProducts();
    updateStats();
  } catch (error) {
    console.error(
      "Products load error:",
      error
    );

    toast(
      error.message ||
      "Не удалось загрузить товары",
      "error"
    );
  }
}

function renderProducts() {
  const grid = $("#productsGrid");
  const empty = $("#productsEmpty");

  if (!grid) {
    return;
  }

  const search =
    normalizeSearch(
      $("#productSearch")?.value
    );

  let products =
    state.products;

  if (search) {
    products =
      products.filter((product) => {
        const text = [
          product.name,
          product.category_name,
          product.category_slug,
          product.description
        ]
          .join(" ")
          .toLowerCase();

        return text.includes(search);
      });
  }

  if (!products.length) {
    grid.innerHTML = "";
    show(empty);
    return;
  }

  hide(empty);

  grid.innerHTML =
    products
      .map(renderProductCard)
      .join("");

  $$(".admin-product-card").forEach(
    (card) => {
      card.addEventListener(
        "click",
        () => {
          const id =
            card.dataset.id;

          editProduct(id);
        }
      );
    }
  );
}

function renderProductCard(product) {
  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  const activeVariants =
    variants.filter(
      (variant) => variant.active
    );

  const prices =
    activeVariants.length
      ? activeVariants.map(
          (variant) =>
            Number(variant.price || 0)
        )
      : variants.map(
          (variant) =>
            Number(variant.price || 0)
        );

  const minPrice =
    prices.length
      ? Math.min(...prices)
      : 0;

  const image =
    product.image_url ||
    (
      product.image_id
        ? `/api/images/${product.image_id}`
        : ""
    );

  const imageHtml = image
    ? `
      <img
        class="admin-product-image"
        src="${escapeHtml(image)}"
        alt=""
        loading="lazy"
      >
    `
    : `
      <div class="admin-product-image admin-product-image-empty">
        <span>IR</span>
      </div>
    `;

  return `
    <article
      class="admin-product-card"
      data-id="${escapeHtml(product.id)}"
    >
      <div class="admin-product-media">
        ${imageHtml}

        <div class="admin-product-badges">
          ${
            product.is_new
              ? `<span class="admin-badge new">Новинка</span>`
              : ""
          }

          ${
            product.active
              ? `<span class="admin-badge active">Активен</span>`
              : `<span class="admin-badge inactive">Скрыт</span>`
          }
        </div>
      </div>

      <div class="admin-product-content">
        <div class="admin-product-category">
          ${escapeHtml(
            product.category_name ||
            "Без категории"
          )}
        </div>

        <h3>
          ${escapeHtml(product.name)}
        </h3>

        <div class="admin-product-bottom">
          <strong>
            ${
              minPrice
                ? `от ${formatPrice(
                    minPrice,
                    activeVariants[0]?.currency ||
                      variants[0]?.currency ||
                      "RUB"
                  )}`
                : "Цена не указана"
            }
          </strong>

          <span>
            ${variants.length}
            ${
              variants.length === 1
                ? "вариант"
                : "варианта"
            }
          </span>
        </div>
      </div>
    </article>
  `;
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

async function editProduct(id) {
  try {
    const data =
      await api(
        `/api/admin/products/${encodeURIComponent(id)}`
      );

    state.currentProduct =
      data.product;

    openProductModal(
      data.product
    );
  } catch (error) {
    toast(
      error.message ||
      "Не удалось открыть товар",
      "error"
    );
  }
}

function openProductModal(product = null) {
  const form = $("#productForm");

  if (!form) {
    return;
  }

  form.reset();

  $("#productId").value =
    product?.id || "";

  $("#productNameInput").value =
    product?.name || "";

  $("#productDescriptionInput").value =
    product?.description || "";

  $("#productCategoryInput").value =
    product?.category_id || "";

  $("#productNewInput").checked =
    Boolean(product?.is_new);

  $("#productActiveInput").checked =
    product
      ? Boolean(product.active)
      : true;

  const preview =
    $("#productImagePreview");

  if (preview) {
    const image =
      product?.image_url ||
      (
        product?.image_id
          ? `/api/images/${product.image_id}`
          : ""
      );

    if (image) {
      preview.src = image;
      preview.hidden = false;
    } else {
      preview.removeAttribute("src");
      preview.hidden = true;
    }
  }

  renderCategorySelect(
    product?.category_id || ""
  );

  renderVariants(
    product?.variants || [
      {
        memory: "",
        color: "",
        country: "",
        sim_type: "",
        price: 0,
        currency: "RUB",
        stock: 0,
        active: true
      }
    ]
  );

  const deleteButton =
    $("#deleteProductButton");

  if (deleteButton) {
    deleteButton.hidden =
      !product?.id;
  }

  openModal("productModal");
}

function renderCategorySelect(selectedId = "") {
  const select =
    $("#productCategoryInput");

  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">
      Без категории
    </option>
    ${state.categories
      .map(
        (category) => `
          <option
            value="${escapeHtml(category.id)}"
            ${
              String(category.id) ===
              String(selectedId)
                ? "selected"
                : ""
            }
          >
            ${escapeHtml(category.name)}
          </option>
        `
      )
      .join("")}
  `;
}

function renderVariants(variants) {
  const container =
    $("#variantsContainer");

  if (!container) {
    return;
  }

  container.innerHTML =
    variants
      .map(
        (variant, index) =>
          renderVariantRow(
            variant,
            index
          )
      )
      .join("");

  bindVariantEvents();
}

function renderVariantRow(
  variant = {},
  index = 0
) {
  return `
    <div
      class="variant-row"
      data-variant-index="${index}"
    >
      <div class="variant-row-header">
        <span>
          Вариант ${index + 1}
        </span>

        <button
          type="button"
          class="admin-icon-button remove-variant"
          title="Удалить"
        >
          ×
        </button>
      </div>

      <div class="variant-grid">

        <label>
          <span>Память</span>
          <input
            type="text"
            class="variant-memory"
            value="${escapeHtml(
              variant.memory || ""
            )}"
            placeholder="256GB"
          >
        </label>

        <label>
          <span>Цвет</span>
          <input
            type="text"
            class="variant-color"
            value="${escapeHtml(
              variant.color || ""
            )}"
            placeholder="Orange"
          >
        </label>

        <label>
          <span>Страна</span>
          <input
            type="text"
            class="variant-country"
            value="${escapeHtml(
              variant.country || ""
            )}"
            placeholder="USA"
          >
        </label>

        <label>
          <span>SIM</span>
          <input
            type="text"
            class="variant-sim"
            value="${escapeHtml(
              variant.sim_type || ""
            )}"
            placeholder="eSIM"
          >
        </label>

        <label>
          <span>Цена</span>
          <input
            type="number"
            class="variant-price"
            min="0"
            step="1"
            value="${Number(
              variant.price || 0
            )}"
            placeholder="100000"
          >
        </label>

        <label>
          <span>Валюта</span>
          <select class="variant-currency">
            <option
              value="RUB"
              ${
                (variant.currency || "RUB") ===
                "RUB"
                  ? "selected"
                  : ""
              }
            >
              RUB ₽
            </option>

            <option
              value="USD"
              ${
                variant.currency === "USD"
                  ? "selected"
                  : ""
              }
            >
              USD $
            </option>

            <option
              value="EUR"
              ${
                variant.currency === "EUR"
                  ? "selected"
                  : ""
              }
            >
              EUR €
            </option>
          </select>
        </label>

        <label>
          <span>Остаток</span>
          <input
            type="number"
            class="variant-stock"
            min="0"
            step="1"
            value="${Math.max(
              0,
              Number(variant.stock || 0)
            )}"
            placeholder="1"
          >
        </label>

        <label class="variant-switch-label">
          <span>Активен</span>
          <input
            type="checkbox"
            class="variant-active"
            ${
              variant.active !== false
                ? "checked"
                : ""
            }
          >
        </label>

      </div>
    </div>
  `;
}

function bindVariantEvents() {
  $$(".remove-variant").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          const row =
            button.closest(
              ".variant-row"
            );

          row?.remove();

          renumberVariants();
        }
      );
    }
  );
}

function renumberVariants() {
  $$(".variant-row").forEach(
    (row, index) => {
      row.dataset.variantIndex =
        String(index);

      const title =
        row.querySelector(
          ".variant-row-header span"
        );

      if (title) {
        title.textContent =
          `Вариант ${index + 1}`;
      }
    }
  );
}

function collectVariants() {
  return $$(".variant-row")
    .map((row) => ({
      memory:
        row.querySelector(
          ".variant-memory"
        )?.value.trim() || "",

      color:
        row.querySelector(
          ".variant-color"
        )?.value.trim() || "",

      country:
        row.querySelector(
          ".variant-country"
        )?.value.trim() || "",

      sim_type:
        row.querySelector(
          ".variant-sim"
        )?.value.trim() || "",

      price: Number(
        row.querySelector(
          ".variant-price"
        )?.value || 0
      ),

      currency:
        row.querySelector(
          ".variant-currency"
        )?.value || "RUB",

      stock: Math.max(
        0,
        Math.floor(
          Number(
            row.querySelector(
              ".variant-stock"
            )?.value || 0
          )
        )
      ),

      active:
        row.querySelector(
          ".variant-active"
        )?.checked !== false
    }));
}

async function saveProductFromForm(event) {
  event.preventDefault();

  const id =
    $("#productId")?.value.trim();

  const name =
    $("#productNameInput")?.value.trim();

  if (!name) {
    toast(
      "Введите название товара",
      "error"
    );
    return;
  }

  const variants =
    collectVariants();

  if (!variants.length) {
    toast(
      "Добавьте хотя бы один вариант",
      "error"
    );
    return;
  }

  const payload = {
    name,

    category_id:
      $("#productCategoryInput")
        ?.value || "",

    description:
      $("#productDescriptionInput")
        ?.value.trim() || "",

    image_id:
      $("#productImageInput")
        ?.dataset.imageId || "",

    image_url:
      $("#productImageInput")
        ?.dataset.imageUrl || "",

    is_new:
      $("#productNewInput")
        ?.checked === true,

    active:
      $("#productActiveInput")
        ?.checked !== false,

    variants
  };

  const button =
    $("#productForm button[type='submit']");

  if (button) {
    button.disabled = true;
    button.dataset.oldText =
      button.textContent;
    button.textContent =
      "Сохраняем...";
  }

  try {
    const data = await api(
      id
        ? `/api/admin/products/${encodeURIComponent(id)}`
        : "/api/admin/products",
      {
        method: id
          ? "PUT"
          : "POST",
        body: JSON.stringify(payload)
      }
    );

    toast(
      id
        ? "Товар обновлён"
        : "Товар создан"
    );

    closeModal("productModal");

    await loadProducts();
    updateStats();

    return data;
  } catch (error) {
    toast(
      error.message ||
      "Не удалось сохранить товар",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        button.dataset.oldText ||
        "Сохранить";
    }
  }
}

async function deleteCurrentProduct() {
  const id =
    $("#productId")?.value.trim();

  if (!id) {
    return;
  }

  const product =
    state.products.find(
      (item) =>
        String(item.id) ===
        String(id)
    );

  const confirmed =
    confirm(
      `Удалить товар «${
        product?.name || "товар"
      }»?`
    );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    closeModal("productModal");

    toast("Товар удалён");

    await loadProducts();
    updateStats();
  } catch (error) {
    toast(
      error.message ||
      "Не удалось удалить товар",
      "error"
    );
  }
}

/* =========================================================
   IMAGE UPLOAD
========================================================= */

async function uploadProductImage(file) {
  if (!file) {
    return;
  }

  if (!file.type.startsWith("image/")) {
    toast(
      "Можно загружать только изображения",
      "error"
    );
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast(
      "Максимальный размер — 10 МБ",
      "error"
    );
    return;
  }

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  try {
    toast("Загружаем изображение...");

    const data =
      await api(
        "/api/admin/upload",
        {
          method: "POST",
          body: formData
        }
      );

    const input =
      $("#productImageInput");

    if (input) {
      input.dataset.imageId =
        data.id || "";

      input.dataset.imageUrl =
        data.image_url ||
        data.imageUrl ||
        data.url ||
        "";
    }

    const preview =
      $("#productImagePreview");

    if (preview) {
      preview.src =
        data.image_url ||
        data.imageUrl ||
        data.url;

      preview.hidden = false;
    }

    toast("Изображение загружено");
  } catch (error) {
    toast(
      error.message ||
      "Ошибка загрузки изображения",
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

    state.categories =
      Array.isArray(data.categories)
        ? data.categories
        : [];

    renderCategories();
    renderCategorySelect(
      $("#productCategoryInput")
        ?.value || ""
    );
  } catch (error) {
    console.error(
      "Categories load error:",
      error
    );

    toast(
      error.message ||
      "Не удалось загрузить категории",
      "error"
    );
  }
}

function renderCategories() {
  const grid =
    $("#categoriesGrid");

  const empty =
    $("#categoriesEmpty");

  if (!grid) {
    return;
  }

  if (!state.categories.length) {
    grid.innerHTML = "";
    show(empty);
    return;
  }

  hide(empty);

  grid.innerHTML =
    state.categories
      .map(
        (category) => `
          <article
            class="admin-category-card"
            data-id="${escapeHtml(category.id)}"
          >
            <div>
              <h3>
                ${escapeHtml(
                  category.name
                )}
              </h3>

              <span>
                ${escapeHtml(
                  category.slug
                )}
              </span>
            </div>

            <div class="admin-category-actions">
              <button
                type="button"
                class="admin-small-button edit-category"
                data-id="${escapeHtml(
                  category.id
                )}"
              >
                Изменить
              </button>

              <button
                type="button"
                class="admin-small-button danger delete-category"
                data-id="${escapeHtml(
                  category.id
                )}"
              >
                Удалить
              </button>
            </div>
          </article>
        `
      )
      .join("");

  $$(".edit-category").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () =>
          editCategory(
            button.dataset.id
          )
      );
    }
  );

  $$(".delete-category").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () =>
          deleteCategory(
            button.dataset.id
          )
      );
    }
  );
}

function openCategoryModal(
  category = null
) {
  state.currentCategory =
    category;

  $("#categoryId").value =
    category?.id || "";

  $("#categoryNameInput").value =
    category?.name || "";

  $("#categorySlugInput").value =
    category?.slug || "";

  const deleteButton =
    $("#deleteCategoryButton");

  if (deleteButton) {
    deleteButton.hidden =
      !category?.id;
  }

  openModal("categoryModal");
}

async function editCategory(id) {
  const category =
    state.categories.find(
      (item) =>
        String(item.id) ===
        String(id)
    );

  if (!category) {
    toast(
      "Категория не найдена",
      "error"
    );
    return;
  }

  openCategoryModal(
    category
  );
}

async function saveCategory(event) {
  event.preventDefault();

  const id =
    $("#categoryId")?.value.trim();

  const name =
    $("#categoryNameInput")
      ?.value.trim();

  const slug =
    $("#categorySlugInput")
      ?.value.trim();

  if (!name || !slug) {
    toast(
      "Заполните название и slug",
      "error"
    );
    return;
  }

  try {
    await api(
      id
        ? `/api/admin/categories/${encodeURIComponent(id)}`
        : "/api/admin/categories",
      {
        method: id
          ? "PUT"
          : "POST",

        body: JSON.stringify({
          name,
          slug,
          sort_order: 0,
          active: true
        })
      }
    );

    closeModal("categoryModal");

    toast(
      id
        ? "Категория обновлена"
        : "Категория создана"
    );

    await loadCategories();
    await loadProducts();
  } catch (error) {
    toast(
      error.message ||
      "Не удалось сохранить категорию",
      "error"
    );
  }
}

async function deleteCategory(id) {
  const category =
    state.categories.find(
      (item) =>
        String(item.id) ===
        String(id)
    );

  const confirmed =
    confirm(
      `Удалить категорию «${
        category?.name || ""
      }»?`
    );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      `/api/admin/categories/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    toast("Категория удалена");

    await loadCategories();
    await loadProducts();
  } catch (error) {
    toast(
      error.message ||
      "Не удалось удалить категорию",
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

    state.orders =
      Array.isArray(data.orders)
        ? data.orders
        : [];

    renderOrders();
    updateStats();
  } catch (error) {
    console.error(
      "Orders load error:",
      error
    );

    toast(
      error.message ||
      "Не удалось загрузить заказы",
      "error"
    );
  }
}

function renderOrders() {
  const list =
    $("#ordersList");

  const empty =
    $("#ordersEmpty");

  if (!list) {
    return;
  }

  let orders =
    state.orders;

  if (
    state.orderFilter &&
    state.orderFilter !== "all"
  ) {
    orders =
      orders.filter(
        (order) =>
          String(order.status) ===
          state.orderFilter
      );
  }

  if (!orders.length) {
    list.innerHTML = "";
    show(empty);
    return;
  }

  hide(empty);

  list.innerHTML =
    orders
      .map(renderOrderCard)
      .join("");
}

function renderOrderCard(order) {
  const date =
    order.created_at
      ? new Date(
          order.created_at
        ).toLocaleString(
          "ru-RU",
          {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
          }
        )
      : "";

  const username =
    order.username
      ? `@${order.username}`
      : "без username";

  const status =
    String(
      order.status || "new"
    );

  const statusNames = {
    new: "Новый",
    processing: "В работе",
    completed: "Завершён"
  };

  return `
    <article class="admin-order-card">

      <div class="admin-order-top">
        <div>
          <strong>
            ${escapeHtml(
              order.product_name ||
              "Товар"
            )}
          </strong>

          <span>
            ${escapeHtml(date)}
          </span>
        </div>

        <span class="admin-order-status ${escapeHtml(
          status
        )}">
          ${escapeHtml(
            statusNames[status] ||
            status
          )}
        </span>
      </div>

      ${
        order.configuration
          ? `
            <div class="admin-order-config">
              ${escapeHtml(
                order.configuration
              )}
            </div>
          `
          : ""
      }

      <div class="admin-order-info">
        <span>
          ${escapeHtml(
            order.price_formatted ||
            formatPrice(
              order.price,
              order.currency
            )
          )}
        </span>

        <span>
          ${escapeHtml(username)}
        </span>

        <span>
          ID: ${escapeHtml(
            order.telegram_id || ""
          )}
        </span>
      </div>

      <div class="admin-order-id">
        Заказ:
        ${escapeHtml(order.id || "")}
      </div>

    </article>
  `;
}

/* =========================================================
   PROMO
========================================================= */

function renderPromos() {
  const list =
    $("#promoList");

  const empty =
    $("#promoEmpty");

  if (!list) {
    return;
  }

  if (!state.promos.length) {
    list.innerHTML = "";
    show(empty);
    return;
  }

  hide(empty);

  list.innerHTML =
    state.promos
      .map(
        (promo) => `
          <article class="admin-promo-card">
            <div>
              <strong>
                ${escapeHtml(
                  promo.code
                )}
              </strong>

              <span>
                ${escapeHtml(
                  String(
                    promo.discount_value
                  )
                )}
                ${
                  promo.discount_type ===
                  "percent"
                    ? "%"
                    : " ₽"
                }
              </span>
            </div>

            <div>
              ${
                promo.active
                  ? "Активен"
                  : "Выключен"
              }
            </div>
          </article>
        `
      )
      .join("");
}

/*
 * В текущем server.js отдельного
 * GET /api/admin/promos нет.
 *
 * Поэтому список промокодов можно
 * только создавать через AI.
 */
function openPromoModal() {
  openModal("promoModal");
}

async function createPromo(event) {
  event.preventDefault();

  const code =
    $("#promoCodeInput")
      ?.value.trim()
      .toUpperCase();

  const type =
    $("#promoTypeInput")
      ?.value || "percent";

  const value =
    Number(
      $("#promoValueInput")
        ?.value || 0
    );

  const maxUses =
    Math.max(
      0,
      Math.floor(
        Number(
          $("#promoLimitInput")
            ?.value || 0
        )
      )
    );

  if (!code) {
    toast(
      "Введите промокод",
      "error"
    );
    return;
  }

  /*
   * Прямого endpoint создания
   * промокода в server.js нет.
   *
   * Используем существующий
   * /api/admin/ai/chat.
   */
  try {
    const command =
      `Создай промокод ${code} со скидкой ${value}${
        type === "percent"
          ? "%"
          : " рублей"
      } и лимитом ${maxUses || "без лимита"} использований.`;

    const data =
      await api(
        "/api/admin/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message: command
          })
        }
      );

    closeModal("promoModal");

    toast(
      data.message ||
      "Промокод создан"
    );
  } catch (error) {
    toast(
      error.message ||
      "Не удалось создать промокод",
      "error"
    );
  }
}

/* =========================================================
   AI ADMIN CHAT
========================================================= */

function appendAIMessage(
  text,
  role = "assistant"
) {
  const messages =
    $("#aiMessages");

  if (!messages) {
    return;
  }

  const item =
    document.createElement("div");

  item.className =
    `ai-message ${role}`;

  item.innerHTML =
    `<div class="ai-message-bubble">
      ${escapeHtml(text)}
    </div>`;

  messages.appendChild(item);

  messages.scrollTop =
    messages.scrollHeight;
}

async function sendAIMessage(
  message = null
) {
  const input =
    $("#aiChatInput");

  const text =
    String(
      message ??
      input?.value ??
      ""
    ).trim();

  if (!text) {
    return;
  }

  if (input) {
    input.value = "";
  }

  appendAIMessage(
    text,
    "user"
  );

  const sendButton =
    $("#aiSendButton");

  if (sendButton) {
    sendButton.disabled =
      true;
  }

  try {
    const data =
      await api(
        "/api/admin/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message: text
          })
        }
      );

    appendAIMessage(
      data.message ||
      "Готово.",
      "assistant"
    );

    await loadProducts();
    await loadCategories();
    await loadOrders();
  } catch (error) {
    appendAIMessage(
      `Ошибка: ${
        error.message ||
        "не удалось выполнить запрос"
      }`,
      "assistant"
    );
  } finally {
    if (sendButton) {
      sendButton.disabled =
        false;
    }

    input?.focus();
  }
}

/* =========================================================
   PRICE LIST AI
========================================================= */

async function parsePriceList() {
  const input =
    $("#priceListInput");

  const text =
    input?.value.trim();

  if (!text) {
    toast(
      "Вставьте прайс-лист",
      "error"
    );
    return;
  }

  const button =
    $("#parsePriceListButton");

  if (button) {
    button.disabled = true;
    button.dataset.oldText =
      button.textContent;
    button.textContent =
      "Разбираем...";
  }

  setPriceListStatus(
    "AI анализирует прайс-лист..."
  );

  try {
    const data =
      await api(
        "/api/admin/ai/parse",
        {
          method: "POST",
          body: JSON.stringify({
            text
          })
        }
      );

    state.parsedPriceList =
      data;

    renderPriceListPreview(
      data
    );

    setPriceListStatus(
      `Найдено товаров: ${
        Array.isArray(data.products)
          ? data.products.length
          : 0
      }`
    );

    if ($("#importPriceListButton")) {
      $("#importPriceListButton").disabled =
        !Array.isArray(data.products) ||
        !data.products.length;
    }

    toast(
      "Прайс-лист разобран"
    );
  } catch (error) {
    state.parsedPriceList =
      null;

    if ($("#importPriceListButton")) {
      $("#importPriceListButton").disabled =
        true;
    }

    setPriceListStatus(
      error.message ||
      "Ошибка разбора прайса",
      true
    );

    toast(
      error.message ||
      "Не удалось разобрать прайс",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        button.dataset.oldText ||
        "Разобрать прайс";
    }
  }
}

function setPriceListStatus(
  text,
  error = false
) {
  const element =
    $("#priceListStatus");

  if (!element) {
    return;
  }

  element.textContent =
    text;

  element.classList.toggle(
    "error",
    error
  );
}

function renderPriceListPreview(
  data
) {
  const preview =
    $("#priceListPreview");

  if (!preview) {
    return;
  }

  const products =
    Array.isArray(data.products)
      ? data.products
      : [];

  if (!products.length) {
    preview.innerHTML =
      "<p>Товары не найдены.</p>";
    return;
  }

  preview.innerHTML =
    products
      .map(
        (product) => {
          const variants =
            Array.isArray(
              product.variants
            )
              ? product.variants
              : [];

          return `
            <div class="price-preview-product">

              <div class="price-preview-head">
                <strong>
                  ${escapeHtml(
                    product.name
                  )}
                </strong>

                <span>
                  ${escapeHtml(
                    product.category ||
                    "Другое"
                  )}
                </span>
              </div>

              ${
                variants
                  .map(
                    (variant) => `
                      <div class="price-preview-variant">
                        <span>
                          ${escapeHtml(
                            [
                              variant.memory,
                              variant.color,
                              variant.country,
                              variant.sim_type
                            ]
                              .filter(Boolean)
                              .join(" · ") ||
                            "Без параметров"
                          )}
                        </span>

                        <strong>
                          ${formatPrice(
                            variant.price,
                            variant.currency ||
                              "RUB"
                          )}
                        </strong>
                      </div>
                    `
                  )
                  .join("")
              }

            </div>
          `;
        }
      )
      .join("");
}

async function importPriceList() {
  const data =
    state.parsedPriceList;

  const products =
    Array.isArray(data?.products)
      ? data.products
      : [];

  if (!products.length) {
    toast(
      "Сначала разберите прайс",
      "error"
    );
    return;
  }

  const confirmed =
    confirm(
      `Импортировать ${products.length} товаров?`
    );

  if (!confirmed) {
    return;
  }

  const button =
    $("#importPriceListButton");

  if (button) {
    button.disabled = true;
    button.dataset.oldText =
      button.textContent;
    button.textContent =
      "Импортируем...";
  }

  try {
    const result =
      await api(
        "/api/admin/ai/import",
        {
          method: "POST",
          body: JSON.stringify({
            products
          })
        }
      );

    toast(
      `Импортировано товаров: ${
        result.imported || 0
      }`
    );

    await loadProducts();
    await loadCategories();

    setPriceListStatus(
      `Импортировано: ${
        result.imported || 0
      }`
    );
  } catch (error) {
    toast(
      error.message ||
      "Ошибка импорта",
      "error"
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        button.dataset.oldText ||
        "Импортировать";
    }
  }
}

/* =========================================================
   STATS
========================================================= */

function updateStats() {
  const products =
    $("#statProducts");

  const variants =
    $("#statVariants");

  const orders =
    $("#statOrders");

  if (products) {
    products.textContent =
      String(
        state.products.length
      );
  }

  if (variants) {
    variants.textContent =
      String(
        state.products.reduce(
          (sum, product) =>
            sum +
            (
              Array.isArray(
                product.variants
              )
                ? product.variants.length
                : 0
            ),
          0
        )
      );
  }

  if (orders) {
    orders.textContent =
      String(
        state.orders.length
      );
  }
}

/* =========================================================
   TABS
========================================================= */

function switchTab(tab) {
  state.activeTab =
    tab;

  $$("[data-tab]").forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.tab ===
          tab
      );
    }
  );

  $$("[data-tab-panel]").forEach(
    (panel) => {
      panel.hidden =
        panel.dataset.tabPanel !==
        tab;
    }
  );
}

/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
  $("#backToStore")
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "/";
      }
    );

  $("#backToStoreDenied")
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "/";
      }
    );

  $("#refreshButton")
    ?.addEventListener(
      "click",
      async () => {
        const button =
          $("#refreshButton");

        if (button) {
          button.disabled =
            true;
        }

        try {
          await loadAll();
          toast(
            "Данные обновлены"
          );
        } catch (error) {
          console.error(error);
        } finally {
          if (button) {
            button.disabled =
              false;
          }
        }
      }
    );

  $$("[data-tab]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () =>
          switchTab(
            button.dataset.tab
          )
      );
    }
  );

  $("#addProductButton")
    ?.addEventListener(
      "click",
      () =>
        openProductModal()
    );

  $("#emptyAddProduct")
    ?.addEventListener(
      "click",
      () =>
        openProductModal()
    );

  $("#productSearch")
    ?.addEventListener(
      "input",
      () =>
        renderProducts()
    );

  $("#clearProductSearch")
    ?.addEventListener(
      "click",
      () => {
        const input =
          $("#productSearch");

        if (input) {
          input.value = "";
        }

        renderProducts();
      }
    );

  $("#closeProductModal")
    ?.addEventListener(
      "click",
      () =>
        closeModal(
          "productModal"
        )
    );

  $("#cancelProductButton")
    ?.addEventListener(
      "click",
      () =>
        closeModal(
          "productModal"
        )
    );

  $("#productForm")
    ?.addEventListener(
      "submit",
      saveProductFromForm
    );

  $("#deleteProductButton")
    ?.addEventListener(
      "click",
      deleteCurrentProduct
    );

  $("#addVariantButton")
    ?.addEventListener(
      "click",
      () => {
        const container =
          $("#variantsContainer");

        if (!container) {
          return;
        }

        const index =
          container.querySelectorAll(
            ".variant-row"
          ).length;

        container.insertAdjacentHTML(
          "beforeend",
          renderVariantRow(
            {
              memory: "",
              color: "",
              country: "",
              sim_type: "",
              price: 0,
              currency: "RUB",
              stock: 0,
              active: true
            },
            index
          )
        );

        bindVariantEvents();
      }
    );

  $("#productImageInput")
    ?.addEventListener(
      "change",
      (event) => {
        const file =
          event.target.files?.[0];

        uploadProductImage(
          file
        );
      }
    );

  $("#addCategoryButton")
    ?.addEventListener(
      "click",
      () =>
        openCategoryModal()
    );

  $("#closeCategoryModal")
    ?.addEventListener(
      "click",
      () =>
        closeModal(
          "categoryModal"
        )
    );

  $("#cancelCategoryButton")
    ?.addEventListener(
      "click",
      () =>
        closeModal(
          "categoryModal"
        )
    );

  $("#categoryForm")
    ?.addEventListener(
      "submit",
      saveCategory
    );

  $("#deleteCategoryButton")
    ?.addEventListener(
      "click",
      async () => {
        const id =
          $("#categoryId")
            ?.value.trim();

        if (id) {
          await deleteCategory(
            id
          );

          closeModal(
            "categoryModal"
          );
        }
      }
    );

  $("#refreshOrdersButton")
    ?.addEventListener(
      "click",
      loadOrders
    );

  $$("[data-order-filter]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          state.orderFilter =
            button.dataset.orderFilter;

          $$(
            "[data-order-filter]"
          ).forEach(
            (item) =>
              item.classList.toggle(
                "active",
                item === button
              )
          );

          renderOrders();
        }
      );
    }
  );

  $("#addPromoButton")
    ?.addEventListener(
      "click",
      openPromoModal
    );

  $("#promoAIButton")
    ?.addEventListener(
      "click",
      () =>
        switchTab("ai")
    );

  $("#closePromoModal")
    ?.addEventListener(
      "click",
      () =>
        closeModal(
          "promoModal"
        )
    );

  $("#cancelPromoButton")
    ?.addEventListener(
      "click",
      () =>
        closeModal(
          "promoModal"
        )
    );

  $("#promoForm")
    ?.addEventListener(
      "submit",
      createPromo
    );

  $("#aiChatForm")
    ?.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        sendAIMessage();
      }
    );

  $$("[data-ai-example]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () =>
          sendAIMessage(
            button.dataset.aiExample
          )
      );
    }
  );

  $$("[data-ai-command]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () =>
          sendAIMessage(
            button.dataset.aiCommand
          )
      );
    }
  );

  $("#parsePriceListButton")
    ?.addEventListener(
      "click",
      parsePriceList
    );

  $("#importPriceListButton")
    ?.addEventListener(
      "click",
      importPriceList
    );

  document.addEventListener(
    "click",
    (event) => {
      const modal =
        event.target.closest(
          ".admin-modal"
        );

      if (
        modal &&
        event.target === modal
      ) {
        closeModal(
          modal.id
        );
      }
    }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape"
      ) {
        $$(".admin-modal").forEach(
          (modal) => {
            if (!modal.hidden) {
              closeModal(
                modal.id
              );
            }
          }
        );
      }
    }
  );
}

/* =========================================================
   IMAGE PREVIEW / DRAG SUPPORT
========================================================= */

function setupImagePreview() {
  const input =
    $("#productImageInput");

  const preview =
    $("#productImagePreview");

  if (!input || !preview) {
    return;
  }

  input.addEventListener(
    "change",
    () => {
      const file =
        input.files?.[0];

      if (!file) {
        return;
      }

      const reader =
        new FileReader();

      reader.onload = () => {
        preview.src =
          reader.result;

        preview.hidden =
          false;
      };

      reader.readAsDataURL(
        file
      );
    }
  );
}

/* =========================================================
   PROMO UI HELPERS
========================================================= */

function setupPromoDefaults() {
  const type =
    $("#promoTypeInput");

  if (type) {
    type.value =
      type.value ||
      "percent";
  }

  const active =
    $("#promoActiveInput");

  if (active) {
    active.checked = true;
  }
}

/* =========================================================
   START
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {
    bindEvents();
    setupImagePreview();
    setupPromoDefaults();

    switchTab("products");

    const importButton =
      $("#importPriceListButton");

    if (importButton) {
      importButton.disabled =
        true;
    }

    await checkAdmin();
  }
);