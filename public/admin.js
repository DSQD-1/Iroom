const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#070709");
    tg.setBackgroundColor("#070709");
  } catch {}
}


/* =========================================================
   CONFIG
========================================================= */

const ADMIN_IDS = [
  "5082864281",
  "5975037118"
];

const initData = tg?.initData || "";

let currentUser = null;

let products = [];
let categories = [];
let banners = [];
let reservationCards = [];
let pickupPoints = [];
let orders = [];

let currentOrderId = null;
let currentOrder = null;

let currentOrderFilter = "all";

/*
  Фотографии текущего товара.

  Каждый элемент:

  {
    file: File | null,
    url: string | null,
    preview: string
  }
*/
let productImages = [];


/* =========================================================
   HELPERS
========================================================= */

const $ = (selector, root = document) => {
  return root.querySelector(selector);
};

const $$ = (selector, root = document) => {
  return [...root.querySelectorAll(selector)];
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
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

function normalizeId(value) {
  return String(value ?? "");
}

function showLoader() {
  $("#globalLoader")?.classList.remove("hidden");
}

function hideLoader() {
  $("#globalLoader")?.classList.add("hidden");
}

let toastTimer = null;

function toast(message, type = "success") {
  const element = $("#toast");

  if (!element) return;

  clearTimeout(toastTimer);

  element.textContent = message;
  element.className = `toast ${type} show`;

  toastTimer = setTimeout(() => {
    element.className = "toast";
  }, 2800);
}

function openModal(id) {
  const modal = document.getElementById(id);

  if (!modal) return;

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");

  document.body.style.overflow = "hidden";
}

function closeModal(id) {
  const modal = document.getElementById(id);

  if (!modal) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");

  if (!$(".modal:not(.hidden)")) {
    document.body.style.overflow = "";
  }
}

function closeAllModals() {
  $$(".modal").forEach(modal => {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  });

  document.body.style.overflow = "";
}

function confirmDelete(text) {
  return window.confirm(text);
}

function setValue(selector, value) {
  const element = $(selector);

  if (element) {
    element.value = value ?? "";
  }
}


/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (initData) {
    headers["x-telegram-init-data"] = initData;
  }

  const isFormData =
    typeof FormData !== "undefined" &&
    options.body instanceof FormData;

  if (!isFormData && options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  let data = {};

  const text = await response.text();

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {
        raw: text
      };
    }
  }

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
   AUTH
========================================================= */

async function checkAccess() {
  const accessScreen = $("#accessScreen");
  const adminScreen = $("#adminScreen");
  const error = $("#accessError");
  const retry = $("#accessRetryButton");

  try {
    if (!tg) {
      throw new Error(
        "Откройте админ-панель через Telegram Mini App."
      );
    }

    if (!initData) {
      throw new Error(
        "Telegram не передал данные авторизации."
      );
    }

    const me = await api("/api/me");

    currentUser = me?.user || me;

    const id = String(
      currentUser?.telegram_user_id ??
      currentUser?.id ??
      tg?.initDataUnsafe?.user?.id ??
      ""
    );

    if (!ADMIN_IDS.includes(id)) {
      throw new Error(
        "У вас нет доступа к админ-панели."
      );
    }

    accessScreen?.classList.add("hidden");
    adminScreen?.classList.remove("hidden");

    await loadAll();

  } catch (errorValue) {
    console.error("Admin access error:", errorValue);

    adminScreen?.classList.add("hidden");
    accessScreen?.classList.remove("hidden");

    if (error) {
      error.textContent =
        errorValue?.message ||
        "Не удалось проверить доступ.";

      error.classList.remove("hidden");
    }

    retry?.classList.remove("hidden");
  }
}


/* =========================================================
   LOAD ALL
========================================================= */

async function loadAll() {
  showLoader();

  try {
    await Promise.all([
      loadCategories(),
      loadProducts(),
      loadBanners(),
      loadReservation(),
      loadPickupPoints(),
      loadOrders(),
      loadSettings()
    ]);

    updateDashboard();

  } catch (errorValue) {
    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось загрузить данные.",
      "error"
    );

  } finally {
    hideLoader();
  }
}

async function refreshAll() {
  showLoader();

  try {
    await Promise.all([
      loadCategories(),
      loadProducts(),
      loadBanners(),
      loadReservation(),
      loadPickupPoints(),
      loadOrders(),
      loadSettings()
    ]);

    updateDashboard();

    toast("Данные обновлены");

  } catch (errorValue) {
    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Ошибка обновления.",
      "error"
    );

  } finally {
    hideLoader();
  }
}


/* =========================================================
   DASHBOARD
========================================================= */

function updateDashboard() {
  const productsCount = $("#dashboardProducts");
  const categoriesCount = $("#dashboardCategories");
  const bannersCount = $("#dashboardBanners");
  const ordersCount = $("#dashboardOrders");

  if (productsCount) {
    productsCount.textContent = products.length;
  }

  if (categoriesCount) {
    categoriesCount.textContent = categories.length;
  }

  if (bannersCount) {
    bannersCount.textContent = banners.length;
  }

  if (ordersCount) {
    ordersCount.textContent = orders.length;
  }
}


/* =========================================================
   TABS
========================================================= */

function switchTab(tabName) {
  $$(".admin-tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tabName
    );
  });

  $$(".admin-tab-content").forEach(section => {
    section.classList.toggle(
      "active",
      section.dataset.content === tabName
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function setupTabs() {
  $$(".admin-tab").forEach(button => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });

  $$("[data-tab-target]").forEach(button => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tabTarget);
    });
  });
}


/* =========================================================
   CATEGORIES
========================================================= */

async function loadCategories() {
  const data = await api("/api/categories");

  categories =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.categories)
        ? data.categories
        : [];

  renderCategories();
  fillCategorySelect();
}

