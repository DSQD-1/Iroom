const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

/* =========================================================
   STATE
========================================================= */

let adminUser = null;

let products = [];
let categories = [];
let orders = [];

let editingProduct = null;
let editingCategory = null;

let parsedPriceList = null;

let currentOrderFilter = "all";
let productSearch = "";

/* =========================================================
   DOM
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];

/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
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
    headers["x-telegram-init-data"] =
      initData;
  }

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
        `HTTP ${response.status}`
    );
  }

  return data;
}

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(
  value,
  currency = "RUB"
) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) {
    return "—";
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

  return `${new Intl.NumberFormat(
    "ru-RU"
  ).format(amount)} ${symbol}`;
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

function toast(
  message,
  type = "normal"
) {
  const element =
    $("#adminToast");

  if (!element) {
    return;
  }

  element.textContent =
    message;

  element.className =
    `admin-toast show ${type}`;

  clearTimeout(
    toast.timer
  );

  toast.timer =
    setTimeout(() => {
      element.className =
        "admin-toast";
    }, 3000);
}

function setLoading(
  visible
) {
  const loading =
    $("#adminLoading");

  if (!loading) {
    return;
  }

  loading.style.display =
    visible ? "flex" : "none";
}

function showDenied() {
  const loading =
    $("#adminLoading");

  const denied =
    $("#adminDenied");

  const app =
    $("#adminApp");

  if (loading) {
    loading.style.display =
      "none";
  }

  if (denied) {
    denied.style.display =
      "flex";
  }

  if (app) {
    app.style.display =
      "none";
  }
}

function showAdminApp() {
  const loading =
    $("#adminLoading");

  const denied =
    $("#adminDenied");

  const app =
    $("#adminApp");

  if (loading) {
    loading.style.display =
      "none";
  }

  if (denied) {
    denied.style.display =
      "none";
  }

  if (app) {
    app.style.display =
      "block";
  }
}

/* =========================================================
   ADMIN AUTH
========================================================= */

async function checkAdmin() {
  try {
    const data =
      await api(
        "/api/admin/me"
      );

    if (!data.ok) {
      throw new Error(
        data.error ||
          "Access denied"
      );
    }

    adminUser =
      data.admin || null;

    showAdminApp();

    return true;
  } catch (error) {
    console.error(
      "Admin auth error:",
      error
    );

    showDenied();

    return false;
  }
}

/* =========================================================
   TABS
========================================================= */

function setupTabs() {
  const tabs =
    $$("[data-tab]");

  tabs.forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const tab =
          button.dataset.tab;

        tabs.forEach(
          (item) => {
            item.classList.toggle(
              "active",
              item === button
            );
          }
        );

        $$(".admin-tab-panel")
          .forEach((panel) => {
            panel.classList.toggle(
              "active",
              panel.dataset.panel ===
                tab
            );
          });

        if (tab === "products") {
          loadProducts();
        }

        if (tab === "categories") {
          loadCategories();
        }

        if (tab === "orders") {
          loadOrders();
        }

        if (tab === "promo") {
          loadPromo();
        }
      }
    );
  });
}

/* =========================================================
   STATS
========================================================= */

function updateStats() {
  const productCount =
    $("#statProducts");

  const variantCount =
    $("#statVariants");

  const orderCount =
    $("#statOrders");

  if (productCount) {
    productCount.textContent =
      products.length;
  }

  if (variantCount) {
    variantCount.textContent =
      products.reduce(
        (sum, product) =>
          sum +
          (product.variants?.length ||
            0),
        0
      );
  }

  if (orderCount) {
    orderCount.textContent =
      orders.length;
  }
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
      Array.isArray(
        data.products
      )
        ? data.products
        : [];

    renderProducts();
    updateStats();
  } catch (error) {
    console.error(
      "Products error:",
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
  const grid =
    $("#productsGrid");

  const empty =
    $("#productsEmpty");

  if (!grid) {
    return;
  }

  const query =
    productSearch
      .trim()
      .toLowerCase();

  const filtered =
    products.filter(
      (product) => {
        if (!query) {
          return true;
        }

        const haystack = [
          product.name,
          product.description,
          product.category_name,
          product.category_slug,
          ...(product.variants || []).flatMap(
            (variant) => [
              variant.memory,
              variant.color,
              variant.country,
              variant.sim_type
            ]
          )
        ]
          .join(" ")
          .toLowerCase();

        return haystack.includes(
          query
        );
      }
    );

  if (!filtered.length) {
    grid.innerHTML = "";

    if (empty) {
      empty.style.display =
        "flex";
    }

    return;
  }

  if (empty) {
    empty.style.display =
      "none";
  }

  grid.innerHTML =
    filtered
      .map(
        (product) =>
          productCard(product)
      )
      .join("");

  grid
    .querySelectorAll(
      "[data-edit-product]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset
              .editProduct;

          openProductModal(id);
        }
      );
    });

  grid
    .querySelectorAll(
      "[data-delete-product]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset
              .deleteProduct;

          deleteProduct(id);
        }
      );
    });
}

