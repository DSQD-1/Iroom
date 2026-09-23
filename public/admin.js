const tg = window.Telegram?.WebApp;


/* =========================
   STATE
========================= */

let products = [];
let categories = [];

let editingProductId = null;
let editingCategoryId = null;

let selectedImageFile = null;
let currentImageUrl = "";
let imageWasDeleted = false;

let toastTimer = null;

let aiBusy = false;
let aiPendingImport = null;


/* =========================
   TELEGRAM
========================= */

function initTelegram() {
  if (!tg) return;

  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#050505");
    tg.setBackgroundColor("#050505");
  } catch {}
}


/* =========================
   HELPERS
========================= */

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");

    setTimeout(() => {
      toast.classList.add("hidden");
    }, 200);
  }, 2200);
}


/* =========================
   API
========================= */

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-telegram-init-data": tg?.initData || ""
  };

  let body = options.body;

  if (
    body &&
    typeof body !== "string" &&
    !(body instanceof FormData)
  ) {
    headers["Content-Type"] =
      "application/json";

    body = JSON.stringify(body);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body
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


/* =========================
   FORMAT
========================= */

function formatPrice(value) {
  const number = Number(
    String(value ?? "")
      .replace(/\s/g, "")
      .replace(",", ".")
  );

  if (!Number.isFinite(number)) {
    return String(value || "");
  }

  return new Intl.NumberFormat("ru-RU")
    .format(number);
}

function getCategoryName(id) {
  const category =
    categories.find(
      (item) =>
        Number(item.id) === Number(id)
    );

  return category?.name || "Без категории";
}

function getImageUrl(product) {
  if (!product?.image_url) {
    return "";
  }

  return String(product.image_url);
}


/* =========================
   ACCESS
========================= */

async function checkAccess() {
  initTelegram();

  const loading = $("loadingScreen");
  const denied = $("deniedScreen");
  const content = $("adminContent");
  const deniedText = $("deniedText");

  if (!tg?.initData) {

    loading?.classList.add("hidden");
    denied?.classList.remove("hidden");

    if (deniedText) {
      deniedText.textContent =
        "Откройте админ-панель через Telegram.";
    }

    return;
  }

  try {

    const result =
      await api("/api/admin/me");

    if (result?.admin !== true) {
      throw new Error("Нет доступа");
    }

    loading?.classList.add("hidden");
    denied?.classList.add("hidden");
    content?.classList.remove("hidden");

    await loadEverything();

    /*
      AI интерфейс добавляется после
      успешной проверки администратора.
    */
    setupAIInterface();

  } catch (error) {

    console.error(
      "Admin access:",
      error
    );

    loading?.classList.add("hidden");
    content?.classList.add("hidden");
    denied?.classList.remove("hidden");

    if (deniedText) {
      deniedText.textContent =
        "У вас нет доступа к этой панели.";
    }
  }
}


/* =========================
   LOAD EVERYTHING
========================= */

async function loadEverything() {
  await Promise.all([
    loadProducts(),
    loadCategories()
  ]);

  fillCategorySelect();

  updateStats();

  renderProducts();
  renderCategories();
}


/* =========================
   PRODUCTS LOAD
========================= */

async function loadProducts() {
  const data =
    await api("/api/admin/products");

  products =
    Array.isArray(data)
      ? data
      : data.products || [];
}


/* =========================
   CATEGORIES LOAD
========================= */

async function loadCategories() {
  const data =
    await api("/api/admin/categories");

  categories =
    Array.isArray(data)
      ? data
      : data.categories || [];
}


/* =========================
   STATS
========================= */

function updateStats() {
  const totalProducts = $("totalProducts");
  const totalNew = $("totalNew");
  const totalCategories = $("totalCategories");

  if (totalProducts) {
    totalProducts.textContent =
      products.length;
  }

  if (totalNew) {
    totalNew.textContent =
      products.filter(
        (product) =>
          Number(product.is_new) === 1
      ).length;
  }

  if (totalCategories) {
    totalCategories.textContent =
      categories.length;
  }
}


/* =========================
   PRODUCT RENDER
========================= */

function renderProducts() {
  const container =
    $("productsList");

  if (!container) return;

  if (!products.length) {

    container.innerHTML = `
      <div class="empty-state">
        <strong>Товаров пока нет</strong>
        <span>Добавьте первый товар</span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    products.map((product) => {

      const image =
        getImageUrl(product);

      const meta = [
        product.memory,
        product.color,
        product.version
      ]
        .filter(Boolean)
        .join(" · ");

      const badges = [];

      if (Number(product.is_new) === 1) {
        badges.push(
          `<span class="badge pink">Новинка</span>`
        );
      }

      if (Number(product.active) === 0) {
        badges.push(
          `<span class="badge">Скрыт</span>`
        );
      }

      return `
        <article
          class="item-card"
          data-product-id="${Number(product.id)}"
        >

          <div class="item-image">

            ${
              image
                ? `
                  <img
                    src="${escapeHtml(image)}"
                    alt="${escapeHtml(product.name || "")}"
                  >
                `
                : `
                  <div class="item-image-empty">
                    IR
                  </div>
                `
            }

          </div>

          <div class="item-info">

            <div class="badges">
              ${badges.join("")}
            </div>

            <h3>
              ${escapeHtml(
                product.name || "Без названия"
              )}
            </h3>

            ${
              meta
                ? `
                  <p>
                    ${escapeHtml(meta)}
                  </p>
                `
                : ""
            }

            <strong class="item-price">
              ${formatPrice(product.price)} ₽
            </strong>

            <small>
              ${escapeHtml(
                getCategoryName(
                  product.category_id
                )
              )}
            </small>

          </div>

          <div class="item-actions">

            <button
              class="small-button"
              type="button"
              data-edit-product="${Number(product.id)}"
            >
              Изменить
            </button>

          </div>

        </article>
      `;

    }).join("");


  container
    .querySelectorAll(
      "[data-edit-product]"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        (event) => {

          event.stopPropagation();

          const id =
            Number(
              button.dataset.editProduct
            );

          openProductModal(id);
        }
      );

    });


  container
    .querySelectorAll(
      "[data-product-id]"
    )
    .forEach((card) => {

      card.addEventListener(
        "click",
        (event) => {

          if (
            event.target.closest(
              "[data-edit-product]"
            )
          ) {
            return;
          }

          const id =
            Number(
              card.dataset.productId
            );

          openProductModal(id);
        }
      );

    });
}


/* =========================
   CATEGORY SELECT
========================= */

function fillCategorySelect() {
  const select =
    $("productCategory");

  if (!select) return;

  const current =
    select.value;

  select.innerHTML = `
    <option value="">
      Выберите категорию
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

  if (current) {
    select.value = current;
  }
}


/* =========================
   IMAGE PREVIEW
========================= */

function renderImagePreview(url = "") {
  const preview =
    $("productImagePreview");

  if (!preview) return;

  preview.innerHTML = "";

  if (!url) {

    preview.classList.add("empty");

    preview.innerHTML = `
      <span>Нет фото</span>
    `;

    return;
  }

  preview.classList.remove("empty");

  const image =
    document.createElement("img");

  image.src = url;
  image.alt = "Фото товара";

  preview.appendChild(image);
}


/* =========================
   PRODUCT MODAL
========================= */

function openProductModal(id = null) {

  editingProductId =
    id !== null
      ? Number(id)
      : null;

  selectedImageFile = null;
  imageWasDeleted = false;

  const product =
    editingProductId !== null
      ? products.find(
          (item) =>
            Number(item.id) ===
            editingProductId
        )
      : null;

  currentImageUrl =
    product?.image_url || "";

  const title =
    $("productModalTitle");

  if (title) {
    title.textContent =
      product
        ? "Изменить товар"
        : "Новый товар";
  }

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

  $("productCategory").value =
    product?.category_id || "";

  $("productIsNew").checked =
    Number(product?.is_new) === 1;

  $("productNewOrder").value =
    product?.new_order ??
    product?.new_sort_order ??
    "";

  $("productActive").checked =
    product
      ? Number(product.active) !== 0
      : true;

  renderImagePreview(
    currentImageUrl
  );

  updateNewOrderVisibility();

  $("deleteProductButton")
    ?.classList.toggle(
      "hidden",
      !product
    );

  $("productModal")
    ?.classList.remove("hidden");
}


/* =========================
   CLOSE PRODUCT MODAL
========================= */

function closeProductModal() {
  $("productModal")
    ?.classList.add("hidden");

  editingProductId = null;
  selectedImageFile = null;
  currentImageUrl = "";
  imageWasDeleted = false;
}


/* =========================
   NEW ORDER
========================= */

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


/* =========================
   IMAGE UPLOAD
========================= */

async function uploadImage(file) {

  const formData =
    new FormData();

  formData.append(
    "image",
    file
  );

  const response =
    await fetch(
      "/api/admin/upload",
      {
        method: "POST",
        headers: {
          "x-telegram-init-data":
            tg?.initData || ""
        },
        body: formData
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
      data.message ||
      "Не удалось загрузить изображение"
    );
  }

  return data;
}


/* =========================
   SAVE PRODUCT
========================= */

async function saveProduct() {

  const name =
    $("productName")
      .value
      .trim();

  if (!name) {
    showToast(
      "Введите название товара"
    );

    return;
  }

  const saveButton =
    $("saveProductButton");

  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent =
      "Сохранение...";
  }

  try {

    let imageUrl =
      currentImageUrl || "";

    if (selectedImageFile) {

      const upload =
        await uploadImage(
          selectedImageFile
        );

      imageUrl =
        upload.url ||
        upload.image_url ||
        "";
    }

    if (imageWasDeleted) {
      imageUrl = "";
    }

    const payload = {
      name,

      memory:
        $("productMemory")
          .value
          .trim(),

      color:
        $("productColor")
          .value
          .trim(),

      version:
        $("productVersion")
          .value
          .trim(),

      price:
        Number(
          $("productPrice")
            .value || 0
        ),

      category_id:
        $("productCategory").value
          ? Number(
              $("productCategory").value
            )
          : null,

      is_new:
        $("productIsNew").checked
          ? 1
          : 0,

      new_sort_order:
        Number(
          $("productNewOrder")
            .value || 0
        ),

      active:
        $("productActive").checked
          ? 1
          : 0,

      image_url:
        imageUrl
    };


    if (editingProductId) {

      await api(
        `/api/admin/products/${editingProductId}`,
        {
          method: "PUT",
          body: payload
        }
      );

      showToast(
        "Товар обновлён"
      );

    } else {

      await api(
        "/api/admin/products",
        {
          method: "POST",
          body: payload
        }
      );

      showToast(
        "Товар добавлен"
      );
    }

    closeProductModal();

    await loadEverything();

  } catch (error) {

    console.error(
      "Save product:",
      error
    );

    showToast(
      error.message ||
      "Не удалось сохранить товар"
    );

  } finally {

    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent =
        "Сохранить товар";
    }

  }
}


