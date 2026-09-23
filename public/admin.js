const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const initData = tg?.initData || "";

let products = [];
let categories = [];
let orders = [];

let currentProductId = null;
let currentCategoryId = null;
let variants = [];

let selectedImageFile = null;
let selectedImageUrl = "";

let aiImportData = null;

const $ = (id) => document.getElementById(id);

function show(id) {
  $(id)?.classList.remove("hidden");
}

function hide(id) {
  $(id)?.classList.add("hidden");
}

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

  const formatted = new Intl.NumberFormat("ru-RU").format(number);

  if (currency === "RUB") return `${formatted} ₽`;
  if (currency === "USD") return `$${formatted}`;
  if (currency === "EUR") return `${formatted} €`;

  return `${formatted} ${currency}`;
}

function showToast(message, type = "normal") {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast ${type}`;

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (initData) {
    headers["x-telegram-init-data"] = initData;
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
      data.message ||
      `Ошибка ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   ADMIN ACCESS
========================================================= */

async function checkAdmin() {
  try {
    const data = await api("/api/admin/me");

    if (!data?.isAdmin) {
      hide("loadingScreen");
      show("deniedScreen");
      return false;
    }

    hide("loadingScreen");
    show("adminApp");

    return true;

  } catch (error) {
    console.error(error);

    hide("loadingScreen");
    show("deniedScreen");

    return false;
  }
}


/* =========================================================
   LOAD DATA
========================================================= */

async function loadAll() {
  try {
    const [
      productsData,
      categoriesData,
      ordersData
    ] = await Promise.all([
      api("/api/admin/products"),
      api("/api/admin/categories"),
      api("/api/admin/orders")
    ]);

    products =
      Array.isArray(productsData)
        ? productsData
        : productsData.products || [];

    categories =
      Array.isArray(categoriesData)
        ? categoriesData
        : categoriesData.categories || [];

    orders =
      Array.isArray(ordersData)
        ? ordersData
        : ordersData.orders || [];

    renderProducts();
    renderCategories();
    renderOrders();
    updateStats();
    fillCategorySelect();

  } catch (error) {
    console.error(error);
    showToast(error.message || "Не удалось загрузить данные", "error");
  }
}


/* =========================================================
   STATS
========================================================= */

function updateStats() {
  const productsCount = $("productsCount");
  const variantsCount = $("variantsCount");
  const ordersCount = $("ordersCount");

  if (productsCount) {
    productsCount.textContent = products.length;
  }

  let totalVariants = 0;

  for (const product of products) {
    totalVariants += Array.isArray(product.variants)
      ? product.variants.length
      : Number(product.variant_count || 0);
  }

  if (variantsCount) {
    variantsCount.textContent = totalVariants;
  }

  if (ordersCount) {
    ordersCount.textContent = orders.length;
  }
}


/* =========================================================
   PRODUCTS
========================================================= */

function getProductCategory(product) {
  if (product.category_name) {
    return product.category_name;
  }

  const category = categories.find(
    (item) => Number(item.id) === Number(product.category_id)
  );

  return category?.name || "Без категории";
}

function getProductImage(product) {
  if (product.image_url) {
    return product.image_url;
  }

  if (product.image) {
    return product.image;
  }

  if (product.image_id) {
    return `/api/images/${product.image_id}`;
  }

  return "";
}

function getLowestPrice(product) {
  const list = Array.isArray(product.variants)
    ? product.variants.filter((v) => v.active !== 0)
    : [];

  if (!list.length) return null;

  return list.reduce((lowest, item) => {
    if (!lowest) return item;

    return Number(item.price) < Number(lowest.price)
      ? item
      : lowest;
  }, null);
}

function renderProducts() {
  const container = $("productsGrid");

  if (!container) return;

  const query =
    ($("productSearch")?.value || "")
      .trim()
      .toLowerCase();

  const filtered = products.filter((product) => {
    if (!query) return true;

    const name = String(product.name || "").toLowerCase();
    const category = String(
      getProductCategory(product)
    ).toLowerCase();

    return (
      name.includes(query) ||
      category.includes(query)
    );
  });

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">
          Товаров нет
        </div>

        <div class="empty-state-text">
          Добавьте первый товар в каталог.
        </div>
      </div>
    `;

    return;
  }

  container.innerHTML = filtered
    .map((product) => {
      const image = getProductImage(product);
      const category = getProductCategory(product);

      const productVariants = Array.isArray(product.variants)
        ? product.variants
        : [];

      const activeVariants = productVariants.filter(
        (v) => Number(v.active) !== 0
      );

      const lowest = getLowestPrice(product);

      return `
        <article
          class="product-admin-card"
          data-product-id="${product.id}"
        >

          <div class="product-admin-image">

            ${
              image
                ? `
                  <img
                    src="${escapeHtml(image)}"
                    alt=""
                  />
                `
                : `
                  <div class="product-admin-image-empty">
                    IRoom
                  </div>
                `
            }

            ${
              Number(product.is_new)
                ? `
                  <span class="product-badge new">
                    NEW
                  </span>
                `
                : ""
            }

          </div>


          <div class="product-admin-info">

            <div class="product-admin-category">
              ${escapeHtml(category)}
            </div>

            <div class="product-admin-name">
              ${escapeHtml(product.name || "Без названия")}
            </div>


            <div class="product-admin-meta">

              <span>
                ${activeVariants.length}
                ${getPlural(
                  activeVariants.length,
                  "вариант",
                  "варианта",
                  "вариантов"
                )}
              </span>

              ${
                lowest
                  ? `
                    <span>
                      от ${formatPrice(
                        lowest.price,
                        lowest.currency
                      )}
                    </span>
                  `
                  : `
                    <span>
                      Цена не указана
                    </span>
                  `
              }

            </div>


            <div class="product-admin-status">

              <span
                class="${
                  Number(product.active)
                    ? "status-active"
                    : "status-inactive"
                }"
              >
                ${
                  Number(product.active)
                    ? "Активен"
                    : "Скрыт"
                }
              </span>

            </div>


            <button
              class="secondary-button product-edit-button"
              type="button"
              data-edit-product="${product.id}"
            >
              Редактировать
            </button>

          </div>

        </article>
      `;
    })
    .join("");

  container
    .querySelectorAll("[data-edit-product]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(
          button.dataset.editProduct
        );

        openProductModal(id);
      });
    });
}

function getPlural(number, one, few, many) {
  const n = Math.abs(number) % 100;
  const n1 = n % 10;

  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;

  return many;
}


/* =========================================================
   PRODUCT MODAL
========================================================= */

function resetProductModal() {
  currentProductId = null;
  variants = [];

  selectedImageFile = null;
  selectedImageUrl = "";

  $("productModalTitle").textContent = "Новый товар";

  $("productName").value = "";
  $("productDescription").value = "";

  $("productCategory").value = "";

  $("productIsNew").checked = false;
  $("productActive").checked = true;

  $("productImage").value = "";

  hide("productImagePreview");
  show("productImagePlaceholder");

  $("productImagePreview").src = "";

  renderVariants();

  $("deleteProductButton").style.display = "none";
}

async function openProductModal(productId = null) {
  resetProductModal();

  if (productId) {
    try {
      const data = await api(
        `/api/admin/products/${productId}`
      );

      const product = data.product || data;

      currentProductId = Number(product.id);

      $("productModalTitle").textContent =
        "Редактирование товара";

      $("productName").value =
        product.name || "";

      $("productDescription").value =
        product.description || "";

      $("productCategory").value =
        product.category_id || "";

      $("productIsNew").checked =
        Number(product.is_new) === 1;

      $("productActive").checked =
        Number(product.active) !== 0;

      variants = Array.isArray(product.variants)
        ? product.variants.map((variant) => ({
            id: variant.id || null,
            memory: variant.memory || "",
            color: variant.color || "",
            country: variant.country || "",
            sim_type: variant.sim_type || "",
            price: variant.price ?? "",
            currency: variant.currency || "RUB",
            stock: variant.stock ?? 0,
            active: Number(variant.active) !== 0
          }))
        : [];

      const image = getProductImage(product);

      if (image) {
        selectedImageUrl = image;

        $("productImagePreview").src = image;

        show("productImagePreview");
        hide("productImagePlaceholder");
      }

      $("deleteProductButton").style.display =
        "inline-flex";

      renderVariants();

    } catch (error) {
      showToast(
        error.message || "Не удалось загрузить товар",
        "error"
      );

      return;
    }
  }

  fillCategorySelect();

  if (currentProductId) {
    const product = await findLoadedProduct(
      currentProductId
    );

    if (product) {
      $("productCategory").value =
        product.category_id || "";
    }
  }

  show("productModal");
}

async function findLoadedProduct(id) {
  const local = products.find(
    (item) => Number(item.id) === Number(id)
  );

  if (local) return local;

  return null;
}

function closeProductModal() {
  hide("productModal");
}

function renderVariants() {
  const container = $("variantsContainer");

  if (!container) return;

  if (!variants.length) {
    container.innerHTML = `
      <div class="variant-empty">
        У товара пока нет вариантов.
        Нажмите «+ Вариант».
      </div>
    `;

    return;
  }

  container.innerHTML = variants
    .map((variant, index) => {
      return `
        <div
          class="variant-card"
          data-variant-index="${index}"
        >

          <div class="variant-card-header">

            <strong>
              Вариант ${index + 1}
            </strong>

            <button
              class="variant-delete"
              type="button"
              data-remove-variant="${index}"
            >
              ×
            </button>

          </div>


          <div class="variant-grid">

            <div class="form-group">

              <label class="form-label">
                Память
              </label>

              <input
                type="text"
                data-variant-field="memory"
                data-index="${index}"
                value="${escapeHtml(
                  variant.memory
                )}"
                placeholder="512 GB"
              />

            </div>


            <div class="form-group">

              <label class="form-label">
                Цвет
              </label>

              <input
                type="text"
                data-variant-field="color"
                data-index="${index}"
                value="${escapeHtml(
                  variant.color
                )}"
                placeholder="Orange"
              />

            </div>


            <div class="form-group">

              <label class="form-label">
                Страна
              </label>

              <input
                type="text"
                data-variant-field="country"
                data-index="${index}"
                value="${escapeHtml(
                  variant.country
                )}"
                placeholder="USA"
              />

            </div>


            <div class="form-group">

              <label class="form-label">
                SIM
              </label>

              <input
                type="text"
                data-variant-field="sim_type"
                data-index="${index}"
                value="${escapeHtml(
                  variant.sim_type
                )}"
                placeholder="eSIM"
              />

            </div>


            <div class="form-group">

              <label class="form-label">
                Цена
              </label>

              <input
                type="number"
                min="0"
                data-variant-field="price"
                data-index="${index}"
                value="${escapeHtml(
                  variant.price
                )}"
                placeholder="100000"
              />

            </div>


            <div class="form-group">

              <label class="form-label">
                Валюта
              </label>

              <select
                data-variant-field="currency"
                data-index="${index}"
              >

                <option
                  value="RUB"
                  ${
                    variant.currency === "RUB"
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

            </div>


            <div class="form-group">

              <label class="form-label">
                Остаток
              </label>

              <input
                type="number"
                min="0"
                data-variant-field="stock"
                data-index="${index}"
                value="${escapeHtml(
                  variant.stock
                )}"
                placeholder="0"
              />

            </div>

          </div>


          <div class="switch-row">

            <span class="switch-label">
              Показывать вариант
            </span>

            <label class="switch">

              <input
                type="checkbox"
                data-variant-field="active"
                data-index="${index}"
                ${
                  variant.active
                    ? "checked"
                    : ""
                }
              />

              <span class="slider"></span>

            </label>

          </div>

        </div>
      `;
    })
    .join("");


  container
    .querySelectorAll("[data-remove-variant]")
    .forEach((button) => {

      button.addEventListener("click", () => {

        const index = Number(
          button.dataset.removeVariant
        );

        variants.splice(index, 1);

        renderVariants();
      });

    });


  container
    .querySelectorAll("[data-variant-field]")
    .forEach((field) => {

      field.addEventListener("input", () => {
        updateVariantFromField(field);
      });

      field.addEventListener("change", () => {
        updateVariantFromField(field);
      });

    });
}

function updateVariantFromField(field) {
  const index = Number(field.dataset.index);
  const key = field.dataset.variantField;

  if (!variants[index]) return;

  if (field.type === "checkbox") {
    variants[index][key] = field.checked;
    return;
  }

  if (key === "price" || key === "stock") {
    variants[index][key] =
      field.value === ""
        ? ""
        : Number(field.value);

    return;
  }

  variants[index][key] = field.value;
}

function addVariant() {
  variants.push({
    id: null,
    memory: "",
    color: "",
    country: "",
    sim_type: "",
    price: "",
    currency: "RUB",
    stock: 0,
    active: true
  });

  renderVariants();

  setTimeout(() => {
    const cards =
      document.querySelectorAll(".variant-card");

    cards[cards.length - 1]?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }, 50);
}


/* =========================================================
   IMAGE UPLOAD
========================================================= */

async function uploadProductImage() {
  if (!selectedImageFile) {
    return selectedImageUrl || null;
  }

  const formData = new FormData();

  formData.append(
    "image",
    selectedImageFile
  );

  const result = await api(
    "/api/admin/upload",
    {
      method: "POST",
      body: formData
    }
  );

  return (
    result.url ||
    result.image_url ||
    result.imageUrl ||
    null
  );
}


/* =========================================================
   SAVE PRODUCT
========================================================= */

async function saveProduct() {
  const name =
    $("productName").value.trim();

  if (!name) {
    showToast(
      "Введите название товара",
      "error"
    );

    return;
  }

  if (!variants.length) {
    showToast(
      "Добавьте хотя бы один вариант",
      "error"
    );

    return;
  }

  const invalidVariant = variants.find(
    (variant) =>
      !variant.price ||
      Number(variant.price) < 0
  );

  if (invalidVariant) {
    showToast(
      "У каждого варианта должна быть цена",
      "error"
    );

    return;
  }

  const button = $("saveProductButton");

  const oldText = button.textContent;

  button.disabled = true;
  button.textContent = "Сохранение...";

  try {
    let imageUrl = selectedImageUrl;

    if (selectedImageFile) {
      imageUrl =
        await uploadProductImage();
    }

    const payload = {
      name,
      category_id:
        $("productCategory").value
          ? Number($("productCategory").value)
          : null,

      description:
        $("productDescription").value.trim(),

      image_url:
        imageUrl || null,

      is_new:
        $("productIsNew").checked,

      active:
        $("productActive").checked,

      variants: variants.map((variant) => ({
        id: variant.id || undefined,
        memory: variant.memory || "",
        color: variant.color || "",
        country: variant.country || "",
        sim_type: variant.sim_type || "",
        price: Number(variant.price || 0),
        currency:
          variant.currency || "RUB",
        stock:
          Number(variant.stock || 0),
        active:
          Boolean(variant.active)
      }))
    };


    if (currentProductId) {

      await api(
        `/api/admin/products/${currentProductId}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
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
          body: JSON.stringify(payload)
        }
      );

      showToast(
        "Товар создан",
        "success"
      );
    }


    closeProductModal();

    await loadAll();

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить товар",
      "error"
    );

  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}


