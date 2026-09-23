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
  newProducts: [],
  categories: [],
  selectedCategory: null,
  currentProduct: null
};

const homePage = document.getElementById("homePage");
const productPage = document.getElementById("productPage");

const productsContainer = document.getElementById("products");
const newProductsContainer = document.getElementById("newProducts");
const categoriesContainer = document.getElementById("categories");

const productDetails = document.getElementById("productDetails");

const backButton = document.getElementById("backButton");

const searchButton = document.getElementById("searchButton");
const searchPanel = document.getElementById("searchPanel");
const searchInput = document.getElementById("searchInput");
const closeSearch = document.getElementById("closeSearch");
const searchResults = document.getElementById("searchResults");

const newProductsNext = document.getElementById("newProductsNext");

const toast = document.getElementById("toast");


/* =========================
   HELPERS
========================= */

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {})
    }
  });

  let data = {};

  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      data.error || "Ошибка запроса"
    );
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


function formatPrice(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("ru-RU")
    .format(number)
    .replace(/\s/g, ".");
}


function getImageUrl(url) {
  if (!url) {
    return "";
  }

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  return url;
}


function productMeta(product) {
  const values = [];

  if (product.memory) {
    values.push(
      escapeHtml(product.memory)
    );
  }

  if (product.color) {
    values.push(
      escapeHtml(product.color)
    );
  }

  if (product.version) {
    values.push(
      escapeHtml(product.version)
    );
  }

  return values;
}


function productMetaText(product) {
  return productMeta(product).join(" · ");
}


function showToast(message) {
  toast.textContent = message;

  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}


function haptic() {
  try {
    tg?.HapticFeedback?.impactOccurred("light");
  } catch {}
}


/* =========================
   INITIALIZATION
========================= */

async function init() {
  try {
    await Promise.all([
      loadCategories(),
      loadNewProducts(),
      loadProducts()
    ]);
  } catch (error) {
    console.error(error);

    showToast(
      "Не удалось загрузить магазин"
    );
  }
}


/* =========================
   CATEGORIES
========================= */

async function loadCategories() {
  const data = await api(
    "/api/categories"
  );

  state.categories = data.categories || [];

  renderCategories();
}


function renderCategories() {
  if (!state.categories.length) {
    categoriesContainer.innerHTML = "";

    return;
  }

  categoriesContainer.innerHTML = `
    <button
      class="category active"
      data-category=""
    >
      Все
    </button>

    ${state.categories
      .map(category => `
        <button
          class="category"
          data-category="${escapeHtml(category.slug)}"
        >
          ${escapeHtml(category.name)}
        </button>
      `)
      .join("")}
  `;

  categoriesContainer
    .querySelectorAll(".category")
    .forEach(button => {

      button.addEventListener(
        "click",
        async () => {

          haptic();

          const slug =
            button.dataset.category || null;

          state.selectedCategory = slug;

          categoriesContainer
            .querySelectorAll(".category")
            .forEach(item => {
              item.classList.remove("active");
            });

          button.classList.add("active");

          try {
            await loadProducts(slug);
          } catch (error) {
            console.error(error);

            showToast(
              "Не удалось загрузить товары"
            );
          }
        }
      );
    });
}


/* =========================
   PRODUCTS
========================= */

async function loadProducts(category = null) {
  productsContainer.innerHTML = `
    <div class="loading-card">
      Загрузка...
    </div>
  `;

  const url = category
    ? `/api/products?category=${encodeURIComponent(category)}`
    : "/api/products";

  const data = await api(url);

  state.products = data.products || [];

  renderProducts();
}


function renderProducts() {
  if (!state.products.length) {
    productsContainer.innerHTML = `
      <div class="loading-card">
        Товаров пока нет
      </div>
    `;

    return;
  }

  productsContainer.innerHTML =
    state.products
      .map(productCard)
      .join("");

  bindProductCards(
    productsContainer
  );
}


/* =========================
   NEW PRODUCTS
========================= */

async function loadNewProducts() {
  newProductsContainer.innerHTML = `
    <div class="loading-card">
      Загрузка...
    </div>
  `;

  const data = await api(
    "/api/products/new"
  );

  state.newProducts =
    data.products || [];

  renderNewProducts();
}


