const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#080808");
    tg.setBackgroundColor("#080808");
  } catch {}
}


const state = {
  products: [],
  categories: [],
  orders: [],

  editingProductId: null,
  editingCategoryId: null,

  colors: [],
  memories: [],
  sims: [],
  regions: []
};


const ADMIN_IDS = [
  "5082864281",
  "5975037118"
];


function telegramInitData() {
  return tg?.initData || "";
}


function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}


function isAdmin() {
  const user = getTelegramUser();

  if (!user?.id) {
    return false;
  }

  return ADMIN_IDS.includes(String(user.id));
}


/* =========================
   API
========================= */

async function api(url, options = {}) {

  const response = await fetch(url, {
    ...options,

    headers: {
      "Content-Type": "application/json",

      "x-telegram-init-data": telegramInitData(),

      ...(options.headers || {})
    }
  });


  let data = {};

  try {
    data = await response.json();
  } catch {}


  if (!response.ok) {

    throw new Error(
      data.error ||
      data.message ||
      "Ошибка запроса"
    );

  }


  return data;
}


/* =========================
   HELPERS
========================= */

function $(selector) {
  return document.querySelector(selector);
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

  return (
    new Intl.NumberFormat("ru-RU").format(number) +
    " ₽"
  );

}


function formatDate(value) {

  if (!value) {
    return "—";
  }


  const date = new Date(value);


  if (Number.isNaN(date.getTime())) {
    return String(value);
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


function statusLabel(status) {

  const labels = {

    new: "Новый",

    processing: "В обработке",

    awaiting_payment: "Ожидает оплаты",

    reserved: "Забронирован",

    completed: "Завершён",

    cancelled: "Отменён"

  };


  return (
    labels[status] ||
    status ||
    "—"
  );

}


function statusClass(status) {

  return (
    "status-" +
    String(status || "new")
      .replaceAll("_", "-")
  );

}


/* =========================
   TOAST
========================= */

function showToast(
  message,
  type = "success"
) {

  const toast = $("#toast");

  if (!toast) {
    return;
  }


  toast.textContent = message;

  toast.dataset.type = type;

  toast.classList.add("show");


  clearTimeout(showToast.timer);


  showToast.timer = setTimeout(() => {

    toast.classList.remove("show");

  }, 2500);

}


/* =========================
   LOADER
========================= */

function showLoader(show = true) {

  const loader = $("#pageLoader");

  if (!loader) {
    return;
  }


  loader.classList.toggle(
    "hidden",
    !show
  );

}


/* =========================
   IMAGE
========================= */

function fileToDataUrl(file) {

  return new Promise(
    (resolve, reject) => {

      if (!file) {
        resolve("");
        return;
      }


      const reader = new FileReader();


      reader.onload = () => {
        resolve(reader.result);
      };


      reader.onerror = () => {
        reject(
          new Error(
            "Не удалось прочитать изображение"
          )
        );
      };


      reader.readAsDataURL(file);

    }
  );

}


/* =========================
   ACCESS
========================= */

async function checkAdmin() {

  const accessScreen =
    $("#accessScreen");

  const adminScreen =
    $("#adminScreen");

  const accessText =
    $("#accessText");


  if (!isAdmin()) {

    if (accessText) {
      accessText.textContent =
        "Доступ запрещён";
    }


    setTimeout(() => {

      document.body.innerHTML = `

        <div class="admin-denied">

          <div class="admin-denied-card">

            <div class="admin-denied-icon">
              ×
            </div>

            <h1>
              Доступ запрещён
            </h1>

            <p>
              У вас нет доступа к панели администратора.
            </p>

            <button
              type="button"
              onclick="location.href='/'"
            >
              Вернуться в магазин
            </button>

          </div>

        </div>

      `;

    }, 300);


    return false;

  }


  accessScreen?.classList.add("hidden");

  adminScreen?.classList.remove("hidden");


  return true;

}


/* =========================
   TABS
========================= */

function switchTab(tab) {

  document
    .querySelectorAll(".tab")
    .forEach(button => {

      button.classList.toggle(
        "active",
        button.dataset.tab === tab
      );

    });


  document
    .querySelectorAll(".tab-content")
    .forEach(section => {

      const id = section.id;

      const active =
        id === `${tab}Tab`;

      section.classList.toggle(
        "hidden",
        !active
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

}


function setupTabs() {

  document
    .querySelectorAll(".tab")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          switchTab(
            button.dataset.tab
          );

        }
      );

    });

}


/* =========================
   PRODUCTS
========================= */

async function loadProducts() {

  try {

    const data =
      await api(
        "/api/admin/products"
      );


    state.products =
      Array.isArray(data)
        ? data
        : (
            data.products ||
            []
          );


    renderProducts();

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  }

}


function renderProducts() {

  const container =
    $("#productsList");


  if (!container) {
    return;
  }


  if (!state.products.length) {

    container.innerHTML = `

      <div class="admin-empty">

        <div class="admin-empty-icon">
          ＋
        </div>

        <h3>
          Товаров пока нет
        </h3>

        <p>
          Добавьте первый товар.
        </p>

      </div>

    `;

    return;

  }


  container.innerHTML =
    state.products
      .map(product => {

        const colors =
          getOptionArray(
            product,
            "colors"
          );

        const memories =
          getOptionArray(
            product,
            "memories"
          );

        const sims =
          getOptionArray(
            product,
            "sims"
          );


        return `

          <div class="admin-product-card">

            <div class="admin-product-image">

              ${
                product.image
                  ? `
                    <img
                      src="${escapeHtml(product.image)}"
                      alt=""
                    >
                  `
                  : `
                    <div class="admin-product-placeholder">
                      IR
                    </div>
                  `
              }

            </div>


            <div class="admin-product-main">

              <div class="admin-product-top">

                <div>

                  <h3>
                    ${escapeHtml(product.name)}
                  </h3>

                  <div class="admin-product-category">
                    ${escapeHtml(
                      product.category_name ||
                      "Без категории"
                    )}
                  </div>

                </div>


                <div class="admin-product-actions">

                  <button
                    class="icon-button"
                    type="button"
                    data-edit-product="${product.id}"
                  >
                    ✎
                  </button>

                  <button
                    class="icon-button danger"
                    type="button"
                    data-delete-product="${product.id}"
                  >
                    ×
                  </button>

                </div>

              </div>


              <div class="admin-product-price">
                От ${formatPrice(product.price)}
              </div>


              <div class="admin-product-options">

                ${
                  colors.length
                    ? `
                      <span>
                        Цветов: ${colors.length}
                      </span>
                    `
                    : ""
                }

                ${
                  memories.length
                    ? `
                      <span>
                        Память: ${memories.length}
                      </span>
                    `
                    : ""
                }

                ${
                  sims.length
                    ? `
                      <span>
                        SIM: ${sims.length}
                      </span>
                    `
                    : ""
                }

              </div>

            </div>

          </div>

        `;

      })
      .join("");


  container
    .querySelectorAll(
      "[data-edit-product]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          openProductModal(
            Number(
              button.dataset.editProduct
            )
          );

        }
      );

    });


  container
    .querySelectorAll(
      "[data-delete-product]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          deleteProduct(
            Number(
              button.dataset.deleteProduct
            )
          );

        }
      );

    });

}


