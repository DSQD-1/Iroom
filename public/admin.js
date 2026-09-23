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
    editingProductId: null,
    editingCategoryId: null,
    currentImageUrl: ""
  };

  const $ = (id) => document.getElementById(id);

  function initData() {
    return tg?.initData || "";
  }

  async function api(url, options = {}) {
    const headers = {
      ...(options.headers || {})
    };

    if (!(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    headers["x-telegram-init-data"] = initData();

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
      throw new Error(
        data.error ||
        data.message ||
        `Ошибка ${response.status}`
      );
    }

    return data;
  }


  function unwrap(data) {
    if (!data) return [];

    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data.products)) {
      return data.products;
    }

    if (Array.isArray(data.categories)) {
      return data.categories;
    }

    if (Array.isArray(data.orders)) {
      return data.orders;
    }

    if (Array.isArray(data.items)) {
      return data.items;
    }

    if (Array.isArray(data.data)) {
      return data.data;
    }

    return [];
  }


  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function formatPrice(value) {
    const number = Number(value || 0);

    return `${new Intl.NumberFormat("ru-RU").format(number)} ₽`;
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


  function setLoading(value) {
    $("pageLoader")?.classList.toggle("hidden", !value);
  }


  function showAccessMessage(message) {
    const text = $("accessText");

    if (text) {
      text.textContent = message;
    }
  }


  function isAdminId(id) {
    const value = String(id);

    return (
      value === "5082864281" ||
      value === "5975037118"
    );
  }


  async function checkAdmin() {
    try {
      if (!tg) {
        throw new Error(
          "Откройте админ-панель через Telegram."
        );
      }

      if (!initData()) {
        throw new Error(
          "Telegram не передал данные авторизации. Откройте страницу из Mini App."
        );
      }

      const result = await api("/api/admin/me");

      if (!result?.ok || result.admin !== true) {
        throw new Error("Доступ запрещён.");
      }

      if (
        result.telegramUser &&
        !isAdminId(result.telegramUser.id)
      ) {
        throw new Error("Доступ запрещён.");
      }

      return true;

    } catch (error) {
      console.error("Admin check:", error);

      showAccessMessage(
        error.message || "Нет доступа"
      );

      return false;
    }
  }


  async function loadProducts() {
    try {
      const data = await api("/api/admin/products");

      state.products = unwrap(data);

      renderProducts();

    } catch (error) {
      console.error("Products:", error);

      state.products = [];

      renderProductsError(
        "Не удалось загрузить товары"
      );
    }
  }


  async function loadCategories() {
    try {
      const data = await api("/api/admin/categories");

      state.categories = unwrap(data);

      renderCategories();
      fillCategorySelect();

    } catch (error) {
      console.error("Categories:", error);

      state.categories = [];

      renderCategoriesError(
        "Не удалось загрузить категории"
      );
    }
  }


  async function loadOrders() {
    try {
      const data = await api("/api/admin/orders");

      state.orders = unwrap(data);

      renderOrders();

    } catch (error) {
      console.error("Orders:", error);

      state.orders = [];

      renderOrdersError(
        "Не удалось загрузить заказы"
      );
    }
  }


  async function loadAll() {
    setLoading(true);

    await Promise.allSettled([
      loadProducts(),
      loadCategories(),
      loadOrders()
    ]);

    setLoading(false);
  }


  function renderProductsError(message) {
    const container = $("productsList");

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        ${escapeHtml(message)}
      </div>
    `;
  }


  function renderCategoriesError(message) {
    const container = $("categoriesList");

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        ${escapeHtml(message)}
      </div>
    `;
  }


  function renderOrdersError(message) {
    const container = $("ordersList");

    if (!container) return;

    container.innerHTML = `
      <div class="empty-state">
        ${escapeHtml(message)}
      </div>
    `;
  }


  function productImage(product) {
    return (
      product.image_url ||
      product.image ||
      product.cover ||
      product.photo_url ||
      product.photo ||
      ""
    );
  }


  function productPrice(product) {
    return (
      product.price ??
      product.base_price ??
      product.amount ??
      0
    );
  }


  function productCategoryName(product) {
    const categoryId =
      product.category_id ||
      product.categoryId;

    const category = state.categories.find(
      (item) =>
        String(item.id) === String(categoryId)
    );

    return (
      product.category_name ||
      category?.name ||
      "Без категории"
    );
  }


  function renderProducts() {
    const container = $("productsList");

    if (!container) return;

    if (!state.products.length) {
      container.innerHTML = `
        <div class="empty-state">
          Товаров пока нет.<br>
          Добавьте первый товар.
        </div>
      `;

      return;
    }

    container.innerHTML = state.products
      .map((product) => {
        const image = productImage(product);

        return `
          <article class="admin-item">

            <div class="admin-item-image">
              ${
                image
                  ? `
                    <img
                      src="${escapeHtml(image)}"
                      alt=""
                    >
                  `
                  : ""
              }
            </div>

            <div class="admin-item-info">

              <div class="admin-item-title">
                ${escapeHtml(
                  product.name ||
                  product.title ||
                  "Без названия"
                )}
              </div>

              <div class="admin-item-meta">
                ${escapeHtml(
                  productCategoryName(product)
                )}
              </div>

              <div class="admin-item-price">
                ${formatPrice(productPrice(product))}
              </div>

            </div>

            <div class="admin-item-actions">

              <button
                class="small-button"
                data-action="edit-product"
                data-id="${escapeHtml(product.id)}"
              >
                Изменить
              </button>

              <button
                class="small-button delete"
                data-action="delete-product"
                data-id="${escapeHtml(product.id)}"
              >
                Удалить
              </button>

            </div>

          </article>
        `;
      })
      .join("");
  }


  function renderCategories() {
    const container = $("categoriesList");

    if (!container) return;

    if (!state.categories.length) {
      container.innerHTML = `
        <div class="empty-state">
          Категорий пока нет.
        </div>
      `;

      return;
    }

    container.innerHTML = state.categories
      .map((category) => {
        const image =
          category.image_url ||
          category.image ||
          "";

        return `
          <article class="category-item">

            <div class="category-image">
              ${
                image
                  ? `
                    <img
                      src="${escapeHtml(image)}"
                      alt=""
                    >
                  `
                  : ""
              }
            </div>

            <div class="category-info">

              <div class="category-name">
                ${escapeHtml(
                  category.name ||
                  category.title ||
                  "Без названия"
                )}
              </div>

            </div>

            <div class="category-actions">

              <button
                class="small-button"
                data-action="edit-category"
                data-id="${escapeHtml(category.id)}"
              >
                Изменить
              </button>

              <button
                class="small-button delete"
                data-action="delete-category"
                data-id="${escapeHtml(category.id)}"
              >
                Удалить
              </button>

            </div>

          </article>
        `;
      })
      .join("");
  }


  function orderStatus(order) {
    return (
      order.status ||
      order.order_status ||
      "Новая"
    );
  }


  function renderOrders() {
    const container = $("ordersList");

    if (!container) return;

    if (!state.orders.length) {
      container.innerHTML = `
        <div class="empty-state">
          Заказов пока нет.
        </div>
      `;

      return;
    }

    container.innerHTML = state.orders
      .map((order) => {

        const title =
          order.product_name ||
          order.name ||
          order.title ||
          "Заказ";

        const user =
          order.username
            ? `@${String(order.username).replace(/^@/, "")}`
            : order.telegram_id
              ? `ID ${order.telegram_id}`
              : "Пользователь";

        const created =
          order.created_at ||
          order.createdAt ||
          "";

        return `
          <article class="order-card">

            <div class="order-top">

              <div class="order-title">
                ${escapeHtml(title)}
              </div>

              <div class="order-status">
                ${escapeHtml(orderStatus(order))}
              </div>

            </div>

            <div class="order-info">

              <div>
                ${escapeHtml(user)}
              </div>

              ${
                order.phone
                  ? `
                    <div>
                      ${escapeHtml(order.phone)}
                    </div>
                  `
                  : ""
              }

              ${
                order.message
                  ? `
                    <div>
                      ${escapeHtml(order.message)}
                    </div>
                  `
                  : ""
              }

              ${
                order.variant
                  ? `
                    <div>
                      ${escapeHtml(order.variant)}
                    </div>
                  `
                  : ""
              }

            </div>

            ${
              created
                ? `
                  <div class="order-date">
                    ${escapeHtml(created)}
                  </div>
                `
                : ""
            }

          </article>
        `;
      })
      .join("");
  }


  function fillCategorySelect() {
    const select = $("productCategory");

    if (!select) return;

    const current = select.value;

    select.innerHTML = `
      <option value="">
        Без категории
      </option>
    `;

    state.categories.forEach((category) => {
      const option = document.createElement("option");

      option.value = category.id;
      option.textContent =
        category.name ||
        category.title ||
        "Без названия";

      select.appendChild(option);
    });

    if (current) {
      select.value = current;
    }
  }


  function openProductModal(product = null) {
    const modal = $("productModal");

    if (!modal) return;

    state.editingProductId =
      product?.id || null;

    state.currentImageUrl =
      productImage(product || {});

    $("productModalTitle").textContent =
      product
        ? "Изменить товар"
        : "Новый товар";

    $("productId").value =
      product?.id || "";

    $("productName").value =
      product?.name ||
      product?.title ||
      "";

    $("productDescription").value =
      product?.description ||
      "";

    $("productPrice").value =
      productPrice(product || {});

    fillCategorySelect();

    $("productCategory").value =
      product?.category_id ||
      product?.categoryId ||
      "";

    const currentImage =
      $("currentProductImage");

    if (currentImage) {

      if (state.currentImageUrl) {

        currentImage.innerHTML = `
          <img
            src="${escapeHtml(
              state.currentImageUrl
            )}"
            alt=""
          >
        `;

        currentImage.classList.remove(
          "hidden"
        );

      } else {

        currentImage.innerHTML = "";
        currentImage.classList.add(
          "hidden"
        );

      }
    }

    renderVariants(
      product?.variants ||
      product?.product_variants ||
      []
    );

    $("productImage").value = "";

    modal.classList.remove("hidden");
  }


  function closeProductModal() {
    $("productModal")?.classList.add(
      "hidden"
    );

    state.editingProductId = null;
    state.currentImageUrl = "";
  }


  function openCategoryModal(category = null) {
    const modal = $("categoryModal");

    if (!modal) return;

    state.editingCategoryId =
      category?.id || null;

    $("categoryModalTitle").textContent =
      category
        ? "Изменить категорию"
        : "Новая категория";

    $("categoryId").value =
      category?.id || "";

    $("categoryName").value =
      category?.name ||
      category?.title ||
      "";

    $("categoryImage").value = "";

    modal.classList.remove("hidden");
  }


  function closeCategoryModal() {
    $("categoryModal")?.classList.add(
      "hidden"
    );

    state.editingCategoryId = null;
  }


  function renderVariants(variants = []) {
    const container =
      $("variantsContainer");

    if (!container) return;

    container.innerHTML = "";

    if (!Array.isArray(variants)) {
      variants = [];
    }

    variants.forEach((variant) => {
      addVariantRow(variant);
    });
  }


  function addVariantRow(variant = {}) {
    const container =
      $("variantsContainer");

    if (!container) return;

    const row =
      document.createElement("div");

    row.className = "variant-row";

    row.innerHTML = `
      <input
        class="variant-name"
        type="text"
        placeholder="Например: 256GB Orange USA eSIM"
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
        min="0"
        step="1"
        placeholder="100000"
        value="${
          variant.price ??
          ""
        }"
      >

      <button
        type="button"
        class="variant-remove"
        aria-label="Удалить"
      >
        ×
      </button>
    `;

    row
      .querySelector(".variant-remove")
      ?.addEventListener(
        "click",
        () => row.remove()
      );

    container.appendChild(row);
  }


  function collectVariants() {
    return [
      ...document.querySelectorAll(
        "#variantsContainer .variant-row"
      )
    ]
      .map((row) => {

        const name =
          row.querySelector(
            ".variant-name"
          )?.value
            ?.trim() || "";

        const priceRaw =
          row.querySelector(
            ".variant-price"
          )?.value;

        const price =
          priceRaw === ""
            ? null
            : Number(priceRaw);

        return {
          name,
          price
        };
      })
      .filter(
        (variant) =>
          variant.name ||
          Number.isFinite(variant.price)
      );
  }


  async function uploadImage(file) {
    if (!file) {
      return "";
    }

    const formData =
      new FormData();

    formData.append(
      "file",
      file
    );

    const data = await api(
      "/api/admin/upload",
      {
        method: "POST",
        body: formData
      }
    );

    return (
      data.url ||
      data.image_url ||
      data.path ||
      data.file?.url ||
      ""
    );
  }


  async function saveProduct(event) {
    event.preventDefault();

    const name =
      $("productName").value.trim();

    const description =
      $("productDescription").value.trim();

    const price =
      Number($("productPrice").value || 0);

    const categoryId =
      $("productCategory").value || null;

    if (!name) {
      showToast("Введите название товара");
      return;
    }

    if (!Number.isFinite(price) || price < 0) {
      showToast("Введите корректную цену");
      return;
    }

    try {
      setLoading(true);

      let imageUrl =
        state.currentImageUrl || "";

      const file =
        $("productImage").files?.[0];

      if (file) {
        imageUrl = await uploadImage(file);
      }

      const variants =
        collectVariants();

      const payload = {
        name,
        description,
        price,
        category_id: categoryId,
        image_url: imageUrl,
        variants
      };

      const id =
        state.editingProductId;

      if (id) {

        await api(
          `/api/admin/products/${encodeURIComponent(id)}`,
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

      console.error("Save product:", error);

      showToast(
        error.message ||
        "Не удалось сохранить товар"
      );

    } finally {
      setLoading(false);
    }
  }


  async function deleteProduct(id) {
    if (!id) return;

    const confirmed =
      window.confirm(
        "Удалить этот товар?"
      );

    if (!confirmed) return;

    try {

      setLoading(true);

      await api(
        `/api/admin/products/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      showToast("Товар удалён");

      await loadProducts();

    } catch (error) {

      console.error("Delete product:", error);

      showToast(
        error.message ||
        "Не удалось удалить товар"
      );

    } finally {
      setLoading(false);
    }
  }


  async function saveCategory(event) {
    event.preventDefault();

    const name =
      $("categoryName").value.trim();

    if (!name) {
      showToast("Введите название категории");
      return;
    }

    try {

      setLoading(true);

      let imageUrl = "";

      const file =
        $("categoryImage").files?.[0];

      if (file) {
        imageUrl =
          await uploadImage(file);
      }

      const payload = {
        name,
        image_url: imageUrl
      };

      const id =
        state.editingCategoryId;

      if (id) {

        await api(
          `/api/admin/categories/${encodeURIComponent(id)}`,
          {
            method: "PUT",
            body: JSON.stringify(payload)
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

      console.error(
        "Save category:",
        error
      );

      showToast(
        error.message ||
        "Не удалось сохранить категорию"
      );

    } finally {
      setLoading(false);
    }
  }


  async function deleteCategory(id) {
    if (!id) return;

    const confirmed =
      window.confirm(
        "Удалить эту категорию?"
      );

    if (!confirmed) return;

    try {

      setLoading(true);

      await api(
        `/api/admin/categories/${encodeURIComponent(id)}`,
        {
          method: "DELETE"
        }
      );

      showToast(
        "Категория удалена"
      );

      await loadCategories();

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
      setLoading(false);
    }
  }


  function findProduct(id) {
    return state.products.find(
      (item) =>
        String(item.id) === String(id)
    );
  }


  function findCategory(id) {
    return state.categories.find(
      (item) =>
        String(item.id) === String(id)
    );
  }


  function switchTab(tab) {
    document
      .querySelectorAll(".tab")
      .forEach((button) => {
        button.classList.toggle(
          "active",
          button.dataset.tab === tab
        );
      });

    document
      .querySelectorAll(".tab-content")
      .forEach((section) => {
        section.classList.add("hidden");
      });

    const target =
      $(`${tab}Tab`);

    target?.classList.remove(
      "hidden"
    );
  }


  function bindEvents() {

    $("backToStore")
      ?.addEventListener(
        "click",
        () => {
          window.location.href = "/";
        }
      );


    document
      .querySelectorAll(".tab")
      .forEach((button) => {

        button.addEventListener(
          "click",
          () => {
            switchTab(
              button.dataset.tab
            );
          }
        );

      });


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


    $("addVariantButton")
      ?.addEventListener(
        "click",
        () => {
          addVariantRow();
        }
      );


    $("productForm")
      ?.addEventListener(
        "submit",
        saveProduct
      );


    $("categoryForm")
      ?.addEventListener(
        "submit",
        saveCategory
      );


    document
      .querySelectorAll(
        "[data-close-modal]"
      )
      .forEach((element) => {

        element.addEventListener(
          "click",
          () => {

            const modal =
              element.dataset.closeModal;

            if (modal === "product") {
              closeProductModal();
            }

            if (modal === "category") {
              closeCategoryModal();
            }

          }
        );

      });


    $("productsList")
      ?.addEventListener(
        "click",
        (event) => {

          const button =
            event.target.closest(
              "[data-action]"
            );

          if (!button) return;

          const action =
            button.dataset.action;

          const id =
            button.dataset.id;

          if (
            action === "edit-product"
          ) {

            const product =
              findProduct(id);

            if (product) {
              openProductModal(
                product
              );
            }

          }

          if (
            action === "delete-product"
          ) {
            deleteProduct(id);
          }

        }
      );


    $("categoriesList")
      ?.addEventListener(
        "click",
        (event) => {

          const button =
            event.target.closest(
              "[data-action]"
            );

          if (!button) return;

          const action =
            button.dataset.action;

          const id =
            button.dataset.id;

          if (
            action === "edit-category"
          ) {

            const category =
              findCategory(id);

            if (category) {
              openCategoryModal(
                category
              );
            }

          }

          if (
            action === "delete-category"
          ) {
            deleteCategory(id);
          }

        }
      );

  }


  async function start() {

    bindEvents();

    showAccessMessage(
      "Проверяем доступ..."
    );

    /*
     * Иногда Telegram отдаёт initData
     * не мгновенно. Делаем несколько
     * коротких попыток.
     */

    let allowed = false;

    for (let attempt = 0; attempt < 5; attempt++) {

      if (initData()) {
        allowed = await checkAdmin();
        break;
      }

      await new Promise(
        (resolve) =>
          setTimeout(resolve, 300)
      );
    }

    if (!allowed) {

      $("adminScreen")
        ?.classList.add("hidden");

      $("accessScreen")
        ?.classList.remove("hidden");

      return;
    }


    $("accessScreen")
      ?.classList.add("hidden");

    $("adminScreen")
      ?.classList.remove("hidden");


    await loadAll();
  }


  window.IRoomAdmin = {
    reload: loadAll,
    close: () => {
      window.location.href = "/";
    }
  };


  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      start
    );

  } else {

    start();

  }

})();