function productCard(
  product
) {
  const variants =
    Array.isArray(
      product.variants
    )
      ? product.variants
      : [];

  const activeVariants =
    variants.filter(
      (variant) =>
        variant.active
    );

  const firstPrice =
    activeVariants.length
      ? activeVariants[0]
      : variants[0];

  const image =
    product.image_url
      ? product.image_url
      : product.image_id
      ? `/api/images/${product.image_id}`
      : "";

  return `
    <article class="admin-product-card">
      <div class="admin-product-image">
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
              <div class="admin-product-image-empty">
                IRoom
              </div>
            `
        }

        ${
          product.is_new
            ? `
              <span class="admin-badge new">
                Новинка
              </span>
            `
            : ""
        }

        ${
          !product.active
            ? `
              <span class="admin-badge inactive">
                Выкл.
              </span>
            `
            : ""
        }
      </div>

      <div class="admin-product-content">
        <div class="admin-product-category">
          ${escapeHtml(
            product.category_name ||
              "Без категории"
          )}
        </div>

        <h3>
          ${escapeHtml(
            product.name
          )}
        </h3>

        <div class="admin-product-meta">
          ${
            variants.length
          } ${
            variants.length === 1
              ? "вариант"
              : variants.length < 5
              ? "варианта"
              : "вариантов"
          }
        </div>

        <div class="admin-product-price">
          ${
            firstPrice
              ? formatPrice(
                  firstPrice.price,
                  firstPrice.currency
                )
              : "Цена не указана"
          }
        </div>

        <div class="admin-product-actions">
          <button
            type="button"
            class="admin-button secondary"
            data-edit-product="${escapeHtml(
              product.id
            )}"
          >
            Изменить
          </button>

          <button
            type="button"
            class="admin-button danger"
            data-delete-product="${escapeHtml(
              product.id
            )}"
          >
            Удалить
          </button>
        </div>
      </div>
    </article>
  `;
}

function openProductModal(
  productId = ""
) {
  const modal =
    $("#productModal");

  const form =
    $("#productForm");

  if (!modal || !form) {
    return;
  }

  editingProduct =
    products.find(
      (product) =>
        String(product.id) ===
        String(productId)
    ) || null;

  form.reset();

  const idInput =
    $("#productId");

  if (idInput) {
    idInput.value =
      editingProduct?.id || "";
  }

  const nameInput =
    $("#productNameInput");

  const categoryInput =
    $("#productCategoryInput");

  const descriptionInput =
    $("#productDescriptionInput");

  const newInput =
    $("#productNewInput");

  const activeInput =
    $("#productActiveInput");

  if (editingProduct) {
    if (nameInput) {
      nameInput.value =
        editingProduct.name ||
        "";
    }

    if (categoryInput) {
      categoryInput.value =
        editingProduct.category_id ||
        "";
    }

    if (descriptionInput) {
      descriptionInput.value =
        editingProduct.description ||
        "";
    }

    if (newInput) {
      newInput.checked =
        !!editingProduct.is_new;
    }

    if (activeInput) {
      activeInput.checked =
        editingProduct.active !==
        false;
    }

    renderProductImage(
      editingProduct
    );

    renderVariants(
      editingProduct.variants ||
        []
    );
  } else {
    if (newInput) {
      newInput.checked =
        false;
    }

    if (activeInput) {
      activeInput.checked =
        true;
    }

    renderProductImage(
      null
    );

    renderVariants([
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
    ]);
  }

  populateCategorySelect();

  modal.classList.add(
    "open"
  );
}

function closeProductModal() {
  const modal =
    $("#productModal");

  if (modal) {
    modal.classList.remove(
      "open"
    );
  }

  editingProduct =
    null;
}

function renderProductImage(
  product
) {
  const preview =
    $("#productImagePreview");

  if (!preview) {
    return;
  }

  const image =
    product?.image_url
      ? product.image_url
      : product?.image_id
      ? `/api/images/${product.image_id}`
      : "";

  if (!image) {
    preview.innerHTML = `
      <div class="image-preview-empty">
        Выберите изображение
      </div>
    `;

    return;
  }

  preview.innerHTML = `
    <img
      src="${escapeHtml(
        image
      )}"
      alt=""
    >
  `;
}

async function uploadProductImage(
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

  const data =
    await api(
      "/api/admin/upload",
      {
        method: "POST",
        body: formData
      }
    );

  return data;
}

function renderVariants(
  variants
) {
  const container =
    $("#variantsContainer");

  if (!container) {
    return;
  }

  const list =
    Array.isArray(variants)
      ? variants
      : [];

  container.innerHTML =
    list
      .map(
        (
          variant,
          index
        ) =>
          variantRow(
            variant,
            index
          )
      )
      .join("");

  bindVariantEvents();
}

function variantRow(
  variant,
  index
) {
  return `
    <div
      class="admin-variant-row"
      data-variant-row="${index}"
    >
      <div class="admin-variant-head">
        <strong>
          Вариант ${index + 1}
        </strong>

        <button
          type="button"
          class="admin-icon-button danger"
          data-remove-variant="${index}"
          aria-label="Удалить вариант"
        >
          ×
        </button>
      </div>

      <div class="admin-variant-grid">
        <label>
          <span>Память</span>
          <input
            type="text"
            data-variant-field="memory"
            value="${escapeHtml(
              variant.memory || ""
            )}"
            placeholder="512 GB"
          >
        </label>

        <label>
          <span>Цвет</span>
          <input
            type="text"
            data-variant-field="color"
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
            data-variant-field="country"
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
            data-variant-field="sim_type"
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
            min="0"
            step="1"
            data-variant-field="price"
            value="${Number(
              variant.price || 0
            )}"
          >
        </label>

        <label>
          <span>Валюта</span>
          <select
            data-variant-field="currency"
          >
            <option
              value="RUB"
              ${
                variant.currency ===
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
                variant.currency ===
                "USD"
                  ? "selected"
                  : ""
              }
            >
              USD $
            </option>

            <option
              value="EUR"
              ${
                variant.currency ===
                "EUR"
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
            min="0"
            step="1"
            data-variant-field="stock"
            value="${Number(
              variant.stock || 0
            )}"
          >
        </label>

        <label class="admin-switch-field">
          <span>Активен</span>

          <input
            type="checkbox"
            data-variant-field="active"
            ${
              variant.active !==
              false
                ? "checked"
                : ""
            }
          >

          <i></i>
        </label>
      </div>
    </div>
  `;
}

function bindVariantEvents() {
  $$(
    "[data-remove-variant]"
  ).forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const index =
          Number(
            button.dataset
              .removeVariant
          );

        removeVariant(index);
      }
    );
  });
}

function removeVariant(
  index
) {
  const container =
    $("#variantsContainer");

  if (!container) {
    return;
  }

  const rows =
    $$(
      "[data-variant-row]"
    );

  if (rows.length <= 1) {
    toast(
      "У товара должен остаться хотя бы один вариант",
      "error"
    );

    return;
  }

  rows[index]?.remove();

  renumberVariantRows();
}

function renumberVariantRows() {
  const rows =
    $$(
      "[data-variant-row]"
    );

  rows.forEach(
    (row, index) => {
      row.dataset.variantRow =
        index;

      const title =
        row.querySelector(
          ".admin-variant-head strong"
        );

      if (title) {
        title.textContent =
          `Вариант ${index + 1}`;
      }

      const remove =
        row.querySelector(
          "[data-remove-variant]"
        );

      if (remove) {
        remove.dataset.removeVariant =
          index;
      }
    }
  );
}

function collectVariants() {
  const rows =
    $$(
      "[data-variant-row]"
    );

  return rows.map(
    (row) => {
      const get =
        (field) =>
          row.querySelector(
            `[data-variant-field="${field}"]`
          );

      return {
        memory:
          get("memory")
            ?.value
            ?.trim() || "",

        color:
          get("color")
            ?.value
            ?.trim() || "",

        country:
          get("country")
            ?.value
            ?.trim() || "",

        sim_type:
          get("sim_type")
            ?.value
            ?.trim() || "",

        price:
          Number(
            get("price")
              ?.value || 0
          ),

        currency:
          get("currency")
            ?.value ||
          "RUB",

        stock:
          Math.max(
            0,
            Math.floor(
              Number(
                get("stock")
                  ?.value || 0
              )
            )
          ),

        active:
          !!get("active")
            ?.checked
      };
    }
  );
}

async function saveProduct(
  event
) {
  event.preventDefault();

  const form =
    $("#productForm");

  if (!form) {
    return;
  }

  const id =
    $("#productId")
      ?.value
      ?.trim() || "";

  const name =
    $("#productNameInput")
      ?.value
      ?.trim() || "";

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

  const imageInput =
    $("#productImageInput");

  let imageId =
    editingProduct?.image_id ||
    "";

  let imageUrl =
    editingProduct?.image_url ||
    "";

  try {
    if (
      imageInput?.files?.length
    ) {
      toast(
        "Загружаем изображение..."
      );

      const uploaded =
        await uploadProductImage(
          imageInput.files[0]
        );

      imageId =
        uploaded.id || "";

      imageUrl =
        uploaded.image_url ||
        uploaded.url ||
        "";
    }

    const body = {
      name,

      category_id:
        $("#productCategoryInput")
          ?.value || "",

      description:
        $("#productDescriptionInput")
          ?.value
          ?.trim() || "",

      image_id:
        imageId,

      image_url:
        imageUrl,

      is_new:
        !!$("#productNewInput")
          ?.checked,

      active:
        $("#productActiveInput")
          ?.$
          ? false
          : true,

      variants
    };

    body.active =
      $("#productActiveInput")
        ?.checked !== false;

    const endpoint =
      id
        ? `/api/admin/products/${encodeURIComponent(
            id
          )}`
        : "/api/admin/products";

    const method =
      id ? "PUT" : "POST";

    await api(
      endpoint,
      {
        method,
        body: JSON.stringify(
          body
        )
      }
    );

    toast(
      id
        ? "Товар обновлён"
        : "Товар создан",
      "success"
    );

    closeProductModal();

    await loadProducts();
  } catch (error) {
    console.error(
      "Save product error:",
      error
    );

    toast(
      error.message ||
        "Не удалось сохранить товар",
      "error"
    );
  }
}

async function deleteProduct(
  productId
) {
  const product =
    products.find(
      (item) =>
        String(item.id) ===
        String(productId)
    );

  if (!product) {
    return;
  }

  const confirmed =
    window.confirm(
      `Удалить товар «${product.name}»?\n\nВсе его варианты также будут удалены.`
    );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      `/api/admin/products/${encodeURIComponent(
        productId
      )}`,
      {
        method: "DELETE"
      }
    );

    toast(
      "Товар удалён",
      "success"
    );

    await loadProducts();
  } catch (error) {
    console.error(
      "Delete product error:",
      error
    );

    toast(
      error.message ||
        "Не удалось удалить товар",
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
      Array.isArray(
        data.categories
      )
        ? data.categories
        : [];

    renderCategories();
    populateCategorySelect();
  } catch (error) {
    console.error(
      "Categories error:",
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

  if (!categories.length) {
    grid.innerHTML = "";

    if (empty) {
      empty.style.display =
        "flex";
    }

    return;
  }

  if (empty) {
    empty.style.display =
      "none";
  }

  grid.innerHTML =
    categories
      .map(
        (category) => `
          <article class="admin-category-card">
            <div>
              <div class="admin-category-name">
                ${escapeHtml(
                  category.name
                )}
              </div>

              <div class="admin-category-slug">
                ${escapeHtml(
                  category.slug
                )}
              </div>
            </div>

            <div class="admin-category-actions">
              <span class="admin-status ${
                category.active
                  ? "success"
                  : "muted"
              }">
                ${
                  category.active
                    ? "Активна"
                    : "Скрыта"
                }
              </span>

              <button
                type="button"
                class="admin-button secondary small"
                data-edit-category="${escapeHtml(
                  category.id
                )}"
              >
                Изменить
              </button>

              <button
                type="button"
                class="admin-button danger small"
                data-delete-category="${escapeHtml(
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

  grid
    .querySelectorAll(
      "[data-edit-category]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          openCategoryModal(
            button.dataset
              .editCategory
          );
        }
      );
    });

  grid
    .querySelectorAll(
      "[data-delete-category]"
    )
    .forEach((button) => {
      button.addEventListener(
        "click",
        () => {
          deleteCategory(
            button.dataset
              .deleteCategory
          );
        }
      );
    });
}