/* =========================
   DELETE PRODUCT
========================= */

async function deleteProduct() {

  if (!editingProductId) {
    return;
  }

  if (
    !confirm(
      "Удалить этот товар?"
    )
  ) {
    return;
  }

  const button =
    $("deleteProductButton");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Удаление...";
  }

  try {

    await api(
      `/api/admin/products/${editingProductId}`,
      {
        method: "DELETE"
      }
    );

    showToast(
      "Товар удалён"
    );

    closeProductModal();

    await loadEverything();

  } catch (error) {

    console.error(
      "Delete product:",
      error
    );

    showToast(
      error.message ||
      "Не удалось удалить товар"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Удалить товар";
    }

  }
}


/* =========================
   CATEGORY RENDER
========================= */

function renderCategories() {
  const container =
    $("categoriesList");

  if (!container) return;

  if (!categories.length) {

    container.innerHTML = `
      <div class="empty-state">
        <strong>Категорий пока нет</strong>
        <span>Добавьте первую категорию</span>
      </div>
    `;

    return;
  }

  container.innerHTML =
    categories.map((category) => {

      const productCount =
        products.filter(
          (product) =>
            Number(
              product.category_id
            ) === Number(category.id)
        ).length;

      return `
        <article
          class="item-card"
          data-category-id="${Number(category.id)}"
        >

          <div class="item-image category-image">
            <div class="item-image-empty">
              ${escapeHtml(
                String(
                  category.name || "?"
                ).slice(0, 2)
              )}
            </div>
          </div>

          <div class="item-info">

            <div class="badges">

              ${
                Number(category.active) !== 0
                  ? `
                    <span class="badge pink">
                      Активна
                    </span>
                  `
                  : `
                    <span class="badge">
                      Скрыта
                    </span>
                  `
              }

            </div>

            <h3>
              ${escapeHtml(
                category.name || "Без названия"
              )}
            </h3>

            <p>
              ${escapeHtml(
                category.slug || ""
              )}
            </p>

            <small>
              Товаров: ${productCount}
            </small>

          </div>

          <div class="item-actions">

            <button
              class="small-button"
              type="button"
              data-edit-category="${Number(category.id)}"
            >
              Изменить
            </button>

          </div>

        </article>
      `;

    }).join("");


  container
    .querySelectorAll(
      "[data-edit-category]"
    )
    .forEach((button) => {

      button.addEventListener(
        "click",
        (event) => {

          event.stopPropagation();

          openCategoryModal(
            Number(
              button.dataset.editCategory
            )
          );
        }
      );

    });


  container
    .querySelectorAll(
      "[data-category-id]"
    )
    .forEach((card) => {

      card.addEventListener(
        "click",
        (event) => {

          if (
            event.target.closest(
              "[data-edit-category]"
            )
          ) {
            return;
          }

          openCategoryModal(
            Number(
              card.dataset.categoryId
            )
          );
        }
      );

    });
}