/* =========================
   OPTIONS
========================= */

function normalizeOption(option) {

  if (!option) {
    return {
      name: "",
      surcharge: 0
    };
  }


  if (typeof option === "string") {

    return {
      name: option,
      surcharge: 0
    };

  }


  return {

    name:
      option.name ??
      option.title ??
      option.value ??
      "",

    surcharge:
      Number(
        option.surcharge ??
        option.extra_price ??
        option.price_delta ??
        0
      )

  };

}


function getOptionArray(
  product,
  type
) {

  const value =
    product?.price_options?.[type] ??
    product?.options?.[type] ??
    product?.[type] ??
    [];


  if (!Array.isArray(value)) {
    return [];
  }


  return value.map(
    normalizeOption
  );

}


function setOptionArray(
  type,
  options
) {

  const target =
    type === "colors"
      ? state.colors
      : type === "memories"
        ? state.memories
        : type === "sims"
          ? state.sims
          : state.regions;


  target.splice(
    0,
    target.length,
    ...options
  );

}


/* =========================
   OPTION RENDER
========================= */

function renderOptionList(
  type,
  containerId,
  emptyText
) {

  const container =
    $(`#${containerId}`);


  if (!container) {
    return;
  }


  const list =
    type === "colors"
      ? state.colors
      : type === "memories"
        ? state.memories
        : type === "sims"
          ? state.sims
          : state.regions;


  if (!list.length) {

    container.innerHTML = `

      <div class="option-empty">
        ${escapeHtml(emptyText)}
      </div>

    `;

    updatePricePreview();

    return;

  }


  container.innerHTML =
    list
      .map(
        (option, index) => `

          <div
            class="option-row"
            data-option-type="${type}"
            data-option-index="${index}"
          >

            <div class="option-number">
              ${index + 1}
            </div>


            <div class="option-name">

              <input
                type="text"
                value="${escapeHtml(option.name)}"
                placeholder="Название"
                data-option-name
              />

            </div>


            <div class="option-surcharge">

              <input
                type="number"
                min="0"
                step="1"
                value="${Number(
                  option.surcharge || 0
                )}"
                placeholder="0"
                data-option-surcharge
              />

              <span>
                ₽
              </span>

            </div>


            <button
              type="button"
              class="option-delete"
              data-option-delete
              aria-label="Удалить"
            >
              ×
            </button>

          </div>

        `
      )
      .join("");


  container
    .querySelectorAll(
      "[data-option-name]"
    )
    .forEach(input => {

      input.addEventListener(
        "input",
        event => {

          const row =
            event.target.closest(
              ".option-row"
            );

          const index =
            Number(
              row.dataset.optionIndex
            );


          const target =
            type === "colors"
              ? state.colors
              : type === "memories"
                ? state.memories
                : type === "sims"
                  ? state.sims
                  : state.regions;


          target[index].name =
            event.target.value;


          updatePricePreview();

        }
      );

    });


  container
    .querySelectorAll(
      "[data-option-surcharge]"
    )
    .forEach(input => {

      input.addEventListener(
        "input",
        event => {

          const row =
            event.target.closest(
              ".option-row"
            );

          const index =
            Number(
              row.dataset.optionIndex
            );


          const target =
            type === "colors"
              ? state.colors
              : type === "memories"
                ? state.memories
                : type === "sims"
                  ? state.sims
                  : state.regions;


          target[index].surcharge =
            Number(
              event.target.value || 0
            );


          updatePricePreview();

        }
      );

    });


  container
    .querySelectorAll(
      "[data-option-delete]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          const row =
            event.target.closest(
              ".option-row"
            );

          const index =
            Number(
              row.dataset.optionIndex
            );


          const target =
            type === "colors"
              ? state.colors
              : type === "memories"
                ? state.memories
                : type === "sims"
                  ? state.sims
                  : state.regions;


          target.splice(
            index,
            1
          );


          renderAllOptionLists();

        }
      );

    });


  updatePricePreview();

}