function renderCategories() {
  const container = $("#categoriesList");

  if (!container) return;

  if (!categories.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = categories
    .map(category => {

      const image =
        category.image ||
        category.image_url ||
        "";

      return `
        <article class="admin-category-card">

          <div class="admin-category-icon">
            ${
              image
                ? `<img src="${escapeHtml(image)}" alt="">`
                : "I"
            }
          </div>

          <div class="admin-category-main">

            <strong>
              ${escapeHtml(category.name || "Без названия")}
            </strong>

            <span>
              ${
                escapeHtml(
                  category.description ||
                  `Порядок: ${category.sort_order ?? 0}`
                )
              }
            </span>

          </div>

          <div class="admin-category-actions">

            <button
              type="button"
              data-edit-category="${escapeHtml(category.id)}"
            >
              Изменить
            </button>

            <button
              type="button"
              class="delete-button"
              data-delete-category="${escapeHtml(category.id)}"
            >
              Удалить
            </button>

          </div>

        </article>
      `;
    })
    .join("");

  $$("[data-edit-category]").forEach(button => {
    button.addEventListener("click", () => {
      openCategoryEditor(button.dataset.editCategory);
    });
  });

  $$("[data-delete-category]").forEach(button => {
    button.addEventListener("click", () => {
      deleteCategory(button.dataset.deleteCategory);
    });
  });
}

function fillCategorySelect() {
  const select = $("#productCategory");

  if (!select) return;

  const current = select.value;

  select.innerHTML = `
    <option value="">
      Без категории
    </option>
  `;

  categories.forEach(category => {
    const option = document.createElement("option");

    option.value = category.id;
    option.textContent = category.name || "Без названия";

    select.appendChild(option);
  });

  if (current) {
    select.value = current;
  }
}

function resetCategoryForm() {
  $("#categoryForm")?.reset();

  setValue("#categoryId", "");
  setValue("#categoryModalTitle", "Новая категория");
  setValue("#categorySortOrder", "0");
  setValue("#categoryImage", "");

  if ($("#categoryModalTitle")) {
    $("#categoryModalTitle").textContent =
      "Новая категория";
  }

  if ($("#categoryImagePreview")) {
    $("#categoryImagePreview").innerHTML = "";
  }
}

function openCategoryEditor(id = "") {
  resetCategoryForm();

  if (!id) {
    openModal("categoryModal");
    return;
  }

  const category = categories.find(
    item => String(item.id) === String(id)
  );

  if (!category) return;

  $("#categoryModalTitle").textContent =
    "Изменить категорию";

  setValue("#categoryId", category.id);
  setValue("#categoryName", category.name);
  setValue(
    "#categoryImage",
    category.image ?? category.image_url ?? ""
  );
  setValue(
    "#categoryDescription",
    category.description ?? ""
  );
  setValue(
    "#categorySortOrder",
    category.sort_order ?? 0
  );

  renderImagePreview(
    "#categoryImagePreview",
    $("#categoryImage").value
  );

  openModal("categoryModal");
}

async function saveCategory(event) {
  event.preventDefault();

  const id = $("#categoryId").value.trim();

  const payload = {
    name: $("#categoryName").value.trim(),
    image: $("#categoryImage").value.trim(),
    description: $("#categoryDescription").value.trim(),
    sort_order: number($("#categorySortOrder").value)
  };

  if (!payload.name) {
    toast("Введите название категории.", "error");
    return;
  }

  showLoader();

  try {
    if (id) {
      await api(
        `/api/admin/categories/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );
    } else {
      await api(
        "/api/admin/categories",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
    }

    closeModal("categoryModal");

    await loadCategories();

    updateDashboard();

    toast(
      id
        ? "Категория обновлена"
        : "Категория создана"
    );

  } catch (errorValue) {
    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось сохранить категорию.",
      "error"
    );

  } finally {
    hideLoader();
  }
}

async function deleteCategory(id) {
  if (
    !confirmDelete(
      "Удалить категорию? Товары категории удалены не будут."
    )
  ) {
    return;
  }

  showLoader();

  try {
    await api(
      `/api/admin/categories/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    await loadCategories();

    updateDashboard();

    toast("Категория удалена");

  } catch (errorValue) {
    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось удалить категорию.",
      "error"
    );

  } finally {
    hideLoader();
  }
}


/* =========================================================
   PRODUCT HELPERS
========================================================= */

function getProductCategoryName(product) {
  const category = categories.find(
    item =>
      String(item.id) ===
      String(
        product.category_id ??
        product.categoryId ??
        ""
      )
  );

  return (
    category?.name ||
    product.category_name ||
    ""
  );
}

function getProductImage(product) {
  return (
    product.image ||
    product.image_url ||
    product.cover ||
    (
      Array.isArray(product.images)
        ? product.images[0]
        : ""
    ) ||
    ""
  );
}

function getProductImages(product) {
  let images = [];

  if (Array.isArray(product.images)) {
    images = product.images;
  }

  if (!images.length && Array.isArray(product.gallery)) {
    images = product.gallery;
  }

  if (!images.length) {
    const main =
      product.image ||
      product.image_url ||
      product.cover ||
      "";

    if (main) {
      images = [main];
    }
  }

  return images
    .map(item => {
      if (typeof item === "string") {
        return item;
      }

      return (
        item?.url ||
        item?.image ||
        item?.image_url ||
        item?.path ||
        ""
      );
    })
    .filter(Boolean);
}

function getProductBasePrice(product) {
  return number(
    product.price ??
    product.base_price ??
    0
  );
}

function getLegacyVariants(product) {
  if (Array.isArray(product.variants)) {
    return product.variants;
  }

  if (Array.isArray(product.product_variants)) {
    return product.product_variants;
  }

  return [];
}


/* =========================================================
   PRICE OPTIONS NORMALIZATION
========================================================= */

function normalizeOption(option) {
  if (typeof option === "string") {
    return {
      name: option,
      surcharge: 0
    };
  }

  if (!option || typeof option !== "object") {
    return null;
  }

  const name =
    option.name ??
    option.value ??
    option.title ??
    "";

  const surcharge =
    option.surcharge ??
    option.price_delta ??
    option.extra_price ??
    option.delta ??
    0;

  return {
    name: String(name).trim(),
    surcharge: number(surcharge)
  };
}

function normalizeOptionArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeOption)
    .filter(option => option && option.name);
}

function getPriceOptions(product) {
  const source =
    product?.price_options ||
    product?.priceOptions ||
    {};

  return {
    memory: normalizeOptionArray(
      source.memory ??
      source.memories ??
      product?.memories
    ),

    color: normalizeOptionArray(
      source.color ??
      source.colors ??
      product?.colors
    ),

    sim: normalizeOptionArray(
      source.sim ??
      source.sims ??
      product?.sims
    ),

    region: normalizeOptionArray(
      source.region ??
      source.regions ??
      product?.regions
    )
  };
}

function getOptionGroups(product) {
  const options =
    getPriceOptions(product);

  return {
    colors: options.color,
    memories: options.memory,
    sims: options.sim,
    regions: options.region
  };
}

function getOptionCount(product) {
  const groups =
    getOptionGroups(product);

  return Object.values(groups)
    .reduce(
      (sum, list) =>
        sum +
        (
          Array.isArray(list)
            ? list.length
            : 0
        ),
      0
    );
}

function getMaxProductPrice(product) {
  const base =
    getProductBasePrice(product);

  const options =
    getPriceOptions(product);

  let maximum =
    base;

  Object.values(options).forEach(list => {

    if (!Array.isArray(list) || !list.length) {
      return;
    }

    const max =
      Math.max(
        ...list.map(
          option =>
            number(option.surcharge)
        )
      );

    maximum += max;
  });

  if (maximum > base) {
    return maximum;
  }

  const variants =
    getLegacyVariants(product);

  if (variants.length) {
    return Math.max(
      base,
      ...variants.map(
        variant =>
          number(
            variant.price ??
            variant.final_price ??
            base
          )
      )
    );
  }

  return base;
}


/* =========================================================
   PRODUCTS LOAD
========================================================= */

async function loadProducts() {
  const data = await api("/api/products");

  products =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.products)
        ? data.products
        : [];

  renderProducts();
  fillBannerProductSelect();
}


/* =========================================================
   PRODUCTS RENDER
========================================================= */

