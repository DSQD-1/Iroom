const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  products: [],
  categories: [],
  orders: [],
  promos: [],
  currentProduct: null,
  currentCategory: null,
  currentOrderFilter: "all",
  uploadedImageId: null,
  parsedProducts: [],
  productSearch: "",
  aiBusy: false
};

const $ = (id) => document.getElementById(id);

function initData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
    "x-telegram-init-data": initData()
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
      data.message ||
      `Ошибка ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value, currency = "RUB") {
  const number = Number(value || 0);

  const symbols = {
    RUB: "₽",
    USD: "$",
    EUR: "€"
  };

  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0
  }).format(number)} ${symbols[currency] || currency || "₽"}`;
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

function showToast(message, type = "normal") {
  const toast = $("adminToast");

  if (!toast) return;

  toast.textContent = message;

  toast.className = "admin-toast show";

  if (type === "error") {
    toast.classList.add("error");
  }

  if (type === "success") {
    toast.classList.add("success");
  }

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/ё/g, "e")
    .replace(/[^a-zа-я0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function imageUrl(imageId) {
  return imageId
    ? `/api/images/${imageId}`
    : "";
}

function productImage(product) {
  if (!product) return "";

  if (product.image_url) {
    return product.image_url;
  }

  if (product.image_id) {
    return imageUrl(product.image_id);
  }

  return "";
}

/* =========================================================
   ACCESS
========================================================= */

async function checkAccess() {
  try {
    const data = await api("/api/admin/me");

    if (!data?.admin) {
      showDenied();
      return false;
    }

    showAdmin();

    return true;
  } catch (error) {
    console.error(error);
    showDenied();
    return false;
  }
}

function showAdmin() {
  $("adminLoading")?.classList.add("hidden");
  $("adminDenied")?.classList.add("hidden");
  $("adminApp")?.classList.remove("hidden");
}

function showDenied() {
  $("adminLoading")?.classList.add("hidden");
  $("adminApp")?.classList.add("hidden");
  $("adminDenied")?.classList.remove("hidden");
}

/* =========================================================
   NAVIGATION
========================================================= */

function openStore() {
  window.location.href = "/";
}

function setActiveTab(tabName) {
  document
    .querySelectorAll(".admin-tab")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tabName
      );
    });

  document
    .querySelectorAll(".admin-section")
    .forEach((section) => {
      section.classList.toggle(
        "active",
        section.id === `tab-${tabName}`
      );
    });

  if (tabName === "products") {
    loadProducts();
  }

  if (tabName === "categories") {
    loadCategories();
  }

  if (tabName === "orders") {
    loadOrders();
  }

  if (tabName === "promo") {
    loadPromos();
  }
}

/* =========================================================
   PRODUCTS
========================================================= */

async function loadProducts() {
  try {
    const data = await api("/api/admin/products");

    state.products =
      Array.isArray(data)
        ? data
        : data.products || [];

    renderProducts();
    updateStats();
  } catch (error) {
    console.error(error);

    showToast(
      `Не удалось загрузить товары: ${error.message}`,
      "error"
    );
  }
}

function filteredProducts() {
  const query =
    state.productSearch
      .trim()
      .toLowerCase();

  if (!query) {
    return state.products;
  }

  return state.products.filter((product) => {
    const haystack = [
      product.name,
      product.description,
      product.category_name,
      product.category,
      ...(product.variants || []).map((variant) =>
        [
          variant.memory,
          variant.color,
          variant.country,
          variant.sim_type
        ].join(" ")
      )
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function renderProducts() {
  const grid = $("productsGrid");
  const empty = $("productsEmpty");

  if (!grid) return;

  const products = filteredProducts();

  grid.innerHTML = "";

  if (!products.length) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  for (const product of products) {
    grid.insertAdjacentHTML(
      "beforeend",
      productCardHtml(product)
    );
  }

  grid
    .querySelectorAll("[data-product-id]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const id = Number(card.dataset.productId);
        openProductModal(id);
      });
    });
}

function productCardHtml(product) {
  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  const activeVariants =
    variants.filter(
      (variant) =>
        variant.active !== 0 &&
        variant.active !== false
    );

  const image = productImage(product);

  const prices = activeVariants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price));

  let priceText = "Цена не указана";

  if (prices.length) {
    const min = Math.min(...prices);
    const currency =
      activeVariants.find((variant) => variant.currency)
        ?.currency || "RUB";

    priceText =
      prices.length > 1
        ? `от ${formatPrice(min, currency)}`
        : formatPrice(min, currency);
  }

  return `
    <article
      class="admin-product-card"
      data-product-id="${product.id}"
    >

      <div class="admin-product-image">

        ${
          image
            ? `
              <img
                src="${escapeHtml(image)}"
                alt=""
                loading="lazy"
              >
            `
            : `
              <div class="admin-product-placeholder">
                IRoom
              </div>
            `
        }

        ${
          product.is_new
            ? `<span class="product-badge">NEW</span>`
            : ""
        }

        ${
          !product.active
            ? `<span class="product-badge inactive">OFF</span>`
            : ""
        }

      </div>


      <div class="admin-product-content">

        <div class="admin-product-category">
          ${escapeHtml(
            product.category_name ||
            product.category ||
            "Без категории"
          )}
        </div>

        <h3>
          ${escapeHtml(product.name || "Без названия")}
        </h3>

        <div class="admin-product-bottom">

          <span class="admin-product-price">
            ${escapeHtml(priceText)}
          </span>

          <span class="admin-product-variants">
            ${variants.length} ${
              variants.length === 1
                ? "вариант"
                : "вариантов"
            }
          </span>

        </div>

      </div>

    </article>
  `;
}