/* =========================
   CATEGORY MODAL
========================= */

function openCategoryModal(id = null) {

  editingCategoryId =
    id !== null
      ? Number(id)
      : null;

  const category =
    editingCategoryId !== null
      ? categories.find(
          (item) =>
            Number(item.id) ===
            editingCategoryId
        )
      : null;

  const title =
    $("categoryModalTitle");

  if (title) {
    title.textContent =
      category
        ? "Изменить категорию"
        : "Новая категория";
  }

  $("categoryName").value =
    category?.name || "";

  $("categorySlug").value =
    category?.slug || "";

  $("categorySortOrder").value =
    category?.sort_order ??
    category?.sortOrder ??
    0;

  $("categoryActive").checked =
    category
      ? Number(category.active) !== 0
      : true;

  $("deleteCategoryButton")
    ?.classList.toggle(
      "hidden",
      !category
    );

  $("categoryModal")
    ?.classList.remove("hidden");
}


/* =========================
   CLOSE CATEGORY
========================= */

function closeCategoryModal() {
  $("categoryModal")
    ?.classList.add("hidden");

  editingCategoryId = null;
}


/* =========================
   SAVE CATEGORY
========================= */

async function saveCategory() {

  const name =
    $("categoryName")
      .value
      .trim();

  const slug =
    $("categorySlug")
      .value
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
    button.disabled = true;
    button.textContent =
      "Сохранение...";
  }

  try {

    const payload = {
      name,
      slug,

      sort_order:
        Number(
          $("categorySortOrder")
            .value || 0
        ),

      active:
        $("categoryActive").checked
          ? 1
          : 0
    };

    if (editingCategoryId) {

      await api(
        `/api/admin/categories/${editingCategoryId}`,
        {
          method: "PUT",
          body: payload
        }
      );

      showToast(
        "Категория обновлена"
      );

    } else {

      await api(
        "/api/admin/categories",
        {
          method: "POST",
          body: payload
        }
      );

      showToast(
        "Категория добавлена"
      );
    }

    closeCategoryModal();

    await loadEverything();

  } catch (error) {

    console.error(
      "Save category:",
      error
    );

    showToast(
      error.message ||
      "Не удалось сохранить категорию"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Сохранить категорию";
    }

  }
}


