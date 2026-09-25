const tg =
  window.Telegram?.WebApp || null;

const ADMIN_IDS =
  new Set([
    "5082864281",
    "5975037118"
  ]);

const state = {
  route: "home",
  products: [],
  categories: [],
  orders: [],
  cart: [],
  currentProduct: null,
  currentOrder: null,
  currentCategory: null,
  search: "",
  selectedCategory: null,
  selectedOptions: {},
  user: null,
  storeConfig: null,
  aiOpen: false,
  aiMessages: [],
  aiLoading: false
};

const $ = (
  selector,
  root = document
) =>
  root.querySelector(
    selector
  );

const $$ = (
  selector,
  root = document
) =>
  [
    ...root.querySelectorAll(
      selector
    )
  ];

function telegramUserId() {
  return String(
    tg?.initDataUnsafe?.user?.id ||
    ""
  );
}

function isAdmin() {
  return ADMIN_IDS.has(
    telegramUserId()
  );
}

function getInitData() {
  return String(
    tg?.initData || ""
  );
}

function esc(value) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function numberValue(
  value,
  fallback = 0
) {
  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : fallback;
}

function formatPrice(value) {
  return `${numberValue(
    value
  ).toLocaleString(
    "ru-RU"
  )} ₽`;
}

function formatDate(
  value
) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return date.toLocaleString(
    "ru-RU",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}

function haptic(
  type = "light"
) {
  try {
    if (
      !tg?.HapticFeedback
    ) {
      return;
    }

    if (
      type === "success"
    ) {
      tg.HapticFeedback
        .notificationOccurred(
          "success"
        );
      return;
    }

    if (
      type === "error"
    ) {
      tg.HapticFeedback
        .notificationOccurred(
          "error"
        );
      return;
    }

    tg.HapticFeedback
      .impactOccurred(
        type
      );
  } catch {}
}

function toast(
  message
) {
  const text =
    String(
      message ?? ""
    ).trim();

  if (!text) {
    return;
  }

  let element =
    $("#toast");

  if (!element) {
    element =
      document.createElement(
        "div"
      );

    element.id =
      "toast";

    element.className =
      "toast";

    document.body.appendChild(
      element
    );
  }

  element.textContent =
    text;

  element.classList.add(
    "show"
  );

  clearTimeout(
    element._timer
  );

  element._timer =
    setTimeout(
      () => {
        element.classList.remove(
          "show"
        );
      },
      2800
    );
}

async function api(
  url,
  options = {}
) {
  const headers = {
    ...(options.headers || {}),
    "Content-Type":
      "application/json"
  };

  const initData =
    getInitData();

  if (initData) {
    headers[
      "x-telegram-init-data"
    ] = initData;
  }

  const response =
    await fetch(
      url,
      {
        ...options,
        headers
      }
    );

  let data = {};

  try {
    data =
      await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      data?.message ||
      `Ошибка ${response.status}`
    );
  }

  return data;
}

async function loadProducts() {
  const data =
    await api(
      "/api/products"
    );

  state.products =
    Array.isArray(
      data.products
    )
      ? data.products
      : [];

  return state.products;
}

async function loadCategories() {
  const data =
    await api(
      "/api/categories"
    );

  state.categories =
    Array.isArray(
      data.categories
    )
      ? data.categories
      : [];

  return state.categories;
}

async function loadOrders() {
  const data =
    await api(
      "/api/orders"
    );

  state.orders =
    Array.isArray(
      data.orders
    )
      ? data.orders
      : [];

  return state.orders;
}

async function loadMe() {
  try {
    const data =
      await api(
        "/api/me"
      );

    state.user =
      data.user ||
      null;
  } catch {
    state.user =
      null;
  }

  return state.user;
}

async function loadStoreConfig() {
  try {
    const data =
      await api(
        "/api/store-config"
      );

    state.storeConfig =
      data || null;
  } catch {
    state.storeConfig =
      null;
  }

  return state.storeConfig;
}

function saveCart() {
  try {
    localStorage.setItem(
      "iroom_cart",
      JSON.stringify(
        state.cart
      )
    );
  } catch {}
}

function loadCart() {
  try {
    const raw =
      localStorage.getItem(
        "iroom_cart"
      );

    const parsed =
      JSON.parse(
        raw || "[]"
      );

    state.cart =
      Array.isArray(
        parsed
      )
        ? parsed
        : [];
  } catch {
    state.cart = [];
  }
}

function cartCount() {
  return state.cart.reduce(
    (
      total,
      item
    ) =>
      total +
      Math.max(
        1,
        Number(
          item.quantity
        ) || 1
      ),
    0
  );
}

function cartTotal() {
  return state.cart.reduce(
    (
      total,
      item
    ) =>
      total +
      numberValue(
        item.price
      ) *
        Math.max(
          1,
          Number(
            item.quantity
          ) || 1
        ),
    0
  );
}

function productImages(
  product
) {
  const result = [];

  if (
    product?.image_url
  ) {
    result.push(
      String(
        product.image_url
      )
    );
  }

  let images =
    product?.images;

  if (
    typeof images ===
    "string"
  ) {
    try {
      images =
        JSON.parse(
          images
        );
    } catch {
      images = [];
    }
  }

  if (
    Array.isArray(
      images
    )
  ) {
    for (
      const image of images
    ) {
      const url =
        typeof image ===
        "string"
          ? image
          : image?.url;

      if (
        url &&
        !result.includes(
          String(url)
        )
      ) {
        result.push(
          String(url)
        );
      }
    }
  }

  return result;
}

function productPrice(
  product
) {
  return numberValue(
    product?.price
  );
}

function getProductById(
  id
) {
  return (
    state.products.find(
      product =>
        String(
          product.id
        ) ===
        String(id)
    ) || null
  );
}

function getCategoryById(
  id
) {
  return (
    state.categories.find(
      category =>
        String(
          category.id
        ) ===
        String(id)
    ) || null
  );
}

function parseProductOptions(
  product
) {
  const result = {
    colors: [],
    memories: [],
    sims: [],
    regions: [],
    price_options: {}
  };

  for (
    const key of [
      "colors",
      "memories",
      "sims",
      "regions"
    ]
  ) {
    let value =
      product?.[key];

    if (
      typeof value ===
      "string"
    ) {
      try {
        value =
          JSON.parse(
            value
          );
      } catch {
        value = [];
      }
    }

    if (
      Array.isArray(
        value
      )
    ) {
      result[key] =
        value;
    }
  }

  let priceOptions =
    product?.price_options;

  if (
    typeof priceOptions ===
    "string"
  ) {
    try {
      priceOptions =
        JSON.parse(
          priceOptions
        );
    } catch {
      priceOptions = {};
    }
  }

  if (
    priceOptions &&
    typeof priceOptions ===
      "object"
  ) {
    result.price_options =
      priceOptions;
  }

  return result;
}

function optionPrice(
  product,
  selected
) {
  const options =
    parseProductOptions(
      product
    );

  const priceOptions =
    options.price_options;

  if (
    !priceOptions ||
    typeof priceOptions !==
      "object"
  ) {
    return productPrice(
      product
    );
  }

  let price =
    productPrice(
      product
    );

  const keys =
    Object.keys(
      selected || {}
    );

  for (
    const key of keys
  ) {
    const value =
      selected[key];

    if (
      value ===
      undefined ||
      value ===
      null ||
      value === ""
    ) {
      continue;
    }

    const option =
      priceOptions?.[key];

    if (
      option &&
      typeof option ===
        "object"
    ) {
      const valuePrice =
        option[value];

      if (
        Number.isFinite(
          Number(
            valuePrice
          )
        )
      ) {
        price =
          Number(
            valuePrice
          );
      }
    }
  }

  return price;
}

