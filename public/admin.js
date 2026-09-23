const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#070707");
    tg.setBackgroundColor("#070707");
  } catch {}
}

const state = {
  products: [],
  categories: [],
  settings: {},
  editingProductId: null,
  editingCategoryId: null,
  uploadedImageUrl: "",
  toastTimer: null
};


/* =========================================================
   HELPERS
   ========================================================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("ru-RU")
    .format(number)
    .replaceAll("\u00A0", ".");
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function showAdminContent() {
  $("accessLoading").classList.add("hidden");
  $("accessDenied").classList.add("hidden");
  $("adminContent").classList.remove("hidden");
}

function showAccessDenied(message = "Нет доступа") {
  $("accessLoading").classList.add("hidden");
  $("adminContent").classList.add("hidden");
  $("accessDenied").classList.remove("hidden");

  const title = $("accessDenied").querySelector("h2");

  if (title) {
    title.textContent = message;
  }
}


/* =========================================================
   API
   ========================================================= */

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (tg?.initData) {
    headers["x-telegram-init-data"] = tg.initData;
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  let data = {};

  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data.error ||
      `Ошибка сервера: ${response.status}`
    );
  }

  return data;
}


/* =========================================================
   AUTH
   ========================================================= */

async function checkAdmin() {
  try {
    if (!tg?.initData) {
      showAccessDenied("Откройте через Telegram");
      return false;
    }

    const data = await api("/api/admin/me");

    if (!data.ok || !data.admin) {
      showAccessDenied();
      return false;
    }

    showAdminContent();

    return true;
  } catch (error) {
    console.error(error);

    showAccessDenied(
      error.message || "Нет доступа"
    );

    return false;
  }
}


/* =========================================================
   LOAD DATA
   ========================================================= */

async function loadProducts() {
  const data = await api("/api/admin/products");

  state.products = data.products || [];

  renderProducts();
  updateStats();
}

async function loadCategories() {
  const data = await api("/api/admin/categories");

  state.categories = data.categories || [];

  renderCategories();
  fillProductCategories();
  updateStats();
}

async function loadSettings() {
  const data = await api("/api/settings");

  state.settings = data.settings || {};

  $("storeName").value =
    state.settings.store_name || "iroom";

  $("contactUsername").value =
    state.settings.contact_username || "";
}

async function loadAll() {
  await Promise.all([
    loadProducts(),
    loadCategories(),
    loadSettings()
  ]);
}


/* =========================================================
   STATS
   ========================================================= */

function updateStats() {
  $("productsCount").textContent =
    state.products.length;

  $("newProductsCount").textContent =
    state.products.filter(
      product => Number(product.is_new) === 1
    ).length;

  $("categoriesCount").textContent =
    state.categories.length;
}


/* =========================================================
   PRODUCTS
   ========================================================= */

function productImageUrl(product) {
  if (!product.image_url) {
    return "";
  }

  return product.image_url;
}

function productDescription(product) {
  return [
    product.memory,
    product.color,
    product.version
  ]
    .filter(Boolean)
    .join(" • ");
}

function renderProducts() {
  const container = $("productsList");

  if (!state.products.length) {
    container.innerHTML = `
      <div class="empty-state">
        Пока нет товаров.<br>
        Нажмите «+ Товар», чтобы добавить первый.
      </div>
    `;

    return;
  }

  container.innerHTML = state.products
    .map(product => {
      const imageUrl = productImageUrl(product);

      const image = imageUrl
        ? `
          <img
            src="${escapeHtml(imageUrl)}"
            alt=""
            loading="lazy"
          >
        `
        : `
          <div class="item-image-placeholder">
            Нет фото
          </div>
        `;

      const meta = productDescription(product);

      return `
        <article class="item-card">

          <div class="item-image">
            ${image}
          </div>

          <div class="item-info">

            <div class="item-title">
              ${escapeHtml(product.name)}
            </div>

            <div class="item-meta">

              ${
                product.category_name
                  ? `
                    <span>
                      ${escapeHtml(product.category_name)}
                    </span>
                  `
                  : ""
              }

              ${
                meta
                  ? `
                    <span>
                      ${escapeHtml(meta)}
                    </span>
                  `
                  : ""
              }

              ${
                Number(product.is_new) === 1
                  ? `
                    <span class="badge">
                      НОВИНКА
                    </span>
                  `
                  : ""
              }

            </div>

            <div class="item-price">
              ${formatPrice(product.price)}
            </div>

          </div>

          <div class="item-actions">

            <button
              class="small-button"
              type="button"
              data-edit-product="${product.id}"
              aria-label="Редактировать"
            >
              ✎
            </button>

            <button
              class="small-button delete"
              type="button"
              data-delete-product="${product.id}"
              aria-label="Удалить"
            >
              ×
            </button>

          </div>

        </article>
      `;
    })
    .join("");
}


