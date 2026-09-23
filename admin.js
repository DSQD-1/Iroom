const tg = window.Telegram?.WebApp;

const ADMIN_IDS = ["5082864281", "5975037118"];

const STATUS_CONFIG = {
  new: {
    title: "Новый",
    className: "status-new"
  },
  processing: {
    title: "В обработке",
    className: "status-processing"
  },
  awaiting_payment: {
    title: "Ожидает оплаты",
    className: "status-payment"
  },
  reserved: {
    title: "Забронирован",
    className: "status-reserved"
  },
  completed: {
    title: "Завершён",
    className: "status-completed"
  },
  cancelled: {
    title: "Отменён",
    className: "status-cancelled"
  }
};

let products = [];
let categories = [];
let orders = [];

let editingProductId = null;
let editingCategoryId = null;
let selectedOrder = null;

function initTelegram() {
  try {
    tg?.ready();
    tg?.expand();
  } catch {}
}

function getInitData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        "x-telegram-init-data": getInitData(),
        ...(options.headers || {})
      }
    });

    let data = {};

    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      throw new Error(
        data?.error ||
        data?.message ||
        `Ошибка ${response.status}`
      );
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function unwrap(data, key) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
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
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0 ₽";
  }

  return `${number.toLocaleString("ru-RU")} ₽`;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getStatus(status) {
  return STATUS_CONFIG[status] || {
    title: status || "Неизвестно",
    className: "status-default"
  };
}

function showToast(message, type = "default") {
  const toast = document.getElementById("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function setLoader(show) {
  const loader = document.getElementById("pageLoader");

  if (!loader) return;

  loader.classList.toggle("hidden", !show);
}

function haptic(type = "light") {
  try {
    tg?.HapticFeedback?.impactOccurred(type);
  } catch {}
}

function closeModal(id) {
  const modal = document.getElementById(id);

  if (!modal) return;

  modal.classList.remove("open");
}

function openModal(id) {
  const modal = document.getElementById(id);

  if (!modal) return;

  modal.classList.add("open");
}

function setupModalClose() {
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) {
        modal.classList.remove("open");
      }
    });
  });
}

/* =========================
   ACCESS
========================= */

async function checkAdmin() {
  const accessScreen = document.getElementById("accessScreen");
  const adminScreen = document.getElementById("adminScreen");

  try {
    const userId = String(
      tg?.initDataUnsafe?.user?.id || ""
    );

    if (ADMIN_IDS.includes(userId)) {
      accessScreen?.classList.add("hidden");
      adminScreen?.classList.remove("hidden");
      return true;
    }

    const data = await api("/api/admin/me");

    const allowed =
      data?.admin === true ||
      data?.is_admin === true ||
      data?.allowed === true;

    if (!allowed) {
      throw new Error("Доступ запрещён");
    }

    accessScreen?.classList.add("hidden");
    adminScreen?.classList.remove("hidden");

    return true;
  } catch (error) {
    console.error(error);

    accessScreen?.classList.remove("hidden");
    adminScreen?.classList.add("hidden");

    const accessText =
      document.getElementById("accessText");

    if (accessText) {
      accessText.textContent =
        "У вас нет доступа к админ-панели";
    }

    return false;
  }
}

/* =========================
   TABS
========================= */

function setupTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;

      if (!target) return;

      document.querySelectorAll(".tab").forEach(item => {
        item.classList.toggle(
          "active",
          item.dataset.tab === target
        );
      });

      document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.toggle(
          "active",
          content.dataset.content === target
        );
      });

      if (target === "orders") {
        loadOrders();
      }

      haptic("light");
    });
  });
}

/* =========================
   PRODUCTS
========================= */

async function loadProducts() {
  try {
    const data = await api("/api/admin/products");

    products = unwrap(data, "products");

    renderProducts();
  } catch (error) {
    console.error(error);
    showToast(
      error.message || "Не удалось загрузить товары",
      "error"
    );
  }
}