function renderNewProducts() {
  if (!state.newProducts.length) {
    newProductsContainer.innerHTML = `
      <div class="loading-card">
        Новинок пока нет
      </div>
    `;

    return;
  }

  newProductsContainer.innerHTML =
    state.newProducts
      .map(productCard)
      .join("");

  bindProductCards(
    newProductsContainer
  );
}


/* =========================
   PRODUCT CARD
========================= */

function productCard(product) {
  const imageUrl =
    getImageUrl(product.image_url);

  const meta =
    productMeta(product);

  return `
    <article
      class="product-card"
      data-product-id="${product.id}"
    >

      <div class="product-image">

        ${
          imageUrl
            ? `
              <img
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(product.name)}"
                loading="lazy"
              >
            `
            : `
              <div
                style="
                  width:100%;
                  height:100%;
                  display:flex;
                  align-items:center;
                  justify-content:center;
                  color:#555;
                  font-size:11px;
                "
              >
                Фото отсутствует
              </div>
            `
        }

        ${
          Number(product.is_new) === 1
            ? `
              <div class="new-badge">
                Новинка
              </div>
            `
            : ""
        }

      </div>

      <div class="product-info">

        <div class="product-name">
          ${escapeHtml(product.name)}
        </div>

        ${
          meta.length
            ? `
              <div class="product-meta">
                ${meta
                  .map(
                    value =>
                      `<span>${value}</span>`
                  )
                  .join("")}
              </div>
            `
            : ""
        }

        <div class="product-price">
          ${formatPrice(product.price)} ₽
        </div>

      </div>

    </article>
  `;
}


function bindProductCards(container) {
  container
    .querySelectorAll(".product-card")
    .forEach(card => {

      card.addEventListener(
        "click",
        () => {
          haptic();

          const id =
            card.dataset.productId;

          openProduct(id);
        }
      );
    });
}


/* =========================
   PRODUCT PAGE
========================= */

async function openProduct(id) {
  try {
    const data = await api(
      `/api/products/${id}`
    );

    state.currentProduct =
      data.product;

    renderProductPage(
      state.currentProduct
    );

    homePage.classList.add("hidden");

    productPage.classList.remove(
      "hidden"
    );

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });

    try {
      tg?.BackButton?.show();

      tg?.BackButton?.onClick(
        closeProduct
      );
    } catch {}

  } catch (error) {
    console.error(error);

    showToast(
      "Не удалось открыть товар"
    );
  }
}


function renderProductPage(product) {
  const imageUrl =
    getImageUrl(product.image_url);

  const meta =
    productMeta(product);

  productDetails.innerHTML = `

    <div class="product-main-image">

      ${
        imageUrl
          ? `
            <img
              src="${escapeHtml(imageUrl)}"
              alt="${escapeHtml(product.name)}"
            >
          `
          : `
            <div
              style="
                width:100%;
                height:100%;
                display:flex;
                align-items:center;
                justify-content:center;
                color:#555;
                font-size:12px;
              "
            >
              Фото отсутствует
            </div>
          `
      }

    </div>


    <h1 class="product-page-title">
      ${escapeHtml(product.name)}
    </h1>


    ${
      meta.length
        ? `
          <div class="product-page-meta">
            ${meta
              .map(
                value =>
                  `<span>${value}</span>`
              )
              .join("")}
          </div>
        `
        : ""
    }


    <div class="product-page-price">
      ${formatPrice(product.price)} ₽
    </div>


    <div class="product-actions">

      <button
        class="primary-button"
        id="reserveButton"
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

  `;


  document
    .getElementById("reserveButton")
    ?.addEventListener(
      "click",
      () => {

        haptic();

        openTelegramChat(
          product,
          "reserve"
        );
      }
    );


  document
    .getElementById("consultButton")
    ?.addEventListener(
      "click",
      () => {

        haptic();

        openTelegramChat(
          product,
          "consult"
        );
      }
    );
}


function closeProduct() {
  productPage.classList.add(
    "hidden"
  );

  homePage.classList.remove(
    "hidden"
  );

  state.currentProduct = null;

  try {
    tg?.BackButton?.hide();
  } catch {}

  window.scrollTo({
    top: 0,
    behavior: "instant"
  });
}


backButton.addEventListener(
  "click",
  () => {
    haptic();

    closeProduct();
  }
);


/* =========================
   TELEGRAM CONTACT
========================= */