function renderProducts() {
  const container = $("#productsList");

  if (!container) return;

  if (!products.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = products
    .map(product => {

      const image =
        getProductImage(product);

      const category =
        getProductCategoryName(product);

      const basePrice =
        getProductBasePrice(product);

      const maxPrice =
        getMaxProductPrice(product);

      const optionCount =
        getOptionCount(product);

      const imageCount =
        getProductImages(product).length;

      return `
        <article class="admin-product-card">

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
                    I
                  </div>
                `
            }

          </div>


          <div class="admin-product-main">

            <div class="admin-product-top">

              <strong>
                ${escapeHtml(
                  product.name ||
                  "Без названия"
                )}
              </strong>

              ${
                category
                  ? `
                    <span class="admin-product-category">
                      ${escapeHtml(category)}
                    </span>
                  `
                  : ""
              }

            </div>


            <div class="admin-product-price">

              ${
                basePrice === maxPrice
                  ? money(basePrice)
                  : `${money(basePrice)} — ${money(maxPrice)}`
              }

            </div>


            <div class="admin-product-options">

              <span>
                ${
                  optionCount
                    ? `${optionCount} характеристик`
                    : "Без доплат"
                }
              </span>

              ${
                imageCount
                  ? `
                    <span>
                      ${imageCount} фото
                    </span>
                  `
                  : ""
              }

            </div>


            <div class="admin-product-actions">

              <button
                type="button"
                data-edit-product="${escapeHtml(product.id)}"
              >
                Изменить
              </button>

              <button
                type="button"
                class="delete-button"
                data-delete-product="${escapeHtml(product.id)}"
              >
                Удалить
              </button>

            </div>

          </div>

        </article>
      `;
    })
    .join("");

  $$("[data-edit-product]").forEach(button => {
    button.addEventListener("click", () => {
      openProductEditor(
        button.dataset.editProduct
      );
    });
  });

  $$("[data-delete-product]").forEach(button => {
    button.addEventListener("click", () => {
      deleteProduct(
        button.dataset.deleteProduct
      );
    });
  });
}


/* =========================================================
   PRODUCT IMAGE MANAGER
========================================================= */

function clearProductImages() {
  productImages.forEach(item => {

    if (
      item.preview &&
      item.preview.startsWith("blob:")
    ) {
      try {
        URL.revokeObjectURL(
          item.preview
        );
      } catch {}
    }

  });

  productImages = [];

  if ($("#productImageFile")) {
    $("#productImageFile").value = "";
  }

  renderProductImageGallery();
}

function addExistingProductImages(images) {
  clearProductImages();

  if (!Array.isArray(images)) {
    return;
  }

  images.forEach(image => {

    if (!image) return;

    productImages.push({
      file: null,
      url: String(image),
      preview: String(image)
    });

  });

  renderProductImageGallery();
}

function addProductImageFiles(files) {
  const list =
    Array.from(files || []);

  list.forEach(file => {

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast(
        `${file.name}: это не изображение`,
        "error"
      );

      return;
    }

    if (
      file.size >
      15 * 1024 * 1024
    ) {
      toast(
        `${file.name}: максимум 15 МБ`,
        "error"
      );

      return;
    }

    const duplicate =
      productImages.some(item => {

        if (!item.file) {
          return false;
        }

        return (
          item.file.name === file.name &&
          item.file.size === file.size &&
          item.file.lastModified ===
            file.lastModified
        );

      });

    if (duplicate) {
      return;
    }

    productImages.push({
      file,
      url: null,
      preview:
        URL.createObjectURL(file)
    });

  });

  renderProductImageGallery();
}

function removeProductImage(index) {
  if (
    index < 0 ||
    index >= productImages.length
  ) {
    return;
  }

  const item =
    productImages[index];

  if (
    item?.preview &&
    item.preview.startsWith("blob:")
  ) {
    try {
      URL.revokeObjectURL(
        item.preview
      );
    } catch {}
  }

  productImages.splice(
    index,
    1
  );

  renderProductImageGallery();
}

function renderProductImageGallery() {
  const container =
    $("#productImagePreview");

  if (!container) return;

  if (!productImages.length) {

    container.innerHTML = `
      <div class="image-empty">
        Фотографии ещё не добавлены
      </div>
    `;

    return;
  }

  container.innerHTML =
    productImages
      .map((item, index) => {

        const source =
          item.url ||
          item.preview ||
          "";

        return `
          <div
            class="product-upload-preview"
            data-product-image-index="${index}"
          >

            <img
              src="${escapeHtml(source)}"
              alt="Фото ${index + 1}"
            >

            <div class="product-upload-number">
              ${index + 1}
            </div>

            <button
              type="button"
              class="product-upload-remove"
              data-remove-product-image="${index}"
            >
              ×
            </button>

          </div>
        `;

      })
      .join("");

  $$("[data-remove-product-image]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {
          removeProductImage(
            Number(
              button.dataset.removeProductImage
            )
          );
        }
      );

    });
}

function getProductImageUrls() {
  return productImages
    .map(item => item.url)
    .filter(Boolean);
}


/* =========================================================
   PRODUCT IMAGE UPLOAD
========================================================= */

async function uploadSingleProductImage(file) {
  const formData =
    new FormData();

  /*
    ВАЖНО:

    Используем "file", потому что текущий
    server.js уже имеет обычный upload endpoint.
  */

  formData.append(
    "file",
    file
  );

  formData.append(
    "type",
    "image"
  );

  const data =
    await api(
      "/api/admin/upload",
      {
        method: "POST",
        body: formData
      }
    );

  const url =
    data?.url ||
    data?.path ||
    data?.file?.url ||
    data?.file?.path ||
    data?.location ||
    data?.file?.location ||
    "";

  if (!url) {
    throw new Error(
      "Сервер не вернул URL фотографии."
    );
  }

  return url;
}

async function uploadNewProductImages() {
  const newItems =
    productImages.filter(
      item =>
        item.file &&
        !item.url
    );

  if (!newItems.length) {
    return getProductImageUrls();
  }

  let completed = 0;

  for (const item of newItems) {

    const url =
      await uploadSingleProductImage(
        item.file
      );

    item.url = url;

    completed++;

    renderProductImageGallery();

    toast(
      `Загружено фото: ${completed}/${newItems.length}`
    );
  }

  return getProductImageUrls();
}


/* =========================================================
   PRODUCT FORM
========================================================= */

function resetProductForm() {
  $("#productForm")?.reset();

  setValue("#productId", "");

  if ($("#productModalTitle")) {
    $("#productModalTitle").textContent =
      "Новый товар";
  }

  setValue("#productImage", "");

  clearProductImages();

  $(
    "#productColors"
  ).innerHTML = "";

  $(
    "#productMemories"
  ).innerHTML = "";

  $(
    "#productSims"
  ).innerHTML = "";

  $(
    "#productRegions"
  ).innerHTML = "";

  addEmptyOptionPlaceholder("colors");
  addEmptyOptionPlaceholder("memories");
  addEmptyOptionPlaceholder("sims");
  addEmptyOptionPlaceholder("regions");

  updatePricePreview();
}

function addEmptyOptionPlaceholder(group) {
  const container =
    getOptionContainer(group);

  if (!container) return;

  if (
    container.querySelector(
      ".option-row"
    )
  ) {
    return;
  }

  container.innerHTML = `
    <div
      class="option-empty"
      data-option-empty
    >
      Нет добавленных вариантов
    </div>
  `;
}

function getOptionContainer(group) {
  const map = {
    colors: "#productColors",
    memories: "#productMemories",
    sims: "#productSims",
    regions: "#productRegions"
  };

  return $(map[group]);
}

function addOptionRow(
  group,
  name = "",
  surcharge = 0
) {
  const container =
    getOptionContainer(group);

  if (!container) return;

  container
    .querySelector(
      "[data-option-empty]"
    )
    ?.remove();

  const row =
    document.createElement("div");

  row.className =
    "option-row";

  row.dataset.optionGroup =
    group;

  row.innerHTML = `
    <div class="option-number">
      ${container.children.length + 1}
    </div>

    <input
      class="option-name"
      type="text"
      placeholder="Название"
      value="${escapeHtml(name)}"
      data-option-name
    >

    <input
      class="option-surcharge"
      type="number"
      min="0"
      step="1"
      placeholder="+ 0 ₽"
      value="${number(surcharge)}"
      data-option-surcharge
    >

    <button
      class="option-delete"
      type="button"
      data-delete-option
    >
      ×
    </button>
  `;

  container.appendChild(row);

  row
    .querySelector(
      "[data-delete-option]"
    )
    ?.addEventListener(
      "click",
      () => {

        row.remove();

        renumberOptions(group);

        addEmptyOptionPlaceholder(group);

        updatePricePreview();
      }
    );

  row
    .querySelector(
      "[data-option-surcharge]"
    )
    ?.addEventListener(
      "input",
      updatePricePreview
    );
}

function renumberOptions(group) {
  const container =
    getOptionContainer(group);

  if (!container) return;

  [
    ...container.children
  ]
    .filter(
      element =>
        element.classList.contains(
          "option-row"
        )
    )
    .forEach(
      (row, index) => {

        const numberElement =
          row.querySelector(
            ".option-number"
          );

        if (numberElement) {
          numberElement.textContent =
            String(index + 1);
        }

      }
    );
}

function readOptions(group) {
  const container =
    getOptionContainer(group);

  if (!container) {
    return [];
  }

  return [
    ...container.querySelectorAll(
      ".option-row"
    )
  ]
    .map(row => {

      const name =
        row
          .querySelector(
            "[data-option-name]"
          )
          ?.value
          ?.trim() || "";

      const surcharge =
        number(
          row
            .querySelector(
              "[data-option-surcharge]"
            )
            ?.value
        );

      return {
        name,
        surcharge
      };

    })
    .filter(
      option =>
        option.name
    );
}

function fillOptionGroup(
  group,
  options
) {
  const container =
    getOptionContainer(group);

  if (!container) return;

  container.innerHTML = "";

  if (
    !Array.isArray(options) ||
    !options.length
  ) {
    addEmptyOptionPlaceholder(group);
    return;
  }

  options.forEach(option => {

    addOptionRow(
      group,
      option.name,
      option.surcharge
    );

  });

  renumberOptions(group);
}


/* =========================================================
   BUILD PRICE OPTIONS
========================================================= */

function buildPriceOptions() {
  const colors =
    readOptions("colors");

  const memories =
    readOptions("memories");

  const sims =
    readOptions("sims");

  const regions =
    readOptions("regions");

  /*
    Отправляем оба варианта названия:
    memory/memories, color/colors и т.д.
    Так backend сможет использовать существующую
    структуру price_options.
  */

  return {
    memory: memories,
    memories,

    color: colors,
    colors,

    sim: sims,
    sims,

    region: regions,
    regions
  };
}


/* =========================================================
   OPEN PRODUCT
========================================================= */

function openProductEditor(id = "") {
  resetProductForm();

  if (!id) {
    openModal("productModal");
    return;
  }

  const product =
    products.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!product) return;

  if ($("#productModalTitle")) {
    $("#productModalTitle").textContent =
      "Изменить товар";
  }

  setValue(
    "#productId",
    product.id
  );

  setValue(
    "#productName",
    product.name
  );

  setValue(
    "#productCategory",
    product.category_id ??
    product.categoryId ??
    ""
  );

  setValue(
    "#productPrice",
    getProductBasePrice(product)
  );

  setValue(
    "#productDescription",
    product.description
  );

  const images =
    getProductImages(product);

  addExistingProductImages(images);

  /*
    Если старый товар содержит только
    одну картинку, она тоже попадёт сюда.
  */

  setValue(
    "#productImage",
    images[0] || ""
  );

  /*
    Читаем новые price_options.
  */

  const options =
    getPriceOptions(product);

  fillOptionGroup(
    "colors",
    options.color
  );

  fillOptionGroup(
    "memories",
    options.memory
  );

  fillOptionGroup(
    "sims",
    options.sim
  );

  fillOptionGroup(
    "regions",
    options.region
  );

  updatePricePreview();

  openModal("productModal");
}


/* =========================================================
   SAVE PRODUCT
========================================================= */

async function saveProduct(event) {
  event.preventDefault();

  const id =
    $("#productId")?.value?.trim() ||
    "";

  const basePrice =
    number(
      $("#productPrice")?.value
    );

  const name =
    $("#productName")?.value?.trim() ||
    "";

  if (!name) {
    toast(
      "Введите название товара.",
      "error"
    );

    return;
  }

  if (basePrice < 0) {
    toast(
      "Цена не может быть отрицательной.",
      "error"
    );

    return;
  }

  /*
    Сначала загружаем фотографии.

    Старые URL остаются.
    Новые File загружаются.
  */

  showLoader();

  try {

    let imageUrls = [];

    if (productImages.length) {

      toast(
        "Загружаем фотографии..."
      );

      imageUrls =
        await uploadNewProductImages();
    }

    /*
      Если фотографии не были открыты через
      новый менеджер, сохраняем старую URL-картинку.
    */

    const manualImage =
      $("#productImage")?.value?.trim() ||
      "";

    if (
      !imageUrls.length &&
      manualImage
    ) {
      imageUrls = [
        manualImage
      ];
    }

    /*
      Характеристики.
    */

    const priceOptions =
      buildPriceOptions();

    /*
      Для удобства backend получит
      и price_options, и старые поля.
    */

    const payload = {

      name,

      category_id:
        $("#productCategory")?.value ||
        null,

      description:
        $("#productDescription")?.value?.trim() ||
        "",

      /*
        Базовая цена.
      */

      price:
        basePrice,

      base_price:
        basePrice,

      /*
        Главная фотография.
      */

      image:
        imageUrls[0] ||
        manualImage ||
        "",

      image_url:
        imageUrls[0] ||
        manualImage ||
        "",

      /*
        Все фотографии.
      */

      images:
        imageUrls,

      gallery:
        imageUrls,

      /*
        НОВАЯ СТРУКТУРА.
      */

      price_options:
        priceOptions,

      /*
        Старые поля оставляем для
        совместимости с текущим backend.
      */

      colors:
        priceOptions.colors,

      memories:
        priceOptions.memories,

      sims:
        priceOptions.sims,

      regions:
        priceOptions.regions
    };

    console.log(
      "IRoom product payload:",
      payload
    );

    if (id) {

      await api(
        `/api/admin/products/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

    } else {

      await api(
        "/api/admin/products",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

    }

    closeModal(
      "productModal"
    );

    await loadProducts();

    updateDashboard();

    toast(
      id
        ? "Товар обновлён"
        : "Товар создан"
    );

  } catch (errorValue) {

    console.error(
      "Product save error:",
      errorValue
    );

    toast(
      errorValue?.message ||
      "Не удалось сохранить товар.",
      "error"
    );

  } finally {

    hideLoader();
  }
}


/* =========================================================
   DELETE PRODUCT
========================================================= */

async function deleteProduct(id) {
  if (
    !confirmDelete(
      "Удалить товар?"
    )
  ) {
    return;
  }

  showLoader();

  try {

    await api(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    await loadProducts();

    updateDashboard();

    toast(
      "Товар удалён"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось удалить товар.",
      "error"
    );

  } finally {

    hideLoader();
  }
}


/* =========================================================
   PRICE PREVIEW
========================================================= */

function updatePricePreview() {
  const base =
    number(
      $("#productPrice")?.value
    );

  let maximum =
    base;

  [
    "colors",
    "memories",
    "sims",
    "regions"
  ].forEach(group => {

    const options =
      readOptions(group);

    if (!options.length) {
      return;
    }

    const max =
      Math.max(
        ...options.map(
          option =>
            number(
              option.surcharge
            )
        )
      );

    maximum += max;
  });

  if ($("#previewBasePrice")) {
    $("#previewBasePrice").textContent =
      money(base);
  }

  if ($("#previewMaxPrice")) {
    $("#previewMaxPrice").textContent =
      money(maximum);
  }
}


/* =========================================================
   BANNERS
========================================================= */

async function loadBanners() {
  const data =
    await api("/api/banners");

  banners =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.banners)
        ? data.banners
        : [];

  renderBanners();
}

function renderBanners() {
  const container =
    $("#bannersList");

  if (!container) return;

  if (!banners.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML =
    banners
      .map(banner => {

        const image =
          banner.image ||
          banner.image_url ||
          "";

        const active =
          Number(
            banner.active ??
            banner.is_active ??
            0
          ) === 1;

        return `
          <article class="admin-banner-card">

            <div class="admin-banner-image">

              ${
                image
                  ? `
                    <img
                      src="${escapeHtml(image)}"
                      alt=""
                      loading="lazy"
                    >
                  `
                  : ""
              }

            </div>


            <div class="admin-banner-content">

              <div class="admin-banner-title">
                ${escapeHtml(
                  banner.title ||
                  "Без заголовка"
                )}
              </div>

              ${
                banner.text
                  ? `
                    <div class="admin-banner-text">
                      ${escapeHtml(
                        banner.text
                      )}
                    </div>
                  `
                  : ""
              }


              <div class="admin-banner-meta">

                <span>
                  ${
                    active
                      ? "Активен"
                      : "Скрыт"
                  }
                </span>

                <span>
                  Порядок:
                  ${banner.sort_order ?? 0}
                </span>

              </div>


              <div class="admin-banner-actions">

                <button
                  type="button"
                  data-edit-banner="${escapeHtml(banner.id)}"
                >
                  Изменить
                </button>

                <button
                  type="button"
                  data-delete-banner="${escapeHtml(banner.id)}"
                >
                  Удалить
                </button>

              </div>

            </div>

          </article>
        `;
      })
      .join("");

  $$("[data-edit-banner]").forEach(button => {
    button.addEventListener(
      "click",
      () =>
        openBannerEditor(
          button.dataset.editBanner
        )
    );
  });

  $$("[data-delete-banner]").forEach(button => {
    button.addEventListener(
      "click",
      () =>
        deleteBanner(
          button.dataset.deleteBanner
        )
    );
  });
}

function fillBannerProductSelect() {
  const select =
    $("#bannerProduct");

  if (!select) return;

  const current =
    select.value;

  select.innerHTML = `
    <option value="">
      Без товара
    </option>
  `;

  products.forEach(product => {

    const option =
      document.createElement(
        "option"
      );

    option.value =
      product.id;

    option.textContent =
      product.name ||
      `Товар #${product.id}`;

    select.appendChild(option);
  });

  if (current) {
    select.value = current;
  }
}

function resetBannerForm() {
  $("#bannerForm")?.reset();

  setValue("#bannerId", "");

  if ($("#bannerModalTitle")) {
    $("#bannerModalTitle").textContent =
      "Новый баннер";
  }

  setValue("#bannerImage", "");

  setValue("#bannerSortOrder", "0");
  setValue("#bannerActive", "1");

  if ($("#bannerImagePreview")) {
    $("#bannerImagePreview").innerHTML = "";
  }
}

function openBannerEditor(id = "") {
  resetBannerForm();

  if (!id) {
    openModal("bannerModal");
    return;
  }

  const banner =
    banners.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!banner) return;

  $("#bannerModalTitle").textContent =
    "Изменить баннер";

  setValue("#bannerId", banner.id);
  setValue("#bannerTitle", banner.title);
  setValue("#bannerText", banner.text);

  setValue(
    "#bannerImage",
    banner.image ??
    banner.image_url ??
    ""
  );

  setValue(
    "#bannerButtonText",
    banner.button_text
  );

  setValue(
    "#bannerButtonLink",
    banner.button_link ??
    banner.link ??
    ""
  );

  setValue(
    "#bannerProduct",
    banner.product_id ??
    ""
  );

  setValue(
    "#bannerSortOrder",
    banner.sort_order ??
    0
  );

  setValue(
    "#bannerActive",
    Number(
      banner.active ??
      banner.is_active ??
      0
    ) === 1
      ? "1"
      : "0"
  );

  renderImagePreview(
    "#bannerImagePreview",
    $("#bannerImage").value
  );

  openModal("bannerModal");
}

async function saveBanner(event) {
  event.preventDefault();

  const id =
    $("#bannerId").value.trim();

  const payload = {
    title:
      $("#bannerTitle").value.trim(),

    text:
      $("#bannerText").value.trim(),

    image:
      $("#bannerImage").value.trim(),

    button_text:
      $("#bannerButtonText").value.trim(),

    button_link:
      $("#bannerButtonLink").value.trim(),

    product_id:
      $("#bannerProduct").value ||
      null,

    sort_order:
      number(
        $("#bannerSortOrder").value
      ),

    active:
      number(
        $("#bannerActive").value
      )
  };

  showLoader();

  try {

    if (id) {

      await api(
        `/api/admin/banners/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

    } else {

      await api(
        "/api/admin/banners",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

    }

    closeModal("bannerModal");

    await loadBanners();

    updateDashboard();

    toast(
      id
        ? "Баннер обновлён"
        : "Баннер создан"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось сохранить баннер.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

async function deleteBanner(id) {
  if (
    !confirmDelete(
      "Удалить баннер?"
    )
  ) {
    return;
  }

  showLoader();

  try {

    await api(
      `/api/admin/banners/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    await loadBanners();

    updateDashboard();

    toast("Баннер удалён");

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось удалить баннер.",
      "error"
    );

  } finally {

    hideLoader();
  }
}


/* =========================================================
   RESERVATION
========================================================= */

async function loadReservation() {
  const data =
    await api("/api/reservation");

  const reservation =
    data?.reservation ||
    data ||
    {};

  const cards =
    data?.cards ||
    data?.reservation_cards ||
    [];

  reservationCards =
    Array.isArray(cards)
      ? cards
      : [];

  const amount =
    reservation.amount ??
    reservation.reservation_amount ??
    data?.reservation_amount ??
    1000;

  if ($("#reservationAmount")) {
    $("#reservationAmount").value =
      number(amount);
  }

  renderReservationCards();
}

function renderReservationCards() {
  const container =
    $("#reservationCardsList");

  if (!container) return;

  if (!reservationCards.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML =
    reservationCards
      .map(card => {

        const active =
          Number(
            card.active ??
            card.is_active ??
            0
          ) === 1;

        const isDefault =
          Number(
            card.is_default ??
            card.default_card ??
            0
          ) === 1;

        return `
          <article class="admin-reservation-card">

            <div class="reservation-card-top">

              <div class="reservation-card-number">
                ${escapeHtml(
                  card.card_number ||
                  card.number ||
                  "—"
                )}
              </div>

              <span class="reservation-card-status">
                ${
                  active
                    ? "Активна"
                    : "Скрыта"
                }
              </span>

            </div>


            <div class="reservation-card-info">

              ${escapeHtml(
                card.recipient ||
                "Получатель не указан"
              )}

              ${
                card.bank
                  ? ` · ${escapeHtml(card.bank)}`
                  : ""
              }

              ${
                isDefault
                  ? " · По умолчанию"
                  : ""
              }

            </div>


            <div class="reservation-card-actions">

              <button
                type="button"
                data-edit-reservation-card="${escapeHtml(card.id)}"
              >
                Изменить
              </button>

              <button
                type="button"
                data-delete-reservation-card="${escapeHtml(card.id)}"
              >
                Удалить
              </button>

            </div>

          </article>
        `;
      })
      .join("");

  $$("[data-edit-reservation-card]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          openReservationCardEditor(
            button.dataset.editReservationCard
          )
      );

    });

  $$("[data-delete-reservation-card]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          deleteReservationCard(
            button.dataset.deleteReservationCard
          )
      );

    });
}

