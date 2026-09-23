const tg =
  window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor(
      "#050505"
    );

    tg.setBackgroundColor(
      "#050505"
    );
  } catch {}
}

const $ = (id) =>
  document.getElementById(id);

let products = [];
let categories = [];

let editingProductId = null;
let editingCategoryId = null;

let selectedImageFile = null;
let currentImageUrl = "";
let imageWasDeleted = false;

let toastTimer = null;

/* =========================================================
   TOAST
========================================================= */

function showToast(
  message
) {
  const toast =
    $("toast");

  if (!toast) return;

  toast.textContent =
    message;

  toast.classList.add(
    "show"
  );

  clearTimeout(
    toastTimer
  );

  toastTimer =
    setTimeout(() => {
      toast.classList.remove(
        "show"
      );
    }, 2500);
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

  if (tg?.initData) {
    headers[
      "x-telegram-init-data"
    ] = tg.initData;
  }

  if (
    !(options.body instanceof FormData)
  ) {
    headers[
      "Content-Type"
    ] =
      "application/json";
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
  } catch {
    data = {};
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
   ACCESS
========================================================= */

async function checkAccess() {
  const loading =
    $("loadingScreen");

  const denied =
    $("deniedScreen");

  const content =
    $("adminContent");

  try {
    if (!tg?.initData) {
      throw new Error(
        "Откройте админ-панель через Telegram."
      );
    }

    const result =
      await api(
        "/api/admin/me"
      );

    if (
      !result?.admin
    ) {
      throw new Error(
        "У вас нет доступа к админ-панели."
      );
    }

    loading?.classList.add(
      "hidden"
    );

    denied?.classList.add(
      "hidden"
    );

    content?.classList.remove(
      "hidden"
    );

    await loadEverything();

  } catch (error) {
    console.error(error);

    loading?.classList.add(
      "hidden"
    );

    content?.classList.add(
      "hidden"
    );

    if (
      $("deniedText")
    ) {
      $("deniedText")
        .textContent =
        error.message ||
        "Не удалось проверить доступ.";
    }

    denied?.classList.remove(
      "hidden"
    );
  }
}

/* =========================================================
   LOAD
========================================================= */

async function loadEverything() {
  await Promise.all([
    loadProducts(),
    loadCategories()
  ]);

  renderStats();
  renderProducts();
  renderCategories();
}

/* =========================================================
   PRODUCTS
========================================================= */

async function loadProducts() {
  const result =
    await api(
      "/api/admin/products"
    );

  products =
    Array.isArray(
      result?.products
    )
      ? result.products
      : [];
}

function renderStats() {
  if (
    $("totalProducts")
  ) {
    $("totalProducts")
      .textContent =
      products.length;
  }

  if (
    $("totalNew")
  ) {
    $("totalNew")
      .textContent =
      products.filter(
        (product) =>
          Number(
            product.is_new
          ) === 1
      ).length;
  }

  if (
    $("totalCategories")
  ) {
    $("totalCategories")
      .textContent =
      categories.length;
  }
}

function getCategoryName(
  categoryId
) {
  const category =
    categories.find(
      (item) =>
        String(item.id) ===
        String(categoryId)
    );

  return (
    category?.name ||
    "Без категории"
  );
}

function getProductImage(
  product
) {
  return (
    product?.image_url ||
    ""
  );
}

function formatPrice(
  price
) {
  const number =
    Number(price);

  if (
    !Number.isFinite(
      number
    ) ||
    number <= 0
  ) {
    return "Цена не указана";
  }

  return new Intl
    .NumberFormat(
      "ru-RU"
    )
    .format(number);
}

function renderProducts() {
  const container =
    $("productsList");

  if (!container) {
    return;
  }

  container.innerHTML =
    "";

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        Товаров пока нет.<br>
        Добавьте первый товар.
      </div>
    `;

    return;
  }

  for (
    const product of products
  ) {
    const card =
      document.createElement(
        "div"
      );

    card.className =
      "item-card";

    const image =
      getProductImage(
        product
      );

    const active =
      Number(
        product.active
      ) === 1;

    const isNew =
      Number(
        product.is_new
      ) === 1;

    card.innerHTML = `
      <div class="item-image">

        ${
          image
            ? `
              <img
                src="${escapeAttribute(
                  image
                )}"
                alt=""
              >
            `
            : `
              <div class="item-image-placeholder">
                #
              </div>
            `
        }

      </div>

      <div class="item-info">

        <h3>
          ${escapeHtml(
            product.name ||
            "Без названия"
          )}
        </h3>

        <p>
          ${escapeHtml(
            [
              product.memory,
              product.color,
              product.version,
              getCategoryName(
                product.category_id
              )
            ]
              .filter(Boolean)
              .join(" · ")
          )}
        </p>

        <div class="item-price">
          ${escapeHtml(
            formatPrice(
              product.price
            )
          )}
        </div>

        <div class="badges">

          ${
            isNew
              ? `
                <span class="badge pink">
                  Новинка
                </span>
              `
              : ""
          }

          <span
            class="badge ${
              active
                ? "green"
                : ""
            }"
          >
            ${
              active
                ? "Активен"
                : "Скрыт"
            }
          </span>

        </div>

      </div>

      <div class="item-actions">

        <button
          class="small-button"
          type="button"
          data-edit-product="${product.id}"
        >
          ✎
        </button>

      </div>
    `;

    container.appendChild(
      card
    );
  }

  container
    .querySelectorAll(
      "[data-edit-product]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            openProductModal(
              button.dataset
                .editProduct
            );
          }
        );
      }
    );
}

/* =========================================================
   CATEGORY SELECT
========================================================= */

function fillCategorySelect() {
  const select =
    $("productCategory");

  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">
      Без категории
    </option>
  `;

  categories.forEach(
    (category) => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        category.id;

      option.textContent =
        category.name;

      select.appendChild(
        option
      );
    }
  );
}