async function openProductModal(productId = null) {
  state.currentProduct = null;
  state.uploadedImageId = null;

  resetProductForm();

  await loadCategories();

  const modal = $("productModal");

  if (productId) {
    try {
      const data =
        await api(`/api/products/${productId}`);

      const product =
        data.product || data;

      state.currentProduct = product;

      fillProductForm(product);

      $("productModalKicker").textContent =
        "РЕДАКТИРОВАНИЕ";

      $("productModalTitle").textContent =
        product.name || "Товар";

      $("deleteProductButton")
        ?.classList.remove("hidden");

    } catch (error) {
      showToast(
        `Не удалось открыть товар: ${error.message}`,
        "error"
      );

      return;
    }
  } else {
    $("productModalKicker").textContent =
      "НОВЫЙ ТОВАР";

    $("productModalTitle").textContent =
      "Добавить товар";

    $("deleteProductButton")
      ?.classList.add("hidden");

    addVariantRow();
  }

  modal?.classList.remove("hidden");
  document.body.classList.add("modal-open");
}

function closeProductModal() {
  $("productModal")?.classList.add("hidden");
  document.body.classList.remove("modal-open");

  state.currentProduct = null;
  state.uploadedImageId = null;
}

function resetProductForm() {
  $("productForm")?.reset();

  $("productId").value = "";

  $("productActiveInput").checked = true;
  $("productNewInput").checked = false;

  $("variantsContainer").innerHTML = "";

  $("productImagePreview").innerHTML = `
    <div class="image-placeholder">
      IRoom
    </div>
  `;
}

function fillProductForm(product) {
  $("productId").value =
    product.id || "";

  $("productNameInput").value =
    product.name || "";

  $("productDescriptionInput").value =
    product.description || "";

  $("productCategoryInput").value =
    product.category_id || "";

  $("productNewInput").checked =
    Boolean(product.is_new);

  $("productActiveInput").checked =
    product.active !== 0 &&
    product.active !== false;

  const image = productImage(product);

  if (image) {
    $("productImagePreview").innerHTML = `
      <img
        src="${escapeHtml(image)}"
        alt=""
      >
    `;
  }

  $("variantsContainer").innerHTML = "";

  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  if (!variants.length) {
    addVariantRow();
    return;
  }

  variants.forEach((variant) => {
    addVariantRow(variant);
  });
}

