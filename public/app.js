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

  try {
    tg.ready();
    tg.expand();

    tg.setHeaderColor("#070709");
    tg.setBackgroundColor("#070709");
  } catch (error) {
    console.log("Telegram init:", error);
  }
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
      data?.error ||
      data?.message ||
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
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return "";
  }

  const number = Number(
    String(value)
      .replace(/\s/g, "")
      .replace(",", ".")
  );

  if (!Number.isFinite(number)) {
    return String(value);
  }

  return new Intl.NumberFormat("ru-RU").format(number);
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
   PRODUCT HELPERS
========================= */

function getCategoryName(categoryId) {
  const category = categories.find(
    item =>
      Number(item.id) === Number(categoryId)
  );

  return category?.name || "";
}

function getFullProductName(product) {
  if (!product) return "";

  return [
    product.name,
    product.memory,
    product.color,
    product.version
  ]
    .filter(
      value =>
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    )
    .map(value => String(value).trim())
    .join(" ");
}


/* =========================
   HOME
========================= */

function showHome() {
  currentProduct = null;

  $("homePage")?.classList.remove("hidden");
  $("productPage")?.classList.add("hidden");

  closeSearch();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================
   PRODUCT PAGE
========================= */

function showProduct(product) {
  if (!product) return;

  currentProduct = product;

  closeSearch();

  $("homePage")?.classList.add("hidden");
  $("productPage")?.classList.remove("hidden");

  const image = $("productImage");
  const placeholder = $("productImagePlaceholder");

  if (product.image_url) {
    if (image) {
      image.src = product.image_url;
      image.alt = product.name || "";
      image.style.display = "block";
    }

    placeholder?.classList.add("hidden");
  } else {
    if (image) {
      image.removeAttribute("src");
      image.style.display = "none";
    }

    placeholder?.classList.remove("hidden");
  }

  const categoryElement =
    $("productCategory");

  if (categoryElement) {
    categoryElement.textContent =
      getCategoryName(product.category_id);
  }

  const nameElement =
    $("productName");

  if (nameElement) {
    nameElement.textContent =
      product.name || "";
  }

  const meta = [
    product.memory,
    product.color,
    product.version
  ]
    .filter(Boolean)
    .join(" · ");

  const metaElement =
    $("productMeta");

  if (metaElement) {
    metaElement.textContent = meta;
  }

  const priceElement =
    $("productPrice");

  if (priceElement) {
    const price =
      formatPrice(product.price);

    priceElement.textContent =
      price ? `${price} ₽` : "";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================
   CATEGORIES
========================= */

function renderCategories() {
  const container =
    $("categories");

  if (!container) return;

  const allButton = `
    <button
      type="button"
      class="category-button ${
        currentCategory === null
          ? "active"
          : ""
      }"
      data-category=""
    >
      Все
    </button>
  `;

  const categoryButtons =
    categories
      .map(category => `
        <button
          type="button"
          class="category-button ${
            Number(currentCategory) ===
            Number(category.id)
              ? "active"
              : ""
          }"
          data-category="${Number(category.id)}"
        >
          ${escapeHtml(category.name)}
        </button>
      `)
      .join("");

  container.innerHTML =
    allButton + categoryButtons;

  container
    .querySelectorAll(".category-button")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          const value =
            button.dataset.category;

          currentCategory =
            value === ""
              ? null
              : Number(value);

          renderCategories();
          renderCatalog();

        }
      );

    });
}


/* =========================
   PRODUCT CARD
========================= */

function createProductCard(product) {
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
        <span><b>IR</b>oom</span>
      </div>
    `;

  const meta = [
    product.memory,
    product.color
  ]
    .filter(Boolean)
    .join(" · ");

  const price =
    formatPrice(product.price);

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

        ${
          price
            ? `
              <div class="product-card-price">
                ${escapeHtml(price)} ₽
              </div>
            `
            : ""
        }

      </div>

    </article>
  `;
}

function attachProductClicks(container) {
  if (!container) return;

  container
    .querySelectorAll(".product-card")
    .forEach(card => {

      card.addEventListener(
        "click",
        () => {

          const id =
            Number(card.dataset.productId);

          const product =
            products.find(
              item =>
                Number(item.id) === id
            );

          if (product) {
            showProduct(product);
          }

        }
      );

    });
}


/* =========================
   CATALOG
========================= */