/* =========================================================
   PRODUCT IMAGE PREVIEW
========================================================= */

function renderImagePreview() {
  const preview =
    $("productImagePreview");

  const cancelButton =
    $("cancelImageButton");

  const deleteButton =
    $("deleteImageButton");

  if (!preview) {
    return;
  }

  let imageUrl =
    "";

  if (
    selectedImageFile
  ) {
    imageUrl =
      URL.createObjectURL(
        selectedImageFile
      );
  } else if (
    currentImageUrl &&
    !imageWasDeleted
  ) {
    imageUrl =
      currentImageUrl;
  }

  if (imageUrl) {
    preview.classList.remove(
      "empty"
    );

    preview.innerHTML = `
      <img
        src="${escapeAttribute(
          imageUrl
        )}"
        alt=""
      >
    `;
  } else {
    preview.classList.add(
      "empty"
    );

    preview.innerHTML = `
      <div class="photo-placeholder">

        <svg viewBox="0 0 24 24">

          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="2"
          ></rect>

          <circle
            cx="8.5"
            cy="9"
            r="1.5"
          ></circle>

          <path
            d="M21 15l-4-4-5 5-2-2-5 5"
          ></path>

        </svg>

        <span>
          Фото товара
        </span>

      </div>
    `;
  }

  cancelButton?.classList.toggle(
    "hidden",
    !selectedImageFile
  );

  deleteButton?.classList.toggle(
    "hidden",
    !currentImageUrl ||
      imageWasDeleted ||
      Boolean(
        selectedImageFile
      )
  );
}

/* =========================================================
   OPEN PRODUCT
========================================================= */

function openProductModal(
  productId = null
) {
  editingProductId =
    productId
      ? Number(productId)
      : null;

  const product =
    editingProductId
      ? products.find(
          (item) =>
            Number(item.id) ===
            editingProductId
        )
      : null;

  $("productModalTitle")
    .textContent =
    product
      ? "Редактировать товар"
      : "Новый товар";

  $("productName").value =
    product?.name || "";

  $("productMemory").value =
    product?.memory || "";

  $("productColor").value =
    product?.color || "";

  $("productVersion").value =
    product?.version || "";

  $("productPrice").value =
    product?.price ?? "";

  fillCategorySelect();

  $("productCategory")
    .value =
    product?.category_id
      ? String(
          product.category_id
        )
      : "";

  $("productIsNew")
    .checked =
    Number(
      product?.is_new
    ) === 1;

  $("productNewOrder")
    .value =
    product?.new_sort_order ??
    0;

  $("productActive")
    .checked =
    product
      ? Number(
          product.active
        ) === 1
      : true;

  $("deleteProductButton")
    ?.classList.toggle(
      "hidden",
      !product
    );

  selectedImageFile =
    null;

  currentImageUrl =
    getProductImage(
      product || {}
    );

  imageWasDeleted =
    false;

  $("productImageInput")
    .value = "";

  updateNewOrderVisibility();

  renderImagePreview();

  $("productModal")
    ?.classList.remove(
      "hidden"
    );

  document.body.style.overflow =
    "hidden";
}

