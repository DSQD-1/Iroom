/* =========================================================
   IROOM 2.0
   TELEGRAM + API + CATALOG + CART + ORDERS
========================================================= */

const tg = window.Telegram?.WebApp || null;

if (tg) {
  tg.ready();
  tg.expand();

  try {
    tg.setHeaderColor("#050505");
    tg.setBackgroundColor("#050505");
  } catch {}
}


/* =========================================================
   STATE
========================================================= */

const state = {
  products: [],
  categories: [],
  banners: [],

  route: "home",

  category: "",
  search: "",

  product: null,
  options: {},

  cart: loadCart(),

  checkout: {
    step: 1,
    fulfillment: "pickup",

    name: "",
    contact: "",
    comment: "",

    city: "",
    street: "",
    house: "",
    apartment: "",

    deposit: 0
  }
};


/* =========================================================
   DOM
========================================================= */

const screen = document.getElementById("screen");

const drawer = document.getElementById("drawer");
const drawerBackdrop = document.getElementById("drawerBackdrop");

const searchContainer =
  document.getElementById("searchContainer");

const globalSearch =
  document.getElementById("globalSearch");

const clearSearch =
  document.getElementById("clearSearch");

const toastElement =
  document.getElementById("toast");


/* =========================================================
   TELEGRAM
========================================================= */

function getTelegramInitData() {
  try {
    return String(tg?.initData || "");
  } catch {
    return "";
  }
}


