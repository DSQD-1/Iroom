const tg = window.Telegram?.WebApp;

let products = [];
let categories = [];
let settings = {};

let editingProductId = null;
let editingCategoryId = null;

let selectedImageFile = null;
let currentImageUrl = "";
let uploadedTempImageUrl = "";

const $ = (id) => document.getElementById(id);

function initTelegram() {
  if (!tg) return;

  tg.ready();
  tg.expand();

  if (tg.setHeaderColor) {
    tg.setHeaderColor("#08080a");
  }

  if (tg.setBackgroundColor) {
    tg.setBackgroundColor("#08080a");
  }
}

function getInitData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-telegram-init-data": getInitData()
  };

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
      data.message ||
      `Ошибка ${response.status}`
    );
  }

  return data;
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("ru-RU").format(number);
}

function showElement(id) {
  $(id)?.classList.remove("hidden");
}

function hideElement(id) {
  $(id)?.classList.add("hidden");
}

function closeModal(id) {
  const modal = $(id);

  if (!modal) return;

  modal.classList.add("hidden");
  modal.classList.remove("show");
}

function openModal(id) {
  const modal = $(id);

  if (!modal) return;

  modal.classList.remove("hidden");

  requestAnimationFrame(() => {
    modal.classList.add("show");
  });
}

async function checkAdmin() {
  try {
    const result = await api("/api/admin/me");

    if (!result.admin) {
      showElement("deniedScreen");
      hideElement("loadingScreen");
      hideElement("adminContent");
      return false;
    }

    hideElement("loadingScreen");
    hideElement("deniedScreen");
    showElement("adminContent");

    return true;
  } catch (error) {
    console.error(error);

    hideElement("loadingScreen");
    showElement("deniedScreen");

    const deniedText = $("deniedText");

    if (deniedText) {
      deniedText.textContent =
        error.message || "Не удалось проверить доступ";
    }

    return false;
  }
}

async function loadAll() {
  const [
    productsData,
    categoriesData,
    settingsData
  ] = await Promise.all([
    api("/api/admin/products"),
    api("/api/admin/categories"),
    api("/api/settings")
  ]);

  products = Array.isArray(productsData)
    ? productsData
    : productsData.products || [];

  categories = Array.isArray(categoriesData)
    ? categoriesData
    : categoriesData.categories || [];

  settings = settingsData || {};

  renderStats();
  renderProducts();
  renderCategories();
  renderSettings();
}

function renderStats() {
  const totalProducts = $("totalProducts");
  const totalNew = $("totalNew");
  const totalCategories = $("totalCategories");

  if (totalProducts) {
    totalProducts.textContent = products.length;
  }

  if (totalNew) {
    totalNew.textContent = products.filter(
      (product) => Number(product.is_new) === 1
    ).length;
  }

  if (totalCategories) {
    totalCategories.textContent = categories.length;
  }
}

function getCategoryName(categoryId) {
  const category = categories.find(
    (item) => Number(item.id) === Number(categoryId)
  );

  return category?.name || "Без категории";
}