/* =========================================================
   CLOSE PRODUCT
========================================================= */

function closeProductModal() {
  $("productModal")
    ?.classList.add(
      "hidden"
    );

  document.body.style.overflow =
    "";

  editingProductId =
    null;

  selectedImageFile =
    null;

  currentImageUrl =
    "";

  imageWasDeleted =
    false;

  if (
    $("productImageInput")
  ) {
    $("productImageInput")
      .value = "";
  }
}

/* =========================================================
   SAVE PRODUCT
========================================================= */

async function saveProduct() {
  const name =
    $("productName")
      ?.value
      .trim();

  if (!name) {
    showToast(
      "Введите название товара"
    );

    return;
  }

  const button =
    $("saveProductButton");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Сохраняем...";
  }

  try {
    let finalImageUrl =
      currentImageUrl;

    /* UPLOAD */

    if (
      selectedImageFile
    ) {
      const formData =
        new FormData();

      formData.append(
        "image",
        selectedImageFile
      );

      const uploaded =
        await api(
          "/api/admin/upload",
          {
            method:
              "POST",

            body:
              formData
          }
        );

      finalImageUrl =
        uploaded?.image_url ||
        "";

      if (
        !finalImageUrl
      ) {
        throw new Error(
          "Сервер не вернул адрес изображения"
        );
      }
    }

    /* DELETE IMAGE */

    if (
      imageWasDeleted &&
      !selectedImageFile
    ) {
      finalImageUrl =
        "";
    }

    const payload = {
      name,

      memory:
        $("productMemory")
          ?.value
          .trim() ||
        "",

      color:
        $("productColor")
          ?.value
          .trim() ||
        "",

      version:
        $("productVersion")
          ?.value
          .trim() ||
        "",

      price:
        Number(
          $("productPrice")
            ?.value ||
            0
        ),

      category_id:
        $("productCategory")
          ?.value
          ? Number(
              $("productCategory")
                .value
            )
          : null,

      is_new:
        $("productIsNew")
          ?.checked
          ? 1
          : 0,

      new_sort_order:
        Number(
          $("productNewOrder")
            ?.value ||
            0
        ),

      active:
        $("productActive")
          ?.checked
          ? 1
          : 0,

      image_url:
        finalImageUrl || ""
    };

    if (
      editingProductId
    ) {
      await api(
        `/api/admin/products/${editingProductId}`,
        {
          method:
            "PUT",

          body:
            JSON.stringify(
              payload
            )
        }
      );

      showToast(
        "Товар обновлён"
      );

    } else {
      await api(
        "/api/admin/products",
        {
          method:
            "POST",

          body:
            JSON.stringify(
              payload
            )
        }
      );

      showToast(
        "Товар добавлен"
      );
    }

    closeProductModal();

    await loadProducts();

    renderStats();
    renderProducts();

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить товар"
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Сохранить товар";
    }
  }
}

/* =========================================================
   DELETE PRODUCT
========================================================= */

async function deleteProduct() {
  if (
    !editingProductId
  ) {
    return;
  }

  const product =
    products.find(
      (item) =>
        Number(item.id) ===
        editingProductId
    );

  if (!product) {
    return;
  }

  const confirmed =
    confirm(
      `Удалить товар «${product.name || ""}»?`
    );

  if (!confirmed) {
    return;
  }

  const button =
    $("deleteProductButton");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Удаляем...";
  }

  try {
    await api(
      `/api/admin/products/${editingProductId}`,
      {
        method:
          "DELETE"
      }
    );

    showToast(
      "Товар удалён"
    );

    closeProductModal();

    await loadProducts();

    renderStats();
    renderProducts();

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось удалить товар"
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Удалить товар";
    }
  }
}

/* =========================================================
   IMAGE EVENTS
========================================================= */

$("chooseImageButton")
  ?.addEventListener(
    "click",
    () => {
      $("productImageInput")
        ?.click();
    }
  );

$("productImageInput")
  ?.addEventListener(
    "change",
    () => {
      const file =
        $("productImageInput")
          ?.files?.[0];

      if (!file) {
        return;
      }

      if (
        !file.type.startsWith(
          "image/"
        )
      ) {
        showToast(
          "Выберите изображение"
        );

        $("productImageInput")
          .value = "";

        return;
      }

      if (
        file.size >
        10 *
          1024 *
          1024
      ) {
        showToast(
          "Фото должно быть меньше 10 МБ"
        );

        $("productImageInput")
          .value = "";

        return;
      }

      selectedImageFile =
        file;

      imageWasDeleted =
        false;

      renderImagePreview();
    }
  );

