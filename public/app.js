const tg = window.Telegram?.WebApp;

let products = [];
let categories = [];
let currentProduct = null;
let currentOrder = null;
let currentUser = null;
let orders = [];

let selectedCategory = null;
let selectedVariant = null;

const STATUS_INFO = {
new: {
text: “Новый”,
className: “status-new”
},
processing: {
text: “В обработке”,
className: “status-processing”
},
awaiting_payment: {
text: “Ожидает оплаты”,
className: “status-payment”
},
reserved: {
text: “Забронирован”,
className: “status-reserved”
},
completed: {
text: “Завершён”,
className: “status-completed”
},
cancelled: {
text: “Отменён”,
className: “status-cancelled”
}
};

/* =========================================================
TELEGRAM
========================================================= */

function initTelegram() {
try {
if (!tg) return;

tg.ready();
tg.expand();
tg.setHeaderColor?.("#050505");
tg.setBackgroundColor?.("#050505");

} catch (error) {
console.error(“Telegram:”, error);
}
}

/* =========================================================
API
========================================================= */

async function api(url, options = {}) {
const controller = new AbortController();

const timeout = setTimeout(() => {
controller.abort();
}, 12000);

try {
const headers = {
…(options.body instanceof FormData
? {}
: {
“Content-Type”: “application/json”
}),
…(options.headers || {})
};

const initData = tg?.initData || "";
if (initData) {
  headers["x-telegram-init-data"] = initData;
}
const response = await fetch(url, {
  ...options,
  headers,
  signal: controller.signal
});
let data = {};
try {
  data = await response.json();
} catch {}
if (!response.ok) {
  throw new Error(
    data?.error ||
    data?.message ||
    `HTTP ${response.status}`
  );
}
return data;

} finally {
clearTimeout(timeout);
}
}