function selectedOptionsText(
  selected = {}
) {
  return Object.entries(
    selected
  )
    .filter(
      ([, value]) =>
        value !==
          undefined &&
        value !== null &&
        String(
          value
        ).trim()
    )
    .map(
      ([key, value]) =>
        `${key}: ${value}`
    )
    .join(", ");
}

function cartItemKey(
  item
) {
  return [
    item.product_id,
    item.variant_id ||
      "",
    JSON.stringify(
      item.selected_options ||
        {}
    )
  ].join(":");
}

function addToCart(
  product,
  selected = {},
  variantId = null
) {
  const price =
    optionPrice(
      product,
      selected
    );

  const item = {
    product_id:
      product.id,
    variant_id:
      variantId,
    product_name:
      product.name,
    image_url:
      product.image_url ||
      productImages(
        product
      )[0] ||
      "",
    price,
    selected_options:
      selected,
    variant_text:
      selectedOptionsText(
        selected
      ),
    quantity: 1
  };

  const key =
    cartItemKey(
      item
    );

  const existing =
    state.cart.find(
      current =>
        cartItemKey(
          current
        ) === key
    );

  if (existing) {
    existing.quantity =
      Math.max(
        1,
        Number(
          existing.quantity
        ) || 1
      ) + 1;
  } else {
    state.cart.push(
      item
    );
  }

  saveCart();
  haptic(
    "light"
  );

  toast(
    "Товар добавлен в корзину"
  );

  render();
}

function removeFromCart(
  index
) {
  if (
    index < 0 ||
    index >=
      state.cart.length
  ) {
    return;
  }

  state.cart.splice(
    index,
    1
  );

  saveCart();
  render();
}

function updateCartQuantity(
  index,
  delta
) {
  const item =
    state.cart[index];

  if (!item) {
    return;
  }

  item.quantity =
    Math.max(
      1,
      Number(
        item.quantity
      ) || 1
    ) +
    Number(
      delta
    );

  saveCart();
  render();
}

function clearCart() {
  state.cart = [];
  saveCart();
  render();
}

function openRoute(
  route
) {
  state.route =
    route;

  state.currentProduct =
    null;

  state.currentOrder =
    null;

  state.currentCategory =
    null;

  closeDrawer();

  render();
}

function openProduct(
  id
) {
  const product =
    getProductById(
      id
    );

  if (!product) {
    toast(
      "Товар не найден"
    );
    return;
  }

  state.currentProduct =
    product;

  state.selectedOptions =
    {};

  state.route =
    "product";

  render();
}

function openOrder(
  id
) {
  const order =
    state.orders.find(
      item =>
        String(
          item.id
        ) ===
        String(id) ||
        String(
          item.display_id
        ) ===
        String(id)
    );

  if (!order) {
    toast(
      "Заказ не найден"
    );
    return;
  }

  state.currentOrder =
    order;

  state.route =
    "order";

  render();
}

function openCategory(
  id
) {
  state.selectedCategory =
    id;

  state.route =
    "catalog";

  render();
}

function closeModal(
  selector
) {
  const element =
    $(selector);

  if (!element) {
    return;
  }

  element.classList.remove(
    "open"
  );

  element.setAttribute(
    "aria-hidden",
    "true"
  );
}

function closeAllModals() {
  $$(".modal.open").forEach(
    modal => {
      modal.classList.remove(
        "open"
      );

      modal.setAttribute(
        "aria-hidden",
        "true"
      );
    }
  );

  closeAI();
}

function openModal(
  selector
) {
  const element =
    $(selector);

  if (!element) {
    return;
  }

  element.classList.add(
    "open"
  );

  element.setAttribute(
    "aria-hidden",
    "false"
  );
}

function closeDrawer() {
  const drawer =
    $("#drawer");

  if (!drawer) {
    return;
  }

  drawer.classList.remove(
    "open"
  );

  drawer.setAttribute(
    "aria-hidden",
    "true"
  );
}

function openDrawer() {
  const drawer =
    $("#drawer");

  if (!drawer) {
    return;
  }

  drawer.classList.add(
    "open"
  );

  drawer.setAttribute(
    "aria-hidden",
    "false"
  );
}
function updateCartBadge() {
  const count =
    cartCount();

  $$(".cart-count").forEach(
    element => {
      element.textContent =
        String(count);

      element.classList.toggle(
        "hidden",
        count <= 0
      );
    }
  );

  const cartButton =
    $("#cartButton");

  if (cartButton) {
    cartButton.dataset.count =
      String(count);
  }
}

function renderHeader() {
  const title =
    $("#pageTitle");

  if (!title) {
    return;
  }

  const titles = {
    home: "iroom",
    catalog: "Каталог",
    product: "Товар",
    cart: "Корзина",
    orders: "Мои заказы",
    order: "Заказ",
    profile: "Профиль"
  };

  title.textContent =
    titles[
      state.route
    ] ||
    "iroom";

  updateCartBadge();
}

function renderCategories() {
  const container =
    $("#categories");

  if (!container) {
    return;
  }

  const categories =
    state.categories;

  if (!categories.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          Категории пока не добавлены
        </div>
      `;

    return;
  }

  container.innerHTML =
    categories
      .map(
        category => `
          <button
            class="category-card"
            data-category-id="${esc(
              category.id
            )}"
          >
            ${
              category.image_url
                ? `
                  <img
                    src="${esc(
                      category.image_url
                    )}"
                    alt="${esc(
                      category.name
                    )}"
                  >
                `
                : `
                  <div class="category-placeholder">
                    ${esc(
                      (
                        category.name ||
                        "?"
                      )
                        .slice(
                          0,
                          1
                        )
                        .toUpperCase()
                    )}
                  </div>
                `
            }

            <span>
              ${esc(
                category.name
              )}
            </span>
          </button>
        `
      )
      .join("");

  $$(".category-card").forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          openCategory(
            button.dataset
              .categoryId
          );
        }
      );
    }
  );
}

function productMatchesSearch(
  product
) {
  const query =
    String(
      state.search ||
        ""
    )
      .trim()
      .toLowerCase();

  if (!query) {
    return true;
  }

  const category =
    getCategoryById(
      product.category_id
    );

  const haystack =
    [
      product.name,
      product.description,
      category?.name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

  return haystack.includes(
    query
  );
}

function getVisibleProducts() {
  return state.products.filter(
    product => {
      if (
        state.selectedCategory &&
        String(
          product.category_id
        ) !==
          String(
            state.selectedCategory
          )
      ) {
        return false;
      }

      return productMatchesSearch(
        product
      );
    }
  );
}

function renderProducts(
  products = getVisibleProducts()
) {
  const container =
    $("#products");

  if (!container) {
    return;
  }

  if (!products.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          <div class="empty-state-title">
            Ничего не найдено
          </div>
          <div class="empty-state-text">
            Попробуйте изменить запрос
          </div>
        </div>
      `;

    return;
  }

  container.innerHTML =
    products
      .map(
        product => {
          const images =
            productImages(
              product
            );

          const image =
            images[0] ||
            "";

          const oldPrice =
            numberValue(
              product.old_price
            );

          return `
            <article
              class="product-card"
              data-product-id="${esc(
                product.id
              )}"
            >
              <button
                class="product-card-media"
                type="button"
                data-open-product="${esc(
                  product.id
                )}"
              >
                ${
                  image
                    ? `
                      <img
                        src="${esc(
                          image
                        )}"
                        alt="${esc(
                          product.name
                        )}"
                        loading="lazy"
                      >
                    `
                    : `
                      <div class="product-placeholder">
                        iroom
                      </div>
                    `
                }

                ${
                  product.is_new
                    ? `
                      <span class="product-badge">
                        NEW
                      </span>
                    `
                    : ""
                }
              </button>

              <div class="product-card-body">
                <button
                  class="product-card-name"
                  type="button"
                  data-open-product="${esc(
                    product.id
                  )}"
                >
                  ${esc(
                    product.name
                  )}
                </button>

                ${
                  product.description
                    ? `
                      <div class="product-card-description">
                        ${esc(
                          product.description
                        )}
                      </div>
                    `
                    : ""
                }

                <div class="product-card-bottom">
                  <div class="product-price-wrap">
                    <strong class="product-price">
                      ${formatPrice(
                        productPrice(
                          product
                        )
                      )}
                    </strong>

                    ${
                      oldPrice >
                      productPrice(
                        product
                      )
                        ? `
                          <span class="product-old-price">
                            ${formatPrice(
                              oldPrice
                            )}
                          </span>
                        `
                        : ""
                    }
                  </div>

                  <button
                    class="product-add-button"
                    type="button"
                    data-add-product="${esc(
                      product.id
                    )}"
                  >
                    +
                  </button>
                </div>
              </div>
            </article>
          `;
        }
      )
      .join("");

  $$(
    "[data-open-product]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          openProduct(
            button.dataset
              .openProduct
          );
        }
      );
    }
  );

  $$(
    "[data-add-product]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          const product =
            getProductById(
              button.dataset
                .addProduct
            );

          if (!product) {
            return;
          }

          addToCart(
            product,
            {}
          );
        }
      );
    }
  );
}