function renderProducts() {
  const container = $("productsList");

  if (!container) return;

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        Товаров пока нет
      </div>
    `;

    return;
  }

  container.innerHTML = products.map((product) => {
    const image = product.image_url
      ? `<img src="${escapeHtml(product.image_url)}" class="item-image" alt="">`
      : `<div class="item-image placeholder-image">IR</div>`;

    return `
      <div class="item-card">
        ${image}

        <div class="item-info">
          <div class="item-title">
            ${escapeHtml(product.name || "Без названия")}
          </div>

          <div class="item-meta">
            ${escapeHtml(product.memory || "")}
            ${product.color ? ` · ${escapeHtml(product.color)}` : ""}
          </div>

          <div class="item-meta">
            ${escapeHtml(getCategoryName(product.category_id))}
          </div>

          <div class="item-price">
            ${formatPrice(product.price)} ₽
          </div>

          <div class="item-status">
            ${
              Number(product.active) === 1
                ? `<span class="badge">Активен</span>`
                : `<span class="badge badge-muted">Скрыт</span>`
            }

            ${
              Number(product.is_new) === 1
                ? `<span class="badge badge-pink">Новинка</span>`
                : ""
            }
          </div>
        </div>

        <div class="item-actions">
          <button
            class="small-button"
            type="button"
            onclick="editProduct(${Number(product.id)})"
          >
            Изменить
          </button>

          <button
            class="small-button danger-button"
            type="button"
            onclick="deleteProduct(${Number(product.id)})"
          >
            Удалить
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function renderCategories() {
  const container = $("categoriesList");

  if (!container) return;

  if (!categories.length) {
    container.innerHTML = `
      <div class="empty-state">
        Категорий пока нет
      </div>
    `;

    return;
  }

  container.innerHTML = categories.map((category) => `
    <div class="item-card">
      <div class="item-info">
        <div class="item-title">
          ${escapeHtml(category.name || "")}
        </div>

        <div class="item-meta">
          ${escapeHtml(category.slug || "")}
        </div>

        <div class="item-status">
          ${
            Number(category.active) === 1
              ? `<span class="badge">Активна</span>`
              : `<span class="badge badge-muted">Скрыта</span>`
          }
        </div>
      </div>

      <div class="item-actions">
        <button
          class="small-button"
          type="button"
          onclick="editCategory(${Number(category.id)})"
        >
          Изменить
        </button>

        <button
          class="small-button danger-button"
          type="button"
          onclick="deleteCategory(${Number(category.id)})"
        >
          Удалить
        </button>
      </div>
    </div>
  `).join("");
}

function renderSettings() {
  const storeName = $("settingStoreName");
  const contactUsername = $("settingContactUsername");

  if (storeName) {
    storeName.value = settings.store_name || "";
  }

  if (contactUsername) {
    contactUsername.value = settings.contact_username || "";
  }
}

function resetProductImageState() {
  selectedImageFile = null;
  currentImageUrl = "";
  uploadedTempImageUrl = "";

  const input = $("productImageInput");
  const preview = $("productImagePreview");
  const imageActions = $("productImageActions");

  if (input) {
    input.value = "";
  }

  if (preview) {
    preview.innerHTML = `
      <div class="image-preview-empty">
        Фото не выбрано
      </div>
    `;
  }

  if (imageActions) {
    imageActions.classList.add("hidden");
  }
}

function renderProductImage() {
  const preview = $("productImagePreview");
  const imageActions = $("productImageActions");

  if (!preview) return;

  if (selectedImageFile) {
    const objectUrl = URL.createObjectURL(selectedImageFile);

    preview.innerHTML = `
      <img
        src="${objectUrl}"
        class="image-preview-img"
        alt=""
      />
    `;

    if (imageActions) {
      imageActions.classList.remove("hidden");
    }

    return;
  }

  if (currentImageUrl) {
    preview.innerHTML = `
      <img
        src="${escapeHtml(currentImageUrl)}"
        class="image-preview-img"
        alt=""
      />
    `;

    if (imageActions) {
      imageActions.classList.remove("hidden");
    }

    return;
  }

  preview.innerHTML = `
    <div class="image-preview-empty">
      Фото не выбрано
    </div>
  `;

  if (imageActions) {
    imageActions.classList.add("hidden");
  }
}

function openNewProduct() {
  editingProductId = null;

  resetProductImageState();

  $("productModalTitle").textContent = "Новый товар";

  $("productName").value = "";
  $("productMemory").value = "";
  $("productColor").value = "";
  $("productVersion").value = "";
  $("productPrice").value = "";

  $("productCategory").value =
    categories[0]?.id || "";

  $("productIsNew").checked = false;
  $("productNewOrder").value = "";
  $("productActive").checked = true;

  openModal("productModal");
}

function editProduct(id) {
  const product = products.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!product) return;

  editingProductId = Number(product.id);

  selectedImageFile = null;
  uploadedTempImageUrl = "";
  currentImageUrl = product.image_url || "";

  const input = $("productImageInput");

  if (input) {
    input.value = "";
  }

  $("productModalTitle").textContent = "Изменить товар";

  $("productName").value = product.name || "";
  $("productMemory").value = product.memory || "";
  $("productColor").value = product.color || "";
  $("productVersion").value = product.version || "";
  $("productPrice").value = product.price || "";

  $("productCategory").value =
    product.category_id || "";

  $("productIsNew").checked =
    Number(product.is_new) === 1;

  $("productNewOrder").value =
    product.new_order ?? "";

  $("productActive").checked =
    Number(product.active) === 1;

  renderProductImage();

  openModal("productModal");
}