function renderProducts() {
  const container = document.getElementById("productsList");

  if (!container) return;

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Товаров пока нет</div>
        <div class="empty-state-text">
          Добавьте первый товар
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(product => {
    const image =
      product.image_url ||
      product.image ||
      product.cover ||
      "";

    const price =
      product.price ??
      product.sale_price ??
      0;

    return `
      <div class="admin-item">
        <div class="admin-item-image">
          ${
            image
              ? `<img src="${escapeHtml(image)}" alt="">`
              : `<div class="image-placeholder">IR</div>`
          }
        </div>

        <div class="admin-item-info">
          <div class="admin-item-title">
            ${escapeHtml(product.name || "Без названия")}
          </div>

          <div class="admin-item-meta">
            ${formatPrice(price)}
          </div>

          ${
            product.category_name
              ? `<div class="admin-item-meta">
                  ${escapeHtml(product.category_name)}
                </div>`
              : ""
          }
        </div>

        <div class="admin-item-actions">
          <button
            class="icon-button"
            type="button"
            data-edit-product="${escapeHtml(product.id)}"
          >
            Изменить
          </button>

          <button
            class="icon-button danger"
            type="button"
            data-delete-product="${escapeHtml(product.id)}"
          >
            Удалить
          </button>
        </div>
      </div>
    `;
  }).join("");

  container
    .querySelectorAll("[data-edit-product]")
    .forEach(button => {
      button.addEventListener("click", () => {
        editProduct(button.dataset.editProduct);
      });
    });

  container
    .querySelectorAll("[data-delete-product]")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteProduct(button.dataset.deleteProduct);
      });
    });
}

function resetProductForm() {
  const form = document.getElementById("productForm");

  if (!form) return;

  form.reset();

  editingProductId = null;

  const title = document.getElementById("productModalTitle");

  if (title) {
    title.textContent = "Новый товар";
  }

  const idInput =
    document.getElementById("productId");

  if (idInput) {
    idInput.value = "";
  }

  const variants =
    document.getElementById("variantsContainer");

  if (variants) {
    variants.innerHTML = "";
  }
}

function editProduct(id) {
  const product = products.find(
    item => String(item.id) === String(id)
  );

  if (!product) return;

  editingProductId = product.id;

  const title = document.getElementById("productModalTitle");

  if (title) {
    title.textContent = "Изменить товар";
  }

  const fields = {
    productId: product.id,
    productName: product.name || "",
    productDescription: product.description || "",
    productPrice:
      product.price ??
      product.sale_price ??
      "",
    productOldPrice:
      product.old_price ??
      "",
    productImage:
      product.image_url ||
      product.image ||
      "",
    productCategoryId:
      product.category_id ??
      ""
  };

  Object.entries(fields).forEach(([id, value]) => {
    const element = document.getElementById(id);

    if (element) {
      element.value = value;
    }
  });

  renderVariantFields(product.variants || []);

  openModal("productModal");
}

function renderVariantFields(variants = []) {
  const container =
    document.getElementById("variantsContainer");

  if (!container) return;

  container.innerHTML = "";

  variants.forEach(variant => {
    addVariantField(variant);
  });
}

function addVariantField(variant = {}) {
  const container =
    document.getElementById("variantsContainer");

  if (!container) return;

  const row = document.createElement("div");

  row.className = "variant-row";

  row.innerHTML = `
    <input
      type="hidden"
      class="variant-id"
      value="${escapeHtml(variant.id || "")}"
    >

    <input
      class="variant-name"
      type="text"
      placeholder="Название варианта"
      value="${escapeHtml(
        variant.name ||
        variant.title ||
        variant.label ||
        ""
      )}"
    >

    <input
      class="variant-price"
      type="number"
      placeholder="Цена"
      value="${escapeHtml(
        variant.price ?? ""
      )}"
    >

    <button
      class="remove-variant"
      type="button"
    >
      ×
    </button>
  `;

  row
    .querySelector(".remove-variant")
    .addEventListener("click", () => {
      row.remove();
    });

  container.appendChild(row);
}

async function uploadProductImage(file) {
  const formData = new FormData();

  formData.append("file", file);

  const data = await api("/api/admin/upload", {
    method: "POST",
    body: formData
  });

  return (
    data?.url ||
    data?.image_url ||
    data?.path ||
    data?.file?.url ||
    ""
  );
}