function renderCatalog() {
  const title =
    $("#catalogTitle");

  if (title) {
    if (
      state.selectedCategory
    ) {
      const category =
        getCategoryById(
          state.selectedCategory
        );

      title.textContent =
        category?.name ||
        "Каталог";
    } else {
      title.textContent =
        "Каталог";
    }
  }

  renderProducts();
}

function renderProduct() {
  const container =
    $("#productPage");

  if (!container) {
    return;
  }

  const product =
    state.currentProduct;

  if (!product) {
    container.innerHTML =
      `
        <div class="empty-state">
          Товар не найден
        </div>
      `;

    return;
  }

  const images =
    productImages(
      product
    );

  const options =
    parseProductOptions(
      product
    );

  const selected =
    state.selectedOptions ||
    {};

  const currentPrice =
    optionPrice(
      product,
      selected
    );

  const renderOption =
    (
      title,
      key,
      values
    ) => {
      if (
        !Array.isArray(
          values
        ) ||
        !values.length
      ) {
        return "";
      }

      return `
        <div class="product-option">
          <div class="product-option-title">
            ${esc(title)}
          </div>

          <div
            class="product-option-list"
            data-option-group="${esc(
              key
            )}"
          >
            ${values
              .map(
                value => `
                  <button
                    type="button"
                    class="product-option-button ${
                      String(
                        selected[key]
                      ) ===
                      String(
                        value
                      )
                        ? "active"
                        : ""
                    }"
                    data-option-key="${esc(
                      key
                    )}"
                    data-option-value="${esc(
                      value
                    )}"
                  >
                    ${esc(
                      value
                    )}
                  </button>
                `
              )
              .join("")}
          </div>
        </div>
      `;
    };

  container.innerHTML =
    `
      <div class="product-detail">
        <div class="product-gallery">
          <div class="product-gallery-main">
            ${
              images[0]
                ? `
                  <img
                    id="productMainImage"
                    src="${esc(
                      images[0]
                    )}"
                    alt="${esc(
                      product.name
                    )}"
                  >
                `
                : `
                  <div class="product-placeholder">
                    iroom
                  </div>
                `
            }
          </div>

          ${
            images.length > 1
              ? `
                <div class="product-gallery-thumbs">
                  ${images
                    .map(
                      (
                        image,
                        index
                      ) => `
                        <button
                          type="button"
                          class="product-gallery-thumb ${
                            index ===
                            0
                              ? "active"
                              : ""
                          }"
                          data-gallery-image="${esc(
                            image
                          )}"
                        >
                          <img
                            src="${esc(
                              image
                            )}"
                            alt=""
                          >
                        </button>
                      `
                    )
                    .join("")}
                </div>
              `
              : ""
          }
        </div>

        <div class="product-detail-content">
          <div class="product-detail-category">
            ${
              esc(
                getCategoryById(
                  product.category_id
                )?.name ||
                  ""
              )
            }
          </div>

          <h1>
            ${esc(
              product.name
            )}
          </h1>

          ${
            product.description
              ? `
                <div class="product-detail-description">
                  ${esc(
                    product.description
                  )}
                </div>
              `
              : ""
          }

          <div class="product-detail-price">
            ${formatPrice(
              currentPrice
            )}
          </div>

          <div class="product-options">
            ${renderOption(
              "Цвет",
              "color",
              options.colors
            )}

            ${renderOption(
              "Память",
              "memory",
              options.memories
            )}

            ${renderOption(
              "SIM",
              "sim",
              options.sims
            )}

            ${renderOption(
              "Регион",
              "region",
              options.regions
            )}
          </div>

          <div class="product-actions">
            <button
              type="button"
              class="primary-button"
              id="productAddToCart"
            >
              В корзину
            </button>

            <button
              type="button"
              class="secondary-button"
              id="productReserve"
            >
              Забронировать
            </button>

            <button
              type="button"
              class="secondary-button"
              id="productConsult"
            >
              Проконсультироваться
            </button>
          </div>
        </div>
      </div>
    `;

  $$(
    "[data-option-value]",
    container
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          const key =
            button.dataset
              .optionKey;

          const value =
            button.dataset
              .optionValue;

          state.selectedOptions[
            key
          ] =
            value;

          renderProduct();
        }
      );
    }
  );

  $$(
    "[data-gallery-image]",
    container
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          const main =
            $("#productMainImage");

          if (main) {
            main.src =
              button.dataset
                .galleryImage;
          }

          $$(
            ".product-gallery-thumb",
            container
          ).forEach(
            item =>
              item.classList.remove(
                "active"
              )
          );

          button.classList.add(
            "active"
          );
        }
      );
    }
  );

  const addButton =
    $("#productAddToCart");

  if (addButton) {
    addButton.addEventListener(
      "click",
      () => {
        addToCart(
          product,
          {
            ...state.selectedOptions
          }
        );
      }
    );
  }

  const reserveButton =
    $("#productReserve");

  if (reserveButton) {
    reserveButton.addEventListener(
      "click",
      () => {
        startReservation(
          product,
          {
            ...state.selectedOptions
          }
        );
      }
    );
  }

  const consultButton =
    $("#productConsult");

  if (consultButton) {
    consultButton.addEventListener(
      "click",
      () => {
        openConsultation(
          product,
          {
            ...state.selectedOptions
          }
        );
      }
    );
  }
}

