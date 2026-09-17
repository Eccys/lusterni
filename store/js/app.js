(() => {
  const CONFIG = {
    publicToken: "ti29-45ff1ef831c85c765f3d033de1ffa13f7c6c462b",
    apiRoot: "https://headless.tebex.io/api",
    server: "play.arcturusmc.org",
    discord: "https://discord.gg/DTR6serkeM",
    discordId: "1127553089533120562",
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

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function sanitizeContent(html) {
    if (!html) return "";
    return String(html)
      .replace(/https?:\/\/arcturusmc\.xyz\/discord/gi, CONFIG.discord)
      .replace(/arcturusmc\.xyz/gi, "arcturusmc.org");
  }

  function getBaseStoreUrl() {
    return `${window.location.origin}/`;
  }

  function completeUrl() {
    return `${window.location.origin}/?checkout=complete`;
  }

  function cancelUrl() {
    return `${window.location.origin}/`;
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
    const text = els.alertText;
    if (!box || !text) return;
    box.className = `site-alert site-alert--${type} is-visible`;
    text.textContent = message;
    window.clearTimeout(showAlert.timer);
    showAlert.timer = window.setTimeout(() => {
      box.classList.remove("is-visible");
    }, 4500);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function openCartDrawer() {
    els.cartDrawer.classList.add("is-open");
    els.cartDrawerOverlay.classList.add("is-open");
  }

  function closeCartDrawer() {
    els.cartDrawer.classList.remove("is-open");
    els.cartDrawerOverlay.classList.remove("is-open");
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
    } else {
      const field = document.createElement("textarea");
      field.value = text;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      document.body.removeChild(field);
    }
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
      showAlert("Package added to cart.");
      render();
      openCartDrawer();
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
    closeCartDrawer();
    render();
    showAlert("Logged out of the store.");
  }

  function openPackageModal(packageId) {
    const pkg = state.packagesById.get(Number(packageId));
    if (!pkg) return;
    const inBasket = Boolean(packageInBasket(pkg.id));
    const container = els.modalContainer;
    const sanitizedDesc = sanitizeContent(pkg.description);

    container.innerHTML = `
      <div class="hud-modal-header">
        <h2>${escapeHtml(pkg.name)}</h2>
        <button type="button" class="cart-drawer-close" data-close-modal aria-label="Close modal">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="hud-modal-body">
        ${sanitizedDesc ? `<div style="margin-bottom: 1.25rem;">${sanitizedDesc}</div>` : "<p>No special description provided.</p>"}
        ${
          pkg.disable_gifting
            ? ""
            : `<div class="modal-gift-section">
                <button type="button" class="modal-gift-toggle" data-toggle-gift>
                  <i class="fas fa-gift"></i> Send as a Gift to a Friend
                </button>
                <form class="modal-gift-form" data-gift-form="${pkg.id}">
                  <input type="text" name="username" class="hud-input" placeholder="Friend's Minecraft IGN" required style="height: 2.5rem; font-size: 0.85rem;" />
                  <button type="submit" class="site-button" style="min-height: 2.5rem; background: var(--accent); color: var(--accent-foreground); border: 1px solid var(--accent); font-size: 0.75rem;">Send Gift</button>
                </form>
              </div>`
        }
      </div>
      <div class="hud-modal-footer">
        <div class="modal-price-row">
          <span style="font-size: 0.85rem; font-weight: 700; text-transform: uppercase; color: var(--muted-foreground);">Price</span>
          <span class="modal-price-val">${money(pkg.total_price ?? pkg.base_price, pkg.currency || state.store?.currency)}</span>
        </div>
        ${
          inBasket
            ? `<button type="button" class="btn-dual-deck btn-dual-deck--active" data-remove="${pkg.id}">
                 <span class="deck-main"><i class="fas fa-trash-alt"></i> Remove from Cart</span>
                 <span class="deck-sub">Currently in your cart</span>
               </button>`
            : `<button type="button" class="btn-dual-deck" data-add="${pkg.id}">
                 <span class="deck-main"><i class="fas fa-shopping-cart"></i> Add to Cart</span>
                 <span class="deck-sub">Instant delivery in-game</span>
               </button>`
        }
      </div>`;
    els.modalOverlay.classList.add("is-open");
  }

  function closeModal() {
    els.modalOverlay.classList.remove("is-open");
  }

  function renderCategoryNav() {
    const activeCat = state.view === "category" ? Number(state.categoryId) : null;
    const catItems = state.categories.map((cat) => {
      const activeClass = activeCat === Number(cat.id) ? "active" : "";
      return `<li class="${activeClass}"><a href="/?category=${cat.id}" data-route="category" data-category="${cat.id}">${escapeHtml(cat.name)}</a></li>`;
    }).join("");

    els.categoryNav.innerHTML = `
      <li class="${state.view === "home" || state.view === "complete" ? "active" : ""}"><a href="/" data-route="home"><i class="fas fa-home"></i> Home</a></li>
      ${catItems}
    `;
  }

  function renderHeaderCartSlot() {
    const count = basketCount();
    const username = state.basket?.username;
    const total = money(state.basket?.total_price || 0, state.basket?.currency || "USD");

    if (username) {
      els.headerCartSlot.innerHTML = `
        <button type="button" class="header-cart-btn ${count > 0 ? "has-items" : ""}" data-open-cart>
          <span class="cart-badge">${count}</span>
          <div class="cart-meta">
            <span class="cart-title"><i class="fas fa-shopping-cart"></i> Cart</span>
            <span class="cart-price">${count > 0 ? total : username}</span>
          </div>
        </button>
      `;
    } else {
      els.headerCartSlot.innerHTML = `
        <button type="button" class="site-button-outline" data-route="login">
          <i class="fas fa-user text-primary"></i>
          <span>Login</span>
        </button>
      `;
    }
  }

  function renderCartDrawer() {
    const items = basketPackages();
    const username = state.basket?.username;
    const currency = state.basket?.currency || state.store?.currency || "USD";

    if (username) {
      els.cartUsername.textContent = username;
      els.cartUserAvatar.src = `https://mc-heads.net/avatar/${encodeURIComponent(username)}/64`;
      els.cartUserAvatar.style.display = "block";
      els.cartLogoutBtn.style.display = "inline-flex";
    } else {
      els.cartUsername.textContent = "Guest";
      els.cartUserAvatar.style.display = "none";
      els.cartLogoutBtn.style.display = "none";
    }

    els.cartTotalAmount.textContent = money(state.basket?.total_price || 0, currency);

    if (!items.length) {
      els.cartDrawerItems.innerHTML = `
        <div class="cart-empty-state">
          <i class="fas fa-shopping-basket"></i>
          <p>Your cart is empty</p>
          <span style="font-size: 0.75rem; color: var(--muted-foreground); margin-top: 0.5rem;">Select packages to get started</span>
        </div>
      `;
      return;
    }

    els.cartDrawerItems.innerHTML = items.map((pkg) => {
      const qty = Number(pkg.in_basket?.quantity || pkg.quantity || 1);
      const price = pkg.in_basket?.price ?? pkg.total_price ?? pkg.base_price;
      return `
        <div class="cart-item">
          <div class="cart-item-info">
            <div class="cart-item-title">${escapeHtml(pkg.name)}</div>
            <div class="cart-item-price">${money(price, currency)}</div>
          </div>
          <div class="quantity-control" style="height: 2rem;">
            <button type="button" class="quantity-btn" data-qty="${pkg.id}" data-next="${qty - 1}"><i class="fas fa-minus" style="font-size: 0.7rem;"></i></button>
            <span class="quantity-display" style="padding: 0 0.5rem; font-size: 0.85rem;">${qty}</span>
            <button type="button" class="quantity-btn" data-qty="${pkg.id}" data-next="${qty + 1}"><i class="fas fa-plus" style="font-size: 0.7rem;"></i></button>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderPackageCard(pkg, index) {
    const currency = pkg.currency || state.store?.currency || "USD";
    const inBasket = Boolean(packageInBasket(pkg.id));
    const qty = packageQuantity(pkg.id);
    const indexStr = index < 9 ? `0${index + 1}` : String(index + 1);

    const imageHtml = pkg.image
      ? `<img src="${escapeHtml(pkg.image)}" alt="${escapeHtml(pkg.name)}" loading="lazy" />`
      : `<div class="package-placeholder-icon"><i class="fas fa-box-open"></i></div>`;

    const buttonHtml = inBasket
      ? `<div class="quantity-control">
           <button type="button" class="quantity-btn" data-qty="${pkg.id}" data-next="${qty - 1}" title="Decrease quantity"><i class="fas fa-minus"></i></button>
           <span class="quantity-display">${qty} in cart</span>
           <button type="button" class="quantity-btn" data-qty="${pkg.id}" data-next="${qty + 1}" title="Increase quantity"><i class="fas fa-plus"></i></button>
         </div>`
      : `<button type="button" class="btn-dual-deck" data-add="${pkg.id}">
           <span class="deck-main"><i class="fas fa-shopping-cart"></i> Add to Cart</span>
           <span class="deck-sub">Instant delivery</span>
         </button>`;

    return `
      <article class="package-card">
        <div class="package-card-top">
          <span class="package-index">${indexStr}</span>
          <button type="button" class="package-info-btn" data-info="${pkg.id}" title="Package details">
            <i class="fas fa-info"></i>
          </button>
        </div>
        <div class="package-image-wrap">
          ${imageHtml}
        </div>
        <div class="package-card-body">
          <h3 class="package-card-title">${escapeHtml(pkg.name)}</h3>
          <div class="package-card-price">${money(pkg.total_price ?? pkg.base_price, currency)}</div>
        </div>
        <div class="package-card-actions">
          ${buttonHtml}
        </div>
      </article>
    `;
  }

  function renderCategorySection(category) {
    const packages = (category.packages || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const cards = packages.map((pkg, idx) => renderPackageCard(pkg, idx)).join("");
    const desc = sanitizeContent(category.description);

    return `
      <section class="category-section">
        <div class="category-header">
          <h2>${escapeHtml(category.name)}</h2>
          ${desc ? `<p class="category-description">${desc}</p>` : ""}
        </div>
        <div class="package-grid">
          ${cards || "<p class='text-muted'>No packages available in this category.</p>"}
        </div>
      </section>
    `;
  }

  function renderMain() {
    if (state.view === "login") {
      els.content.innerHTML = `
        <div class="login-panel">
          <h2><i class="fas fa-user-astronaut text-primary"></i> Player Login</h2>
          <p>Enter your exact Minecraft username so Tebex can deliver your purchases in-game.</p>
          <form data-login-form>
            <input type="text" name="ign" class="hud-input" placeholder="Minecraft Username (e.g. Notch)" required autofocus autocomplete="username" />
            <div style="margin-top: 1.25rem;">
              <button type="submit" class="btn-dual-deck">
                <span class="deck-main"><i class="fas fa-sign-in-alt"></i> Login & Continue</span>
                <span class="deck-sub">Connect to Tebex session</span>
              </button>
            </div>
          </form>
        </div>
      `;
      return;
    }

    if (state.view === "complete") {
      els.content.innerHTML = `
        <div class="complete-panel">
          <h2><i class="fas fa-check-circle text-primary"></i> Order Confirmed</h2>
          <p>Thank you for supporting Arcturus Factions! Your order is being processed and will be delivered to your account in-game shortly.</p>
          <a href="/" data-route="home" class="btn-dual-deck" style="max-width: 280px; margin: 0 auto;">
            <span class="deck-main"><i class="fas fa-store"></i> Return to Store</span>
            <span class="deck-sub">Continue browsing</span>
          </a>
        </div>
      `;
      return;
    }

    if (state.view === "category") {
      const cat = state.categories.find((c) => Number(c.id) === Number(state.categoryId));
      if (!cat) {
        els.content.innerHTML = `<div class="hud-panel"><div class="hud-panel-header"><h2>Category not found</h2></div></div>`;
        return;
      }
      els.content.innerHTML = renderCategorySection(cat);
      return;
    }

    // Home view: Intro panel + all categories
    const rawIntro = state.store?.description || "<p>Welcome to the Arcturus store.</p>";
    const sanitizedIntro = sanitizeContent(rawIntro);

    const sections = state.categories.map((c) => renderCategorySection(c)).join("");
    els.content.innerHTML = `
      <div class="hud-panel" style="margin-bottom: 2.5rem;">
        <div class="hud-panel-header">
          <h3><i class="fas fa-bullhorn text-accent"></i> Welcome to the Store</h3>
        </div>
        <div class="hud-panel-body" style="font-size: 1rem;">
          ${sanitizedIntro}
        </div>
      </div>
      ${sections}
    `;
  }

  function render() {
    renderCategoryNav();
    renderHeaderCartSlot();
    renderCartDrawer();
    renderMain();
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
    // Modal close
    if (event.target.closest("[data-close-modal]") || event.target === els.modalOverlay) {
      event.preventDefault();
      closeModal();
      return;
    }

    // Gift section toggle
    if (event.target.closest("[data-toggle-gift]")) {
      event.preventDefault();
      const form = $(".modal-gift-form");
      if (form) form.classList.toggle("is-open");
      return;
    }

    // Cart drawer open/close
    if (event.target.closest("[data-open-cart]")) {
      event.preventDefault();
      openCartDrawer();
      return;
    }
    if (event.target.closest("[data-close-drawer]")) {
      event.preventDefault();
      closeCartDrawer();
      return;
    }

    // Package info modal
    const info = event.target.closest("[data-info]");
    if (info) {
      event.preventDefault();
      openPackageModal(info.getAttribute("data-info"));
      return;
    }

    // Add package
    const add = event.target.closest("[data-add]");
    if (add) {
      event.preventDefault();
      closeModal();
      addPackage(add.getAttribute("data-add"));
      return;
    }

    // Remove package
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      event.preventDefault();
      removePackage(remove.getAttribute("data-remove"));
      closeModal();
      return;
    }

    // Quantity update
    const qty = event.target.closest("[data-qty]");
    if (qty) {
      event.preventDefault();
      setQuantity(qty.getAttribute("data-qty"), Number(qty.getAttribute("data-next")));
      return;
    }

    // Routes
    const route = event.target.closest("[data-route]");
    if (route) {
      event.preventDefault();
      const view = route.getAttribute("data-route");
      if (view === "home") setRoute({ view: "home" });
      if (view === "login") setRoute({ view: "login" });
      if (view === "category") setRoute({ view: "category", categoryId: Number(route.getAttribute("data-category")) });
      return;
    }

    // Checkout
    if (event.target.closest("#cartCheckoutBtn")) {
      event.preventDefault();
      checkout();
      return;
    }

    // Logout
    if (event.target.closest("#cartLogoutBtn")) {
      event.preventDefault();
      logout();
      return;
    }

    // Copy IP (Header or Sidebar)
    const copyBtn = event.target.closest("#serverLink, #sidebarCopyBtn");
    if (copyBtn) {
      event.preventDefault();
      copyText(CONFIG.server);
      const sub = $("#sidebarCopySub");
      if (sub) {
        sub.textContent = "Copied to clipboard!";
        window.clearTimeout(copyBtn.timer);
        copyBtn.timer = window.setTimeout(() => {
          sub.textContent = "Click to copy";
        }, 2200);
      }
      showAlert("Server IP copied to clipboard: " + CONFIG.server);
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
      return;
    }
  }

  async function loadCounts() {
    try {
      const ping = await fetch(`https://api.minetools.eu/ping/${CONFIG.server}/25565`).then((res) => res.json());
      if (Number.isFinite(ping?.players?.online)) {
        els.serverCount.textContent = String(ping.players.online);
      }
    } catch {
      /* optional ping */
    }
  }

  async function start() {
    els.alert = $("#storeAlert");
    els.alertText = $("#storeAlertText");
    els.categoryNav = $("#categoryNav");
    els.headerCartSlot = $("#header-cart-slot");
    els.content = $("#content");
    els.cartDrawer = $("#cartDrawer");
    els.cartDrawerOverlay = $("#cartDrawerOverlay");
    els.cartUsername = $("#cartUsername");
    els.cartUserAvatar = $("#cartUserAvatar");
    els.cartLogoutBtn = $("#cartLogoutBtn");
    els.cartDrawerItems = $("#cartDrawerItems");
    els.cartTotalAmount = $("#cartTotalAmount");
    els.modalOverlay = $("#packageModal");
    els.modalContainer = $("#packageModalContainer");
    els.serverCount = $("#serverCount");

    const year = $("#copyrightYear");
    if (year) year.textContent = String(new Date().getFullYear());

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
      els.content.innerHTML = `
        <div class="hud-panel">
          <div class="hud-panel-header">
            <h2><i class="fas fa-exclamation-triangle text-accent"></i> Store Unavailable</h2>
          </div>
          <div class="hud-panel-body">
            <p>${escapeHtml(error.message)}</p>
          </div>
        </div>
      `;
      showAlert(error.message, "danger");
    }
  }

  document.addEventListener("DOMContentLoaded", start);
})();