function getActiveProducts() {
  return products.filter(
    product =>
      Number(product.active) !== 0
  );
}

function renderCatalog() {
  const container =
    $("catalog");

  if (!container) return;

  let list =
    getActiveProducts();

  if (currentCategory !== null) {
    list =
      list.filter(
        product =>
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
    list
      .map(createProductCard)
      .join("");

  attachProductClicks(container);
}


/* =========================
   NEW PRODUCTS
========================= */

function renderNewProducts() {
  const container =
    $("newProducts");

  if (!container) return;

  const list =
    getActiveProducts()
      .filter(
        product =>
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
    list
      .map(createProductCard)
      .join("");

  attachProductClicks(container);
}


/* =========================
   SEARCH
========================= */

function openSearch() {
  const box =
    $("searchBox");

  const input =
    $("searchInput");

  if (!box) return;

  box.classList.add("active");

  if (input) {
    setTimeout(() => {
      input.focus();
    }, 100);
  }
}

function closeSearch() {
  const box =
    $("searchBox");

  const input =
    $("searchInput");

  box?.classList.remove("active");

  if (input) {
    input.value = "";
  }

  renderSearchResults("");
}

function toggleSearch() {
  const box =
    $("searchBox");

  if (!box) return;

  if (
    box.classList.contains("active")
  ) {
    closeSearch();
  } else {
    openSearch();
  }
}

function searchProducts(query) {
  const value =
    String(query || "")
      .trim()
      .toLowerCase();

  if (!value) {
    renderSearchResults("");
    return;
  }

  const result =
    getActiveProducts()
      .filter(product => {

        const text = [
          product.name,
          product.memory,
          product.color,
          product.version,
          getCategoryName(
            product.category_id
          )
        ]
          .filter(Boolean)
          .join(" ")
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
    $("searchResultsSection");

  const container =
    $("searchResults");

  if (!section || !container) {
    return;
  }

  if (!query) {
    section.classList.add("hidden");
    container.innerHTML = "";
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
    result
      .map(createProductCard)
      .join("");

  attachProductClicks(container);
}


/* =========================
   SETTINGS
========================= */

async function loadSettings() {
  try {

    const data =
      await api("/api/settings");

    settings =
      data?.settings ||
      data ||
      {};

  } catch (error) {

    console.log(
      "Settings unavailable:",
      error
    );

    settings = {
      store_name: "iroom",
      contact_username: "iroom_24"
    };
  }
}

function getContactUsername() {
  return String(
    settings.contact_username ||
    settings.contactUsername ||
    "iroom_24"
  )
    .trim()
    .replace(/^@/, "")
    .replace(
      /^https?:\/\/t\.me\//i,
      ""
    )
    .replace(/\/+$/, "");
}


/* =========================
   MESSAGE MODAL
========================= */

function createMessageModal() {
  let modal =
    $("messageModal");

  if (modal) return modal;

  modal =
    document.createElement("div");

  modal.id =
    "messageModal";

  modal.className =
    "message-modal hidden";

  modal.innerHTML = `
    <div
      class="message-modal-overlay"
      id="messageModalOverlay"
    ></div>

    <div class="message-modal-card">

      <button
        id="messageModalClose"
        class="message-modal-close"
        type="button"
      >
        ×
      </button>

      <div class="message-modal-title">
        Готовое сообщение
      </div>

      <div class="message-modal-subtitle">
        Сообщение уже подготовлено.
        Выберите действие ниже.
      </div>

      <div
        id="messageModalText"
        class="message-modal-text"
      ></div>

      <button
        id="messageModalCopy"
        class="message-modal-copy"
        type="button"
      >
        Скопировать сообщение
      </button>

      <button
        id="messageModalOpen"
        class="message-modal-open"
        type="button"
      >
        Перейти в чат
      </button>

    </div>
  `;

  document.body.appendChild(modal);

  const close =
    () => {
      modal.classList.add("hidden");
    };

  $("messageModalClose")
    ?.addEventListener(
      "click",
      close
    );

  $("messageModalOverlay")
    ?.addEventListener(
      "click",
      close
    );

  return modal;
}

function openMessageModal(text) {
  const modal =
    createMessageModal();

  pendingMessage =
    text;

  const textElement =
    $("messageModalText");

  if (textElement) {
    textElement.textContent =
      text;
  }

  const copyButton =
    $("messageModalCopy");

  if (copyButton) {

    copyButton.textContent =
      "Скопировать сообщение";

    copyButton.onclick =
      async () => {

        try {

          await navigator.clipboard.writeText(
            pendingMessage
          );

          copyButton.textContent =
            "✓ Скопировано";

          showToast(
            "Сообщение скопировано"
          );

        } catch {

          const textarea =
            document.createElement(
              "textarea"
            );

          textarea.value =
            pendingMessage;

          textarea.style.position =
            "fixed";

          textarea.style.opacity =
            "0";

          document.body.appendChild(
            textarea
          );

          textarea.select();

          try {

            document.execCommand(
              "copy"
            );

            copyButton.textContent =
              "✓ Скопировано";

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

  const openButton =
    $("messageModalOpen");

  if (openButton) {

    openButton.onclick =
      () => {
        openTelegramChat(
          pendingMessage
        );
      };

  }

  modal.classList.remove(
    "hidden"
  );
}

let pendingMessage = "";


/* =========================
   TELEGRAM CHAT
========================= */

function openTelegramChat(text) {
  const username =
    getContactUsername();

  if (!username) {
    showToast(
      "Контакт не найден"
    );

    return;
  }

  const url =
    `https://t.me/${username}?text=${encodeURIComponent(text)}`;

  try {

    if (
      tg &&
      typeof tg.openTelegramLink ===
        "function"
    ) {
      tg.openTelegramLink(url);
      return;
    }

    if (
      tg &&
      typeof tg.openLink ===
        "function"
    ) {
      tg.openLink(url);
      return;
    }

  } catch (error) {

    console.error(
      "Telegram link:",
      error
    );

  }

  window.location.href =
    url;
}


/* =========================
   BOOK
========================= */

function bookProduct() {
  if (!currentProduct) {
    showToast(
      "Товар не выбран"
    );

    return;
  }

  const name =
    getFullProductName(
      currentProduct
    );

  const price =
    formatPrice(
      currentProduct.price
    );

  const text =
    price
      ? `Здравствуйте! Хочу забронировать ${name} - ${price}`
      : `Здравствуйте! Хочу забронировать ${name}`;

  openMessageModal(text);
}


/* =========================
   CONSULT
========================= */

function consultProduct() {
  if (!currentProduct) {
    showToast(
      "Товар не выбран"
    );

    return;
  }

  const name =
    getFullProductName(
      currentProduct
    );

  const text =
    `Здравствуйте! Хочу проконсультироваться по поводу ${name}.`;

  openMessageModal(text);
}


/* =========================
   ADMIN
========================= */

async function checkAdminAccess() {
  const button =
    $("adminBottomButton");

  if (!button) return;

  button.classList.add(
    "hidden"
  );

  if (!tg?.initData) {
    return;
  }

  try {

    const result =
      await api(
        "/api/admin/me"
      );

    if (
      result?.admin === true
    ) {
      button.classList.remove(
        "hidden"
      );
    }

  } catch (error) {

    console.log(
      "Admin access:",
      error
    );

  }
}


/* =========================
   EVENTS
========================= */

function setupEvents() {

  $("storeLogo")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        showHome();
      }
    );


  $("searchButton")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();

        toggleSearch();
      }
    );


  $("closeSearch")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();

        closeSearch();
      }
    );


  $("searchInput")
    ?.addEventListener(
      "input",
      event => {
        searchProducts(
          event.target.value
        );
      }
    );


  $("backButton")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        showHome();
      }
    );


  $("bookButton")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();

        bookProduct();
      }
    );


  $("consultButton")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();

        consultProduct();
      }
    );


  $("adminBottomButton")
    ?.addEventListener(
      "click",
      () => {
        window.location.href =
          "/admin";
      }
    );
}


/* =========================
   LOAD DATA
========================= */

async function loadCategories() {
  const data =
    await api(
      "/api/categories"
    );

  categories =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.categories)
        ? data.categories
        : [];
}

async function loadProducts() {
  const data =
    await api(
      "/api/products"
    );

  products =
    Array.isArray(data)
      ? data
      : Array.isArray(data?.products)
        ? data.products
        : [];
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

    console.error(
      "IRoom init error:",
      error
    );

    showToast(
      error?.message ||
      "Не удалось загрузить магазин"
    );

  }

  await checkAdminAccess();
}


/* =========================
   START
========================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    init,
    { once: true }
  );

} else {

  init();

}