(() => {
“use strict”;

const tg = window.Telegram?.WebApp;

if (tg) {
try {
tg.ready();
tg.expand();
} catch (error) {
console.warn(“Telegram WebApp init:”, error);
}
}

const state = {
products: [],
categories: [],
selectedCategory: null,
currentProduct: null,
selectedVariants: {}
};

const $ = (id) => document.getElementById(id);

function initData() {
return tg?.initData || “”;
}

function openTelegram(url) {
if (tg?.openTelegramLink) {
try {
tg.openTelegramLink(url);
return;
} catch {}
}

window.location.href = url;

}

async function api(url, options = {}) {
const headers = {
…(options.headers || {})
};

if (!(options.body instanceof FormData)) {
  headers["Content-Type"] = "application/json";
}
const data = initData();
if (data) {
  headers["x-telegram-init-data"] = data;
}
const controller = new AbortController();
const timeout = setTimeout(() => {
  controller.abort();
}, 10000);
try {
  const response = await fetch(url, {
    ...options,
    headers,
    signal: controller.signal
  });
  let result = {};
  try {
    result = await response.json();
  } catch {}
  if (!response.ok) {
    throw new Error(
      result.error ||
      result.message ||
      `Ошибка ${response.status}`
    );
  }
  return result;
} finally {
  clearTimeout(timeout);
}

}

function unwrap(data, key) {
if (!data) return [];

if (Array.isArray(data)) {
  return data;
}
if (Array.isArray(data[key])) {
  return data[key];
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
return String(value ?? “”)
.replace(/&/g, “&”)
.replace(/</g, “<”)
.replace(/>/g, “>”)
.replace(/”/g, “"”)
.replace(/’/g, “'”);
}

function formatPrice(value) {
const number = Number(value || 0);

return `${new Intl.NumberFormat("ru-RU").format(number)} ₽`;

}

function productImage(product) {
return (
product?.image_url ||
product?.image ||
product?.cover ||
product?.photo_url ||
“”
);
}

function productPrice(product) {
return Number(
product?.price ??
product?.base_price ??
product?.amount ??
0
);
}

function showToast(message) {
const toast = $(“toast”);

if (!toast) return;
toast.textContent = message;
toast.classList.add("show");
clearTimeout(showToast.timer);
showToast.timer = setTimeout(() => {
  toast.classList.remove("show");
}, 2500);

}

function showLoader(value) {
const loader = $(“loader”);

if (!loader) return;
loader.classList.toggle("hidden", !value);

}

function showPage(page) {
$(“homePage”)?.classList.add(“hidden”);
$(“productPage”)?.classList.add(“hidden”);

if (page === "home") {
  $("homePage")?.classList.remove("hidden");
}
if (page === "product") {
  $("productPage")?.classList.remove("hidden");
}
window.scrollTo({
  top: 0,
  behavior: "instant"
});

}

function categoryName(category) {
return (
category?.name ||
category?.title ||
“Категория”
);
}

function renderCategories() {
const container = $(“categories”);

if (!container) return;
let html = `
  <button
    class="category-chip ${
      state.selectedCategory === null ? "active" : ""
    }"
    data-category=""
  >
    Все
  </button>
`;
state.categories.forEach((category) => {
  html += `
    <button
      class="category-chip ${
        String(state.selectedCategory) === String(category.id)
          ? "active"
          : ""
      }"
      data-category="${escapeHtml(category.id)}"
    >
      ${escapeHtml(categoryName(category))}
    </button>
  `;
});
container.innerHTML = html;
container
  .querySelectorAll("[data-category]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.dataset.category;
      state.selectedCategory = value ? value : null;
      renderCategories();
      renderCatalog();
    });
  });

}

function filteredProducts() {
if (state.selectedCategory === null) {
return state.products;
}

return state.products.filter(
  (product) =>
    String(
      product.category_id ??
      product.categoryId ??
      ""
    ) === String(state.selectedCategory)
);

}

function renderProductCard(product) {
const image = productImage(product);

return `
  <article
    class="product-card"
    data-product-id="${escapeHtml(product.id)}"
  >
    <div class="product-card-image">
      ${
        image
          ? `
            <img
              src="${escapeHtml(image)}"
              alt="${escapeHtml(
                product.name ||
                product.title ||
                ""
              )}"
              loading="lazy"
            >
          `
          : `
            <div class="product-image-placeholder">
              IRoom
            </div>
          `
      }
    </div>
    <div class="product-card-content">
      <div class="product-card-name">
        ${escapeHtml(
          product.name ||
          product.title ||
          "Товар"
        )}
      </div>
      <div class="product-card-price">
        ${formatPrice(productPrice(product))}
      </div>
    </div>
  </article>
`;

}