/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {

  const headers = {
    ...(options.body ? {
      "Content-Type": "application/json"
    } : {}),

    "x-telegram-init-data":
      getTelegramInitData(),

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


/* =========================================================
   HELPERS
========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function money(value) {

  return new Intl.NumberFormat(
    "ru-RU"
  ).format(
    Number(value) || 0
  ) + " ₽";

}


function getImage(url, fallback = "📱") {

  if (!url) {
    return `
      <span style="
        font-size:42px;
        opacity:.75;
      ">${fallback}</span>
    `;
  }


  return `
    <img
      src="${escapeHTML(url)}"
      alt=""
      loading="lazy"
      onerror="
        this.style.display='none';
        this.parentElement
          .querySelector('.image-fallback')
          .style.display='block';
      "
    >

    <span
      class="image-fallback"
      style="
        display:none;
        font-size:42px;
        opacity:.75;
      "
    >${fallback}</span>
  `;
}


/* =========================================================
   CART STORAGE
========================================================= */

function loadCart() {

  try {

    const value =
      localStorage.getItem("iroom_cart");

    if (!value) {
      return [];
    }

    const parsed =
      JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch {

    return [];

  }
}


function saveCart() {

  localStorage.setItem(
    "iroom_cart",
    JSON.stringify(state.cart)
  );

  updateCartBadges();

}


/* =========================================================
   CART BADGES
========================================================= */

function getCartCount() {

  return state.cart.reduce(
    (sum, item) =>
      sum + (Number(item.qty) || 0),
    0
  );

}


function updateCartBadges() {

  const count =
    getCartCount();


  const cartBadge =
    document.getElementById("cartBadge");

  const drawerBadge =
    document.getElementById("drawerBadge");


  if (cartBadge) {
    cartBadge.textContent = count;
  }


  if (drawerBadge) {
    drawerBadge.textContent = count;
  }


  if (cartBadge) {

    cartBadge.parentElement.classList.remove(
      "bump"
    );

    void cartBadge.parentElement.offsetWidth;

    if (count > 0) {

      cartBadge.parentElement.classList.add(
        "bump"
      );

    }

  }

}


/* =========================================================
   PAGE RENDER
========================================================= */

function renderPage(html) {

  screen.innerHTML = `
    <div class="page">
      ${html}
    </div>
  `;


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

}


/* =========================================================
   INITIAL LOAD
========================================================= */

async function boot() {

  try {

    const [
      productsResponse,
      categoriesResponse,
      bannersResponse
    ] = await Promise.all([

      api("/api/products"),

      api("/api/categories"),

      api("/api/banners")
        .catch(() => ({
          banners: []
        }))

    ]);


    state.products =
      productsResponse.products || [];

    state.categories =
      categoriesResponse.categories || [];

    state.banners =
      bannersResponse.banners || [];


    renderDrawerCategories();

    renderHome();

    updateCartBadges();

  } catch (error) {

    console.error(error);

    renderPage(`
      <section class="empty">

        <div class="empty-icon">
          ×
        </div>

        <h2>
          Не удалось загрузить IRoom
        </h2>

        <p>
          ${escapeHTML(error.message)}
        </p>

        <button
          class="primary-button"
          onclick="location.reload()"
        >
          Повторить
        </button>

      </section>
    `);

  }

}


/* =========================================================
   HOME
========================================================= */

function renderHome() {

  const newProducts =
    state.products
      .filter(product => product.is_new)
      .slice(0, 4);


  const popularProducts =
    (
      newProducts.length
        ? state.products.filter(
            product =>
              !newProducts.includes(product)
          )
        : state.products
    )
      .slice(0, 4);


  const fallbackProducts =
    state.products.slice(0, 4);


  const productsForNew =
    newProducts.length
      ? newProducts
      : fallbackProducts;


  const banner =
    state.banners[0];


  renderPage(`

    <!-- HERO -->

    <section class="hero">

      <div class="hero-content">

        <div class="eyebrow">

          ${
            banner?.title
              ? escapeHTML(banner.title)
              : "IRoom Store"
          }

        </div>


        <h1>

          ${
            banner?.subtitle
              ? escapeHTML(banner.subtitle)
              : "Техника Apple без лишнего."
          }

        </h1>


        <p>

          ${
            banner?.description
              ? escapeHTML(banner.description)
              : "Оригинальные устройства, понятные цены и помощь менеджера."
          }

        </p>


        <button
          class="primary-button"
          onclick="navigate('catalog')"
        >

          Смотреть каталог

          <span>→</span>

        </button>

      </div>

    </section>


    <!-- NEW -->

    <section class="section">

      <div class="section-head">

        <h2>
          Новинки
        </h2>

        <button
          onclick="navigate('catalog')"
        >
          Все →
        </button>

      </div>


      <div class="product-grid">

        ${
          productsForNew.length
            ? productsForNew
                .map(productCard)
                .join("")
            : `
              <div class="empty">
                Товаров пока нет
              </div>
            `
        }

      </div>

    </section>


    <!-- POPULAR -->

    <section class="section">

      <div class="section-head">

        <h2>
          Популярное
        </h2>

        <button
          onclick="navigate('catalog')"
        >
          Все →
        </button>

      </div>


      <div class="product-grid">

        ${
          popularProducts
            .map(productCard)
            .join("")
        }

      </div>

    </section>


    <!-- MANAGER -->

    <section class="section">

      <a
        class="manager"
        href="https://t.me/iroom_24"
        target="_blank"
      >

        <div class="manager-avatar">
          IR
        </div>


        <div>

          <strong>
            IRoom Manager
          </strong>

          <p>
            Поможем подобрать устройство
          </p>

        </div>


        <div class="arrow">
          →
        </div>

      </a>

    </section>

  `);

}


/* =========================================================
   PRODUCT CARD
========================================================= */

function productCard(product) {

  return `

    <article
      class="product-card"
      onclick="openProduct(${Number(product.id)})"
    >

      <div class="product-image">

        ${getImage(product.image_url)}

      </div>


      <div class="product-info">

        <div class="product-name">

          ${escapeHTML(product.name)}

        </div>


        <div class="product-sub">

          ${
            product.is_new
              ? "Новинка"
              : "IRoom Store"
          }

        </div>


        <div class="product-price">

          От

          <span>
            ${money(product.price)}
          </span>

        </div>

      </div>

    </article>

  `;

}


/* =========================================================
   CATALOG
========================================================= */

function renderCatalog() {

  const products =
    state.products.filter(product => {

      const categoryMatch =
        !state.category ||
        String(product.category_id) ===
          String(state.category);


      const searchMatch =
        !state.search ||
        String(product.name || "")
          .toLowerCase()
          .includes(
            state.search.toLowerCase()
          );


      return (
        categoryMatch &&
        searchMatch
      );

    });


  renderPage(`

    <h1 class="catalog-title">
      Каталог
    </h1>


    <input
      class="search-input"
      id="catalogSearch"
      type="search"
      placeholder="Поиск товаров"
      value="${escapeHTML(state.search)}"
    >


    <div class="chips">

      <button
        class="chip ${
          !state.category
            ? "active"
            : ""
        }"
        onclick="setCategory('')"
      >
        Все
      </button>


      ${
        state.categories
          .map(category => `

            <button
              class="chip ${
                String(state.category) ===
                String(category.id)
                  ? "active"
                  : ""
              }"
              onclick="setCategory('${escapeHTML(category.id)}')"
            >

              ${escapeHTML(category.name)}

            </button>

          `)
          .join("")
      }

    </div>


    <div class="product-grid">

      ${
        products.length

          ? products
              .map(productCard)
              .join("")

          : `

            <div class="empty">

              <div class="empty-icon">
                ⌕
              </div>

              <h2>
                Ничего не найдено
              </h2>

              <p>
                Попробуйте изменить запрос
                или выбрать другую категорию.
              </p>

            </div>

          `
      }

    </div>

  `);


  const input =
    document.getElementById(
      "catalogSearch"
    );


  if (input) {

    input.addEventListener(
      "input",
      event => {

        state.search =
          event.target.value;

        renderCatalog();

      }
    );

  }

}


/* =========================================================
   DRAWER CATEGORIES
========================================================= */

function renderDrawerCategories() {

  const container =
    document.getElementById(
      "drawerCategories"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    state.categories
      .map(category => `

        <button
          class="drawer-item"
          data-category="${escapeHTML(category.id)}"
        >

          <span class="drawer-icon">
            ›
          </span>

          <span>
            ${escapeHTML(category.name)}
          </span>

        </button>

      `)
      .join("");


  container
    .querySelectorAll("[data-category]")
    .forEach(button => {

      button.addEventListener(
        "click",
        () => {

          state.category =
            button.dataset.category;

          closeDrawer();

          navigate("catalog");

        }
      );

    });

}


/* =========================================================
   PRODUCT
========================================================= */

async function openProduct(id) {

  try {

    const response =
      await api(
        "/api/products/" + id
      );


    state.product =
      response.product;


    state.options = {};


    renderProduct();

  } catch (error) {

    console.error(error);

    toast(error.message);

  }

}


/* =========================================================
   PRODUCT OPTIONS
========================================================= */

function getVariantValues(key) {

  const variants =
    state.product?.variants || [];


  return [
    ...new Set(
      variants
        .map(variant => variant[key])
        .filter(Boolean)
    )
  ];

}


function renderOption(
  title,
  key,
  values
) {

  if (!values.length) {
    return "";
  }


  return `

    <div class="option-block">

      <div class="option-title">
        ${title}
      </div>


      <div class="option-list">

        ${
          values
            .map(value => `

              <button
                class="option ${
                  state.options[key] === value
                    ? "selected"
                    : ""
                }"
                onclick='chooseOption(
                  ${JSON.stringify(key)},
                  ${JSON.stringify(value)}
                )'
              >

                ${escapeHTML(value)}

              </button>

            `)
            .join("")
        }

      </div>

    </div>

  `;

}


/* =========================================================
   PRODUCT PAGE
========================================================= */

function renderProduct() {

  const product =
    state.product;


  if (!product) {
    return;
  }


  renderPage(`

    <div class="detail">

      <button
        class="back-button"
        onclick="navigate('catalog')"
      >

        ← Каталог

      </button>


      <div class="detail-image">

        ${getImage(product.image_url)}

      </div>


      <h1>

        ${escapeHTML(product.name)}

      </h1>


      <div class="detail-price">

        От ${money(product.price)}

      </div>


      ${renderOption(
        "Цвет",
        "color",
        getVariantValues("color")
      )}


      ${renderOption(
        "Память",
        "memory",
        getVariantValues("memory")
      )}


      ${renderOption(
        "SIM",
        "sim_type",
        getVariantValues("sim_type")
      )}


      ${renderOption(
        "Регион",
        "region",
        getVariantValues("region")
      )}


      <div class="sticky-actions">

        <button
          class="full-button primary"
          onclick="quickBuy()"
        >

          Купить в один клик

        </button>


        <button
          class="full-button secondary"
          onclick="addToCart()"
        >

          Добавить в корзину

        </button>

      </div>

    </div>

  `);

}


/* =========================================================
   CHOOSE OPTION
========================================================= */

function chooseOption(
  key,
  value
) {

  state.options[key] =
    value;


  renderProduct();

}


/* =========================================================
   FIND SELECTED VARIANT
========================================================= */

function findSelectedVariant() {

  const variants =
    state.product?.variants || [];


  if (!variants.length) {
    return null;
  }


  return (
    variants.find(variant => {

      return Object.entries(
        state.options
      ).every(([key, value]) => {

        if (!value) {
          return true;
        }

        return String(
          variant[key] ?? ""
        ) === String(value);

      });

    }) || null
  );

}


/* =========================================================
   ADD CART
========================================================= */

function addToCart() {

  if (!state.product) {
    return;
  }


  const variant =
    findSelectedVariant();


  const price =
    Number(
      variant?.price ??
      state.product.price ??
      0
    );


  const key =
    JSON.stringify([
      state.product.id,
      state.options
    ]);


  const existing =
    state.cart.find(
      item => item.key === key
    );


  if (existing) {

    existing.qty += 1;

  } else {

    state.cart.push({

      key,

      id:
        state.product.id,

      variant_id:
        variant?.id || null,

      name:
        state.product.name,

      image_url:
        variant?.image_url ||
        state.product.image_url ||
        "",

      price,

      options:
        {
          ...state.options
        },

      qty: 1

    });

  }


  saveCart();

  toast(
    "Добавлено в корзину"
  );

}


/* =========================================================
   QUICK BUY
========================================================= */

function quickBuy() {

  if (!state.product) {
    return;
  }


  const variant =
    findSelectedVariant();


  const price =
    Number(
      variant?.price ??
      state.product.price ??
      0
    );


  state.cart = [

    {

      key:
        "quick-" +
        Date.now(),

      id:
        state.product.id,

      variant_id:
        variant?.id || null,

      name:
        state.product.name,

      image_url:
        variant?.image_url ||
        state.product.image_url ||
        "",

      price,

      options:
        {
          ...state.options
        },

      qty: 1

    }

  ];


  saveCart();


  state.checkout = {

    step: 1,

    fulfillment: "pickup",

    name: "",
    contact: "",
    comment: "",

    city: "",
    street: "",
    house: "",
    apartment: "",

    deposit: 0

  };


  renderCheckout();

}


/* =========================================================
   CART
========================================================= */

function renderCart() {

  if (!state.cart.length) {

    renderPage(`

      <section class="empty">

        <div class="empty-icon">
          🛒
        </div>

        <h2>
          Корзина пуста
        </h2>

        <p>
          Добавьте товары,
          чтобы оформить заказ.
        </p>

        <button
          class="primary-button"
          onclick="navigate('catalog')"
        >
          Перейти в каталог
        </button>

      </section>

    `);

    return;

  }


  const total =
    state.cart.reduce(
      (sum, item) =>
        sum +
        Number(item.price || 0) *
        Number(item.qty || 0),
      0
    );


  renderPage(`

    <h1 class="catalog-title">
      Корзина
    </h1>


    ${
      state.cart
        .map(renderCartItem)
        .join("")
    }


    <div class="summary">

      <div class="summary-line">

        <span>
          Товары
        </span>

        <b>
          ${money(total)}
        </b>

      </div>


      <div class="summary-line">

        <span>
          Залог
        </span>

        <b>
          Уточняется
        </b>

      </div>


      <div class="summary-line total">

        <span>
          Итого
        </span>

        <b>
          ${money(total)}
        </b>

      </div>


      <button
        class="full-button primary"
        onclick="
          startCheckout()
        "
      >

        Оформить заказ

      </button>

    </div>

  `);

}


function renderCartItem(
  item,
  index
) {

  const options =
    Object.values(
      item.options || {}
    )
      .filter(Boolean)
      .map(escapeHTML)
      .join(" · ");


  return `

    <div class="cart-row">

      <div class="cart-thumb">

        ${getImage(item.image_url)}

      </div>


      <div class="cart-info">

        <div class="cart-name">

          ${escapeHTML(item.name)}

        </div>


        <div class="cart-options">

          ${
            options ||
            "Стандартная комплектация"
          }

        </div>


        <div class="qty">

          <button
            onclick="
              changeQuantity(
                ${index},
                -1
              )
            "
          >
            −
          </button>


          <b>
            ${item.qty}
          </b>


          <button
            onclick="
              changeQuantity(
                ${index},
                1
              )
            "
          >
            +
          </button>


          <strong>

            ${money(
              Number(item.price) *
              Number(item.qty)
            )}

          </strong>

        </div>

      </div>

    </div>

  `;

}


/* =========================================================
   QUANTITY
========================================================= */

function changeQuantity(
  index,
  delta
) {

  const item =
    state.cart[index];


  if (!item) {
    return;
  }


  item.qty += delta;


  if (item.qty <= 0) {

    state.cart.splice(
      index,
      1
    );

  }


  saveCart();

  renderCart();

}


/* =========================================================
   CHECKOUT START
========================================================= */

function startCheckout() {

  state.checkout = {

    step: 1,

    fulfillment: "pickup",

    name: "",
    contact: "",
    comment: "",

    city: "",
    street: "",
    house: "",
    apartment: "",

    deposit: 0

  };


  renderCheckout();

}


/* =========================================================
   CHECKOUT STEPS
========================================================= */

function renderSteps(current) {

  const names = [
    "Данные",
    "Получение",
    "Залог"
  ];


  return names
    .map(
      (name, index) => {

        const step =
          index + 1;


        return `

          <div
            class="step ${
              step <= current
                ? "active"
                : ""
            }"
          >

            <b>
              ${step}
            </b>

            ${name}

          </div>

        `;

      }
    )
    .join("");

}


/* =========================================================
   CHECKOUT
========================================================= */

function renderCheckout() {

  const checkout =
    state.checkout;


  if (checkout.step === 1) {

    renderPage(`

      <button
        class="back-button"
        onclick="navigate('cart')"
      >
        ← Корзина
      </button>


      <div class="steps">

        ${renderSteps(1)}

      </div>


      <h1 class="catalog-title">
        Ваши данные
      </h1>


      <div class="form-card">

        <div class="field">

          <label>
            Имя
          </label>

          <input
            id="customerName"
            type="text"
            placeholder="Как к вам обращаться?"
            value="${escapeHTML(
              checkout.name
            )}"
          >

        </div>


        <div class="field">

          <label>
            Контакт
          </label>

          <input
            id="customerContact"
            type="text"
            placeholder="@username или телефон"
            value="${escapeHTML(
              checkout.contact
            )}"
          >

        </div>


        <div class="field">

          <label>
            Комментарий
          </label>

          <textarea
            id="customerComment"
            placeholder="Дополнительная информация"
          >${escapeHTML(
            checkout.comment
          )}</textarea>

        </div>

      </div>


      <button
        class="full-button primary"
        onclick="checkoutStepTwo()"
      >
        Далее →
      </button>

    `);

    return;
  }


  if (checkout.step === 2) {

    renderPage(`

      <button
        class="back-button"
        onclick="
          state.checkout.step = 1;
          renderCheckout();
        "
      >
        ← Назад
      </button>


      <div class="steps">

        ${renderSteps(2)}

      </div>


      <h1 class="catalog-title">
        Получение
      </h1>


      <div class="form-card">

        <div class="choice">

          <button
            class="${
              checkout.fulfillment === "pickup"
                ? "active"
                : ""
            }"
            onclick="
              state.checkout.fulfillment =
                'pickup';

              renderCheckout();
            "
          >
            Самовывоз
          </button>


          <button
            class="${
              checkout.fulfillment === "delivery"
                ? "active"
                : ""
            }"
            onclick="
              state.checkout.fulfillment =
                'delivery';

              renderCheckout();
            "
          >
            Доставка
          </button>

        </div>


        ${
          checkout.fulfillment ===
          "delivery"

            ? `

              <div class="field">

                <label>
                  Город
                </label>

                <input
                  id="deliveryCity"
                  value="${escapeHTML(
                    checkout.city
                  )}"
                >

              </div>


              <div class="field">

                <label>
                  Улица
                </label>

                <input
                  id="deliveryStreet"
                  value="${escapeHTML(
                    checkout.street
                  )}"
                >

              </div>


              <div class="field">

                <label>
                  Дом
                </label>

                <input
                  id="deliveryHouse"
                  value="${escapeHTML(
                    checkout.house
                  )}"
                >

              </div>


              <div class="field">

                <label>
                  Квартира
                </label>

                <input
                  id="deliveryApartment"
                  value="${escapeHTML(
                    checkout.apartment
                  )}"
                >

              </div>

            `

            : `

              <div
                style="
                  margin-top:15px;
                  color:#9999a2;
                  font-size:13px;
                  line-height:1.5;
                "
              >

                После оформления заказа
                вы увидите информацию
                о точке выдачи.

              </div>

            `
        }

      </div>


      <button
        class="full-button primary"
        onclick="checkoutStepThree()"
      >
        Далее →
      </button>

    `);

    return;
  }


  renderPage(`

    <button
      class="back-button"
      onclick="
        state.checkout.step = 2;
        renderCheckout();
      "
    >
      ← Назад
    </button>


    <div class="steps">

      ${renderSteps(3)}

    </div>


    <h1 class="catalog-title">
      Залог
    </h1>


    <div class="form-card">

      <div
        style="
          color:#8d8d96;
          font-size:12px;
        "
      >
        Онлайн-залог
      </div>


      <div
        style="
          margin:7px 0 16px;
          color:var(--pink-light);
          font-size:28px;
          font-weight:950;
        "
      >

        ${
          checkout.deposit
            ? money(checkout.deposit)
            : "По данным магазина"
        }

      </div>


      <div
        style="
          color:#8d8d96;
          font-size:12px;
        "
      >
        Оплата
      </div>


      <p
        style="
          margin:7px 0;
          color:#ffffff;
          line-height:1.45;
        "
      >
        После оформления заказа
        реквизиты и условия залога
        будут доступны в информации
        о заказе.
      </p>


      <div
        style="
          margin-top:13px;
          color:#777780;
          font-size:12px;
          line-height:1.5;
        "
      >

        Залог проверяется менеджером
        вручную. Нажатие кнопки
        не подтверждает оплату
        автоматически.

      </div>

    </div>


    <button
      class="full-button primary"
      onclick="placeOrder()"
    >
      Оформить заказ
    </button>

  `);

}