$("cancelImageButton")
  ?.addEventListener(
    "click",
    () => {
      selectedImageFile =
        null;

      $("productImageInput")
        .value = "";

      renderImagePreview();
    }
  );

$("deleteImageButton")
  ?.addEventListener(
    "click",
    () => {
      selectedImageFile =
        null;

      imageWasDeleted =
        true;

      $("productImageInput")
        .value = "";

      renderImagePreview();
    }
  );

/* =========================================================
   NEW ORDER
========================================================= */

function updateNewOrderVisibility() {
  const row =
    $("newOrderRow");

  const checkbox =
    $("productIsNew");

  if (!row || !checkbox) {
    return;
  }

  row.classList.toggle(
    "hidden",
    !checkbox.checked
  );
}

$("productIsNew")
  ?.addEventListener(
    "change",
    updateNewOrderVisibility
  );

/* =========================================================
   CATEGORIES
========================================================= */

async function loadCategories() {
  const result =
    await api(
      "/api/admin/categories"
    );

  categories =
    Array.isArray(
      result?.categories
    )
      ? result.categories
      : [];
}

function renderCategories() {
  const container =
    $("categoriesList");

  if (!container) {
    return;
  }

  container.innerHTML =
    "";

  if (!categories.length) {
    container.innerHTML = `
      <div class="empty-state">
        Категорий пока нет.
      </div>
    `;

    return;
  }

  for (
    const category of
      categories
  ) {
    const card =
      document.createElement(
        "div"
      );

    card.className =
      "item-card";

    const active =
      Number(
        category.active
      ) === 1;

    const count =
      products.filter(
        (product) =>
          String(
            product.category_id
          ) ===
          String(
            category.id
          )
      ).length;

    card.innerHTML = `
      <div class="item-image">

        <div class="item-image-placeholder">
          #
        </div>

      </div>

      <div class="item-info">

        <h3>
          ${escapeHtml(
            category.name ||
            "Без названия"
          )}
        </h3>

        <p>
          ${escapeHtml(
            category.slug ||
            ""
          )}
          · ${count} товаров
        </p>

        <div class="badges">

          <span
            class="badge ${
              active
                ? "green"
                : ""
            }"
          >
            ${
              active
                ? "Активна"
                : "Скрыта"
            }
          </span>

        </div>

      </div>

      <div class="item-actions">

        <button
          class="small-button"
          type="button"
          data-edit-category="${category.id}"
        >
          ✎
        </button>

      </div>
    `;

    container.appendChild(
      card
    );
  }

  container
    .querySelectorAll(
      "[data-edit-category]"
    )
    .forEach(
      (button) => {
        button.addEventListener(
          "click",
          () => {
            openCategoryModal(
              button.dataset
                .editCategory
            );
          }
        );
      }
    );
}

/* =========================================================
   OPEN CATEGORY
========================================================= */

function openCategoryModal(
  categoryId = null
) {
  editingCategoryId =
    categoryId
      ? Number(
          categoryId
        )
      : null;

  const category =
    editingCategoryId
      ? categories.find(
          (item) =>
            Number(
              item.id
            ) ===
            editingCategoryId
        )
      : null;

  $("categoryModalTitle")
    .textContent =
    category
      ? "Редактировать категорию"
      : "Новая категория";

  $("categoryName")
    .value =
    category?.name ||
    "";

  $("categorySlug")
    .value =
    category?.slug ||
    "";

  $("categorySortOrder")
    .value =
    category?.sort_order ??
    0;

  $("categoryActive")
    .checked =
    category
      ? Number(
          category.active
        ) === 1
      : true;

  $("deleteCategoryButton")
    ?.classList.toggle(
      "hidden",
      !category
    );

  $("categoryModal")
    ?.classList.remove(
      "hidden"
    );

  document.body.style.overflow =
    "hidden";
}

/* =========================================================
   CLOSE CATEGORY
========================================================= */

function closeCategoryModal() {
  $("categoryModal")
    ?.classList.add(
      "hidden"
    );

  document.body.style.overflow =
    "";

  editingCategoryId =
    null;
}

/* =========================================================
   SAVE CATEGORY
========================================================= */

