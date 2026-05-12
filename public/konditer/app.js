const orderForm = document.getElementById("order-form");
const orderStatus = document.getElementById("order-status");

if (orderForm && orderStatus) {
  orderForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = document.getElementById("order-name")?.value.trim() || "";
    const contact = document.getElementById("order-contact")?.value.trim() || "";
    const date = document.getElementById("order-date")?.value || "";
    const type = document.getElementById("order-type")?.value || "";
    const notes = document.getElementById("order-notes")?.value.trim() || "";

    const subject = `Заявка на десерт: ${type}`;
    const body = [
      `Имя: ${name}`,
      `Контакт: ${contact}`,
      `Дата события: ${date || "не указана"}`,
      `Формат заказа: ${type}`,
      `Пожелания: ${notes || "не указаны"}`,
    ].join("\n");

    window.location.href =
      `mailto:hello@ateliermila.ru?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    orderStatus.textContent = "Черновик письма открыт. Проверьте детали и отправьте заявку.";
  });
}
