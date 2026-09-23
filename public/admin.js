const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  products: [],
  categories: [],
  orders: [],
  editingProductId: null,
  editingCategoryId: null
};

const ADMIN_IDS = ["5082864281", "5975037118"];

function telegramInitData() {
  return tg?.initData || "";
}

function getTelegramUser() {
  return tg?.initDataUnsafe?.user || null;
}

function isAdmin() {
  const user = getTelegramUser();

  if (!user?.id) return false;

  return ADMIN_IDS.includes(String(user.id));
}

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
    throw new Error(data.error || "Ошибка запроса");
  }

  return data;
}

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

  return new Intl.NumberFormat("ru-RU").format(number) + " ₽";
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

function statusLabel(status) {
  const labels = {
    new: "Новый",
    processing: "В обработке",
    awaiting_payment: "Ожидает оплаты",
    reserved: "Забронирован",
    completed: "Завершён",
    cancelled: "Отменён"
  };

  return labels[status] || status || "—";
}

function statusClass(status) {
  return `status-${String(status || "new").replaceAll("_", "-")}`;
}

function showToast(message, type = "success") {
  let toast = document.querySelector(".admin-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.className = "admin-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.dataset.type = type;

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });
}

function showLoader(show = true) {
  let loader = document.querySelector(".admin-loader");

  if (!loader) {
    loader = document.createElement("div");
    loader.className = "admin-loader";
    loader.innerHTML = `
      <div class="admin-loader-spinner"></div>
      <div>Загрузка...</div>
    `;
    document.body.appendChild(loader);
  }

  loader.classList.toggle("show", show);
}

function switchTab(tab) {
  document.querySelectorAll(".admin-tab").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
  });

  document.querySelectorAll(".admin-section").forEach(section => {
    section.classList.toggle(
      "active",
      section.dataset.section === tab
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
  document.querySelectorAll(".admin-tab").forEach(button => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });
}

async function checkAdmin() {
  if (!isAdmin()) {
    document.body.innerHTML = `
      <div class="admin-denied">
        <div class="admin-denied-card">
          <div class="admin-denied-icon">×</div>
          <h1>Доступ запрещён</h1>
          <p>У вас нет доступа к панели администратора.</p>
          <button onclick="location.href='/'">
            Вернуться в магазин
          </button>
        </div>
      </div>
    `;

    return false;
  }

  return true;
}

/* =========================
   PRODUCTS
========================= */

async function loadProducts() {
  try {
    const data = await api("/api/admin/products");

    state.products = Array.isArray(data)
      ? data
      : data.products || [];

    renderProducts();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  }
}

function renderProducts() {
  const container = $("#products-list");

  if (!container) return;

  if (!state.products.length) {
    container.innerHTML = `
      <div class="admin-empty">
        <div class="admin-empty-icon">＋</div>
        <h3>Товаров пока нет</h3>
        <p>Добавьте первый товар.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = state.products.map(product => {
    const variants = Array.isArray(product.variants)
      ? product.variants
      : [];

    return `
      <div class="admin-product-card">

        <div class="admin-product-image">
          ${
            product.image
              ? `<img src="${escapeHtml(product.image)}" alt="">`
              : `<div class="admin-product-placeholder">IR</div>`
          }
        </div>

        <div class="admin-product-main">

          <div class="admin-product-top">
            <div>
              <h3>${escapeHtml(product.name)}</h3>

              <div class="admin-product-category">
                ${escapeHtml(product.category_name || "Без категории")}
              </div>
            </div>

            <div class="admin-product-actions">
              <button
                class="icon-button"
                data-edit-product="${product.id}"
                title="Изменить"
              >
                ✎
              </button>

              <button
                class="icon-button danger"
                data-delete-product="${product.id}"
                title="Удалить"
              >
                ×
              </button>
            </div>
          </div>

          <div class="admin-product-price">
            ${formatPrice(product.price)}
          </div>

          ${
            variants.length
              ? `
                <div class="admin-variants">
                  ${variants.map(variant => `
                    <div class="admin-variant">
                      <span>
                        ${escapeHtml(variant.name || variant.title || variant.value || "Вариант")}
                      </span>

                      ${
                        variant.price != null
                          ? `<strong>${formatPrice(variant.price)}</strong>`
                          : ""
                      }
                    </div>
                  `).join("")}
                </div>
              `
              : ""
          }

        </div>

      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-edit-product]").forEach(button => {
    button.addEventListener("click", () => {
      openProductModal(Number(button.dataset.editProduct));
    });
  });

  container.querySelectorAll("[data-delete-product]").forEach(button => {
    button.addEventListener("click", () => {
      deleteProduct(Number(button.dataset.deleteProduct));
    });
  });
}

