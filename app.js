const CATEGORIES = {
  "bostad": { name: "bostad", subs: { lagenhet: "lägenheter", hus: "hus & villor", rum: "rum & delat boende", stuga: "stugor & fritidshus", korttid: "korttidsuthyrning", andrahand: "andrahand" } },
  "lokaler": { name: "lokaler", subs: { kontor: "kontor", butik: "butik & restaurang", lager: "lager & verkstad", parkering: "parkering & garage" } },
  "fordon": { name: "fordon", subs: { bil: "bilar", husbil: "husbilar & husvagnar", mc: "mc & moped", bat: "båtar", cykel: "cyklar" } },
  "prylar": { name: "prylar", subs: { verktyg: "verktyg & maskiner", event: "fest & event", elektronik: "elektronik & kamera", sport: "sport & fritid" } },
  "tjanster": { name: "tjänster", subs: { stad: "städ & hemhjälp", flytt: "flytt & transport", annat: "övrigt" } }
};
const CITIES = ["Hela Sverige","Stockholm","Göteborg","Malmö","Uppsala","Linköping","Örebro","Umeå","Luleå"];
const KEY = "hyr.ads.v1", SAVED = "hyr.saved.v1";
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const day = n => Date.now() - n * 864e5;

function seed() {
  return [
    ["bostad","lagenhet","Ljus 2:a vid Mariatorget, 54 kvm","Stockholm",13500,"Fin tvåa med balkong, nära tunnelbana. Inflyttning 1 december. Max 2 personer, ej rökare.",1],
    ["bostad","rum","Möblerat rum i delad lägenhet, Majorna","Göteborg",5200,"Rum på 14 kvm i trevlig kollektivlägenhet. El och bredband ingår.",2],
    ["bostad","stuga","Stuga vid sjö, veckouthyrning","Uppsala",6000,"Mysig stuga med bastu och roddbåt. Pris per vecka, juni–augusti.",3],
    ["bostad","andrahand","Etta i andrahand, 6 månader","Malmö",8900,"Möblerad etta nära Värnhem. Hyrs ut jan–jun.",4],
    ["lokaler","kontor","Kontorsplats i kontorshotell","Linköping",3500,"Skrivbord, kaffe och mötesrum ingår. Flexibelt kontrakt.",2],
    ["lokaler","parkering","Garageplats centralt","Stockholm",1800,"Uppvärmt garage, nära Södermalm.",5],
    ["fordon","bil","Hyr Volvo V70 per dag","Örebro",650,"Bra familjebil, fri mil 100 km/dag. Försäkring ingår.",1],
    ["fordon","husbil","Husbil för 4 personer","Umeå",1400,"Perfekt för sommarsemestern. Pris per dygn.",6],
    ["prylar","verktyg","Hyr borrhammare & betongsåg","Göteborg",250,"Proffsverktyg, hämtas i Hisingen. Pris per dag.",0],
    ["prylar","event","Partytält 6x12 m","Luleå",1200,"Inkl. bord och bänkar för 60 personer. Pris per helg.",7],
    ["prylar","elektronik","Spegelreflexkamera + 3 objektiv","Malmö",400,"Canon-kit, hyrs per dygn. Deposition 2000 kr.",3],
    ["tjanster","flytt","Flyttbil med chaufför","Uppsala",900,"Per timme, minst 2 timmar. Bärhjälp kan bokas.",2]
  ].map((a, i) => ({ id: "s" + i, cat: a[0], sub: a[1], title: a[2], city: a[3], price: a[4], body: a[5], created: day(a[6]), contact: "", photo: "" }));
}
function ads() {
  let a = JSON.parse(localStorage.getItem(KEY) || "null");
  if (!a) { a = seed(); localStorage.setItem(KEY, JSON.stringify(a)); }
  return a;
}
const saveAds = a => localStorage.setItem(KEY, JSON.stringify(a));
const saved = () => JSON.parse(localStorage.getItem(SAVED) || "[]");
const setSaved = s => { localStorage.setItem(SAVED, JSON.stringify(s)); $("#savedCount").textContent = s.length; };
const fmtDate = t => new Date(t).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
const kr = n => n ? n.toLocaleString("sv-SE") + " kr" : "–";
const city = () => localStorage.getItem("hyr.city") || "Hela Sverige";
const inCity = a => city() === "Hela Sverige" || a.city === city();