function renderCart() {
  const container =
    $("#cartPage");

  if (!container) {
    return;
  }

  if (!state.cart.length) {
    container.innerHTML =
      `
        <div class="empty-state cart-empty">
          <div class="empty-state-icon">
            🛒
          </div>

          <div class="empty-state-title">
            Корзина пуста
          </div>

          <div class="empty-state-text">
            Добавьте товары из каталога
          </div>

          <button
            type="button"
            class="primary-button"
            id="emptyCartCatalog"
          >
            В каталог
          </button>
        </div>
      `;

    $("#emptyCartCatalog")
      ?.addEventListener(
        "click",
        () =>
          openRoute(
            "catalog"
          )
      );

    return;
  }

  container.innerHTML =
    `
      <div class="cart-list">
        ${state.cart
          .map(
            (
              item,
              index
            ) => `
              <article class="cart-item">
                <div class="cart-item-image">
                  ${
                    item.image_url
                      ? `
                        <img
                          src="${esc(
                            item.image_url
                          )}"
                          alt="${esc(
                            item.product_name
                          )}"
                        >
                      `
                      : ""
                  }
                </div>

                <div class="cart-item-info">
                  <div class="cart-item-name">
                    ${esc(
                      item.product_name
                    )}
                  </div>

                  ${
                    item.variant_text
                      ? `
                        <div class="cart-item-options">
                          ${esc(
                            item.variant_text
                          )}
                        </div>
                      `
                      : ""
                  }

                  <div class="cart-item-price">
                    ${formatPrice(
                      item.price
                    )}
                  </div>

                  <div class="cart-item-controls">
                    <button
                      type="button"
                      data-cart-minus="${index}"
                    >
                      −
                    </button>

                    <span>
                      ${numberValue(
                        item.quantity,
                        1
                      )}
                    </span>

                    <button
                      type="button"
                      data-cart-plus="${index}"
                    >
                      +
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  class="cart-item-remove"
                  data-cart-remove="${index}"
                >
                  ×
                </button>
              </article>
            `
          )
          .join("")}
      </div>

      <div class="cart-summary">
        <div class="cart-summary-row">
          <span>
            Товары
          </span>

          <strong>
            ${formatPrice(
              cartTotal()
            )}
          </strong>
        </div>

        <div class="cart-summary-row cart-summary-total">
          <span>
            Итого
          </span>

          <strong>
            ${formatPrice(
              cartTotal()
            )}
          </strong>
        </div>

        <button
          type="button"
          class="primary-button"
          id="checkoutButton"
        >
          Оформить заказ
        </button>
      </div>
    `;

  $$(
    "[data-cart-minus]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () =>
          updateCartQuantity(
            Number(
              button.dataset
                .cartMinus
            ),
            -1
          )
      );
    }
  );

  $$(
    "[data-cart-plus]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () =>
          updateCartQuantity(
            Number(
              button.dataset
                .cartPlus
            ),
            1
          )
      );
    }
  );

  $$(
    "[data-cart-remove]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () =>
          removeFromCart(
            Number(
              button.dataset
                .cartRemove
            )
          )
      );
    }
  );

  $("#checkoutButton")
    ?.addEventListener(
      "click",
      openCheckout
    );
}

function reservationStatusLabel(
  status
) {
  const labels = {
    not_required:
      "Залог не требуется",
    pending:
      "Ожидает оплаты",
    awaiting_confirmation:
      "Проверяем оплату залога",
    confirmed:
      "Залог подтверждён",
    rejected:
      "Залог отклонён"
  };

  return (
    labels[
      String(status || "")
    ] ||
    "Статус уточняется"
  );
}

function orderStatusLabel(
  status
) {
  const labels = {
    new:
      "Новый",
    processing:
      "В обработке",
    ready:
      "Готов к получению",
    completed:
      "Завершён",
    cancelled:
      "Отменён"
  };

  return (
    labels[
      String(status || "")
    ] ||
    String(
      status || "Новый"
    )
  );
}
function renderOrders() {
  const container =
    $("#ordersPage");

  if (!container) {
    return;
  }

  if (!state.orders.length) {
    container.innerHTML =
      `
        <div class="empty-state">
          <div class="empty-state-icon">
            📦
          </div>

          <div class="empty-state-title">
            Заказов пока нет
          </div>

          <div class="empty-state-text">
            Здесь появятся ваши заказы
          </div>

          <button
            type="button"
            class="primary-button"
            id="ordersCatalogButton"
          >
            Перейти в каталог
          </button>
        </div>
      `;

    $("#ordersCatalogButton")
      ?.addEventListener(
        "click",
        () =>
          openRoute(
            "catalog"
          )
      );

    return;
  }

  container.innerHTML =
    `
      <div class="orders-list">
        ${state.orders
          .map(
            order => `
              <button
                type="button"
                class="order-card"
                data-order-id="${esc(
                  order.id
                )}"
              >
                <div class="order-card-top">
                  <strong>
                    ${esc(
                      order.display_id ||
                        `IR-${order.id}`
                    )}
                  </strong>

                  <span class="order-status">
                    ${esc(
                      orderStatusLabel(
                        order.status
                      )
                    )}
                  </span>
                </div>

                <div class="order-card-name">
                  ${esc(
                    order.product_name ||
                      "Заказ"
                  )}
                </div>

                ${
                  order.variant_text
                    ? `
                      <div class="order-card-options">
                        ${esc(
                          order.variant_text
                        )}
                      </div>
                    `
                    : ""
                }

                <div class="order-card-bottom">
                  <span>
                    ${formatDate(
                      order.created_at
                    )}
                  </span>

                  <strong>
                    ${formatPrice(
                      order.price
                    )}
                  </strong>
                </div>

                ${
                  Number(
                    order.reservation_amount
                  ) > 0
                    ? `
                      <div class="order-reservation-status">
                        ${esc(
                          reservationStatusLabel(
                            order.reservation_status
                          )
                        )}
                      </div>
                    `
                    : ""
                }
              </button>
            `
          )
          .join("")}
      </div>
    `;

  $$(
    "[data-order-id]",
    container
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          openOrder(
            button.dataset
              .orderId
          );
        }
      );
    }
  );
}