async function uploadImage(file) {
  const formData = new FormData();

  formData.append("image", file);

  const result = await api("/api/admin/upload", {
    method: "POST",
    body: formData
  });

  if (!result.image_url) {
    throw new Error("Сервер не вернул image_url");
  }

  return result.image_url;
}

async function deleteImageByUrl(imageUrl) {
  if (!imageUrl) return;

  const match = String(imageUrl).match(
    /\/api\/images\/([^/?#]+)/
  );

  if (!match) return;

  try {
    await api(
      `/api/admin/images/${encodeURIComponent(match[1])}`,
      {
        method: "DELETE"
      }
    );
  } catch (error) {
    console.warn(
      "Не удалось удалить изображение:",
      error
    );
  }
}

function removeProductImage() {
  selectedImageFile = null;
  currentImageUrl = "";

  const input = $("productImageInput");

  if (input) {
    input.value = "";
  }

  renderProductImage();
}

async function cancelSelectedImage() {
  if (uploadedTempImageUrl) {
    await deleteImageByUrl(uploadedTempImageUrl);
    uploadedTempImageUrl = "";
  }

  selectedImageFile = null;

  const input = $("productImageInput");

  if (input) {
    input.value = "";
  }

  renderProductImage();
}

async function saveProduct() {
  const name = $("productName").value.trim();
  const memory = $("productMemory").value.trim();
  const color = $("productColor").value.trim();
  const version = $("productVersion").value.trim();
  const price = $("productPrice").value;
  const categoryId = $("productCategory").value;
  const isNew = $("productIsNew").checked;
  const newOrder = $("productNewOrder").value;
  const active = $("productActive").checked;

  if (!name) {
    showToast("Введите название товара");
    return;
  }

  if (!price) {
    showToast("Введите цену");
    return;
  }

  let imageUrl = currentImageUrl;

  try {
    if (selectedImageFile) {
      showToast("Загружаю фото...");

      const newImageUrl =
        await uploadImage(selectedImageFile);

      uploadedTempImageUrl = newImageUrl;
      imageUrl = newImageUrl;
    }

    const payload = {
      name,
      memory,
      color,
      version,
      price: Number(price),
      category_id: categoryId
        ? Number(categoryId)
        : null,
      image_url: imageUrl || "",
      is_new: isNew ? 1 : 0,
      new_order: newOrder
        ? Number(newOrder)
        : 0,
      active: active ? 1 : 0
    };

    if (editingProductId) {
      await api(
        `/api/admin/products/${editingProductId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      showToast("Товар сохранён");
    } else {
      await api("/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      showToast("Товар создан");
    }

    uploadedTempImageUrl = "";

    closeModal("productModal");

    await loadAll();
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Не удалось сохранить товар"
    );

    /*
      Если фото уже загрузилось, но сам товар
      сохранить не удалось — удаляем временный BLOB.
    */
    if (uploadedTempImageUrl) {
      await deleteImageByUrl(uploadedTempImageUrl);
      uploadedTempImageUrl = "";
    }
  }
}

async function deleteProduct(id) {
  const product = products.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!product) return;

  const confirmed = confirm(
    `Удалить товар «${product.name}»?`
  );

  if (!confirmed) return;

  try {
    await api(
      `/api/admin/products/${Number(id)}`,
      {
        method: "DELETE"
      }
    );

    showToast("Товар удалён");

    await loadAll();
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Не удалось удалить товар"
    );
  }
}

function openNewCategory() {
  editingCategoryId = null;

  $("categoryModalTitle").textContent =
    "Новая категория";

  $("categoryName").value = "";
  $("categorySlug").value = "";
  $("categorySortOrder").value = "";
  $("categoryActive").checked = true;

  openModal("categoryModal");
}

function editCategory(id) {
  const category = categories.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!category) return;

  editingCategoryId = Number(category.id);

  $("categoryModalTitle").textContent =
    "Изменить категорию";

  $("categoryName").value =
    category.name || "";

  $("categorySlug").value =
    category.slug || "";

  $("categorySortOrder").value =
    category.sort_order ?? "";

  $("categoryActive").checked =
    Number(category.active) === 1;

  openModal("categoryModal");
}

async function saveCategory() {
  const name = $("categoryName").value.trim();
  const slug = $("categorySlug").value.trim();
  const sortOrder = $("categorySortOrder").value;
  const active = $("categoryActive").checked;

  if (!name) {
    showToast("Введите название категории");
    return;
  }

  if (!slug) {
    showToast("Введите slug");
    return;
  }

  const payload = {
    name,
    slug,
    sort_order: sortOrder
      ? Number(sortOrder)
      : 0,
    active: active ? 1 : 0
  };

  try {
    if (editingCategoryId) {
      await api(
        `/api/admin/categories/${editingCategoryId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        }
      );

      showToast("Категория сохранена");
    } else {
      await api("/api/admin/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      showToast("Категория создана");
    }

    closeModal("categoryModal");

    await loadAll();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить категорию"
    );
  }
}

async function deleteCategory(id) {
  const category = categories.find(
    (item) => Number(item.id) === Number(id)
  );

  if (!category) return;

  const confirmed = confirm(
    `Удалить категорию «${category.name}»?`
  );

  if (!confirmed) return;

  try {
    await api(
      `/api/admin/categories/${Number(id)}`,
      {
        method: "DELETE"
      }
    );

    showToast("Категория удалена");

    await loadAll();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось удалить категорию"
    );
  }
}

async function saveSettings() {
  const storeName =
    $("settingStoreName").value.trim();

  const contactUsername =
    $("settingContactUsername").value.trim();

  try {
    await api("/api/admin/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        store_name: storeName,
        contact_username: contactUsername
      })
    });

    showToast("Настройки сохранены");

    await loadAll();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось сохранить настройки"
    );
  }
}