async function saveCategory() {
  const name =
    $("categoryName")
      ?.value
      .trim();

  if (!name) {
    showToast(
      "Введите название категории"
    );

    return;
  }

  const button =
    $("saveCategoryButton");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Сохраняем...";
  }

  try {
    let slug =
      $("categorySlug")
        ?.value
        .trim();

    if (!slug) {
      slug =
        name
          .toLowerCase()
          .replace(
            /\s+/g,
            "-"
          )
          .replace(
            /[^a-z0-9а-яё-]/gi,
            ""
          );
    }

    const payload = {
      name,

      slug,

      sort_order:
        Number(
          $("categorySortOrder")
            ?.value ||
            0
        ),

      active:
        $("categoryActive")
          ?.checked
          ? 1
          : 0
    };

    if (
      editingCategoryId
    ) {
      await api(
        `/api/admin/categories/${editingCategoryId}`,
        {
          method:
            "PUT",

          body:
            JSON.stringify(
              payload
            )
        }
      );

      showToast(
        "Категория обновлена"
      );

    } else {
      await api(
        "/api/admin/categories",
        {
          method:
            "POST",

          body:
            JSON.stringify(
              payload
            )
        }
      );

      showToast(
        "Категория добавлена"
      );
    }

    closeCategoryModal();

    await loadCategories();

    renderStats();
    renderCategories();

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить категорию"
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Сохранить категорию";
    }
  }
}

/* =========================================================
   DELETE CATEGORY
========================================================= */

async function deleteCategory() {
  if (
    !editingCategoryId
  ) {
    return;
  }

  const category =
    categories.find(
      (item) =>
        Number(item.id) ===
        editingCategoryId
    );

  if (!category) {
    return;
  }

  const productsCount =
    products.filter(
      (product) =>
        String(
          product.category_id
        ) ===
        String(
          editingCategoryId
        )
    ).length;

  if (
    productsCount > 0
  ) {
    showToast(
      `В категории ещё ${productsCount} товаров`
    );

    return;
  }

  const confirmed =
    confirm(
      `Удалить категорию «${category.name}»?`
    );

  if (!confirmed) {
    return;
  }

  const button =
    $("deleteCategoryButton");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Удаляем...";
  }

  try {
    await api(
      `/api/admin/categories/${editingCategoryId}`,
      {
        method:
          "DELETE"
      }
    );

    showToast(
      "Категория удалена"
    );

    closeCategoryModal();

    await loadCategories();

    renderStats();
    renderCategories();

  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось удалить категорию"
    );

  } finally {
    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Удалить категорию";
    }
  }
}

/* =========================================================
   TABS
========================================================= */

document
  .querySelectorAll(
    ".tab"
  )
  .forEach(
    (tab) => {
      tab.addEventListener(
        "click",
        () => {
          const target =
            tab.dataset.tab;

          document
            .querySelectorAll(
              ".tab"
            )
            .forEach(
              (item) => {
                item.classList.toggle(
                  "active",
                  item ===
                    tab
                );
              }
            );

          $("productsTab")
            ?.classList.toggle(
              "hidden",
              target !==
                "products"
            );

          $("categoriesTab")
            ?.classList.toggle(
              "hidden",
              target !==
                "categories"
            );
        }
      );
    }
  );

/* =========================================================
   BUTTONS
========================================================= */

$("addProductButton")
  ?.addEventListener(
    "click",
    () => {
      openProductModal();
    }
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

$("addCategoryButton")
  ?.addEventListener(
    "click",
    () => {
      openCategoryModal();
    }
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

$("closeAdminButton")
  ?.addEventListener(
    "click",
    () => {
      window.location.href =
        "/";
    }
  );

$("closeDeniedButton")
  ?.addEventListener(
    "click",
    () => {
      window.location.href =
        "/";
    }
  );

$("adminLogo")
  ?.addEventListener(
    "click",
    () => {
      window.location.href =
        "/";
    }
  );

/* =========================================================
   MODAL CLOSE
========================================================= */

document
  .querySelectorAll(
    "[data-close-product]"
  )
  .forEach(
    (element) => {
      element.addEventListener(
        "click",
        closeProductModal
      );
    }
  );

document
  .querySelectorAll(
    "[data-close-category]"
  )
  .forEach(
    (element) => {
      element.addEventListener(
        "click",
        closeCategoryModal
      );
    }
  );

/* =========================================================
   TELEGRAM BACK
========================================================= */

if (tg) {
  try {
    tg.BackButton.show();

    tg.BackButton.onClick(
      () => {
        window.location.href =
          "/";
      }
    );
  } catch {}
}

/* =========================================================
   HELPERS
========================================================= */

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    )
    .replaceAll(
      "'",
      "&#039;"
    );
}

function escapeAttribute(
  value
) {
  return escapeHtml(
    value
  );
}

/* =========================================================
   START
========================================================= */

checkAccess();