function renderOrder() {
  const container =
    $("#orderPage");

  if (!container) {
    return;
  }

  const order =
    state.currentOrder;

  if (!order) {
    container.innerHTML =
      `
        <div class="empty-state">
          <div class="empty-state-title">
            Заказ не найден
          </div>

          <button
            type="button"
            class="primary-button"
            id="backOrdersButton"
          >
            К моим заказам
          </button>
        </div>
      `;

    $("#backOrdersButton")
      ?.addEventListener(
        "click",
        () =>
          openRoute(
            "orders"
          )
      );

    return;
  }

  const reservationAmount =
    numberValue(
      order.reservation_amount
    );

  const awaiting =
    String(
      order.reservation_status
    ) ===
    "awaiting_confirmation";

  const confirmed =
    String(
      order.reservation_status
    ) ===
    "confirmed";

  const rejected =
    String(
      order.reservation_status
    ) ===
    "rejected";

  container.innerHTML =
    `
      <div class="order-detail">
        <div class="order-detail-header">
          <div>
            <div class="order-detail-caption">
              Заказ
            </div>

            <h1>
              ${esc(
                order.display_id ||
                  `IR-${order.id}`
              )}
            </h1>
          </div>

          <span class="order-status large">
            ${esc(
              orderStatusLabel(
                order.status
              )
            )}
          </span>
        </div>

        <div class="order-detail-product">
          <div class="order-detail-product-image">
            ${
              order.image_url
                ? `
                  <img
                    src="${esc(
                      order.image_url
                    )}"
                    alt="${esc(
                      order.product_name
                    )}"
                  >
                `
                : ""
            }
          </div>

          <div>
            <strong>
              ${esc(
                order.product_name ||
                  "Товар"
              )}
            </strong>

            ${
              order.variant_text
                ? `
                  <div class="order-detail-options">
                    ${esc(
                      order.variant_text
                    )}
                  </div>
                `
                : ""
            }
          </div>
        </div>

        <div class="order-detail-card">
          <div class="order-detail-row">
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
            order.promo_code
              ? `
                <div class="order-detail-row">
                  <span>
                    Промокод
                  </span>

                  <strong>
                    ${esc(
                      order.promo_code
                    )}
                  </strong>
                </div>
              `
              : ""
          }

          ${
            numberValue(
              order.promo_discount
            ) > 0
              ? `
                <div class="order-detail-row">
                  <span>
                    Скидка
                  </span>

                  <strong>
                    −${formatPrice(
                      order.promo_discount
                    )}
                  </strong>
                </div>
              `
              : ""
          }

          <div class="order-detail-row total">
            <span>
              Итого
            </span>

            <strong>
              ${formatPrice(
                order.price
              )}
            </strong>
          </div>
        </div>

        ${
          reservationAmount > 0
            ? `
              <div class="reservation-card">
                <div class="reservation-card-title">
                  Залог
                </div>

                <div class="reservation-card-amount">
                  ${formatPrice(
                    reservationAmount
                  )}
                </div>

                <div class="reservation-card-status">
                  ${esc(
                    reservationStatusLabel(
                      order.reservation_status
                    )
                  )}
                </div>

                ${
                  awaiting
                    ? `
                      <div class="reservation-info">
                        Мы получили информацию
                        об оплате. Администратор
                        проверит перевод.
                      </div>
                    `
                    : ""
                }

                ${
                  confirmed
                    ? `
                      <div class="reservation-success">
                        Оплата залога подтверждена.
                      </div>
                    `
                    : ""
                }

                ${
                  rejected
                    ? `
                      <div class="reservation-error">
                        Оплата залога не подтверждена.
                        Свяжитесь с менеджером.
                      </div>
                    `
                    : ""
                }

                ${
                  !awaiting &&
                  !confirmed
                    ? `
                      <button
                        type="button"
                        class="primary-button"
                        data-reservation-paid="${esc(
                          order.id
                        )}"
                      >
                        Я перевёл залог
                      </button>
                    `
                    : ""
                }
              </div>
            `
            : ""
        }

        <div class="order-detail-card">
          <div class="order-detail-row">
            <span>
              Способ получения
            </span>

            <strong>
              ${esc(
                order.fulfillment_type ||
                  order.receiving_type ||
                  order.delivery_type ||
                  "Не указан"
              )}
            </strong>
          </div>

          ${
            order.address
              ? `
                <div class="order-detail-row">
                  <span>
                    Адрес
                  </span>

                  <strong>
                    ${esc(
                      order.address
                    )}
                  </strong>
                </div>
              `
              : ""
          }

          ${
            order.customer_comment ||
            order.comment
              ? `
                <div class="order-detail-comment">
                  ${esc(
                    order.customer_comment ||
                      order.comment
                  )}
                </div>
              `
              : ""
          }

          <div class="order-detail-row">
            <span>
              Создан
            </span>

            <strong>
              ${esc(
                formatDate(
                  order.created_at
                )
              )}
            </strong>
          </div>
        </div>

        <button
          type="button"
          class="secondary-button"
          id="orderBackButton"
        >
          Назад к заказам
        </button>
      </div>
    `;

  $(
    "[data-reservation-paid]",
    container
  )?.addEventListener(
    "click",
    () => {
      reservationPaid(
        $(
          "[data-reservation-paid]",
          container
        )?.dataset
          .reservationPaid
      );
    }
  );

  $(
    "#orderBackButton",
    container
  )?.addEventListener(
    "click",
    () =>
      openRoute(
        "orders"
      )
  );
}

/* =========================================================
   RESERVATION
========================================================= */

async function reservationPaid(
  id
) {
  try {
    const realOrderId =
      resolveRealOrderId(
        id
      );

    if (
      !realOrderId
    ) {
      throw new Error(
        "Не удалось определить ID заказа"
      );
    }

    const data =
      await api(
        `/api/orders/${encodeURIComponent(
          realOrderId
        )}/reservation-paid`,
        {
          method: "POST"
        }
      );

    haptic(
      "success"
    );

    toast(
      "Заявка отправлена на проверку"
    );

    /*
     * Сервер уже вернул
     * полностью обновлённый заказ.
     *
     * НЕ делаем второй GET
     * /api/orders/:id.
     *
     * Именно второй запрос
     * раньше мог приводить
     * к ошибке:
     *
     * Cannot read properties
     * of null (reading 'id')
     */
    if (
      data?.order
    ) {
      state.currentOrder =
        data.order;

      state.orders =
        state.orders.map(
          order =>
            String(
              order.id
            ) ===
            String(
              data.order.id
            )
              ? data.order
              : order
        );

      state.route =
        "order";

      render();

      return;
    }

    await loadOrders();

    const updatedOrder =
      state.orders.find(
        order =>
          String(
            order.id
          ) ===
          String(
            realOrderId
          )
      );

    if (
      updatedOrder
    ) {
      state.currentOrder =
        updatedOrder;
    }

    state.route =
      "order";

    render();
  } catch (
    error
  ) {
    console.error(
      "RESERVATION PAID:",
      error
    );

    toast(
      error.message ||
        "Не удалось отправить заявку"
    );
  }
}

function resolveRealOrderId(
  id
) {
  const value =
    String(
      id ?? ""
    ).trim();

  if (!value) {
    return null;
  }

  const order =
    state.orders.find(
      item =>
        String(
          item.id
        ) === value ||
        String(
          item.display_id
        ) === value
    );

  return (
    order?.id ??
    id
  );
}

/* =========================================================
   CHECKOUT
========================================================= */

function checkoutMarkup() {
  const total =
    cartTotal();

  return `
    <div class="checkout-sheet">
      <div class="sheet-handle"></div>

      <div class="sheet-title">
        Оформление заказа
      </div>

      <div class="checkout-total">
        ${formatPrice(
          total
        )}
      </div>

      <label class="field">
        <span>
          Город
        </span>

        <input
          id="checkoutCity"
          type="text"
          placeholder="Москва"
        >
      </label>

      <label class="field">
        <span>
          Улица
        </span>

        <input
          id="checkoutStreet"
          type="text"
          placeholder="Улица"
        >
      </label>

      <div class="checkout-fields-row">
        <label class="field">
          <span>
            Дом
          </span>

          <input
            id="checkoutHouse"
            type="text"
            placeholder="10"
          >
        </label>

        <label class="field">
          <span>
            Квартира
          </span>

          <input
            id="checkoutApartment"
            type="text"
            placeholder="20"
          >
        </label>
      </div>

      <label class="field">
        <span>
          Комментарий
        </span>

        <textarea
          id="checkoutComment"
          rows="3"
          placeholder="Комментарий к заказу"
        ></textarea>
      </label>

      <label class="field">
        <span>
          Промокод
        </span>

        <div class="promo-row">
          <input
            id="checkoutPromo"
            type="text"
            placeholder="Промокод"
            autocomplete="off"
          >

          <button
            type="button"
            class="secondary-button"
            id="applyPromoButton"
          >
            Применить
          </button>
        </div>
      </label>

      <div
        id="promoResult"
        class="promo-result"
      ></div>

      <button
        type="button"
        class="primary-button"
        id="submitCheckoutButton"
      >
        Подтвердить заказ
      </button>
    </div>
  `;
}