function populateCategorySelect() {
  const select =
    $("#productCategoryInput");

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
          <option
            value="${escapeHtml(
              category.id
            )}"
          >
            ${escapeHtml(
              category.name
            )}
          </option>
        `
      )
      .join("")}
  `;

  if (
    current &&
    categories.some(
      (category) =>
        String(
          category.id
        ) === String(current)
    )
  ) {
    select.value =
      current;
  }
}

function openCategoryModal(
  categoryId = ""
) {
  const modal =
    $("#categoryModal");

  const form =
    $("#categoryForm");

  if (!modal || !form) {
    return;
  }

  editingCategory =
    categories.find(
      (category) =>
        String(category.id) ===
        String(categoryId)
    ) || null;

  form.reset();

  const id =
    $("#categoryId");

  const name =
    $("#categoryNameInput");

  const slug =
    $("#categorySlugInput");

  const deleteButton =
    $("#deleteCategoryButton");

  if (id) {
    id.value =
      editingCategory?.id ||
      "";
  }

  if (name) {
    name.value =
      editingCategory?.name ||
      "";
  }

  if (slug) {
    slug.value =
      editingCategory?.slug ||
      "";
  }

  if (deleteButton) {
    deleteButton.style.display =
      editingCategory
        ? "inline-flex"
        : "none";
  }

  modal.classList.add(
    "open"
  );
}

