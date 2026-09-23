const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();
}

const state = {
  products: [],
  categories: [],
  currentProduct: null,
  currentCategory: "",
  search: ""
};

const $ = (selector) => document.querySelector(selector);

function initData() {
  return tg?.initData || "";
}

async function api(url, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
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
    throw new Error("Сервер вернул некорректный ответ");
  }

  if (!response.ok || data.ok === false) {
    throw new Error(data.error || "Ошибка запроса");
  }

  return data;
}

function money(value) {
  return `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = $("#toast");

  if (!toast) return;

  toast.textContent = message;
  toast.hidden = false;

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}

function showLoader(show) {
  const loader = $("#loader");

  if (loader) {
    loader.hidden = !show;
  }
}

function openHome() {
  $("#productPage").hidden = true;
  $("#homePage").hidden = false;

  state.currentProduct = null;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function openProductPage() {
  $("#homePage").hidden = true;
  $("#productPage").hidden = false;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function createProductCard(product) {
  const image = product.image_url || "";

  return `
    <article
      class="product-card"
      data-product-id="${escapeHtml(product.id)}"
    >

      <div class="product-image">

        ${
          image
            ? `<img
                src="${escapeHtml(image)}"
                alt="${escapeHtml(product.name)}"
                loading="lazy"
              >`
            : `<div class="image-placeholder">
                IRoom
              </div>`
        }

        ${
          Number(product.is_new)
            ? `<span class="new-badge">Новинка</span>`
            : ""
        }

      </div>

      <div class="product-info">

        ${
          product.category_name
            ? `<div class="product-category">
                ${escapeHtml(product.category_name)}
              </div>`
            : ""
        }

        <h3>
          ${escapeHtml(product.name)}
        </h3>

        <div class="product-bottom">

          <strong>
            ${money(product.price)}
          </strong>

          <span class="product-arrow">
            →
          </span>

        </div>

      </div>

    </article>
  `;
}

function renderProducts(products, container = $("#products")) {
  if (!container) return;

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">
          Ничего не найдено
        </div>

        <div class="empty-text">
          Попробуйте изменить запрос
        </div>
      </div>
    `;

    return;
  }

  container.innerHTML = products
    .map(createProductCard)
    .join("");

  container
    .querySelectorAll(".product-card")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const id = card.dataset.productId;

        if (id) {
          loadProduct(id);
        }
      });
    });
}

function renderNewProducts() {
  const container = $("#newProducts");

  if (!container) return;

  const products = state.products
    .filter((product) => Number(product.is_new))
    .slice(0, 10);

  if (!products.length) {
    container.innerHTML = `
      <div class="empty-inline">
        Новинки скоро появятся
      </div>
    `;

    return;
  }

  container.innerHTML = products
    .map(createProductCard)
    .join("");

  container
    .querySelectorAll(".product-card")
    .forEach((card) => {
      card.addEventListener("click", () => {
        loadProduct(card.dataset.productId);
      });
    });
}

function renderCategories() {
  const container = $("#categories");

  if (!container) return;

  container.innerHTML = `
    <button
      class="category-chip active"
      data-category=""
      type="button"
    >
      Все
    </button>

    ${state.categories
      .map(
        (category) => `
          <button
            class="category-chip"
            data-category="${escapeHtml(
              category.slug || category.id
            )}"
            type="button"
          >
            ${escapeHtml(category.name)}
          </button>
        `
      )
      .join("")}
  `;

  container
    .querySelectorAll(".category-chip")
    .forEach((button) => {
      button.addEventListener("click", () => {
        state.currentCategory =
          button.dataset.category || "";

        container
          .querySelectorAll(".category-chip")
          .forEach((item) => {
            item.classList.remove("active");
          });

        button.classList.add("active");

        const category = state.categories.find(
          (item) =>
            (item.slug || item.id) ===
            state.currentCategory
        );

        $("#catalogTitle").textContent =
          category?.name || "Каталог";

        loadProducts();
      });
    });
}

async function loadCategories() {
  const data = await api("/api/categories");

  state.categories = data.categories || [];

  renderCategories();
}