/* =========================
   DELETE CATEGORY
========================= */

async function deleteCategory() {

  if (!editingCategoryId) {
    return;
  }

  if (
    !confirm(
      "Удалить эту категорию?"
    )
  ) {
    return;
  }

  const button =
    $("deleteCategoryButton");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Удаление...";
  }

  try {

    await api(
      `/api/admin/categories/${editingCategoryId}`,
      {
        method: "DELETE"
      }
    );

    showToast(
      "Категория удалена"
    );

    closeCategoryModal();

    await loadEverything();

  } catch (error) {

    console.error(
      "Delete category:",
      error
    );

    showToast(
      error.message ||
      "Не удалось удалить категорию"
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Удалить категорию";
    }

  }
}


/* =========================
   IMAGE EVENTS
========================= */

function setupImageEvents() {

  $("chooseImageButton")
    ?.addEventListener(
      "click",
      () => {
        $("productImageInput")?.click();
      }
    );


  $("productImageInput")
    ?.addEventListener(
      "change",
      (event) => {

        const file =
          event.target.files?.[0];

        if (!file) {
          return;
        }

        selectedImageFile = file;
        imageWasDeleted = false;

        const previewUrl =
          URL.createObjectURL(file);

        renderImagePreview(
          previewUrl
        );

        $("deleteImageButton")
          ?.classList.remove(
            "hidden"
          );
      }
    );


  $("cancelImageButton")
    ?.addEventListener(
      "click",
      () => {

        selectedImageFile = null;
        imageWasDeleted = false;

        const input =
          $("productImageInput");

        if (input) {
          input.value = "";
        }

        renderImagePreview(
          currentImageUrl
        );

        if (!currentImageUrl) {
          $("deleteImageButton")
            ?.classList.add(
              "hidden"
            );
        }
      }
    );


  $("deleteImageButton")
    ?.addEventListener(
      "click",
      () => {

        selectedImageFile = null;
        currentImageUrl = "";
        imageWasDeleted = true;

        const input =
          $("productImageInput");

        if (input) {
          input.value = "";
        }

        renderImagePreview("");

        $("deleteImageButton")
          ?.classList.add(
            "hidden"
          );
      }
    );
}