function addVariantRow(variant = {}) {
  const container =
    $("variantsContainer");

  if (!container) return;

  const id =
    variant.id ||
    `new-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

  const row =
    document.createElement("div");

  row.className = "variant-row";

  row.dataset.variantId =
    variant.id || "";

  row.innerHTML = `
    <div class="variant-row-header">

      <strong>
        Вариант
      </strong>

      <button
        type="button"
        class="remove-variant"
      >
        ×
      </button>

    </div>


    <div class="variant-fields">

      <div class="variant-field">

        <label>
          Память
        </label>

        <input
          type="text"
          class="variant-memory"
          placeholder="256GB"
          value="${escapeHtml(
            variant.memory || ""
          )}"
        >

      </div>


      <div class="variant-field">

        <label>
          Цвет
        </label>

        <input
          type="text"
          class="variant-color"
          placeholder="Orange"
          value="${escapeHtml(
            variant.color || ""
          )}"
        >

      </div>


      <div class="variant-field">

        <label>
          Страна
        </label>

        <input
          type="text"
          class="variant-country"
          placeholder="USA"
          value="${escapeHtml(
            variant.country || ""
          )}"
        >

      </div>


      <div class="variant-field">

        <label>
          SIM
        </label>

        <input
          type="text"
          class="variant-sim"
          placeholder="eSIM"
          value="${escapeHtml(
            variant.sim_type || ""
          )}"
        >

      </div>


      <div class="variant-field">

        <label>
          Цена
        </label>

        <input
          type="number"
          min="0"
          step="0.01"
          class="variant-price"
          placeholder="100000"
          value="${escapeHtml(
            variant.price ?? ""
          )}"
        >

      </div>


      <div class="variant-field">

        <label>
          Валюта
        </label>

        <select class="variant-currency">

          <option
            value="RUB"
            ${variant.currency === "RUB" || !variant.currency ? "selected" : ""}
          >
            RUB ₽
          </option>

          <option
            value="USD"
            ${variant.currency === "USD" ? "selected" : ""}
          >
            USD $
          </option>

          <option
            value="EUR"
            ${variant.currency === "EUR" ? "selected" : ""}
          >
            EUR €
          </option>

        </select>

      </div>


      <div class="variant-field">

        <label>
          Остаток
        </label>

        <input
          type="number"
          min="0"
          step="1"
          class="variant-stock"
          placeholder="1"
          value="${escapeHtml(
            variant.stock ?? 0
          )}"
        >

      </div>


      <label class="variant-active">

        <input
          type="checkbox"
          class="variant-active-input"
          ${
            variant.active === undefined ||
            variant.active === 1 ||
            variant.active === true
              ? "checked"
              : ""
          }
        >

        <span>
          Активен
        </span>

      </label>

    </div>
  `;

  container.appendChild(row);

  row
    .querySelector(".remove-variant")
    ?.addEventListener(
      "click",
      () => row.remove()
    );
}

function collectVariants() {
  return [
    ...document.querySelectorAll(
      "#variantsContainer .variant-row"
    )
  ].map((row) => ({
    id:
      row.dataset.variantId
        ? Number(row.dataset.variantId)
        : null,

    memory:
      row.querySelector(".variant-memory")
        ?.value
        .trim() || "",

    color:
      row.querySelector(".variant-color")
        ?.value
        .trim() || "",

    country:
      row.querySelector(".variant-country")
        ?.value
        .trim() || "",

    sim_type:
      row.querySelector(".variant-sim")
        ?.value
        .trim() || "",

    price:
      Number(
        row.querySelector(".variant-price")
          ?.value || 0
      ),

    currency:
      row.querySelector(".variant-currency")
        ?.value || "RUB",

    stock:
      Number(
        row.querySelector(".variant-stock")
          ?.value || 0
      ),

    active:
      row.querySelector(".variant-active-input")
        ?.checked
        ? 1
        : 0
  }));
}

/* =========================================================
   IMAGE UPLOAD
========================================================= */

async function uploadProductImage(file) {
  if (!file) return null;

  const formData = new FormData();

  formData.append("image", file);

  const data =
    await api("/api/admin/upload", {
      method: "POST",
      body: formData
    });

  return data.image_id || data.id || null;
}

/* =========================================================
   SAVE PRODUCT
========================================================= */

async function saveProduct(event) {
  event.preventDefault();

  const name =
    $("productNameInput")
      .value
      .trim();

  const categoryId =
    Number(
      $("productCategoryInput").value
    );

  if (!name) {
    showToast(
      "Введите название товара",
      "error"
    );

    return;
  }

  if (!categoryId) {
    showToast(
      "Выберите категорию",
      "error"
    );

    return;
  }

  const variants =
    collectVariants();

  if (!variants.length) {
    showToast(
      "Добавьте хотя бы один вариант",
      "error"
    );

    return;
  }

  const product = {
    name,

    category_id:
      categoryId,

    description:
      $("productDescriptionInput")
        .value
        .trim(),

    is_new:
      $("productNewInput").checked
        ? 1
        : 0,

    active:
      $("productActiveInput").checked
        ? 1
        : 0,

    variants
  };

  if (state.uploadedImageId) {
    product.image_id =
      state.uploadedImageId;
  }

  try {
    const productId =
      Number(
        $("productId").value || 0
      );

    if (productId) {
      await api(
        `/api/admin/products/${productId}`,
        {
          method: "PUT",
          body: JSON.stringify(product)
        }
      );

      showToast(
        "Товар обновлён",
        "success"
      );
    } else {
      await api(
        "/api/admin/products",
        {
          method: "POST",
          body: JSON.stringify(product)
        }
      );

      showToast(
        "Товар создан",
        "success"
      );
    }

    closeProductModal();

    await loadProducts();
    await loadCategories();

  } catch (error) {
    console.error(error);

    showToast(
      `Ошибка сохранения: ${error.message}`,
      "error"
    );
  }
}

/* =========================================================
   DELETE PRODUCT
========================================================= */

async function deleteProduct() {
  const productId =
    Number(
      $("productId").value || 0
    );

  if (!productId) return;

  const confirmed =
    window.confirm(
      "Удалить этот товар?"
    );

  if (!confirmed) return;

  try {
    await api(
      `/api/admin/products/${productId}`,
      {
        method: "DELETE"
      }
    );

    closeProductModal();

    showToast(
      "Товар удалён",
      "success"
    );

    await loadProducts();

  } catch (error) {
    showToast(
      `Ошибка удаления: ${error.message}`,
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
      await api("/api/categories");

    state.categories =
      Array.isArray(data)
        ? data
        : data.categories || [];

    renderCategories();
    renderCategorySelect();

    updateStats();

  } catch (error) {
    console.error(error);

    showToast(
      `Не удалось загрузить категории: ${error.message}`,
      "error"
    );
  }
}

function renderCategorySelect() {
  const select =
    $("productCategoryInput");

  if (!select) return;

  const current =
    select.value;

  select.innerHTML = `
    <option value="">
      Выберите категорию
    </option>
  `;

  state.categories.forEach((category) => {
    select.insertAdjacentHTML(
      "beforeend",
      `
        <option value="${category.id}">
          ${escapeHtml(category.name)}
        </option>
      `
    );
  });

  if (current) {
    select.value = current;
  }
}

function renderCategories() {
  const grid =
    $("categoriesGrid");

  const empty =
    $("categoriesEmpty");

  if (!grid) return;

  grid.innerHTML = "";

  if (!state.categories.length) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  state.categories.forEach((category) => {
    grid.insertAdjacentHTML(
      "beforeend",
      `
        <article
          class="category-card"
          data-category-id="${category.id}"
        >

          <div class="category-card-icon">
            ${escapeHtml(
              category.name
                .slice(0, 1)
                .toUpperCase()
            )}
          </div>

          <div class="category-card-info">

            <h3>
              ${escapeHtml(category.name)}
            </h3>

            <span>
              ${escapeHtml(category.slug || "")}
            </span>

          </div>

          <div class="category-card-arrow">
            →
          </div>

        </article>
      `
    );
  });

  grid
    .querySelectorAll("[data-category-id]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        openCategoryModal(
          Number(card.dataset.categoryId)
        );
      });
    });
}

function openCategoryModal(categoryId = null) {
  const modal =
    $("categoryModal");

  $("categoryForm")?.reset();

  $("categoryId").value = "";

  $("deleteCategoryButton")
    ?.classList.add("hidden");

  if (categoryId) {
    const category =
      state.categories.find(
        (item) =>
          Number(item.id) ===
          Number(categoryId)
      );

    if (!category) return;

    state.currentCategory =
      category;

    $("categoryId").value =
      category.id;

    $("categoryNameInput").value =
      category.name || "";

    $("categorySlugInput").value =
      category.slug || "";

    $("deleteCategoryButton")
      ?.classList.remove("hidden");

  } else {
    state.currentCategory = null;
  }

  modal?.classList.remove("hidden");

  document.body.classList.add(
    "modal-open"
  );
}

function closeCategoryModal() {
  $("categoryModal")
    ?.classList.add("hidden");

  document.body.classList.remove(
    "modal-open"
  );

  state.currentCategory = null;
}

async function saveCategory(event) {
  event.preventDefault();

  const id =
    Number(
      $("categoryId").value || 0
    );

  const name =
    $("categoryNameInput")
      .value
      .trim();

  let slug =
    $("categorySlugInput")
      .value
      .trim();

  if (!name) {
    showToast(
      "Введите название",
      "error"
    );

    return;
  }

  if (!slug) {
    slug = slugify(name);
  }

  try {
    const payload = {
      name,
      slug
    };

    if (id) {
      await api(
        `/api/admin/categories/${id}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

      showToast(
        "Категория обновлена",
        "success"
      );
    } else {
      await api(
        "/api/admin/categories",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      showToast(
        "Категория создана",
        "success"
      );
    }

    closeCategoryModal();

    await loadCategories();

  } catch (error) {
    showToast(
      `Ошибка категории: ${error.message}`,
      "error"
    );
  }
}