function bindProductCards(container) {
container
?.querySelectorAll(”[data-product-id]”)
.forEach((card) => {
card.addEventListener(“click”, () => {
openProduct(card.dataset.productId);
});
});
}

function renderCatalog() {
const container = $(“catalog”);

if (!container) return;
const products = filteredProducts();
if (!products.length) {
  container.innerHTML = `
    <div class="empty-catalog">
      Пока здесь нет товаров.
    </div>
  `;
  return;
}
container.innerHTML = products
  .map(renderProductCard)
  .join("");
bindProductCards(container);

}

function renderNewProducts() {
const container = $(“newProducts”);

if (!container) return;
const products = state.products.slice(0, 10);
if (!products.length) {
  container.innerHTML = `
    <div class="empty-catalog">
      Новинок пока нет.
    </div>
  `;
  return;
}
container.innerHTML = products
  .map(renderProductCard)
  .join("");
bindProductCards(container);

}

function findProduct(id) {
return state.products.find(
(product) =>
String(product.id) === String(id)
);
}

function getVariants(product) {
const variants =
product?.variants ||
product?.product_variants ||
[];

return Array.isArray(variants)
  ? variants
  : [];

}

function variantName(variant) {
return (
variant?.name ||
variant?.title ||
variant?.label ||
“”
);
}

function variantPrice(variant) {
if (
variant?.price === null ||
variant?.price === undefined ||
variant?.price === “”
) {
return null;
}

const price = Number(variant.price);
return Number.isFinite(price)
  ? price
  : null;

}

function buildVariantGroups(product, variants) {
const groups = [];

const fields = [
  {
    key: "memory",
    title: "Память"
  },
  {
    key: "color",
    title: "Цвет"
  },
  {
    key: "country",
    title: "Страна"
  },
  {
    key: "sim",
    title: "SIM"
  }
];
fields.forEach((field) => {
  const values = [
    ...new Set(
      variants
        .map(
          (variant) =>
            variant?.[field.key]
        )
        .filter(Boolean)
    )
  ];
  if (values.length) {
    groups.push({
      ...field,
      values
    });
  }
});
return groups;

}

function selectedVariant() {
const variants = getVariants(
state.currentProduct
);

if (!variants.length) {
  return null;
}
const selectedId =
  state.selectedVariants.variantId;
if (selectedId) {
  const found = variants.find(
    (variant) =>
      String(variant.id) ===
      String(selectedId)
  );
  if (found) return found;
}
return null;

}

function currentProductPrice() {
const product = state.currentProduct;

const base = productPrice(product);
const variant = selectedVariant();
const variantPriceValue =
  variantPrice(variant);
if (variantPriceValue !== null) {
  return variantPriceValue;
}
return base;

}

function renderProductPage() {
const container = $(“productDetails”);
const product = state.currentProduct;

if (!container || !product) {
  return;
}
const image = productImage(product);
const variants = getVariants(product);
let variantsHtml = "";
if (variants.length) {
  variantsHtml = `
    <div class="product-variants">
      <div class="variant-title">
        Вариант
      </div>
      <div class="variant-buttons">
        ${variants
          .map((variant, index) => {
            const id = variant.id ?? index;
            const active =
              String(
                state.selectedVariants.variantId ?? ""
              ) === String(id);
            return `
              <button
                type="button"
                class="variant-button ${
                  active ? "active" : ""
                }"
                data-variant-id="${escapeHtml(id)}"
              >
                ${escapeHtml(
                  variantName(variant) ||
                  `Вариант ${index + 1}`
                )}
              </button>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}
const groups =
  buildVariantGroups(
    product,
    variants
  );