async function saveProduct(event) {
  event.preventDefault();

  const name =
    document.getElementById("productName")?.value.trim();

  if (!name) {
    showToast("Введите название товара", "error");
    return;
  }

  const description =
    document.getElementById("productDescription")?.value.trim() ||
    "";

  const price =
    Number(
      document.getElementById("productPrice")?.value
    ) || 0;

  const oldPrice =
    Number(
      document.getElementById("productOldPrice")?.value
    ) || null;

  let imageUrl =
    document.getElementById("productImage")?.value.trim() ||
    "";

  const imageFile =
    document.getElementById("productImageFile")?.files?.[0];

  try {
    setLoader(true);

    if (imageFile) {
      imageUrl = await uploadProductImage(imageFile);
    }

    const categoryId =
      document.getElementById("productCategoryId")?.value ||
      null;

    const variants = [];

    document
      .querySelectorAll("#variantsContainer .variant-row")
      .forEach(row => {
        const name =
          row.querySelector(".variant-name")?.value.trim();

        if (!name) return;

        const id =
          row.querySelector(".variant-id")?.value ||
          null;

        const price =
          Number(
            row.querySelector(".variant-price")?.value
          ) || 0;

        variants.push({
          id,
          name,
          price
        });
      });

    const body = {
      name,
      description,
      price,
      old_price: oldPrice,
      image_url: imageUrl,
      category_id: categoryId,
      variants
    };

    if (editingProductId) {
      await api(
        `/api/admin/products/${encodeURIComponent(
          editingProductId
        )}`,
        {
          method: "PUT",
          body: JSON.stringify(body)
        }
      );

      showToast("Товар обновлён", "success");
    } else {
      await api("/api/admin/products", {
        method: "POST",
        body: JSON.stringify(body)
      });

      showToast("Товар добавлен", "success");
    }

    closeModal("productModal");

    resetProductForm();

    await loadProducts();

    haptic("medium");
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Ошибка сохранения товара",
      "error"
    );
  } finally {
    setLoader(false);
  }
}

async function deleteProduct(id) {
  if (!confirm("Удалить этот товар?")) {
    return;
  }

  try {
    setLoader(true);

    await api(
      `/api/admin/products/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    showToast("Товар удалён", "success");

    await loadProducts();

    haptic("medium");
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Не удалось удалить товар",
      "error"
    );
  } finally {
    setLoader(false);
  }
}

/* =========================
   CATEGORIES
========================= */

async function loadCategories() {
  try {
    const data = await api("/api/admin/categories");

    categories = unwrap(data, "categories");

    renderCategories();
    fillCategorySelect();
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Не удалось загрузить категории",
      "error"
    );
  }
}

function renderCategories() {
  const container =
    document.getElementById("categoriesList");

  if (!container) return;

  if (!categories.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">
          Категорий пока нет
        </div>

        <div class="empty-state-text">
          Добавьте первую категорию
        </div>
      </div>
    `;

    return;
  }

  container.innerHTML = categories.map(category => `
    <div class="category-item">
      <div class="category-item-info">
        <div class="category-item-title">
          ${escapeHtml(category.name || "Без названия")}
        </div>

        <div class="category-item-meta">
          ID: ${escapeHtml(category.id)}
        </div>
      </div>

      <div class="admin-item-actions">
        <button
          class="icon-button"
          type="button"
          data-edit-category="${escapeHtml(category.id)}"
        >
          Изменить
        </button>

        <button
          class="icon-button danger"
          type="button"
          data-delete-category="${escapeHtml(category.id)}"
        >
          Удалить
        </button>
      </div>
    </div>
  `).join("");

  container
    .querySelectorAll("[data-edit-category]")
    .forEach(button => {
      button.addEventListener("click", () => {
        editCategory(button.dataset.editCategory);
      });
    });

  container
    .querySelectorAll("[data-delete-category]")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteCategory(button.dataset.deleteCategory);
      });
    });
}