function openCheckout() {
  if (
    !state.cart.length
  ) {
    toast(
      "Корзина пуста"
    );
    return;
  }

  let modal =
    $("#checkoutModal");

  if (!modal) {
    modal =
      document.createElement(
        "div"
      );

    modal.id =
      "checkoutModal";

    modal.className =
      "modal";

    modal.setAttribute(
      "aria-hidden",
      "true"
    );

    document.body.appendChild(
      modal
    );
  }

  modal.innerHTML =
    checkoutMarkup();

  openModal(
    "#checkoutModal"
  );

  let promoData =
    null;

  $("#applyPromoButton")
    ?.addEventListener(
      "click",
      async () => {
        const input =
          $("#checkoutPromo");

        const result =
          $("#promoResult");

        const code =
          String(
            input?.value ||
              ""
          ).trim();

        if (!code) {
          result.textContent =
            "Введите промокод";

          result.className =
            "promo-result error";

          return;
        }

        try {
          const data =
            await api(
              "/api/promo/validate",
              {
                method:
                  "POST",
                body:
                  JSON.stringify({
                    code,
                    amount:
                      cartTotal()
                  })
              }
            );

          promoData =
            data;

          result.textContent =
            `Скидка: ${formatPrice(
              data.discount
            )}. Итог: ${formatPrice(
              data.final_amount
            )}`;

          result.className =
            "promo-result success";

          haptic(
            "success"
          );
        } catch (
          error
        ) {
          promoData =
            null;

          result.textContent =
            error.message ||
            "Промокод не применён";

          result.className =
            "promo-result error";
        }
      }
    );

  $("#submitCheckoutButton")
    ?.addEventListener(
      "click",
      async () => {
        await submitCheckout(
          promoData
        );
      }
    );
}

async function submitCheckout(
  promoData = null
) {
  const button =
    $("#submitCheckoutButton");

  if (button) {
    button.disabled =
      true;

    button.textContent =
      "Оформляем...";
  }

  try {
    const city =
      String(
        $("#checkoutCity")
          ?.value || ""
      ).trim();

    const street =
      String(
        $("#checkoutStreet")
          ?.value || ""
      ).trim();

    const house =
      String(
        $("#checkoutHouse")
          ?.value || ""
      ).trim();

    const apartment =
      String(
        $("#checkoutApartment")
          ?.value || ""
      ).trim();

    const comment =
      String(
        $("#checkoutComment")
          ?.value || ""
      ).trim();

    const address =
      [
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

    const created =
      [];

    for (
      const item of state.cart
    ) {
      const quantity =
        Math.max(
          1,
          Number(
            item.quantity
          ) || 1
        );

      for (
        let index = 0;
        index < quantity;
        index++
      ) {
        const response =
          await api(
            "/api/orders",
            {
              method:
                "POST",
              body:
                JSON.stringify({
                  product_id:
                    item.product_id,
                  variant_id:
                    item.variant_id ||
                    null,
                  product_name:
                    item.product_name,
                  variant_text:
                    item.variant_text ||
                    "",
                  selected_options:
                    item.selected_options ||
                    {},
                  price:
                    item.price,
                  promo_code:
                    promoData?.code ||
                    "",
                  promo_discount:
                    index === 0
                      ? Number(
                          promoData?.discount
                        ) || 0
                      : 0,
                  fulfillment_type:
                    "delivery",
                  receiving_type:
                    "delivery",
                  delivery_type:
                    "delivery",
                  delivery_city:
                    city,
                  delivery_street:
                    street,
                  delivery_house:
                    house,
                  delivery_apartment:
                    apartment,
                  address,
                  customer_comment:
                    comment,
                  comment
                })
            }
          );

        if (
          response?.order
        ) {
          created.push(
            response.order
          );
        }
      }
    }

    /*
     * Если сервер вернул созданные заказы
     * с залогом, сразу отправляем заявку
     * только если checkout явно требует
     * отметить оплату.
     */
    for (
      const order of created
    ) {
      if (
        numberValue(
          order.reservation_amount
        ) > 0 &&
        order.reservation_status ===
          "pending"
      ) {
        /*
         * Здесь НЕ вызываем reservationPaid
         * автоматически.
         *
         * Пользователь должен сам нажать
         * «Я перевёл залог».
         */
      }
    }

    clearCart();

    closeModal(
      "#checkoutModal"
    );

    await loadOrders();

    state.route =
      "orders";

    render();

    toast(
      "Заказ успешно создан"
    );

    haptic(
      "success"
    );
  } catch (
    error
  ) {
    console.error(
      "CHECKOUT:",
      error
    );

    toast(
      error.message ||
        "Не удалось оформить заказ"
    );

    if (button) {
      button.disabled =
        false;

      button.textContent =
        "Подтвердить заказ";
    }
  }
}

/* =========================================================
   RESERVATION / CONSULTATION
========================================================= */

async function startReservation(
  product,
  selected
) {
  if (!product) {
    return;
  }

  const price =
    optionPrice(
      product,
      selected
    );

  const message =
    [
      "Здравствуйте!",
      `Хочу забронировать ${product.name}`,
      selectedOptionsText(
        selected
      ),
      `Цена: ${formatPrice(
        price
      )}`
    ]
      .filter(Boolean)
      .join(" ");

  openTelegramChat(
    message
  );
}

function openConsultation(
  product,
  selected
) {
  if (!product) {
    return;
  }

  const message =
    [
      "Здравствуйте!",
      `Хочу проконсультироваться по ${product.name}`,
      selectedOptionsText(
        selected
      )
    ]
      .filter(Boolean)
      .join(" ");

  openTelegramChat(
    message
  );
}

function openTelegramChat(
  message = ""
) {
  const manager =
    state.storeConfig
      ?.manager_username ||
    state.storeConfig
      ?.telegram_username ||
    "";

  const username =
    String(
      manager
    )
      .replace(
        /^@/,
        ""
      )
      .trim();

  if (!username) {
    toast(
      "Менеджер пока не настроен"
    );
    return;
  }

  const encoded =
    encodeURIComponent(
      message
    );

  const url =
    `https://t.me/${username}?text=${encoded}`;

  try {
    tg?.openTelegramLink(
      url
    );
  } catch {
    window.open(
      url,
      "_blank"
    );
  }
}

/* =========================================================
   AI ASSISTANT
========================================================= */

function aiMarkup() {
  return `
    <div
      class="ai-sheet"
      id="aiSheet"
    >
      <div class="ai-sheet-header">
        <div>
          <div class="ai-sheet-title">
            iroom AI
          </div>

          <div class="ai-sheet-subtitle">
            Помогу с товарами и заказом
          </div>
        </div>

        <button
          type="button"
          class="ai-close"
          id="aiCloseButton"
          aria-label="Закрыть"
        >
          ×
        </button>
      </div>

      <div
        class="ai-messages"
        id="aiMessages"
      ></div>

      <div
        class="ai-quick"
        id="aiQuick"
      >
        <button
          type="button"
          data-ai-quick="Какие iPhone есть в наличии?"
        >
          Какие iPhone есть?
        </button>

        <button
          type="button"
          data-ai-quick="Помоги выбрать iPhone"
        >
          Помоги выбрать
        </button>

        <button
          type="button"
          data-ai-quick="Какие сейчас есть товары?"
        >
          Все товары
        </button>
      </div>

      <div class="ai-input-wrap">
        <textarea
          id="aiInput"
          rows="1"
          placeholder="Напишите сообщение..."
        ></textarea>

        <button
          type="button"
          id="aiSendButton"
          class="ai-send"
        >
          ↑
        </button>
      </div>
    </div>
  `;
}

function ensureAIModal() {
  let modal =
    $("#aiModal");

  if (modal) {
    return modal;
  }

  modal =
    document.createElement(
      "div"
    );

  modal.id =
    "aiModal";

  modal.className =
    "modal ai-modal";

  modal.setAttribute(
    "aria-hidden",
    "true"
  );

  modal.innerHTML =
    aiMarkup();

  document.body.appendChild(
    modal
  );

  $("#aiCloseButton")
    ?.addEventListener(
      "click",
      closeAI
    );

  $("#aiSendButton")
    ?.addEventListener(
      "click",
      sendAIMessage
    );

  $("#aiInput")
    ?.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
            "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          sendAIMessage();
        }
      }
    );

  $$(
    "[data-ai-quick]",
    modal
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          const input =
            $("#aiInput");

          if (input) {
            input.value =
              button.dataset
                .aiQuick ||
              "";

            input.focus();
          }
        }
      );
    }
  );

  return modal;
}

