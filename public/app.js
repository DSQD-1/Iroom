const tg = window.Telegram?.WebApp;

let products = [];
let categories = [];
let settings = {};

let currentProduct = null;
let currentCategory = null;
let pendingTelegramMessage = “”;

/* =========================
TELEGRAM
========================= */

function initTelegram() {
if (!tg) return;

tg.ready();
tg.expand();

try {
tg.setHeaderColor(”#070709”);
tg.setBackgroundColor(”#070709”);
} catch {}
}

/* =========================
API
========================= */

async function api(url, options = {}) {
const headers = {
…(options.headers || {}),
“x-telegram-init-data”: tg?.initData || “”
};

const response = await fetch(url, {
…options,
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
Ошибка ${response.status}
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

function escapeHtml(value = “”) {
return String(value)
.replaceAll(”&”, “&”)
.replaceAll(”<”, “<”)
.replaceAll(”>”, “>”)
.replaceAll(’”’, “"”)
.replaceAll(”’”, “'”);
}

function formatPrice(value) {
const number = Number(
String(value ?? “”)
.replace(/\s/g, “”)
.replace(”,”, “.”)
);

if (!Number.isFinite(number)) {
return String(value || “”);
}

return new Intl.NumberFormat(“ru-RU”).format(number);
}

function showToast(message) {
const toast = $(“toast”);

if (!toast) return;

toast.textContent = message;
toast.classList.add(“show”);

clearTimeout(showToast.timer);

showToast.timer = setTimeout(() => {
toast.classList.remove(“show”);
}, 2200);
}

/* =========================
PRODUCT NAME
========================= */

function getFullProductName(product) {
if (!product) return “”;

return [
product.name,
product.memory,
product.color,
product.version
]
.filter((value) => {
return (
value !== null &&
value !== undefined &&
String(value).trim() !== “”
);
})
.map((value) => String(value).trim())
.join(” “);
}

/* =========================
HOME / PRODUCT
========================= */

function showHome() {
$(“homePage”)?.classList.remove(“hidden”);
$(“productPage”)?.classList.add(“hidden”);

currentProduct = null;

closeSearch();

window.scrollTo({
top: 0,
behavior: “smooth”
});
}

function showProduct(product) {
if (!product) return;

currentProduct = product;

closeSearch();

$(“homePage”)?.classList.add(“hidden”);
$(“productPage”)?.classList.remove(“hidden”);

const image = $(“productImage”);

if (image) {
if (product.image_url) {
image.src = product.image_url;
image.style.display = “block”;
} else {
image.removeAttribute(“src”);
image.style.display = “none”;
}
}

if ($(“productCategory”)) {
$(“productCategory”).textContent =
getCategoryName(product.category_id);
}

if ($(“productName”)) {
$(“productName”).textContent =
product.name || “”;
}

const meta = [
product.memory,
product.color,
product.version
].filter(Boolean);

if ($(“productMeta”)) {
$(“productMeta”).textContent =
meta.join(” · “);
}

if ($(“productPrice”)) {
const price =
product.price !== null &&
product.price !== undefined &&
String(product.price).trim() !== “”
? ${formatPrice(product.price)} ₽
: “”;

$("productPrice").textContent = price;

}

window.scrollTo({
top: 0,
behavior: “smooth”
});
}

/* =========================
CATEGORIES
========================= */

function getCategoryName(id) {
const category = categories.find(
(item) =>
Number(item.id) === Number(id)
);

return category?.name || “”;
}

function renderCategories() {
const container = $(“categories”);

if (!container) return;

const allButton = <button class="category-button ${ currentCategory === null ? "active" : "" }" data-category="" type="button" > Все </button>;

const categoryButtons = categories
.map((category) => <button class="category-button ${ Number(currentCategory) === Number(category.id) ? "active" : "" }" data-category="${Number(category.id)}" type="button" > ${escapeHtml(category.name)} </button>)
.join(””);

container.innerHTML =
allButton + categoryButtons;

container
.querySelectorAll(”.category-button”)
.forEach((button) => {
button.addEventListener(“click”, () => {
const value =
button.dataset.category;

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
? <img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name || "")}" loading="lazy" >
: <div class="product-placeholder"> <span><b>IR</b>oom</span> </div>;

const meta = [
product.memory,
product.color
]
.filter(Boolean)
.join(” · “);

const price =
product.price !== null &&
product.price !== undefined &&
String(product.price).trim() !== “”
? ${formatPrice(product.price)} ₽
: “”;

return `
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
      ${escapeHtml(price)}
    </div>
  </div>
</article>

`;
}

/* =========================
CATALOG
========================= */

function renderCatalog() {
const container = $(“catalog”);

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
container.innerHTML = <div class="empty-state"> Товаров пока нет </div>;

return;

}

container.innerHTML =
list.map(productCard).join(””);

attachProductClicks(container);
}

/* =========================
NEW PRODUCTS
========================= */

function renderNewProducts() {
const container = $(“newProducts”);

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
container.innerHTML = <div class="empty-state"> Новинок пока нет </div>;

return;

}

container.innerHTML =
list.map(productCard).join(””);

attachProductClicks(container);
}

/* =========================
PRODUCT CLICK
========================= */

function attachProductClicks(container) {
container
.querySelectorAll(”.product-card”)
.forEach((card) => {
card.addEventListener(“click”, () => {
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
const box = $(“searchBox”);
const input = $(“searchInput”);

if (!box) return;

/*
Новый CSS использует именно .active.
Старый .open больше НЕ используется.
*/

box.classList.add(“active”);

if (input) {
setTimeout(() => {
input.focus();
}, 80);
}
}

function closeSearch() {
const box = $(“searchBox”);
const input = $(“searchInput”);

if (box) {
box.classList.remove(“active”);
}

if (input) {
input.value = “”;
}

renderSearchResults(””);
}

function toggleSearch() {
const box = $(“searchBox”);

if (!box) return;

if (box.classList.contains(“active”)) {
closeSearch();
} else {
openSearch();
}
}

function searchProducts(query) {
const value =
String(query || “”)
.trim()
.toLowerCase();

if (!value) {
renderSearchResults(””);
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
.join(” “)
.toLowerCase();

  return text.includes(value);
});

renderSearchResults(
value,
result
);
}

function renderSearchResults(
query,
result = []
) {
const section =
$(“searchResultsSection”);

const container =
$(“searchResults”);

if (!section || !container) return;

if (!query) {
section.classList.add(“hidden”);
container.innerHTML = “”;
return;
}

section.classList.remove(“hidden”);

if (!result.length) {
container.innerHTML = <div class="empty-state"> Ничего не найдено </div>;

return;

}

container.innerHTML =
result.map(productCard).join(””);

attachProductClicks(container);
}

/* =========================
CONTACT
========================= */

function getContactUsername() {
return String(
settings.contact_username ||
settings.contactUsername ||
“iroom_24”
)
.trim()
.replace(/^@/, “”)
.replace(/^https?://t.me//i, “”)
.replace(//+$/, “”);
}

/* =========================
MESSAGE MODAL
========================= */

function createMessageModal() {
if ($(“messageModal”)) {
return $(“messageModal”);
}

const modal = document.createElement(“div”);

modal.id = “messageModal”;

modal.className = “hidden”;

modal.innerHTML = `
<div class="message-modal-card">
  <button
    type="button"
    class="message-modal-close"
    id="messageModalClose"
    aria-label="Закрыть"
  >
    ×
  </button>
  <div class="message-modal-title">
    Готовое сообщение
  </div>
  <div class="message-modal-subtitle">
    Скопируйте текст и отправьте его в чат
  </div>
  <div
    class="message-modal-text"
    id="messageModalText"
  ></div>
  <button
    type="button"
    class="message-modal-copy"
    id="messageModalCopy"
  >
    Скопировать сообщение
  </button>
  <button
    type="button"
    class="message-modal-open"
    id="messageModalOpen"
  >
    Перейти в чат
  </button>
</div>

`;

const style = document.createElement(“style”);

style.textContent = `
#messageModal {
position: fixed;
inset: 0;
z-index: 9999;
display: flex;
align-items: flex-end;
justify-content: center;
padding: 16px;
}

#messageModal.hidden {
  display: none;
}
.message-modal-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, .72);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.message-modal-card {
  position: relative;
  z-index: 2;
  width: 100%;
  max-width: 520px;
  box-sizing: border-box;
  background: #111114;
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 24px;
  padding: 22px;
  box-shadow: 0 -10px 50px rgba(0,0,0,.45);
  animation: messageModalUp .2s ease-out;
}
@keyframes messageModalUp {
  from {
    opacity: 0;
    transform: translateY(25px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.message-modal-close {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255,255,255,.07);
  color: #fff;
  font-size: 25px;
  line-height: 1;
  cursor: pointer;
}
.message-modal-title {
  padding-right: 40px;
  font-size: 21px;
  font-weight: 700;
  color: #fff;
}
.message-modal-subtitle {
  margin-top: 6px;
  color: #8f8f98;
  font-size: 14px;
  line-height: 1.4;
}
.message-modal-text {
  margin-top: 18px;
  padding: 15px;
  border-radius: 15px;
  background: #08080a;
  border: 1px solid rgba(255,255,255,.08);
  color: #f5f5f7;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.message-modal-copy,
.message-modal-open {
  width: 100%;
  min-height: 48px;
  margin-top: 12px;
  border: 0;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.message-modal-copy {
  background: #242428;
  color: #fff;
}
.message-modal-open {
  background: #ff2d82;
  color: #fff;
}
.message-modal-copy:active,
.message-modal-open:active {
  transform: scale(.98);
}

`;

document.head.appendChild(style);
document.body.appendChild(modal);

const close = () => {
modal.classList.add(“hidden”);
};

$(“messageModalClose”)
?.addEventListener(“click”, close);

modal
.querySelector(”.message-modal-overlay”)
?.addEventListener(“click”, close);

return modal;
}

/* =========================
OPEN MESSAGE MODAL
========================= */

function openMessageModal(text) {
const modal =
createMessageModal();

const textElement =
$(“messageModalText”);

const copyButton =
$(“messageModalCopy”);

const openButton =
$(“messageModalOpen”);

pendingTelegramMessage = text;

if (textElement) {
textElement.textContent = text;
}

if (copyButton) {
copyButton.textContent =
“Скопировать сообщение”;
}

modal.classList.remove(“hidden”);

if (copyButton) {
copyButton.onclick = async () => {
try {
await navigator.clipboard.writeText(
pendingTelegramMessage
);

    copyButton.textContent =
      "✓ Сообщение скопировано";
    showToast(
      "Сообщение скопировано"
    );
  } catch (error) {
    console.error(
      "Clipboard error:",
      error
    );
    const textarea =
      document.createElement("textarea");
    textarea.value =
      pendingTelegramMessage;
    textarea.style.position =
      "fixed";
    textarea.style.opacity =
      "0";
    document.body.appendChild(
      textarea
    );
    textarea.select();
    try {
      document.execCommand("copy");
      copyButton.textContent =
        "✓ Сообщение скопировано";
      showToast(
        "Сообщение скопировано"
      );
    } catch {
      showToast(
        "Не удалось скопировать"
      );
    }
    textarea.remove();
  }
};

}

if (openButton) {
openButton.onclick = () => {
openTelegramChat(
pendingTelegramMessage
);
};
}
}

/* =========================
OPEN TELEGRAM CHAT
========================= */

function openTelegramChat(text) {
const username =
getContactUsername();

if (!username) {
showToast(
“Контакт для связи не найден”
);

return;

}

const url =
https://t.me/${username}?text=${encodeURIComponent(text)};

try {
if (tg?.openTelegramLink) {
tg.openTelegramLink(url);
return;
}

if (tg?.openLink) {
  tg.openLink(url);
  return;
}

} catch (error) {
console.error(
“Telegram open error:”,
error
);
}

window.location.href = url;
}

/* =========================
BOOK PRODUCT
========================= */

function bookProduct() {
if (!currentProduct) {
showToast(“Товар не выбран”);
return;
}

const productName =
getFullProductName(
currentProduct
);

const price =
currentProduct.price !== null &&
currentProduct.price !== undefined &&
String(currentProduct.price).trim() !== “”
? formatPrice(
currentProduct.price
)
: “”;

const text =
price
? Здравствуйте! Хочу забронировать ${productName} - ${price}
: Здравствуйте! Хочу забронировать ${productName};

openMessageModal(text);
}

/* =========================
CONSULT PRODUCT
========================= */

function consultProduct() {
if (!currentProduct) {
showToast(“Товар не выбран”);
return;
}

const productName =
getFullProductName(
currentProduct
);

const text =
Здравствуйте! Хочу проконсультироваться по поводу ${productName}.;

openMessageModal(text);
}

/* =========================
ADMIN
========================= */

async function checkAdminAccess() {
const button =
$(“adminBottomButton”);

if (!button) return;

if (!tg?.initData) {
button.classList.add(“hidden”);
return;
}

try {
const result =
await api(”/api/admin/me”);

if (result?.admin === true) {
  button.classList.remove("hidden");
} else {
  button.classList.add("hidden");
}

} catch (error) {
console.error(
“Admin check:”,
error
);

button.classList.add("hidden");

}
}

/* =========================
EVENTS
========================= */

function setupEvents() {

/* Логотип */

$(“storeLogo”)
?.addEventListener(
“click”,
(event) => {
event.preventDefault();
showHome();
}
);

/* Поиск */

$(“searchButton”)
?.addEventListener(
“click”,
(event) => {
event.preventDefault();
event.stopPropagation();

    toggleSearch();
  }
);

$(“closeSearch”)
?.addEventListener(
“click”,
(event) => {
event.preventDefault();
event.stopPropagation();

    closeSearch();
  }
);

$(“searchInput”)
?.addEventListener(
“input”,
(event) => {
searchProducts(
event.target.value
);
}
);

/* Назад */

$(“backButton”)
?.addEventListener(
“click”,
(event) => {
event.preventDefault();
showHome();
}
);

/* БРОНИРОВАНИЕ */

$(“bookButton”)
?.addEventListener(
“click”,
(event) => {
event.preventDefault();
event.stopPropagation();

    bookProduct();
  }
);

/* КОНСУЛЬТАЦИЯ */

$(“consultButton”)
?.addEventListener(
“click”,
(event) => {
event.preventDefault();
event.stopPropagation();

    consultProduct();
  }
);

/* АДМИНКА */

$(“adminBottomButton”)
?.addEventListener(
“click”,
() => {
window.location.href =
“/admin”;
}
);
}

/* =========================
LOAD SETTINGS
========================= */

async function loadSettings() {
try {
const data =
await api(”/api/settings”);

settings =
  data?.settings ||
  data ||
  {};
if (
  !settings.contact_username &&
  !settings.contactUsername
) {
  settings.contact_username =
    "iroom_24";
}

} catch (error) {
console.error(
“Settings:”,
error
);

settings = {
  store_name: "iroom",
  contact_username: "iroom_24"
};

}
}

/* =========================
LOAD CATEGORIES
========================= */

async function loadCategories() {
const data =
await api(”/api/categories”);

categories =
Array.isArray(data)
? data
: data.categories || [];
}

/* =========================
LOAD PRODUCTS
========================= */

async function loadProducts() {
const data =
await api(”/api/products”);

products =
Array.isArray(data)
? data
: data.products || [];
}

/* =========================
INIT
========================= */

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
“DOMContentLoaded”,
init
);