function renderAllOptionLists() {

  renderOptionList(
    "colors",
    "colorsContainer",
    "Цвета ещё не добавлены."
  );


  renderOptionList(
    "memories",
    "memoryContainer",
    "Варианты памяти ещё не добавлены."
  );


  renderOptionList(
    "sims",
    "simContainer",
    "Варианты SIM ещё не добавлены."
  );


  renderOptionList(
    "regions",
    "regionContainer",
    "Регионы ещё не добавлены."
  );

}


/* =========================
   ADD OPTION
========================= */

function addOption(type) {

  const target =
    type === "colors"
      ? state.colors
      : type === "memories"
        ? state.memories
        : type === "sims"
          ? state.sims
          : state.regions;


  target.push({

    name: "",

    surcharge: 0

  });


  renderAllOptionLists();


  const container =
    type === "colors"
      ? $("#colorsContainer")
      : type === "memories"
        ? $("#memoryContainer")
        : type === "sims"
          ? $("#simContainer")
          : $("#regionContainer");


  const lastInput =
    container?.querySelector(
      ".option-row:last-child [data-option-name]"
    );


  lastInput?.focus();

}


/* =========================
   PRICE PREVIEW
========================= */

function updatePricePreview() {

  const base =
    Number(
      $("#productPrice")?.value ||
      0
    );


  const all = [

    ...state.colors,

    ...state.memories,

    ...state.sims,

    ...state.regions

  ];


  const maxSurcharge =
    all.reduce(
      (
        total,
        option
      ) => {

        return (
          total +
          Number(
            option.surcharge || 0
          )
        );

      },
      0
    );


  const baseElement =
    $("#previewBasePrice");

  const maxElement =
    $("#previewMaxPrice");


  if (baseElement) {

    baseElement.textContent =
      formatPrice(base);

  }


  if (maxElement) {

    maxElement.textContent =
      formatPrice(
        base +
        maxSurcharge
      );

  }

}


