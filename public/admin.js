const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#0b0b0d");
    tg.setBackgroundColor("#0b0b0d");
  } catch {}
}

/* =========================================================
   STATE
========================================================= */

const state = {
  products: [],
  categories: [],
  orders: [],
  currentProduct: null,
  currentCategory: null,
  parsedPriceList: null,
  activeTab: "products",
  orderFilter: "all"
};

/* =========================================================
   HELPERS
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];

function initData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const isFormData =
    options.body instanceof FormData;

  const headers = {
    "x-telegram-init-data": initData(),
    ...(isFormData
      ? {}
      : {
          "Content-Type":
            "application/json"
        }),
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
      data?.error ||
        data?.message ||
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

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function formatPrice(
  value,
  currency = "RUB"
) {
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

  return `${new Intl.NumberFormat(
    "ru-RU"
  ).format(amount)} ${symbol}`.trim();
}

function formatDate(value) {
  if (!value) {
    return "";
  }

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

function haptic(type = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred(type);
  } catch {}
}

function toast(
  message,
  type = "success"
) {
  const element =
    $("#adminToast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent =
    String(message || "");

  element.className =
    `admin-toast show ${type}`;

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    element.className =
      "admin-toast";
  }, 3000);
}

function show(element) {
  if (!element) return;

  element.hidden = false;
  element.style.display = "";
}

function hide(element) {
  if (!element) return;

  element.hidden = true;
}

function openModal(id) {
  const modal =
    document.getElementById(id);

  if (!modal) return;

  modal.hidden = false;

  document.body.classList.add(
    "modal-open"
  );
}

function closeModal(id) {
  const modal =
    document.getElementById(id);

  if (!modal) return;

  modal.hidden = true;

  document.body.classList.remove(
    "modal-open"
  );
}

/* =========================================================
   ACCESS
========================================================= */

async function checkAdmin() {
  const loading =
    $("#adminLoading");

  const denied =
    $("#adminDenied");

  const app =
    $("#adminApp");

  try {
    await api("/api/admin/me");

    hide(loading);
    hide(denied);
    show(app);

    await loadAll();
  } catch (error) {
    console.error(
      "Admin access error:",
      error
    );

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
      await api(
        "/api/admin/products"
      );

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
  const grid =
    $("#productsGrid");

  const empty =
    $("#productsEmpty");

  if (!grid) return;

  const search =
    normalizeSearch(
      $("#productSearch")?.value
    );

  let products =
    [...state.products];

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
        (event) => {
          if (
            event.target.closest("button") ||
            event.target.closest("a")
          ) {
            return;
          }

          editProduct(
            card.dataset.id
          );
        }
      );
    }
  );
}

