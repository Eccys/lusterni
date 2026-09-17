(() => {
  const CONFIG = {
    publicToken: "ti29-45ff1ef831c85c765f3d033de1ffa13f7c6c462b",
    apiRoot: "https://headless.tebex.io/api",
    server: "play.arcturusmc.org",
    discord: "https://discord.gg/DTR6serkeM",
    discordId: "1127553089533120562",
    storageKey: "arcturus.tebex.basket",
    featuredPackageId: 6052238, // 11,000 Gold Bundle
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
      .replace(/arcturusmc\.xyz/gi, "arcturusmc.org")
      .replace(
        /Gold is the premium currency on Arcturus for upgrading yourself and getting special items\.(\s*<br\s*\/?>\s*|\s*)(You can buy (?:ranks and pinatas|tiers, pinatas, and chest keys) with gold\.)?/gi,
        "Gold is the premium currency on Arcturus for getting tiers, pinatas, and chest keys."
      )
      .replace(
        /You can buy (?:ranks and pinatas|tiers, pinatas, and chest keys) with gold\./gi,
        "You can buy tiers, pinatas, and chest keys with gold."
      )
      .replace(
        /open a crate at spawn!/gi,
        "open a crate at spawn."
      );
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
      window.history.replaceState({}, "", url.toString());
    } else {
      window.history.pushState({}, "", url.toString());
    }
    state.view = next.view;
    state.categoryId = next.categoryId || null;
    render();
  }

  async function loadCatalog() {
    const [storeRes, catRes, pkgRes] = await Promise.all([
      api(accountApi),
      api(`${accountApi}/categories?includePackages=1`),
      api(`${accountApi}/packages`),
    ]);

    state.store = storeRes?.data || null;

    const packages = Array.isArray(pkgRes?.data) ? pkgRes.data : [];
    state.packagesById.clear();
    packages.forEach((pkg) => {
      state.packagesById.set(Number(pkg.id), pkg);
    });

    const rawCats = Array.isArray(catRes?.data) ? catRes.data : [];
    state.categories = rawCats.map((cat) => {
      const catPackages = (cat.packages || []).map((p) => {
        const full = state.packagesById.get(Number(p.id));
        return full || p;
      });
      return {
        ...cat,
        packages: catPackages,
      };
    });
  }

  function getStoredBasketIdent() {
    return localStorage.getItem(CONFIG.storageKey) || null;
  }

  function storeBasketIdent(ident) {
    if (ident) {
      localStorage.setItem(CONFIG.storageKey, ident);
    } else {
      localStorage.removeItem(CONFIG.storageKey);
    }
  }

  async function loadBasket() {
    const ident = getStoredBasketIdent();
    if (!ident) {
      state.basket = null;
      return;
    }
    try {
      const res = await api(`${CONFIG.apiRoot}/baskets/${ident}`);
      const basket = res?.data || null;
      if (basket && basket.username) {
        state.basket = basket;
      } else {
        // Discard baskets without an authenticated player username
        storeBasketIdent(null);
        state.basket = null;
      }
    } catch (err) {
      console.warn("Stored basket invalid, discarding:", err.message);
      storeBasketIdent(null);
      state.basket = null;
    }
  }

  async function ensureBasketWithAuth(username) {
    const targetUser = (username || state.basket?.username || "").trim();
    if (!targetUser) {
      throw new Error("Minecraft username is required.");
    }

    // Reuse active basket if it belongs to the same Minecraft user
    if (state.basket?.ident && state.basket?.username?.toLowerCase() === targetUser.toLowerCase()) {
      return state.basket.ident;
    }

    // Create a new basket session for this Minecraft username
    const created = await api(`${accountApi}/baskets`, {
      method: "POST",
      body: JSON.stringify({
        username: targetUser,
        complete_url: completeUrl(),
        cancel_url: cancelUrl(),
      }),
    });

    const basket = created?.data;
    if (!basket?.ident) {
      throw new Error("Failed to create Tebex basket session.");
    }

    state.basket = basket;
    storeBasketIdent(basket.ident);
    return basket.ident;
  }

  function basketPackages() {
    return state.basket?.packages || [];
  }

  function packageInBasket(pkgId) {
    const numeric = Number(pkgId);
    return basketPackages().find((p) => Number(p.id) === numeric);
  }

  function packageQuantity(pkgId) {
    const item = packageInBasket(pkgId);
    return item ? Number(item.in_basket?.quantity || item.quantity || 1) : 0;
  }

  function basketCount() {
    return basketPackages().reduce((sum, item) => {
      return sum + Number(item.in_basket?.quantity || item.quantity || 1);
    }, 0);
  }

  async function addPackage(pkgId, quantity = 1) {
    const pkg = state.packagesById.get(Number(pkgId));
    if (!pkg) throw new Error("Package not found in catalog");

    const currentUsername = state.basket?.username;
    if (!currentUsername) {
      state.pendingPackageId = Number(pkgId);
      setRoute({ view: "login" });
      showAlert("Please enter your Minecraft username first to add packages.", "danger");
      return;
    }

    setBusy(true);
    try {
      const ident = await ensureBasketWithAuth(currentUsername);
      const res = await api(`${CONFIG.apiRoot}/baskets/${ident}/packages`, {
        method: "POST",
        body: JSON.stringify({
          package_id: Number(pkgId),
          quantity: Number(quantity),
        }),
      });
      state.basket = res?.data || state.basket;
      showAlert(`Added "${pkg.name}" to cart!`);
      render();
      openCartDrawer();
    } finally {
      setBusy(false);
    }
  }

  async function updatePackageQuantity(pkgId, newQty) {
    const numericId = Number(pkgId);
    if (newQty <= 0) {
      return removePackage(numericId);
    }
    setBusy(true);
    try {
      const ident = state.basket?.ident || getStoredBasketIdent();
      const res = await api(`${CONFIG.apiRoot}/baskets/${ident}/packages/${numericId}`, {
        method: "PUT",
        body: JSON.stringify({ quantity: Number(newQty) }),
      });
      state.basket = res?.data || state.basket;
      render();
    } finally {
      setBusy(false);
    }
  }

  async function removePackage(pkgId) {
    const numericId = Number(pkgId);
    setBusy(true);
    try {
      const ident = state.basket?.ident || getStoredBasketIdent();
      const res = await api(`${CONFIG.apiRoot}/baskets/${ident}/packages/${numericId}`, {
        method: "DELETE",
      });
      state.basket = res?.data || state.basket;
      showAlert("Package removed from cart");
      render();
    } finally {
      setBusy(false);
    }
  }

  async function giftPackage(pkgId, friendUsername) {
    if (!friendUsername) throw new Error("Friend's username required");
    const currentUsername = state.basket?.username;
    if (!currentUsername) {
      state.pendingPackageId = Number(pkgId);
      setRoute({ view: "login" });
      showAlert("Please enter your Minecraft username first before gifting.", "danger");
      return;
    }

    setBusy(true);
    try {
      const ident = await ensureBasketWithAuth(currentUsername);
      const res = await api(`${CONFIG.apiRoot}/baskets/${ident}/packages`, {
        method: "POST",
        body: JSON.stringify({
          package_id: Number(pkgId),
          gift_username: friendUsername.trim(),
        }),
      });
      state.basket = res?.data || state.basket;
      showAlert(`Gift package for "${friendUsername}" added to cart!`);
      closeModal();
      render();
      openCartDrawer();
    } finally {
      setBusy(false);
    }
  }

  function openCartDrawer() {
    els.cartDrawer.classList.add("is-open");
    els.cartDrawerOverlay.classList.add("is-open");
  }

  function closeCartDrawer() {
    els.cartDrawer.classList.remove("is-open");
    els.cartDrawerOverlay.classList.remove("is-open");
  }

  function openPackageModal(pkgId) {
    const pkg = state.packagesById.get(Number(pkgId));
    if (!pkg) return;

    const container = els.modalContainer;
    const sanitizedDesc = sanitizeContent(pkg.description);
    const inBasket = Boolean(packageInBasket(pkg.id));

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
                  <button type="submit" class="site-discord-btn" style="min-height: 2.5rem; font-size: 0.75rem;">Send Gift</button>
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
            ? `<button type="button" class="btn-purchase is-in-cart" data-remove="${pkg.id}">
                 <i class="fas fa-trash-alt"></i> Remove from Cart
               </button>`
            : `<button type="button" class="btn-purchase" data-add="${pkg.id}">
                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart" style="margin-right: 0.35rem;"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg> Add to Cart
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
      return `<a href="/?category=${cat.id}" class="${activeClass}" data-route="category" data-category="${cat.id}">${escapeHtml(cat.name)}</a>`;
    }).join("");

    els.categoryNav.innerHTML = `
      <a href="/" class="${state.view === "home" || state.view === "complete" ? "active" : ""}" data-route="home">Home</a>
      ${catItems}
    `;
  }

  function renderHeaderCartSlot() {
    const count = basketCount();
    const username = state.basket?.username;

    if (username) {
      const cartLabel = `${escapeHtml(username)}'s Cart`;
      els.headerCartSlot.innerHTML = `
        <button type="button" class="header-cart-btn ${count > 0 ? "has-items" : ""}" data-open-cart aria-label="View Cart">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg>
          <span>${cartLabel}</span>
          ${count > 0 ? `<span class="cart-badge">${count}</span>` : ""}
        </button>
      `;
    } else {
      els.headerCartSlot.innerHTML = `
        <button type="button" class="site-button-outline" data-route="login">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-user"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
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
          <div class="quantity-control" style="height: 2.25rem;">
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
      : `<button type="button" class="btn-purchase" data-add="${pkg.id}">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart" style="margin-right: 0.35rem;"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg> Add to Cart
         </button>`;

    return `
      <article class="package-card">
        <div class="package-card-top">
          <span class="package-index">${indexStr}</span>
        </div>
        <div class="package-image-wrap" data-info="${pkg.id}">
          ${imageHtml}
        </div>
        <div class="package-card-body">
          <h3 class="package-card-title" data-info="${pkg.id}">${escapeHtml(pkg.name)}</h3>
          <div class="package-card-price">${money(pkg.total_price ?? pkg.base_price, currency)}</div>
        </div>
        <div class="package-card-actions">
          ${buttonHtml}
        </div>
      </article>
    `;
  }

  function renderFeaturedPackage() {
    const featPkg = state.packagesById.get(CONFIG.featuredPackageId) || state.packagesById.get(6052238);
    if (!featPkg) return "";

    const inBasket = Boolean(packageInBasket(featPkg.id));
    const currency = featPkg.currency || state.store?.currency || "USD";
    const priceStr = money(featPkg.total_price ?? featPkg.base_price, currency);

    const btnHtml = inBasket
      ? `<button type="button" class="btn-purchase is-in-cart" data-open-cart style="min-width: 170px;">
           <i class="fas fa-check"></i> In Cart
         </button>`
      : `<button type="button" class="btn-purchase" data-add="${featPkg.id}" style="min-width: 170px;">
           <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shopping-cart" style="margin-right: 0.35rem;"><circle cx="8" cy="21" r="1"></circle><circle cx="19" cy="21" r="1"></circle><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"></path></svg> Add to Cart
         </button>`;

    return `
      <section class="featured-section">
        <div class="featured-card" data-info="${featPkg.id}">
          <div class="featured-badge"><span class="site-beacon"></span> FEATURED DEAL &bull; BEST VALUE</div>
          <div class="featured-inner">
            <div class="featured-img-wrap" data-info="${featPkg.id}">
              <img src="${featPkg.image || 'https://dunb17ur4ymx4.cloudfront.net/packages/images/49b8bbfe7956a67c08114a55a94b659699cac845.gif'}" alt="${escapeHtml(featPkg.name)}" />
            </div>
            <div class="featured-details" data-info="${featPkg.id}">
              <h2 data-info="${featPkg.id}">${escapeHtml(featPkg.name)} Bundle</h2>
              <p data-info="${featPkg.id}">Gold is the premium currency on Arcturus for getting tiers, pinatas, and chest keys.</p>
              <div class="featured-price" data-info="${featPkg.id}">${priceStr} <span class="featured-discount text-accent">+ MAXIMUM VALUE</span></div>
            </div>
            <div class="featured-action">
              ${btnHtml}
            </div>
          </div>
        </div>
      </section>
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
              <button type="submit" class="btn-purchase">
                <i class="fas fa-sign-in-alt"></i> Login & Continue
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
          <a href="/" data-route="home" class="btn-purchase" style="max-width: 260px; margin: 0 auto; text-decoration: none;">
            <i class="fas fa-store"></i> Return to Store
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

    // Home view: Featured package + all categories
    const featuredHtml = renderFeaturedPackage();
    const sections = state.categories.map((c) => renderCategorySection(c)).join("");
    els.content.innerHTML = `
      ${featuredHtml}
      ${sections}
    `;
  }

  function render() {
    renderCategoryNav();
    renderHeaderCartSlot();
    renderCartDrawer();
    renderMain();
  }

  function copyText(text) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const temp = document.createElement("textarea");
      temp.value = text;
      document.body.appendChild(temp);
      temp.select();
      document.execCommand("copy");
      temp.remove();
    }
  }

  async function onClick(event) {
    // Nav route link
    const routeLink = event.target.closest("[data-route]");
    if (routeLink) {
      event.preventDefault();
      const routeType = routeLink.getAttribute("data-route");
      if (routeType === "home") {
        setRoute({ view: "home" });
      } else if (routeType === "category") {
        const catId = routeLink.getAttribute("data-category");
        setRoute({ view: "category", categoryId: Number(catId) });
      } else if (routeType === "login") {
        setRoute({ view: "login" });
      }
      return;
    }

    // Add to cart
    const addBtn = event.target.closest("[data-add]");
    if (addBtn) {
      event.preventDefault();
      const pkgId = addBtn.getAttribute("data-add");
      addPackage(pkgId).catch((err) => showAlert(err.message, "danger"));
      return;
    }

    // Remove from cart
    const removeBtn = event.target.closest("[data-remove]");
    if (removeBtn) {
      event.preventDefault();
      const pkgId = removeBtn.getAttribute("data-remove");
      removePackage(pkgId).catch((err) => showAlert(err.message, "danger"));
      return;
    }

    // Quantity update
    const qtyBtn = event.target.closest("[data-qty]");
    if (qtyBtn) {
      event.preventDefault();
      const pkgId = qtyBtn.getAttribute("data-qty");
      const next = Number(qtyBtn.getAttribute("data-next") || 0);
      updatePackageQuantity(pkgId, next).catch((err) => showAlert(err.message, "danger"));
      return;
    }

    // Package info modal via data-info (image, title, or featured card)
    const info = event.target.closest("[data-info]");
    if (info && !event.target.closest("[data-add], [data-remove], [data-qty], .quantity-control, button, a")) {
      event.preventDefault();
      openPackageModal(info.getAttribute("data-info"));
      return;
    }

    // Open Cart drawer
    if (event.target.closest("[data-open-cart]")) {
      event.preventDefault();
      openCartDrawer();
      return;
    }

    // Close Cart drawer
    if (event.target.closest("[data-close-drawer]")) {
      event.preventDefault();
      closeCartDrawer();
      return;
    }

    // Close Modal
    if (event.target.closest("[data-close-modal]") || event.target.id === "packageModal") {
      event.preventDefault();
      closeModal();
      return;
    }

    // Toggle Gifting
    if (event.target.closest("[data-toggle-gift]")) {
      event.preventDefault();
      const form = $(".modal-gift-form");
      if (form) form.classList.toggle("is-open");
      return;
    }

    // Logout from session
    if (event.target.closest("#cartLogoutBtn")) {
      event.preventDefault();
      storeBasketIdent(null);
      state.basket = null;
      closeCartDrawer();
      showAlert("Logged out of store session");
      render();
      return;
    }

    // Checkout
    if (event.target.closest("#cartCheckoutBtn")) {
      event.preventDefault();
      const checkoutUrl = state.basket?.links?.checkout;
      if (!checkoutUrl) {
        showAlert("Basket is empty or checkout URL unavailable", "danger");
        return;
      }
      window.location.href = checkoutUrl;
      return;
    }

    // Copy IP (Hero or Sidebar)
    const copyBtn = event.target.closest("#heroCopyBtn, #sidebarCopyBtn");
    if (copyBtn) {
      event.preventDefault();
      copyText(CONFIG.server);
      copyBtn.classList.add("is-copied");
      const sub = copyBtn.querySelector(".copy-sub, #copyBtnSub");
      if (sub) {
        sub.textContent = "Copied to clipboard!";
      }
      window.clearTimeout(copyBtn.timer);
      copyBtn.timer = window.setTimeout(() => {
        copyBtn.classList.remove("is-copied");
        if (sub) sub.textContent = "Click to copy IP";
      }, 2200);
      showAlert("Server IP copied to clipboard: " + CONFIG.server);
      return;
    }
  }

  async function onSubmit(event) {
    // Login form submit
    const loginForm = event.target.closest("[data-login-form]");
    if (loginForm) {
      event.preventDefault();
      const input = loginForm.querySelector("input[name='ign']");
      const ign = (input?.value || "").trim();
      if (!ign) return;

      setBusy(true);
      try {
        await ensureBasketWithAuth(ign);
        showAlert(`Logged in as "${ign}"`);
        if (state.pendingPackageId) {
          const pkgId = state.pendingPackageId;
          state.pendingPackageId = null;
          setRoute({ view: "home" });
          await addPackage(pkgId);
        } else {
          setRoute({ view: "home" });
        }
      } catch (err) {
        showAlert(`Login error: ${err.message}`, "danger");
      } finally {
        setBusy(false);
      }
      return;
    }

    // Gift form submit
    const giftForm = event.target.closest("[data-gift-form]");
    if (giftForm) {
      event.preventDefault();
      const pkgId = giftForm.getAttribute("data-gift-form");
      const input = giftForm.querySelector("input[name='username']");
      const friend = (input?.value || "").trim();
      if (!friend) return;
      giftPackage(pkgId, friend).catch((err) => showAlert(err.message, "danger"));
      return;
    }
  }

  async function start() {
    els.alert = $("#storeAlert");
    els.alertText = $("#storeAlertText");
    els.categoryNav = $("#headerCategoryNav");
    els.headerCartSlot = $("#header-cart-slot");
    els.content = $("#content");
    els.cartDrawer = $("#cartDrawer");
    els.cartDrawerOverlay = $("#cartDrawerOverlay");
    els.cartDrawerItems = $("#cartDrawerItems");
    els.cartUsername = $("#cartUsername");
    els.cartUserAvatar = $("#cartUserAvatar");
    els.cartLogoutBtn = $("#cartLogoutBtn");
    els.cartTotalAmount = $("#cartTotalAmount");
    els.modalOverlay = $("#packageModal");
    els.modalContainer = $("#packageModalContainer");

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
      await Promise.all([loadCatalog(), loadBasket()]);
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
