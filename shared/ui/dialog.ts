import "./dialog.css";

type DialogOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  email?: boolean;
  onConfirm: (value: string) => void | Promise<void>;
  onError: (error: unknown) => void;
};

// Shared by web and mobile; modal dialogs keep focus inside and support Escape.
export function showSystemDialog(options: DialogOptions) {
  if (document.querySelector("dialog.app-system-dialog")) return;
  const dialog = document.createElement("dialog");
  dialog.className = "app-system-dialog";
  dialog.setAttribute("aria-labelledby", "app-system-dialog-title");
  dialog.setAttribute("aria-describedby", "app-system-dialog-description");
  dialog.innerHTML = `
    <form class="app-system-dialog-form">
      <header><div><span class="app-system-dialog-eyebrow">CAMAROTE SHOWS</span><h2 id="app-system-dialog-title"></h2></div><button type="button" class="app-system-dialog-close" aria-label="Fechar">×</button></header>
      <div class="app-system-dialog-body"><p id="app-system-dialog-description"></p></div>
      <footer><button type="button" class="app-system-dialog-cancel">Cancelar</button><button type="submit" class="app-system-dialog-submit"></button></footer>
    </form>`;
  dialog.querySelector("h2")!.textContent = options.title;
  dialog.querySelector("p")!.textContent = options.message;
  const form = dialog.querySelector("form")!;
  const submit = dialog.querySelector<HTMLButtonElement>(".app-system-dialog-submit")!;
  submit.textContent = options.confirmLabel ?? "Confirmar";
  let input: HTMLInputElement | undefined;
  if (options.email) {
    const label = document.createElement("label");
    label.textContent = "E-mail do cadastro";
    input = document.createElement("input");
    input.type = "email";
    input.name = "email";
    input.autocomplete = "email";
    input.placeholder = "seu@email.com";
    input.required = true;
    input.autofocus = true;
    label.append(input);
    dialog.querySelector(".app-system-dialog-body")!.append(label);
  } else {
    dialog.querySelector<HTMLButtonElement>(".app-system-dialog-cancel")!.autofocus = true;
  }
  let pending = false;
  const close = () => { if (!pending) dialog.close(); };
  dialog.querySelector(".app-system-dialog-cancel")!.addEventListener("click", close);
  dialog.querySelector(".app-system-dialog-close")!.addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  } });
  dialog.addEventListener("cancel", (event) => { if (pending) event.preventDefault(); });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    dialog.setAttribute("aria-busy", "true");
    const buttons = dialog.querySelectorAll("button");
    buttons.forEach((button) => { button.disabled = true; });
    if (input) input.readOnly = true;
    submit.textContent = "Aguarde…";
    try {
      await options.onConfirm(input?.value.trim() ?? "");
      dialog.close();
    } catch (error) {
      dialog.close();
      options.onError(error);
    } finally {
      pending = false;
      dialog.removeAttribute("aria-busy");
      buttons.forEach((button) => { button.disabled = false; });
      if (input) input.readOnly = false;
      submit.textContent = options.confirmLabel ?? "Confirmar";
    }
  });
  document.body.append(dialog);
  dialog.showModal();
}