function closeCategoryModal() {
  const modal =
    $("#categoryModal");

  if (modal) {
    modal.classList.remove(
      "open"
    );
  }

  editingCategory =
    null;
}

async function saveCategory(
  event
) {
  event.preventDefault();

  const id =
    $("#categoryId")
      ?.value
      ?.trim() || "";

  const name =
    $("#categoryNameInput")
      ?.value
      ?.trim() || "";

  const slug =
    $("#categorySlugInput")
      ?.value
      ?.trim() || "";

  if (!name) {
    toast(
      "Введите название категории",
      "error"
    );

    return;
  }

  try {
    const endpoint =
      id
        ? `/api/admin/categories/${encodeURIComponent(
            id
          )}`
        : "/api/admin/categories";

    await api(
      endpoint,
      {
        method: id
          ? "PUT"
          : "POST",
        body: JSON.stringify({
          name,
          slug
        })
      }
    );

    toast(
      id
        ? "Категория обновлена"
        : "Категория создана",
      "success"
    );

    closeCategoryModal();

    await loadCategories();
    await loadProducts();
  } catch (error) {
    console.error(
      "Save category error:",
      error
    );

    toast(
      error.message ||
        "Не удалось сохранить категорию",
      "error"
    );
  }
}

async function deleteCategory(
  categoryId
) {
  const category =
    categories.find(
      (item) =>
        String(item.id) ===
        String(categoryId)
    );

  if (!category) {
    return;
  }

  const confirmed =
    window.confirm(
      `Удалить категорию «${category.name}»?`
    );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      `/api/admin/categories/${encodeURIComponent(
        categoryId
      )}`,
      {
        method: "DELETE"
      }
    );

    toast(
      "Категория удалена",
      "success"
    );

    await loadCategories();
    await loadProducts();
  } catch (error) {
    console.error(
      "Delete category error:",
      error
    );

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

    orders =
      Array.isArray(
        data.orders
      )
        ? data.orders
        : [];

    renderOrders();
    updateStats();
  } catch (error) {
    console.error(
      "Orders error:",
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

  let filtered =
    [...orders];

  if (
    currentOrderFilter !==
    "all"
  ) {
    filtered =
      filtered.filter(
        (order) =>
          String(
            order.status
          ) ===
          currentOrderFilter
      );
  }

  if (!filtered.length) {
    list.innerHTML = "";

    if (empty) {
      empty.style.display =
        "flex";
    }

    return;
  }

  if (empty) {
    empty.style.display =
      "none";
  }

  list.innerHTML =
    filtered
      .map(
        (order) =>
          orderCard(order)
      )
      .join("");
}

function orderCard(order) {
  const status =
    String(
      order.status || "new"
    );

  const statusNames = {
    new: "Новый",
    processing:
      "В обработке",
    completed:
      "Завершён",
    cancelled:
      "Отменён"
  };

  return `
    <article class="admin-order-card">
      <div class="admin-order-head">
        <div>
          <div class="admin-order-id">
            ${escapeHtml(
              order.id
            )}
          </div>

          <div class="admin-order-date">
            ${escapeHtml(
              formatDate(
                order.created_at
              )
            )}
          </div>
        </div>

        <span class="admin-status ${escapeHtml(
          status
        )}">
          ${escapeHtml(
            statusNames[
              status
            ] ||
              status
          )}
        </span>
      </div>

      <div class="admin-order-body">
        <h3>
          ${escapeHtml(
            order.product_name ||
              "Товар"
          )}
        </h3>

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

        <div class="admin-order-price">
          ${escapeHtml(
            formatPrice(
              order.price,
              order.currency
            )
          )}
        </div>

        <div class="admin-order-customer">
          ${
            order.customer_name
              ? escapeHtml(
                  order.customer_name
                )
              : "Без имени"
          }

          ${
            order.username
              ? `
                · @${escapeHtml(
                  order.username
                )}
              `
              : ""
          }

          <br>

          Telegram ID:
          ${escapeHtml(
            order.telegram_id ||
              "—"
          )}
        </div>
      </div>
    </article>
  `;
}

function setupOrderFilters() {
  $$(
    "[data-order-filter]"
  ).forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        currentOrderFilter =
          button.dataset
            .orderFilter ||
          "all";

        $$(
          "[data-order-filter]"
        ).forEach(
          (item) => {
            item.classList.toggle(
              "active",
              item === button
            );
          }
        );

        renderOrders();
      }
    );
  });
}