function openProductModal(productId = null) {
  state.editingProductId = productId;

  const modal = $("#product-modal");

  if (!modal) return;

  const product = productId
    ? state.products.find(item => Number(item.id) === Number(productId))
    : null;

  $("#product-name").value = product?.name || "";
  $("#product-price").value = product?.price ?? "";
  $("#product-image").value = product?.image || "";
  $("#product-description").value = product?.description || "";

  const categorySelect = $("#product-category");

  if (categorySelect) {
    categorySelect.innerHTML = `
      <option value="">Без категории</option>
      ${state.categories.map(category => `
        <option
          value="${category.id}"
          ${product?.category_id == category.id ? "selected" : ""}
        >
          ${escapeHtml(category.name)}
        </option>
      `).join("")}
    `;
  }

  const title = $("#product-modal-title");

  if (title) {
    title.textContent = product
      ? "Редактировать товар"
      : "Новый товар";
  }

  modal.classList.add("open");
}

function closeProductModal() {
  const modal = $("#product-modal");

  if (modal) {
    modal.classList.remove("open");
  }

  state.editingProductId = null;
}

async function saveProduct(event) {
  event.preventDefault();

  const name = $("#product-name")?.value.trim();
  const price = Number($("#product-price")?.value || 0);
  const image = $("#product-image")?.value.trim();
  const description = $("#product-description")?.value.trim();
  const categoryId = $("#product-category")?.value || null;

  if (!name) {
    showToast("Введите название товара", "error");
    return;
  }

  try {
    showLoader(true);

    const payload = {
      name,
      price,
      image,
      description,
      category_id: categoryId
        ? Number(categoryId)
        : null
    };

    if (state.editingProductId) {
      await api(
        `/api/admin/products/${state.editingProductId}`,
        {
          method: "PUT",
          body: JSON.stringify(payload)
        }
      );

      showToast("Товар обновлён");
    } else {
      await api(
        "/api/admin/products",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      showToast("Товар добавлен");
    }

    closeProductModal();

    await loadProducts();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  } finally {
    showLoader(false);
  }
}

async function deleteProduct(productId) {
  const product = state.products.find(
    item => Number(item.id) === Number(productId)
  );

  if (!product) return;

  const confirmed = confirm(
    `Удалить товар «${product.name}»?`
  );

  if (!confirmed) return;

  try {
    showLoader(true);

    await api(
      `/api/admin/products/${productId}`,
      {
        method: "DELETE"
      }
    );

    showToast("Товар удалён");

    await loadProducts();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  } finally {
    showLoader(false);
  }
}

/* =========================
   CATEGORIES
========================= */

async function loadCategories() {
  try {
    const data = await api("/api/admin/categories");

    state.categories = Array.isArray(data)
      ? data
      : data.categories || [];

    renderCategories();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  }
}

function renderCategories() {
  const container = $("#categories-list");

  if (!container) return;

  if (!state.categories.length) {
    container.innerHTML = `
      <div class="admin-empty">
        <div class="admin-empty-icon">＋</div>
        <h3>Категорий пока нет</h3>
        <p>Создайте категорию для товаров.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = state.categories.map(category => `
    <div class="admin-category-card">

      <div class="admin-category-icon">
        ${
          category.image
            ? `<img src="${escapeHtml(category.image)}" alt="">`
            : "IR"
        }
      </div>

      <div class="admin-category-main">
        <h3>${escapeHtml(category.name)}</h3>

        ${
          category.description
            ? `<p>${escapeHtml(category.description)}</p>`
            : ""
        }
      </div>

      <div class="admin-category-actions">

        <button
          class="icon-button"
          data-edit-category="${category.id}"
        >
          ✎
        </button>

        <button
          class="icon-button danger"
          data-delete-category="${category.id}"
        >
          ×
        </button>

      </div>

    </div>
  `).join("");

  container.querySelectorAll("[data-edit-category]").forEach(button => {
    button.addEventListener("click", () => {
      openCategoryModal(Number(button.dataset.editCategory));
    });
  });

  container.querySelectorAll("[data-delete-category]").forEach(button => {
    button.addEventListener("click", () => {
      deleteCategory(Number(button.dataset.deleteCategory));
    });
  });
}

function openCategoryModal(categoryId = null) {
  state.editingCategoryId = categoryId;

  const modal = $("#category-modal");

  if (!modal) return;

  const category = categoryId
    ? state.categories.find(
        item => Number(item.id) === Number(categoryId)
      )
    : null;

  $("#category-name").value = category?.name || "";
  $("#category-image").value = category?.image || "";
  $("#category-description").value =
    category?.description || "";

  const title = $("#category-modal-title");

  if (title) {
    title.textContent = category
      ? "Редактировать категорию"
      : "Новая категория";
  }

  modal.classList.add("open");
}

function closeCategoryModal() {
  const modal = $("#category-modal");

  if (modal) {
    modal.classList.remove("open");
  }

  state.editingCategoryId = null;
}

async function saveCategory(event) {
  event.preventDefault();

  const name = $("#category-name")?.value.trim();
  const image = $("#category-image")?.value.trim();
  const description =
    $("#category-description")?.value.trim();

  if (!name) {
    showToast("Введите название категории", "error");
    return;
  }

  try {
    showLoader(true);

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
          body: JSON.stringify(payload)
        }
      );

      showToast("Категория обновлена");
    } else {
      await api(
        "/api/admin/categories",
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );

      showToast("Категория добавлена");
    }

    closeCategoryModal();

    await loadCategories();
    await loadProducts();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  } finally {
    showLoader(false);
  }
}

async function deleteCategory(categoryId) {
  const category = state.categories.find(
    item => Number(item.id) === Number(categoryId)
  );

  if (!category) return;

  const confirmed = confirm(
    `Удалить категорию «${category.name}»?`
  );

  if (!confirmed) return;

  try {
    showLoader(true);

    await api(
      `/api/admin/categories/${categoryId}`,
      {
        method: "DELETE"
      }
    );

    showToast("Категория удалена");

    await loadCategories();
    await loadProducts();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  } finally {
    showLoader(false);
  }
}

/* =========================
   ORDERS
========================= */

async function loadOrders() {
  try {
    const data = await api("/api/admin/orders");

    state.orders = Array.isArray(data)
      ? data
      : data.orders || [];

    renderOrders();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  }
}

function renderOrders() {
  const container = $("#orders-list");

  if (!container) return;

  if (!state.orders.length) {
    container.innerHTML = `
      <div class="admin-empty">
        <div class="admin-empty-icon">⌁</div>
        <h3>Заказов пока нет</h3>
        <p>Новые заказы появятся здесь.</p>
      </div>
    `;

    return;
  }

  container.innerHTML = state.orders.map(order => {
    const username = order.username
      ? `@${String(order.username).replace(/^@/, "")}`
      : "Без username";

    return `
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
              ${formatDate(order.created_at)}
            </div>
          </div>

          <div class="
            admin-order-status
            ${statusClass(order.status)}
          ">
            ${statusLabel(order.status)}
          </div>

        </div>

        <div class="admin-order-product">

          <div class="admin-order-product-image">
            ${
              order.product_image
                ? `<img
                    src="${escapeHtml(order.product_image)}"
                    alt=""
                  >`
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

            ${
              order.variant_text
                ? `
                  <span>
                    ${escapeHtml(order.variant_text)}
                  </span>
                `
                : ""
            }

          </div>

        </div>

        <div class="admin-order-info">

          <div class="admin-order-row">
            <span>Клиент</span>
            <strong>${escapeHtml(username)}</strong>
          </div>

          <div class="admin-order-row">
            <span>Telegram ID</span>
            <strong>${escapeHtml(order.user_id || "—")}</strong>
          </div>

          <div class="admin-order-row">
            <span>Сумма</span>
            <strong>${formatPrice(order.price)}</strong>
          </div>

        </div>

        <div class="admin-order-footer">

          <select
            class="order-status-select"
            data-order-status="${escapeHtml(order.id)}"
          >
            ${[
              "new",
              "processing",
              "awaiting_payment",
              "reserved",
              "completed",
              "cancelled"
            ].map(status => `
              <option
                value="${status}"
                ${order.status === status ? "selected" : ""}
              >
                ${statusLabel(status)}
              </option>
            `).join("")}
          </select>

          <button
            class="admin-order-details"
            data-order-details="${escapeHtml(order.id)}"
          >
            Подробнее
          </button>

        </div>

      </div>
    `;
  }).join("");

  container
    .querySelectorAll("[data-order-status]")
    .forEach(select => {
      select.addEventListener("change", () => {
        updateOrderStatus(
          select.dataset.orderStatus,
          select.value
        );
      });
    });

  container
    .querySelectorAll("[data-order-details]")
    .forEach(button => {
      button.addEventListener("click", () => {
        openOrderDetails(
          button.dataset.orderDetails
        );
      });
    });
}

async function updateOrderStatus(orderId, status) {
  try {
    showLoader(true);

    await api(
      `/api/admin/orders/${encodeURIComponent(orderId)}/status`,
      {
        method: "PUT",
        body: JSON.stringify({
          status
        })
      }
    );

    showToast(
      `Статус изменён: ${statusLabel(status)}`
    );

    await loadOrders();
  } catch (error) {
    console.error(error);
    showToast(error.message, "error");

    await loadOrders();
  } finally {
    showLoader(false);
  }
}

async function openOrderDetails(orderId) {
  try {
    showLoader(true);

    const data = await api(
      `/api/admin/orders/${encodeURIComponent(orderId)}`
    );

    const order = data.order || data;

    const username = order.username
      ? `@${String(order.username).replace(/^@/, "")}`
      : "Без username";

    const modal = document.createElement("div");

    modal.className = "admin-order-modal";

    modal.innerHTML = `
      <div class="admin-order-modal-backdrop"></div>

      <div class="admin-order-modal-card">

        <button class="admin-modal-close">×</button>

        <div class="admin-order-modal-title">
          Заказ #${escapeHtml(
            order.display_id ||
            order.order_number ||
            order.id
          )}
        </div>

        <div class="admin-order-detail">

          <div class="admin-detail-row">
            <span>Товар</span>
            <strong>
              ${escapeHtml(
                order.product_name ||
                order.name ||
                "—"
              )}
            </strong>
          </div>

          <div class="admin-detail-row">
            <span>Вариант</span>
            <strong>
              ${escapeHtml(order.variant_text || "—")}
            </strong>
          </div>

          <div class="admin-detail-row">
            <span>Цена</span>
            <strong>${formatPrice(order.price)}</strong>
          </div>

          <div class="admin-detail-row">
            <span>Клиент</span>
            <strong>${escapeHtml(username)}</strong>
          </div>

          <div class="admin-detail-row">
            <span>Telegram ID</span>
            <strong>
              ${escapeHtml(order.user_id || "—")}
            </strong>
          </div>

          <div class="admin-detail-row">
            <span>Статус</span>
            <strong>
              ${statusLabel(order.status)}
            </strong>
          </div>

          <div class="admin-detail-row">
            <span>Создан</span>
            <strong>
              ${formatDate(order.created_at)}
            </strong>
          </div>

          ${
            order.comment
              ? `
                <div class="admin-detail-comment">
                  <span>Комментарий</span>
                  <p>${escapeHtml(order.comment)}</p>
                </div>
              `
              : ""
          }

        </div>

      </div>
    `;

    document.body.appendChild(modal);

    modal
      .querySelector(".admin-modal-close")
      .addEventListener("click", () => {
        modal.remove();
      });

    modal
      .querySelector(".admin-order-modal-backdrop")
      .addEventListener("click", () => {
        modal.remove();
      });

  } catch (error) {
    console.error(error);
    showToast(error.message, "error");
  } finally {
    showLoader(false);
  }
}

/* =========================
   EVENTS
========================= */

function setupButtons() {
  $("#add-product")?.addEventListener(
    "click",
    () => openProductModal()
  );

  $("#add-category")?.addEventListener(
    "click",
    () => openCategoryModal()
  );

  $("#close-product-modal")?.addEventListener(
    "click",
    closeProductModal
  );

  $("#cancel-product")?.addEventListener(
    "click",
    closeProductModal
  );

  $("#close-category-modal")?.addEventListener(
    "click",
    closeCategoryModal
  );

  $("#cancel-category")?.addEventListener(
    "click",
    closeCategoryModal
  );

  $("#product-form")?.addEventListener(
    "submit",
    saveProduct
  );

  $("#category-form")?.addEventListener(
    "submit",
    saveCategory
  );

  $("#refresh-orders")?.addEventListener(
    "click",
    loadOrders
  );

  $("#back-to-store")?.addEventListener(
    "click",
    () => {
      location.href = "/";
    }
  );

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    closeProductModal();
    closeCategoryModal();
  });
}

/* =========================
   INIT
========================= */

async function init() {
  try {
    const allowed = await checkAdmin();

    if (!allowed) return;

    setupTabs();
    setupButtons();

    await loadCategories();
    await loadProducts();
    await loadOrders();

    switchTab("products");
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Не удалось загрузить админ-панель",
      "error"
    );
  }
}

document.addEventListener("DOMContentLoaded", init);