function resetReservationCardForm() {
  $("#reservationCardForm")?.reset();

  setValue("#reservationCardId", "");

  if ($("#reservationCardModalTitle")) {
    $("#reservationCardModalTitle").textContent =
      "Новая карта";
  }

  if ($("#reservationCardActive")) {
    $("#reservationCardActive").checked = true;
  }

  if ($("#reservationCardDefault")) {
    $("#reservationCardDefault").checked = false;
  }
}

function openReservationCardEditor(id = "") {
  resetReservationCardForm();

  if (!id) {
    openModal("reservationCardModal");
    return;
  }

  const card =
    reservationCards.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!card) return;

  $("#reservationCardModalTitle").textContent =
    "Изменить карту";

  setValue(
    "#reservationCardId",
    card.id
  );

  setValue(
    "#reservationCardNumber",
    card.card_number ??
    card.number ??
    ""
  );

  setValue(
    "#reservationRecipient",
    card.recipient ??
    ""
  );

  setValue(
    "#reservationBank",
    card.bank ??
    ""
  );

  if ($("#reservationCardActive")) {
    $("#reservationCardActive").checked =
      Number(
        card.active ??
        card.is_active ??
        0
      ) === 1;
  }

  if ($("#reservationCardDefault")) {
    $("#reservationCardDefault").checked =
      Number(
        card.is_default ??
        card.default_card ??
        0
      ) === 1;
  }

  openModal(
    "reservationCardModal"
  );
}