function unwrap(data, key) {
if (!data) return [];

if (Array.isArray(data)) return data;

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

/* =========================================================
HELPERS
========================================================= */

function escapeHtml(value) {
return String(value ?? “”)
.replace(/&/g, “&”)
.replace(/</g, “<”)
.replace(/>/g, “>”)
.replace(/”/g, “"”)
.replace(/’/g, “'”);
}

function formatPrice(value) {
const number = Number(value);

if (!Number.isFinite(number)) {
return “0 ₽”;
}

return ${number.toLocaleString("ru-RU")} ₽;
}

function formatDateTime(value) {
if (!value) return “”;

const date = new Date(value);

if (Number.isNaN(date.getTime())) {
return String(value);
}

return date.toLocaleString(“ru-RU”, {
day: “2-digit”,
month: “2-digit”,
year: “numeric”,
hour: “2-digit”,
minute: “2-digit”
});
}

function getProductImage(product) {
return (
product?.image_url ||
product?.image ||
product?.cover ||
“”
);
}

function getProductPrice(product) {
const value =
product?.price ??
product?.base_price ??
product?.current_price ??
0;

return Number(value) || 0;
}

function getVariantId(variant) {
return (
variant?.id ??
variant?.variant_id ??
“”
);
}

function getVariantName(variant) {
if (!variant) return “”;

const parts = [
variant.color
? Цвет: ${variant.color}
: “”,

variant.memory
  ? `Память: ${variant.memory}`
  : "",
variant.sim_type
  ? `SIM: ${variant.sim_type}`
  : "",
variant.region
  ? `Регион: ${variant.region}`
  : ""

].filter(Boolean);

if (parts.length) {
return parts.join(” • “);
}

return (
variant.name ||
variant.title ||
variant.variant_text ||
“”
);
}

function getVariantPrice(variant, product) {
if (
variant?.price !== undefined &&
variant?.price !== null &&
variant?.price !== “”
) {
return Number(variant.price) || 0;
}

return getProductPrice(product);
}

function showToast(message) {
const toast =
document.getElementById(“toast”);

if (!toast) return;

toast.textContent = message;
toast.classList.add(“show”);

clearTimeout(showToast.timer);

showToast.timer = setTimeout(() => {
toast.classList.remove(“show”);
}, 2600);
}

function haptic(type = “light”) {
try {
tg?.HapticFeedback?.impactOccurred(type);
} catch {}
}

function openTelegram(url) {
try {
if (tg?.openTelegramLink) {
tg.openTelegramLink(url);
return;
}
} catch {}

window.open(url, “_blank”, “noopener”);
}

/* =========================================================
PAGES
========================================================= */

const PAGE_IDS = [
“homePage”,
“catalogPage”,
“profilePage”,
“ordersPage”,
“productPage”,
“orderPage”,
“checkoutPage”
];

function hideAllPages() {
PAGE_IDS.forEach((id) => {
document
.getElementById(id)
?.classList.add(“hidden”);
});
}

function showPage(name) {
hideAllPages();

const map = {
home: “homePage”,
catalog: “catalogPage”,
profile: “profilePage”,
orders: “ordersPage”,
product: “productPage”,
order: “orderPage”,
checkout: “checkoutPage”
};

const page =
document.getElementById(map[name]);

if (!page) return;

page.classList.remove(“hidden”);

window.scrollTo({
top: 0,
behavior: “instant”
});
}

/* =========================================================
DRAWER
========================================================= */

function openDrawer() {
document
.getElementById(“drawerOverlay”)
?.classList.remove(“hidden”);

document
.getElementById(“catalogDrawer”)
?.classList.add(“open”);

haptic();
}

function closeDrawer() {
document
.getElementById(“catalogDrawer”)
?.classList.remove(“open”);

setTimeout(() => {
document
.getElementById(“drawerOverlay”)
?.classList.add(“hidden”);
}, 220);
}

function renderDrawerCategories() {
const container =
document.getElementById(“drawerCategories”);

if (!container) return;

container.innerHTML = categories
.map((category) => {
return `
${escapeHtml(
category.name ||
category.title ||
“Категория”
)}
      <svg viewBox="0 0 24 24">
        <path d="m9 18 6-6-6-6"></path>
      </svg>
    </button>
  `;
})
.join("");

container
.querySelectorAll(”.drawer-category”)
.forEach((button) => {
button.addEventListener(“click”, () => {
selectedCategory =
button.dataset.categoryId;

    closeDrawer();
    renderCatalogPage();
    showPage("catalog");
    haptic();
  });
});

}

/* =========================================================
NAVIGATION
========================================================= */

function setupNavigation() {

document
.getElementById(“menuButton”)
?.addEventListener(
“click”,
openDrawer
);

document
.getElementById(“drawerOverlay”)
?.addEventListener(
“click”,
closeDrawer
);

document
.getElementById(“closeDrawerButton”)
?.addEventListener(
“click”,
closeDrawer
);

document
.querySelector(
‘[data-category-id=“all”]’
)
?.addEventListener(
“click”,
() => {
selectedCategory = null;

    closeDrawer();
    renderCatalogPage();
    showPage("catalog");
    haptic();
  }
);

document
.getElementById(“logoButton”)
?.addEventListener(
“click”,
() => {
closeDrawer();
showPage(“home”);
haptic();
}
);

document
.getElementById(“profileButton”)
?.addEventListener(
“click”,
() => {
closeDrawer();

    renderProfile();
    showPage("profile");
    haptic();
  }
);

document
.getElementById(“cartButton”)
?.addEventListener(
“click”,
async () => {
closeDrawer();

    await loadOrders();
    showPage("orders");
    haptic();
  }
);

document
.getElementById(“bannerCatalogButton”)
?.addEventListener(
“click”,
() => {
selectedCategory = null;

    renderCatalogPage();
    showPage("catalog");
    haptic();
  }
);

document
.getElementById(“newAllButton”)
?.addEventListener(
“click”,
() => {
selectedCategory = null;

    renderCatalogPage();
    showPage("catalog");
    haptic();
  }
);

document
.getElementById(“popularAllButton”)
?.addEventListener(
“click”,
() => {
selectedCategory = null;

    renderCatalogPage();
    showPage("catalog");
    haptic();
  }
);

document
.getElementById(“drawerOrdersButton”)
?.addEventListener(
“click”,
async () => {
closeDrawer();

    await loadOrders();
    showPage("orders");
    haptic();
  }
);

document
.getElementById(“drawerManagerButton”)
?.addEventListener(
“click”,
() => {
closeDrawer();

    openContact(
      "Здравствуйте! Нужна помощь по IRoom."
    );
  }
);

document
.getElementById(“profileOrdersButton”)
?.addEventListener(
“click”,
async () => {
await loadOrders();
showPage(“orders”);
}
);

document
.getElementById(“emptyOrdersCatalogButton”)
?.addEventListener(
“click”,
() => {
selectedCategory = null;

    renderCatalogPage();
    showPage("catalog");
  }
);

document
.getElementById(“productBackButton”)
?.addEventListener(
“click”,
() => {
showPage(“catalog”);
}
);

document
.getElementById(“orderBackButton”)
?.addEventListener(
“click”,
async () => {
await loadOrders();
showPage(“orders”);
}
);

document
.getElementById(“checkoutBackButton”)
?.addEventListener(
“click”,
() => {
showPage(“product”);
}
);
}

/* =========================================================
SEARCH
========================================================= */

function setupSearch() {
const button =
document.getElementById(“searchButton”);

const close =
document.getElementById(“closeSearchButton”);

const panel =
document.getElementById(“searchPanel”);

const input =
document.getElementById(“searchInput”);

if (!panel || !input) return;

button?.addEventListener(
“click”,
() => {
panel.classList.remove(“hidden”);

  setTimeout(() => {
    input.focus();
  }, 80);
  haptic();
}

);

close?.addEventListener(
“click”,
() => {
panel.classList.add(“hidden”);
input.value = “”;

  renderSearchResults("");
}

);

input.addEventListener(
“input”,
() => {
renderSearchResults(input.value);
}
);
}

function renderSearchResults(query) {
const container =
document.getElementById(“searchResults”);

if (!container) return;

const text =
String(query || “”)
.trim()
.toLowerCase();

if (!text) {
container.innerHTML = <div class="search-empty"> Начните вводить название товара </div>;

return;

}

const result =
products.filter((product) => {

  const name =
    String(
      product.name || ""
    ).toLowerCase();
  const description =
    String(
      product.description || ""
    ).toLowerCase();
  return (
    name.includes(text) ||
    description.includes(text)
  );
});

if (!result.length) {
container.innerHTML = <div class="search-empty"> Ничего не найдено </div>;

return;

}

container.innerHTML =
result
.map(productCard)
.join(””);

bindProductCards(container);
}

/* =========================================================
PRODUCTS
========================================================= */

function productCard(product) {
const image =
getProductImage(product);

const price =
getProductPrice(product);

const oldPrice =
product.old_price ||
product.oldPrice ||
null;

return `
  <div class="product-image-wrap">
    ${
      image
        ? `
          <img
            class="product-image"
            src="${escapeHtml(image)}"
            alt="${escapeHtml(
              product.name || ""
            )}"
            loading="lazy"
          >
        `
        : `
          <div class="product-image-placeholder"></div>
        `
    }
    ${
      product.is_new ||
      product.new ||
      product.badge
        ? `
          <span class="product-badge">
            ${
              typeof product.badge === "string"
                ? escapeHtml(product.badge)
                : "NEW"
            }
          </span>
        `
        : ""
    }
  </div>
  <div class="product-card-content">
    <h3>
      ${escapeHtml(
        product.name || "Товар"
      )}
    </h3>
    <div>
      <span class="product-price">
        ${formatPrice(price)}
      </span>
      ${
        oldPrice
          ? `
            <span class="product-old-price">
              ${formatPrice(oldPrice)}
            </span>
          `
          : ""
      }
    </div>
  </div>
</article>

`;
}

function bindProductCards(container) {
container
.querySelectorAll(”.product-card”)
.forEach((card) => {

  card.addEventListener(
    "click",
    () => {
      openProduct(
        card.dataset.productId
      );
    }
  );
});

}

function renderNewProducts() {
const container =
document.getElementById(“newProducts”);

if (!container) return;

const result =
products.filter(
(product) =>
product.is_new ||
product.new ||
product.badge
);

const source =
result.length
? result
: products.slice(0, 8);

container.innerHTML =
source
.map(productCard)
.join(””);

bindProductCards(container);
}

function renderPopularProducts() {
const container =
document.getElementById(“popularProducts”);

if (!container) return;

const source =
[…products]
.sort(
(a, b) =>
Number(
b.sales ||
b.orders_count ||
0
) -
Number(
a.sales ||
a.orders_count ||
0
)
)
.slice(0, 8);

container.innerHTML =
source
.map(productCard)
.join(””);

bindProductCards(container);
}

/* =========================================================
CATALOG
========================================================= */

function renderCatalogPage() {
const categoriesContainer =
document.getElementById(
“catalogPageCategories”
);

const productsContainer =
document.getElementById(
“catalogPageProducts”
);

if (
!categoriesContainer ||
!productsContainer
) {
return;
}

categoriesContainer.innerHTML = `
<button
class=“category-filter ${
selectedCategory === null
? “active”
: “”
}”
data-category-id=“all”
type=“button”
>
Все
${
  categories
    .map(
      (category) => `
        <button
          class="category-filter ${
            String(selectedCategory) ===
            String(category.id)
              ? "active"
              : ""
          }"
          data-category-id="${escapeHtml(
            category.id
          )}"
          type="button"
        >
          ${escapeHtml(
            category.name ||
            category.title ||
            "Категория"
          )}
        </button>
      `
    )
    .join("")
}

`;