function rows(list) {
  if (!list.length) return '<p class="empty">Inga annonser hittades.</p>';
  const s = saved();
  return list.sort((a, b) => b.created - a.created).map(a => `
    <div class="row">
      <button class="save ${s.includes(a.id) ? "on" : ""}" data-save="${esc(a.id)}" title="Spara" aria-label="Spara">${s.includes(a.id) ? "★" : "☆"}</button>
      <span class="date">${fmtDate(a.created)}</span>
      <a class="title" href="#/ad/${esc(a.id)}">${esc(a.title)}</a>
      <span class="loc">${esc(a.city)}</span>
      <span class="price">${kr(a.price)}</span>
    </div>`).join("");
}

const views = {
  home() {
    const all = ads().filter(inCity);
    return `<h1>Hyr i ${esc(city())}</h1><div class="cats">` + Object.entries(CATEGORIES).map(([k, c]) => `
      <div class="cat"><h2><a href="#/c/${k}">${c.name}</a></h2><ul>` +
      Object.entries(c.subs).map(([sk, sn]) => `<li><a href="#/c/${k}/${sk}">${sn}</a> <small>${all.filter(a => a.cat === k && a.sub === sk).length}</small></li>`).join("") +
      `</ul></div>`).join("") + `</div><h2>Senaste annonserna</h2>` + rows(all.slice().sort((a,b)=>b.created-a.created).slice(0, 10));
  },
  list(cat, sub, params) {
    const c = CATEGORIES[cat]; if (!c) return views.notfound();
    const q = (params.get("q") || "").toLowerCase();
    const max = Number(params.get("max")) || 0;
    const list = ads().filter(a => a.cat === cat && (!sub || a.sub === sub) && inCity(a) &&
      (!q || (a.title + a.body).toLowerCase().includes(q)) && (!max || a.price <= max));
    return `<div class="crumbs"><a href="#/">hyr</a> › <a href="#/c/${cat}">${c.name}</a>${sub ? " › " + c.subs[sub] : ""}</div>
      <h1>${sub ? c.subs[sub] : c.name} – ${esc(city())}</h1>
      <div class="toolbar">${sub ? "" : Object.entries(c.subs).map(([k, n]) => `<a href="#/c/${cat}/${k}">${n}</a>`).join(" · ")}</div>
      <form class="toolbar" id="filterForm" data-base="#/c/${cat}${sub ? "/" + sub : ""}">
        <input name="q" placeholder="sökord" value="${esc(q)}"> <input name="max" type="number" min="0" placeholder="maxpris" value="${max || ""}"> <button>filtrera</button>
      </form>` + rows(list);
  },
  search(params) {
    const q = (params.get("q") || "").toLowerCase();
    return `<h1>Sökresultat för ”${esc(q)}”</h1>` + rows(ads().filter(a => inCity(a) && (a.title + a.body).toLowerCase().includes(q)));
  },
  saved() { const s = saved(); return `<h1>Sparade annonser</h1>` + rows(ads().filter(a => s.includes(a.id))); },
  ad(id) {
    const a = ads().find(x => x.id === id); if (!a) return views.notfound();
    const c = CATEGORIES[a.cat];
    return `<div class="crumbs"><a href="#/">hyr</a> › <a href="#/c/${a.cat}">${c.name}</a> › <a href="#/c/${a.cat}/${a.sub}">${c.subs[a.sub]}</a></div>
      <div class="detail"><h1>${esc(a.title)}</h1>
      <div class="price">${kr(a.price)}</div>
      <div class="meta">${esc(a.city)} · publicerad ${fmtDate(a.created)}</div>
      ${a.photo ? `<img class="photo" src="${esc(a.photo)}" alt="">` : ""}
      <div class="body">${esc(a.body)}</div>
      <p>${a.contact ? "Kontakt: " + esc(a.contact) : "Ingen kontaktinfo angiven."}</p>
      <p><button data-save="${esc(a.id)}">${saved().includes(a.id) ? "★ sparad" : "☆ spara"}</button>
      ${a.id[0] === "u" ? ` <button data-del="${esc(a.id)}">ta bort annons</button>` : ""}</p></div>`;
  },
  post() {
    return `<h1>Skapa annons</h1><form class="post" id="postForm">
      <label>Kategori <select name="cat" id="catSel">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join("")}</select></label>
      <label>Underkategori <select name="sub" id="subSel"></select></label>
      <label>Rubrik <input name="title" required maxlength="100"></label>
      <label>Stad <select name="city">${CITIES.slice(1).map(c => `<option ${c === city() ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label>Pris (kr) <input name="price" type="number" min="0" required></label>
      <label>Beskrivning <textarea name="body" required maxlength="3000"></textarea></label>
      <label>Kontakt <span>e-post eller telefon (visas offentligt)</span><input name="contact" maxlength="100"></label>
      <label>Bild-URL <span>valfritt, https://…</span><input name="photo" type="url"></label>
      <button class="primary">Publicera</button></form>`;
  },
  about() { return `<h1>Om Hyr</h1><p>Hyr är en enkel annonssajt för uthyrning – bostäder, lokaler, fordon och prylar. Annonser sparas i din webbläsare i denna demo-version.</p>`; },
  notfound() { return `<h1>Sidan hittades inte</h1><p><a href="#/">Till startsidan</a></p>`; }
};

function route() {
  const [path, qs] = location.hash.slice(1).split("?"), params = new URLSearchParams(qs || "");
  const p = (path || "/").split("/").filter(Boolean);
  let html;
  if (!p.length) html = views.home();
  else if (p[0] === "c") html = views.list(p[1], p[2], params);
  else if (p[0] === "ad") html = views.ad(p[1]);
  else if (p[0] === "search") html = views.search(params);
  else if (views[p[0]] && ["post","saved","about"].includes(p[0])) html = views[p[0]]();
  else html = views.notfound();
  $("#app").innerHTML = html;
  window.scrollTo(0, 0);
  if (p[0] === "post") initPost();
}

function initPost() {
  const fill = () => { $("#subSel").innerHTML = Object.entries(CATEGORIES[$("#catSel").value].subs).map(([k, n]) => `<option value="${k}">${n}</option>`).join(""); };
  fill(); $("#catSel").onchange = fill;
  $("#postForm").onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.photo && !/^https?:\/\//i.test(f.photo)) f.photo = "";
    const ad = { id: "u" + Date.now(), cat: f.cat, sub: f.sub, title: f.title.trim(), city: f.city, price: Number(f.price), body: f.body.trim(), contact: f.contact.trim(), photo: f.photo, created: Date.now() };
    saveAds([ad, ...ads()]);
    location.hash = "#/ad/" + ad.id;
  };
}

document.addEventListener("click", e => {
  const sv = e.target.closest("[data-save]"), del = e.target.closest("[data-del]");
  if (sv) { const id = sv.dataset.save, s = saved(); setSaved(s.includes(id) ? s.filter(x => x !== id) : [...s, id]); route(); }
  if (del && confirm("Ta bort annonsen?")) { saveAds(ads().filter(a => a.id !== del.dataset.del)); location.hash = "#/"; }
});
document.addEventListener("submit", e => {
  if (e.target.id === "filterForm") {
    e.preventDefault();
    const f = new URLSearchParams(new FormData(e.target)); for (const [k, v] of [...f]) if (!v) f.delete(k);
    location.hash = e.target.dataset.base + (f.toString() ? "?" + f : "");
  }
});
$("#cityFilter").innerHTML = CITIES.map(c => `<option ${c === city() ? "selected" : ""}>${c}</option>`).join("");
$("#cityFilter").onchange = e => { localStorage.setItem("hyr.city", e.target.value); route(); };
$("#searchForm").onsubmit = e => { e.preventDefault(); location.hash = "#/search?q=" + encodeURIComponent($("#q").value); };
window.addEventListener("hashchange", route);
setSaved(saved());
route();