async function saveReservationAmount() {
  const amount =
    number(
      $("#reservationAmount").value
    );

  if (amount < 0) {
    toast(
      "Сумма не может быть отрицательной.",
      "error"
    );

    return;
  }

  showLoader();

  try {

    await api(
      "/api/admin/settings",
      {
        method: "PUT",
        body: JSON.stringify({
          reservation_amount:
            amount
        })
      }
    );

    toast(
      "Сумма бронирования сохранена"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось сохранить сумму.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

async function saveReservationCard(event) {
  event.preventDefault();

  const id =
    $("#reservationCardId")
      .value
      .trim();

  const payload = {
    card_number:
      $("#reservationCardNumber")
        .value
        .trim(),

    recipient:
      $("#reservationRecipient")
        .value
        .trim(),

    bank:
      $("#reservationBank")
        .value
        .trim(),

    active:
      $("#reservationCardActive")
        .checked
        ? 1
        : 0,

    is_default:
      $("#reservationCardDefault")
        .checked
        ? 1
        : 0
  };

  if (!payload.card_number) {
    toast(
      "Введите номер карты.",
      "error"
    );

    return;
  }

  showLoader();

  try {

    if (id) {

      await api(
        `/api/admin/reservation-cards/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

    } else {

      await api(
        "/api/admin/reservation-cards",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

    }

    closeModal(
      "reservationCardModal"
    );

    await loadReservation();

    toast(
      id
        ? "Карта обновлена"
        : "Карта добавлена"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось сохранить карту.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

async function deleteReservationCard(id) {
  if (
    !confirmDelete(
      "Удалить эту карту?"
    )
  ) {
    return;
  }

  showLoader();

  try {

    await api(
      `/api/admin/reservation-cards/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    await loadReservation();

    toast("Карта удалена");

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось удалить карту.",
      "error"
    );

  } finally {

    hideLoader();
  }
}


/* =========================================================
   PICKUP POINTS
========================================================= */

async function loadPickupPoints() {
  const data =
    await api("/api/pickup-points");

  pickupPoints =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.pickup_points)
        ? data.pickup_points
        : [];

  renderPickupPoints();
}

function renderPickupPoints() {
  const container =
    $("#pickupList");

  if (!container) return;

  if (!pickupPoints.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML =
    pickupPoints
      .map(point => {

        const active =
          Number(
            point.active ??
            point.is_active ??
            0
          ) === 1;

        return `
          <article class="admin-pickup-card">

            <div class="pickup-card-header">

              <div class="pickup-card-name">
                ${escapeHtml(
                  point.name ||
                  "Пункт выдачи"
                )}
              </div>

              <span class="pickup-card-status">
                ${
                  active
                    ? "Активен"
                    : "Скрыт"
                }
              </span>

            </div>


            <div class="pickup-card-address">
              ${escapeHtml(
                point.address ||
                "Адрес не указан"
              )}
            </div>


            ${
              point.working_hours
                ? `
                  <div class="pickup-card-hours">
                    ${escapeHtml(
                      point.working_hours
                    )}
                  </div>
                `
                : ""
            }


            <div class="pickup-card-actions">

              <button
                type="button"
                data-edit-pickup="${escapeHtml(point.id)}"
              >
                Изменить
              </button>

              <button
                type="button"
                data-delete-pickup="${escapeHtml(point.id)}"
              >
                Удалить
              </button>

            </div>

          </article>
        `;
      })
      .join("");

  $$("[data-edit-pickup]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          openPickupEditor(
            button.dataset.editPickup
          )
      );

    });

  $$("[data-delete-pickup]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          deletePickup(
            button.dataset.deletePickup
          )
      );

    });
}