/* =========================================================
   PROMO
========================================================= */

async function loadPromo() {
  const list =
    $("#promoList");

  const empty =
    $("#promoEmpty");

  if (!list) {
    return;
  }

  /*
    В текущем server.js нет
    отдельного GET /api/admin/promo.
    Поэтому загружаем промокоды
    через AI-контекст при необходимости.
  */

  try {
    const data =
      await api(
        "/api/admin/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message:
              "Покажи список всех существующих промокодов. Верни их названия, скидку, лимит использований и статус."
          })
        }
      );

    const message =
      data.message ||
      "Промокоды можно создавать через AI.";

    list.innerHTML = `
      <div class="admin-promo-info">
        <div class="admin-promo-info-title">
          Промокоды
        </div>

        <div class="admin-promo-info-text">
          ${escapeHtml(
            message
          )}
        </div>
      </div>
    `;

    if (empty) {
      empty.style.display =
        "none";
    }
  } catch (error) {
    console.error(
      "Promo load error:",
      error
    );

    list.innerHTML = `
      <div class="admin-promo-info">
        <div class="admin-promo-info-title">
          Управление промокодами
        </div>

        <div class="admin-promo-info-text">
          Создавайте промокоды через AI-команду.
        </div>
      </div>
    `;

    if (empty) {
      empty.style.display =
        "none";
    }
  }
}

function openPromoModal() {
  const modal =
    $("#promoModal");

  const form =
    $("#promoForm");

  if (!modal || !form) {
    return;
  }

  form.reset();

  const type =
    $("#promoTypeInput");

  if (type) {
    type.value =
      "percent";
  }

  modal.classList.add(
    "open"
  );
}