function renderProductCard(
  product
) {
  const variants =
    Array.isArray(product.variants)
      ? product.variants
      : [];

  const activeVariants =
    variants.filter(
      (variant) =>
        variant.active !== false
    );

  const priceVariants =
    activeVariants.length
      ? activeVariants
      : variants;

  const prices =
    priceVariants
      .map((variant) =>
        Number(variant.price || 0)
      )
      .filter((price) =>
        Number.isFinite(price)
      );

  const minPrice =
    prices.length
      ? Math.min(...prices)
      : 0;

  const currency =
    priceVariants[0]?.currency ||
    variants[0]?.currency ||
    "RUB";

  const image =
    product.image_url ||
    (
      product.image_id
        ? `/api/images/${encodeURIComponent(
            product.image_id
          )}`
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

  const variantWord =
    variants.length === 1
      ? "вариант"
      : variants.length >= 2 &&
          variants.length <= 4
        ? "варианта"
        : "вариантов";

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
              ? `
                <span class="admin-badge new">
                  Новинка
                </span>
              `
              : ""
          }

          ${
            product.active
              ? `
                <span class="admin-badge active">
                  Активен
                </span>
              `
              : `
                <span class="admin-badge inactive">
                  Скрыт
                </span>
              `
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
          ${escapeHtml(
            product.name || "Без названия"
          )}
        </h3>

        <div class="admin-product-bottom">
          <strong>
            ${
              minPrice
                ? `от ${formatPrice(
                    minPrice,
                    currency
                  )}`
                : "Цена не указана"
            }
          </strong>

          <span>
            ${variants.length}
            ${variantWord}
          </span>
        </div>
      </div>
    </article>
  `;
}

async function editProduct(id) {
  if (!id) return;

  try {
    const data =
      await api(
        `/api/admin/products/${encodeURIComponent(
          id
        )}`
      );

    state.currentProduct =
      data.product || null;

    openProductModal(
      data.product || null
    );
  } catch (error) {
    toast(
      error.message ||
        "Не удалось открыть товар",
      "error"
    );
  }
}

/* =========================================================
   PRODUCT MODAL
========================================================= */

function openProductModal(
  product = null
) {
  const form =
    $("#productForm");

  if (!form) return;

  form.reset();

  state.currentProduct =
    product;

  const idInput =
    $("#productId");

  if (idInput) {
    idInput.value =
      product?.id || "";
  }

  const nameInput =
    $("#productNameInput");

  if (nameInput) {
    nameInput.value =
      product?.name || "";
  }

  const descriptionInput =
    $("#productDescriptionInput");

  if (descriptionInput) {
    descriptionInput.value =
      product?.description || "";
  }

  const newInput =
    $("#productNewInput");

  if (newInput) {
    newInput.checked =
      Boolean(product?.is_new);
  }

  const activeInput =
    $("#productActiveInput");

  if (activeInput) {
    activeInput.checked =
      product
        ? product.active !== false
        : true;
  }

  const imageInput =
    $("#productImageInput");

  if (imageInput) {
    imageInput.value = "";

    imageInput.dataset.imageId =
      product?.image_id || "";

    imageInput.dataset.imageUrl =
      product?.image_url || "";
  }

  const preview =
    $("#productImagePreview");

  if (preview) {
    const image =
      product?.image_url ||
      (
        product?.image_id
          ? `/api/images/${encodeURIComponent(
              product.image_id
            )}`
          : ""
      );

    if (image) {
      preview.src = image;
      preview.hidden = false;
    } else {
      preview.removeAttribute(
        "src"
      );
      preview.hidden = true;
    }
  }

  renderCategorySelect(
    product?.category_id || ""
  );

  const variants =
    Array.isArray(product?.variants) &&
    product.variants.length
      ? product.variants
      : [
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
        ];

  renderVariants(variants);

  const deleteButton =
    $("#deleteProductButton");

  if (deleteButton) {
    deleteButton.hidden =
      !product?.id;
  }

  openModal(
    "productModal"
  );
}

function renderCategorySelect(
  selectedId = ""
) {
  const select =
    $("#productCategoryInput");

  if (!select) return;

  select.innerHTML = `
    <option value="">
      Без категории
    </option>

    ${state.categories
      .map(
        (category) => `
          <option
            value="${escapeHtml(
              category.id
            )}"
            ${
              String(category.id) ===
              String(selectedId)
                ? "selected"
                : ""
            }
          >
            ${escapeHtml(
              category.name
            )}
          </option>
        `
      )
      .join("")}
  `;
}

function renderVariants(
  variants
) {
  const container =
    $("#variantsContainer");

  if (!container) return;

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
  const currency =
    variant.currency || "RUB";

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
          title="Удалить вариант"
        >
          ×
        </button>
      </div>

      <div class="variant-grid">

        <label class="variant-field">
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

        <label class="variant-field">
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

        <label class="variant-field">
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

        <label class="variant-field">
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

        <label class="variant-field">
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

        <label class="variant-field">
          <span>Валюта</span>

          <select class="variant-currency">

            <option
              value="RUB"
              ${
                currency === "RUB"
                  ? "selected"
                  : ""
              }
            >
              RUB ₽
            </option>

            <option
              value="USD"
              ${
                currency === "USD"
                  ? "selected"
                  : ""
              }
            >
              USD $
            </option>

            <option
              value="EUR"
              ${
                currency === "EUR"
                  ? "selected"
                  : ""
              }
            >
              EUR €
            </option>

          </select>
        </label>

        <label class="variant-field">
          <span>Остаток</span>

          <input
            type="number"
            class="variant-stock"
            min="0"
            step="1"
            value="${Math.max(
              0,
              Math.floor(
                Number(
                  variant.stock || 0
                )
              )
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

          if (!row) return;

          row.remove();

          renumberVariants();

          haptic("light");
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
  return $$(".variant-row").map(
    (row) => {
      const price =
        Number(
          row.querySelector(
            ".variant-price"
          )?.value || 0
        );

      const stock =
        Number(
          row.querySelector(
            ".variant-stock"
          )?.value || 0
        );

      return {
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

        price:
          Number.isFinite(price) &&
          price >= 0
            ? price
            : 0,

        currency:
          row.querySelector(
            ".variant-currency"
          )?.value || "RUB",

        stock:
          Number.isFinite(stock) &&
          stock >= 0
            ? Math.floor(stock)
            : 0,

        active:
          row.querySelector(
            ".variant-active"
          )?.checked !== false
      };
    }
  );
}

async function saveProductFromForm(
  event
) {
  event.preventDefault();

  const id =
    $("#productId")
      ?.value.trim() || "";

  const name =
    $("#productNameInput")
      ?.value.trim() || "";

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

  const invalidPrice =
    variants.some(
      (variant) =>
        !Number.isFinite(
          Number(variant.price)
        ) ||
        Number(variant.price) < 0
    );

  if (invalidPrice) {
    toast(
      "Проверьте цены вариантов",
      "error"
    );
    return;
  }

  const imageInput =
    $("#productImageInput");

  const payload = {
    name,

    category_id:
      $("#productCategoryInput")
        ?.value || "",

    description:
      $("#productDescriptionInput")
        ?.value.trim() || "",

    image_id:
      imageInput?.dataset.imageId ||
      "",

    image_url:
      imageInput?.dataset.imageUrl ||
      "",

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

  const oldText =
    button?.textContent ||
    "Сохранить";

  if (button) {
    button.disabled = true;
    button.textContent =
      "Сохраняем...";
  }

  try {
    await api(
      id
        ? `/api/admin/products/${encodeURIComponent(
            id
          )}`
        : "/api/admin/products",
      {
        method: id
          ? "PUT"
          : "POST",

        body: JSON.stringify(
          payload
        )
      }
    );

    haptic("medium");

    closeModal(
      "productModal"
    );

    toast(
      id
        ? "Товар обновлён"
        : "Товар создан"
    );

    await loadProducts();

    updateStats();
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
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent =
        oldText;
    }
  }
}

async function deleteCurrentProduct() {
  const id =
    $("#productId")
      ?.value.trim();

  if (!id) return;

  const product =
    state.products.find(
      (item) =>
        String(item.id) ===
        String(id)
    );

  const confirmed =
    confirm(
      `Удалить товар «${
        product?.name ||
        "товар"
      }»?`
    );

  if (!confirmed) return;

  try {
    await api(
      `/api/admin/products/${encodeURIComponent(
        id
      )}`,
      {
        method: "DELETE"
      }
    );

    haptic("medium");

    closeModal(
      "productModal"
    );

    toast(
      "Товар удалён"
    );

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

async function uploadProductImage(
  file
) {
  if (!file) return;

  if (
    !file.type ||
    !file.type.startsWith("image/")
  ) {
    toast(
      "Можно загружать только изображения",
      "error"
    );
    return;
  }

  if (
    file.size >
    10 * 1024 * 1024
  ) {
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
    toast(
      "Загружаем изображение..."
    );

    const data =
      await api(
        "/api/admin/upload",
        {
          method: "POST",
          body: formData
        }
      );

    const imageUrl =
      data.image_url ||
      data.imageUrl ||
      data.url ||
      (
        data.id
          ? `/api/images/${encodeURIComponent(
              data.id
            )}`
          : ""
      );

    const input =
      $("#productImageInput");

    if (input) {
      input.dataset.imageId =
        data.id || "";

      input.dataset.imageUrl =
        imageUrl;
    }

    const preview =
      $("#productImagePreview");

    if (preview && imageUrl) {
      preview.src =
        imageUrl;

      preview.hidden =
        false;
    }

    haptic("medium");

    toast(
      "Изображение загружено"
    );
  } catch (error) {
    console.error(
      "Image upload error:",
      error
    );

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
      Array.isArray(
        data.categories
      )
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

  if (!grid) return;

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
            data-id="${escapeHtml(
              category.id
            )}"
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
        () => {
          editCategory(
            button.dataset.id
          );
        }
      );
    }
  );

  $$(".delete-category").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          deleteCategory(
            button.dataset.id
          );
        }
      );
    }
  );
}

function openCategoryModal(
  category = null
) {
  state.currentCategory =
    category;

  const idInput =
    $("#categoryId");

  const nameInput =
    $("#categoryNameInput");

  const slugInput =
    $("#categorySlugInput");

  if (idInput) {
    idInput.value =
      category?.id || "";
  }

  if (nameInput) {
    nameInput.value =
      category?.name || "";
  }

  if (slugInput) {
    slugInput.value =
      category?.slug || "";
  }

  const deleteButton =
    $("#deleteCategoryButton");

  if (deleteButton) {
    deleteButton.hidden =
      !category?.id;
  }

  openModal(
    "categoryModal"
  );
}

function editCategory(id) {
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

async function saveCategory(
  event
) {
  event.preventDefault();

  const id =
    $("#categoryId")
      ?.value.trim() || "";

  const name =
    $("#categoryNameInput")
      ?.value.trim() || "";

  const slug =
    $("#categorySlugInput")
      ?.value.trim() || "";

  if (!name) {
    toast(
      "Введите название категории",
      "error"
    );
    return;
  }

  if (!slug) {
    toast(
      "Введите slug категории",
      "error"
    );
    return;
  }

  try {
    await api(
      id
        ? `/api/admin/categories/${encodeURIComponent(
            id
          )}`
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

    closeModal(
      "categoryModal"
    );

    haptic("medium");

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

async function deleteCategory(
  id
) {
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

  if (!confirmed) return;

  try {
    await api(
      `/api/admin/categories/${encodeURIComponent(
        id
      )}`,
      {
        method: "DELETE"
      }
    );

    haptic("medium");

    toast(
      "Категория удалена"
    );

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

  if (!list) return;

  let orders =
    [...state.orders];

  if (
    state.orderFilter &&
    state.orderFilter !== "all"
  ) {
    orders =
      orders.filter(
        (order) =>
          String(
            order.status || "new"
          ) ===
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

function renderOrderCard(
  order
) {
  const status =
    String(
      order.status || "new"
    );

  const statusNames = {
    new: "Новый",
    processing: "В работе",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  const username =
    order.username
      ? `@${String(
          order.username
        ).replace(/^@/, "")}`
      : "без username";

  const configuration =
    order.configuration || "";

  const price =
    order.price_formatted ||
    formatPrice(
      order.price,
      order.currency ||
        "RUB"
    );

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
            ${escapeHtml(
              formatDate(
                order.created_at
              )
            )}
          </span>
        </div>

        <span
          class="admin-order-status ${escapeHtml(
            status
          )}"
        >
          ${escapeHtml(
            statusNames[status] ||
              status
          )}
        </span>

      </div>

      ${
        configuration
          ? `
            <div class="admin-order-config">
              ${escapeHtml(
                configuration
              )}
            </div>
          `
          : ""
      }

      <div class="admin-order-info">

        <span>
          ${escapeHtml(
            price
          )}
        </span>

        <span>
          ${escapeHtml(
            username
          )}
        </span>

        <span>
          ID:
          ${escapeHtml(
            order.telegram_id ||
              ""
          )}
        </span>

      </div>

      <div class="admin-order-id">
        Заказ:
        ${escapeHtml(
          order.id || ""
        )}
      </div>

    </article>
  `;
}

/* =========================================================
   PROMO
========================================================= */

/*
  В server.js нет:
  GET /api/admin/promos
  POST /api/admin/promos
  DELETE /api/admin/promos/:id

  Поэтому промокоды создаются
  через существующий AI endpoint.
*/

function openPromoModal() {
  const form =
    $("#promoForm");

  if (form) {
    form.reset();
  }

  const type =
    $("#promoTypeInput");

  if (type) {
    type.value =
      "percent";
  }

  const active =
    $("#promoActiveInput");

  if (active) {
    active.checked =
      true;
  }

  openModal(
    "promoModal"
  );
}

async function createPromo(
  event
) {
  event.preventDefault();

  const code =
    $("#promoCodeInput")
      ?.value.trim()
      .toUpperCase() || "";

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

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    toast(
      "Введите размер скидки",
      "error"
    );
    return;
  }

  if (
    type === "percent" &&
    value > 100
  ) {
    toast(
      "Процент скидки не может быть больше 100",
      "error"
    );
    return;
  }

  try {
    const limitText =
      maxUses > 0
        ? `${maxUses} использований`
        : "без ограничения по использованию";

    const discountText =
      type === "percent"
        ? `${value}%`
        : `${value} рублей`;

    const command =
      `Создай промокод ${code} со скидкой ${discountText} и лимитом ${limitText}.`;

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

    closeModal(
      "promoModal"
    );

    haptic("medium");

    toast(
      data.message ||
        "Промокод создан"
    );

    switchTab("ai");

    appendAIMessage(
      command,
      "user"
    );

    if (data.message) {
      appendAIMessage(
        data.message,
        "assistant"
      );
    }
  } catch (error) {
    toast(
      error.message ||
        "Не удалось создать промокод",
      "error"
    );
  }
}