/* =========================================================
   PRODUCT CATEGORIES
   ========================================================= */

function fillProductCategories() {
  const select = $("productCategory");

  const currentValue = select.value;

  select.innerHTML = `
    <option value="">
      Без категории
    </option>
  `;

  for (const category of state.categories) {
    if (Number(category.active) !== 1) {
      continue;
    }

    const option = document.createElement("option");

    option.value = category.id;
    option.textContent = category.name;

    select.appendChild(option);
  }

  if (currentValue) {
    select.value = currentValue;
  }
}


/* =========================================================
   PRODUCT MODAL
   ========================================================= */

function resetProductForm() {
  state.editingProductId = null;
  state.uploadedImageUrl = "";

  $("productModalTitle").textContent =
    "Новый товар";

  $("productId").value = "";

  $("productName").value = "";
  $("productMemory").value = "";
  $("productColor").value = "";
  $("productVersion").value = "";
  $("productPrice").value = "";

  $("productCategory").value = "";

  $("productIsNew").checked = false;
  $("productNewSort").value = "0";
  $("productActive").checked = true;

  $("imagePreview").src = "";
  $("imagePreview").classList.add("hidden");
  $("imagePlaceholder").classList.remove("hidden");
}

function openProductModal(product = null) {
  resetProductForm();

  if (product) {
    state.editingProductId = product.id;
    state.uploadedImageUrl =
      product.image_url || "";

    $("productModalTitle").textContent =
      "Редактировать товар";

    $("productId").value =
      product.id;

    $("productName").value =
      product.name || "";

    $("productMemory").value =
      product.memory || "";

    $("productColor").value =
      product.color || "";

    $("productVersion").value =
      product.version || "";

    $("productPrice").value =
      product.price ?? "";

    $("productCategory").value =
      product.category_id ?? "";

    $("productIsNew").checked =
      Number(product.is_new) === 1;

    $("productNewSort").value =
      product.new_sort_order ?? 0;

    $("productActive").checked =
      Number(product.active) !== 0;

    if (product.image_url) {
      $("imagePreview").src =
        product.image_url;

      $("imagePreview").classList.remove(
        "hidden"
      );

      $("imagePlaceholder").classList.add(
        "hidden"
      );
    }
  }

  $("productModal").classList.remove("hidden");
}

function closeProductModal() {
  $("productModal").classList.add("hidden");
}


/* =========================================================
   PRODUCT IMAGE
   ========================================================= */

async function uploadProductImage(file) {
  if (!file) {
    return;
  }

  showToast("Загружаем фото...");

  try {
    const formData = new FormData();

    formData.append("image", file);

    const data = await api(
      "/api/admin/upload",
      {
        method: "POST",
        body: formData
      }
    );

    state.uploadedImageUrl =
      data.image_url || "";

    $("imagePreview").src =
      state.uploadedImageUrl;

    $("imagePreview").classList.remove(
      "hidden"
    );

    $("imagePlaceholder").classList.add(
      "hidden"
    );

    showToast("Фото загружено");
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось загрузить фото"
    );
  }
}


/* =========================================================
   SAVE PRODUCT
   ========================================================= */

async function saveProduct(event) {
  event.preventDefault();

  const payload = {
    name: $("productName").value.trim(),

    memory:
      $("productMemory").value.trim(),

    color:
      $("productColor").value.trim(),

    version:
      $("productVersion").value.trim(),

    price:
      Number($("productPrice").value || 0),

    image_url:
      state.uploadedImageUrl,

    category_id:
      $("productCategory").value || null,

    is_new:
      $("productIsNew").checked,

    new_sort_order:
      Number(
        $("productNewSort").value || 0
      ),

    active:
      $("productActive").checked
  };

  try {
    if (!payload.name) {
      showToast("Введите название товара");
      return;
    }

    if (state.editingProductId) {
      await api(
        `/api/admin/products/${state.editingProductId}`,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify(payload)
        }
      );

      showToast("Товар сохранён");
    } else {
      await api(
        "/api/admin/products",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify(payload)
        }
      );

      showToast("Товар добавлен");
    }

    closeProductModal();

    await loadProducts();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить товар"
    );
  }
}


/* =========================================================
   DELETE PRODUCT
   ========================================================= */