function closePromoModal() {
  const modal =
    $("#promoModal");

  if (modal) {
    modal.classList.remove(
      "open"
    );
  }
}

async function createPromo(
  event
) {
  event.preventDefault();

  const code =
    $("#promoCodeInput")
      ?.value
      ?.trim()
      ?.toUpperCase() ||
    "";

  const discountType =
    $("#promoTypeInput")
      ?.value ||
    "percent";

  const discountValue =
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

  if (
    !Number.isFinite(
      discountValue
    ) ||
    discountValue <= 0
  ) {
    toast(
      "Введите размер скидки",
      "error"
    );

    return;
  }

  try {
    /*
      В текущем API нет прямого
      POST /api/admin/promo.

      Используем существующий
      AI endpoint, который
      поддерживает create_promo.
    */

    const prompt =
      `Создай промокод ${code} со скидкой ${discountValue} ${
        discountType ===
        "percent"
          ? "процентов"
          : "рублей"
      }. Максимальное количество использований: ${maxUses}.`;

    const data =
      await api(
        "/api/admin/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message:
              prompt
          })
        }
      );

    toast(
      data.message ||
        "Промокод создан",
      "success"
    );

    closePromoModal();

    await loadPromo();
  } catch (error) {
    console.error(
      "Create promo error:",
      error
    );

    toast(
      error.message ||
        "Не удалось создать промокод",
      "error"
    );
  }
}

/* =========================================================
   ADMIN AI CHAT
========================================================= */

function addAIMessage(
  text,
  role = "assistant"
) {
  const messages =
    $("#aiMessages");

  if (!messages) {
    return;
  }

  const item =
    document.createElement(
      "div"
    );

  item.className =
    `ai-message ${role}`;

  item.innerHTML = `
    <div class="ai-message-bubble">
      ${escapeHtml(
        text
      ).replace(
        /\n/g,
        "<br>"
      )}
    </div>
  `;

  messages.appendChild(
    item
  );

  messages.scrollTop =
    messages.scrollHeight;
}

function setAISending(
  sending
) {
  const button =
    $("#aiSendButton");

  const input =
    $("#aiChatInput");

  if (button) {
    button.disabled =
      sending;

    button.textContent =
      sending
        ? "..."
        : "Отправить";
  }

  if (input) {
    input.disabled =
      sending;
  }
}

async function sendAIMessage(
  message
) {
  const text =
    String(message || "")
      .trim();

  if (!text) {
    return;
  }

  addAIMessage(
    text,
    "user"
  );

  setAISending(
    true
  );

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

    addAIMessage(
      data.message ||
        "Готово.",
      "assistant"
    );

    if (
      data.action
    ) {
      await Promise.all([
        loadProducts(),
        loadOrders()
      ]);
    }
  } catch (error) {
    console.error(
      "AI chat error:",
      error
    );

    addAIMessage(
      `Ошибка: ${
        error.message ||
        "AI недоступен"
      }`,
      "assistant"
    );
  } finally {
    setAISending(
      false
    );
  }
}

function setupAIChat() {
  const form =
    $("#aiChatForm");

  const input =
    $("#aiChatInput");

  if (form) {
    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        const message =
          input?.value || "";

        if (input) {
          input.value = "";
        }

        await sendAIMessage(
          message
        );
      }
    );
  }

  $$(
    "[data-ai-example]"
  ).forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const text =
          button.dataset
            .aiExample ||
          "";

        if (input) {
          input.value =
            text;

          input.focus();
        }
      }
    );
  });

  $$(
    "[data-ai-command]"
  ).forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        const text =
          button.dataset
            .aiCommand ||
          "";

        if (input) {
          input.value =
            text;

          input.focus();
        }
      }
    );
  });
}

/* =========================================================
   PRICE LIST AI
========================================================= */

async function parsePriceList() {
  const input =
    $("#priceListInput");

  const status =
    $("#priceListStatus");

  const preview =
    $("#priceListPreview");

  if (!input) {
    return;
  }

  const text =
    input.value.trim();

  if (!text) {
    toast(
      "Вставьте прайс-лист",
      "error"
    );

    return;
  }

  if (status) {
    status.textContent =
      "AI разбирает прайс-лист...";
  }

  if (preview) {
    preview.innerHTML =
      "";
  }

  const button =
    $("#parsePriceListButton");

  if (button) {
    button.disabled =
      true;
  }

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

    parsedPriceList =
      data;

    renderPriceListPreview(
      data
    );

    if (status) {
      status.textContent =
        `Найдено товаров: ${
          data.products
            ?.length || 0
        }`;
    }

    toast(
      "Прайс успешно разобран",
      "success"
    );
  } catch (error) {
    console.error(
      "Price list parse error:",
      error
    );

    if (status) {
      status.textContent =
        error.message ||
        "Ошибка разбора";
    }

    toast(
      error.message ||
        "Не удалось разобрать прайс",
      "error"
    );
  } finally {
    if (button) {
      button.disabled =
        false;
    }
  }
}

