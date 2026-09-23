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

  if (
    options.body &&
    typeof options.body !== "string"
  ) {
    headers["Content-Type"] =
      "application/json";

    options.body =
      JSON.stringify(options.body);
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

  const loading =
    $("loadingScreen");

  const denied =
    $("deniedScreen");

  const content =
    $("adminContent");

  const deniedText =
    $("deniedText");

  if (!tg?.initData) {

    if (loading) {
      loading.classList.add("hidden");
    }

    if (denied) {
      denied.classList.remove("hidden");
    }

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

    if (loading) {
      loading.classList.add("hidden");
    }

    if (denied) {
      denied.classList.add("hidden");
    }

    if (content) {
      content.classList.remove("hidden");
    }

    await loadEverything();

  } catch (error) {

    console.error(
      "Admin access:",
      error
    );

    if (loading) {
      loading.classList.add("hidden");
    }

    if (content) {
      content.classList.add("hidden");
    }

    if (denied) {
      denied.classList.remove("hidden");
    }

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
  const totalProducts =
    $("totalProducts");

  const totalNew =
    $("totalNew");

  const totalCategories =
    $("totalCategories");

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

function renderImagePreview(
  url = ""
) {
  const preview =
    $("productImagePreview");

  if (!preview) return;

  preview.innerHTML = "";

  if (!url) {

    preview.classList.add(
      "empty"
    );

    preview.innerHTML = `
      <span>Нет фото</span>
    `;

    return;
  }

  preview.classList.remove(
    "empty"
  );

  const image =
    document.createElement("img");

  image.src = url;
  image.alt = "Фото товара";

  preview.appendChild(
    image
  );
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
    product?.new_order ?? "";

  $("productActive").checked =
    product
      ? Number(product.active) !== 0
      : true;

  renderImagePreview(
    currentImageUrl
  );

  updateNewOrderVisibility();

  const deleteButton =
    $("deleteProductButton");

  if (deleteButton) {
    deleteButton.classList.toggle(
      "hidden",
      !product
    );
  }

  const modal =
    $("productModal");

  if (modal) {
    modal.classList.remove(
      "hidden"
    );
  }
}


/* =========================
   CLOSE PRODUCT MODAL
========================= */

function closeProductModal() {
  const modal =
    $("productModal");

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }

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
    $("productName").value.trim();

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

    /* Upload new image */

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

    /* Delete image */

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
          $("productPrice").value || 0
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
          $("productNewOrder").value || 0
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

  const confirmed =
    confirm(
      "Удалить этот товар?"
    );

  if (!confirmed) {
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

          const id =
            Number(
              button.dataset.editCategory
            );

          openCategoryModal(id);
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

          const id =
            Number(
              card.dataset.categoryId
            );

          openCategoryModal(id);
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

  const deleteButton =
    $("deleteCategoryButton");

  if (deleteButton) {
    deleteButton.classList.toggle(
      "hidden",
      !category
    );
  }

  const modal =
    $("categoryModal");

  if (modal) {
    modal.classList.remove(
      "hidden"
    );
  }
}


/* =========================
   CLOSE CATEGORY
========================= */

function closeCategoryModal() {
  const modal =
    $("categoryModal");

  if (modal) {
    modal.classList.add(
      "hidden"
    );
  }

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

  const confirmed =
    confirm(
      "Удалить эту категорию?"
    );

  if (!confirmed) {
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

        $("productImageInput")
          ?.click();

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

        selectedImageFile =
          file;

        imageWasDeleted =
          false;

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

  const productsContent =
    $("productsContent");

  const categoriesContent =
    $("categoriesContent");

  const productsTab =
    $("productsTab");

  const categoriesTab =
    $("categoriesTab");


  productsContent
    ?.classList.remove("hidden");

  categoriesContent
    ?.classList.add("hidden");


  productsTab
    ?.classList.add("active");

  categoriesTab
    ?.classList.remove("active");
}


function openCategoriesTab() {

  const productsContent =
    $("productsContent");

  const categoriesContent =
    $("categoriesContent");

  const productsTab =
    $("productsTab");

  const categoriesTab =
    $("categoriesTab");


  productsContent
    ?.classList.add("hidden");

  categoriesContent
    ?.classList.remove("hidden");


  productsTab
    ?.classList.remove("active");

  categoriesTab
    ?.classList.add("active");
}


/* =========================
   EVENTS
========================= */

function setupEvents() {

  /* Logo → магазин */

  $("adminLogo")
    ?.addEventListener(
      "click",
      () => {
        window.location.href = "/";
      }
    );


  /* Close admin */

  $("closeAdminButton")
    ?.addEventListener(
      "click",
      () => {

        if (
          tg?.close
        ) {
          tg.close();
          return;
        }

        window.location.href =
          "/";
      }
    );


  /* Denied */

  $("closeDeniedButton")
    ?.addEventListener(
      "click",
      () => {

        if (tg?.close) {
          tg.close();
          return;
        }

        window.location.href =
          "/";
      }
    );


  /* Products tab */

  $("productsTab")
    ?.addEventListener(
      "click",
      openProductsTab
    );


  /* Categories tab */

  $("categoriesTab")
    ?.addEventListener(
      "click",
      openCategoriesTab
    );


  /* Add product */

  $("addProductButton")
    ?.addEventListener(
      "click",
      () => {
        openProductModal();
      }
    );


  /* Add category */

  $("addCategoryButton")
    ?.addEventListener(
      "click",
      () => {
        openCategoryModal();
      }
    );


  /* Save product */

  $("saveProductButton")
    ?.addEventListener(
      "click",
      saveProduct
    );


  /* Delete product */

  $("deleteProductButton")
    ?.addEventListener(
      "click",
      deleteProduct
    );


  /* Save category */

  $("saveCategoryButton")
    ?.addEventListener(
      "click",
      saveCategory
    );


  /* Delete category */

  $("deleteCategoryButton")
    ?.addEventListener(
      "click",
      deleteCategory
    );


  /* New product switch */

  $("productIsNew")
    ?.addEventListener(
      "change",
      updateNewOrderVisibility
    );


  /* Product modal close */

  $("closeProductModalButton")
    ?.addEventListener(
      "click",
      closeProductModal
    );


  /* Category modal close */

  $("closeCategoryModalButton")
    ?.addEventListener(
      "click",
      closeCategoryModal
    );


  /* Product overlay */

  $("productModal")
    ?.querySelector(
      ".modal-overlay"
    )
    ?.addEventListener(
      "click",
      closeProductModal
    );


  /* Category overlay */

  $("categoryModal")
    ?.querySelector(
      ".modal-overlay"
    )
    ?.addEventListener(
      "click",
      closeCategoryModal
    );


  /* Image */

  setupImageEvents();


  /* Escape */

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
          ?.classList.contains(
            "hidden"
          )
      ) {
        closeProductModal();
      }

      if (
        !$("categoryModal")
          ?.classList.contains(
            "hidden"
          )
      ) {
        closeCategoryModal();
      }
    }
  );


  /* Telegram back button */

  if (tg?.BackButton) {

    tg.BackButton.show();

    tg.BackButton.onClick(
      () => {
        window.location.href =
          "/";
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