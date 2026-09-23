const tg = window.Telegram?.WebApp;

if (tg) {
  tg.ready();
  tg.expand();

  tg.setHeaderColor("#08080a");
  tg.setBackgroundColor("#08080a");
}

let products = [];
let newProducts = [];
let categories = [];
let currentProduct = null;
let contactUsername = "";

const $ = (id) => document.getElementById(id);

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

  return number
    .toLocaleString("ru-RU")
    .replace(/\s/g, ".");
}

async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (tg?.initData) {
    headers["x-telegram-init-data"] = tg.initData;
  }

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
    throw new Error(data.error || "Ошибка запроса");
  }

  return data;
}


/* =========================
   TOAST
========================= */

let toastTimer;

function showToast(message) {
  const toast = $("toast");

  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}


/* =========================
   ADMIN
========================= */

async function checkAdminAccess() {
  const adminButton = $("adminButton");

  if (!adminButton) return;

  adminButton.classList.add("hidden");

  if (!tg?.initData) {
    return;
  }

  try {
    const response = await fetch("/api/admin/me", {
      method: "GET",
      headers: {
        "x-telegram-init-data": tg.initData
      }
    });

    if (!response.ok) {
      return;
    }

    const data = await response.json();

    if (data?.admin === true) {
      adminButton.classList.remove("hidden");

      adminButton.onclick = () => {
        window.location.href = "/admin";
      };
    }
  } catch (error) {
    console.error("Admin check error:", error);
  }
}


/* =========================
   SETTINGS
========================= */

async function loadSettings() {
  try {
    const data = await api("/api/settings");

    contactUsername =
      data.contact_username ||
      data.contactUsername ||
      "";

    const storeName =
      data.store_name ||
      data.storeName ||
      "IRoom";

    const logo = $("storeLogo");

    if (logo && storeName) {
      // Логотип оставляем в нужном формате:
      // IR розовый + oom белый
      logo.innerHTML =
        '<span class="logo-pink">IR</span><span class="logo-white">oom</span>';
    }

  } catch (error) {
    console.error("Settings error:", error);
  }
}


/* =========================
   CATEGORIES
========================= */

async function loadCategories() {
  try {
    const data = await api("/api/categories");

    categories = Array.isArray(data)
      ? data
      : data.categories || [];

    renderCategories();

  } catch (error) {
    console.error("Categories error:", error);

    categories = [];

    renderCategories();
  }
}