function openAI() {
  const modal =
    ensureAIModal();

  state.aiOpen =
    true;

  modal.classList.add(
    "open"
  );

  modal.setAttribute(
    "aria-hidden",
    "false"
  );

  renderAIMessages();

  setTimeout(
    () =>
      $("#aiInput")
        ?.focus(),
    50
  );
}

function closeAI() {
  const modal =
    $("#aiModal");

  state.aiOpen =
    false;

  if (!modal) {
    return;
  }

  modal.classList.remove(
    "open"
  );

  modal.setAttribute(
    "aria-hidden",
    "true"
  );
}

function renderAIMessages() {
  const container =
    $("#aiMessages");

  if (!container) {
    return;
  }

  if (!state.aiMessages.length) {
    container.innerHTML =
      `
        <div class="ai-welcome">
          <div class="ai-welcome-icon">
            ✦
          </div>

          <div class="ai-welcome-title">
            Привет! Я iroom AI
          </div>

          <div class="ai-welcome-text">
            Подскажу по товарам,
            ценам и помогу подобрать
            устройство.
          </div>
        </div>
      `;

    return;
  }

  container.innerHTML =
    state.aiMessages
      .map(
        message => `
          <div
            class="ai-message ${
              message.role ===
              "user"
                ? "user"
                : "assistant"
            }"
          >
            ${esc(
              message.content
            ).replace(
              /\n/g,
              "<br>"
            )}
          </div>
        `
      )
      .join("");

  if (
    state.aiLoading
  ) {
    container.innerHTML +=
      `
        <div class="ai-message assistant ai-loading-message">
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;
  }

  container.scrollTop =
    container.scrollHeight;
}

function setAILoading(
  loading
) {
  state.aiLoading =
    Boolean(
      loading
    );

  renderAIMessages();

  const button =
    $("#aiSendButton");

  if (button) {
    button.disabled =
      state.aiLoading;
  }
}

function appendAIMessage(
  role,
  content
) {
  state.aiMessages.push({
    role,
    content:
      String(
        content ?? ""
      )
  });

  renderAIMessages();
}

async function sendAIMessage(
  explicitMessage = ""
) {
  if (
    state.aiLoading
  ) {
    return;
  }

  const input =
    $("#aiInput");

  const text =
    String(
      explicitMessage ||
        input?.value ||
        ""
    ).trim();

  if (!text) {
    return;
  }

  if (input) {
    input.value =
      "";
  }

  appendAIMessage(
    "user",
    text
  );

  setAILoading(
    true
  );

  try {
    const data =
      await api(
        "/api/ai/chat",
        {
          method:
            "POST",
          body:
            JSON.stringify({
              message:
                text,
              history:
                state.aiMessages
                  .slice(
                    -12
                  )
                  .map(
                    message => ({
                      role:
                        message.role,
                      content:
                        message.content
                    })
                  )
            })
        }
      );

    if (
      data?.reply
    ) {
      appendAIMessage(
        "assistant",
        data.reply
      );
    } else {
      appendAIMessage(
        "assistant",
        "Не удалось получить ответ."
      );
    }

    if (
      data?.action_executed
    ) {
      await loadProducts();
      await loadCategories();

      if (
        state.route ===
        "catalog"
      ) {
        renderCatalog();
      }
    }
  } catch (
    error
  ) {
    console.error(
      "AI:",
      error
    );

    appendAIMessage(
      "assistant",
      error.message ||
        "Не удалось связаться с AI."
    );
  } finally {
    setAILoading(
      false
    );
  }
}
function renderHome() {
  const home =
    $("#homePage");

  if (!home) {
    return;
  }

  const newProducts =
    state.products.filter(
      product =>
        Number(
          product.is_new
        ) === 1
    );

  const products =
    newProducts.length
      ? newProducts
      : state.products.slice(
          0,
          8
        );

  const container =
    $("#homeProducts");

  if (container) {
    container.innerHTML =
      products
        .map(
          product => {
            const image =
              productImages(
                product
              )[0] ||
              "";

            return `
              <article
                class="product-card"
                data-product-id="${esc(
                  product.id
                )}"
              >
                <button
                  type="button"
                  class="product-card-media"
                  data-open-product="${esc(
                    product.id
                  )}"
                >
                  ${
                    image
                      ? `
                        <img
                          src="${esc(
                            image
                          )}"
                          alt="${esc(
                            product.name
                          )}"
                          loading="lazy"
                        >
                      `
                      : `
                        <div class="product-placeholder">
                          iroom
                        </div>
                      `
                  }

                  ${
                    product.is_new
                      ? `
                        <span class="product-badge">
                          NEW
                        </span>
                      `
                      : ""
                  }
                </button>

                <div class="product-card-body">
                  <button
                    type="button"
                    class="product-card-name"
                    data-open-product="${esc(
                      product.id
                    )}"
                  >
                    ${esc(
                      product.name
                    )}
                  </button>

                  <div class="product-card-bottom">
                    <strong class="product-price">
                      ${formatPrice(
                        productPrice(
                          product
                        )
                      )}
                    </strong>

                    <button
                      type="button"
                      class="product-add-button"
                      data-add-product="${esc(
                        product.id
                      )}"
                    >
                      +
                    </button>
                  </div>
                </div>
              </article>
            `;
          }
        )
        .join("");

    $$(
      "[data-open-product]",
      container
    ).forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            openProduct(
              button.dataset
                .openProduct
            );
          }
        );
      }
    );

    $$(
      "[data-add-product]",
      container
    ).forEach(
      button => {
        button.addEventListener(
          "click",
          event => {
            event.stopPropagation();

            const product =
              getProductById(
                button.dataset
                  .addProduct
              );

            if (
              product
            ) {
              addToCart(
                product,
                {}
              );
            }
          }
        );
      }
    );
  }

  const categories =
    $("#homeCategories");

  if (
    categories
  ) {
    categories.innerHTML =
      state.categories
        .slice(
          0,
          8
        )
        .map(
          category => `
            <button
              type="button"
              class="category-card"
              data-category-id="${esc(
                category.id
              )}"
            >
              ${
                category.image_url
                  ? `
                    <img
                      src="${esc(
                        category.image_url
                      )}"
                      alt="${esc(
                        category.name
                      )}"
                    >
                  `
                  : `
                    <div class="category-placeholder">
                      ${esc(
                        String(
                          category.name ||
                            "?"
                        ).slice(
                          0,
                          1
                        )
                      )}
                    </div>
                  `
              }

              <span>
                ${esc(
                  category.name
                )}
              </span>
            </button>
          `
        )
        .join("");

    $$(
      "[data-category-id]",
      categories
    ).forEach(
      button => {
        button.addEventListener(
          "click",
          () => {
            openCategory(
              button.dataset
                .categoryId
            );
          }
        );
      }
    );
  }
}

function renderProfile() {
  const container =
    $("#profilePage");

  if (!container) {
    return;
  }

  const user =
    state.user;

  const name =
    [
      user?.first_name,
      user?.last_name
    ]
      .filter(Boolean)
      .join(" ") ||
    user?.username ||
    "Пользователь";

  container.innerHTML =
    `
      <div class="profile-card">
        <div class="profile-avatar">
          ${
            user?.photo_url
              ? `
                <img
                  src="${esc(
                    user.photo_url
                  )}"
                  alt=""
                >
              `
              : esc(
                  name
                    .slice(
                      0,
                      1
                    )
                    .toUpperCase()
                )
          }
        </div>

        <div class="profile-name">
          ${esc(
            name
          )}
        </div>

        ${
          user?.username
            ? `
              <div class="profile-username">
                @${esc(
                  user.username
                )}
              </div>
            `
            : ""
        }

        ${
          isAdmin()
            ? `
              <div class="profile-admin-badge">
                Администратор
              </div>
            `
            : ""
        }
      </div>

      <div class="profile-actions">
        <button
          type="button"
          class="profile-action"
          data-profile-route="orders"
        >
          <span>
            📦
          </span>

          <span>
            Мои заказы
          </span>

          <b>
            →
          </b>
        </button>

        ${
          isAdmin()
            ? `
              <button
                type="button"
                class="profile-action"
                id="profileAdminButton"
              >
                <span>
                  ⚙️
                </span>

                <span>
                  Админ-панель
                </span>

                <b>
                  →
                </b>
              </button>
            `
            : ""
        }
      </div>
    `;

  $$(
    "[data-profile-route]",
    container
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () =>
          openRoute(
            button.dataset
              .profileRoute
          )
      );
    }
  );

  $("#profileAdminButton")
    ?.addEventListener(
      "click",
      openAdmin
    );
}

function render() {
  renderHeader();

  const pages = [
    "homePage",
    "catalogPage",
    "productPage",
    "cartPage",
    "ordersPage",
    "orderPage",
    "profilePage"
  ];

  pages.forEach(
    id => {
      const element =
        $(`#${id}`);

      if (!element) {
        return;
      }

      const route =
        id.replace(
          "Page",
          ""
        );

      element.classList.toggle(
        "active",
        route ===
          state.route
      );
    }
  );

  switch (
    state.route
  ) {
    case "home":
      renderHome();
      break;

    case "catalog":
      renderCatalog();
      break;

    case "product":
      renderProduct();
      break;

    case "cart":
      renderCart();
      break;

    case "orders":
      renderOrders();
      break;

    case "order":
      renderOrder();
      break;

    case "profile":
      renderProfile();
      break;
  }

  updateCartBadge();
}