/* =========================
   TABS
========================= */

function openProductsTab() {

  $("productsContent")
    ?.classList.remove("hidden");

  $("categoriesContent")
    ?.classList.add("hidden");

  $("productsTab")
    ?.classList.add("active");

  $("categoriesTab")
    ?.classList.remove("active");
}


function openCategoriesTab() {

  $("productsContent")
    ?.classList.add("hidden");

  $("categoriesContent")
    ?.classList.remove("hidden");

  $("productsTab")
    ?.classList.remove("active");

  $("categoriesTab")
    ?.classList.add("active");
}


/* =========================================================
   AI ADMIN
========================================================= */


/* =========================
   CREATE AI TAB
========================= */

function setupAIInterface() {

  /*
    Если вкладка уже существует —
    повторно её не создаём.
  */

  if ($("aiTab")) {
    return;
  }

  const tabs =
    document.querySelector(".tabs");

  const productsContent =
    $("productsContent");

  const categoriesContent =
    $("categoriesContent");

  if (!tabs || !productsContent) {
    return;
  }


  /* TAB */

  const aiTab =
    document.createElement("button");

  aiTab.id = "aiTab";
  aiTab.className = "tab";
  aiTab.type = "button";
  aiTab.textContent = "AI";


  tabs.appendChild(aiTab);


  /* CONTENT */

  const aiContent =
    document.createElement("section");

  aiContent.id = "aiContent";
  aiContent.className =
    "tab-content hidden";


  aiContent.innerHTML = `
    <div style="
      display:flex;
      flex-direction:column;
      gap:16px;
    ">

      <div>
        <h2 style="margin:0 0 6px;">
          AI-ассистент
        </h2>

        <p style="margin:0;opacity:.65;">
          Управляйте каталогом обычным сообщением.
        </p>
      </div>


      <div
        id="aiMessages"
        style="
          min-height:220px;
          max-height:52vh;
          overflow-y:auto;
          display:flex;
          flex-direction:column;
          gap:10px;
          padding:4px 0;
        "
      >

        <div style="
          padding:14px;
          border-radius:16px;
          background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.08);
          line-height:1.45;
        ">
          <strong>AI</strong>
          <div style="margin-top:6px;opacity:.8;">
            Привет. Можешь прислать целый прайс-лист,
            попросить изменить цену, добавить товар,
            удалить товар или сделать товар новинкой.
          </div>
        </div>

      </div>


      <div style="
        display:flex;
        flex-direction:column;
        gap:8px;
      ">

        <textarea
          id="aiInput"
          rows="6"
          placeholder="Например:

iPhone 17 Pro Max
256GB Black — 95 000
512GB Orange — 105 000

или:

Сделай iPhone 17 Pro Max 512GB Orange новинкой"
          style="
            width:100%;
            box-sizing:border-box;
            resize:vertical;
            min-height:120px;
            padding:14px;
            border-radius:16px;
            border:1px solid rgba(255,255,255,.12);
            background:rgba(255,255,255,.05);
            color:inherit;
            outline:none;
            font:inherit;
          "
        ></textarea>


        <button
          id="aiSendButton"
          class="primary-button full"
          type="button"
        >
          Отправить AI
        </button>

      </div>


      <div
        id="aiPreview"
        class="hidden"
        style="
          display:flex;
          flex-direction:column;
          gap:10px;
          padding:14px;
          border-radius:18px;
          background:rgba(255,255,255,.04);
          border:1px solid rgba(255,255,255,.08);
        "
      >

        <strong>
          Предпросмотр импорта
        </strong>

        <div
          id="aiPreviewContent"
          style="
            max-height:38vh;
            overflow:auto;
          "
        ></div>

        <div style="
          display:flex;
          gap:8px;
        ">

          <button
            id="aiImportButton"
            class="primary-button"
            type="button"
            style="flex:1;"
          >
            Импортировать
          </button>

          <button
            id="aiCancelImportButton"
            class="secondary-button"
            type="button"
            style="flex:1;"
          >
            Отмена
          </button>

        </div>

      </div>

    </div>
  `;


  productsContent
    .parentElement
    ?.appendChild(aiContent);


  /* EVENTS */

  aiTab.addEventListener(
    "click",
    () => {
      openAITab();
    }
  );


  $("aiSendButton")
    ?.addEventListener(
      "click",
      handleAISend
    );


  $("aiImportButton")
    ?.addEventListener(
      "click",
      handleAIImport
    );


  $("aiCancelImportButton")
    ?.addEventListener(
      "click",
      cancelAIImport
    );


  $("aiInput")
    ?.addEventListener(
      "keydown",
      (event) => {

        /*
          Enter отправляет,
          Shift + Enter перенос строки.
        */

        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          handleAISend();
        }
      }
    );


  /*
    Добавляем AI в существующую
    систему переключения вкладок.
  */

  const oldProducts =
    $("productsTab");

  const oldCategories =
    $("categoriesTab");

  oldProducts?.addEventListener(
    "click",
    () => {
      hideAIContent();
    }
  );

  oldCategories?.addEventListener(
    "click",
    () => {
      hideAIContent();
    }
  );
}