async function deleteCategory() {
  const id =
    Number(
      $("categoryId").value || 0
    );

  if (!id) return;

  if (
    !window.confirm(
      "Удалить эту категорию?"
    )
  ) {
    return;
  }

  try {
    await api(
      `/api/admin/categories/${id}`,
      {
        method: "DELETE"
      }
    );

    closeCategoryModal();

    showToast(
      "Категория удалена",
      "success"
    );

    await loadCategories();

  } catch (error) {
    showToast(
      `Ошибка удаления: ${error.message}`,
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
      await api("/api/admin/orders");

    state.orders =
      Array.isArray(data)
        ? data
        : data.orders || [];

    renderOrders();
    updateStats();

  } catch (error) {
    console.error(error);

    showToast(
      `Не удалось загрузить заказы: ${error.message}`,
      "error"
    );
  }
}

function renderOrders() {
  const list =
    $("ordersList");

  const empty =
    $("ordersEmpty");

  if (!list) return;

  const filter =
    state.currentOrderFilter;

  let orders =
    [...state.orders];

  if (filter !== "all") {
    orders =
      orders.filter(
        (order) =>
          String(order.status || "")
            .toLowerCase() ===
          filter
      );
  }

  list.innerHTML = "";

  if (!orders.length) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  orders.forEach((order) => {
    list.insertAdjacentHTML(
      "beforeend",
      orderCardHtml(order)
    );
  });

  list
    .querySelectorAll(
      ".order-status-select"
    )
    .forEach((select) => {
      select.addEventListener(
        "change",
        async () => {
          await updateOrderStatus(
            Number(
              select.dataset.orderId
            ),
            select.value
          );
        }
      );
    });
}

function orderCardHtml(order) {
  const status =
    String(
      order.status || "new"
    ).toLowerCase();

  const productName =
    order.product_name ||
    order.name ||
    "Товар";

  const username =
    order.username
      ? `@${String(order.username).replace(/^@/, "")}`
      : order.telegram_username
        ? `@${String(order.telegram_username).replace(/^@/, "")}`
        : "Пользователь";

  return `
    <article class="order-card">

      <div class="order-card-top">

        <div>

          <div class="order-id">
            #${order.id || "—"}
          </div>

          <h3>
            ${escapeHtml(productName)}
          </h3>

        </div>

        <span class="order-status status-${escapeHtml(status)}">
          ${escapeHtml(orderStatusLabel(status))}
        </span>

      </div>


      <div class="order-info">

        <div class="order-info-row">

          <span>
            Клиент
          </span>

          <strong>
            ${escapeHtml(username)}
          </strong>

        </div>


        <div class="order-info-row">

          <span>
            Цена
          </span>

          <strong>
            ${formatPrice(
              order.price,
              order.currency || "RUB"
            )}
          </strong>

        </div>


        <div class="order-info-row">

          <span>
            Создан
          </span>

          <strong>
            ${escapeHtml(
              formatDate(
                order.created_at
              )
            )}
          </strong>

        </div>

      </div>


      <div class="order-bottom">

        <select
          class="order-status-select"
          data-order-id="${order.id}"
        >

          <option
            value="new"
            ${status === "new" ? "selected" : ""}
          >
            Новый
          </option>

          <option
            value="processing"
            ${status === "processing" ? "selected" : ""}
          >
            В работе
          </option>

          <option
            value="completed"
            ${status === "completed" ? "selected" : ""}
          >
            Завершён
          </option>

          <option
            value="cancelled"
            ${status === "cancelled" ? "selected" : ""}
          >
            Отменён
          </option>

        </select>

      </div>

    </article>
  `;
}

function orderStatusLabel(status) {
  const labels = {
    new: "Новый",
    processing: "В работе",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  return labels[status] || status;
}

async function updateOrderStatus(
  orderId,
  status
) {
  try {
    await api(
      `/api/admin/orders/${orderId}`,
      {
        method: "PUT",
        body: JSON.stringify({
          status
        })
      }
    );

    showToast(
      "Статус обновлён",
      "success"
    );

    await loadOrders();

  } catch (error) {
    showToast(
      `Ошибка: ${error.message}`,
      "error"
    );
  }
}

/* =========================================================
   PROMOS
========================================================= */

async function loadPromos() {
  try {
    const data =
      await api("/api/admin/promos");

    state.promos =
      Array.isArray(data)
        ? data
        : data.promos || [];

    renderPromos();

  } catch (error) {
    console.error(error);

    const list =
      $("promoList");

    if (list) {
      list.innerHTML = "";
    }
  }
}

function renderPromos() {
  const list =
    $("promoList");

  const empty =
    $("promoEmpty");

  if (!list) return;

  list.innerHTML = "";

  if (!state.promos.length) {
    empty?.classList.remove("hidden");
    return;
  }

  empty?.classList.add("hidden");

  state.promos.forEach((promo) => {
    list.insertAdjacentHTML(
      "beforeend",
      `
        <article class="promo-card">

          <div>

            <div class="promo-code">
              ${escapeHtml(promo.code)}
            </div>

            <div class="promo-value">
              ${
                promo.type === "percent"
                  ? `${promo.value}%`
                  : formatPrice(
                      promo.value,
                      "RUB"
                    )
              }
            </div>

          </div>

          <div class="promo-meta">

            <span>
              Использовано:
              ${promo.used_count || 0}
            </span>

            <span
              class="${promo.active ? "promo-active" : "promo-inactive"}"
            >
              ${promo.active ? "Активен" : "Неактивен"}
            </span>

          </div>

        </article>
      `
    );
  });
}

function openPromoModal() {
  $("promoForm")?.reset();

  $("promoActiveInput").checked =
    true;

  $("promoModal")
    ?.classList.remove("hidden");

  document.body.classList.add(
    "modal-open"
  );
}

function closePromoModal() {
  $("promoModal")
    ?.classList.add("hidden");

  document.body.classList.remove(
    "modal-open"
  );
}

async function savePromo(event) {
  event.preventDefault();

  const code =
    $("promoCodeInput")
      .value
      .trim()
      .toUpperCase();

  const type =
    $("promoTypeInput")
      .value;

  const value =
    Number(
      $("promoValueInput")
        .value || 0
    );

  const limit =
    Number(
      $("promoLimitInput")
        .value || 0
    );

  const expires =
    $("promoExpiresInput")
      .value;

  const active =
    $("promoActiveInput")
      .checked;

  if (!code) {
    showToast(
      "Введите промокод",
      "error"
    );

    return;
  }

  if (value <= 0) {
    showToast(
      "Введите значение скидки",
      "error"
    );

    return;
  }

  try {
    await api(
      "/api/admin/promos",
      {
        method: "POST",
        body: JSON.stringify({
          code,
          type,
          value,
          usage_limit:
            limit || null,
          expires_at:
            expires
              ? new Date(expires).toISOString()
              : null,
          active:
            active ? 1 : 0
        })
      }
    );

    closePromoModal();

    showToast(
      "Промокод создан",
      "success"
    );

    await loadPromos();

  } catch (error) {
    showToast(
      `Ошибка создания: ${error.message}`,
      "error"
    );
  }
}

/* =========================================================
   AI
========================================================= */

function addAIMessage(
  role,
  text
) {
  const messages =
    $("aiMessages");

  if (!messages) return;

  const item =
    document.createElement("div");

  item.className =
    `ai-message ${role}`;

  item.innerHTML = `
    <div class="ai-message-role">
      ${
        role === "user"
          ? "Вы"
          : "IRoom AI"
      }
    </div>

    <div class="ai-message-text">
      ${escapeHtml(text)}
    </div>
  `;

  messages.appendChild(item);

  messages.scrollTop =
    messages.scrollHeight;
}

async function sendAIMessage(
  text
) {
  const message =
    String(text || "")
      .trim();

  if (!message || state.aiBusy) {
    return;
  }

  state.aiBusy = true;

  const sendButton =
    $("aiSendButton");

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent =
      "Обработка…";
  }

  addAIMessage(
    "user",
    message
  );

  try {
    const data =
      await api(
        "/api/admin/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message
          })
        }
      );

    const answer =
      data.answer ||
      data.message ||
      data.text ||
      "Готово.";

    addAIMessage(
      "assistant",
      answer
    );

    await loadProducts();
    await loadCategories();
    await loadOrders();
    await loadPromos();

  } catch (error) {
    console.error(error);

    addAIMessage(
      "assistant",
      `Ошибка: ${error.message}`
    );

    showToast(
      "AI не смог выполнить команду",
      "error"
    );

  } finally {
    state.aiBusy = false;

    if (sendButton) {
      sendButton.disabled = false;
      sendButton.textContent =
        "Отправить";
    }
  }
}

