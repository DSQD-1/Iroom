(() => {
  "use strict";

  const tg = window.Telegram?.WebApp;

  if (tg) {
    tg.ready();
    tg.expand();
  }

  const state = {
    products: [],
    categories: [],
    orders: [],
    activeTab: "products",
    editingProduct: null,
    editingCategory: null,
    variants: [],
    orderFilter: "all"
  };

  const adminPage = document.getElementById("adminPage");
  const adminContent = document.getElementById("adminContent");
  const adminBackButton = document.getElementById("adminBackButton");

  if (!adminPage || !adminContent) return;

  function initData() {
    return tg?.initData || "";
  }

  async function api(url, options = {}) {
    const headers = {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    };

    const init = {
      ...options,
      headers: {
        "x-telegram-init-data": initData(),
        ...headers
      }
    };

    const response = await fetch(url, init);

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data?.error || `Ошибка ${response.status}`);
    }

    return data;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function money(value, currency = "RUB") {
    const n = Number(value || 0);

    try {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency,
        maximumFractionDigits: 0
      }).format(n);
    } catch {
      return `${n.toLocaleString("ru-RU")} ${currency}`;
    }
  }

  function date(value) {
    if (!value) return "—";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return String(value);

    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
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
    el.className = `admin-toast show ${type}`;

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      el.classList.remove("show");
    }, 2600);
  }

  function haptic(type = "light") {
    try {
      tg?.HapticFeedback?.impactOccurred(type);
    } catch {}
  }

  function showLoader(show) {
    let loader = document.getElementById("adminLoader");

    if (!loader) {
      loader = document.createElement("div");
      loader.id = "adminLoader";
      loader.className = "admin-loader";
      loader.innerHTML = `<div class="admin-spinner"></div>`;
      document.body.appendChild(loader);
    }

    loader.classList.toggle("active", Boolean(show));
  }

  function renderShell() {
    adminContent.innerHTML = `
      <div class="admin-shell">

        <div class="admin-topbar">
          <div>
            <div class="admin-eyebrow">IRoom</div>
            <h1>Админ-панель</h1>
            <p>Управление магазином</p>
          </div>

          <button class="admin-refresh" id="adminRefresh" type="button" aria-label="Обновить">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M20 11a8.1 8.1 0 0 0-15.4-3M4 5v4h4M4 13a8.1 8.1 0 0 0 15.4 3M20 19v-4h-4"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div class="admin-stats" id="adminStats"></div>

        <div class="admin-tabs" id="adminTabs">
          <button class="admin-tab active" data-tab="products">Товары</button>
          <button class="admin-tab" data-tab="categories">Категории</button>
          <button class="admin-tab" data-tab="orders">Заказы</button>
          <button class="admin-tab" data-tab="promos">Промо</button>
          <button class="admin-tab" data-tab="ai">AI</button>
        </div>

        <div id="adminPanel"></div>

      </div>
    `;
  }

  function renderStats() {
    const stats = document.getElementById("adminStats");

    if (!stats) return;

    stats.innerHTML = `
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

      <div class="admin-stat accent">
        <span>Активные</span>
        <strong>${state.products.filter(p => p.active !== false).length}</strong>
      </div>
    `;
  }

  function switchTab(tab) {
    state.activeTab = tab;

    document.querySelectorAll(".admin-tab").forEach(button => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });

    if (tab === "products") renderProducts();
    if (tab === "categories") renderCategories();
    if (tab === "orders") renderOrders();
    if (tab === "promos") renderPromos();
    if (tab === "ai") renderAI();
  }

  function renderProducts() {
    const panel = document.getElementById("adminPanel");

    const products = state.products;

    panel.innerHTML = `
      <div class="admin-panel-head">
        <div>
          <h2>Товары</h2>
          <p>${products.length ? `Всего ${products.length}` : "Каталог пока пуст"}</p>
        </div>

        <button class="admin-primary compact" id="addProduct">
          <span>＋</span>
          Добавить
        </button>
      </div>

      <div class="admin-search-box">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="1.8"/>
          <path d="m16 16 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
        <input id="adminProductSearch" placeholder="Поиск товаров..." />
      </div>

      <div class="admin-product-list" id="adminProductList">
        ${renderProductCards(products)}
      </div>
    `;

    document
      .getElementById("addProduct")
      ?.addEventListener("click", () => openProductModal());

    document
      .getElementById("adminProductSearch")
      ?.addEventListener("input", e => {
        const q = e.target.value.toLowerCase().trim();

        const filtered = state.products.filter(product =>
          [
            product.name,
            product.description,
            categoryName(product.category_id)
          ]
            .join(" ")
            .toLowerCase()
            .includes(q)
        );

        document.getElementById("adminProductList").innerHTML =
          renderProductCards(filtered);
      });

    bindProductCardEvents();
  }

  function renderProductCards(products) {
    if (!products.length) {
      return `
        <div class="admin-empty">
          <div class="admin-empty-icon">⌁</div>
          <strong>Товаров пока нет</strong>
          <span>Добавьте первый товар в каталог.</span>
        </div>
      `;
    }

    return products
      .map(product => {
        const image =
          product.image_url ||
          product.image ||
          product.cover ||
          "";

        const category = categoryName(product.category_id);

        const variants = Array.isArray(product.variants)
          ? product.variants
          : [];

        const price =
          variants.length > 0
            ? Math.min(...variants.map(v => Number(v.price || 0)))
            : Number(product.price || 0);

        return `
          <div class="admin-product-card" data-product-id="${escapeHtml(product.id)}">

            <div class="admin-product-thumb">
              ${
                image
                  ? `<img src="${escapeHtml(image)}" alt="">`
                  : `<span>IR</span>`
              }
            </div>

            <div class="admin-product-main">
              <div class="admin-product-name">
                ${escapeHtml(product.name || "Без названия")}
              </div>

              <div class="admin-product-meta">
                ${escapeHtml(category || "Без категории")}
              </div>

              <div class="admin-product-bottom">
                <strong>${money(price, variants[0]?.currency || "RUB")}</strong>

                <span class="${
                  product.active === false
                    ? "status inactive"
                    : "status active"
                }">
                  ${product.active === false ? "Скрыт" : "Активен"}
                </span>
              </div>
            </div>

            <button
              class="admin-product-edit"
              data-edit-product="${escapeHtml(product.id)}"
              type="button"
            >
              ›
            </button>

          </div>
        `;
      })
      .join("");
  }

  function bindProductCardEvents() {
    document.querySelectorAll("[data-edit-product]").forEach(button => {
      button.addEventListener("click", e => {
        e.stopPropagation();

        const id = button.dataset.editProduct;
        const product = state.products.find(p => String(p.id) === String(id));

        if (product) openProductModal(product);
      });
    });
  }

  function categoryName(id) {
    const category = state.categories.find(
      item => String(item.id) === String(id)
    );

    return category?.name || "";
  }

  function openProductModal(product = null) {
    state.editingProduct = product;
    state.variants = product?.variants
      ? JSON.parse(JSON.stringify(product.variants))
      : [];

    const modal = createModal("productModal");

    modal.innerHTML = `
      <div class="admin-modal-card large">

        <div class="admin-modal-head">
          <div>
            <div class="admin-eyebrow">IRoom</div>
            <h2>${product ? "Редактирование товара" : "Новый товар"}</h2>
          </div>

          <button class="admin-modal-close" data-close-modal>×</button>
        </div>

        <div class="admin-form">

          <label class="admin-field">
            <span>Название</span>
            <input id="productName" value="${escapeHtml(product?.name || "")}" placeholder="Например, iPhone 17 Pro Max">
          </label>

          <label class="admin-field">
            <span>Категория</span>
            <select id="productCategory">
              <option value="">Без категории</option>
              ${state.categories
                .map(
                  category => `
                    <option
                      value="${escapeHtml(category.id)}"
                      ${
                        String(product?.category_id || "") ===
                        String(category.id)
                          ? "selected"
                          : ""
                      }
                    >
                      ${escapeHtml(category.name)}
                    </option>
                  `
                )
                .join("")}
            </select>
          </label>

          <label class="admin-field">
            <span>Описание</span>
            <textarea id="productDescription" rows="4" placeholder="Описание товара">${escapeHtml(
              product?.description || ""
            )}</textarea>
          </label>

          <div class="admin-form-grid">

            <label class="admin-field">
              <span>Изображение</span>

              <div class="admin-upload">
                <input id="productImage" type="file" accept="image/*">
                <div class="admin-upload-content">
                  <strong>Выбрать фото</strong>
                  <small>Из галереи телефона</small>
                </div>
              </div>

              <input
                id="productImageUrl"
                value="${escapeHtml(
                  product?.image_url || product?.image || ""
                )}"
                placeholder="URL изображения"
              >
            </label>

            <div class="admin-image-preview" id="productImagePreview">
              ${
                product?.image_url || product?.image
                  ? `<img src="${escapeHtml(
                      product.image_url || product.image
                    )}" alt="">`
                  : `<span>Нет фото</span>`
              }
            </div>

          </div>

          <label class="admin-switch-row">
            <span>
              <strong>Активный товар</strong>
              <small>Показывать в магазине</small>
            </span>

            <input
              id="productActive"
              type="checkbox"
              ${product?.active === false ? "" : "checked"}
            >

            <i></i>
          </label>

          <div class="admin-section-divider"></div>

          <div class="admin-variants-head">
            <div>
              <h3>Варианты</h3>
              <p>Цена и характеристики товара</p>
            </div>

            <button id="addVariant" class="admin-secondary compact">
              ＋ Вариант
            </button>
          </div>

          <div id="variantsEditor" class="variants-editor">
            ${renderVariantEditors()}
          </div>

          <div class="admin-form-actions">
            ${
              product
                ? `
                  <button class="admin-danger" id="deleteProduct">
                    Удалить товар
                  </button>
                `
                : ""
            }

            <button class="admin-primary" id="saveProduct">
              ${product ? "Сохранить изменения" : "Создать товар"}
            </button>
          </div>

        </div>
      </div>
    `;

    document
      .querySelector("[data-close-modal]")
      ?.addEventListener("click", closeModal);

    document
      .getElementById("addVariant")
      ?.addEventListener("click", () => {
        state.variants.push({
          memory: "",
          color: "",
          country: "",
          sim: "",
          price: 0,
          currency: "RUB",
          stock: 0,
          active: true
        });

        document.getElementById("variantsEditor").innerHTML =
          renderVariantEditors();

        bindVariantEvents();
      });

    document
      .getElementById("saveProduct")
      ?.addEventListener("click", saveProduct);

    document
      .getElementById("deleteProduct")
      ?.addEventListener("click", deleteProduct);

    document
      .getElementById("productImage")
      ?.addEventListener("change", uploadProductImage);

    bindVariantEvents();
  }

  function renderVariantEditors() {
    if (!state.variants.length) {
      return `
        <div class="variants-empty">
          Вариантов нет. Добавьте первый вариант.
        </div>
      `;
    }

    return state.variants
      .map(
        (variant, index) => `
          <div class="variant-editor" data-variant-index="${index}">

            <div class="variant-editor-head">
              <strong>Вариант ${index + 1}</strong>

              <button
                type="button"
                class="variant-remove"
                data-remove-variant="${index}"
              >
                Удалить
              </button>
            </div>

            <div class="variant-grid">

              <label class="admin-field">
                <span>Память</span>
                <input
                  data-variant-field="memory"
                  value="${escapeHtml(variant.memory || "")}"
                  placeholder="256 GB"
                >
              </label>

              <label class="admin-field">
                <span>Цвет</span>
                <input
                  data-variant-field="color"
                  value="${escapeHtml(variant.color || "")}"
                  placeholder="Orange"
                >
              </label>

              <label class="admin-field">
                <span>Страна</span>
                <input
                  data-variant-field="country"
                  value="${escapeHtml(variant.country || "")}"
                  placeholder="USA"
                >
              </label>

              <label class="admin-field">
                <span>SIM</span>
                <input
                  data-variant-field="sim"
                  value="${escapeHtml(variant.sim || "")}"
                  placeholder="eSIM"
                >
              </label>

              <label class="admin-field">
                <span>Цена</span>
                <input
                  data-variant-field="price"
                  type="number"
                  min="0"
                  value="${Number(variant.price || 0)}"
                  placeholder="100000"
                >
              </label>

              <label class="admin-field">
                <span>Валюта</span>
                <select data-variant-field="currency">
                  <option value="RUB" ${
                    variant.currency === "RUB" ? "selected" : ""
                  }>RUB</option>
                  <option value="USD" ${
                    variant.currency === "USD" ? "selected" : ""
                  }>USD</option>
                  <option value="EUR" ${
                    variant.currency === "EUR" ? "selected" : ""
                  }>EUR</option>
                </select>
              </label>

              <label class="admin-field">
                <span>Остаток</span>
                <input
                  data-variant-field="stock"
                  type="number"
                  min="0"
                  value="${Number(variant.stock || 0)}"
                >
              </label>

            </div>

            <label class="admin-switch-row small">
              <span>
                <strong>Вариант активен</strong>
              </span>

              <input
                data-variant-field="active"
                type="checkbox"
                ${variant.active === false ? "" : "checked"}
              >

              <i></i>
            </label>

          </div>
        `
      )
      .join("");
  }

  function bindVariantEvents() {
    document.querySelectorAll(".variant-editor").forEach(editor => {
      const index = Number(editor.dataset.variantIndex);

      editor.querySelectorAll("[data-variant-field]").forEach(input => {
        input.addEventListener("input", () => {
          const field = input.dataset.variantField;

          if (input.type === "checkbox") {
            state.variants[index][field] = input.checked;
          } else if (field === "price" || field === "stock") {
            state.variants[index][field] = Number(input.value || 0);
          } else {
            state.variants[index][field] = input.value;
          }
        });

        input.addEventListener("change", () => {
          const field = input.dataset.variantField;

          if (input.type === "checkbox") {
            state.variants[index][field] = input.checked;
          }
        });
      });
    });

    document.querySelectorAll("[data-remove-variant]").forEach(button => {
      button.addEventListener("click", () => {
        state.variants.splice(Number(button.dataset.removeVariant), 1);

        document.getElementById("variantsEditor").innerHTML =
          renderVariantEditors();

        bindVariantEvents();
      });
    });
  }

  async function uploadProductImage(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    try {
      showLoader(true);

      const form = new FormData();
      form.append("image", file);

      const result = await api("/api/admin/upload", {
        method: "POST",
        body: form
      });

      const url =
        result.url ||
        result.image_url ||
        result.path ||
        result.location ||
        "";

      if (!url) throw new Error("Сервер не вернул URL изображения");

      document.getElementById("productImageUrl").value = url;

      document.getElementById("productImagePreview").innerHTML = `
        <img src="${escapeHtml(url)}" alt="">
      `;

      toast("Изображение загружено", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  async function saveProduct() {
    const name = document.getElementById("productName").value.trim();

    if (!name) {
      toast("Введите название товара", "error");
      return;
    }

    const payload = {
      name,
      category_id:
        document.getElementById("productCategory").value || null,
      description:
        document.getElementById("productDescription").value.trim(),
      image_url:
        document.getElementById("productImageUrl").value.trim() || null,
      active: document.getElementById("productActive").checked,
      variants: state.variants
    };

    try {
      showLoader(true);

      if (state.editingProduct) {
        await api(`/api/admin/products/${state.editingProduct.id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });

        toast("Товар сохранён", "success");
      } else {
        await api("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        toast("Товар создан", "success");
      }

      closeModal();
      await loadAll();
      switchTab("products");
      haptic("medium");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  async function deleteProduct() {
    if (!state.editingProduct) return;

    if (!confirm("Удалить этот товар?")) return;

    try {
      showLoader(true);

      await api(`/api/admin/products/${state.editingProduct.id}`, {
        method: "DELETE"
      });

      closeModal();
      await loadAll();
      switchTab("products");

      toast("Товар удалён", "success");
      haptic("heavy");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  function renderCategories() {
    const panel = document.getElementById("adminPanel");

    panel.innerHTML = `
      <div class="admin-panel-head">
        <div>
          <h2>Категории</h2>
          <p>Разделы магазина</p>
        </div>

        <button class="admin-primary compact" id="addCategory">
          ＋ Добавить
        </button>
      </div>

      <div class="admin-category-list">
        ${
          state.categories.length
            ? state.categories
                .map(
                  category => `
                    <div class="admin-category-card">

                      <div class="category-icon">
                        ${
                          category.image_url
                            ? `<img src="${escapeHtml(
                                category.image_url
                              )}" alt="">`
                            : "IR"
                        }
                      </div>

                      <div class="category-main">
                        <strong>${escapeHtml(category.name)}</strong>
                        <span>
                          ${
                            state.products.filter(
                              p =>
                                String(p.category_id) === String(category.id)
                            ).length
                          } товаров
                        </span>
                      </div>

                      <div class="category-actions">
                        <button
                          data-edit-category="${escapeHtml(category.id)}"
                          type="button"
                        >
                          Изменить
                        </button>

                        <button
                          class="danger"
                          data-delete-category="${escapeHtml(category.id)}"
                          type="button"
                        >
                          Удалить
                        </button>
                      </div>

                    </div>
                  `
                )
                .join("")
            : `
              <div class="admin-empty">
                <div class="admin-empty-icon">⌁</div>
                <strong>Категорий пока нет</strong>
                <span>Создайте первую категорию.</span>
              </div>
            `
        }
      </div>
    `;

    document
      .getElementById("addCategory")
      ?.addEventListener("click", () => openCategoryModal());

    document.querySelectorAll("[data-edit-category]").forEach(button => {
      button.addEventListener("click", () => {
        const category = state.categories.find(
          item => String(item.id) === String(button.dataset.editCategory)
        );

        if (category) openCategoryModal(category);
      });
    });

    document
      .querySelectorAll("[data-delete-category]")
      .forEach(button => {
        button.addEventListener("click", () =>
          deleteCategory(button.dataset.deleteCategory)
        );
      });
  }

  function openCategoryModal(category = null) {
    state.editingCategory = category;

    const modal = createModal("categoryModal");

    modal.innerHTML = `
      <div class="admin-modal-card">

        <div class="admin-modal-head">
          <div>
            <div class="admin-eyebrow">Категория</div>
            <h2>${category ? "Изменить" : "Новая категория"}</h2>
          </div>

          <button class="admin-modal-close" data-close-modal>×</button>
        </div>

        <div class="admin-form">

          <label class="admin-field">
            <span>Название</span>
            <input
              id="categoryName"
              value="${escapeHtml(category?.name || "")}"
              placeholder="Например, iPhone"
            >
          </label>

          <label class="admin-field">
            <span>URL изображения</span>
            <input
              id="categoryImage"
              value="${escapeHtml(category?.image_url || "")}"
              placeholder="https://..."
            >
          </label>

          <label class="admin-switch-row">
            <span>
              <strong>Активна</strong>
              <small>Показывать категорию</small>
            </span>

            <input
              id="categoryActive"
              type="checkbox"
              ${category?.active === false ? "" : "checked"}
            >

            <i></i>
          </label>

          <button class="admin-primary" id="saveCategory">
            ${category ? "Сохранить" : "Создать"}
          </button>

        </div>

      </div>
    `;

    document
      .querySelector("[data-close-modal]")
      ?.addEventListener("click", closeModal);

    document
      .getElementById("saveCategory")
      ?.addEventListener("click", saveCategory);
  }

  async function saveCategory() {
    const name = document.getElementById("categoryName").value.trim();

    if (!name) {
      toast("Введите название", "error");
      return;
    }

    const payload = {
      name,
      image_url: document.getElementById("categoryImage").value.trim() || null,
      active: document.getElementById("categoryActive").checked
    };

    try {
      showLoader(true);

      if (state.editingCategory) {
        await api(
          `/api/admin/categories/${state.editingCategory.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload)
          }
        );

        toast("Категория обновлена", "success");
      } else {
        await api("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify(payload)
        });

        toast("Категория создана", "success");
      }

      closeModal();
      await loadAll();
      switchTab("categories");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  async function deleteCategory(id) {
    if (!confirm("Удалить категорию?")) return;

    try {
      showLoader(true);

      await api(`/api/admin/categories/${id}`, {
        method: "DELETE"
      });

      await loadAll();
      switchTab("categories");

      toast("Категория удалена", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  function renderOrders() {
    const panel = document.getElementById("adminPanel");

    const orders =
      state.orderFilter === "all"
        ? state.orders
        : state.orders.filter(
            order => String(order.status || "").toLowerCase() === state.orderFilter
          );

    panel.innerHTML = `
      <div class="admin-panel-head">
        <div>
          <h2>Заказы</h2>
          <p>Бронирования клиентов</p>
        </div>

        <select id="orderFilter" class="admin-small-select">
          <option value="all">Все</option>
          <option value="new">Новые</option>
          <option value="pending">В обработке</option>
          <option value="done">Завершённые</option>
          <option value="cancelled">Отменённые</option>
        </select>
      </div>

      <div class="admin-orders">
        ${
          orders.length
            ? orders
                .map(
                  order => `
                    <div class="admin-order-card">

                      <div class="order-head">
                        <strong>Заказ #${escapeHtml(order.id)}</strong>
                        <span>${date(order.created_at)}</span>
                      </div>

                      <div class="order-body">
                        <strong>
                          ${escapeHtml(
                            order.product_name ||
                              order.product ||
                              "Товар"
                          )}
                        </strong>

                        <span>
                          ${escapeHtml(order.username || order.user_name || "Клиент")}
                        </span>
                      </div>

                      <div class="order-bottom">
                        <strong>
                          ${
                            order.total
                              ? money(order.total, order.currency || "RUB")
                              : "—"
                          }
                        </strong>

                        <span class="status ${
                          String(order.status || "").toLowerCase() === "done"
                            ? "active"
                            : "pending"
                        }">
                          ${escapeHtml(order.status || "new")}
                        </span>
                      </div>

                    </div>
                  `
                )
                .join("")
            : `
              <div class="admin-empty">
                <div class="admin-empty-icon">⌁</div>
                <strong>Заказов нет</strong>
                <span>Новые бронирования появятся здесь.</span>
              </div>
            `
        }
      </div>
    `;

    document
      .getElementById("orderFilter")
      ?.addEventListener("change", e => {
        state.orderFilter = e.target.value;
        renderOrders();
      });
  }

  function renderPromos() {
    const panel = document.getElementById("adminPanel");

    panel.innerHTML = `
      <div class="admin-panel-head">
        <div>
          <h2>Промо</h2>
          <p>Работа с промокодами через AI</p>
        </div>
      </div>

      <div class="admin-ai-command">
        <div class="admin-ai-icon">AI</div>

        <div>
          <strong>Создать промокод</strong>
          <p>
            Например: «Создай промокод IR10 на скидку 10%,
            100 использований».
          </p>
        </div>
      </div>

      <div class="admin-command-box">
        <textarea
          id="promoCommand"
          rows="5"
          placeholder="Напиши, какой промокод создать..."
        ></textarea>

        <button class="admin-primary" id="promoGenerate">
          Создать через AI
        </button>
      </div>

      <div id="promoResult"></div>
    `;

    document
      .getElementById("promoGenerate")
      ?.addEventListener("click", generatePromo);
  }

  async function generatePromo() {
    const command = document.getElementById("promoCommand").value.trim();

    if (!command) {
      toast("Напишите команду", "error");
      return;
    }

    const result = document.getElementById("promoResult");

    try {
      showLoader(true);

      const data = await api("/api/admin/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: command
        })
      });

      result.innerHTML = `
        <div class="admin-ai-result">
          <strong>Ответ AI</strong>
          <p>${escapeHtml(data.reply || data.message || "Готово")}</p>
        </div>
      `;

      toast("AI обработал запрос", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  function renderAI() {
    const panel = document.getElementById("adminPanel");

    panel.innerHTML = `
      <div class="admin-panel-head">
        <div>
          <h2>AI-помощник</h2>
          <p>Управление магазином обычным текстом</p>
        </div>
      </div>

      <div class="admin-ai-hero">
        <div class="admin-ai-icon big">AI</div>

        <div>
          <strong>IRoom AI</strong>
          <p>
            Можно попросить создать товар, подготовить данные,
            разобрать прайс или помочь с каталогом.
          </p>
        </div>
      </div>

      <div class="admin-command-box">

        <textarea
          id="aiCommand"
          rows="7"
          placeholder="Например:
Добавь iPhone 17 Pro Max 512GB Orange USA eSIM за 100000 рублей"
        ></textarea>

        <button class="admin-primary" id="sendAI">
          Отправить
        </button>

      </div>

      <div id="aiResult"></div>

      <div class="admin-ai-examples">
        <button data-ai-example="Покажи, сколько товаров сейчас в магазине">Статистика</button>
        <button data-ai-example="Подготовь структуру товара iPhone 17 Pro Max">Создать товар</button>
        <button data-ai-example="Как лучше оформить категорию iPhone?">Совет</button>
      </div>
    `;

    document
      .getElementById("sendAI")
      ?.addEventListener("click", sendAI);

    document.querySelectorAll("[data-ai-example]").forEach(button => {
      button.addEventListener("click", () => {
        document.getElementById("aiCommand").value =
          button.dataset.aiExample;
      });
    });
  }

  async function sendAI() {
    const command = document.getElementById("aiCommand").value.trim();

    if (!command) {
      toast("Введите запрос", "error");
      return;
    }

    const result = document.getElementById("aiResult");

    try {
      showLoader(true);

      const data = await api("/api/admin/ai/chat", {
        method: "POST",
        body: JSON.stringify({
          message: command
        })
      });

      result.innerHTML = `
        <div class="admin-ai-result">
          <strong>Ответ</strong>
          <p>${escapeHtml(data.reply || data.message || "Готово")}</p>
        </div>
      `;

      haptic("light");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  function createModal(id) {
    closeModal();

    const modal = document.createElement("div");

    modal.id = id;
    modal.className = "admin-modal";

    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal();
    });

    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      modal.classList.add("show");
    });

    return modal;
  }

  function closeModal() {
    document.querySelectorAll(".admin-modal").forEach(modal => {
      modal.classList.remove("show");

      setTimeout(() => {
        modal.remove();
      }, 180);
    });
  }

  async function loadAll() {
    try {
      showLoader(true);

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

      renderStats();

      if (state.activeTab === "products") renderProducts();
      if (state.activeTab === "categories") renderCategories();
      if (state.activeTab === "orders") renderOrders();
      if (state.activeTab === "promos") renderPromos();
      if (state.activeTab === "ai") renderAI();
    } catch (error) {
      toast(error.message, "error");
    } finally {
      showLoader(false);
    }
  }

  async function checkAdmin() {
    try {
      const result = await api("/api/admin/me");

      if (
        result?.admin === false ||
        result?.isAdmin === false ||
        result?.authorized === false
      ) {
        throw new Error("Доступ запрещён");
      }

      renderShell();
      renderStats();
      await loadAll();

      switchTab("products");
    } catch (error) {
      adminContent.innerHTML = `
        <div class="admin-denied">
          <div class="admin-denied-icon">×</div>
          <h2>Доступ запрещён</h2>
          <p>У этого Telegram-аккаунта нет доступа к админ-панели.</p>
        </div>
      `;
    }
  }

  function openAdmin() {
    adminPage.hidden = false;
    document.body.classList.add("admin-open");

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });

    checkAdmin();
  }

  function closeAdmin() {
    adminPage.hidden = true;
    document.body.classList.remove("admin-open");

    closeModal();

    if (typeof window.showHome === "function") {
      window.showHome();
    }
  }

  adminBackButton?.addEventListener("click", closeAdmin);

  document.addEventListener("click", event => {
    const tab = event.target.closest("[data-tab]");

    if (!tab) return;

    haptic("light");
    switchTab(tab.dataset.tab);
  });

  window.openIRoomAdmin = openAdmin;
  window.closeIRoomAdmin = closeAdmin;

  document.addEventListener("DOMContentLoaded", () => {
   