/* =========================================================
   CHECKOUT STEP 2
========================================================= */

function checkoutStepTwo() {

  const name =
    document.getElementById(
      "customerName"
    )?.value.trim() || "";


  const contact =
    document.getElementById(
      "customerContact"
    )?.value.trim() || "";


  const comment =
    document.getElementById(
      "customerComment"
    )?.value.trim() || "";


  if (!name) {

    toast(
      "Введите имя"
    );

    return;

  }


  if (!contact) {

    toast(
      "Введите контакт"
    );

    return;

  }


  state.checkout.name =
    name;

  state.checkout.contact =
    contact;

  state.checkout.comment =
    comment;

  state.checkout.step =
    2;


  renderCheckout();

}


/* =========================================================
   CHECKOUT STEP 3
========================================================= */

function checkoutStepThree() {

  if (
    state.checkout.fulfillment ===
    "delivery"
  ) {

    state.checkout.city =
      document.getElementById(
        "deliveryCity"
      )?.value.trim() || "";


    state.checkout.street =
      document.getElementById(
        "deliveryStreet"
      )?.value.trim() || "";


    state.checkout.house =
      document.getElementById(
        "deliveryHouse"
      )?.value.trim() || "";


    state.checkout.apartment =
      document.getElementById(
        "deliveryApartment"
      )?.value.trim() || "";


    if (
      !state.checkout.city ||
      !state.checkout.street ||
      !state.checkout.house
    ) {

      toast(
        "Заполните адрес доставки"
      );

      return;

    }

  }


  state.checkout.step =
    3;


  renderCheckout();

}