/* =========================================================
   DELETE PRODUCT
========================================================= */

async function deleteProduct() {
  if (!currentProductId) return;

  const product = products.find(
    (item) =>
      Number(item.id) ===
      Number(currentProductId)
  );

  const name =
    product?.name || "этот товар";

  const confirmed = window.confirm(
    `Удалить «${name}»?`
  );

  if (!confirmed) return;

  try {

    await api(
      `/api/admin/products/${currentProductId}`,
      {
        method: "DELETE"
      }
    );

    closeProductModal();

    showToast(
      "Товар удалён",
      "success"
    );

    await loadAll();

  } catch (error) {

    showToast(
      error.message ||
      "Не удалось удалить товар",
      "error"
    );

  }
}


/* =========================================================
   CATEGORIES
========================================================= */

function fillCategorySelect() {
  const select = $("productCategory");

  if (!select) return;

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
            ${escapeHtml(category.name)}
          </option>
        `
      )
      .join("")}
  `;

  if (current) {
    select.value = current;
  }
}

function renderCategories() {
  const container =
    $("categoriesGrid");

  if (!container) return;

  if (!categories.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">
          Категорий нет
        </div>

        <div class="empty-state-text">
          Создайте первую категорию.
        </div>
      </div>
    `;

    return;
  }

  container.innerHTML = categories
    .map((category) => {

      const count =
        products.filter(
          (product) =>
            Number(product.category_id) ===
            Number(category.id)
        ).length;

      return `
        <article
          class="category-admin-card"
        >

          <div>

            <div class="category-admin-name">
              ${escapeHtml(category.name)}
            </div>

            <div class="category-admin-meta">
              /${escapeHtml(category.slug || "")}
              · ${count} ${
                getPlural(
                  count,
                  "товар",
                  "товара",
                  "товаров"
                )
              }
            </div>

          </div>


          <div
            style="
              display:flex;
              align-items:center;
              gap:8px;
            "
          >

            <span
              class="${
                Number(category.active)
                  ? "status-active"
                  : "status-inactive"
              }"
            >
              ${
                Number(category.active)
                  ? "Активна"
                  : "Скрыта"
              }
            </span>


            <button
              class="secondary-button"
              type="button"
              data-edit-category="${category.id}"
            >
              Изменить
            </button>

          </div>

        </article>
      `;
    })
    .join("");


  container
    .querySelectorAll(
      "[data-edit-category]"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {
          openCategoryModal(
            Number(
              button.dataset.editCategory
            )
          );
        }
      );

    });
}

function resetCategoryModal() {
  currentCategoryId = null;

  $("categoryModalTitle").textContent =
    "Новая категория";

  $("categoryName").value = "";
  $("categorySlug").value = "";
  $("categorySortOrder").value = "0";
  $("categoryActive").checked = true;

  $("deleteCategoryButton").style.display =
    "none";
}

function openCategoryModal(categoryId = null) {
  resetCategoryModal();

  if (categoryId) {

    const category =
      categories.find(
        (item) =>
          Number(item.id) ===
          Number(categoryId)
      );

    if (!category) return;

    currentCategoryId =
      Number(category.id);

    $("categoryModalTitle").textContent =
      "Редактирование категории";

    $("categoryName").value =
      category.name || "";

    $("categorySlug").value =
      category.slug || "";

    $("categorySortOrder").value =
      category.sort_order || 0;

    $("categoryActive").checked =
      Number(category.active) !== 0;

    $("deleteCategoryButton").style.display =
      "inline-flex";
  }

  show("categoryModal");
}

function closeCategoryModal() {
  hide("categoryModal");
}

async function saveCategory() {
  const name =
    $("categoryName").value.trim();

  if (!name) {
    showToast(
      "Введите название категории",
      "error"
    );

    return;
  }

  const payload = {
    name,

    slug:
      $("categorySlug").value.trim() ||
      name
        .toLowerCase()
        .replace(/[^a-zа-яё0-9]+/gi, "-")
        .replace(/^-+|-+$/g, ""),

    sort_order:
      Number(
        $("categorySortOrder").value || 0
      ),

    active:
      $("categoryActive").checked
  };

  const button =
    $("saveCategoryButton");

  button.disabled = true;

  try {

    if (currentCategoryId) {

      await api(
        `/api/admin/categories/${currentCategoryId}`,
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

    await loadAll();

  } catch (error) {

    showToast(
      error.message ||
      "Ошибка категории",
      "error"
    );

  } finally {

    button.disabled = false;

  }
}

async function deleteCategory() {
  if (!currentCategoryId) return;

  const confirmed =
    window.confirm(
      "Удалить эту категорию?"
    );

  if (!confirmed) return;

  try {

    await api(
      `/api/admin/categories/${currentCategoryId}`,
      {
        method: "DELETE"
      }
    );

    closeCategoryModal();

    showToast(
      "Категория удалена",
      "success"
    );

    await loadAll();

  } catch (error) {

    showToast(
      error.message ||
      "Не удалось удалить категорию",
      "error"
    );

  }
}


/* =========================================================
   ORDERS
========================================================= */

function renderOrders() {
  const container =
    $("ordersList");

  if (!container) return;

  if (!orders.length) {

    container.innerHTML = `
      <div class="empty-state">

        <div class="empty-state-title">
          Заказов пока нет
        </div>

        <div class="empty-state-text">
          Новые бронирования будут появляться здесь.
        </div>

      </div>
    `;

    return;
  }

  container.innerHTML = orders
    .map((order) => {

      const date =
        order.created_at
          ? formatDate(order.created_at)
          : "";

      const type =
        order.type ||
        order.order_type ||
        "booking";

      const status =
        order.status ||
        "new";

      return `
        <article class="order-card">

          <div class="order-card-top">

            <div>

              <div class="order-product-name">
                ${escapeHtml(
                  order.product_name ||
                  order.name ||
                  "Товар"
                )}
              </div>

              <div class="order-date">
                ${escapeHtml(date)}
              </div>

            </div>


            <span class="order-status">
              ${escapeHtml(
                translateOrderStatus(status)
              )}
            </span>

          </div>


          <div class="order-details">

            ${
              order.variant_text ||
              order.configuration ||
              order.config
                ? `
                  <div>
                    <span>Конфигурация</span>
                    <strong>
                      ${escapeHtml(
                        order.variant_text ||
                        order.configuration ||
                        order.config
                      )}
                    </strong>
                  </div>
                `
                : ""
            }


            ${
              order.price
                ? `
                  <div>
                    <span>Цена</span>
                    <strong>
                      ${formatPrice(
                        order.price,
                        order.currency ||
                        "RUB"
                      )}
                    </strong>
                  </div>
                `
                : ""
            }


            ${
              order.username
                ? `
                  <div>
                    <span>Telegram</span>
                    <strong>
                      @${escapeHtml(
                        String(
                          order.username
                        ).replace(/^@/, "")
                      )}
                    </strong>
                  </div>
                `
                : ""
            }


            <div>
              <span>Тип</span>
              <strong>
                ${
                  type === "consultation"
                    ? "Консультация"
                    : "Бронирование"
                }
              </strong>
            </div>

          </div>

        </article>
      `;
    })
    .join("");
}

function translateOrderStatus(status) {
  const map = {
    new: "Новый",
    pending: "Ожидает",
    processing: "В работе",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  return map[status] || status;
}

function formatDate(value) {
  try {

    return new Date(value).toLocaleString(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }
    );

  } catch {
    return String(value);
  }
}


/* =========================================================
   PROMOCODES
========================================================= */

function renderPromos() {
  const container =
    $("promoList");

  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">

      <div class="empty-state-title">
        Промокоды
      </div>

      <div class="empty-state-text">
        Промокоды можно создавать через AI.
        Например: «Создай промокод IR10 со скидкой 10%».
      </div>

    </div>
  `;
}