function resetPickupForm() {
  $("#pickupForm")?.reset();

  setValue("#pickupId", "");

  if ($("#pickupModalTitle")) {
    $("#pickupModalTitle").textContent =
      "Новый пункт";
  }

  setValue(
    "#pickupSortOrder",
    "0"
  );

  setValue(
    "#pickupActive",
    "1"
  );

  setValue(
    "#pickupVideoUrl",
    ""
  );

  if ($("#pickupVideoPreview")) {
    $("#pickupVideoPreview").innerHTML = "";
  }
}

function openPickupEditor(id = "") {
  resetPickupForm();

  if (!id) {
    openModal("pickupModal");
    return;
  }

  const point =
    pickupPoints.find(
      item =>
        String(item.id) ===
        String(id)
    );

  if (!point) return;

  $("#pickupModalTitle").textContent =
    "Изменить пункт";

  setValue("#pickupId", point.id);
  setValue("#pickupName", point.name);
  setValue("#pickupAddress", point.address);

  setValue(
    "#pickupWorkingHours",
    point.working_hours
  );

  setValue(
    "#pickupMapUrl",
    point.map_url ??
    point.map_link ??
    ""
  );

  setValue(
    "#pickupVideoUrl",
    point.video_url ??
    point.video ??
    ""
  );

  setValue(
    "#pickupDescription",
    point.description
  );

  setValue(
    "#pickupSortOrder",
    point.sort_order ??
    0
  );

  setValue(
    "#pickupActive",
    Number(
      point.active ??
      point.is_active ??
      0
    ) === 1
      ? "1"
      : "0"
  );

  renderVideoPreview(
    "#pickupVideoPreview",
    $("#pickupVideoUrl").value
  );

  openModal("pickupModal");
}

async function savePickup(event) {
  event.preventDefault();

  const id =
    $("#pickupId").value.trim();

  const payload = {
    name:
      $("#pickupName").value.trim(),

    address:
      $("#pickupAddress").value.trim(),

    working_hours:
      $("#pickupWorkingHours").value.trim(),

    map_url:
      $("#pickupMapUrl").value.trim(),

    video_url:
      $("#pickupVideoUrl").value.trim(),

    description:
      $("#pickupDescription").value.trim(),

    sort_order:
      number(
        $("#pickupSortOrder").value
      ),

    active:
      number(
        $("#pickupActive").value
      )
  };

  if (!payload.name) {
    toast(
      "Введите название пункта.",
      "error"
    );

    return;
  }

  showLoader();

  try {

    if (id) {

      await api(
        `/api/admin/pickup-points/${encodeURIComponent(id)}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

    } else {

      await api(
        "/api/admin/pickup-points",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

    }

    closeModal(
      "pickupModal"
    );

    await loadPickupPoints();

    toast(
      id
        ? "Пункт обновлён"
        : "Пункт добавлен"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось сохранить пункт.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

async function deletePickup(id) {
  if (
    !confirmDelete(
      "Удалить пункт выдачи?"
    )
  ) {
    return;
  }

  showLoader();

  try {

    await api(
      `/api/admin/pickup-points/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    await loadPickupPoints();

    toast(
      "Пункт удалён"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось удалить пункт.",
      "error"
    );

  } finally {

    hideLoader();
  }
}


/* =========================================================
   ORDERS
========================================================= */

async function loadOrders() {
  const data =
    await api("/api/admin/orders");

  orders =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.orders)
        ? data.orders
        : [];

  renderOrders();
}

function orderStatusLabel(status) {
  const labels = {
    new: "Новый",
    confirmed: "Подтверждён",
    processing: "В обработке",
    ready: "Готов к выдаче",
    completed: "Завершён",
    cancelled: "Отменён",
    rejected: "Отклонён"
  };

  return labels[status] ||
    status ||
    "—";
}

function reservationStatusLabel(status) {
  const labels = {
    not_required: "Не требуется",
    pending: "Ожидает проверки",
    awaiting_confirmation: "Ожидает проверки",
    confirmed: "Подтверждена",
    rejected: "Отклонена"
  };

  return labels[status] ||
    status ||
    "—";
}

function fulfillmentLabel(type) {
  if (
    type === "pickup" ||
    type === "самовывоз"
  ) {
    return "Самовывоз";
  }

  if (
    type === "delivery" ||
    type === "доставка"
  ) {
    return "Доставка";
  }

  return type || "—";
}

function getOrderStatus(order) {
  return (
    order.status ||
    order.order_status ||
    "new"
  );
}

function getReservationStatus(order) {
  return (
    order.reservation_status ||
    "not_required"
  );
}

function filterOrders(list) {
  if (
    currentOrderFilter ===
    "all"
  ) {
    return list;
  }

  return list.filter(order => {

    const status =
      getOrderStatus(order);

    return (
      status ===
      currentOrderFilter
    );
  });
}

function renderOrders() {
  const container =
    $("#ordersList");

  if (!container) return;

  const visibleOrders =
    filterOrders(orders);

  if (!visibleOrders.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML =
    visibleOrders
      .map(order => {

        const productImage =
          order.product_image ||
          order.image ||
          "";

        const productName =
          order.product_name ||
          order.product ||
          "Товар";

        const orderNumber =
          order.order_number ||
          order.number ||
          `#${order.id}`;

        const status =
          getOrderStatus(order);

        const reservation =
          getReservationStatus(order);

        const total =
          number(
            order.final_price ??
            order.total_price ??
            order.price ??
            0
          );

        return `
          <article class="admin-order-card">

            <div class="admin-order-header">

              <div>

                <div class="admin-order-number">
                  ${escapeHtml(
                    orderNumber
                  )}
                </div>

                <div class="admin-order-date">
                  ${escapeHtml(
                    formatDate(
                      order.created_at ||
                      order.createdAt
                    )
                  )}
                </div>

              </div>

              <div class="admin-order-status">
                ${escapeHtml(
                  orderStatusLabel(
                    status
                  )
                )}
              </div>

            </div>


            <div class="admin-order-product-only">

              <div class="admin-order-product-image">

                ${
                  productImage
                    ? `
                      <img
                        src="${escapeHtml(productImage)}"
                        alt=""
                      >
                    `
                    : ""
                }

              </div>


              <div class="admin-order-product-info">

                <strong>
                  ${escapeHtml(
                    productName
                  )}
                </strong>

                <span>
                  ${money(total)}
                </span>

                <span>
                  ${escapeHtml(
                    fulfillmentLabel(
                      order.fulfillment_type ||
                      order.fulfillment
                    )
                  )}
                </span>

                <span>
                  Бронь:
                  ${escapeHtml(
                    reservationStatusLabel(
                      reservation
                    )
                  )}
                </span>

              </div>

            </div>


            <div class="admin-order-footer">

              <button
                type="button"
                data-open-order="${escapeHtml(order.id)}"
              >
                Подробнее
              </button>

              <select
                class="order-status-select"
                data-order-status="${escapeHtml(order.id)}"
              >

                ${renderOrderStatusOptions(status)}

              </select>

            </div>

          </article>
        `;
      })
      .join("");

  $$("[data-open-order]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () =>
          openOrderDetails(
            button.dataset.openOrder
          )
      );

    });

  $$("[data-order-status]")
    .forEach(select => {

      select.addEventListener(
        "change",
        () =>
          quickUpdateOrderStatus(
            select.dataset.orderStatus,
            select.value
          )
      );

    });
}

function renderOrderStatusOptions(current) {
  const statuses = [
    ["new", "Новый"],
    ["confirmed", "Подтверждён"],
    ["processing", "В обработке"],
    ["ready", "Готов к выдаче"],
    ["completed", "Завершён"],
    ["cancelled", "Отменён"],
    ["rejected", "Отклонён"]
  ];

  return statuses
    .map(
      ([value, label]) =>
        `
          <option
            value="${value}"
            ${value === current ? "selected" : ""}
          >
            ${label}
          </option>
        `
    )
    .join("");
}