async function loadProducts() {
  try {
    const params = new URLSearchParams();

    if (state.currentCategory) {
      params.set("category", state.currentCategory);
    }

    if (state.search) {
      params.set("search", state.search);
    }

    const query = params.toString();

    const data = await api(
      `/api/products${query ? `?${query}` : ""}`
    );

    state.products = data.products || [];

    renderProducts(state.products);

    if (!state.search && !state.currentCategory) {
      renderNewProducts();
    }
  } catch (error) {
    console.error(error);

    $("#products").innerHTML = `
      <div class="empty-state">
        <div class="empty-title">
          Не удалось загрузить каталог
        </div>

        <div class="empty-text">
          ${escapeHtml(error.message)}
        </div>
      </div>
    `;
  }
}

function variantText(variant) {
  return [
    variant.color,
    variant.memory,
    variant.country,
    variant.sim
  ]
    .filter(Boolean)
    .join(" • ");
}

function uniqueVariants(variants, key) {
  return [
    ...new Map(
      variants
        .filter((variant) => variant[key])
        .map((variant) => [
          String(variant[key]),
          variant[key]
        ])
    ).values()
  ];
}

function renderProduct(product, variants, images) {
  const container = $("#productContent");

  const allImages = [
    product.image_url,
    ...images.map((image) => image.url)
  ].filter(Boolean);

  const colors = uniqueVariants(variants, "color");
  const memories = uniqueVariants(variants, "memory");
  const countries = uniqueVariants(variants, "country");
  const sims = uniqueVariants(variants, "sim");

  let selected = variants[0] || null;

  const image = allImages[0] || "";

  container.innerHTML = `
    <div class="product-detail">

      <div class="product-detail-image">

        ${
          image
            ? `<img
                id="detailImage"
                src="${escapeHtml(image)}"
                alt="${escapeHtml(product.name)}"
              >`
            : `<div class="image-placeholder large">
                IRoom
              </div>`
        }

      </div>

      <div class="product-detail-info">

        <div class="product-category">
          ${escapeHtml(product.category_name || "")}
        </div>

        <h1>
          ${escapeHtml(product.name)}
        </h1>

        ${
          product.description
            ? `<p class="product-description">
                ${escapeHtml(product.description)}
              </p>`
            : ""
        }

        <div
          id="variantSelectors"
          class="variant-selectors"
        >

          ${
            colors.length
              ? selectorHtml(
                  "Цвет",
                  "color",
                  colors,
                  selected?.color
                )
              : ""
          }

          ${
            memories.length
              ? selectorHtml(
                  "Память",
                  "memory",
                  memories,
                  selected?.memory
                )
              : ""
          }

          ${
            countries.length
              ? selectorHtml(
                  "Страна",
                  "country",
                  countries,
                  selected?.country
                )
              : ""
          }

          ${
            sims.length
              ? selectorHtml(
                  "SIM",
                  "sim",
                  sims,
                  selected?.sim
                )
              : ""
          }

        </div>

        <div class="selected-price">
          <span>Цена</span>

          <strong id="selectedPrice">
            ${money(selected?.price || product.price)}
          </strong>
        </div>

        <button
          class="primary-button"
          id="bookingButton"
          type="button"
        >
          Забронировать
        </button>

        <button
          class="secondary-button"
          id="consultButton"
          type="button"
        >
          Проконсультироваться
        </button>

      </div>

    </div>
  `;

  function refreshSelection() {
    const selectedOptions = {};

    container
      .querySelectorAll(".variant-option.active")
      .forEach((button) => {
        selectedOptions[button.dataset.key] =
          button.dataset.value;
      });

    const found = variants.find((variant) => {
      return Object.entries(selectedOptions).every(
        ([key, value]) =>
          !variant[key] ||
          String(variant[key]) === String(value)
      );
    });

    selected = found || selected || variants[0];

    const price =
      selected?.price ||
      product.price ||
      0;

    $("#selectedPrice").textContent = money(price);
  }

  container
    .querySelectorAll(".variant-option")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.key;

        container
          .querySelectorAll(
            `.variant-option[data-key="${CSS.escape(key)}"]`
          )
          .forEach((item) => {
            item.classList.remove("active");
          });

        button.classList.add("active");

        refreshSelection();
      });
    });

  $("#bookingButton").addEventListener("click", () => {
    openBooking(product, selected);
  });

  $("#consultButton").addEventListener("click", () => {
    openConsultation(product, selected);
  });
}