function openPromoModal() {
  $("promoCode").value = "";
  $("promoDiscountType").value =
    "percent";
  $("promoDiscountValue").value = "";
  $("promoMaxUses").value = "0";

  show("promoModal");
}

function closePromoModal() {
  hide("promoModal");
}

async function createPromo() {
  const code =
    $("promoCode").value
      .trim()
      .toUpperCase();

  const discountType =
    $("promoDiscountType").value;

  const discountValue =
    Number(
      $("promoDiscountValue").value
    );

  const maxUses =
    Number(
      $("promoMaxUses").value || 0
    );

  if (!code) {
    showToast(
      "Введите промокод",
      "error"
    );

    return;
  }

  if (
    !discountValue ||
    discountValue <= 0
  ) {
    showToast(
      "Введите размер скидки",
      "error"
    );

    return;
  }

  try {

    const text =
      discountType === "percent"
        ? `Создай промокод ${code} со скидкой ${discountValue}% и лимитом ${maxUses || "без лимита"} использований`
        : `Создай промокод ${code} со скидкой ${discountValue} рублей и лимитом ${maxUses || "без лимита"} использований`;

    await sendAdminAIRequest(
      text,
      false
    );

    closePromoModal();

    showToast(
      "Команда отправлена AI",
      "success"
    );

  } catch (error) {

    showToast(
      error.message ||
      "Не удалось создать промокод",
      "error"
    );

  }
}