async function quickUpdateOrderStatus(
  id,
  status
) {
  showLoader();

  try {

    await api(
      `/api/admin/orders/${encodeURIComponent(id)}/status`,
      {
        method: "PUT",
        body: JSON.stringify({
          status
        })
      }
    );

    await loadOrders();

    toast(
      "Статус заказа обновлён"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось изменить статус.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

async function openOrderDetails(id) {
  showLoader();

  try {

    let order =
      orders.find(
        item =>
          String(item.id) ===
          String(id)
      );

    try {

      const data =
        await api(
          `/api/admin/orders/${encodeURIComponent(id)}`
        );

      order =
        data?.order ||
        data ||
        order;

    } catch {}

    if (!order) {
      throw new Error(
        "Заказ не найден."
      );
    }

    currentOrderId = id;
    currentOrder = order;

    renderOrderDetails(order);

    openModal(
      "orderModal"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось открыть заказ.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

function renderOrderDetails(order) {
  const container =
    $("#orderDetails");

  if (!container) return;

  const status =
    getOrderStatus(order);

  const reservation =
    getReservationStatus(order);

  const options =
    order.options ||
    order.selected_options ||
    {};

  const optionText =
    typeof options === "string"
      ? options
      : Object.entries(options)
          .map(
            ([key, value]) =>
              `${key}: ${value}`
          )
          .join(" · ");

  const fulfillment =
    fulfillmentLabel(
      order.fulfillment_type ||
      order.fulfillment
    );

  const total =
    number(
      order.final_price ??
      order.total_price ??
      order.price ??
      0
    );

  const reservationAmount =
    number(
      order.reservation_amount ??
      0
    );

  const customerName =
    order.customer_name ||
    order.user_name ||
    order.username ||
    "—";

  const customerUsername =
    order.customer_username ||
    order.username ||
    "";

  const customerPhone =
    order.phone ||
    order.customer_phone ||
    "";

  const address = [
    order.delivery_city,
    order.delivery_street,
    order.delivery_house,
    order.delivery_apartment
      ? `кв. ${order.delivery_apartment}`
      : ""
  ]
    .filter(Boolean)
    .join(", ");

  container.innerHTML = `

    <div class="admin-detail-row">
      <span>Номер</span>
      <strong>
        ${escapeHtml(
          order.order_number ||
          order.number ||
          `#${order.id}`
        )}
      </strong>
    </div>


    <div class="admin-detail-row">
      <span>Дата</span>
      <strong>
        ${escapeHtml(
          formatDate(
            order.created_at ||
            order.createdAt
          )
        )}
      </strong>
    </div>


    <div class="admin-detail-row">
      <span>Товар</span>
      <strong>
        ${escapeHtml(
          order.product_name ||
          order.product ||
          "—"
        )}
      </strong>
    </div>


    ${
      optionText
        ? `
          <div class="admin-detail-row">
            <span>Характеристики</span>
            <strong>
              ${escapeHtml(
                optionText
              )}
            </strong>
          </div>
        `
        : ""
    }


    <div class="admin-detail-row">
      <span>Итоговая цена</span>
      <strong>
        ${money(total)}
      </strong>
    </div>


    <div class="admin-detail-row">
      <span>Клиент</span>
      <strong>
        ${escapeHtml(
          customerName
        )}
      </strong>
    </div>


    ${
      customerUsername
        ? `
          <div class="admin-detail-row">
            <span>Username</span>
            <strong>
              ${escapeHtml(
                customerUsername
              )}
            </strong>
          </div>
        `
        : ""
    }


    ${
      customerPhone
        ? `
          <div class="admin-detail-row">
            <span>Телефон</span>
            <strong>
              ${escapeHtml(
                customerPhone
              )}
            </strong>
          </div>
        `
        : ""
    }


    <div class="admin-detail-row">
      <span>Получение</span>
      <strong>
        ${escapeHtml(
          fulfillment
        )}
      </strong>
    </div>


    ${
      fulfillment === "Самовывоз"
        ? `
          <div class="admin-detail-row">
            <span>Пункт</span>
            <strong>
              ${escapeHtml(
                order.pickup_point_name ||
                order.pickup_address ||
                "—"
              )}
            </strong>
          </div>
        `
        : ""
    }


    ${
      fulfillment === "Доставка" &&
      address
        ? `
          <div class="admin-detail-row">
            <span>Адрес</span>
            <strong>
              ${escapeHtml(
                address
              )}
            </strong>
          </div>
        `
        : ""
    }


    ${
      order.customer_comment
        ? `
          <div class="admin-detail-comment">

            <strong>
              Комментарий клиента
            </strong>

            <br><br>

            ${escapeHtml(
              order.customer_comment
            )}

          </div>
        `
        : ""
    }

  `;

  if ($("#orderStatusSelect")) {
    $("#orderStatusSelect").value =
      status;
  }

  if ($("#reservationStatusSelect")) {
    $("#reservationStatusSelect").value =
      reservation;
  }
}

async function saveOrderStatus() {
  if (!currentOrderId) return;

  const status =
    $("#orderStatusSelect").value;

  await quickUpdateOrderStatus(
    currentOrderId,
    status
  );
}

async function saveReservationStatus() {
  if (!currentOrderId) return;

  const status =
    $("#reservationStatusSelect").value;

  showLoader();

  try {

    await api(
      `/api/admin/orders/${encodeURIComponent(currentOrderId)}/reservation`,
      {
        method: "PUT",
        body: JSON.stringify({
          reservation_status:
            status
        })
      }
    );

    await loadOrders();

    currentOrder =
      orders.find(
        order =>
          String(order.id) ===
          String(currentOrderId)
      ) ||
      currentOrder;

    if (currentOrder) {
      renderOrderDetails(
        currentOrder
      );
    }

    toast(
      "Статус бронирования обновлён"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось изменить бронь.",
      "error"
    );

  } finally {

    hideLoader();
  }
}


/* =========================================================
   SETTINGS
========================================================= */

let storeSettings = {};

async function loadSettings() {
  const data =
    await api("/api/settings");

  storeSettings =
    data?.settings ||
    data ||
    {};

  setValue(
    "#settingStoreName",
    storeSettings.store_name ||
    storeSettings.name ||
    ""
  );

  setValue(
    "#settingContactUsername",
    storeSettings.contact_username ||
    ""
  );

  setValue(
    "#settingContactUrl",
    storeSettings.contact_url ||
    ""
  );

  setValue(
    "#settingChannelUsername",
    storeSettings.channel_username ||
    ""
  );

  setValue(
    "#settingChannelUrl",
    storeSettings.channel_url ||
    ""
  );

  setValue(
    "#settingReservationText",
    storeSettings.reservation_text ||
    ""
  );

  setValue(
    "#settingPickupText",
    storeSettings.pickup_text ||
    ""
  );

  setValue(
    "#settingDeliveryText",
    storeSettings.delivery_text ||
    ""
  );

  if (
    $("#reservationAmount") &&
    storeSettings.reservation_amount !== undefined
  ) {
    $("#reservationAmount").value =
      number(
        storeSettings.reservation_amount
      );
  }
}

async function saveSettings() {
  const payload = {
    store_name:
      $("#settingStoreName").value.trim(),

    contact_username:
      $("#settingContactUsername").value.trim(),

    contact_url:
      $("#settingContactUrl").value.trim(),

    channel_username:
      $("#settingChannelUsername").value.trim(),

    channel_url:
      $("#settingChannelUrl").value.trim(),

    reservation_text:
      $("#settingReservationText").value.trim(),

    pickup_text:
      $("#settingPickupText").value.trim(),

    delivery_text:
      $("#settingDeliveryText").value.trim()
  };

  showLoader();

  try {

    await api(
      "/api/admin/settings",
      {
        method: "PUT",
        body: JSON.stringify(payload)
      }
    );

    toast(
      "Настройки сохранены"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось сохранить настройки.",
      "error"
    );

  } finally {

    hideLoader();
  }
}


/* =========================================================
   GENERIC UPLOADS
========================================================= */

async function uploadFile(
  file,
  type = "image"
) {
  if (!file) {
    throw new Error(
      "Файл не выбран."
    );
  }

  const formData =
    new FormData();

  formData.append(
    "file",
    file
  );

  formData.append(
    "type",
    type
  );

  const data =
    await api(
      "/api/admin/upload",
      {
        method: "POST",
        body: formData
      }
    );

  const url =
    data?.url ||
    data?.path ||
    data?.file?.url ||
    data?.file?.path ||
    data?.location ||
    data?.file?.location ||
    "";

  return url;
}

async function handleImageUpload(
  inputSelector,
  targetSelector,
  previewSelector
) {
  const input =
    $(inputSelector);

  const file =
    input?.files?.[0];

  if (!file) return;

  showLoader();

  try {

    const url =
      await uploadFile(
        file,
        "image"
      );

    if (!url) {
      throw new Error(
        "Сервер не вернул адрес файла."
      );
    }

    $(targetSelector).value =
      url;

    renderImagePreview(
      previewSelector,
      url
    );

    toast(
      "Изображение загружено"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось загрузить изображение.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

async function handleVideoUpload() {
  const input =
    $("#pickupVideoFile");

  const file =
    input?.files?.[0];

  if (!file) return;

  showLoader();

  try {

    const url =
      await uploadFile(
        file,
        "video"
      );

    if (!url) {
      throw new Error(
        "Сервер не вернул адрес видео."
      );
    }

    $("#pickupVideoUrl").value =
      url;

    renderVideoPreview(
      "#pickupVideoPreview",
      url
    );

    toast(
      "Видео загружено"
    );

  } catch (errorValue) {

    console.error(errorValue);

    toast(
      errorValue?.message ||
      "Не удалось загрузить видео.",
      "error"
    );

  } finally {

    hideLoader();
  }
}

function renderImagePreview(
  selector,
  url
) {
  const container =
    $(selector);

  if (!container) return;

  if (!url) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <img
      src="${escapeHtml(url)}"
      alt=""
      onerror="this.parentElement.innerHTML=''"
    >
  `;
}

function renderVideoPreview(
  selector,
  url
) {
  const container =
    $(selector);

  if (!container) return;

  if (!url) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <video
      src="${escapeHtml(url)}"
      controls
      playsinline
    ></video>
  `;
}


/* =========================================================
   EVENTS
========================================================= */

function setupEvents() {

  /* Refresh */

  $("#refreshAllButton")
    ?.addEventListener(
      "click",
      refreshAll
    );

  $("#accessRetryButton")
    ?.addEventListener(
      "click",
      checkAccess
    );


  /* Tabs */

  setupTabs();


  /* =======================================================
     PRODUCTS
  ======================================================= */

  $("#addProductButton")
    ?.addEventListener(
      "click",
      () =>
        openProductEditor()
    );

  $("#productForm")
    ?.addEventListener(
      "submit",
      saveProduct
    );

  $("#productPrice")
    ?.addEventListener(
      "input",
      updatePricePreview
    );


  /* =======================================================
     PRODUCT MULTI IMAGE
  ======================================================= */

  $("#productImageUploadButton")
    ?.addEventListener(
      "click",
      () => {
        $("#productImageFile")?.click();
      }
    );

  $("#productImageFile")
    ?.addEventListener(
      "change",
      event => {

        addProductImageFiles(
          event.target.files
        );

        /*
          Даём снова выбрать те же
          файлы на iPhone.
        */

        event.target.value = "";
      }
    );


  /* =======================================================
     CATEGORY
  ======================================================= */

  $("#addCategoryButton")
    ?.addEventListener(
      "click",
      () =>
        openCategoryEditor()
    );

  $("#categoryForm")
    ?.addEventListener(
      "submit",
      saveCategory
    );


  /* =======================================================
     BANNERS
  ======================================================= */

  $("#addBannerButton")
    ?.addEventListener(
      "click",
      () =>
        openBannerEditor()
    );

  $("#bannerForm")
    ?.addEventListener(
      "submit",
      saveBanner
    );


  /* =======================================================
     RESERVATION
  ======================================================= */

  $("#addReservationCardButton")
    ?.addEventListener(
      "click",
      () =>
        openReservationCardEditor()
    );

  $("#reservationCardForm")
    ?.addEventListener(
      "submit",
      saveReservationCard
    );

  $("#saveReservationAmountButton")
    ?.addEventListener(
      "click",
      saveReservationAmount
    );


  /* =======================================================
     PICKUP
  ======================================================= */

  $("#addPickupButton")
    ?.addEventListener(
      "click",
      () =>
        openPickupEditor()
    );

  $("#pickupForm")
    ?.addEventListener(
      "submit",
      savePickup
    );


  /* =======================================================
     ORDERS
  ======================================================= */

  $("#refreshOrdersButton")
    ?.addEventListener(
      "click",
      async () => {

        showLoader();

        try {

          await loadOrders();

          toast(
            "Заказы обновлены"
          );

        } catch (errorValue) {

          toast(
            errorValue?.message ||
            "Не удалось обновить заказы.",
            "error"
          );

        } finally {

          hideLoader();

        }

      }
    );

  $("#saveOrderStatusButton")
    ?.addEventListener(
      "click",
      saveOrderStatus
    );

  $("#saveReservationStatusButton")
    ?.addEventListener(
      "click",
      saveReservationStatus
    );


  /* =======================================================
     SETTINGS
  ======================================================= */

  $("#saveSettingsButton")
    ?.addEventListener(
      "click",
      saveSettings
    );


  /* =======================================================
     ORDER FILTERS
  ======================================================= */

  $$(".filter-button")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          currentOrderFilter =
            button.dataset.orderFilter ||
            "all";

          $$(".filter-button")
            .forEach(item => {

              item.classList.toggle(
                "active",
                item === button
              );

            });

          renderOrders();
        }
      );

    });


  /* =======================================================
     OPTIONS
  ======================================================= */

  $$("[data-add-option]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          addOptionRow(
            button.dataset.addOption
          );

          updatePricePreview();

        }
      );

    });


  /* =======================================================
     CATEGORY IMAGE
  ======================================================= */

  $("#categoryImageUploadButton")
    ?.addEventListener(
      "click",
      () =>
        $("#categoryImageFile")?.click()
    );

  $("#categoryImageFile")
    ?.addEventListener(
      "change",
      () =>
        handleImageUpload(
          "#categoryImageFile",
          "#categoryImage",
          "#categoryImagePreview"
        )
    );


  /* =======================================================
     BANNER IMAGE
  ======================================================= */

  $("#bannerImageUploadButton")
    ?.addEventListener(
      "click",
      () =>
        $("#bannerImageFile")?.click()
    );

  $("#bannerImageFile")
    ?.addEventListener(
      "change",
      () =>
        handleImageUpload(
          "#bannerImageFile",
          "#bannerImage",
          "#bannerImagePreview"
        )
    );


  /* =======================================================
     VIDEO
  ======================================================= */

  $("#pickupVideoUploadButton")
    ?.addEventListener(
      "click",
      () =>
        $("#pickupVideoFile")?.click()
    );

  $("#pickupVideoFile")
    ?.addEventListener(
      "change",
      handleVideoUpload
    );


  /* =======================================================
     MANUAL IMAGE URL
  ======================================================= */

  $("#productImage")
    ?.addEventListener(
      "input",
      event => {

        /*
          Если пользователь вручную
          вставил URL — добавляем его
          в галерею как существующую
          фотографию.
        */

        const value =
          event.target.value.trim();

        if (
          value &&
          !productImages.some(
            item =>
              item.url === value
          )
        ) {

          const already =
            productImages.length === 0;

          if (already) {

            productImages.push({
              file: null,
              url: value,
              preview: value
            });

            renderProductImageGallery();
          }

        }

      }
    );


  $("#categoryImage")
    ?.addEventListener(
      "input",
      event =>
        renderImagePreview(
          "#categoryImagePreview",
          event.target.value.trim()
        )
    );


  $("#bannerImage")
    ?.addEventListener(
      "input",
      event =>
        renderImagePreview(
          "#bannerImagePreview",
          event.target.value.trim()
        )
    );


  $("#pickupVideoUrl")
    ?.addEventListener(
      "input",
      event =>
        renderVideoPreview(
          "#pickupVideoPreview",
          event.target.value.trim()
        )
    );


  /* =======================================================
     MODAL CLOSE
  ======================================================= */

  $$("[data-close-modal]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          closeModal(
            button.dataset.closeModal
          );

        }
      );

    });


  /* =======================================================
     MODAL BACKDROP
  ======================================================= */

  $$(".modal")
    .forEach(modal => {

      const backdrop =
        $(".modal-backdrop", modal);

      backdrop?.addEventListener(
        "click",
        () => {
          closeModal(
            modal.id
          );
        }
      );

    });


  /* =======================================================
     ESC
  ======================================================= */

  document.addEventListener(
    "keydown",
    event => {

      if (event.key === "Escape") {
        closeAllModals();
      }

    }
  );
}


/* =========================================================
   INIT
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    setupEvents();

    /*
      Сразу рисуем пустую галерею.
    */

    renderProductImageGallery();

    checkAccess();

  }
);