/* =========================
   OPEN PRODUCT
========================= */

function openProductModal(
  productId = null
) {

  state.editingProductId =
    productId;


  const modal =
    $("#productModal");


  if (!modal) {
    return;
  }


  const product =
    productId
      ? state.products.find(
          item =>
            Number(item.id) ===
            Number(productId)
        )
      : null;


  $("#productId").value =
    product?.id || "";


  $("#productName").value =
    product?.name || "";


  $("#productPrice").value =
    product?.price ?? "";


  $("#productDescription").value =
    product?.description || "";


  $("#productImage").value =
    "";


  /* OPTIONS */

  setOptionArray(
    "colors",
    getOptionArray(
      product,
      "colors"
    )
  );


  setOptionArray(
    "memories",
    getOptionArray(
      product,
      "memories"
    )
  );


  setOptionArray(
    "sims",
    getOptionArray(
      product,
      "sims"
    )
  );


  setOptionArray(
    "regions",
    getOptionArray(
      product,
      "regions"
    )
  );


  /* CATEGORY */

  const categorySelect =
    $("#productCategory");


  if (categorySelect) {

    categorySelect.innerHTML = `

      <option value="">
        Без категории
      </option>

      ${state.categories
        .map(
          category => `

            <option
              value="${category.id}"
              ${
                product?.category_id ==
                category.id
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


  /* IMAGE */

  const imagePreview =
    $("#currentProductImage");


  if (imagePreview) {

    if (product?.image) {

      imagePreview.innerHTML = `

        <img
          src="${escapeHtml(product.image)}"
          alt=""
        >

      `;

      imagePreview.classList.remove(
        "hidden"
      );

    } else {

      imagePreview.innerHTML = "";

      imagePreview.classList.add(
        "hidden"
      );

    }

  }


  const title =
    $("#productModalTitle");


  if (title) {

    title.textContent =
      product
        ? "Редактировать товар"
        : "Новый товар";

  }


  renderAllOptionLists();

  updatePricePreview();


  modal.classList.remove(
    "hidden"
  );

}


/* =========================
   CLOSE PRODUCT
========================= */

function closeProductModal() {

  const modal =
    $("#productModal");


  if (modal) {

    modal.classList.add(
      "hidden"
    );

  }


  state.editingProductId =
    null;


  state.colors = [];

  state.memories = [];

  state.sims = [];

  state.regions = [];

}


/* =========================
   SAVE PRODUCT
========================= */

async function saveProduct(
  event
) {

  event.preventDefault();


  const name =
    $("#productName")
      ?.value
      .trim();


  const price =
    Number(
      $("#productPrice")
        ?.value ||
      0
    );


  const description =
    $("#productDescription")
      ?.value
      .trim() ||
    "";


  const categoryValue =
    $("#productCategory")
      ?.value ||
    "";


  if (!name) {

    showToast(
      "Введите название товара",
      "error"
    );

    return;

  }


  if (price < 0) {

    showToast(
      "Цена не может быть отрицательной",
      "error"
    );

    return;

  }


  try {

    showLoader(true);


    let image = "";


    const imageFile =
      $("#productImage")
        ?.files?.[0];


    if (imageFile) {

      image =
        await fileToDataUrl(
          imageFile
        );

    } else {

      const existing =
        state.products.find(
          product =>
            Number(product.id) ===
            Number(
              state.editingProductId
            )
        );


      image =
        existing?.image ||
        "";

    }


    const cleanOptions =
      array => {

        return array
          .map(option => ({

            name:
              String(
                option.name ||
                ""
              ).trim(),

            surcharge:
              Number(
                option.surcharge ||
                0
              )

          }))
          .filter(
            option =>
              option.name
          );

      };


    const price_options = {

      colors:
        cleanOptions(
          state.colors
        ),

      memories:
        cleanOptions(
          state.memories
        ),

      sims:
        cleanOptions(
          state.sims
        ),

      regions:
        cleanOptions(
          state.regions
        )

    };


    const payload = {

      name,

      price,

      image,

      description,

      category_id:
        categoryValue
          ? Number(categoryValue)
          : null,

      price_options

    };


    let result;


    if (state.editingProductId) {

      result =
        await api(
          `/api/admin/products/${state.editingProductId}`,
          {
            method: "PUT",

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

      result =
        await api(
          "/api/admin/products",
          {
            method: "POST",

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

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  } finally {

    showLoader(false);

  }

}


/* =========================
   DELETE PRODUCT
========================= */

async function deleteProduct(
  productId
) {

  const product =
    state.products.find(
      item =>
        Number(item.id) ===
        Number(productId)
    );


  if (!product) {
    return;
  }


  const confirmed =
    confirm(
      `Удалить товар «${product.name}»?`
    );


  if (!confirmed) {
    return;
  }


  try {

    showLoader(true);


    await api(
      `/api/admin/products/${productId}`,
      {
        method: "DELETE"
      }
    );


    showToast(
      "Товар удалён"
    );


    await loadProducts();

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  } finally {

    showLoader(false);

  }

}


/* =========================
   CATEGORIES
========================= */

async function loadCategories() {

  try {

    const data =
      await api(
        "/api/admin/categories"
      );


    state.categories =
      Array.isArray(data)
        ? data
        : (
            data.categories ||
            []
          );


    renderCategories();

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  }

}


function renderCategories() {

  const container =
    $("#categoriesList");


  if (!container) {
    return;
  }


  if (!state.categories.length) {

    container.innerHTML = `

      <div class="admin-empty">

        <div class="admin-empty-icon">
          ＋
        </div>

        <h3>
          Категорий пока нет
        </h3>

        <p>
          Создайте первую категорию.
        </p>

      </div>

    `;

    return;

  }


  container.innerHTML =
    state.categories
      .map(
        category => `

          <div class="admin-category-card">

            <div class="admin-category-icon">

              ${
                category.image
                  ? `
                    <img
                      src="${escapeHtml(category.image)}"
                      alt=""
                    >
                  `
                  : "IR"
              }

            </div>


            <div class="admin-category-main">

              <h3>
                ${escapeHtml(
                  category.name
                )}
              </h3>

              ${
                category.description
                  ? `
                    <p>
                      ${escapeHtml(
                        category.description
                      )}
                    </p>
                  `
                  : ""
              }

            </div>


            <div class="admin-category-actions">

              <button
                class="icon-button"
                type="button"
                data-edit-category="${category.id}"
              >
                ✎
              </button>

              <button
                class="icon-button danger"
                type="button"
                data-delete-category="${category.id}"
              >
                ×
              </button>

            </div>

          </div>

        `
      )
      .join("");


  container
    .querySelectorAll(
      "[data-edit-category]"
    )
    .forEach(button => {

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


  container
    .querySelectorAll(
      "[data-delete-category]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          deleteCategory(
            Number(
              button.dataset.deleteCategory
            )
          );

        }
      );

    });

}


/* =========================
   CATEGORY MODAL
========================= */

function openCategoryModal(
  categoryId = null
) {

  state.editingCategoryId =
    categoryId;


  const modal =
    $("#categoryModal");


  if (!modal) {
    return;
  }


  const category =
    categoryId
      ? state.categories.find(
          item =>
            Number(item.id) ===
            Number(categoryId)
        )
      : null;


  $("#categoryId").value =
    category?.id || "";


  $("#categoryName").value =
    category?.name || "";


  $("#categoryDescription").value =
    category?.description || "";


  $("#categoryImage").value =
    "";


  const title =
    $("#categoryModalTitle");


  if (title) {

    title.textContent =
      category
        ? "Редактировать категорию"
        : "Новая категория";

  }


  modal.classList.remove(
    "hidden"
  );

}


function closeCategoryModal() {

  const modal =
    $("#categoryModal");


  if (modal) {

    modal.classList.add(
      "hidden"
    );

  }


  state.editingCategoryId =
    null;

}


/* =========================
   SAVE CATEGORY
========================= */

async function saveCategory(
  event
) {

  event.preventDefault();


  const name =
    $("#categoryName")
      ?.value
      .trim();


  const description =
    $("#categoryDescription")
      ?.value
      .trim() ||
    "";


  if (!name) {

    showToast(
      "Введите название категории",
      "error"
    );

    return;

  }


  try {

    showLoader(true);


    let image = "";


    const file =
      $("#categoryImage")
        ?.files?.[0];


    if (file) {

      image =
        await fileToDataUrl(
          file
        );

    } else {

      const existing =
        state.categories.find(
          category =>
            Number(category.id) ===
            Number(
              state.editingCategoryId
            )
        );


      image =
        existing?.image ||
        "";

    }


    const payload = {

      name,

      image,

      description

    };


    if (state.editingCategoryId) {

      await api(
        `/api/admin/categories/${state.editingCategoryId}`,
        {
          method: "PUT",

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
          method: "POST",

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

    await loadProducts();

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  } finally {

    showLoader(false);

  }

}


/* =========================
   DELETE CATEGORY
========================= */

async function deleteCategory(
  categoryId
) {

  const category =
    state.categories.find(
      item =>
        Number(item.id) ===
        Number(categoryId)
    );


  if (!category) {
    return;
  }


  const confirmed =
    confirm(
      `Удалить категорию «${category.name}»?`
    );


  if (!confirmed) {
    return;
  }


  try {

    showLoader(true);


    await api(
      `/api/admin/categories/${categoryId}`,
      {
        method: "DELETE"
      }
    );


    showToast(
      "Категория удалена"
    );


    await loadCategories();

    await loadProducts();

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  } finally {

    showLoader(false);

  }

}


/* =========================
   ORDERS
========================= */

async function loadOrders() {

  try {

    const data =
      await api(
        "/api/admin/orders"
      );


    state.orders =
      Array.isArray(data)
        ? data
        : (
            data.orders ||
            []
          );


    renderOrders();

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  }

}


function renderOrders() {

  const container =
    $("#ordersList");


  if (!container) {
    return;
  }


  if (!state.orders.length) {

    container.innerHTML = `

      <div class="admin-empty">

        <div class="admin-empty-icon">
          ⌁
        </div>

        <h3>
          Заказов пока нет
        </h3>

        <p>
          Новые заказы появятся здесь.
        </p>

      </div>

    `;

    return;

  }


  container.innerHTML =
    state.orders
      .map(
        order => `

          <div class="admin-order-card">

            <div class="admin-order-header">

              <div>

                <div class="admin-order-number">
                  #${escapeHtml(
                    order.display_id ||
                    order.order_number ||
                    order.id
                  )}
                </div>

                <div class="admin-order-date">
                  ${formatDate(
                    order.created_at
                  )}
                </div>

              </div>


              <div
                class="
                  admin-order-status
                  ${statusClass(
                    order.status
                  )}
                "
              >
                ${statusLabel(
                  order.status
                )}
              </div>

            </div>


            <button
              type="button"
              class="admin-order-product-only"
              data-order-details="${escapeHtml(
                order.id
              )}"
            >

              <div class="admin-order-product-image">

                ${
                  order.product_image
                    ? `
                      <img
                        src="${escapeHtml(
                          order.product_image
                        )}"
                        alt=""
                      >
                    `
                    : "IR"
                }

              </div>


              <div class="admin-order-product-info">

                <strong>
                  ${escapeHtml(
                    order.product_name ||
                    order.name ||
                    "Товар"
                  )}
                </strong>

              </div>

            </button>


            <div class="admin-order-footer">

              <select
                class="order-status-select"
                data-order-status="${escapeHtml(
                  order.id
                )}"
              >

                ${[
                  "new",
                  "processing",
                  "awaiting_payment",
                  "reserved",
                  "completed",
                  "cancelled"
                ]
                  .map(
                    status => `

                      <option
                        value="${status}"
                        ${
                          order.status === status
                            ? "selected"
                            : ""
                        }
                      >
                        ${statusLabel(
                          status
                        )}
                      </option>

                    `
                  )
                  .join("")}

              </select>


              <button
                type="button"
                class="admin-order-details"
                data-order-details="${escapeHtml(
                  order.id
                )}"
              >
                Подробнее
              </button>

            </div>

          </div>

        `
      )
      .join("");


  container
    .querySelectorAll(
      "[data-order-status]"
    )
    .forEach(select => {

      select.addEventListener(
        "change",
        () => {

          updateOrderStatus(
            select.dataset.orderStatus,
            select.value
          );

        }
      );

    });


  container
    .querySelectorAll(
      "[data-order-details]"
    )
    .forEach(button => {

      button.addEventListener(
        "click",
        event => {

          event.stopPropagation();

          openOrderDetails(
            button.dataset.orderDetails
          );

        }
      );

    });

}


/* =========================
   ORDER STATUS
========================= */

async function updateOrderStatus(
  orderId,
  status
) {

  try {

    showLoader(true);


    await api(
      `/api/admin/orders/${encodeURIComponent(
        orderId
      )}/status`,
      {
        method: "PUT",

        body:
          JSON.stringify({
            status
          })
      }
    );


    showToast(
      `Статус изменён: ${statusLabel(
        status
      )}`
    );


    await loadOrders();

  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );


    await loadOrders();

  } finally {

    showLoader(false);

  }

}


/* =========================
   ORDER DETAILS
========================= */

async function openOrderDetails(
  orderId
) {

  try {

    showLoader(true);


    const data =
      await api(
        `/api/admin/orders/${encodeURIComponent(
          orderId
        )}`
      );


    const order =
      data.order ||
      data;


    const username =
      order.username
        ? `@${String(
            order.username
          ).replace(
            /^@/,
            ""
          )}`
        : "Без username";


    const modal =
      document.createElement(
        "div"
      );


    modal.className =
      "admin-order-modal";


    modal.innerHTML = `

      <div
        class="admin-order-modal-backdrop"
      ></div>


      <div
        class="admin-order-modal-card"
      >

        <button
          class="admin-modal-close"
          type="button"
        >
          ×
        </button>


        <div
          class="admin-order-modal-title"
        >
          Заказ #${escapeHtml(
            order.display_id ||
            order.order_number ||
            order.id
          )}
        </div>


        <div
          class="admin-order-detail"
        >

          <div class="admin-detail-row">

            <span>
              Товар
            </span>

            <strong>
              ${escapeHtml(
                order.product_name ||
                order.name ||
                "—"
              )}
            </strong>

          </div>


          <div class="admin-detail-row">

            <span>
              Вариант
            </span>

            <strong>
              ${escapeHtml(
                order.variant_text ||
                "—"
              )}
            </strong>

          </div>


          <div class="admin-detail-row">

            <span>
              Цена
            </span>

            <strong>
              ${formatPrice(
                order.price
              )}
            </strong>

          </div>


          <div class="admin-detail-row">

            <span>
              Клиент
            </span>

            <strong>
              ${escapeHtml(
                username
              )}
            </strong>

          </div>


          <div class="admin-detail-row">

            <span>
              Telegram ID
            </span>

            <strong>
              ${escapeHtml(
                order.user_id ||
                "—"
              )}
            </strong>

          </div>


          <div class="admin-detail-row">

            <span>
              Статус
            </span>

            <strong>
              ${statusLabel(
                order.status
              )}
            </strong>

          </div>


          <div class="admin-detail-row">

            <span>
              Создан
            </span>

            <strong>
              ${formatDate(
                order.created_at
              )}
            </strong>

          </div>


          ${
            order.comment
              ? `

                <div
                  class="admin-detail-comment"
                >

                  <span>
                    Комментарий
                  </span>

                  <p>
                    ${escapeHtml(
                      order.comment
                    )}
                  </p>

                </div>

              `
              : ""
          }

        </div>

      </div>

    `;


    document.body.appendChild(
      modal
    );


    modal
      .querySelector(
        ".admin-modal-close"
      )
      ?.addEventListener(
        "click",
        () => {
          modal.remove();
        }
      );


    modal
      .querySelector(
        ".admin-order-modal-backdrop"
      )
      ?.addEventListener(
        "click",
        () => {
          modal.remove();
        }
      );


  } catch (error) {

    console.error(error);

    showToast(
      error.message,
      "error"
    );

  } finally {

    showLoader(false);

  }

}


/* =========================
   EVENTS
========================= */

function setupButtons() {

  $("#addProductButton")
    ?.addEventListener(
      "click",
      () => {
        openProductModal();
      }
    );


  $("#addCategoryButton")
    ?.addEventListener(
      "click",
      () => {
        openCategoryModal();
      }
    );


  $("#addColorButton")
    ?.addEventListener(
      "click",
      () => {
        addOption("colors");
      }
    );


  $("#addMemoryButton")
    ?.addEventListener(
      "click",
      () => {
        addOption("memories");
      }
    );


  $("#addSimButton")
    ?.addEventListener(
      "click",
      () => {
        addOption("sims");
      }
    );


  $("#addRegionButton")
    ?.addEventListener(
      "click",
      () => {
        addOption("regions");
      }
    );


  $("#productForm")
    ?.addEventListener(
      "submit",
      saveProduct
    );


  $("#categoryForm")
    ?.addEventListener(
      "submit",
      saveCategory
    );


  $("#refreshOrders")
    ?.addEventListener(
      "click",
      loadOrders
    );


  $("#backToStore")
    ?.addEventListener(
      "click",
      () => {
        location.href = "/";
      }
    );


  $("#productPrice")
    ?.addEventListener(
      "input",
      updatePricePreview
    );


  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(element => {

      element.addEventListener(
        "click",
        () => {

          const type =
            element.dataset.closeModal;


          if (type === "product") {

            closeProductModal();

          }


          if (type === "category") {

            closeCategoryModal();

          }

        }
      );

    });


  document.addEventListener(
    "keydown",
    event => {

      if (
        event.key !==
        "Escape"
      ) {
        return;
      }


      closeProductModal();

      closeCategoryModal();

    }
  );

}


/* =========================
   INIT
========================= */

async function init() {

  try {

    const allowed =
      await checkAdmin();


    if (!allowed) {
      return;
    }


    setupTabs();

    setupButtons();


    await loadCategories();

    await loadProducts();

    await loadOrders();


    switchTab(
      "products"
    );


  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Не удалось загрузить админ-панель",
      "error"
    );

  }

}


document.addEventListener(
  "DOMContentLoaded",
  init
);