categoriesContainer
.querySelectorAll(
“.category-filter”
)
.forEach((button) => {

  button.addEventListener(
    "click",
    () => {
      selectedCategory =
        button.dataset.categoryId === "all"
          ? null
          : button.dataset.categoryId;
      renderCatalogPage();
      haptic();
    }
  );
});

let list = […products];

if (selectedCategory !== null) {
list = list.filter(
(product) =>
String(
product.category_id ??
product.categoryId ??
“”
) ===
String(selectedCategory)
);
}

if (!list.length) {
productsContainer.innerHTML = `
    <h3>
      Товаров пока нет
    </h3>
    <p>
      В этой категории пока нет товаров.
    </p>
  </div>
`;
return;

}

productsContainer.innerHTML =
list
.map(productCard)
.join(””);

bindProductCards(productsContainer);
}

/* =========================================================
PRODUCT
========================================================= */

function findProduct(id) {
return products.find(
(product) =>
String(product.id) ===
String(id)
);
}

async function openProduct(productId) {
let product =
findProduct(productId);

try {

const data =
  await api(
    `/api/products/${encodeURIComponent(
      productId
    )}`
  );
product =
  data?.product ||
  product;

} catch (error) {

console.error(
  "openProduct:",
  error
);

}

if (!product) {
showToast(“Товар не найден”);
return;
}

currentProduct = product;

const variants =
Array.isArray(product.variants)
? product.variants
: [];

selectedVariant =
variants[0] || null;

renderProductDetails();

showPage(“product”);

haptic();
}