function fillCategorySelect() {
  const select =
    document.getElementById("productCategoryId");

  if (!select) return;

  const currentValue = select.value;

  select.innerHTML = `
    <option value="">Без категории</option>
    ${categories.map(category => `
      <option value="${escapeHtml(category.id)}">
        ${escapeHtml(category.name)}
      </option>
    `).join("")}
  `;

  if (currentValue) {
    select.value = currentValue;
  }
}

function resetCategoryForm() {
  const form =
    document.getElementById("categoryForm");

  form?.reset();

  editingCategoryId = null;

  const title =
    document.getElementById("categoryModalTitle");

  if (title) {
    title.textContent = "Новая категория";
  }
}

function editCategory(id) {
  const category = categories.find(
    item => String(item.id) === String(id)
  );

  if (!category) return;

  editingCategoryId = category.id;

  const title =
    document.getElementById("categoryModalTitle");

  if (title) {
    title.textContent = "Изменить категорию";
  }

  const idInput =
    document.getElementById("categoryId");

  const nameInput =
    document.getElementById("categoryName");

  if (idInput) {
    idInput.value = category.id;
  }

  if (nameInput) {
    nameInput.value = category.name || "";
  }

  openModal("categoryModal");
}

async function saveCategory(event) {
  event.preventDefault();

  const name =
    document.getElementById("categoryName")?.value.trim();

  if (!name) {
    showToast("Введите название категории", "error");
    return;
  }

  try {
    setLoader(true);

    const body = {
      name
    };

    if (editingCategoryId) {
      await api(
        `/api/admin/categories/${encodeURIComponent(
          editingCategoryId
        )}`,
        {
          method: "PUT",
          body: JSON.stringify(body)
        }
      );

      showToast("Категория обновлена", "success");
    } else {
      await api("/api/admin/categories", {
        method: "POST",
        body: JSON.stringify(body)
      });

      showToast("Категория добавлена", "success");
    }

    closeModal("categoryModal");

    resetCategoryForm();

    await loadCategories();

    haptic("medium");
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Ошибка сохранения категории",
      "error"
    );
  } finally {
    setLoader(false);
  }
}