function renderPriceListPreview(
  data
) {
  const preview =
    $("#priceListPreview");

  if (!preview) {
    return;
  }

  const list =
    Array.isArray(
      data?.products
    )
      ? data.products
      : [];

  if (!list.length) {
    preview.innerHTML = `
      <div class="admin-empty">
        Товары не найдены
      </div>
    `;

    return;
  }

  preview.innerHTML =
    list
      .map(
        (product) => `
          <div class="admin-price-product">
            <div class="admin-price-product-head">
              <strong>
                ${escapeHtml(
                  product.name
                )}
              </strong>

              <span>
                ${
                  product.variants
                    ?.length || 0
                } вар.
              </span>
            </div>

            ${
              product.category
                ? `
                  <div class="admin-price-category">
                    ${escapeHtml(
                      product.category
                    )}
                  </div>
                `
                : ""
            }

            <div class="admin-price-variants">
              ${
                (
                  product.variants ||
                  []
                )
                  .map(
                    (variant) => `
                      <div class="admin-price-variant">
                        <span>
                          ${escapeHtml(
                            [
                              variant.memory,
                              variant.color,
                              variant.country,
                              variant.sim_type
                            ]
                              .filter(
                                Boolean
                              )
                              .join(
                                " · "
                              ) ||
                              "Без параметров"
                          )}
                        </span>

                        <strong>
                          ${escapeHtml(
                            formatPrice(
                              variant.price,
                              variant.currency
                            )
                          )}
                        </strong>
                      </div>
                    `
                  )
                  .join("")
              }
            </div>
          </div>
        `
      )
      .join("");
}

async function importPriceList() {
  if (
    !parsedPriceList ||
    !Array.isArray(
      parsedPriceList.products
    ) ||
    !parsedPriceList.products
      .length
  ) {
    toast(
      "Сначала разберите прайс",
      "error"
    );

    return;
  }

  const confirmed =
    window.confirm(
      `Импортировать ${parsedPriceList.products.length} товаров в каталог?`
    );

  if (!confirmed) {
    return;
  }

  const button =
    $("#importPriceListButton");

  if (button) {
    button.disabled =
      true;
  }

  try {
    const data =
      await api(
        "/api/admin/ai/import",
        {
          method: "POST",
          body: JSON.stringify({
            products:
              parsedPriceList.products
          })
        }
      );

    toast(
      `Импортировано товаров: ${
        data.imported || 0
      }`,
      "success"
    );

    await loadCategories();
    await loadProducts();

    parsedPriceList =
      null;
  } catch (error) {
    console.error(
      "Price import error:",
      error
    );

    toast(
      error.message ||
        "Не удалось импортировать прайс",
      "error"
    );
  } finally {
    if (button) {
      button.disabled =
        false;
    }
  }
}

/* =========================================================
   REFRESH
========================================================= */

async function refreshAll() {
  try {
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadOrders()
    ]);

    toast(
      "Данные обновлены",
      "success"
    );
  } catch (error) {
    console.error(
      "Refresh error:",
      error
    );
  }
}

/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupProductEvents() {
  const add =
    $("#addProductButton");

  const emptyAdd =
    $("#emptyAddProduct");

  const search =
    $("#productSearch");

  const clear =
    $("#clearProductSearch");

  if (add) {
    add.addEventListener(
      "click",
      () =>
        openProductModal()
    );
  }

  if (emptyAdd) {
    emptyAdd.addEventListener(
      "click",
      () =>
        openProductModal()
    );
  }

  if (search) {
    search.addEventListener(
      "input",
      () => {
        productSearch =
          search.value || "";

        renderProducts();
      }
    );
  }

  if (clear) {
    clear.addEventListener(
      "click",
      () => {
        if (search) {
          search.value = "";
        }

        productSearch =
          "";

        renderProducts();
      }
    );
  }

  const close =
    $("#closeProductModal");

  const cancel =
    $("#cancelProductButton");

  if (close) {
    close.addEventListener(
      "click",
      closeProductModal
    );
  }

  if (cancel) {
    cancel.addEventListener(
      "click",
      closeProductModal
    );
  }

  const form =
    $("#productForm");

  if (form) {
    form.addEventListener(
      "submit",
      saveProduct
    );
  }

  const addVariant =
    $("#addVariantButton");

  if (addVariant) {
    addVariant.addEventListener(
      "click",
      () => {
        const current =
          collectVariants();

        current.push({
          memory: "",
          color: "",
          country: "",
          sim_type: "",
          price: 0,
          currency: "RUB",
          stock: 0,
          active: true
        });

        renderVariants(
          current
        );
      }
    );
  }

  const deleteButton =
    $("#deleteProductButton");

  if (deleteButton) {
    deleteButton.addEventListener(
      "click",
      () => {
        if (
          editingProduct
        ) {
          deleteProduct(
            editingProduct.id
          );

          closeProductModal();
        }
      }
    );
  }

  const imageInput =
    $("#productImageInput");

  if (imageInput) {
    imageInput.addEventListener(
      "change",
      () => {
        const file =
          imageInput.files?.[0];

        if (!file) {
          return;
        }

        const url =
          URL.createObjectURL(
            file
          );

        const preview =
          $("#productImagePreview");

        if (preview) {
          preview.innerHTML = `
            <img
              src="${url}"
              alt=""
            >
          `;
        }
      }
    );
  }
}