/* =========================================================
   CREATE ORDER
========================================================= */

async function placeOrder() {

  if (!state.cart.length) {

    toast(
      "Корзина пуста"
    );

    return;

  }


  const checkout =
    state.checkout;


  try {

    const items =
      state.cart;


    /*
      Основной backend сейчас
      создаёт заказ через /api/orders.

      Для совместимости передаём
      первый товар как основной.
    */

    const first =
      items[0];


    const variant =
      state.product &&
      findSelectedVariant();


    const selectedOptions =
      first.options || {};


    const variantText =
      Object.values(
        selectedOptions
      )
        .filter(Boolean)
        .join(" • ");


    const response =
      await api(
        "/api/orders",
        {
          method: "POST",

          body:
            JSON.stringify({

              product_id:
                first.id,

              variant_id:
                first.variant_id ||
                variant?.id ||
                null,

              selected_options:
                selectedOptions,

              variant_text:
                variantText,

              quantity:
                first.qty,

              customer_name:
                checkout.name,

              customer_contact:
                checkout.contact,

              customer_comment:
                checkout.comment,

              fulfillment_type:
                checkout.fulfillment,

              delivery_city:
                checkout.city,

              delivery_street:
                checkout.street,

              delivery_house:
                checkout.house,

              delivery_apartment:
                checkout.apartment

            })

        }
      );


    state.cart = [];

    saveCart();


    const order =
      response.order || {};


    renderPage(`

      <section class="empty">

        <div
          class="empty-icon"
          style="
            color:var(--pink);
          "
        >
          ✓
        </div>


        <h2>
          Заказ оформлен
        </h2>


        <p>

          ${
            order.display_id
              ? `
                Номер заказа:
                <b style="color:#fff">
                  ${escapeHTML(
                    order.display_id
                  )}
                </b>
              `
              : `
                Заказ успешно создан.
              `
          }

          <br><br>

          Теперь залог может быть
          проверен менеджером вручную.

        </p>


        <button
          class="primary-button"
          onclick="
            navigate('orders')
          "
        >
          Открыть мои заказы
        </button>

      </section>

    `);


    /*
      Небольшая вибрация Telegram
    */

    try {

      tg?.HapticFeedback?.notificationOccurred(
        "success"
      );

    } catch {}


  } catch (error) {

    console.error(error);

    toast(
      error.message
    );

  }

}