async function deleteCategory(id) {
  if (!confirm("Удалить эту категорию?")) {
    return;
  }

  try {
    setLoader(true);

    await api(
      `/api/admin/categories/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    showToast("Категория удалена", "success");

    await loadCategories();

    haptic("medium");
  } catch (error) {
    console.error(error);

    showToast(
      error.message || "Не удалось удалить категорию",
      "error"
    );
  } finally {
    setLoader(false);
  }
}

/* =========================
   ORDERS
========================= */

async function loadOrders() {
  const container =
    document.getElementById("ordersList");

  if (!container) return;

  try {
    container.innerHTML = `
      <div class="orders-loading">
        Загрузка заказов…
      </div>
    `;

    const data = await api("/api/admin/orders");

    orders = unwrap(data, "orders");

    renderOrders();
  } catch (error) {
    console.error(error);

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">
          Не удалось загрузить заказы
        </div>

        <div class="empty-state-text">
          ${escapeHtml(error.message || "Ошибка")}
        </div>
      </div>
    `;
  }
}

function renderOrders() {
  const container =
    document.getElementById("ordersList");

  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">
          Заказов пока нет
        </div>

        <div class="empty-state-text">
          Новые заказы появятся здесь
        </div>
      </div>
    `;

    return;
  }

  const sorted = [...orders].sort((a, b) => {
    return (
      new Date(b.created_at || b.createdAt || 0) -
      new Date(a.created_at || a.createdAt || 0)
    );
  });

  container.innerHTML = sorted.map(order => {
    const status = getStatus(order.status);

    const orderId =
      order.display_id ||
      order.order_number ||
      order.id;

    const customer =
      order.customer_username
        ? `@${String(order.customer_username).replace(/^@/, "")}`
        : order.customer_name ||
          order.telegram_id ||
          "Клиент";

    return `
      <div
        class="order-card"
        data-order-id="${escapeHtml(order.id)}"
      >
        <div class="order-card-top">
          <div>
            <div class="order-number">
              #${escapeHtml(orderId)}
            </div>

            <div class="order-date">
              ${formatDate(
                order.created_at ||
                order.createdAt
              )}
            </div>
          </div>

          <div class="order-status ${status.className}">
            ${escapeHtml(status.title)}
          </div>
        </div>

        <div class="order-card-product">
          <div class="order-product-name">
            ${escapeHtml(
              order.product_name ||
              order.product?.name ||
              "Товар"
            )}
          </div>

          ${
            order.variant_text
              ? `<div class="order-product-variant">
                  ${escapeHtml(order.variant_text)}
                </div>`
              : ""
          }
        </div>

        <div class="order-card-bottom">
          <div class="order-customer">
            ${escapeHtml(customer)}
          </div>

          <div class="order-price">
            ${formatPrice(order.price)}
          </div>
        </div>

        <button
          class="order-open-button"
          type="button"
          data-open-order="${escapeHtml(order.id)}"
        >
          Открыть заказ
        </button>
      </div>
    `;
  }).join("");

  container
    .querySelectorAll("[data-open-order]")
    .forEach(button => {
      button.addEventListener("click", () => {
        openOrderDetails(button.dataset.openOrder);
      });
    });
}

function findOrder(id) {
  return orders.find(
    order => String(order.id) === String(id)
  );
}

function openOrderDetails(id) {
  const order = findOrder(id);

  if (!order) {
    showToast("Заказ не найден", "error");
    return;
  }

  selectedOrder = order;

  const modal =
    document.getElementById("orderModal");

  if (!modal) {
    createOrderModal();
  }

  renderOrderModal();

  openModal("orderModal");

  haptic("light");
}

function createOrderModal() {
  const existing =
    document.getElementById("orderModal");

  if (existing) return;

  const modal = document.createElement("div");

  modal.id = "orderModal";
  modal.className = "modal";

  modal.innerHTML = `
    <div class="modal-card order-modal-card">
      <div class="modal-header">
        <div
          class="modal-title"
          id="orderModalTitle"
        >
          Заказ
        </div>

        <button
          class="modal-close"
          id="closeOrderModal"
          type="button"
        >
          ×
        </button>
      </div>

      <div id="orderModalContent"></div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", event => {
    if (event.target === modal) {
      closeModal("orderModal");
    }
  });

  document
    .getElementById("closeOrderModal")
    ?.addEventListener("click", () => {
      closeModal("orderModal");
    });
}

function renderOrderModal() {
  if (!selectedOrder) return;

  const order = selectedOrder;

  const status = getStatus(order.status);

  const orderNumber =
    order.display_id ||
    order.order_number ||
    order.id;

  const customerUsername =
    order.customer_username
      ? `@${String(order.customer_username).replace(/^@/, "")}`
      : "Не указан";

  const customerName =
    order.customer_name ||
    "Не указано";

  const telegramId =
    order.telegram_id ||
    "Не указан";

  const productName =
    order.product_name ||
    order.product?.name ||
    "Товар";

  const variant =
    order.variant_text ||
    "Без выбранного варианта";

  const content =
    document.getElementById("orderModalContent");

  if (!content) return;

  const title =
    document.getElementById("orderModalTitle");

  if (title) {
    title.textContent = `Заказ #${orderNumber}`;
  }

  content.innerHTML = `
    <div class="order-detail">

      <div class="order-detail-status ${status.className}">
        ${escapeHtml(status.title)}
      </div>

      <div class="order-detail-section">
        <div class="order-detail-label">
          Товар
        </div>

        <div class="order-detail-value">
          ${escapeHtml(productName)}
        </div>

        <div class="order-detail-muted">
          ${escapeHtml(variant)}
        </div>
      </div>

      <div class="order-detail-section">
        <div class="order-detail-label">
          Стоимость
        </div>

        <div class="order-detail-price">
          ${formatPrice(order.price)}
        </div>
      </div>

      <div class="order-detail-section">
        <div class="order-detail-label">
          Клиент
        </div>

        <div class="order-detail-value">
          ${escapeHtml(customerName)}
        </div>

        <div class="order-detail-muted">
          ${escapeHtml(customerUsername)}
        </div>

        <div class="order-detail-muted">
          Telegram ID: ${escapeHtml(telegramId)}
        </div>
      </div>

      <div class="order-detail-section">
        <div class="order-detail-label">
          Создан
        </div>

        <div class="order-detail-value">
          ${formatDate(
            order.created_at ||
            order.createdAt
          )}
        </div>
      </div>

      <div class="order-detail-section">
        <div class="order-detail-label">
          Изменён
        </div>

        <div class="order-detail-value">
          ${formatDate(
            order.updated_at ||
            order.updatedAt
          )}
        </div>
      </div>

      <div class="order-detail-section">
        <div class="order-detail-label">
          Изменить статус
        </div>

        <select
          class="order-status-select"
          id="orderStatusSelect"
        >
          ${Object.entries(STATUS_CONFIG)
            .map(([value, item]) => `
              <option
                value="${value}"
                ${order.status === value ? "selected" : ""}
              >
                ${item.title}
              </option>
            `)
            .join("")}
        </select>
      </div>

      <button
        class="primary-button order-save-status"
        id="saveOrderStatus"
        type="button"
      >
        Сохранить статус
      </button>

    </div>
  `;

  document
    .getElementById("saveOrderStatus")
    ?.addEventListener("click", updateSelectedOrderStatus);
}