/* =========================
   AI TAB
========================= */

function openAITab() {

  $("productsContent")
    ?.classList.add("hidden");

  $("categoriesContent")
    ?.classList.add("hidden");

  $("aiContent")
    ?.classList.remove("hidden");

  $("productsTab")
    ?.classList.remove("active");

  $("categoriesTab")
    ?.classList.remove("active");

  $("aiTab")
    ?.classList.add("active");
}


function hideAIContent() {

  $("aiContent")
    ?.classList.add("hidden");

  $("aiTab")
    ?.classList.remove("active");
}


/* =========================
   AI MESSAGE
========================= */

function addAIMessage(
  text,
  type = "ai"
) {

  const container =
    $("aiMessages");

  if (!container) return;

  const message =
    document.createElement("div");

  const isUser =
    type === "user";

  message.style.cssText = `
    align-self:${isUser ? "flex-end" : "flex-start"};
    max-width:90%;
    padding:12px 14px;
    border-radius:16px;
    background:${
      isUser
        ? "rgba(255,45,120,.16)"
        : "rgba(255,255,255,.06)"
    };
    border:1px solid ${
      isUser
        ? "rgba(255,45,120,.25)"
        : "rgba(255,255,255,.08)"
    };
    line-height:1.45;
    white-space:pre-wrap;
  `;

  message.innerHTML = `
    <strong>
      ${isUser ? "Вы" : "AI"}
    </strong>

    <div style="margin-top:6px;">
      ${escapeHtml(text)}
    </div>
  `;

  container.appendChild(message);

  container.scrollTop =
    container.scrollHeight;
}