/* =========================================================
   ORDERS
========================================================= */

async function renderOrders() {

  try {

    const response =
      await api(
        "/api/orders"
      );


    const orders =
      response.orders || [];


    renderPage(`

      <h1 class="catalog-title">
        Мои заказы
      </h1>


      ${
        orders.length

          ? orders
              .map(renderOrderCard)
              .join("")

          : `

            <section class="empty">

              <div class="empty-icon">
                ▣
              </div>

              <h2>
                Заказов пока нет
              </h2>

              <p>
                Здесь появятся ваши заказы.
              </p>

              <button
                class="primary-button"
                onclick="navigate('catalog')"
              >
                Перейти в каталог
              </button>

            </section>

          `
      }

    `);

  } catch (error) {

    console.error(error);

    renderPage(`

      <section class="empty">

        <div class="empty-icon">
          ×
        </div>

        <h2>
          Не удалось загрузить заказы
        </h2>

        <p>
          ${escapeHTML(
            error.message
          )}
        </p>

        <button
          class="primary-button"
          onclick="renderOrders()"
        >
          Повторить
        </button>

      </section>

    `);

  }

}


/* =========================================================
   ORDER CARD
========================================================= */

function renderOrderCard(order) {

  return `

    <article
      class="order-card"
      onclick="
        openOrder(
          ${Number(order.id)}
        )
      "
    >

      <div class="order-head">

        <b>
          ${escapeHTML(
            order.display_id ||
            `#${order.id}`
          )}
        </b>


        <span class="muted">

          ${formatDate(
            order.created_at
          )}

        </span>

      </div>


      <h3
        style="
          margin:12px 0 4px;
          color:#fff;
          font-size:16px;
        "
      >

        ${escapeHTML(
          order.product_name ||
          "Заказ"
        )}

      </h3>


      <div class="muted">

        ${escapeHTML(
          order.variant_text ||
          ""
        )}

      </div>


      <div
        style="
          margin-top:10px;
          color:#fff;
          font-size:17px;
          font-weight:900;
        "
      >

        ${money(
          order.price
        )}

      </div>


      <span
        class="status ${
          order.reservation_status ===
          "awaiting_confirmation"
            ? "wait"
            : order.reservation_status ===
              "confirmed"
              ? "ok"
              : ""
        }"
      >

        ${escapeHTML(
          statusText(
            order.status
          )
        )}

      </span>

    </article>

  `;

}


/* =========================================================
   ORDER DETAIL
========================================================= */

async function openOrder(id) {

  try {

    const response =
      await api(
        "/api/orders/" + id
      );


    const order =
      response.order;


    renderPage(`

      <button
        class="back-button"
        onclick="
          navigate('orders')
        "
      >
        ← Мои заказы
      </button>


      <article class="order-card">

        <div
          style="
            color:#fff;
            font-size:21px;
            font-weight:900;
          "
        >

          ${escapeHTML(
            order.display_id ||
            `#${order.id}`
          )}

        </div>


        <h2
          style="
            margin:15px 0 5px;
            color:#fff;
            letter-spacing:-.7px;
          "
        >

          ${escapeHTML(
            order.product_name ||
            "Заказ"
          )}

        </h2>


        <div class="muted">

          ${escapeHTML(
            order.variant_text ||
            ""
          )}

        </div>


        <div
          style="
            margin-top:13px;
            color:var(--pink-light);
            font-size:23px;
            font-weight:950;
          "
        >

          ${money(
            order.price
          )}

        </div>


        <span
          class="status"
        >

          ${escapeHTML(
            statusText(
              order.status
            )
          )}

        </span>


        <!-- DEPOSIT -->

        <div
          class="form-card"
          style="
            margin-top:16px;
          "
        >

          <b
            style="
              color:#fff;
              font-size:15px;
            "
          >
            Залог
          </b>


          <p
            style="
              color:#9999a2;
              line-height:1.5;
              font-size:13px;
            "
          >

            ${escapeHTML(
              reservationText(
                order.reservation_status
              )
            )}

          </p>


          ${
            order.reservation_status ===
            "pending_payment"

              ? `

                <button
                  class="full-button primary"
                  onclick="
                    reservationPaid(
                      ${Number(order.id)}
                    )
                  "
                >

                  Я оплатил(а) залог

                </button>

              `

              : ""
          }


          ${
            order.reservation_status ===
            "awaiting_confirmation"

              ? `

                <div
                  style="
                    margin-top:12px;
                    color:#ffb56f;
                    font-size:12px;
                    line-height:1.45;
                  "
                >

                  Оплата отправлена
                  на проверку менеджеру.

                </div>

              `

              : ""
          }


          ${
            order.reservation_status ===
            "confirmed"

              ? `

                <div
                  style="
                    margin-top:12px;
                    color:#7be0b5;
                    font-size:12px;
                  "
                >

                  Залог подтверждён.

                </div>

              `

              : ""
          }


          ${
            order.reservation_status ===
            "rejected"

              ? `

                <div
                  style="
                    margin-top:12px;
                    color:#ff6f6f;
                    font-size:12px;
                  "
                >

                  Залог отклонён.
                  Свяжитесь с менеджером.

                </div>

              `

              : ""
          }

        </div>


        <!-- MANAGER -->

        <a
          class="manager"
          href="https://t.me/iroom_24"
          target="_blank"
          style="
            margin-top:12px;
          "
        >

          <div class="manager-avatar">
            IR
          </div>

          <div>

            <strong>
              Связаться с менеджером
            </strong>

            <p>
              @iroom_24
            </p>

          </div>

          <div class="arrow">
            →
          </div>

        </a>

      </article>

    `);

  } catch (error) {

    toast(
      error.message
    );

  }

}


/* =========================================================
   RESERVATION PAID
========================================================= */

async function reservationPaid(id) {

  try {

    await api(
      "/api/orders/" +
      id +
      "/reservation-paid",
      {
        method: "POST",

        body:
          JSON.stringify({})
      }
    );


    try {

      tg?.HapticFeedback?.notificationOccurred(
        "success"
      );

    } catch {}


    toast(
      "Отправлено на проверку"
    );


    setTimeout(
      () => openOrder(id),
      500
    );


  } catch (error) {

    toast(
      error.message
    );

  }

}


/* =========================================================
   STATUS TEXT
========================================================= */

function statusText(status) {

  const statuses = {

    new:
      "🆕 Новый",

    confirmed:
      "🔵 Подтверждён",

    processing:
      "⚙️ В обработке",

    ready:
      "📦 Готов к выдаче",

    completed:
      "🏁 Завершён",

    cancelled:
      "❌ Отменён"

  };


  return (
    statuses[status] ||
    "🆕 Новый"
  );

}


/* =========================================================
   RESERVATION STATUS
========================================================= */

function reservationText(status) {

  const statuses = {

    not_required:
      "Залог не требуется",

    pending_payment:
      "🟡 Ожидает оплаты",

    pending:
      "🟡 Ожидает оплаты",

    awaiting_confirmation:
      "🟠 Ожидает проверки",

    confirmed:
      "🟢 Залог подтверждён",

    rejected:
      "🔴 Залог отклонён"

  };


  return (
    statuses[status] ||
    "🟡 Ожидает оплаты"
  );

}


/* =========================================================
   DATE
========================================================= */

function formatDate(value) {

  if (!value) {
    return "";
  }


  try {

    return new Date(
      value
    ).toLocaleDateString(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    );

  } catch {

    return String(value)
      .slice(0, 10);

  }

}


/* =========================================================
   NAVIGATION
========================================================= */

function navigate(route) {

  state.route =
    route;


  closeDrawer();


  if (route === "home") {

    renderHome();

  }


  if (route === "catalog") {

    renderCatalog();

  }


  if (route === "cart") {

    renderCart();

  }


  if (route === "orders") {

    renderOrders();

  }

}


/* =========================================================
   CATEGORY
========================================================= */

function setCategory(id) {

  state.category =
    id;

  renderCatalog();

}


/* =========================================================
   DRAWER
========================================================= */

function openDrawer() {

  drawer.classList.add(
    "open"
  );

  drawer.setAttribute(
    "aria-hidden",
    "false"
  );


  try {

    tg?.HapticFeedback?.impactOccurred(
      "light"
    );

  } catch {}

}


function closeDrawer() {

  drawer.classList.remove(
    "open"
  );

  drawer.setAttribute(
    "aria-hidden",
    "true"
  );

}


/* =========================================================
   SEARCH
========================================================= */

function openSearch() {

  searchContainer.classList.toggle(
    "open"
  );


  if (
    searchContainer.classList.contains(
      "open"
    )
  ) {

    setTimeout(
      () => globalSearch?.focus(),
      250
    );

  }

}


function closeSearch() {

  searchContainer.classList.remove(
    "open"
  );

}


/* =========================================================
   TOAST
========================================================= */

function toast(message) {

  if (!toastElement) {
    return;
  }


  toastElement.textContent =
    message;


  toastElement.classList.add(
    "show"
  );


  clearTimeout(
    window.__iroomToast
  );


  window.__iroomToast =
    setTimeout(
      () => {

        toastElement.classList.remove(
          "show"
        );

      },
      2200
    );

}


/* =========================================================
   EVENTS
========================================================= */

document
  .getElementById("menuButton")
  ?.addEventListener(
    "click",
    openDrawer
  );


document
  .getElementById("closeDrawer")
  ?.addEventListener(
    "click",
    closeDrawer
  );


drawerBackdrop
  ?.addEventListener(
    "click",
    closeDrawer
  );


document
  .getElementById("homeButton")
  ?.addEventListener(
    "click",
    () => navigate("home")
  );


document
  .getElementById("cartButton")
  ?.addEventListener(
    "click",
    () => navigate("cart")
  );


document
  .getElementById("profileButton")
  ?.addEventListener(
    "click",
    () => navigate("orders")
  );


document
  .getElementById("searchButton")
  ?.addEventListener(
    "click",
    openSearch
  );


clearSearch
  ?.addEventListener(
    "click",
    () => {

      globalSearch.value =
        "";

      state.search =
        "";

      closeSearch();

      navigate("catalog");

    }
  );


globalSearch
  ?.addEventListener(
    "input",
    event => {

      state.search =
        event.target.value;

      navigate("catalog");

    }
  );


document
  .querySelectorAll(
    "[data-route]"
  )
  .forEach(
    button => {

      button.addEventListener(
        "click",
        () => {

          navigate(
            button.dataset.route
          );

        }
      );

    }
  );


/* =========================================================
   START
========================================================= */

updateCartBadges();

boot();