if (groups.length) {
  variantsHtml += groups
    .map((group) => {
      return `
        <div class="product-variants">
          <div class="variant-title">
            ${escapeHtml(group.title)}
          </div>
          <div class="variant-buttons">
            ${group.values
              .map((value) => {
                const active =
                  String(
                    state.selectedVariants[group.key] || ""
                  ) === String(value);
                return `
                  <button
                    type="button"
                    class="variant-button ${
                      active ? "active" : ""
                    }"
                    data-group="${escapeHtml(group.key)}"
                    data-value="${escapeHtml(value)}"
                  >
                    ${escapeHtml(value)}
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    })
    .join("");
}
container.innerHTML = `
  <div class="product-main">
    <div class="product-large-image">
      ${
        image
          ? `
            <img
              src="${escapeHtml(image)}"
              alt="${escapeHtml(
                product.name ||
                product.title ||
                ""
              )}"
            >
          `
          : `
            <div class="product-image-placeholder large">
              IRoom
            </div>
          `
      }
    </div>
    <div class="product-info">
      <div class="product-label">
        IRoom
      </div>
      <h1>
        ${escapeHtml(
          product.name ||
          product.title ||
          "Товар"
        )}
      </h1>
      ${
        product.description
          ? `
            <p class="product-description">
              ${escapeHtml(
                product.description
              )}
            </p>
          `
          : ""
      }
      ${variantsHtml}
      <div class="product-buy-block">
        <div class="product-detail-price">
          ${formatPrice(
            currentProductPrice()
          )}
        </div>
        <button
          id="bookProductButton"
          class="product-primary-button"
          type="button"
        >
          Забронировать
        </button>
        <button
          id="consultProductButton"
          class="product-secondary-button"
          type="button"
        >
          Проконсультироваться
        </button>
      </div>
    </div>
  </div>
`;
container
  .querySelectorAll("[data-variant-id]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVariants.variantId =
        button.dataset.variantId;
      renderProductPage();
    });
  });
container
  .querySelectorAll("[data-group]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedVariants[
        button.dataset.group
      ] = button.dataset.value;
      renderProductPage();
    });
  });
$("bookProductButton")
  ?.addEventListener(
    "click",
    bookProduct
  );
$("consultProductButton")
  ?.addEventListener(
    "click",
    consultProduct
  );

}

async function openProduct(id) {
const product = findProduct(id);

if (!product) {
  return;
}
state.currentProduct = product;
state.selectedVariants = {};
showPage("product");
renderProductPage();
try {
  const data = await api(
    `/api/products/${encodeURIComponent(id)}`
  );
  const loaded =
    data?.product ||
    data?.data ||
    data;
  if (
    loaded &&
    !Array.isArray(loaded) &&
    (loaded.id || loaded.name)
  ) {
    state.currentProduct = loaded;
    renderProductPage();
  }
} catch {
  // Используем уже загруженную карточку.
}

}

function getSelectedVariantText() {
const product = state.currentProduct;

if (!product) return "";
const selected = selectedVariant();
if (selected) {
  const name = variantName(selected);
  if (name) {
    return ` ${name}`;
  }
}
const parts = [];
[
  "memory",
  "color",
  "country",
  "sim"
].forEach((key) => {
  if (state.selectedVariants[key]) {
    parts.push(
      state.selectedVariants[key]
    );
  }
});
if (!parts.length) {
  return "";
}
return ` ${parts.join(" ")}`;

}

function bookingMessage() {
const product = state.currentProduct;

const name =
  product?.name ||
  product?.title ||
  "товар";
return (
  `Здравствуйте! Хочу забронировать ` +
  `${name}${getSelectedVariantText()} — ` +
  `${formatPrice(currentProductPrice())}`
);

}

function consultationMessage() {
const product = state.currentProduct;

const name =
  product?.name ||
  product?.title ||
  "товар";
return (
  `Здравствуйте! Хочу проконсультироваться ` +
  `по товару ${name}`
);

}

function openContact(message) {
const url =
https://t.me/iroom_24?text=${encodeURIComponent( message )};

openTelegram(url);

}

function bookProduct() {
openContact(bookingMessage());
}

