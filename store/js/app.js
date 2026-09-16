(() => {
  const CONFIG = {
    publicToken: "ti29-45ff1ef831c85c765f3d033de1ffa13f7c6c462b",
    apiRoot: "https://headless.tebex.io/api",
    website: "https://www.arcturusmc.org",
    server: "play.arcturusmc.org",
    discord: "https://discord.gg/DTR6serkeM",
    discordId: "1127553089533120562",
    completePath: "/store/?checkout=complete",
    cancelPath: "/store/",
    storageKey: "arcturus.tebex.basket",
  };

  const accountApi = `${CONFIG.apiRoot}/accounts/${CONFIG.publicToken}`;

  const state = {
    store: null,
    categories: [],
    packagesById: new Map(),
    basket: null,
    pendingPackageId: null,
    view: "home",
    categoryId: null,
  };

  const els = {};

  function $(selector, root = document) {
    return root.querySelector(selector);
  }

  function money(value, currency = "USD") {
    const amount = Number(value || 0);
    return `${amount.toFixed(2)} ${currency}`;
  }

  function truncate(text, length) {
    const value = String(text || "");
    return value.length > length ? `${value.slice(0, length)}` : value;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function completeUrl() {
    return `${window.location.origin}${CONFIG.completePath}`;
  }

  function cancelUrl() {
    return `${window.location.origin}${CONFIG.cancelPath}`;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    let payload = null;
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }
    if (!response.ok) {
      const detail =
        payload?.error_details ||
        payload?.detail ||
        payload?.message ||
        payload?.title ||
        `Request failed (${response.status})`;
      const error = new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function showAlert(message, type = "success") {
    const box = els.alert;
    if (!box) return;
    box.className = `alert alert--${type} is-visible`;
    box.innerHTML = `<span>${escapeHtml(message)}</span>`;
    window.clearTimeout(showAlert.timer);
    showAlert.timer = window.setTimeout(() => {
      box.classList.remove("is-visible");
    }, 5000);
  }

  function setBusy(busy) {
    document.body.classList.toggle("is-busy", Boolean(busy));
  }

  function parseRoute() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "complete") {
      return { view: "complete" };
    }
    if (params.has("login")) {
      return { view: "login" };
    }
    if (params.get("category")) {
      return { view: "category", categoryId: Number(params.get("category")) };
    }
    return { view: "home" };
  }

  function setRoute(next, replace = false) {
    const url = new URL(window.location.href);
    url.search = "";
    if (next.view === "login") url.searchParams.set("login", "1");
    if (next.view === "category" && next.categoryId) {
      url.searchParams.set("category", String(next.categoryId));
    }
    if (next.view === "complete") url.searchParams.set("checkout", "complete");
    if (replace) {
      history.replaceState(next, "", url);
    } else {
      history.pushState(next, "", url);
    }
    state.view = next.view;
    state.categoryId = next.categoryId || null;
    render();
  }

  function basketPackages() {
    return state.basket?.packages || [];
  }

  function basketCount() {
    return basketPackages().reduce((sum, item) => sum + Number(item.in_basket?.quantity || item.quantity || 1), 0);
  }

  function packageInBasket(packageId) {
    return basketPackages().find((item) => Number(item.id) === Number(packageId));
  }

  function packageQuantity(packageId) {
    const found = packageInBasket(packageId);
    return Number(found?.in_basket?.quantity || found?.quantity || 0);
  }

  function manageMenu(action, name) {
    const target = [...document.querySelectorAll(".menuWrapper")].find((node) => node.dataset.toggle === name);
    if (!target) return;
    if (action === "open") target.classList.add("menuWrapper--open");
    else target.classList.remove("menuWrapper--open");
  }

  function toggleDropdown(name) {
    const target = [...document.querySelectorAll(".dropdownMenu")].find((node) => node.dataset.toggle === name);
    if (target) target.classList.toggle("dropdownMenu--open");
  }

  function bindCursorAura() {
    document.querySelectorAll(".cursorAura").forEach((button) => {
      button.addEventListener("mousemove", (event) => {
        const { x, y } = button.getBoundingClientRect();
        button.style.setProperty("--x", event.clientX - x);
        button.style.setProperty("--y", event.clientY - y);
      });
    });
  }

  function popupDisplay(show) {
    els.popup.style.display = show ? "block" : "none";
    els.popupBack.style.display = show ? "block" : "none";
  }

  function fallbackCopy(text) {
    const field = document.createElement("textarea");
    field.value = text;
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    document.body.appendChild(field);
    field.focus();
    field.select();
    document.execCommand("copy");
    document.body.removeChild(field);
  }

  function copyText(text) {
    if (!navigator.clipboard) {
      fallbackCopy(text);
      return;
    }
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }

  async function loadCatalog() {
    const [storeRes, catalogRes] = await Promise.all([
      api(accountApi),
      api(`${accountApi}/categories?includePackages=1`),
    ]);
    state.store = storeRes.data || storeRes;
    state.categories = (catalogRes.data || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    state.packagesById.clear();
    for (const category of state.categories) {
      for (const pkg of category.packages || []) {
        state.packagesById.set(Number(pkg.id), { ...pkg, category });
      }
    }
  }

  async function loadBasket(ident = localStorage.getItem(CONFIG.storageKey)) {
    if (!ident) {
      state.basket = null;
      return;
    }
    try {
      let payload;
      try {
        payload = await api(`${accountApi}/baskets/${ident}`);
      } catch (error) {
        if (error.status !== 404) throw error;
        payload = await api(`${CONFIG.apiRoot}/baskets/${ident}`);
      }
      state.basket = payload.data || payload;
      if (state.basket?.ident) localStorage.setItem(CONFIG.storageKey, state.basket.ident);
    } catch {
      localStorage.removeItem(CONFIG.storageKey);
      state.basket = null;
    }
  }

  async function createBasket(username) {
    const payload = await api(`${accountApi}/baskets`, {
      method: "POST",
      body: JSON.stringify({
        username,
        complete_url: completeUrl(),
        cancel_url: cancelUrl(),
        complete_auto_redirect: true,
      }),
    });
    state.basket = payload.data || payload;
    if (!state.basket?.ident) throw new Error("Tebex did not return a basket.");
    localStorage.setItem(CONFIG.storageKey, state.basket.ident);
    return state.basket;
  }

  async function refreshBasket() {
    if (!state.basket?.ident) return;
    await loadBasket(state.basket.ident);
  }

  async function addPackage(packageId, extra = {}) {
    if (!state.basket?.ident) {
      state.pendingPackageId = packageId;
      setRoute({ view: "login" });
      return;
    }
    setBusy(true);
    try {
      const payload = await api(`${CONFIG.apiRoot}/baskets/${state.basket.ident}/packages`, {
        method: "POST",
        body: JSON.stringify({
          package_id: Number(packageId),
          quantity: extra.quantity || 1,
          ...(extra.gift_username ? { gift_username: extra.gift_username } : {}),
        }),
      });
      state.basket = payload.data || payload;
      if (!state.basket?.packages) await refreshBasket();
      showAlert("Added to cart.");
      render();
      manageMenu("open", "basket");
    } catch (error) {
      showAlert(error.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function removePackage(packageId) {
    if (!state.basket?.ident) return;
    setBusy(true);
    try {
      let payload;
      try {
        payload = await api(`${CONFIG.apiRoot}/baskets/${state.basket.ident}/packages/remove`, {
          method: "POST",
          body: JSON.stringify({ package_id: Number(packageId) }),
        });
      } catch {
        payload = await api(`${accountApi}/baskets/${state.basket.ident}/packages/remove`, {
          method: "POST",
          body: JSON.stringify({ package_id: Number(packageId) }),
        });
      }
      state.basket = payload.data || payload;
      if (!state.basket?.packages) await refreshBasket();
      render();
    } catch (error) {
      showAlert(error.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  async function setQuantity(packageId, quantity) {
    if (quantity < 1) {
      await removePackage(packageId);
      return;
    }
    if (!state.basket?.ident) return;
    setBusy(true);
    try {
      let payload;
      try {
        payload = await api(`${CONFIG.apiRoot}/baskets/${state.basket.ident}/packages/${packageId}`, {
          method: "PUT",
          body: JSON.stringify({ quantity }),
        });
      } catch {
        payload = await api(`${CONFIG.apiRoot}/baskets/${state.basket.ident}/packages`, {
          method: "POST",
          body: JSON.stringify({ package_id: Number(packageId), quantity }),
        });
      }
      state.basket = payload.data || payload;
      if (!state.basket?.packages) await refreshBasket();
      render();
    } catch (error) {
      showAlert(error.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  function checkout() {
    const url = state.basket?.links?.checkout;
    if (!url) {
      showAlert("Add an item before checking out.", "danger");
      return;
    }
    window.location.href = url;
  }

  function logout() {
    localStorage.removeItem(CONFIG.storageKey);
    state.basket = null;
    manageMenu("close", "basket");
    render();
    showAlert("Logged out of the store.");
  }

  function openPackageModal(packageId) {
    const pkg = state.packagesById.get(Number(packageId));
    if (!pkg) return;
    const inBasket = Boolean(packageInBasket(pkg.id));
    els.modal.innerHTML = `
      <div class="modalWrapper">
        <div class="modal__header">
          <h2>${escapeHtml(pkg.name)}</h2>
          <button type="button" class="iconBoxed iconBoxed--rounded btn--dark cursorAura cursorAura--dim" data-close-modal>
            <i class="fas fa-times"></i>
          </button>
        </div>
        ${pkg.description ? `<div class="modal__body markup__body">${pkg.description}</div>` : ""}
        <div class="modal__footer">
          <div class="modal__price">
            <h3>${money(pkg.total_price ?? pkg.base_price, pkg.currency || state.store?.currency)}</h3>
            <div class="modal__buttons">
              ${
                pkg.disable_gifting
                  ? ""
                  : `<button class="btn btn--dark btn--gift cursorAura cursorAura--dim" data-collapse="gift">Gift<i class="fas fa-chevron-down"></i></button>`
              }
              ${
                inBasket
                  ? `<button class="btn btn--danger cursorAura" data-remove="${pkg.id}">Remove</button>`
                  : `<button class="btn btn--primary cursorAura" data-add="${pkg.id}">Purchase</button>`
              }
            </div>
          </div>
          ${
            pkg.disable_gifting
              ? ""
              : `<div class="modal__gift collapsible" data-collapsible="gift">
                  <form data-gift-form="${pkg.id}">
                    <input type="text" name="username" placeholder="Enter a username to gift this package to" required />
                    <button type="submit" class="btn btn--accent cursorAura"><i class="fas fa-gift"></i>Gift</button>
                  </form>
                </div>`
          }
        </div>
      </div>`;
    els.modal.classList.add("modal--open");
    bindCursorAura();
  }

  function closeModal() {
    els.modal.classList.remove("modal--open");
    els.modal.innerHTML = "";
  }

  function renderNav() {
    const activeCategory = state.view === "category" ? Number(state.categoryId) : null;
    const items = state.categories
      .map((category) => {
        const active = activeCategory === Number(category.id) ? "active" : "";
        return `<li class="${active}"><a href="/store/?category=${category.id}" data-route="category" data-category="${category.id}">${escapeHtml(category.name)}</a></li>`;
      })
      .join("");
    els.navCategories.innerHTML = `
      <button class="header__closeMobileNav iconBoxed iconBoxed--rounded btn--dark cursorAura cursorAura--dim" data-close-nav>
        <i class="fas fa-chevron-right"></i>
      </button>
      <li class="${state.view === "home" || state.view === "complete" ? "active" : ""}"><a href="/store/" data-route="home">Home</a></li>
      ${items}
      <div>${renderCartButton()}</div>`;
  }

  function renderCartButton() {
    if (state.basket?.username) {
      const count = basketCount();
      const total = money(state.basket.total_price ?? state.basket.base_price, state.basket.currency);
      return `
        <button class="header__cart header__cart--primary cursorAura" data-open-basket>
          <div class="cart__info">
            <h2><i class="fas fa-shopping-cart"></i>View Cart</h2>
            <p>${count > 0 ? `${count} item${count === 1 ? "" : "s"} - ${total}` : "No items in cart!"}</p>
          </div>
          <div class="cart__player"><img src="https://mc-heads.net/body/${encodeURIComponent(state.basket.username)}/left" class="unselectable" alt="" /></div>
        </button>`;
    }
    return `
      <button class="header__cart cursorAura cursorAura--dim" data-route="login">
        <div class="cart__info">
          <h2><i class="fas fa-shopping-cart"></i>Login</h2>
          <p>Start shopping!</p>
        </div>
      </button>`;
  }

  function renderBasket() {
    const currency = state.basket?.currency || state.store?.currency || "USD";
    const items = basketPackages();
    const username = state.basket?.username || "";
    els.basketUsername.textContent = username || "Guest";
    els.basketSummary.textContent = items.length
      ? `${basketCount()} item${basketCount() === 1 ? "" : "s"} for ${money(state.basket.total_price, currency)}`
      : "No items in cart!";
    els.basketTotal.textContent = money(state.basket?.total_price || 0, currency);
    els.basketPlayer.src = username
      ? `https://mc-heads.net/body/${encodeURIComponent(username)}/left`
      : "";
    els.basketItems.innerHTML = items
      .map((pkg) => {
        const qty = Number(pkg.in_basket?.quantity || pkg.quantity || 1);
        const price = pkg.in_basket?.price ?? pkg.total_price ?? pkg.base_price;
        return `
          <div class="package">
            <div class="package__info">
              <h3>${escapeHtml(truncate(pkg.name, 25))}</h3>
              <span class="tag tag--left tag--700">${escapeHtml(money(price, currency))}</span>
            </div>
            <div class="package__buttons">
              <span>Quantity:</span>
              <button class="iconBoxed iconBoxed--rounded package__infoModal cursorAura cursorAura--dim" data-info="${pkg.id}"><i class="fas fa-info"></i></button>
              <button class="iconBoxed iconBoxed--rounded package__remove cursorAura" data-qty="${pkg.id}" data-next="${qty - 1}"><i class="fas fa-minus"></i></button>
              <input type="text" class="package__quantity" value="${qty}" readonly maxlength="3" />
              <button class="iconBoxed iconBoxed--rounded package__add cursorAura" data-qty="${pkg.id}" data-next="${qty + 1}"><i class="fas fa-plus"></i></button>
            </div>
          </div>`;
      })
      .join("");
  }

  function renderPackageCard(pkg, displayType) {
    const currency = pkg.currency || state.store?.currency || "USD";
    const inBasket = packageInBasket(pkg.id);
    const qty = packageQuantity(pkg.id);
    const image = pkg.image
      ? `<div class="package__image"><a href="#" data-info="${pkg.id}"><img src="${escapeHtml(pkg.image)}" alt="${escapeHtml(pkg.name)}" /></a></div>`
      : `<div class="package__image"><a href="#" data-info="${pkg.id}" class="package__placeholder">${escapeHtml(pkg.name)}</a></div>`;
    const buttons = inBasket
      ? `<div class="package__buttons">
           <button class="iconBoxed iconBoxed--rounded package__remove cursorAura" data-qty="${pkg.id}" data-next="${qty - 1}"><i class="fas fa-minus"></i></button>
           <input type="text" class="package__quantity" value="${qty}" readonly maxlength="3" />
           <button class="iconBoxed iconBoxed--rounded package__add cursorAura" data-qty="${pkg.id}" data-next="${qty + 1}"><i class="fas fa-plus"></i></button>
         </div>`
      : `<div class="package__buttons package__buttons--outBasket">
           <button class="iconBoxed iconBoxed--rounded package__infoModal toggle-modal cursorAura cursorAura--dim" data-info="${pkg.id}"><i class="fas fa-info"></i></button>
           <button class="btn btn--primary cursorAura" data-add="${pkg.id}">Add to Cart</button>
         </div>`;

    if (displayType === "list") {
      return `
        <div class="package">
          <div class="package__info">
            <h3>${escapeHtml(truncate(pkg.name, 25))}</h3>
            <div class="package__tags">
              <span class="tag tag--left tag--700">${escapeHtml(money(pkg.total_price ?? pkg.base_price, currency))}</span>
            </div>
          </div>
          ${buttons}
        </div>`;
    }

    return `
      <div class="package">
        ${image}
        <div class="package__info">
          <h2>${escapeHtml(truncate(pkg.name, 20))}</h2>
          <h3>${escapeHtml(money(pkg.total_price ?? pkg.base_price, currency))}</h3>
        </div>
        ${buttons}
      </div>`;
  }

  function renderCategory(category) {
    const displayType = category.display_type === "list" ? "list" : "images";
    const packages = (category.packages || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const cards = packages.length
      ? packages.map((pkg) => renderPackageCard(pkg, displayType)).join("")
      : `<p>No packages to display in this category.</p>`;
    return `
      <div class="panel category-block">
        <div class="panel__heading"><h1>${escapeHtml(category.name)}</h1></div>
        <div class="panel__body">
          ${category.description ? `<div class="panel__description markup__body">${category.description}</div>` : ""}
          <div class="category category--${displayType}">${cards}</div>
        </div>
      </div>`;
  }

  function renderMain() {
    if (state.view === "login") {
      els.content.innerHTML = `
        <div class="panel">
          <div class="panel__heading"><h1>Login</h1></div>
          <div class="panel__body">
            <p style="padding-bottom:1rem">Enter the Minecraft username that should receive this purchase.</p>
            <form class="username" data-login-form>
              <input type="text" name="ign" class="input--900" placeholder="Enter your username" required autocomplete="username" />
              <button class="btn btn--primary cursorAura" type="submit">Login</button>
            </form>
          </div>
        </div>`;
      return;
    }

    if (state.view === "complete") {
      els.content.innerHTML = `
        <div class="panel">
          <div class="panel__heading"><h1>Thank you</h1></div>
          <div class="panel__body markup__body">
            <p>Your checkout is complete. Commands are delivered to the Minecraft username you used at login.</p>
            <p><a href="/store/" data-route="home">Return to the store</a></p>
          </div>
        </div>`;
      return;
    }

    if (state.view === "category") {
      const category = state.categories.find((item) => Number(item.id) === Number(state.categoryId));
      els.content.innerHTML = category
        ? renderCategory(category)
        : `<div class="panel"><div class="panel__heading"><h1>Category not found</h1></div></div>`;
      return;
    }

    const intro = state.store?.description || "<p>Welcome to the Arcturus store.</p>";
    const sections = state.categories.map((category) => renderCategory(category)).join("");
    els.content.innerHTML = `
      <div class="panel">
        <div class="panel__heading"><h1>${escapeHtml(state.store?.name || "Arcturus Factions")}</h1></div>
        <div class="panel__body markup__body">${intro}</div>
      </div>
      ${sections}`;
  }

  function renderSidebar() {
    els.sidebar.innerHTML = `
      <aside class="module">
        <div class="module__heading"><h2>Server</h2></div>
        <div class="module__body store-status">
          <p><strong>IP</strong><br>${escapeHtml(CONFIG.server)}</p>
          <p>Supports 1.8+ Java and Bedrock. Cracked clients are welcome.</p>
        </div>
      </aside>
      <aside class="module">
        <div class="module__heading"><h2>Need help?</h2></div>
        <div class="module__body store-status">
          <p>Open a ticket on Discord if a package does not deliver.</p>
          <p><a href="${CONFIG.discord}" target="_blank" rel="noopener">Join Discord</a></p>
        </div>
      </aside>`;
  }

  function renderHeaderMeta() {
    const name = state.store?.name || "Arcturus Factions";
    document.title = `${name} | Store`;
    if (state.store?.logo) {
      els.logoImg.src = state.store.logo;
      els.logoBlur.src = state.store.logo;
      els.popupLogo.src = state.store.logo;
    }
  }

  function render() {
    renderHeaderMeta();
    renderNav();
    renderSidebar();
    renderMain();
    renderBasket();
    bindCursorAura();
  }

  async function handleLogin(username) {
    setBusy(true);
    try {
      await createBasket(username.trim());
      const pending = state.pendingPackageId;
      state.pendingPackageId = null;
      if (pending) {
        await addPackage(pending);
      } else {
        showAlert(`Logged in as ${username.trim()}.`);
        setRoute({ view: "home" }, true);
      }
      if (pending) setRoute({ view: "home" }, true);
    } catch (error) {
      showAlert(error.message, "danger");
    } finally {
      setBusy(false);
    }
  }

  function onClick(event) {
    const closeModalBtn = event.target.closest("[data-close-modal]");
    if (closeModalBtn) {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.target === els.modal) {
      closeModal();
      return;
    }

    const collapse = event.target.closest("[data-collapse]");
    if (collapse) {
      event.preventDefault();
      const name = collapse.getAttribute("data-collapse");
      const panel = document.querySelector(`[data-collapsible="${name}"]`);
      if (panel) panel.classList.toggle("collapsible--open");
      return;
    }

    const info = event.target.closest("[data-info]");
    if (info) {
      event.preventDefault();
      openPackageModal(info.getAttribute("data-info"));
      return;
    }

    const add = event.target.closest("[data-add]");
    if (add) {
      event.preventDefault();
      addPackage(add.getAttribute("data-add"));
      return;
    }

    const remove = event.target.closest("[data-remove]");
    if (remove) {
      event.preventDefault();
      removePackage(remove.getAttribute("data-remove"));
      closeModal();
      return;
    }

    const qty = event.target.closest("[data-qty]");
    if (qty) {
      event.preventDefault();
      setQuantity(qty.getAttribute("data-qty"), Number(qty.getAttribute("data-next")));
      return;
    }

    const route = event.target.closest("[data-route]");
    if (route) {
      event.preventDefault();
      const view = route.getAttribute("data-route");
      if (view === "home") setRoute({ view: "home" });
      if (view === "login") setRoute({ view: "login" });
      if (view === "category") setRoute({ view: "category", categoryId: Number(route.getAttribute("data-category")) });
      manageMenu("close", "nav");
      return;
    }

    if (event.target.closest("[data-open-basket]")) {
      event.preventDefault();
      manageMenu("open", "basket");
      return;
    }
    if (event.target.closest("[data-close-basket]")) {
      event.preventDefault();
      manageMenu("close", "basket");
      return;
    }
    if (event.target.closest("[data-close-nav]")) {
      event.preventDefault();
      manageMenu("close", "nav");
      return;
    }
    if (event.target.closest("[data-open-nav]")) {
      event.preventDefault();
      manageMenu("open", "nav");
      return;
    }
    if (event.target.closest("[data-checkout]")) {
      event.preventDefault();
      checkout();
      return;
    }
    if (event.target.closest("[data-logout]")) {
      event.preventDefault();
      logout();
      return;
    }
  }

  function onSubmit(event) {
    const login = event.target.closest("[data-login-form]");
    if (login) {
      event.preventDefault();
      const username = new FormData(login).get("ign");
      if (username) handleLogin(String(username));
      return;
    }
    const gift = event.target.closest("[data-gift-form]");
    if (gift) {
      event.preventDefault();
      const username = new FormData(gift).get("username");
      const packageId = gift.getAttribute("data-gift-form");
      if (username) {
        closeModal();
        addPackage(packageId, { gift_username: String(username) });
      }
    }
  }

  async function loadCounts() {
    try {
      const ping = await fetch(`https://api.minetools.eu/ping/${CONFIG.server}/25565`).then((res) => res.json());
      if (Number.isFinite(ping?.players?.online)) {
        els.serverCount.textContent = String(ping.players.online);
      }
    } catch {
      /* player count is optional */
    }
    try {
      const discord = await fetch(`https://discord.com/api/guilds/${CONFIG.discordId}/widget.json`).then((res) => res.json());
      if (Number.isFinite(discord?.presence_count)) {
        els.discordCount.textContent = String(discord.presence_count);
      }
    } catch {
      try {
        const invite = await fetch(`https://discord.com/api/v9/invites/DTR6serkeM?with_counts=1`).then((res) => res.json());
        if (Number.isFinite(invite?.approximate_presence_count)) {
          els.discordCount.textContent = String(invite.approximate_presence_count);
        }
      } catch {
        /* discord count is optional */
      }
    }
  }

  async function start() {
    els.alert = $("#store-alert");
    els.navCategories = $("#nav");
    els.sidebar = $("#sidebar");
    els.content = $("#content");
    els.modal = $("#popup-modal");
    els.popup = $(".popup");
    els.popupBack = $(".popupBack");
    els.popupLogo = $(".popup__logoBackground");
    els.logoImg = $("#store-logo");
    els.logoBlur = $("#store-logo-blur");
    els.basketItems = $("#basket-items");
    els.basketSummary = $("#basket-summary");
    els.basketTotal = $("#basket-total");
    els.basketUsername = $("#basket-username");
    els.basketPlayer = $("#basket-player");
    els.serverCount = $("#serverCount");
    els.discordCount = $("#discordCount");

    document.getElementById("copyrightYear").textContent = String(new Date().getFullYear());
    document.getElementById("serverLink").addEventListener("click", () => {
      copyText(CONFIG.server);
      popupDisplay(true);
    });
    document.getElementById("closePopup").addEventListener("click", () => popupDisplay(false));
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("popstate", () => {
      const route = parseRoute();
      state.view = route.view;
      state.categoryId = route.categoryId || null;
      render();
    });

    const route = parseRoute();
    state.view = route.view;
    state.categoryId = route.categoryId || null;

    try {
      await Promise.all([loadCatalog(), loadBasket(), loadCounts()]);
      if (state.view === "complete") {
        localStorage.removeItem(CONFIG.storageKey);
        state.basket = null;
      }
      render();
    } catch (error) {
      els.content.innerHTML = `<div class="panel"><div class="panel__heading"><h1>Store unavailable</h1></div><div class="panel__body">${escapeHtml(error.message)}</div></div>`;
      showAlert(error.message, "danger");
    }
  }

  window.manageMenu = manageMenu;
  window.toggleDropdown = toggleDropdown;
  document.addEventListener("DOMContentLoaded", start);
})();