/* =========================================================
   AI CHAT
========================================================= */

function appendAIMessage(
  text,
  role = "assistant"
) {
  const messages =
    $("#aiMessages");

  if (!messages) return;

  const item =
    document.createElement(
      "div"
    );

  item.className =
    `ai-message ai-message-${role}`;

  const bubble =
    document.createElement(
      "div"
    );

  bubble.className =
    "ai-message-bubble";

  bubble.textContent =
    String(text || "");

  item.appendChild(
    bubble
  );

  messages.appendChild(
    item
  );

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

  if (!text) return;

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

    if (
      data.action?.type ||
      data.action?.action
    ) {
      console.log(
        "AI action:",
        data.action
      );
    }

    await loadProducts();
    await loadCategories();
    await loadOrders();

    updateStats();
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
   PRICE LIST
========================================================= */

async function parsePriceList() {
  const input =
    $("#priceListInput");

  const text =
    input?.value.trim() || "";

  if (!text) {
    toast(
      "Вставьте прайс-лист",
      "error"
    );
    return;
  }

  const button =
    $("#parsePriceListButton");

  const oldText =
    button?.textContent ||
    "Разобрать прайс";

  if (button) {
    button.disabled = true;
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

    const count =
      Array.isArray(
        data.products
      )
        ? data.products.length
        : 0;

    setPriceListStatus(
      `Найдено товаров: ${count}`
    );

    const importButton =
      $("#importPriceListButton");

    if (importButton) {
      importButton.disabled =
        count === 0;
    }

    haptic("medium");

    toast(
      "Прайс-лист разобран"
    );
  } catch (error) {
    state.parsedPriceList =
      null;

    const importButton =
      $("#importPriceListButton");

    if (importButton) {
      importButton.disabled =
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
        oldText;
    }
  }
}

function setPriceListStatus(
  text,
  error = false
) {
  const element =
    $("#priceListStatus");

  if (!element) return;

  element.textContent =
    String(text || "");

  element.classList.toggle(
    "error",
    Boolean(error)
  );
}

function renderPriceListPreview(
  data
) {
  const preview =
    $("#priceListPreview");

  if (!preview) return;

  const products =
    Array.isArray(data?.products)
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
                    product.name ||
                      "Без названия"
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
                variants.length
                  ? variants
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
                  : `
                      <div class="price-preview-variant">
                        <span>
                          Без вариантов
                        </span>
                      </div>
                    `
              }

            </div>
          `;
        }
      )
      .join("");
}

async function importPriceList() {
  const products =
    Array.isArray(
      state.parsedPriceList?.products
    )
      ? state.parsedPriceList.products
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

  if (!confirmed) return;

  const button =
    $("#importPriceListButton");

  const oldText =
    button?.textContent ||
    "Импортировать";

  if (button) {
    button.disabled = true;
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

    const imported =
      Number(
        result.imported || 0
      );

    toast(
      `Импортировано товаров: ${imported}`
    );

    await loadProducts();
    await loadCategories();
    updateStats();

    setPriceListStatus(
      `Импортировано: ${imported}`
    );

    state.parsedPriceList =
      null;
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
        oldText;
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
   ВАЖНО:
   HTML использует data-admin-tab
========================================================= */

function switchTab(tab) {
  const allowedTabs = [
    "products",
    "categories",
    "orders",
    "promo",
    "ai"
  ];

  if (
    !allowedTabs.includes(tab)
  ) {
    tab = "products";
  }

  state.activeTab =
    tab;

  /*
   * Кнопки вкладок:
   * data-admin-tab="products"
   */
  $$("[data-admin-tab]").forEach(
    (button) => {
      button.classList.toggle(
        "active",
        button.dataset.adminTab ===
          tab
      );
    }
  );

  /*
   * Поддерживаем оба варианта
   * названий panel:
   *
   * data-admin-panel
   * data-tab-panel
   *
   * чтобы JS не ломался,
   * если в HTML остался старый атрибут.
   */

  const panels =
    $$("[data-admin-panel]");

  if (panels.length) {
    panels.forEach(
      (panel) => {
        panel.hidden =
          panel.dataset.adminPanel !==
          tab;
      }
    );
  } else {
    $$("[data-tab-panel]").forEach(
      (panel) => {
        panel.hidden =
          panel.dataset.tabPanel !==
          tab;
      }
    );
  }

  haptic("light");
}

/* =========================================================
   IMAGE PREVIEW
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

      if (!file) return;

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
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
   EVENTS
========================================================= */

function bindEvents() {
  /* STORE */

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

  /* REFRESH */

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

  /* TABS */

  $$("[data-admin-tab]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          switchTab(
            button.dataset.adminTab
          );
        }
      );
    }
  );

  /* PRODUCTS */

  $("#addProductButton")
    ?.addEventListener(
      "click",
      () => {
        openProductModal();
      }
    );

  $("#emptyAddProduct")
    ?.addEventListener(
      "click",
      () => {
        openProductModal();
      }
    );

  $("#productSearch")
    ?.addEventListener(
      "input",
      () => {
        renderProducts();
      }
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
      () => {
        closeModal(
          "productModal"
        );
      }
    );

  $("#cancelProductButton")
    ?.addEventListener(
      "click",
      () => {
        closeModal(
          "productModal"
        );
      }
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

        if (!container) return;

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

        if (file) {
          uploadProductImage(
            file
          );
        }
      }
    );

  /* CATEGORIES */

  $("#addCategoryButton")
    ?.addEventListener(
      "click",
      () => {
        openCategoryModal();
      }
    );

  $("#closeCategoryModal")
    ?.addEventListener(
      "click",
      () => {
        closeModal(
          "categoryModal"
        );
      }
    );

  $("#cancelCategoryButton")
    ?.addEventListener(
      "click",
      () => {
        closeModal(
          "categoryModal"
        );
      }
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

        if (!id) return;

        await deleteCategory(
          id
        );

        closeModal(
          "categoryModal"
        );
      }
    );

  /* ORDERS */

  $("#refreshOrdersButton")
    ?.addEventListener(
      "click",
      async () => {
        const button =
          $("#refreshOrdersButton");

        if (button) {
          button.disabled =
            true;
        }

        try {
          await loadOrders();

          toast(
            "Заказы обновлены"
          );
        } finally {
          if (button) {
            button.disabled =
              false;
          }
        }
      }
    );

  $$("[data-order-filter]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          state.orderFilter =
            button.dataset.orderFilter ||
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
    }
  );

  /* PROMO */

  $("#addPromoButton")
    ?.addEventListener(
      "click",
      () => {
        openPromoModal();
      }
    );

  $("#promoAIButton")
    ?.addEventListener(
      "click",
      () => {
        closeModal(
          "promoModal"
        );

        switchTab("ai");
      }
    );

  $("#closePromoModal")
    ?.addEventListener(
      "click",
      () => {
        closeModal(
          "promoModal"
        );
      }
    );

  $("#cancelPromoButton")
    ?.addEventListener(
      "click",
      () => {
        closeModal(
          "promoModal"
        );
      }
    );

  $("#promoForm")
    ?.addEventListener(
      "submit",
      createPromo
    );

  /* AI CHAT */

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
        () => {
          sendAIMessage(
            button.dataset.aiExample
          );
        }
      );
    }
  );

  $$("[data-ai-command]").forEach(
    (button) => {
      button.addEventListener(
        "click",
        () => {
          sendAIMessage(
            button.dataset.aiCommand
          );
        }
      );
    }
  );

  /* PRICE LIST */

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

  /* MODAL BACKDROP */

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

  /* ESC */

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Escape"
      ) {
        return;
      }

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
  );
}

/* =========================================================
   INITIAL SETUP
========================================================= */

function setupPromoDefaults() {
  const type =
    $("#promoTypeInput");

  if (type && !type.value) {
    type.value =
      "percent";
  }

  const active =
    $("#promoActiveInput");

  if (
    active &&
    typeof active.checked !==
      "boolean"
  ) {
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

    const importButton =
      $("#importPriceListButton");

    if (importButton) {
      importButton.disabled =
        true;
    }

    switchTab(
      "products"
    );

    await checkAdmin();
  }
);