function renderCategories() {
  const container = $("categories");

  if (!container) return;

  if (!categories.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <button
      type="button"
      class="category-button active"
      data-category=""
    >
      Все
    </button>

    ${categories.map(category => `
      <button
        type="button"
        class="category-button"
        data-category="${escapeHtml(category.slug || category.id)}"
      >
        ${escapeHtml(category.name)}
      </button>
    `).join("")}
  `;

  container
    .querySelectorAll(".category-button")
    .forEach(button => {
      button.addEventListener("click", () => {

        container
          .querySelectorAll(".category-button")
          .forEach(item => {
            item.classList.remove("active");
          });

        button.classList.add("active");

        const category = button.dataset.category;

        if (!category) {
          renderCatalog(products);
          return;
        }

        const filtered = products.filter(product => {
          const productCategory =
            product.category_slug ||
            product.categorySlug ||
            product.category_id ||
            product.categoryId;

          return String(productCategory) === String(category);
        });

        renderCatalog(filtered);
      });
    });
}


/* =========================
   PRODUCTS
========================= */

async function loadProducts() {
  try {
    const data = await api("/api/products");

    products = Array.isArray(data)
      ? data
      : data.products || [];

    renderCatalog(products);

  } catch (error) {
    console.error("Products error:", error);

    products = [];

    renderCatalog([]);
  }
}


/* =========================
   NEW PRODUCTS
========================= */

async function loadNewProducts() {
  try {
    const data = await api("/api/products/new");

    newProducts = Array.isArray(data)
      ? data
      : data.products || [];

    renderNewProducts();

  } catch (error) {
    console.error("New products error:", error);

    newProducts = [];

    renderNewProducts();
  }
}

function renderNewProducts() {
  const container = $("newProducts");

  if (!container) return;

  if (!newProducts.length) {
    container.innerHTML = `
      <div class="empty-state">
        Новинок пока нет
      </div>
    `;

    return;
  }

  container.innerHTML = newProducts
    .map(product => createProductCard(product))
    .join("");

  container
    .querySelectorAll("[data-product-id]")
    .forEach(card => {
      card.addEventListener("click", () => {
        openProduct(Number(card.dataset.productId));
      });
    });
}


/* =========================
   PRODUCT CARD
========================= */

function getProductImage(product) {
  if (product.image_url) {
    return product.image_url;
  }

  if (product.imageUrl) {
    return product.imageUrl;
  }

  if (product.image_id) {
    return `/api/images/${product.image_id}`;
  }

  if (product.imageId) {
    return `/api/images/${product.imageId}`;
  }

  return "";
}

function getProductMeta(product) {
  const parts = [];

  if (product.memory) {
    parts.push(product.memory);
  }

  if (product.color) {
    parts.push(product.color);
  }

  if (product.version) {
    parts.push(product.version);
  }

  return parts.join(" • ");
}

function createProductCard(product) {
  const image = getProductImage(product);
  const meta = getProductMeta(product);

  return `
    <article
      class="product-card"
      data-product-id="${product.id}"
    >

      <div class="product-card-image">

        ${
          image
            ? `
              <img
                src="${escapeHtml(image)}"
                alt="${escapeHtml(product.name)}"
                loading="lazy"
              >
            `
            : ""
        }

      </div>

      <div class="product-card-info">

        <h3 class="product-card-name">
          ${escapeHtml(product.name)}
        </h3>

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
          ${formatPrice(product.price)}
        </div>

      </div>

    </article>
  `;
}


/* =========================
   CATALOG
========================= */

function renderCatalog(list) {
  const container = $("catalog");

  if (!container) return;

  if (!list.length) {
    container.innerHTML = `
      <div class="empty-state">
        Товаров пока нет
      </div>
    `;

    return;
  }

  container.innerHTML = list
    .map(product => createProductCard(product))
    .join("");

  container
    .querySelectorAll("[data-product-id]")
    .forEach(card => {
      card.addEventListener("click", () => {
        openProduct(Number(card.dataset.productId));
      });
    });
}


/* =========================
   PRODUCT PAGE
========================= */

async function openProduct(id) {
  let product = products.find(item => Number(item.id) === Number(id));

  if (!product) {
    product = newProducts.find(
      item => Number(item.id) === Number(id)
    );
  }

  if (!product) {
    try {
      product = await api(`/api/products/${id}`);
    } catch (error) {
      showToast("Не удалось открыть товар");
      return;
    }
  }

  currentProduct = product;

  const image = getProductImage(product);
  const meta = getProductMeta(product);

  const imageElement = $("productImage");

  if (imageElement) {
    imageElement.src = image || "";
    imageElement.alt = product.name || "";
  }

  if ($("productName")) {
    $("productName").textContent = product.name || "";
  }

  if ($("productCategory")) {
    let categoryName = "";

    const category = categories.find(item => {
      return (
        String(item.id) === String(product.category_id) ||
        String(item.id) === String(product.categoryId) ||
        String(item.slug) === String(product.category_slug) ||
        String(item.slug) === String(product.categorySlug)
      );
    });

    if (category) {
      categoryName = category.name;
    }

    $("productCategory").textContent = categoryName;
  }

  if ($("productMeta")) {
    $("productMeta").textContent = meta;
  }

  if ($("productPrice")) {
    $("productPrice").textContent =
      `${formatPrice(product.price)}`;
  }

  $("catalogSection")?.classList.add("hidden");
  $("searchResultsSection")?.classList.add("hidden");
  document.querySelector(".hero")?.classList.add("hidden");

  document
    .querySelectorAll(".section")
    .forEach(section => {
      if (
        section.id !== "productPage" &&
        section.id !== "searchResultsSection"
      ) {
        section.classList.add("hidden");
      }
    });

  $("productPage")?.classList.remove("hidden");

  if (tg?.BackButton) {
    tg.BackButton.show();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================
   CLOSE PRODUCT
========================= */

function closeProduct() {
  $("productPage")?.classList.add("hidden");

  document
    .querySelector(".hero")
    ?.classList.remove("hidden");

  $("catalogSection")?.classList.remove("hidden");

  document
    .querySelectorAll(".section")
    .forEach(section => {
      if (
        section.id !== "productPage" &&
        section.id !== "searchResultsSection"
      ) {
        section.classList.remove("hidden");
      }
    });

  if (tg?.BackButton) {
    tg.BackButton.hide();
  }

  currentProduct = null;

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================
   SEARCH
========================= */

function setupSearch() {
  const input = $("searchInput");

  if (!input) return;

  input.addEventListener("input", () => {

    const query = input.value
      .trim()
      .toLowerCase();

    const searchSection = $("searchResultsSection");
    const searchResults = $("searchResults");
    const catalogSection = $("catalogSection");

    if (!query) {
      searchSection?.classList.add("hidden");
      catalogSection?.classList.remove("hidden");

      renderCatalog(products);

      return;
    }

    const results = products.filter(product => {

      const text = [
        product.name,
        product.memory,
        product.color,
        product.version,
        product.category_name,
        product.category_slug
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(query);
    });

    catalogSection?.classList.add("hidden");
    searchSection?.classList.remove("hidden");

    if (searchResults) {

      if (!results.length) {
        searchResults.innerHTML = `
          <div class="empty-state">
            Ничего не найдено
          </div>
        `;

        return;
      }

      searchResults.innerHTML = results
        .map(product => createProductCard(product))
        .join("");

      searchResults
        .querySelectorAll("[data-product-id]")
        .forEach(card => {
          card.addEventListener("click", () => {
            openProduct(Number(card.dataset.productId));
          });
        });
    }
  });
}


/* =========================
   BOOKING
========================= */

function getProductText(product) {
  const parts = [];

  if (product.name) {
    parts.push(product.name);
  }

  if (product.memory) {
    parts.push(product.memory);
  }

  if (product.color) {
    parts.push(product.color);
  }

  if (product.version) {
    parts.push(product.version);
  }

  return parts.join(" ");
}

function openTelegramMessage(message) {
  if (!contactUsername) {
    showToast("Контакт продавца не настроен");
    return;
  }

  const username = String(contactUsername)
    .replace("@", "")
    .trim();

  if (!username) {
    showToast("Контакт продавца не настроен");
    return;
  }

  const url =
    `https://t.me/${username}?text=${encodeURIComponent(message)}`;

  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.location.href = url;
  }
}