function renderProductDetails() {
const container =
document.getElementById(
“productDetails”
);

if (
!container ||
!currentProduct
) {
return;
}

const product =
currentProduct;

const image =
getProductImage(product);

const variants =
Array.isArray(product.variants)
? product.variants
: [];

const price =
selectedVariant
? getVariantPrice(
selectedVariant,
product
)
: getProductPrice(product);

container.innerHTML = `

<div class="product-detail-image-wrap">
  ${
    image
      ? `
        <img
          class="product-detail-image"
          src="${escapeHtml(image)}"
          alt="${escapeHtml(
            product.name || ""
          )}"
        >
      `
      : `
        <div class="product-detail-image-placeholder"></div>
      `
  }
</div>
<div class="product-detail-content">
  <div class="section-kicker">
    IRoom Store
  </div>
  <h1 class="product-detail-title">
    ${escapeHtml(
      product.name || "Товар"
    )}
  </h1>
  <div class="product-detail-price">
    ${formatPrice(price)}
  </div>
  ${
    product.old_price
      ? `
        <div class="product-detail-old-price">
          ${formatPrice(
            product.old_price
          )}
        </div>
      `
      : ""
  }
  ${
    product.description
      ? `
        <div class="product-description">
          ${escapeHtml(
            product.description
          )}
        </div>
      `
      : ""
  }
  ${
    variants.length
      ? `
        <div class="variants-block">
          <div class="variants-title">
            Комплектация
          </div>
          <div class="variants-list">
            ${variants
              .map((variant) => {
                const active =
                  String(
                    getVariantId(
                      variant
                    )
                  ) ===
                  String(
                    getVariantId(
                      selectedVariant
                    )
                  );
                return `
                  <button
                    class="variant-button ${
                      active
                        ? "active"
                        : ""
                    }"
                    type="button"
                    data-variant-id="${escapeHtml(
                      getVariantId(
                        variant
                      )
                    )}"
                  >
                    <span>
                      ${escapeHtml(
                        getVariantName(
                          variant
                        )
                      )}
                    </span>
                    <span>
                      ${formatPrice(
                        getVariantPrice(
                          variant,
                          product
                        )
                      )}
                    </span>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `
      : ""
  }
  <button
    id="bookProductButton"
    class="primary-button product-book-button"
    type="button"
  >
    Забронировать
  </button>
  <button
    id="productContactButton"
    class="secondary-button"
    type="button"
  >
    Связаться с менеджером
  </button>
</div>

`;

container
.querySelectorAll(
“.variant-button”
)
.forEach((button) => {

  button.addEventListener(
    "click",
    () => {
      const variant =
        variants.find(
          (item) =>
            String(
              getVariantId(item)
            ) ===
            String(
              button.dataset.variantId
            )
        );
      if (!variant) return;
      selectedVariant =
        variant;
      renderProductDetails();
      haptic();
    }
  );
});

document
.getElementById(
“bookProductButton”
)
?.addEventListener(
“click”,
openCheckout
);

document
.getElementById(
“productContactButton”
)
?.addEventListener(
“click”,
() => {

    openContact(
      `Здравствуйте! Хочу узнать подробнее о товаре «${
        product.name
      }».`
    );
  }
);

}

/* =========================================================
CHECKOUT
========================================================= */

function openCheckout() {
if (!currentProduct) return;

renderCheckout();

showPage(“checkout”);

haptic(“medium”);
}

function renderCheckout() {
const container =
document.getElementById(
“checkoutContent”
);

if (
!container ||
!currentProduct
) {
return;
}

const product =
currentProduct;

const image =
getProductImage(product);

const price =
selectedVariant
? getVariantPrice(
selectedVariant,
product
)
: getProductPrice(product);

const variantText =
selectedVariant
? getVariantName(
selectedVariant
)
: “Стандартная комплектация”;

container.innerHTML = `

<div class="checkout-card">
  <div class="checkout-title">
    Товар
  </div>
  <div class="checkout-product">
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
    <div>
      <div class="checkout-product-name">
        ${escapeHtml(
          product.name || "Товар"
        )}
      </div>
      <div class="checkout-product-variant">
        ${escapeHtml(
          variantText
        )}
      </div>
      <div class="checkout-price">
        ${formatPrice(price)}
      </div>
    </div>
  </div>
</div>
<div class="checkout-card">
  <div class="checkout-title">
    Получение
  </div>
  <div class="checkout-options">
    <button
      id="pickupOption"
      class="checkout-option active"
      type="button"
      data-type="pickup"
    >
      Самовывоз
    </button>
    <button
      id="deliveryOption"
      class="checkout-option"
      type="button"
      data-type="delivery"
    >
      Доставка
    </button>
  </div>
  <div id="checkoutAddress"></div>
</div>
<div class="checkout-card">
  <div class="checkout-title">
    Оплата
  </div>
  <div class="checkout-options">
    <button
      class="checkout-option active"
      type="button"
      disabled
    >
      Наличными при получении
    </button>
  </div>
  <div class="checkout-note">
    Оставшаяся сумма оплачивается наличными
    при получении заказа.
  </div>
</div>
<div class="checkout-card reservation-box">
  <div class="checkout-title">
    Бронирование
  </div>
  <div class="reservation-amount">
    1 000 ₽
  </div>
  <div class="checkout-note">
    Для подтверждения бронирования необходимо
    внести 1 000 ₽. Реквизиты для оплаты
    предоставляет магазин.
  </div>
  <div class="reservation-card-number">
    Реквизиты будут показаны здесь
  </div>
  <button
    id="copyReservationButton"
    class="copy-card-button"
    type="button"
  >
    Скопировать реквизиты
  </button>
</div>
<div class="checkout-card">
  <div class="checkout-title">
    Данные для связи
  </div>
  <input
    id="checkoutComment"
    class="checkout-input"
    placeholder="Комментарий к заказу"
  >
</div>
<button
  id="checkoutSubmitButton"
  class="primary-button checkout-submit"
  type="button"
>
  Создать заказ
</button>

`;

setupCheckoutEvents();

renderCheckoutAddress(“pickup”);
}

function renderCheckoutAddress(type) {
const container =
document.getElementById(
“checkoutAddress”
);

if (!container) return;

if (type === “delivery”) {

container.innerHTML = `
  <input
    id="deliveryCity"
    class="checkout-input"
    placeholder="Город"
  >
  <input
    id="deliveryStreet"
    class="checkout-input"
    placeholder="Улица"
  >
  <input
    id="deliveryHouse"
    class="checkout-input"
    placeholder="Дом"
  >
  <input
    id="deliveryApartment"
    class="checkout-input"
    placeholder="Квартира"
  >
`;
return;

}

container.innerHTML = <div class="checkout-address-info"> Самовывоз из магазина IRoom.<br> Точный адрес и время работы подтверждает менеджер после оформления заказа. </div>;
}

function setupCheckoutEvents() {

const pickup =
document.getElementById(
“pickupOption”
);

const delivery =
document.getElementById(
“deliveryOption”
);

pickup?.addEventListener(
“click”,
() => {

  pickup.classList.add("active");
  delivery?.classList.remove(
    "active"
  );
  renderCheckoutAddress(
    "pickup"
  );
}

);

delivery?.addEventListener(
“click”,
() => {

  delivery.classList.add("active");
  pickup?.classList.remove(
    "active"
  );
  renderCheckoutAddress(
    "delivery"
  );
}

);

document
.getElementById(
“copyReservationButton”
)
?.addEventListener(
“click”,
async () => {

    const text =
      document
        .querySelector(
          ".reservation-card-number"
        )
        ?.textContent
        ?.trim() ||
      "Реквизиты для бронирования уточняются у менеджера.";
    try {
      await navigator.clipboard.writeText(
        text
      );
      showToast("Скопировано");
    } catch {
      showToast(
        "Реквизиты уточняются у менеджера"
      );
    }
  }
);

document
.getElementById(
“checkoutSubmitButton”
)
?.addEventListener(
“click”,
createOrder
);
}

/* =========================================================
CREATE ORDER
========================================================= */

async function createOrder() {

if (!currentProduct) return;

const button =
document.getElementById(
“checkoutSubmitButton”
);

if (button) {

button.disabled = true;
button.textContent =
  "Создаём заказ...";

}

try {

const product =
  currentProduct;
const price =
  selectedVariant
    ? getVariantPrice(
        selectedVariant,
        product
      )
    : getProductPrice(product);
const variantText =
  selectedVariant
    ? getVariantName(
        selectedVariant
      )
    : "";
const delivery =
  Boolean(
    document
      .getElementById(
        "deliveryOption"
      )
      ?.classList.contains(
        "active"
      )
  );
const comment =
  document.getElementById(
    "checkoutComment"
  )?.value || "";
let address = "";
if (delivery) {
  const city =
    document.getElementById(
      "deliveryCity"
    )?.value || "";
  const street =
    document.getElementById(
      "deliveryStreet"
    )?.value || "";
  const house =
    document.getElementById(
      "deliveryHouse"
    )?.value || "";
  const apartment =
    document.getElementById(
      "deliveryApartment"
    )?.value || "";
  address = [
    city,
    street,
    house
      ? `д. ${house}`
      : "",
    apartment
      ? `кв. ${apartment}`
      : ""
  ]
    .filter(Boolean)
    .join(", ");
} else {
  address =
    "Самовывоз";
}
const data =
  await api(
    "/api/orders",
    {
      method: "POST",
      body: JSON.stringify({
        product_id:
          product.id,
        variant_id:
          selectedVariant
            ? getVariantId(
                selectedVariant
              )
            : null,
        product_name:
          product.name ||
          "Товар",
        variant_text:
          variantText,
        price,
        payment_method:
          "cash",
        reservation_amount:
          1000,
        receiving_type:
          delivery
            ? "delivery"
            : "pickup",
        delivery_type:
          delivery
            ? "delivery"
            : "pickup",
        address,
        comment,
        reservation_status:
          "awaiting_confirmation"
      })
    }
  );
currentOrder =
  data?.order ||
  null;
if (!currentOrder) {
  throw new Error(
    "Сервер не вернул заказ"
  );
}
showToast(
  "Заказ создан"
);
await loadOrders();
await openOrder(
  currentOrder.id
);

} catch (error) {

console.error(
  "createOrder:",
  error
);
showToast(
  error.message ||
  "Не удалось создать заказ"
);

} finally {

if (button) {
  button.disabled = false;
  button.textContent =
    "Создать заказ";
}

}
}

/* =========================================================
ORDERS
========================================================= */

async function loadOrders() {

const loading =
document.getElementById(
“ordersLoading”
);

const empty =
document.getElementById(
“ordersEmpty”
);

const list =
document.getElementById(
“ordersList”
);

loading?.classList.remove(
“hidden”
);

empty?.classList.add(
“hidden”
);

if (list) {
list.innerHTML = “”;
}

try {

const data =
  await api(
    "/api/orders"
  );
orders =
  unwrap(
    data,
    "orders"
  );
renderOrders();
updateCartBadge();

} catch (error) {

console.error(
  "loadOrders:",
  error
);
if (list) {
  list.innerHTML = `
    <div class="empty-state">
      <h3>
        Не удалось загрузить заказы
      </h3>
      <p>
        Попробуйте ещё раз.
      </p>
      <button
        class="primary-button"
        id="retryOrdersButton"
      >
        Повторить
      </button>
    </div>
  `;
  document
    .getElementById(
      "retryOrdersButton"
    )
    ?.addEventListener(
      "click",
      loadOrders
    );
}

} finally {

loading?.classList.add(
  "hidden"
);

}
}

function renderOrders() {

const list =
document.getElementById(
“ordersList”
);

const empty =
document.getElementById(
“ordersEmpty”
);

if (!list || !empty) return;

if (!orders.length) {

empty.classList.remove(
  "hidden"
);
return;

}

empty.classList.add(
“hidden”
);

list.innerHTML =
orders
.map(orderCard)
.join(””);

list
.querySelectorAll(
“.order-card”
)
.forEach((card) => {

  card.addEventListener(
    "click",
    () => {
      openOrder(
        card.dataset.orderId
      );
    }
  );
});

}

function orderCard(order) {

const status =
STATUS_INFO[order.status] ||
STATUS_INFO.new;

const product =
findProduct(
order.product_id
);

const image =
getProductImage(product);

return `
  <div class="order-card-top">
    <div>
      <div class="order-number">
        ${escapeHtml(
          order.display_id ||
          `#${order.id}`
        )}
      </div>
      <div class="order-date">
        ${escapeHtml(
          formatDateTime(
            order.created_at
          )
        )}
      </div>
    </div>
    <span
      class="order-status ${
        status.className
      }"
    >
      ${escapeHtml(
        status.text
      )}
    </span>
  </div>
  <div class="order-card-product">
    ${
      image
        ? `
          <img
            src="${escapeHtml(image)}"
            alt=""
          >
        `
        : `
          <div class="order-card-image-placeholder"></div>
        `
    }
    <div class="order-card-product-info">
      <h3>
        ${escapeHtml(
          order.product_name ||
          "Товар"
        )}
      </h3>
      ${
        order.variant_text
          ? `
            <div class="order-variant">
              ${escapeHtml(
                order.variant_text
              )}
            </div>
          `
          : ""
      }
      <div class="order-price">
        ${formatPrice(
          order.price
        )}
      </div>
    </div>
  </div>
  <div class="order-card-bottom">
    <span>
      Подробнее
    </span>
    <span>
      ›
    </span>
  </div>
</article>

`;
}

function updateCartBadge() {

const badge =
document.getElementById(
“cartBadge”
);

if (!badge) return;

const active =
orders.filter(
(order) =>
![
“completed”,
“cancelled”
].includes(
String(order.status)
)
).length;

if (!active) {

badge.classList.add(
  "hidden"
);
return;

}

badge.textContent =
active > 9
? “9+”
: String(active);

badge.classList.remove(
“hidden”
);
}

/* =========================================================
ORDER DETAIL
========================================================= */

async function openOrder(orderId) {

showPage(“order”);

const container =
document.getElementById(
“orderDetails”
);

if (!container) return;

container.innerHTML = `
  <div class="small-loader"></div>
  <span>
    Загружаем заказ...
  </span>
</div>

`;

try {

const data =
  await api(
    `/api/orders/${encodeURIComponent(
      orderId
    )}`
  );
currentOrder =
  data?.order ||
  null;
if (!currentOrder) {
  throw new Error(
    "Заказ не найден"
  );
}
renderOrderDetails();

} catch (error) {

console.error(
  "openOrder:",
  error
);
container.innerHTML = `
  <div class="empty-state">
    <h3>
      Заказ не найден
    </h3>
    <p>
      Возможно, он был удалён.
    </p>
    <button
      class="primary-button"
      id="backOrdersButton"
    >
      Вернуться к заказам
    </button>
  </div>
`;
document
  .getElementById(
    "backOrdersButton"
  )
  ?.addEventListener(
    "click",
    () => {
      showPage("orders");
    }
  );

}
}

function renderOrderDetails() {

const container =
document.getElementById(
“orderDetails”
);

if (
!container ||
!currentOrder
) {
return;
}

const order =
currentOrder;

const status =
STATUS_INFO[order.status] ||
STATUS_INFO.new;

const product =
findProduct(
order.product_id
);

const image =
getProductImage(product);

const statuses = [
“new”,
“processing”,
“awaiting_payment”,
“reserved”,
“completed”
];

const currentIndex =
statuses.indexOf(
order.status
);

container.innerHTML = `

<div class="order-detail-card">
  <div class="order-detail-heading">
    <div>
      <div class="section-kicker">
        ЗАКАЗ
      </div>
      <h1>
        ${escapeHtml(
          order.display_id ||
          `#${order.id}`
        )}
      </h1>
    </div>
    <span
      class="order-status ${
        status.className
      }"
    >
      ${escapeHtml(
        status.text
      )}
    </span>
  </div>
  <div class="order-detail-date">
    ${escapeHtml(
      formatDateTime(
        order.created_at
      )
    )}
  </div>
  <div class="order-detail-product">
    ${
      image
        ? `
          <img
            src="${escapeHtml(image)}"
            alt=""
          >
        `
        : `
          <div class="order-detail-image-placeholder"></div>
        `
    }
    <div>
      <h2>
        ${escapeHtml(
          order.product_name ||
          "Товар"
        )}
      </h2>
      ${
        order.variant_text
          ? `
            <p>
              ${escapeHtml(
                order.variant_text
              )}
            </p>
          `
          : ""
      }
    </div>
  </div>
  <div class="order-detail-price-row">
    <span>
      Стоимость
    </span>
    <strong>
      ${formatPrice(
        order.price
      )}
    </strong>
  </div>
  ${
    order.reservation_amount
      ? `
        <div class="order-detail-price-row">
          <span>
            Бронирование
          </span>
          <strong>
            ${formatPrice(
              order.reservation_amount
            )}
          </strong>
        </div>
      `
      : ""
  }
  ${
    order.receiving_type ||
    order.delivery_type
      ? `
        <div class="order-detail-price-row">
          <span>
            Получение
          </span>
          <strong>
            ${
              order.receiving_type === "delivery" ||
              order.delivery_type === "delivery"
                ? "Доставка"
                : "Самовывоз"
            }
          </strong>
        </div>
      `
      : ""
  }
  ${
    order.address
      ? `
        <div class="order-detail-price-row">
          <span>
            Адрес
          </span>
          <strong>
            ${escapeHtml(
              order.address
            )}
          </strong>
        </div>
      `
      : ""
  }
  ${
    order.status === "cancelled"
      ? `
        <div class="order-cancelled-box">
          Заказ отменён менеджером.
        </div>
      `
      : `
        <div class="order-timeline">
          ${statuses
            .map(
              (item, index) => {
                const completed =
                  currentIndex >= index;
                const active =
                  order.status === item;
                return `
                  <div
                    class="timeline-item ${
                      completed
                        ? "completed"
                        : ""
                    } ${
                      active
                        ? "active"
                        : ""
                    }"
                  >
                    <div class="timeline-dot">
                      ${
                        completed
                          ? "✓"
                          : ""
                      }
                    </div>
                    <div class="timeline-text">
                      ${escapeHtml(
                        STATUS_INFO[item].text
                      )}
                    </div>
                  </div>
                `;
              }
            )
            .join("")}
        </div>
      `
  }
  <button
    id="orderManagerButton"
    class="secondary-button"
    type="button"
  >
    Связаться с менеджером
  </button>