async function getContactUsername() {
  try {
    const data = await api(
      "/api/settings"
    );

    return (
      data.settings?.contact_username ||
      ""
    );
  } catch (error) {
    console.error(error);

    return "";
  }
}


function createProductText(product) {
  const parts = [];

  if (product.name) {
    parts.push(
      product.name
    );
  }

  if (product.memory) {
    parts.push(
      product.memory
    );
  }

  if (product.color) {
    parts.push(
      product.color
    );
  }

  if (product.version) {
    parts.push(
      product.version
    );
  }

  return parts.join(" ");
}


async function openTelegramChat(
  product,
  type
) {
  const username =
    await getContactUsername();

  if (!username) {
    showToast(
      "Telegram для связи пока не настроен"
    );

    return;
  }

  const cleanUsername =
    username
      .replace(/^@/, "")
      .trim();

  if (!cleanUsername) {
    showToast(
      "Telegram для связи пока не настроен"
    );

    return;
  }

  const productText =
    createProductText(product);

  let message = "";

  if (type === "reserve") {

    message =
      `Здравствуйте! Хочу забронировать ${productText} - ${formatPrice(product.price)}`;

  } else {

    message =
      `Здравствуйте! Хочу проконсультироваться по поводу ${productText}.`;

  }

  const url =
    `https://t.me/${encodeURIComponent(cleanUsername)}?text=${encodeURIComponent(message)}`;

  try {
    tg?.openTelegramLink?.(url);
  } catch {
    window.location.href = url;
  }
}


/* =========================
   SEARCH
========================= */

searchButton.addEventListener(
  "click",
  () => {

    haptic();

    searchPanel.classList.remove(
      "hidden"
    );

    searchInput.focus();
  }
);


closeSearch.addEventListener(
  "click",
  () => {

    searchPanel.classList.add(
      "hidden"
    );

    searchInput.value = "";

    searchResults.innerHTML = "";
  }
);


searchInput.addEventListener(
  "input",
  () => {

    const query =
      searchInput.value
        .trim()
        .toLowerCase();

    if (!query) {
      searchResults.innerHTML = "";

      return;
    }

    const allProducts =
      state.products.length
        ? state.products
        : state.newProducts;

    const combined = [
      ...state.products,
      ...state.newProducts
    ];

    const unique = [];

    const ids = new Set();

    for (const product of combined) {

      if (ids.has(product.id)) {
        continue;
      }

      ids.add(product.id);

      unique.push(product);
    }

    const results =
      unique.filter(product => {

        const text = [
          product.name,
          product.memory,
          product.color,
          product.version,
          product.category_name
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(query);
      });


    if (!results.length) {

      searchResults.innerHTML = `
        <div class="search-empty">
          Ничего не найдено
        </div>
      `;

      return;
    }


    searchResults.innerHTML =
      results
        .map(searchResult)
        .join("");


    searchResults
      .querySelectorAll(
        ".search-result"
      )
      .forEach(item => {

        item.addEventListener(
          "click",
          () => {

            haptic();

            searchPanel.classList.add(
              "hidden"
            );

            searchInput.value = "";

            searchResults.innerHTML = "";

            openProduct(
              item.dataset.productId
            );
          }
        );
      });
  }
);


function searchResult(product) {
  const imageUrl =
    getImageUrl(product.image_url);

  const meta =
    productMetaText(product);

  return `
    <div
      class="search-result"
      data-product-id="${product.id}"
    >

      <div class="search-result-image">

        ${
          imageUrl
            ? `
              <img
                src="${escapeHtml(imageUrl)}"
                alt="${escapeHtml(product.name)}"
              >
            `
            : ""
        }

      </div>

      <div class="search-result-info">

        <div class="search-result-name">
          ${escapeHtml(product.name)}
        </div>

        ${
          meta
            ? `
              <div class="search-result-meta">
                ${meta}
              </div>
            `
            : ""
        }

        <div class="search-result-price">
          ${formatPrice(product.price)} ₽
        </div>

      </div>

    </div>
  `;
}


/* =========================
   NEW PRODUCTS ARROW
========================= */

newProductsNext.addEventListener(
  "click",
  () => {

    haptic();

    newProductsContainer.scrollBy({
      left: 270,
      behavior: "smooth"
    });
  }
);


/* =========================
   START
========================= */

init();