/* =========================
   AI REQUEST
========================= */

async function sendAIMessage(message) {

  const response =
    await api(
      "/api/ai/chat",
      {
        method: "POST",
        body: {
          message
        }
      }
    );

  return response;
}


/* =========================
   AI SEND
========================= */

async function handleAISend() {

  if (aiBusy) {
    return;
  }

  const input =
    $("aiInput");

  if (!input) {
    return;
  }

  const message =
    input.value.trim();

  if (!message) {
    return;
  }

  aiBusy = true;

  const button =
    $("aiSendButton");

  if (button) {
    button.disabled = true;
    button.textContent =
      "AI думает...";
  }

  addAIMessage(
    message,
    "user"
  );

  input.value = "";

  try {

    /*
      Если это похоже на прайс-лист,
      сначала пытаемся получить
      структурированный импорт.
    */

    if (looksLikePriceList(message)) {

      await handleAIPriceList(
        message
      );

      return;
    }


    const result =
      await sendAIMessage(
        message
      );

    const answer =
      result?.answer ||
      result?.message ||
      result?.response ||
      "AI не вернул ответ.";

    addAIMessage(
      answer,
      "ai"
    );


    /*
      Если AI выполнил действие,
      обновляем каталог.
    */

    if (
      result?.changed ||
      result?.updated ||
      result?.imported
    ) {
      await loadEverything();
    }

  } catch (error) {

    console.error(
      "AI:",
      error
    );

    addAIMessage(
      error.message ||
      "Не удалось связаться с AI.",
      "ai"
    );

  } finally {

    aiBusy = false;

    if (button) {
      button.disabled = false;
      button.textContent =
        "Отправить AI";
    }
  }
}


/* =========================
   DETECT PRICE LIST
========================= */

function looksLikePriceList(text) {

  const value =
    String(text || "")
      .trim();

  if (!value) {
    return false;
  }

  const lines =
    value
      .split(/\r?\n/)
      .map(
        (line) =>
          line.trim()
      )
      .filter(Boolean);

  /*
    Один товар с ценой тоже считаем
    потенциальным прайс-листом.
  */

  const pricePattern =
    /(?:\d[\d\s.,]*)\s*(?:₽|руб|р\.?|usd|\$)?$/i;

  const priceLines =
    lines.filter(
      (line) =>
        pricePattern.test(line)
    );

  return (
    priceLines.length >= 1 &&
    lines.length >= 2
  );
}


/* =========================
   AI PRICE LIST
========================= */

async function handleAIPriceList(
  text
) {

  try {

    addAIMessage(
      "Вижу прайс-лист. Разбираю товары и варианты..."
    );

    const result =
      await api(
        "/api/admin/ai/parse",
        {
          method: "POST",
          body: {
            text
          }
        }
      );

    const parsed =
      result?.products ||
      result?.items ||
      result?.data ||
      [];

    if (!Array.isArray(parsed) || !parsed.length) {

      addAIMessage(
        result?.message ||
        "Не удалось найти товары в прайс-листе."
      );

      return;
    }

    aiPendingImport = {
      products: parsed,
      raw: text
    };

    renderAIPreview(
      parsed
    );

    addAIMessage(
      `Готово. Нашёл товаров: ${parsed.length}. Проверь предпросмотр ниже.`
    );

  } catch (error) {

    console.error(
      "AI price list:",
      error
    );

    addAIMessage(
      error.message ||
      "Не удалось разобрать прайс-лист."
    );
  }
}


/* =========================
   AI PREVIEW
========================= */

function renderAIPreview(items) {

  const preview =
    $("aiPreview");

  const content =
    $("aiPreviewContent");

  if (!preview || !content) {
    return;
  }

  content.innerHTML =
    items.map(
      (item, index) => {

        const name =
          item.name ||
          item.title ||
          "Без названия";

        const memory =
          item.memory || "";

        const color =
          item.color || "";

        const version =
          item.version || "";

        const price =
          item.price ??
          item.price_max ??
          "";

        const category =
          item.category ||
          item.category_name ||
          "";

        const meta = [
          memory,
          color,
          version,
          category
        ]
          .filter(Boolean)
          .join(" · ");

        return `
          <div style="
            padding:12px 0;
            border-bottom:1px solid rgba(255,255,255,.08);
          ">

            <strong>
              ${index + 1}.
              ${escapeHtml(name)}
            </strong>

            ${
              meta
                ? `
                  <div style="
                    margin-top:4px;
                    opacity:.65;
                  ">
                    ${escapeHtml(meta)}
                  </div>
                `
                : ""
            }

            <div style="
              margin-top:5px;
            ">
              ${formatPrice(price)} ₽
            </div>

          </div>
        `;
      }
    )
    .join("");

  preview.classList.remove(
    "hidden"
  );
}