function setupProductActions() {
  const bookButton = $("bookButton");
  const consultButton = $("consultButton");

  if (bookButton) {
    bookButton.addEventListener("click", () => {

      if (!currentProduct) return;

      const productText =
        getProductText(currentProduct);

      const message =
        `Здравствуйте! Хочу забронировать ${productText} - ${formatPrice(currentProduct.price)}`;

      openTelegramMessage(message);
    });
  }

  if (consultButton) {
    consultButton.addEventListener("click", () => {

      if (!currentProduct) return;

      const productText =
        getProductText(currentProduct);

      const message =
        `Здравствуйте! Хочу проконсультироваться по поводу ${productText}.`;

      openTelegramMessage(message);
    });
  }
}


/* =========================
   SWIPE NEW PRODUCTS
========================= */

function setupNewProductsSwipe() {
  const container = $("newProducts");

  if (!container) return;

  container.addEventListener(
    "wheel",
    event => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        container.scrollLeft += event.deltaY;
      }
    },
    { passive: true }
  );
}


/* =========================
   EVENTS
========================= */

function setupEvents() {

  $("backButton")?.addEventListener(
    "click",
    closeProduct
  );

  if (tg?.BackButton) {
    tg.BackButton.onClick(closeProduct);
  }

  setupSearch();
  setupProductActions();
  setupNewProductsSwipe();
}


/* =========================
   INIT
========================= */

async function init() {
  setupEvents();

  await Promise.all([
    loadSettings(),
    loadCategories(),
    loadProducts(),
    loadNewProducts()
  ]);

  await checkAdminAccess();
}

init();