function setupImagePicker() {
  const input = $("productImageInput");

  if (!input) return;

  input.addEventListener("change", (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Выберите изображение");
      input.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showToast("Фото должно быть меньше 10 МБ");
      input.value = "";
      return;
    }

    selectedImageFile = file;

    /*
      Старое фото пока не удаляем.
      Сервер удалит его только после успешного
      сохранения нового image_url.
    */
    renderProductImage();
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.tab;

      document.querySelectorAll(".tab").forEach((item) => {
        item.classList.toggle(
          "active",
          item === button
        );
      });

      document.querySelectorAll(".tab-content").forEach((section) => {
        section.classList.toggle(
          "hidden",
          section.dataset.tabContent !== target
        );
      });
    });
  });
}

function setupModals() {
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", () => {
      const modal = overlay.closest(".modal");

      if (modal) {
        closeModal(modal.id);
      }
    });
  });
}

function setupButtons() {
  $("addProductButton")?.addEventListener(
    "click",
    openNewProduct
  );

  $("addCategoryButton")?.addEventListener(
    "click",
    openNewCategory
  );

  $("saveProductButton")?.addEventListener(
    "click",
    saveProduct
  );

  $("saveCategoryButton")?.addEventListener(
    "click",
    saveCategory
  );

  $("saveSettingsButton")?.addEventListener(
    "click",
    saveSettings
  );

  $("cancelImageButton")?.addEventListener(
    "click",
    cancelSelectedImage
  );

  $("deleteImageButton")?.addEventListener(
    "click",
    async () => {
      const oldUrl = currentImageUrl;

      selectedImageFile = null;
      currentImageUrl = "";

      const input = $("productImageInput");

      if (input) {
        input.value = "";
      }

      renderProductImage();

      /*
        Если фото было уже сохранено в БД,
        сервер удалит его при сохранении товара.
      */
      if (oldUrl) {
        showToast("Фото удалится после сохранения");
      }
    }
  );

  $("closeAdminButton")?.addEventListener(
    "click",
    () => {
      if (tg) {
        tg.close();
      } else {
        window.history.back();
      }
    }
  );
}

function setupBackButton() {
  if (!tg?.BackButton) return;

  tg.BackButton.show();

  tg.BackButton.onClick(() => {
    window.history.back();
  });
}

async function init() {
  initTelegram();

  const isAdmin = await checkAdmin();

  if (!isAdmin) {
    return;
  }

  setupTabs();
  setupModals();
  setupButtons();
  setupImagePicker();
  setupBackButton();

  try {
    await loadAll();
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось загрузить данные"
    );
  }
}

window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.editCategory = editCategory;
window.deleteCategory = deleteCategory;

document.addEventListener(
  "DOMContentLoaded",
  init
);