async function deleteProduct(id) {
  const product =
    state.products.find(
      item => String(item.id) === String(id)
    );

  if (!product) {
    return;
  }

  const confirmed = confirm(
    `Удалить товар «${product.name}»?`
  );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      `/api/admin/products/${id}`,
      {
        method: "DELETE"
      }
    );

    showToast("Товар удалён");

    await loadProducts();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось удалить товар"
    );
  }
}


/* =========================================================
   CATEGORIES
   ========================================================= */

function renderCategories() {
  const container = $("categoriesList");

  if (!state.categories.length) {
    container.innerHTML = `
      <div class="empty-state">
        Категорий пока нет.
      </div>
    `;

    return;
  }

  container.innerHTML =
    state.categories
      .map(category => `
        <article class="item-card">

          <div class="item-image">

            ${
              category.image_url
                ? `
                  <img
                    src="${escapeHtml(category.image_url)}"
                    alt=""
                  >
                `
                : `
                  <div class="item-image-placeholder">
                    ${escapeHtml(
                      category.name
                    )}
                  </div>
                `
            }

          </div>

          <div class="item-info">

            <div class="item-title">
              ${escapeHtml(category.name)}
            </div>

            <div class="item-meta">

              <span>
                ${escapeHtml(category.slug)}
              </span>

              <span>
                Порядок: ${category.sort_order}
              </span>

              ${
                Number(category.active) === 1
                  ? `
                    <span class="badge">
                      АКТИВНА
                    </span>
                  `
                  : ""
              }

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

            <button
              class="small-button delete"
              type="button"
              data-delete-category="${category.id}"
            >
              ×
            </button>

          </div>

        </article>
      `)
      .join("");
}


/* =========================================================
   CATEGORY MODAL
   ========================================================= */

function resetCategoryForm() {
  state.editingCategoryId = null;

  $("categoryModalTitle").textContent =
    "Новая категория";

  $("categoryId").value = "";

  $("categoryName").value = "";
  $("categorySlug").value = "";
  $("categorySort").value = "0";
  $("categoryActive").checked = true;
}

function openCategoryModal(category = null) {
  resetCategoryForm();

  if (category) {
    state.editingCategoryId =
      category.id;

    $("categoryModalTitle").textContent =
      "Редактировать категорию";

    $("categoryId").value =
      category.id;

    $("categoryName").value =
      category.name || "";

    $("categorySlug").value =
      category.slug || "";

    $("categorySort").value =
      category.sort_order ?? 0;

    $("categoryActive").checked =
      Number(category.active) !== 0;
  }

  $("categoryModal").classList.remove(
    "hidden"
  );
}

function closeCategoryModal() {
  $("categoryModal").classList.add(
    "hidden"
  );
}


/* =========================================================
   SAVE CATEGORY
   ========================================================= */

async function saveCategory(event) {
  event.preventDefault();

  const payload = {
    name:
      $("categoryName").value.trim(),

    slug:
      $("categorySlug").value.trim(),

    sort_order:
      Number(
        $("categorySort").value || 0
      ),

    active:
      $("categoryActive").checked
  };

  try {
    if (!payload.name) {
      showToast(
        "Введите название категории"
      );

      return;
    }

    if (state.editingCategoryId) {
      await api(
        `/api/admin/categories/${state.editingCategoryId}`,
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify(payload)
        }
      );

      showToast(
        "Категория сохранена"
      );
    } else {
      await api(
        "/api/admin/categories",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify(payload)
        }
      );

      showToast(
        "Категория добавлена"
      );
    }

    closeCategoryModal();

    await loadCategories();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить категорию"
    );
  }
}


/* =========================================================
   DELETE CATEGORY
   ========================================================= */

async function deleteCategory(id) {
  const category =
    state.categories.find(
      item => String(item.id) === String(id)
    );

  if (!category) {
    return;
  }

  const confirmed = confirm(
    `Удалить категорию «${category.name}»?`
  );

  if (!confirmed) {
    return;
  }

  try {
    await api(
      `/api/admin/categories/${id}`,
      {
        method: "DELETE"
      }
    );

    showToast("Категория удалена");

    await loadCategories();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось удалить категорию"
    );
  }
}


/* =========================================================
   SETTINGS
   ========================================================= */

async function saveSettings() {
  const payload = {
    store_name:
      $("storeName").value.trim(),

    contact_username:
      $("contactUsername")
        .value
        .trim()
        .replace(/^@/, "")
  };

  try {
    await api(
      "/api/admin/settings",
      {
        method: "PUT",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify(payload)
      }
    );

    showToast(
      "Настройки сохранены"
    );
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить настройки"
    );
  }
}