</div>

`;

document
.getElementById(
“orderManagerButton”
)
?.addEventListener(
“click”,
() => {

    openContact(
      `Здравствуйте! Вопрос по заказу ${
        order.display_id ||
        order.id
      }.`
    );
  }
);

}

/* =========================================================
USER
========================================================= */

async function loadCurrentUser() {

try {

const data =
  await api(
    "/api/me"
  );
currentUser =
  data?.user ||
  null;
renderProfile();

} catch (error) {

console.error(
  "User:",
  error
);

}
}

function renderProfile() {

const name =
document.getElementById(
“profileName”
);

const username =
document.getElementById(
“profileUsername”
);

const avatar =
document.getElementById(
“profileAvatar”
);

if (!currentUser) {

if (name) {
  name.textContent =
    "Покупатель";
}
if (username) {
  username.textContent =
    "Telegram";
}
if (avatar) {
  avatar.textContent =
    "I";
}
return;

}

const fullName = [
currentUser.first_name,
currentUser.last_name
]
.filter(Boolean)
.join(” “)
.trim();

const displayName =
fullName ||
currentUser.username ||
“Покупатель”;

if (name) {
name.textContent =
displayName;
}

if (username) {
username.textContent =
currentUser.username
? @${currentUser.username}
: “Telegram”;
}

if (avatar) {
avatar.textContent =
displayName
.charAt(0)
.toUpperCase();
}
}

/* =========================================================
CONTACT
========================================================= */

function openContact(message) {

openTelegram(
https://t.me/iroom_24?text=${encodeURIComponent( message )}
);
}

function setupContactButtons() {

document
.getElementById(
“contactManagerButton”
)
?.addEventListener(
“click”,
() => {

    openContact(
      "Здравствуйте! Хочу проконсультироваться по товарам IRoom."
    );
  }
);

document
.getElementById(
“profileManagerButton”
)
?.addEventListener(
“click”,
() => {

    openContact(
      "Здравствуйте! Нужна помощь по IRoom."
    );
  }
);

}

/* =========================================================
ADMIN
========================================================= */

async function checkAdmin() {

try {

const data =
  await api(
    "/api/admin/me"
  );
const isAdmin =
  Boolean(
    data?.is_admin ||
    data?.ok
  );
const button =
  document.getElementById(
    "adminProfileButton"
  );
button?.classList.toggle(
  "hidden",
  !isAdmin
);
document
  .getElementById(
    "adminButton"
  )
  ?.addEventListener(
    "click",
    () => {
      window.location.href =
        "/admin.html";
    }
  );

} catch (error) {

console.error(
  "Admin:",
  error
);

}
}

/* =========================================================
LOAD STORE
========================================================= */

async function loadProducts() {

const data =
await api(
“/api/products”
);

products =
unwrap(
data,
“products”
);
}

async function loadCategories() {

const data =
await api(
“/api/categories”
);

categories =
unwrap(
data,
“categories”
);
}

function renderHome() {

renderNewProducts();
renderPopularProducts();
renderDrawerCategories();

}

/* =========================================================
BANNERS
========================================================= */

function setupBanners() {

const track =
document.getElementById(
“bannerTrack”
);

const dots =
document.getElementById(
“bannerDots”
);

if (!track || !dots) return;

const slides =
track.querySelectorAll(
“.banner-slide”
);

if (!slides.length) return;

dots.innerHTML =
Array.from(slides)
.map(
(_, index) => <span class="banner-dot ${ index === 0 ? "active" : "" }" ></span>
)
.join(””);

track.addEventListener(
“scroll”,
() => {

  const width =
    track.clientWidth;
  if (!width) return;
  const index =
    Math.round(
      track.scrollLeft /
      width
    );
  dots
    .querySelectorAll(
      ".banner-dot"
    )
    .forEach(
      (dot, dotIndex) => {
        dot.classList.toggle(
          "active",
          dotIndex === index
        );
      }
    );
}

);
}

/* =========================================================
START
========================================================= */

document.addEventListener(
“DOMContentLoaded”,
async () => {

initTelegram();
setupNavigation();
setupSearch();
setupContactButtons();
showPage("home");
setupBanners();
try {
  await Promise.all([
    loadProducts(),
    loadCategories(),
    loadCurrentUser()
  ]);
  renderHome();
  renderCatalogPage();
  renderProfile();
  await checkAdmin();
  try {
    await loadOrders();
  } catch {}
} catch (error) {
  console.error(
    "Store:",
    error
  );
  showToast(
    "Не удалось загрузить магазин"
  );
} finally {
  document
    .getElementById(
      "startupScreen"
    )
    ?.classList.add(
      "hidden"
    );
  document
    .getElementById(
      "app"
    )
    ?.classList.remove(
      "hidden"
    );
}

}
);

/* =========================================================
EMERGENCY START
========================================================= */

setTimeout(() => {

document
.getElementById(
“startupScreen”
)
?.classList.add(
“hidden”
);

document
.getElementById(
“app”
)
?.classList.remove(
“hidden”
);

}, 4000);