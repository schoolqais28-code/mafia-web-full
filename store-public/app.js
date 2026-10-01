const state = { products: [], category: "", search: "", facebookUrl: "" };

const els = {
  products: document.getElementById("products"),
  status: document.getElementById("status"),
  categories: document.getElementById("categories"),
  search: document.getElementById("searchInput"),
  count: document.getElementById("productCount"),
  brand: document.getElementById("brandName"),
  footer: document.getElementById("footerName"),
  facebook: document.getElementById("facebookLink")
};

const esc = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function renderProducts(products) {
  els.count.textContent = products.length;
  els.status.style.display = "none";

  if (!products.length) {
    els.products.innerHTML = '<div class="empty">لا توجد منتجات مطابقة حالياً</div>';
    return;
  }

  els.products.innerHTML = products.map((p) => {
    const target = p.source_url || state.facebookUrl || "#";
    const image = p.image_url
      ? '<img class="product-image" src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '" loading="lazy" onerror="this.style.display=\'none\'">'
      : "";

    return `
      <article class="product-card">
        <div class="product-image-wrap">
          <div class="image-fallback">${esc(p.name)}</div>
          ${image}
        </div>
        <div class="product-body">
          <div class="category-label">${esc(p.category || "عام")}</div>
          <h2 class="product-title">${esc(p.name)}</h2>
          <p class="product-description">${esc(p.description || "تفاصيل المنتج متوفرة عبر صفحة فيسبوك")}</p>
          <div class="product-bottom">
            <div class="price">${money(p.price_jod)} <small>د.أ</small></div>
            <a class="product-link" href="${esc(target)}" target="_blank" rel="noreferrer">التفاصيل</a>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderCategories(categories) {
  const all = ["", ...categories];
  els.categories.innerHTML = all.map((cat) =>
    '<button class="chip ' + (state.category === cat ? "active" : "") + '" data-category="' + esc(cat) + '">' +
    esc(cat || "الكل") + "</button>"
  ).join("");

  els.categories.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.category = btn.dataset.category;
      renderCategories(categories);
      loadProducts();
    });
  });
}

async function loadProducts() {
  els.status.style.display = "block";
  els.status.textContent = "جاري تحميل المنتجات...";
  const params = new URLSearchParams();
  if (state.category) params.set("category", state.category);
  if (state.search) params.set("search", state.search);

  try {
    const response = await fetch("/api/products?" + params.toString());
    if (!response.ok) throw new Error("تعذر تحميل المنتجات");
    state.products = await response.json();
    renderProducts(state.products);
  } catch (error) {
    els.status.textContent = error.message;
    els.products.innerHTML = "";
  }
}

async function boot() {
  try {
    const [storeRes, catRes] = await Promise.all([fetch("/api/store"), fetch("/api/categories")]);
    const store = await storeRes.json();
    const categories = await catRes.json();

    state.facebookUrl = store.facebook_url || "";
    els.brand.textContent = store.store_name || "متجر التنين";
    els.footer.textContent = store.store_name || "متجر التنين";
    if (state.facebookUrl) els.facebook.href = state.facebookUrl;
    renderCategories(categories);
  } catch (_) {}
  await loadProducts();
}

let timer;
els.search.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    state.search = els.search.value.trim();
    loadProducts();
  }, 250);
});

boot();