async function parsePriceList() {
  const input =
    $("priceListInput");

  const text =
    input?.value.trim();

  if (!text) {
    showToast(
      "Вставьте прайс-лист",
      "error"
    );

    return;
  }

  const button =
    $("parsePriceListButton");

  const importButton =
    $("importPriceListButton");

  button.disabled = true;
  button.textContent =
    "Разбираем…";

  importButton.disabled = true;

  setPriceListStatus(
    "AI анализирует прайс-лист…"
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

    state.parsedProducts =
      data.products ||
      data.items ||
      [];

    renderPriceListPreview();

    if (state.parsedProducts.length) {
      importButton.disabled = false;

      setPriceListStatus(
        `Найдено товаров: ${state.parsedProducts.length}`,
        "success"
      );
    } else {
      setPriceListStatus(
        "AI не нашёл товары в тексте.",
        "error"
      );
    }

  } catch (error) {
    console.error(error);

    setPriceListStatus(
      `Ошибка: ${error.message}`,
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent =
      "Разобрать";
  }
}

function setPriceListStatus(
  text,
  type = ""
) {
  const status =
    $("priceListStatus");

  if (!status) return;

  status.textContent =
    text;

  status.className =
    "price-list-status";

  if (type) {
    status.classList.add(type);
  }
}

function renderPriceListPreview() {
  const preview =
    $("priceListPreview");

  if (!preview) return;

  preview.innerHTML = "";

  state.parsedProducts.forEach(
    (product, productIndex) => {

      const variants =
        Array.isArray(product.variants)
          ? product.variants
          : [];

      preview.insertAdjacentHTML(
        "beforeend",
        `
          <article class="parsed-product">

            <div class="parsed-product-top">

              <div>

                <span class="parsed-index">
                  ${productIndex + 1}
                </span>

                <strong>
                  ${escapeHtml(
                    product.name ||
                    "Без названия"
                  )}
                </strong>

              </div>

              <span class="parsed-category">
                ${escapeHtml(
                  product.category ||
                  "iPhone"
                )}
              </span>

            </div>


            <div class="parsed-variants">

              ${
                variants.length
                  ? variants
                      .map(
                        (variant) => `
                          <div class="parsed-variant">

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
                                "Стандартный вариант"
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
                  : `
                    <div class="parsed-variant">
                      <span>
                        Варианты не указаны
                      </span>
                    </div>
                  `
              }

            </div>

          </article>
        `
      );
    }
  );
}

async function importPriceList() {
  if (!state.parsedProducts.length) {
    showToast(
      "Сначала разберите прайс",
      "error"
    );

    return;
  }

  const button =
    $("importPriceListButton");

  button.disabled = true;
  button.textContent =
    "Импорт…";

  try {
    const data =
      await api(
        "/api/admin/ai/import",
        {
          method: "POST",
          body: JSON.stringify({
            products:
              state.parsedProducts
          })
        }
      );

    const count =
      data.imported ??
      data.count ??
      state.parsedProducts.length;

    setPriceListStatus(
      `Импортировано товаров: ${count}`,
      "success"
    );

    showToast(
      "Прайс импортирован",
      "success"
    );

    await loadCategories();
    await loadProducts();

  } catch (error) {
    console.error(error);

    setPriceListStatus(
      `Ошибка импорта: ${error.message}`,
      "error"
    );

    showToast(
      "Не удалось импортировать прайс",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent =
      "Импортировать";
  }
}

/* =========================================================
   STATS
========================================================= */

function updateStats() {
  const products =
    state.products.filter(
      (product) =>
        product.active !== 0 &&
        product.active !== false
    );

  const variants =
    state.products.reduce(
      (total, product) =>
        total +
        (
          Array.isArray(product.variants)
            ? product.variants.length
            : 0
        ),
      0
    );

  const orders =
    state.orders.length;

  if ($("statProducts")) {
    $("statProducts").textContent =
      products.length;
  }

  if ($("statVariants")) {
    $("statVariants").textContent =
      variants;
  }

  if ($("statOrders")) {
    $("statOrders").textContent =
      orders;
  }
}

/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {

  $("backToStore")
    ?.addEventListener(
      "click",
      openStore
    );

  $("backToStoreDenied")
    ?.addEventListener(
      "click",
      openStore
    );

  $("refreshButton")
    ?.addEventListener(
      "click",
      async () => {
        await Promise.all([
          loadProducts(),
          loadCategories(),
          loadOrders(),
          loadPromos()
        ]);

        showToast(
          "Данные обновлены",
          "success"
        );
      }
    );


  /* TABS */

  document
    .querySelectorAll(".admin-tab")
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          setActiveTab(
            button.dataset.tab
          );
        }
      );
    });


  /* PRODUCTS */

  $("addProductButton")
    ?.addEventListener(
      "click",
      () => openProductModal()
    );

  $("emptyAddProduct")
    ?.addEventListener(
      "click",
      () => openProductModal()
    );

  $("productSearch")
    ?.addEventListener(
      "input",
      (event) => {
        state.productSearch =
          event.target.value;

        renderProducts();
      }
    );

  $("clearProductSearch")
    ?.addEventListener(
      "click",
      () => {
        $("productSearch").value = "";
        state.productSearch = "";
        renderProducts();
      }
    );


  /* PRODUCT MODAL */

  $("closeProductModal")
    ?.addEventListener(
      "click",
      closeProductModal
    );

  $("cancelProductButton")
    ?.addEventListener(
      "click",
      closeProductModal
    );

  $("deleteProductButton")
    ?.addEventListener(
      "click",
      deleteProduct
    );

  $("addVariantButton")
    ?.addEventListener(
      "click",
      () => addVariantRow()
    );

  $("productForm")
    ?.addEventListener(
      "submit",
      saveProduct
    );

  $("productImageInput")
    ?.addEventListener(
      "change",
      async (event) => {

        const file =
          event.target.files?.[0];

        if (!file) return;

        const reader =
          new FileReader();

        reader.onload = () => {
          $("productImagePreview").innerHTML = `
            <img
              src="${reader.result}"
              alt=""
            >
          `;
        };

        reader.readAsDataURL(file);

        try {
          showToast(
            "Загружаем изображение…"
          );

          state.uploadedImageId =
            await uploadProductImage(
              file
            );

          showToast(
            "Изображение загружено",
            "success"
          );

        } catch (error) {
          console.error(error);

          state.uploadedImageId = null;

          showToast(
            `Ошибка загрузки: ${error.message}`,
            "error"
          );
        }
      }
    );


  /* CATEGORIES */

  $("addCategoryButton")
    ?.addEventListener(
      "click",
      () => openCategoryModal()
    );

  $("closeCategoryModal")
    ?.addEventListener(
      "click",
      closeCategoryModal
    );

  $("cancelCategoryButton")
    ?.addEventListener(
      "click",
      closeCategoryModal
    );

  $("deleteCategoryButton")
    ?.addEventListener(
      "click",
      deleteCategory
    );

  $("categoryForm")
    ?.addEventListener(
      "submit",
      saveCategory
    );

  $("categoryNameInput")
    ?.addEventListener(
      "input",
      () => {
        const slugInput =
          $("categorySlugInput");

        if (
          !slugInput.value ||
          slugInput.dataset.auto === "true"
        ) {
          slugInput.value =
            slugify(
              $("categoryNameInput")
                .value
            );

          slugInput.dataset.auto =
            "true";
        }
      }
    );

  $("categorySlugInput")
    ?.addEventListener(
      "input",
      () => {
        $("categorySlugInput")
          .dataset.auto = "false";
      }
    );


  /* ORDERS */

  $("refreshOrdersButton")
    ?.addEventListener(
      "click",
      loadOrders
    );

  document
    .querySelectorAll(
      ".order-filter"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {

          document
            .querySelectorAll(
              ".order-filter"
            )
            .forEach((item) =>
              item.classList.remove(
                "active"
              )
            );

          button.classList.add(
            "active"
          );

          state.currentOrderFilter =
            button.dataset.orderFilter ||
            "all";

          renderOrders();
        }
      );
    });


  /* PROMO */

  $("addPromoButton")
    ?.addEventListener(
      "click",
      openPromoModal
    );

  $("promoAIButton")
    ?.addEventListener(
      "click",
      () => {
        setActiveTab("ai");
      }
    );

  $("closePromoModal")
    ?.addEventListener(
      "click",
      closePromoModal
    );

  $("cancelPromoButton")
    ?.addEventListener(
      "click",
      closePromoModal
    );

  $("promoForm")
    ?.addEventListener(
      "submit",
      savePromo
    );


  /* AI */

  $("aiChatForm")
    ?.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const input =
          $("aiChatInput");

        const text =
          input.value.trim();

        if (!text) return;

        input.value = "";

        await sendAIMessage(
          text
        );
      }
    );

  document
    .querySelectorAll(
      ".ai-example"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const input =
            $("aiChatInput");

          input.value =
            button.dataset.aiExample ||
            "";

          input.focus();
        }
      );
    });

  document
    .querySelectorAll(
      ".command-card"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        async () => {
          setActiveTab("ai");

          await sendAIMessage(
            button.dataset.aiCommand ||
            ""
          );
        }
      );
    });


  $("parsePriceListButton")
    ?.addEventListener(
      "click",
      parsePriceList
    );

  $("importPriceListButton")
    ?.addEventListener(
      "click",
      importPriceList
    );


  /* MODAL OVERLAYS */

  document
    .querySelectorAll(
      ".admin-modal-overlay"
    )
    .forEach((overlay) => {
      overlay.addEventListener(
        "click",
        () => {
          overlay
            .closest(".admin-modal")
            ?.classList.add(
              "hidden"
            );

          document.body.classList.remove(
            "modal-open"
          );
        }
      );
    });


  /* ESC */

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "Escape") {
        return;
      }

      document
        .querySelectorAll(
          ".admin-modal:not(.hidden)"
        )
        .forEach((modal) => {
          modal.classList.add(
            "hidden"
          );
        });

      document.body.classList.remove(
        "modal-open"
      );
    }
  );
}

/* =========================================================
   INIT
========================================================= */

async function init() {
  bindEvents();

  const allowed =
    await checkAccess();

  if (!allowed) {
    return;
  }

  try {
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadOrders(),
      loadPromos()
    ]);
  } catch (error) {
    console.error(error);
  }

  setActiveTab(
    "products"
  );
}

init();