/* =========================================================
   TABS
   ========================================================= */

function switchTab(tabName) {
  document
    .querySelectorAll(".tab")
    .forEach(tab => {
      tab.classList.toggle(
        "active",
        tab.dataset.tab === tabName
      );
    });

  $("productsTab")
    .classList.toggle(
      "hidden",
      tabName !== "products"
    );

  $("categoriesTab")
    .classList.toggle(
      "hidden",
      tabName !== "categories"
    );

  $("settingsTab")
    .classList.toggle(
      "hidden",
      tabName !== "settings"
    );
}


/* =========================================================
   EVENTS
   ========================================================= */

function setupEvents() {

  /* tabs */

  document
    .querySelectorAll(".tab")
    .forEach(tab => {
      tab.addEventListener(
        "click",
        () => {
          switchTab(
            tab.dataset.tab
          );
        }
      );
    });


  /* add product */

  $("addProductButton")
    .addEventListener(
      "click",
      () => {
        openProductModal();
      }
    );


  /* add category */

  $("addCategoryButton")
    .addEventListener(
      "click",
      () => {
        openCategoryModal();
      }
    );


  /* product image */

  $("imageUploadButton")
    .addEventListener(
      "click",
      () => {
        $("productImage").click();
      }
    );


  $("productImage")
    .addEventListener(
      "change",
      async event => {
        const file =
          event.target.files?.[0];

        await uploadProductImage(file);

        event.target.value = "";
      }
    );


  /* product form */

  $("productForm")
    .addEventListener(
      "submit",
      saveProduct
    );


  /* category form */

  $("categoryForm")
    .addEventListener(
      "submit",
      saveCategory
    );


  /* settings */

  $("saveSettingsButton")
    .addEventListener(
      "click",
      saveSettings
    );


  /* close modal */

  document
    .querySelectorAll(
      "[data-close]"
    )
    .forEach(button => {
      button.addEventListener(
        "click",
        () => {
          const id =
            button.dataset.close;

          $(id)?.classList.add(
            "hidden"
          );
        }
      );
    });


  /* modal overlays */

  document
    .querySelectorAll(
      ".modal-overlay"
    )
    .forEach(overlay => {
      overlay.addEventListener(
        "click",
        () => {
          overlay
            .closest(".modal")
            ?.classList.add("hidden");
        }
      );
    });


  /* product actions */

  $("productsList")
    .addEventListener(
      "click",
      event => {

        const editButton =
          event.target.closest(
            "[data-edit-product]"
          );

        if (editButton) {
          const id =
            editButton.dataset
              .editProduct;

          const product =
            state.products.find(
              item =>
                String(item.id) ===
                String(id)
            );

          if (product) {
            openProductModal(product);
          }

          return;
        }


        const deleteButton =
          event.target.closest(
            "[data-delete-product]"
          );

        if (deleteButton) {
          deleteProduct(
            deleteButton.dataset
              .deleteProduct
          );
        }

      }
    );


  /* category actions */

  $("categoriesList")
    .addEventListener(
      "click",
      event => {

        const editButton =
          event.target.closest(
            "[data-edit-category]"
          );

        if (editButton) {
          const id =
            editButton.dataset
              .editCategory;

          const category =
            state.categories.find(
              item =>
                String(item.id) ===
                String(id)
            );

          if (category) {
            openCategoryModal(
              category
            );
          }

          return;
        }


        const deleteButton =
          event.target.closest(
            "[data-delete-category]"
          );

        if (deleteButton) {
          deleteCategory(
            deleteButton.dataset
              .deleteCategory
          );
        }

      }
    );


  /* close Telegram */

  $("closeButton")
    .addEventListener(
      "click",
      () => {

        if (tg) {
          tg.close();
        } else {
          window.history.back();
        }

      }
    );


  /* Telegram back button */

  if (tg?.BackButton) {

    tg.BackButton.show();

    tg.BackButton.onClick(
      () => {

        if (
          !$("productModal")
            .classList.contains(
              "hidden"
            )
        ) {
          closeProductModal();
          return;
        }

        if (
          !$("categoryModal")
            .classList.contains(
              "hidden"
            )
        ) {
          closeCategoryModal();
          return;
        }

        tg.close();
      }
    );

  }
}


/* =========================================================
   INIT
   ========================================================= */

async function init() {
  try {

    const authorized =
      await checkAdmin();

    if (!authorized) {
      return;
    }

    setupEvents();

    await loadAll();

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Не удалось загрузить админ-панель"
    );

  }
}

init();