async function updateSelectedOrderStatus() {
  if (!selectedOrder) return;

  const select =
    document.getElementById("orderStatusSelect");

  const status = select?.value;

  if (!status) return;

  try {
    setLoader(true);

    await api(
      `/api/admin/orders/${encodeURIComponent(
        selectedOrder.id
      )}/status`,
      {
        method: "PUT",
        body: JSON.stringify({
          status
        })
      }
    );

    selectedOrder.status = status;

    const localOrder = findOrder(selectedOrder.id);

    if (localOrder) {
      localOrder.status = status;
      localOrder.updated_at =
        new Date().toISOString();
    }

    showToast("Статус заказа обновлён", "success");

    renderOrders();
    renderOrderModal();

    haptic("medium");
  } catch (error) {
    console.error(error);

    showToast(
      error.message ||
      "Не удалось изменить статус",
      "error"
    );
  } finally {
    setLoader(false);
  }
}

/* =========================
   EVENTS
========================= */

function setupEvents() {
  document
    .getElementById("addProductButton")
    ?.addEventListener("click", () => {
      resetProductForm();
      openModal("productModal");
    });

  document
    .getElementById("addCategoryButton")
    ?.addEventListener("click", () => {
      resetCategoryForm();
      openModal("categoryModal");
    });

  document
    .getElementById("addVariantButton")
    ?.addEventListener("click", () => {
      addVariantField();
    });

  document
    .getElementById("productForm")
    ?.addEventListener("submit", saveProduct);

  document
    .getElementById("categoryForm")
    ?.addEventListener("submit", saveCategory);

  document
    .getElementById("backToStore")
    ?.addEventListener("click", () => {
      window.location.href = "/";
    });

  document
    .getElementById("closeProductModal")
    ?.addEventListener("click", () => {
      closeModal("productModal");
    });

  document
    .getElementById("closeCategoryModal")
    ?.addEventListener("click", () => {
      closeModal("categoryModal");
    });

  document
    .getElementById("productImageFile")
    ?.addEventListener("change", async event => {
      const file = event.target.files?.[0];

      if (!file) return;

      try {
        setLoader(true);

        const url = await uploadProductImage(file);

        const input =
          document.getElementById("productImage");

        if (input) {
          input.value = url;
        }

        showToast("Изображение загружено", "success");
      } catch (error) {
        console.error(error);

        showToast(
          error.message ||
          "Не удалось загрузить изображение",
          "error"
        );
      } finally {
        setLoader(false);
      }
    });
}

/* =========================
   START
========================= */

async function start() {
  initTelegram();

  setupTabs();
  setupEvents();
  setupModalClose();

  const allowed = await checkAdmin();

  if (!allowed) {
    return;
  }

  try {
    setLoader(true);

    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadOrders()
    ]);
  } finally {
    setLoader(false);
  }
}

window.IRoomAdmin = {
  loadProducts,
  loadCategories,
  loadOrders,
  openOrderDetails
};

document.addEventListener("DOMContentLoaded", start);