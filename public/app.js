const tg = window.Telegram?.WebApp;

let products = [];
let categories = [];
let settings = {};

let currentProduct = null;
let currentCategory = null;


/* =========================
   TELEGRAM
========================= */

function initTelegram() {
  if (!tg) return;

  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#070709");
    tg.setBackgroundColor("#070709");
  } catch {}
}


/* =========================
   API
========================= */

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-telegram-init-data": tg?.initData || ""
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

function formatPrice(value) {
  return new Intl.NumberFormat("ru-RU").format(
    Number(value || 0)
  );
}

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}


/* =========================
   HOME / PRODUCT
========================= */

function showHome() {
  $("homePage")?.classList.remove("hidden");
  $("productPage")?.classList.add("hidden");

  currentProduct = null;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function showProduct(product) {
  currentProduct = product;

  $("homePage")?.classList.add("hidden");
  $("productPage")?.classList.remove("hidden");

  const image = $("productImage");

  if (image) {
    if (product.image_url) {
      image.src = product.image_url;
      image.style.display = "block";
    } else {
      image.removeAttribute("src");
      image.style.display = "none";
    }
  }

  $("productCategory").textContent =
    getCategoryName(product.category_id);

  $("productName").textContent =
    product.name || "";

  const meta = [
    product.memory,
    product.color,
    product.version
  ].filter(Boolean);

  $("productMeta").textContent =
    meta.join(" · ");

  $("productPrice").textContent =
    `${formatPrice(product.price)} ₽`;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================
   CATEGORIES
========================= */

function getCategoryName(id) {
  const category = categories.find(
    (item) => Number(item.id) === Number(id)
  );

  return category?.name || "";
}

function renderCategories() {
  const container = $("categories");

  if (!container) return;

  const allButton = `
    <button
      class="category-button ${currentCategory === null ? "active" : ""}"
      data-category=""
      type="button"
    >
      Все
    </button>
  `;

  const categoryButtons = categories.map((category) => `
    <button
      class="category-button ${
        Number(currentCategory) === Number(category.id)
          ? "active"
          : ""
      }"
      data-category="${Number(category.id)}"
      type="button"
    >
      ${escapeHtml(category.name)}
    </button>
  `).join("");

  container.innerHTML =
    allButton + categoryButtons;

  container
    .querySelectorAll(".category-button")
    .forEach((button) => {
      button.addEventListener("click", () => {

        const value = button.dataset.category;

        currentCategory =
          value === ""
            ? null
            : Number(value);

        renderCategories();
        renderCatalog();
      });
    });
}


/* =========================
   PRODUCT CARD
========================= */

function productCard(product) {
  const image = product.image_url
    ? `
      <img
        src="${escapeHtml(product.image_url)}"
        alt="${escapeHtml(product.name || "")}"
        loading="lazy"
      >
    `
    : `
      <div class="product-placeholder">
        IR
      </div>
    `;

  const meta = [
    product.memory,
    product.color
  ].filter(Boolean).join(" · ");

  return `
    <article
      class="product-card"
      data-product-id="${Number(product.id)}"
    >

      <div class="product-card-image">
        ${image}
      </div>

      <div class="product-card-body">

        <div class="product-card-category">
          ${escapeHtml(
            getCategoryName(product.category_id)
          )}
        </div>

        <div class="product-card-title">
          ${escapeHtml(product.name || "")}
        </div>

        ${
          meta
            ? `
              <div class="product-card-meta">
                ${escapeHtml(meta)}
              </div>
            `
            : ""
        }

        <div class="product-card-price">
          ${formatPrice(product.price)} ₽
        </div>

      </div>

    </article>
  `;
}


/* =========================
   CATALOG
========================= */

function renderCatalog() {
  const container = $("catalog");

  if (!container) return;

  let list = products.filter(
    (product) =>
      Number(product.active) !== 0
  );

  if (currentCategory !== null) {
    list = list.filter(
      (product) =>
        Number(product.category_id) ===
        Number(currentCategory)
    );
  }

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        Товаров пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    list.map(productCard).join("");

  attachProductClicks(container);
}


/* =========================
   NEW PRODUCTS
========================= */

function renderNewProducts() {
  const container = $("newProducts");

  if (!container) return;

  const list = products
    .filter(
      (product) =>
        Number(product.active) !== 0 &&
        Number(product.is_new) === 1
    )
    .sort(
      (a, b) =>
        Number(a.new_order || 0) -
        Number(b.new_order || 0)
    );

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        Новинок пока нет
      </div>
    `;

    return;
  }

  container.innerHTML =
    list.map(productCard).join("");

  attachProductClicks(container);
}


/* =========================
   PRODUCT CLICK
========================= */

function attachProductClicks(container) {
  container
    .querySelectorAll(".product-card")
    .forEach((card) => {

      card.addEventListener("click", () => {

        const id =
          Number(card.dataset.productId);

        const product =
          products.find(
            (item) =>
              Number(item.id) === id
          );

        if (product) {
          showProduct(product);
        }
      });

    });
}


/* =========================
   SEARCH
========================= */

function openSearch() {
  const box = $("searchBox");
  const input = $("searchInput");

  if (!box || !input) return;

  box.classList.add("open");

  setTimeout(() => {
    input.focus();
  }, 100);
}

function closeSearch() {
  const box = $("searchBox");
  const input = $("searchInput");

  if (!box) return;

  box.classList.remove("open");

  if (input) {
    input.value = "";
  }

  renderSearchResults("");
}

function searchProducts(query) {
  const value =
    query.trim().toLowerCase();

  if (!value) {
    renderSearchResults("");
    return;
  }

  const result =
    products.filter((product) => {

      const text = [
        product.name,
        product.memory,
        product.color,
        product.version,
        getCategoryName(product.category_id)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(value);
    });

  renderSearchResults(value, result);
}

function renderSearchResults(query, result) {
  const section =
    $("searchResultsSection");

  const container =
    $("searchResults");

  if (!section || !container) return;

  if (!query) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");

  if (!result.length) {
    container.innerHTML = `
      <div class="empty-state">
        Ничего не найдено
      </div>
    `;

    return;
  }

  container.innerHTML =
    result.map(productCard).join("");

  attachProductClicks(container);
}


/* =========================
   BOOK / CONSULT
========================= */

function getContactUsername() {
  return String(
    settings.contact_username ||
    ""
  ).replace(/^@/, "");
}

function openTelegramMessage(text) {
  const username =
    getContactUsername();

  if (!username) {
    showToast(
      "Контакт для связи пока не настроен"
    );

    return;
  }

  const url =
    `https://t.me/${username}?text=${encodeURIComponent(text)}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.location.href = url;
  }
}

function bookProduct() {
  if (!currentProduct) return;

  const text =
    `Здравствуйте! Хочу забронировать ${currentProduct.name}`;

  openTelegramMessage(text);
}

function consultProduct() {
  if (!currentProduct) return;

  const text =
    `Здравствуйте! Хочу проконсультироваться по поводу ${currentProduct.name}.`;

  openTelegramMessage(text);
}


/* =========================
   ADMIN
========================= */

async function checkAdminAccess() {
  const button =
    $("adminBottomButton");

  if (!button) return;

  /*
    Если Telegram initData отсутствует,
    не показываем админку.
  */
  if (!tg?.initData) {
    button.classList.add("hidden");
    return;
  }

  try {
    const result =
      await api("/api/admin/me");

    if (result?.admin === true) {
      button.classList.remove("hidden");
    } else {
      button.classList.add("hidden");
    }

  } catch (error) {
    console.error(
      "Admin check:",
      error
    );

    button.classList.add("hidden");
  }
}


/* =========================
   EVENTS
========================= */

function setupEvents() {

  /* Логотип → домой */

  $("storeLogo")?.addEventListener(
    "click",
    showHome
  );


  /* Лупа */

  $("searchButton")?.addEventListener(
    "click",
    () => {

      const box =
        $("searchBox");

      if (
        box?.classList.contains("open")
      ) {
        closeSearch();
      } else {
        openSearch();
      }

    }
  );


  /* Закрыть поиск */

  $("closeSearch")?.addEventListener(
    "click",
    closeSearch
  );


  /* Поиск */

  $("searchInput")?.addEventListener(
    "input",
    (event) => {
      searchProducts(
        event.target.value
      );
    }
  );


  /* Назад */

  $("backButton")?.addEventListener(
    "click",
    showHome
  );


  /* Бронь */

  $("bookButton")?.addEventListener(
    "click",
    bookProduct
  );


  /* Консультация */

  $("consultButton")?.addEventListener(
    "click",
    consultProduct
  );


  /* Админка */

  $("adminBottomButton")?.addEventListener(
    "click",
    () => {
      window.location.href = "/admin";
    }
  );
}


/* =========================
   LOAD
========================= */

async function loadSettings() {
  try {
    const data =
      await api("/api/settings");

    settings = data || {};

  } catch (error) {
    console.error(
      "Settings:",
      error
    );
  }
}

async function loadCategories() {
  const data =
    await api("/api/categories");

  categories =
    Array.isArray(data)
      ? data
      : data.categories || [];
}

async function loadProducts() {
  const data =
    await api("/api/products");

  products =
    Array.isArray(data)
      ? data
      : data.products || [];
}

async function init() {

  initTelegram();

  setupEvents();

  try {

    await Promise.all([
      loadSettings(),
      loadCategories(),
      loadProducts()
    ]);

    renderCategories();
    renderNewProducts();
    renderCatalog();

  } catch (error) {

    console.error(error);

    showToast(
      error.message ||
      "Не удалось загрузить магазин"
    );
  }

  await checkAdminAccess();
}


/* =========================
   START
========================= */

document.addEventListener(
  "DOMContentLoaded",
  init
);