/* =========================================================
   AI
========================================================= */

function addAIMessage(text, role = "assistant") {
  const container =
    $("aiMessages");

  if (!container) return;

  const message =
    document.createElement("div");

  message.className =
    `ai-message ${role}`;

  message.textContent = text;

  container.appendChild(message);

  container.scrollTop =
    container.scrollHeight;
}

async function sendAdminAIRequest(
  message,
  showUserMessage = true
) {
  const text =
    String(message || "").trim();

  if (!text) return;

  if (showUserMessage) {
    addAIMessage(
      text,
      "user"
    );
  }

  const button =
    $("aiSendButton");

  if (button) {
    button.disabled = true;
  }

  try {

    const result =
      await api(
        "/api/admin/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message: text
          })
        }
      );

    const answer =
      result.answer ||
      result.message ||
      result.text ||
      "Готово.";

    addAIMessage(
      answer,
      "assistant"
    );

    await loadAll();

    return result;

  } catch (error) {

    addAIMessage(
      `Ошибка: ${
        error.message ||
        "не удалось выполнить запрос"
      }`,
      "assistant"
    );

    throw error;

  } finally {

    if (button) {
      button.disabled = false;
    }

  }
}

async function sendAIMessage() {
  const input =
    $("aiInput");

  if (!input) return;

  const text =
    input.value.trim();

  if (!text) return;

  input.value = "";

  await sendAdminAIRequest(
    text,
    true
  );
}


