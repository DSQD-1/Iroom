(() => {
  "use strict";
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor("#070707");
    tg.setBackgroundColor("#070707");
  }
  const state = {
    products: [],
    categories: [],
    orders: [],
    activeTab: "products",
    editingProduct: null,
    editingCategory: null,
    variants: [],
    adminChecked: false
  };
  const root = document.getElementById("adminPage");
  const content = document.getElementById("adminContent");
  if (!root || !content) {
    console.error("IRoom admin: #adminPage or #adminContent not found");
    return;
  }
  function initData() {
    return tg?.initData || "";
  }
  async function api(url, options = {}) {
    const headers = {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      "x-telegram-init-data": initData(),
      ...(options.headers || {})
    };
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
      throw new Error(data.error || data.message || `Ошибка ${response.status}`);
    }
    return data;
  }
  function esc(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function money(value, currency = "RUB") {
    const number = Number(value || 0);
    try {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: 0
      }).format(number);
    } catch {
      return `${number.toLocaleString("ru-RU")} ₽`;
    }
  }
  function date(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return value;
    }
  }
  function toast(message, type = "normal") {
    let el = document.getElementById("adminToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "adminToast";
      el.className = "admin-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.dataset.type = type;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.classList.remove("show");
    }, 2600);
  }
  function loading(show) {
    let el = document.getElementById("adminLoader");
    if (!el) {
      el = document.createElement("div");
      el.id = "adminLoader";
      el.className = "admin-loader";
      el.innerHTML = `
        <div class="admin-loader-spinner"></div>
      `;
      document.body.appendChild(el);
    }
    el.classList.toggle("show", show);
  }
  function haptic() {
    try {
      tg?.HapticFeedback?.impactOccurred("light");
    } catch {}
  }
  function openAdmin() {
    root.hidden = false;
    document.querySelectorAll("main").forEach((el) => {
      if (el !== root) el.hidden = true;
    });
    document.querySelector(".footer")?.setAttribute("hidden", "");
    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
    renderAdmin();
    loadAll();
  }
  function closeAdmin() {
    root.hidden = true;
    document.querySelectorAll("main").forEach((el) => {
      if (el !== root) el.hidden = false;
    });
    document.querySelector(".footer")?.removeAttribute("hidden");
    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
  }
  async function checkAdmin() {
    try {
      const result = await api("/api/admin/me");
      state.adminChecked = true;
      if (!result?.isAdmin) {
        toast("Доступ запрещён", "error");
        closeAdmin();
        return false;
      }
      return true;
    } catch (error) {
      console.error(error);
      toast("Не удалось проверить доступ", "error");
      closeAdmin();
      return false;
    }
  }
  async function loadAll() {
    loading(true);
    try {
      const [products, categories, orders] = await Promise.all([
        api("/api/admin/products"),
        api("/api/admin/categories"),
        api("/api/admin/orders")
      ]);
      state.products = Array.isArray(products)
        ? products
        : products.products || [];
      state.categories = Array.isArray(categories)
        ? categories
        : categories.categories || [];
      state.orders = Array.isArray(orders)
        ? orders
        : orders.orders || [];
      renderAdmin();
    } catch (error) {
      console.error(error);
      toast(error.message || "Ошибка загрузки", "error");
    } finally {
      loading(false);
    }
  }
  function renderAdmin() {
    content.innerHTML = `
      <div class="admin-shell">
        <div class="admin-top">
          <div>
            <div class="admin-kicker">IRoom</div>
            <h1>Админ-панель</h1>
            <p>Управление магазином</p>
          </div>
          <button class="admin-close-btn" id="adminClose">
            ✕
          </button>
        </div>
        <div class="admin-stats">
          <div class="admin-stat">
            <span>Товары</span>
            <strong>${state.products.length}</strong>
          </div>
          <div class="admin-stat">
            <span>Категории</span>
            <strong>${state.categories.length}</strong>
          </div>
          <div class="admin-stat">
            <span>Заказы</span>
            <strong>${state.orders.length}</strong>
          </div>
        </div>
        <div class="admin-tabs">
          ${tab("products", "Товары")}
          ${tab("categories", "Категории")}
          ${tab("orders", "Заказы")}
          ${tab("ai", "AI")}
        </div>
        <div class="admin-body">
          ${
            state.activeTab === "products"
              ? renderProducts()
              : state.activeTab === "categories"
                ? renderCategories()
                : state.activeTab === "orders"
                  ? renderOrders()
                  : renderAI()
          }
        </div>
      </div>
    `;
    bindAdminEvents();
  }
  function tab(id, title) {
    return `
      <button
        class="admin-tab ${state.activeTab === id ? "active" : ""}"
        data-admin-tab="${id}"
      >
        ${title}
      </button>
    `;
  }
  function renderProducts() {
    return `
      <div class="admin-section-head">
        <div>
          <h2>Товары</h2>
          <p>Добавляй и редактируй товары магазина.</p>
        </div>
        <button class="admin-primary-btn" id="addProduct">
          + Добавить
        </button>
      </div>
      <div class="admin-search-box">
        <input
          id="adminProductSearch"
          type="search"
          placeholder="Поиск товара..."
        />
      </div>
      <div class="admin-products" id="adminProductsList">
        ${renderProductCards(state.products)}
      </div>
    `;
  }
  function renderProductCards(products) {
    if (!products.length) {
      return `
        <div class="admin-empty">
          <div class="admin-empty-icon">＋</div>
          <strong>Товаров пока нет</strong>
          <span>Добавь первый товар через кнопку выше.</span>
        </div>
      `;
    }
    return products
      .map((product) => {
        const image =
          product.image_url ||
          product.image ||
          product.cover_url ||
          "";
        const category =
          product.category_name ||
          state.categories.find(
            (item) => String(item.id) === String(product.category_id)
          )?.name ||
          "Без категории";
        return `
          <div class="admin-product-card">
            <div class="admin-product-image">
              ${
                image
                  ? `<img src="${esc(image)}" alt="">`
                  : `<span>IR</span>`
              }
            </div>
            <div class="admin-product-main">
              <div class="admin-product-category">
                ${esc(category)}
              </div>
              <div class="admin-product-name">
                ${esc(product.name || "Без названия")}
              </div>
              <div class="admin-product-meta">
                ${
                  product.is_new
                    ? `<span class="admin-badge pink">Новинка</span>`
                    : ""
                }
                ${
                  product.active === false
                    ? `<span class="admin-badge gray">Скрыт</span>`
                    : `<span class="admin-badge green">Активен</span>`
                }
              </div>
            </div>
            <div class="admin-product-actions">
              <button
                class="admin-icon-btn"
                data-edit-product="${esc(product.id)}"
              >
                ✎
              </button>
              <button
                class="admin-icon-btn danger"
                data-delete-product="${esc(product.id)}"
              >
                🗑
              </button>
            </div>
          </div>
        `;
      })
      .join("");
  }
  function renderCategories() {
    return `
      <div class="admin-section-head">
        <div>
          <h2>Категории</h2>
          <p>Категории отображаются в магазине.</p>
        </div>
        <button class="admin-primary-btn" id="addCategory">
          + Добавить
        </button>
      </div>
      <div class="admin-list">
        ${
          state.categories.length
            ? state.categories
                .map(
                  (category) => `
                    <div class="admin-list-item">
                      <div>
                        <strong>${esc(category.name || "Без названия")}</strong>
                        <span>ID: ${esc(category.id)}</span>
                      </div>
                      <div class="admin-list-actions">
                        <button
                          class="admin-icon-btn"
                          data-edit-category="${esc(category.id)}"
                        >
                          ✎
                        </button>
                        <button
                          class="admin-icon-btn danger"
                          data-delete-category="${esc(category.id)}"
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                  `
                )
                .join("")
            : `
              <div class="admin-empty">
                <strong>Категорий пока нет</strong>
                <span>Создай первую категорию.</span>
              </div>
            `
        }
      </div>
    `;
  }
  function renderOrders() {
    return `
      <div class="admin-section-head">
        <div>
          <h2>Заказы</h2>
          <p>Здесь будут отображаться бронирования.</p>
        </div>
        <button class="admin-secondary-btn" id="refreshOrders">
          Обновить
        </button>
      </div>
      <div class="admin-orders">
        ${
          state.orders.length
            ? state.orders
                .map(
                  (order) => `
                    <div class="admin-order">
                      <div class="admin-order-top">
                        <strong>
                          Заказ #${esc(order.id)}
                        </strong>
                        <span>
                          ${date(order.created_at)}
                        </span>
                      </div>
                      <div class="admin-order-info">
                        ${
                          order.product_name ||
                          order.name ||
                          "Товар"
                        }
                      </div>
                      ${
                        order.price
                          ? `<div class="admin-order-price">
                              ${money(order.price, order.currency || "RUB")}
                             </div>`
                          : ""
                      }
                      ${
                        order.telegram_id
                          ? `<div class="admin-order-user">
                              Telegram ID: ${esc(order.telegram_id)}
                             </div>`
                          : ""
                      }
                    </div>
                  `
                )
                .join("")
            : `
              <div class="admin-empty">
                <strong>Заказов пока нет</strong>
                <span>Новые бронирования появятся здесь.</span>
              </div>
            `
        }
      </div>
    `;
  }
  function renderAI() {
    return `
      <div class="admin-section-head">
        <div>
          <h2>AI-помощник</h2>
          <p>Управляй товарами обычным текстом.</p>
        </div>
      </div>
      <div class="ai-card">
        <div class="ai-messages" id="aiMessages">
          <div class="ai-message bot">
            Привет. Я помогу управлять магазином.
            Напиши, например:
            <br><br>
            «Создай товар iPhone 17 Pro Max 512GB за 100000 рублей»
          </div>
        </div>
        <div class="ai-input-row">
          <textarea
            id="aiInput"
            rows="2"
            placeholder="Напиши команду..."
          ></textarea>
          <button id="aiSend" class="admin-primary-btn">
            Отправить
          </button>
        </div>
      </div>
      <div class="ai-import-card">
        <h3>Импорт прайса</h3>
        <p>
          Можно отправить текст прайса, а AI подготовит товары
          для импорта.
        </p>
        <textarea
          id="priceListInput"
          rows="7"
          placeholder="Вставь прайс-лист сюда..."
        ></textarea>
        <button id="parsePriceList" class="admin-secondary-btn full">
          Распознать прайс
        </button>
        <div id="priceListResult"></div>
      </div>
    `;
  }
  function productForm(product = null) {
    state.editingProduct = product;
    state.variants = Array.isArray(product?.variants)
      ? [...product.variants]
      : [];
    if (!state.variants.length && product) {
      state.variants = [{
        memory: "",
        color: "",
        country: "",
        sim: "",
        price: product.price || "",
        currency: product.currency || "RUB",
        stock: product.stock ?? "",
        active: true
      }];
    }
    const categories = state.categories
      .map(
        (category) => `
          <option
            value="${esc(category.id)}"
            ${
              String(product?.category_id || "") ===
              String(category.id)
                ? "selected"
                : ""
            }
          >
            ${esc(category.name)}
          </option>
        `
      )
      .join("");
    return `
      <div class="admin-modal-backdrop" id="productModal">
        <div class="admin-modal">
          <div class="admin-modal-head">
            <div>
              <span>${product ? "Редактирование" : "Новый товар"}</span>
              <h2>${product ? esc(product.name) : "Добавить товар"}</h2>
            </div>
            <button class="admin-close-btn" data-close-modal>
              ✕
            </button>
          </div>
          <form id="productForm">
            <div class="admin-form-group">
              <label>Название</label>
              <input
                name="name"
                required
                value="${esc(product?.name || "")}"
                placeholder="iPhone 17 Pro Max"
              />
            </div>
            <div class="admin-form-group">
              <label>Категория</label>
              <select name="category_id">
                <option value="">Без категории</option>
                ${categories}
              </select>
            </div>
            <div class="admin-form-group">
              <label>Описание</label>
              <textarea
                name="description"
                rows="4"
                placeholder="Описание товара..."
              >${esc(product?.description || "")}</textarea>
            </div>
            <div class="admin-form-grid">
              <label class="admin-check">
                <input
                  type="checkbox"
                  name="is_new"
                  ${product?.is_new ? "checked" : ""}
                />
                <span>Новинка</span>
              </label>
              <label class="admin-check">
                <input
                  type="checkbox"
                  name="active"
                  ${product?.active !== false ? "checked" : ""}
                />
                <span>Активен</span>
              </label>
            </div>
            <div class="admin-form-group">
              <label>Изображение</label>
              <div class="admin-upload">
                <input
                  type="file"
                  id="productImage"
                  accept="image/*"
                />
                <div id="productImagePreview">
                  ${
                    product?.image_url
                      ? `<img src="${esc(product.image_url)}" alt="">`
                      : "Выбрать изображение"
                  }
                </div>
              </div>
            </div>
            <div class="admin-variants-head">
              <div>
                <label>Варианты</label>
                <small>Память, цвет, страна, SIM и цена</small>
              </div>
              <button
                type="button"
                class="admin-secondary-btn"
                id="addVariant"
              >
                + Вариант
              </button>
            </div>
            <div id="variantsContainer">
              ${renderVariants()}
            </div>
            <button
              type="submit"
              class="admin-primary-btn full save-product-btn"
            >
              Сохранить товар
            </button>
          </form>
        </div>
      </div>
    `;
  }
  function renderVariants() {
    if (!state.variants.length) {
      return `
        <div class="admin-variant-empty">
          Добавь вариант товара.
        </div>
      `;
    }
    return state.variants
      .map(
        (variant, index) => `
          <div class="admin-variant">
            <div class="admin-variant-title">
              <span>Вариант ${index + 1}</span>
              <button
                type="button"
                class="admin-remove-variant"
                data-remove-variant="${index}"
              >
                Удалить
              </button>
            </div>
            <div class="admin-form-grid two">
              ${field(index, "memory", "Память", variant.memory)}
              ${field(index, "color", "Цвет", variant.color)}
              ${field(index, "country", "Страна", variant.country)}
              ${field(index, "sim", "SIM", variant.sim)}
              ${field(
                index,
                "price",
                "Цена",
                variant.price,
                "number"
              )}
              ${field(
                index,
                "stock",
                "Остаток",
                variant.stock,
                "number"
              )}
            </div>
            <label class="admin-check">
              <input
                type="checkbox"
                data-variant-field="active"
                data-index="${index}"
                ${variant.active !== false ? "checked" : ""}
              />
              <span>Вариант активен</span>
            </label>
          </div>
        `
      )
      .join("");
  }
  function field(index, key, label, value, type = "text") {
    return `
      <label class="admin-form-group">
        <span>${label}</span>
        <input
          type="${type}"
          value="${esc(value ?? "")}"
          data-variant-field="${key}"
          data-index="${index}"
        />
      </label>
    `;
  }
  function categoryForm(category = null) {
    state.editingCategory = category;
    return `
      <div class="admin-modal-backdrop" id="categoryModal">
        <div class="admin-modal small">
          <div class="admin-modal-head">
            <div>
              <span>${category ? "Изменение" : "Новая категория"}</span>
              <h2>${category ? esc(category.name) : "Категория"}</h2>
            </div>
            <button class="admin-close-btn" data-close-modal>
              ✕
            </button>
          </div>
          <form id="categoryForm">
            <div class="admin-form-group">
              <label>Название</label>
              <input
                name="name"
                required
                value="${esc(category?.name || "")}"
                placeholder="iPhone"
              />
            </div>
            <button class="admin-primary-btn full">
              Сохранить
            </button>
          </form>
        </div>
      </div>
    `;
  }
  function showModal(html) {
    document.body.insertAdjacentHTML("beforeend", html);
    requestAnimationFrame(() => {
      document
        .querySelector(".admin-modal-backdrop:last-of-type")
        ?.classList.add("show");
    });
    bindModalEvents();
  }
  function closeModal() {
    document
      .querySelectorAll(".admin-modal-backdrop")
      .forEach((el) => el.remove());
    state.editingProduct = null;
    state.editingCategory = null;
    state.variants = [];
  }
  function bindModalEvents() {
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
      button.onclick = closeModal;
    });
    document.querySelectorAll(".admin-modal-backdrop").forEach((backdrop) => {
      backdrop.onclick = (event) => {
        if (event.target === backdrop) {
          closeModal();
        }
      };
    });
    const productFormElement = document.getElementById("productForm");
    if (productFormElement) {
      productFormElement.addEventListener("submit", saveProduct);
    }
    const categoryFormElement =
      document.getElementById("categoryForm");
    if (categoryFormElement) {
      categoryFormElement.addEventListener("submit", saveCategory);
    }
    document
      .getElementById("addVariant")
      ?.addEventListener("click", () => {
        state.variants.push({
          memory: "",
          color: "",
          country: "",
          sim: "",
          price: "",
          currency: "RUB",
          stock: "",
          active: true
        });
        document.getElementById("variantsContainer").innerHTML =
          renderVariants();
        bindVariantEvents();
      });
    bindVariantEvents();
    document
      .getElementById("productImage")
      ?.addEventListener("change", previewImage);
  }
  function bindVariantEvents() {
    document
      .querySelectorAll("[data-variant-field]")
      .forEach((input) => {
        input.oninput = () => {
          const index = Number(input.dataset.index);
          const key = input.dataset.variantField;
          if (!state.variants[index]) return;
          if (input.type === "checkbox") {
            state.variants[index][key] = input.checked;
          } else {
            state.variants[index][key] = input.value;
          }
        };
      });
    document
      .querySelectorAll("[data-remove-variant]")
      .forEach((button) => {
        button.onclick = () => {
          state.variants.splice(
            Number(button.dataset.removeVariant),
            1
          );
          document.getElementById("variantsContainer").innerHTML =
            renderVariants();
          bindVariantEvents();
        };
      });
  }
  function previewImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = document.getElementById("productImagePreview");
    if (!preview) return;
    preview.innerHTML = "";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    preview.appendChild(img);
  }
  async function uploadImage(file) {
    if (!file) return null;
    const form = new FormData();
    form.append("image", file);
    const result = await api("/api/admin/upload", {
      method: "POST",
      body: form
    });
    return result.url || result.image_url || result.path || null;
  }
  async function saveProduct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    loading(true);
    try {
      let imageUrl = state.editingProduct?.image_url || null;
      const imageFile =
        document.getElementById("productImage")?.files?.[0];
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      }
      const payload = {
        name: data.get("name"),
        description: data.get("description") || "",
        category_id: data.get("category_id") || null,
        is_new: data.get("is_new") === "on",
        active: data.get("active") === "on",
        image_url: imageUrl,
        variants: state.variants.map((variant) => ({
          memory: variant.memory || "",
          color: variant.color || "",
          country: variant.country || "",
          sim: variant.sim || "",
          price: Number(variant.price || 0),
          currency: variant.currency || "RUB",
          stock:
            variant.stock === ""
              ? null
              : Number(variant.stock),
          active: variant.active !== false
        }))
      };
      const editing = state.editingProduct;
      await api(
        editing
          ? `/api/admin/products/${encodeURIComponent(editing.id)}`
          : "/api/admin/products",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(payload)
        }
      );
      closeModal();
      toast(editing ? "Товар обновлён" : "Товар создан", "success");
      await loadAll();
    } catch (error) {
      console.error(error);
      toast(error.message || "Не удалось сохранить товар", "error");
    } finally {
      loading(false);
    }
  }
  async function saveCategory(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    loading(true);
    try {
      const editing = state.editingCategory;
      await api(
        editing
          ? `/api/admin/categories/${encodeURIComponent(editing.id)}`
          : "/api/admin/categories",
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify({
            name: data.get("name")
          })
        }
      );
      closeModal();
      toast(
        editing ? "Категория обновлена" : "Категория создана",
        "success"
      );
      await loadAll();
    } catch (error) {
      console.error(error);
      toast(error.message || "Ошибка категории", "error");
    } finally {
      loading(false);
    }
  }
  async function deleteProduct(id) {
    if (!confirm("Удалить этот товар?")) return;
    loading(true);
    try {
      await api(`/api/admin/products/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      toast("Товар удалён", "success");
      await loadAll();
    } catch (error) {
      console.error(error);
      toast(error.message || "Ошибка удаления", "error");
    } finally {
      loading(false);
    }
  }
  async function deleteCategory(id) {
    if (!confirm("Удалить эту категорию?")) return;
    loading(true);
    try {
      await api(`/api/admin/categories/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      toast("Категория удалена", "success");
      await loadAll();
    } catch (error) {
      console.error(error);
      toast(error.message || "Ошибка удаления", "error");
    } finally {
      loading(false);
    }
  }
  async function sendAI() {
    const input = document.getElementById("aiInput");
    const messages = document.getElementById("aiMessages");
    if (!input || !messages) return;
    const message = input.value.trim();
    if (!message) return;
    messages.insertAdjacentHTML(
      "beforeend",
      `
        <div class="ai-message user">
          ${esc(message)}
        </div>
      `
    );
    input.value = "";
    try {
      const result = await api("/api/admin/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message
        })
      });
      const answer =
        result.reply ||
        result.message ||
        result.response ||
        "Готово.";
      messages.insertAdjacentHTML(
        "beforeend",
        `
          <div class="ai-message bot">
            ${esc(answer).replaceAll("\n", "<br>")}
          </div>
        `
      );
    } catch (error) {
      messages.insertAdjacentHTML(
        "beforeend",
        `
          <div class="ai-message bot error">
            ${esc(error.message || "Ошибка AI")}
          </div>
        `
      );
    }
    messages.scrollTop = messages.scrollHeight;
  }
  async function parsePriceList() {
    const input = document.getElementById("priceListInput");
    const resultBox = document.getElementById("priceListResult");
    const text = input?.value.trim();
    if (!text) {
      toast("Вставь прайс-лист", "error");
      return;
    }
    loading(true);
    try {
      const result = await api("/api/admin/ai/parse", {
        method: "POST",
        body: JSON.stringify({
          text
        })
      });
      resultBox.innerHTML = `
        <pre class="ai-result">${esc(
          JSON.stringify(result, null, 2)
        )}</pre>
      `;
      toast("Прайс распознан", "success");
    } catch (error) {
      toast(error.message || "Ошибка распознавания", "error");
    } finally {
      loading(false);
    }
  }
  function bindAdminEvents() {
    document
      .getElementById("adminClose")
      ?.addEventListener("click", closeAdmin);
    document
      .querySelectorAll("[data-admin-tab]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          haptic();
          state.activeTab = button.dataset.adminTab;
          renderAdmin();
        });
      });
    document
      .getElementById("addProduct")
      ?.addEventListener("click", () => {
        haptic();
        showModal(productForm());
      });
    document
      .querySelectorAll("[data-edit-product]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.dataset.editProduct;
          const product = state.products.find(
            (item) => String(item.id) === String(id)
          );
          if (product) {
            showModal(productForm(product));
          }
        });
      });
    document
      .querySelectorAll("[data-delete-product]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          deleteProduct(button.dataset.deleteProduct);
        });
      });
    document
      .getElementById("addCategory")
      ?.addEventListener("click", () => {
        showModal(categoryForm());
      });
    document
      .querySelectorAll("[data-edit-category]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const category = state.categories.find(
            (item) => String(item.id) === String(button.dataset.editCategory)
          );
          if (category) {
            showModal(categoryForm(category));
          }
        });
      });
    document
      .querySelectorAll("[data-delete-category]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          deleteCategory(button.dataset.deleteCategory);
        });
      });
    document
      .getElementById("refreshOrders")
      ?.addEventListener("click", loadAll);
    document
      .getElementById("aiSend")
      ?.addEventListener("click", sendAI);
    document
      .getElementById("aiInput")
      ?.addEventListener("keydown", (event) => {
        if (
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          sendAI();
        }
      });
    document
      .getElementById("parsePriceList")
      ?.addEventListener("click", parsePriceList);
    document
      .getElementById("adminProductSearch")
      ?.addEventListener("input", (event) => {
        const query = event.target.value
          .trim()
          .toLowerCase();
        const filtered = state.products.filter((product) =>
          String(product.name || "")
            .toLowerCase()
            .includes(query)
        );
        const list = document.getElementById("adminProductsList");
        if (list) {
          list.innerHTML = renderProductCards(filtered);
          bindAdminEvents();
        }
      });
  }
  window.IRoomAdmin = {
    open: async () => {
      const allowed = await checkAdmin();
      if (allowed) {
        openAdmin();
      }
    },
    close: closeAdmin
  };
  window.addEventListener("DOMContentLoaded", () => {
    const backButton =
      document.getElementById("adminBackButton");
    backButton?.addEventListener("click", closeAdmin);
  });
})();