function selectorHtml(
  label,
  key,
  values,
  selectedValue
) {
  return `
    <div class="variant-group">

      <div class="variant-label">
        ${escapeHtml(label)}
      </div>

      <div class="variant-options">

        ${values
          .map(
            (value) => `
              <button
                type="button"
                class="variant-option ${
                  String(value) === String(selectedValue)
                    ? "active"
                    : ""
                }"
                data-key="${escapeHtml(key)}"
                data-value="${escapeHtml(value)}"
              >
                ${escapeHtml(value)}
              </button>
            `
          )
          .join("")}

      </div>

    </div>
  `;
}

async function loadProduct(id) {
  try {
    showLoader(true);

    const data = await api(
      `/api/products/${encodeURIComponent(id)}`
    );

    state.currentProduct = data;

    renderProduct(
      data.product,
      data.variants || [],
      data.images || []
    );

    openProductPage();
  } catch (error) {
    console.error(error);
    showToast(error.message);
  } finally {
    showLoader(false);
  }
}

function openBooking(product, variant) {
  const selectedText = variant
    ? variantText(variant)
    : "";

  const price = variant?.price || product.price || 0;

  const message =
    `Здравствуйте! Хочу забронировать ` +
    `${product.name}` +
    `${selectedText ? ` ${selectedText}` : ""}` +
    ` — ${money(price)}`;

  const url =
    `https://t.me/${CONTACT_USERNAME}` +
    `?text=${encodeURIComponent(message)}`;

  openTelegramLink(url);
}

function openConsultation(product, variant) {
  const selectedText = variant
    ? variantText(variant)
    : "";

  const message =
    `Здравствуйте! Хочу проконсультироваться по ` +
    `${product.name}` +
    `${selectedText ? ` ${selectedText}` : ""}.`;

  const url =
    `https://t.me/${CONTACT_USERNAME}` +
    `?text=${encodeURIComponent(message)}`;

  openTelegramLink(url);
}

function openTelegramLink(url) {
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, "_blank");
  }
}

async function checkAdmin() {
  try {
    const data = await api("/api/admin/me");

    if (data.ok && data.admin) {
      const button = $("#adminButton");

      button.hidden = false;

      button.addEventListener("click", () => {
        if (tg?.openLink) {
          tg.openLink(`${location.origin}/admin.html`);
        } else {
          window.location.href = "/admin.html";
        }
      });
    }
  } catch {
    // Обычный пользователь — ничего не делаем.
  }
}

function setupSearch() {
  const button = $("#searchButton");
  const panel = $("#searchPanel");
  const input = $("#searchInput");
  const close = $("#searchClose");

  button.addEventListener("click", () => {
    panel.hidden = false;

    setTimeout(() => {
      input.focus();
    }, 50);
  });

  close.addEventListener("click", () => {
    input.value = "";
    state.search = "";

    panel.hidden = true;

    loadProducts();
  });

  let timer;

  input.addEventListener("input", () => {
    clearTimeout(timer);

    timer = setTimeout(() => {
      state.search = input.value.trim();

      loadProducts();
    }, 250);
  });
}

function setupNavigation() {
  $("#homeButton").addEventListener("click", openHome);

  $("#backButton").addEventListener("click", openHome);
}

async function init() {
  try {
    showLoader(true);

    setupNavigation();
    setupSearch();

    await Promise.all([
      loadCategories(),
      loadProducts(),
      checkAdmin()
    ]);
  } catch (error) {
    console.error(error);
    showToast(error.message);
  } finally {
    showLoader(false);
  }
}

document.addEventListener("DOMContentLoaded", init);