function setupCategoryEvents() {
  const add =
    $("#addCategoryButton");

  if (add) {
    add.addEventListener(
      "click",
      () =>
        openCategoryModal()
    );
  }

  const close =
    $("#closeCategoryModal");

  const cancel =
    $("#cancelCategoryButton");

  if (close) {
    close.addEventListener(
      "click",
      closeCategoryModal
    );
  }

  if (cancel) {
    cancel.addEventListener(
      "click",
      closeCategoryModal
    );
  }

  const form =
    $("#categoryForm");

  if (form) {
    form.addEventListener(
      "submit",
      saveCategory
    );
  }

  const deleteButton =
    $("#deleteCategoryButton");

  if (deleteButton) {
    deleteButton.addEventListener(
      "click",
      () => {
        if (
          editingCategory
        ) {
          deleteCategory(
            editingCategory.id
          );

          closeCategoryModal();
        }
      }
    );
  }

  const name =
    $("#categoryNameInput");

  const slug =
    $("#categorySlugInput");

  if (
    name &&
    slug
  ) {
    name.addEventListener(
      "input",
      () => {
        if (
          !editingCategory ||
          !slug.value.trim()
        ) {
          slug.value =
            slugify(
              name.value
            );
        }
      }
    );
  }
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(
      /[^a-zа-яё0-9]+/gi,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );
}

function setupOrderEvents() {
  const refresh =
    $("#refreshOrdersButton");

  if (refresh) {
    refresh.addEventListener(
      "click",
      loadOrders
    );
  }
}

function setupPromoEvents() {
  const add =
    $("#addPromoButton");

  const ai =
    $("#promoAIButton");

  if (add) {
    add.addEventListener(
      "click",
      openPromoModal
    );
  }

  if (ai) {
    ai.addEventListener(
      "click",
      () => {
        activateAITab();

        const input =
          $("#aiChatInput");

        if (input) {
          input.value =
            "Создай промокод IR10 со скидкой 10 процентов и лимитом 100 использований.";

          input.focus();
        }
      }
    );
  }

  const close =
    $("#closePromoModal");

  const cancel =
    $("#cancelPromoButton");

  if (close) {
    close.addEventListener(
      "click",
      closePromoModal
    );
  }

  if (cancel) {
    cancel.addEventListener(
      "click",
      closePromoModal
    );
  }

  const form =
    $("#promoForm");

  if (form) {
    form.addEventListener(
      "submit",
      createPromo
    );
  }
}

function setupPriceListEvents() {
  const parse =
    $("#parsePriceListButton");

  const importButton =
    $("#importPriceListButton");

  if (parse) {
    parse.addEventListener(
      "click",
      parsePriceList
    );
  }

  if (importButton) {
    importButton.addEventListener(
      "click",
      importPriceList
    );
  }
}

function activateAITab() {
  const tab =
    $(
      '[data-tab="ai"]'
    );

  if (tab) {
    tab.click();
  }
}

function setupGlobalEvents() {
  const refresh =
    $("#refreshButton");

  if (refresh) {
    refresh.addEventListener(
      "click",
      refreshAll
    );
  }

  const back =
    $("#backToStore");

  const backDenied =
    $("#backToStoreDenied");

  if (back) {
    back.addEventListener(
      "click",
      () => {
        window.location.href =
          "/";
      }
    );
  }

  if (backDenied) {
    backDenied.addEventListener(
      "click",
      () => {
        window.location.href =
          "/";
      }
    );
  }

  /*
    Закрытие модалок при клике
    по затемнению.
  */

  [
    "#productModal",
    "#categoryModal",
    "#promoModal"
  ].forEach(
    (selector) => {
      const modal =
        $(selector);

      if (!modal) {
        return;
      }

      modal.addEventListener(
        "click",
        (event) => {
          if (
            event.target ===
            modal
          ) {
            modal.classList.remove(
              "open"
            );
          }
        }
      );
    }
  );
}

/* =========================================================
   INITIALIZATION
========================================================= */

async function init() {
  setLoading(true);

  const authorized =
    await checkAdmin();

  if (!authorized) {
    return;
  }

  setupTabs();
  setupProductEvents();
  setupCategoryEvents();
  setupOrderEvents();
  setupPromoEvents();
  setupPriceListEvents();
  setupAIChat();
  setupOrderFilters();
  setupGlobalEvents();

  await Promise.all([
    loadProducts(),
    loadCategories(),
    loadOrders()
  ]);

  setLoading(false);
}

document.addEventListener(
  "DOMContentLoaded",
  init
);