/* =========================================================
   AI PRICE LIST IMPORT
========================================================= */

async function parsePriceList(text) {
  if (!text.trim()) {
    showToast(
      "Введите прайс-лист",
      "error"
    );

    return;
  }

  try {

    addAIMessage(
      "Разбираю прайс-лист...",
      "assistant"
    );

    const result =
      await api(
        "/api/admin/ai/parse",
        {
          method: "POST",
          body: JSON.stringify({
            text
          })
        }
      );

    aiImportData =
      result.products ||
      result.data ||
      result;

    renderAIImportPreview(
      aiImportData
    );

  } catch (error) {

    addAIMessage(
      `Ошибка разбора: ${
        error.message
      }`,
      "assistant"
    );

  }
}

function renderAIImportPreview(data) {
  const preview =
    $("aiPreview");

  const content =
    $("aiPreviewContent");

  if (!preview || !content) return;

  const list =
    Array.isArray(data)
      ? data
      : data.products || [];

  if (!list.length) {

    content.innerHTML = `
      <div class="empty-state">
        AI не нашёл товары в прайс-листе.
      </div>
    `;

    show("aiPreview");

    return;
  }

  content.innerHTML = list
    .map((product, productIndex) => {

      const productVariants =
        Array.isArray(product.variants)
          ? product.variants
          : [];

      return `
        <div
          class="ai-preview-product"
        >

          <div class="ai-preview-product-title">
            ${escapeHtml(
              product.name ||
              `Товар ${productIndex + 1}`
            )}
          </div>


          <div class="ai-preview-category">
            ${escapeHtml(
              product.category ||
              product.category_name ||
              "Без категории"
            )}
          </div>


          <div class="ai-preview-variants">

            ${productVariants
              .map(
                (variant) => `
                  <div
                    class="ai-preview-variant"
                  >

                    <span>
                      ${escapeHtml(
                        [
                          variant.memory,
                          variant.color,
                          variant.country,
                          variant.sim_type
                        ]
                          .filter(Boolean)
                          .join(" · ")
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
              .join("")}

          </div>

        </div>
      `;
    })
    .join("");

  show("aiPreview");
}

async function importAIProducts() {
  if (!aiImportData) {
    showToast(
      "Нет данных для импорта",
      "error"
    );

    return;
  }

  const button =
    $("aiImportButton");

  button.disabled = true;
  button.textContent =
    "Импорт...";

  try {

    const list =
      Array.isArray(aiImportData)
        ? aiImportData
        : aiImportData.products ||
          [];

    await api(
      "/api/admin/ai/import",
      {
        method: "POST",
        body: JSON.stringify({
          products: list
        })
      }
    );

    hide("aiPreview");

    aiImportData = null;

    addAIMessage(
      "Прайс-лист успешно импортирован в каталог.",
      "assistant"
    );

    showToast(
      "Импорт завершён",
      "success"
    );

    await loadAll();

  } catch (error) {

    showToast(
      error.message ||
      "Ошибка импорта",
      "error"
    );

  } finally {

    button.disabled = false;
    button.textContent =
      "Импортировать";
  }
}


/* =========================================================
   TABS
========================================================= */

const tabMap = {
  productsTab: "productsContent",
  categoriesTab: "categoriesContent",
  ordersTab: "ordersContent",
  promoTab: "promoContent",
  aiTab: "aiContent"
};

function switchTab(tabId) {
  Object.entries(tabMap).forEach(
    ([buttonId, contentId]) => {

      const button =
        $(buttonId);

      const content =
        $(contentId);

      if (!button || !content) return;

      const active =
        buttonId === tabId;

      button.classList.toggle(
        "active",
        active
      );

      content.classList.toggle(
        "hidden",
        !active
      );
    }
  );

  if (tabId === "productsTab") {
    renderProducts();
  }

  if (tabId === "categoriesTab") {
    renderCategories();
  }

  if (tabId === "ordersTab") {
    renderOrders();
  }

  if (tabId === "promoTab") {
    renderPromos();
  }
}


/* =========================================================
   IMAGE PREVIEW
========================================================= */

function setupImageUpload() {
  const input =
    $("productImage");

  if (!input) return;

  input.addEventListener(
    "change",
    () => {

      const file =
        input.files?.[0];

      if (!file) return;

      selectedImageFile = file;

      const reader =
        new FileReader();

      reader.onload = () => {

        $("productImagePreview").src =
          reader.result;

        show("productImagePreview");
        hide("productImagePlaceholder");

      };

      reader.readAsDataURL(file);
    }
  );
}


/* =========================================================
   CATEGORY SLUG
========================================================= */

function setupCategorySlug() {
  const name =
    $("categoryName");

  const slug =
    $("categorySlug");

  if (!name || !slug) return;

  name.addEventListener(
    "input",
    () => {

      if (
        currentCategoryId ||
        slug.dataset.edited === "1"
      ) {
        return;
      }

      slug.value =
        name.value
          .toLowerCase()
          .replace(/[^a-zа-яё0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "");
    }
  );

  slug.addEventListener(
    "input",
    () => {
      slug.dataset.edited = "1";
    }
  );
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function setupEvents() {

  /* Tabs */

  Object.keys(tabMap).forEach(
    (tabId) => {

      $(tabId)?.addEventListener(
        "click",
        () => switchTab(tabId)
      );

    }
  );


  /* Refresh */

  $("refreshButton")?.addEventListener(
    "click",
    async () => {

      const button =
        $("refreshButton");

      button.disabled = true;

      try {
        await loadAll();

        showToast(
          "Данные обновлены",
          "success"
        );

      } finally {
        button.disabled = false;
      }

    }
  );


  /* Product */

  $("addProductButton")
    ?.addEventListener(
      "click",
      () => openProductModal()
    );


  $("closeProductModal")
    ?.addEventListener(
      "click",
      closeProductModal
    );


  $("saveProductButton")
    ?.addEventListener(
      "click",
      saveProduct
    );


  $("deleteProductButton")
    ?.addEventListener(
      "click",
      deleteProduct
    );


  $("addVariantButton")
    ?.addEventListener(
      "click",
      addVariant
    );


  $("productSearch")
    ?.addEventListener(
      "input",
      renderProducts
    );


  /* Category */

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


  $("saveCategoryButton")
    ?.addEventListener(
      "click",
      saveCategory
    );


  $("deleteCategoryButton")
    ?.addEventListener(
      "click",
      deleteCategory
    );


  /* Promo */

  $("addPromoButton")
    ?.addEventListener(
      "click",
      openPromoModal
    );


  $("closePromoModal")
    ?.addEventListener(
      "click",
      closePromoModal
    );


  $("closePromoModalButton")
    ?.addEventListener(
      "click",
      closePromoModal
    );


  $("savePromoButton")
    ?.addEventListener(
      "click",
      createPromo
    );


  /* AI */

  $("aiSendButton")
    ?.addEventListener(
      "click",
      sendAIMessage
    );


  $("aiInput")
    ?.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          sendAIMessage();
        }

      }
    );


  document
    .querySelectorAll(
      ".ai-example-button"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          const text =
            button.dataset.aiExample;

          $("aiInput").value =
            text;

          $("aiInput").focus();

        }
      );

    });


  $("aiCancelImportButton")
    ?.addEventListener(
      "click",
      () => {

        aiImportData = null;

        hide("aiPreview");

      }
    );


  $("aiImportButton")
    ?.addEventListener(
      "click",
      importAIProducts
    );


  /* Image */

  setupImageUpload();


  /* Category slug */

  setupCategorySlug();


  /* Modal background close */

  document
    .querySelectorAll(".modal")
    .forEach((modal) => {

      modal.addEventListener(
        "click",
        (event) => {

          if (
            event.target === modal
          ) {
            modal.classList.add(
              "hidden"
            );
          }

        }
      );

    });

}


/* =========================================================
   INITIALIZE
========================================================= */

async function init() {

  setupEvents();

  const isAdmin =
    await checkAdmin();

  if (!isAdmin) return;

  await loadAll();

  renderPromos();

  switchTab(
    "productsTab"
  );
}

document.addEventListener(
  "DOMContentLoaded",
  init
);