function openAdmin() {
  if (!isAdmin()) {
    toast(
      "Нет доступа"
    );
    return;
  }

  const url =
    "/admin.html";

  try {
    if (
      tg?.openLink
    ) {
      tg.openLink(
        url
      );
    } else {
      window.location.href =
        url;
    }
  } catch {
    window.location.href =
      url;
  }
}

/* =========================================================
   SEARCH
========================================================= */

function setupSearch() {
  const input =
    $("#searchInput");

  if (!input) {
    return;
  }

  input.value =
    state.search;

  input.addEventListener(
    "input",
    () => {
      state.search =
        input.value ||
        "";

      if (
        state.route !==
        "catalog"
      ) {
        state.route =
          "catalog";
      }

      renderCatalog();
      renderHeader();
    }
  );
}

/* =========================================================
   NAVIGATION
========================================================= */

function setupNavigation() {
  $("#menuButton")
    ?.addEventListener(
      "click",
      openDrawer
    );

  $("#closeDrawer")
    ?.addEventListener(
      "click",
      closeDrawer
    );

  $("#drawerOverlay")
    ?.addEventListener(
      "click",
      closeDrawer
    );

  $$(
    "[data-route]"
  ).forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          openRoute(
            button.dataset
              .route
          );
        }
      );
    }
  );

  $("#homeButton")
    ?.addEventListener(
      "click",
      () =>
        openRoute(
          "home"
        )
    );

  $("#catalogButton")
    ?.addEventListener(
      "click",
      () =>
        openRoute(
          "catalog"
        )
    );

  $("#cartButton")
    ?.addEventListener(
      "click",
      () =>
        openRoute(
          "cart"
        )
    );

  $("#ordersButton")
    ?.addEventListener(
      "click",
      () =>
        openRoute(
          "orders"
        )
    );

  $("#profileButton")
    ?.addEventListener(
      "click",
      () =>
        openRoute(
          "profile"
        )
    );

  $("#aiButton")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();
        event.stopPropagation();
        openAI();
      }
    );

  $("#adminLink")
    ?.addEventListener(
      "click",
      event => {
        event.preventDefault();

        if (
          isAdmin()
        ) {
          openAdmin();
        } else {
          toast(
            "Нет доступа"
          );
        }
      }
    );
}

/* =========================================================
   TELEGRAM
========================================================= */

function initTelegram() {
  if (!tg) {
    return;
  }

  try {
    tg.ready();

    tg.expand();

    if (
      tg.setHeaderColor
    ) {
      tg.setHeaderColor(
        "#080808"
      );
    }

    if (
      tg.setBackgroundColor
    ) {
      tg.setBackgroundColor(
        "#080808"
      );
    }

    if (
      tg.enableClosingConfirmation
    ) {
      tg.enableClosingConfirmation();
    }
  } catch {}
}

/* =========================================================
   ADMIN LINK
========================================================= */

function updateAdminLink() {
  const link =
    $("#adminLink");

  if (!link) {
    return;
  }

  const visible =
    isAdmin();

  link.classList.toggle(
    "hidden",
    !visible
  );

  link.style.display =
    visible
      ? ""
      : "none";
}

/* =========================================================
   INITIALIZATION
========================================================= */

async function initApp() {
  initTelegram();

  loadCart();

  updateAdminLink();

  setupNavigation();

  setupSearch();

  try {
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadMe(),
      loadStoreConfig()
    ]);
  } catch (
    error
  ) {
    console.error(
      "INIT:",
      error
    );

    toast(
      "Не удалось загрузить каталог"
    );
  }

  updateAdminLink();

  render();
}

/* =========================================================
   GLOBAL EVENTS
========================================================= */

document.addEventListener(
  "click",
  event => {
    const target =
      event.target;

    if (
      target?.matches(
        ".modal"
      )
    ) {
      target.classList.remove(
        "open"
      );

      target.setAttribute(
        "aria-hidden",
        "true"
      );
    }
  }
);

window.addEventListener(
  "popstate",
  () => {
    render();
  }
);

window.addEventListener(
  "storage",
  event => {
    if (
      event.key ===
      "iroom_cart"
    ) {
      loadCart();
      render();
    }
  }
);

/* =========================================================
   START
========================================================= */

if (
  document.readyState ===
  "loading"
) {
  document.addEventListener(
    "DOMContentLoaded",
    initApp
  );
} else {
  initApp();
}