/* =========================
   AI IMPORT
========================= */

async function handleAIImport() {

  if (
    !aiPendingImport ||
    !Array.isArray(
      aiPendingImport.products
    ) ||
    !aiPendingImport.products.length
  ) {
    return;
  }

  const button =
    $("aiImportButton");

  if (button) {
    button.disabled = true;
    button.textContent =
      "Импорт...";
  }

  try {

    const result =
      await api(
        "/api/admin/ai/import",
        {
          method: "POST",
          body: {
            products:
              aiPendingImport.products
          }
        }
      );

    const count =
      result?.imported ??
      result?.count ??
      aiPendingImport.products.length;

    addAIMessage(
      `Готово. В каталог импортировано: ${count}.`
    );

    aiPendingImport = null;

    $("aiPreview")
      ?.classList.add("hidden");

    await loadEverything();

  } catch (error) {

    console.error(
      "AI import:",
      error
    );

    addAIMessage(
      error.message ||
      "Не удалось импортировать товары."
    );

  } finally {

    if (button) {
      button.disabled = false;
      button.textContent =
        "Импортировать";
    }
  }
}


/* =========================
   CANCEL IMPORT
========================= */

function cancelAIImport() {

  aiPendingImport = null;

  $("aiPreview")
    ?.classList.add("hidden");

  addAIMessage(
    "Импорт отменён."
  );
}


/* =========================
   EVENTS
========================= */

function setupEvents() {

  $("adminLogo")
    ?.addEventListener(
      "click",
      () => {
        window.location.href = "/";
      }
    );


  $("closeAdminButton")
    ?.addEventListener(
      "click",
      () => {

        if (tg?.close) {
          tg.close();
          return;
        }

        window.location.href = "/";
      }
    );


  $("closeDeniedButton")
    ?.addEventListener(
      "click",
      () => {

        if (tg?.close) {
          tg.close();
          return;
        }

        window.location.href = "/";
      }
    );


  $("productsTab")
    ?.addEventListener(
      "click",
      openProductsTab
    );


  $("categoriesTab")
    ?.addEventListener(
      "click",
      openCategoriesTab
    );


  $("addProductButton")
    ?.addEventListener(
      "click",
      () => {
        openProductModal();
      }
    );


  $("addCategoryButton")
    ?.addEventListener(
      "click",
      () => {
        openCategoryModal();
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


  $("productIsNew")
    ?.addEventListener(
      "change",
      updateNewOrderVisibility
    );


  $("closeProductModalButton")
    ?.addEventListener(
      "click",
      closeProductModal
    );


  $("closeCategoryModalButton")
    ?.addEventListener(
      "click",
      closeCategoryModal
    );


  $("productModal")
    ?.querySelector(".modal-overlay")
    ?.addEventListener(
      "click",
      closeProductModal
    );


  $("categoryModal")
    ?.querySelector(".modal-overlay")
    ?.addEventListener(
      "click",
      closeCategoryModal
    );


  setupImageEvents();


  document.addEventListener(
    "keydown",
    (event) => {

      if (
        event.key !== "Escape"
      ) {
        return;
      }

      if (
        !$("productModal")
          ?.classList.contains("hidden")
      ) {
        closeProductModal();
      }

      if (
        !$("categoryModal")
          ?.classList.contains("hidden")
      ) {
        closeCategoryModal();
      }
    }
  );


  if (tg?.BackButton) {

    tg.BackButton.show();

    tg.BackButton.onClick(
      () => {
        window.location.href = "/";
      }
    );

  }
}


/* =========================
   START
========================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    setupEvents();

    checkAccess();

  }
);