function consultProduct() {
openContact(consultationMessage());
}

function openSearch() {
$(“searchPanel”)
?.classList.remove(“hidden”);

$("searchInput")?.focus();

}

function closeSearch() {
$(“searchPanel”)
?.classList.add(“hidden”);

if ($("searchInput")) {
  $("searchInput").value = "";
}
if ($("searchResults")) {
  $("searchResults").innerHTML = "";
}

}

function renderSearchResults(query) {
const container = $(“searchResults”);

if (!container) return;
const text =
  String(query || "")
    .trim()
    .toLowerCase();
if (!text) {
  container.innerHTML = "";
  return;
}
const results =
  state.products.filter((product) => {
    const name =
      String(
        product.name ||
        product.title ||
        ""
      ).toLowerCase();
    const description =
      String(
        product.description ||
        ""
      ).toLowerCase();
    return (
      name.includes(text) ||
      description.includes(text)
    );
  });
if (!results.length) {
  container.innerHTML = `
    <div class="search-empty">
      Ничего не найдено
    </div>
  `;
  return;
}
container.innerHTML = results
  .map(renderProductCard)
  .join("");
container
  .querySelectorAll("[data-product-id]")
  .forEach((card) => {
    card.addEventListener("click", () => {
      closeSearch();
      openProduct(
        card.dataset.productId
      );
    });
  });

}

async function checkAdmin() {
try {
if (!initData()) {
return false;
}

  const data =
    await api("/api/admin/me");
  return (
    data?.ok === true &&
    data?.admin === true
  );
} catch {
  return false;
}

}

async function setupAdminButton() {
const button = $(“adminButton”);

if (!button) return;
button.classList.add("hidden");
const isAdmin =
  await checkAdmin();
if (!isAdmin) {
  return;
}
button.classList.remove("hidden");
button.onclick = () => {
  window.location.href =
    "/admin.html";
};

}

async function loadStore() {
showLoader(true);

try {
  const [
    productsData,
    categoriesData
  ] = await Promise.all([
    api("/api/products"),
    api("/api/categories")
  ]);
  state.products =
    unwrap(
      productsData,
      "products"
    );
  state.categories =
    unwrap(
      categoriesData,
      "categories"
    );
  renderCategories();
  renderNewProducts();
  renderCatalog();
} catch (error) {
  console.error(
    "Store loading error:",
    error
  );
  state.products = [];
  state.categories = [];
  renderCategories();
  renderNewProducts();
  renderCatalog();
  showToast(
    "Каталог пока недоступен"
  );
} finally {
  showLoader(false);
}

}

function bindEvents() {
$(“logoButton”)
?.addEventListener(
“click”,
() => {
closeSearch();

      state.currentProduct = null;
      showPage("home");
    }
  );
$("searchButton")
  ?.addEventListener(
    "click",
    openSearch
  );
$("closeSearchButton")
  ?.addEventListener(
    "click",
    closeSearch
  );
$("searchInput")
  ?.addEventListener(
    "input",
    (event) => {
      renderSearchResults(
        event.target.value
      );
    }
  );
$("productBackButton")
  ?.addEventListener(
    "click",
    () => {
      showPage("home");
    }
  );
$("heroCatalogButton")
  ?.addEventListener(
    "click",
    () => {
      $("catalogSection")
        ?.scrollIntoView({
          behavior: "smooth"
        });
    }
  );

}

async function start() {
bindEvents();
showPage(“home”);

// Главное: загрузка магазина больше
// не зависит от проверки админа.
await loadStore();
// Проверка админа запускается отдельно.
// Даже если она зависнет/упадёт,
// магазин уже открыт.
setupAdminButton().catch(
  (error) => {
    console.warn(
      "Admin check error:",
      error
    );
  }
);

}

function emergencyStopLoader() {
// Если какой-то JS-ошибкой загрузка
// всё-таки не дошла до finally,
// через 12 секунд убираем экран загрузки.
setTimeout(() => {
showLoader(false);
}, 12000);
}

emergencyStopLoader();

if (
document.readyState === “loading”
) {
document.addEventListener(
“DOMContentLoaded”,
start,
{ once: true }
);
} else {
start();
}
})();