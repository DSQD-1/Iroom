function bindDynamicEvents() {
  const screen = $("#screen");

  if (!screen) return;

  /*
     Все динамические кнопки обрабатываются через один
     обработчик. После render() старые обработчики больше
     не теряются.
  */
  if (screen.__iroomClickBound) return;

  screen.__iroomClickBound = true;

  screen.addEventListener("click", (event) => {
    const target =
      event.target instanceof Element
        ? event.target
        : null;

    if (!target) return;

    const actionElement =
      target.closest("[data-action]");

    if (
      actionElement &&
      screen.contains(actionElement)
    ) {
      event.preventDefault();
      event.stopPropagation();

      handleAction(
        actionElement.dataset.action
      );

      return;
    }

    const fulfillment =
      target.closest("[data-fulfillment]");

    if (
      fulfillment &&
      screen.contains(fulfillment)
    ) {
      event.preventDefault();
      event.stopPropagation();

      state.checkout.fulfillment =
        fulfillment.dataset.fulfillment ||
        "pickup";

      render();

      return;
    }

    const pickup =
      target.closest("[data-pickup-id]");

    if (
      pickup &&
      screen.contains(pickup)
    ) {
      event.preventDefault();
      event.stopPropagation();

      state.checkout.pickupPointId =
        pickup.dataset.pickupId || "";

      state.checkout.fulfillment =
        "pickup";

      render();

      return;
    }

    const option =
      target.closest("[data-option-key]");

    if (
      option &&
      screen.contains(option)
    ) {
      event.preventDefault();
      event.stopPropagation();

      state.selectedOptions[
        option.dataset.optionKey
      ] =
        option.dataset.optionValue || "";

      renderProduct($("#screen"));

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });

      return;
    }

    const minus =
      target.closest("[data-cart-minus]");

    if (
      minus &&
      screen.contains(minus)
    ) {
      event.preventDefault();
      event.stopPropagation();

      changeQuantity(
        minus.dataset.cartMinus,
        -1
      );

      return;
    }

    const plus =
      target.closest("[data-cart-plus]");

    if (
      plus &&
      screen.contains(plus)
    ) {
      event.preventDefault();
      event.stopPropagation();

      changeQuantity(
        plus.dataset.cartPlus,
        1
      );

      return;
    }

    const remove =
      target.closest("[data-cart-delete]");

    if (
      remove &&
      screen.contains(remove)
    ) {
      event.preventDefault();
      event.stopPropagation();

      removeCartItem(
        remove.dataset.cartDelete
      );

      return;
    }

    const reservation =
      target.closest(
        "[data-reservation-paid]"
      );

    if (
      reservation &&
      screen.contains(reservation)
    ) {
      event.preventDefault();
      event.stopPropagation();

      reservationPaid(
        reservation.dataset
          .reservationPaid
      );

      return;
    }

    const category =
      target.closest("[data-category]");

    if (
      category &&
      screen.contains(category)
    ) {
      event.preventDefault();
      event.stopPropagation();

      navigate(
        "catalog",
        {
          categoryId:
            category.dataset.category ||
            null
        }
      );

      return;
    }

    const order =
      target.closest("[data-order-id]");

    if (
      order &&
      screen.contains(order)
    ) {
      event.preventDefault();
      event.stopPropagation();

      openOrder(
        order.dataset.orderId
      );

      return;
    }

    const product =
      target.closest("[data-product-id]");

    if (
      product &&
      screen.contains(product)
    ) {
      event.preventDefault();
      event.stopPropagation();

      openProduct(
        product.dataset.productId
      );
    }
  });

  $("#promoButton")?.addEventListener(
    "click",
    applyPromo
  );
}