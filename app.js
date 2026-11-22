/* =========================================================
   App Web - Arborescence Photos Chambres
   Drag & Drop + Import dossier source + PWA installable
   ========================================================= */

// ---------- Constantes ----------
const SUFFIXE_SANS_FCI   = "EN_ATTENTE_FCI";
const MARQUEUR_A_VALIDER = "A_Valider";
const LARGEUR_PREFIXE    = 3;
const SEPARATEUR_PREFIXE = " - ";
const PREFIXE_SANS_ORDRE = "ZZZ";

const DOSSIERS_BASE  = ["MA", "MB", "MC", "MD", "VUE_ENSEMBLE", "ETIQ_CABLE"];
const DOSSIERS_BOITE = ["CASSETTE", "BOITE", "MIRE", "ETIQ_BOITE"];

const KEYWORDS_DEST = [
  { keys: ["etiq_boite", "etiquette_boite", "etiqboite", "etiquetteboite", "etiq-boite"], dest: "ETIQ_BOITE" },
  { keys: ["etiq_cable", "etiquette_cable", "etiqcable", "etiquettecable", "etiq-cable"], dest: "ETIQ_CABLE" },
  { keys: ["vue_ensemble", "vueensemble", "vue-ensemble", "vue_ens", "ensemble", "vue"], dest: "VUE_ENSEMBLE" },
  { keys: ["cassette"], dest: "CASSETTE" },
  { keys: ["boite", "boîte"], dest: "BOITE" },
  { keys: ["mire"], dest: "MIRE" },
  { keys: ["ma"], dest: "MA" },
  { keys: ["mb"], dest: "MB" },
  { keys: ["mc"], dest: "MC" },
  { keys: ["md"], dest: "MD" },
];

// ---------- DOM ----------
const $csvFile     = document.getElementById("csvFile");
const $rootName    = document.getElementById("rootName");
const $optPrefix   = document.getElementById("optPrefix");
const $optBpeBox   = document.getElementById("optBpeBoxes");
const $optMatch    = document.getElementById("optMatchMode");
const $optKeepPath = document.getElementById("optKeepPath");
const $btnRun      = document.getElementById("btnRun");
const $btnClear    = document.getElementById("btnClear");
const $btnClearPh  = document.getElementById("btnClearPhotos");
const $btnPickFiles= document.getElementById("btnPickFiles");
const $btnPickFold = document.getElementById("btnPickFolder");
const $log         = document.getElementById("log");
const $progWrap    = document.getElementById("progressWrap");
const $progBar     = document.getElementById("progressBar");
const $statCh      = document.getElementById("statChambres");
const $statDos     = document.getElementById("statDossiers");
const $statPh      = document.getElementById("statPhotos");
const $statUn      = document.getElementById("statUnassigned");
const $dropZone    = document.getElementById("dropZone");
const $photoInput  = document.getElementById("photoInput");
const $folderInput = document.getElementById("folderInput");
const $photoList   = document.getElementById("photoList");
const $filterBar   = document.getElementById("filterBar");
const $loader      = document.getElementById("loader");
const $loaderText  = document.getElementById("loaderText");
const $installBtn  = document.getElementById("installBtn");
const $arbo        = document.getElementById("arbo");
const $arboSearch  = document.getElementById("arboSearch");
const $btnArboOpen = document.getElementById("btnArboOpen");
const $btnArboClose= document.getElementById("btnArboClose");
const $lightbox    = document.getElementById("lightbox");
const $lbImg       = document.getElementById("lbImg");
const $lbPath      = document.getElementById("lbPath");
const $lbClose     = document.getElementById("lbClose");
const $lbRemove    = document.getElementById("lbRemove");
const $unas        = document.getElementById("unassigned");
const $unasWrap    = document.getElementById("unassignedWrap");

// ---------- État ----------
let csvContent = "";
let csvFileName = "";
let chambres = [];
let photos = [];
let currentFilter = "all";
let lightboxPhoto = null;

// ---------- Log ----------
function log(msg, cls = "") {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  if (cls) line.className = "log-" + cls;
  line.textContent = `[${time}] ${msg}`;
  $log.appendChild(line);
  $log.scrollTop = $log.scrollHeight;
}
const logOk   = m => log("✅ " + m, "ok");
const logErr  = m => log("❌ " + m, "err");
const logInfo = m => log("ℹ️ " + m, "info");
const logWarn = m => log("⚠️ " + m, "warn");
const logClear = () => { $log.innerHTML = ""; };

$btnClear.addEventListener("click", logClear);

function showLoader(text) {
  $loaderText.textContent = text || "Traitement en cours…";
  $loader.classList.add("active");
}
function hideLoader() { $loader.classList.remove("active"); }

// ---------- Utilitaires ----------
function safeInt(v) {
  const n = parseInt(String(v).trim(), 10);
  return isNaN(n) ? null : n;
}

function nettoyerNom(nom) {
  if (!nom) return "";
  return String(nom).trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/, "");
}

function construirePrefixeOrdre(ordre) {
  if (!ordre) return `${PREFIXE_SANS_ORDRE}${SEPARATEUR_PREFIXE}`;
  const n = safeInt(ordre);
  if (n !== null) return `${String(n).padStart(LARGEUR_PREFIXE, "0")}${SEPARATEUR_PREFIXE}`;
  return `${PREFIXE_SANS_ORDRE}_${nettoyerNom(ordre)}${SEPARATEUR_PREFIXE}`;
}

function normaliser(txt) {
  return String(txt).toLowerCase().trim()
    .replace(/[âà]/g, "a").replace(/[éèê]/g, "e")
    .replace(/[îï]/g, "i").replace(/ô/g, "o")
    .replace(/[ûù]/g, "u").replace(/ç/g, "c");
}

function trouverColonne(entetes, ...candidats) {
  const table = {};
  entetes.forEach(h => { if (h) table[normaliser(h)] = h; });
  for (const c of candidats) {
    if (table[normaliser(c)]) return table[normaliser(c)];
  }
  return null;
}

function trouverColonneFuzzy(entetes, ...mots) {
  for (const h of entetes) {
    if (!h) continue;
    const hn = normaliser(h);
    for (const m of mots) {
      if (hn.includes(normaliser(m))) return h;
    }
  }
  return null;
}

function detecterDelimiteur(contenu) {
  const ligne = contenu.split(/\r?\n/)[0] || "";
  for (const sep of [";", ",", "\t", "|"]) {
    if (ligne.includes(sep)) return sep;
  }
  return ";";
}

function parseCSV(contenu, sep) {
  const lignes = [];
  let cur = "", row = [], inQuote = false;
  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i], next = contenu[i + 1];
    if (inQuote) {
      if (c === '"' && next === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuote = true;
      else if (c === sep) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); lignes.push(row); row = []; cur = ""; }
      else if (c !== "\r") cur += c;
    }
  }
  if (cur !== "" || row.length) { row.push(cur); lignes.push(row); }
  return lignes;
}

function rowsToObjects(lignes) {
  if (!lignes.length) return [];
  const entetes = lignes[0].map(h => h.replace(/^\uFEFF/, "").trim());
  const out = [];
  for (let i = 1; i < lignes.length; i++) {
    const vals = lignes[i];
    if (vals.length === 1 && !vals[0]) continue;
    const obj = {};
    entetes.forEach((h, idx) => { obj[h] = (vals[idx] || "").trim(); });
    out.push(obj);
  }
  return out;
}

// ---------- Lecture CSV ----------
$csvFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    csvContent = await file.text();
    csvFileName = file.name;
    const nbLignes = csvContent.split(/\r?\n/).length - 1;
    logOk(`CSV chargé : ${file.name} (${nbLignes} lignes approx.)`);
    chambres = extraireChambres(csvContent);
    logInfo(`${chambres.length} chambres valides détectées`);
    recalculerAssignations();
    majUI();
  } catch (err) {
    logErr("Lecture CSV impossible : " + err.message);
  }
});

function extraireChambres(contenu) {
  const sep = detecterDelimiteur(contenu);
  const lignes = parseCSV(contenu, sep);
  const rows = rowsToObjects(lignes);
  if (!rows.length) return [];

  const entetes = Object.keys(rows[0]);
  const colCommune = trouverColonne(entetes, "COMMUNE");
  const colFci     = trouverColonne(entetes, "FCI", "N°_FCI", "N_FCI", "NUM_FCI")
                     || trouverColonneFuzzy(entetes, "fci");
  const colCable   = trouverColonne(entetes, "Câble", "CABLE", "Cable");
  const colCh1     = trouverColonne(entetes, "CODE_CH1", "CODE CH1", "CODE-CH1");
  const colBpe     = trouverColonne(entetes, "BPE");
  const colOrdre   = trouverColonne(entetes, "Ordre", "ORDRE", "N° ordre");

  if (!colCh1) throw new Error("Colonne CODE_CH1 introuvable dans le CSV");

  const out = [];
  for (const r of rows) {
    const commune = nettoyerNom(r[colCommune] || "");
    const fci     = colFci ? nettoyerNom(r[colFci] || "") : "";
    const cable   = colCable ? nettoyerNom(r[colCable] || "") : "";
    const ch1     = nettoyerNom(r[colCh1] || "");
    const bpe     = colBpe ? nettoyerNom(r[colBpe] || "") : "";
    const ordre   = colOrdre ? nettoyerNom(r[colOrdre] || "") : "";
    if (!commune && !ch1) continue;
    out.push({ commune, fci: fci || "Sans_FCI", cable, ch1, bpe, ordre });
  }

  const getOrdre = c => { const n = safeInt(c.ordre); return n !== null ? n : 999999; };
  out.sort((a, b) => getOrdre(a) - getOrdre(b));
  return out;
}

// ---------- Chemin final d'une chambre ----------
function cheminChambre(ch) {
  const niveau1 = ch.fci !== "Sans_FCI"
    ? `${ch.commune}-${ch.fci}`
    : `${ch.commune}-${SUFFIXE_SANS_FCI}`;
  let chemin = niveau1;
  if (ch.cable) chemin += "/" + ch.cable;

  const prefixe = $optPrefix.checked ? construirePrefixeOrdre(ch.ordre) : "";
  let nomChambre = ch.ch1 ? `CH ${ch.ch1}` : "CH";
  if (!ch.ordre) nomChambre += ` (${MARQUEUR_A_VALIDER})`;
  if (ch.bpe)    nomChambre += ` (${ch.bpe})`;
  return chemin + "/" + prefixe + nomChambre;
}

// ---------- Détection numéro chambre ----------
// Ordre de recherche : dossiers parents (du plus proche au plus lointain), puis nom du fichier.
// Les dates et heures (ex : WhatsApp Image 2026-09-30 at 14.39.37) sont ignorées,
// et seul un numéro présent dans le CSV est retenu.
const RE_CH = /(?:^|[^a-z0-9])(?:chambre|ch)[\s_.\-]*([0-9]+)(?![0-9])/i;

function sansDatesHeures(txt) {
  return String(txt)
    .replace(/[0-9]{4}[-_.][0-9]{1,2}[-_.][0-9]{1,2}/g, " ")
    .replace(/[0-9]{1,2}[-_.][0-9]{1,2}[-_.][0-9]{4}/g, " ")
    .replace(/[0-9]{1,2}[.:h][0-9]{2}(?:[.:][0-9]{2})?/g, " ")
    .replace(/[0-9]{5,}/g, " ");
}

function candidatsChambre(p) {
  const out = [];
  const add = n => { if (n && !out.includes(n)) out.push(n); };
  const segs = (p.relPath || "").split("/").filter(Boolean);
  const dossiers = segs.slice(0, -1).map(sansDatesHeures);

  // 1. dossier de type "CH 52", "001 - CH 52 (A_Valider)", "Chambre 52"
  for (let i = dossiers.length - 1; i >= 0; i--) {
    const m = dossiers[i].match(RE_CH);
    if (m) add(m[1]);
  }
  // 2. dossier dont le nom commence par un numéro : "52", "52 - photos"
  for (let i = dossiers.length - 1; i >= 0; i--) {
    const m = dossiers[i].match(/^\s*([0-9]{1,5})\s*(?:[-_. ]|$)/);
    if (m) add(m[1]);
  }
  // 3. nom de fichier : "CH52_MA.jpg"
  const base = sansDatesHeures(p.name.replace(/\.[^.]+$/, ""));
  const mf = base.match(RE_CH);
  if (mf) add(mf[1]);
  // 4. mode souple : un nombre isolé dans le nom du fichier
  if ($optMatch.value !== "strict") {
    const re = /(?:^|[^0-9])([0-9]{1,4})(?![0-9])/g;
    let m;
    while ((m = re.exec(base)) !== null) add(m[1]);
  }
  return out;
}

// Dossiers à conserver sous la chambre : ceux qui suivent le dossier de la chambre
// (ex : Photos/CH 52/Avant/x.jpg -> "Avant"), pour ne pas répéter "Photos/CH 52".
function dossiersRestants(p) {
  const dossiers = (p.relPath || "").split("/").filter(Boolean).slice(0, -1);
  let idx = -1;
  if (p.manual) idx = dossiers.length - 1;
  else {
    for (let i = dossiers.length - 1; i >= 0 && idx === -1; i--) {
      if (RE_CH.test(sansDatesHeures(dossiers[i]))) idx = i;
    }
    for (let i = dossiers.length - 1; i >= 0 && idx === -1; i--) {
      if (/^\s*[0-9]{1,5}\s*(?:[-_. ]|$)/.test(sansDatesHeures(dossiers[i]))) idx = i;
    }
  }
  return dossiers.slice(idx + 1).join("/");
}

function sansZeros(v) { return String(v).trim().replace(/^0+(?=[0-9])/, ""); }

function trouverChambre(candidats) {
  for (const n of candidats) {
    const ch = chambres.find(c => sansZeros(c.ch1) === sansZeros(n));
    if (ch) return ch;
  }
  return null;
}

// ---------- Détection sous-dossier depuis nom ----------
function extraireSousDossier(nomFichier) {
  const base = normaliser(nomFichier.replace(/\.[^.]+$/, ""));
  const baseClean = base.replace(/(?:^|[^a-z0-9])ch[\s_\-]*[0-9]+/i, " ");
  for (const rule of KEYWORDS_DEST) {
    for (const k of rule.keys) {
      const re = new RegExp(`(?:^|[^a-z0-9])${k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:[^a-z0-9]|$)`, "i");
      if (re.test(baseClean)) return rule.dest;
    }
  }
  return null;
}

// ---------- Détection sous-dossier depuis chemin relatif ----------
function sousDossierDepuisChemin(relPath) {
  const parts = relPath.split("/").filter(Boolean);
  for (let i = parts.length - 2; i >= 0; i--) {
    const comp = normaliser(parts[i]);
    for (const d of DOSSIERS_BASE.concat(DOSSIERS_BOITE)) {
      if (comp === normaliser(d)) return d;
    }
  }
  return null;
}

// ---------- Calcul destination ----------
function calculerDestination(p) {
  p.chambre = null; p.base = null; p.sousRel = "";
  let ch = null;

  if (p.manual && chambres.includes(p.manual)) {
    ch = p.manual;                       // choisie à la main
  } else {
    p.manual = null;
    const cands = candidatsChambre(p);
    if (!cands.length) {
      p.assigned = false;
      p.dest = "❌ Chambre non détectée";
      p.chemin = null;
      return;
    }
    ch = trouverChambre(cands);
    if (!ch) {
      p.assigned = false;
      p.dest = `❌ CH ${cands[0]} introuvable dans CSV`;
      p.chemin = null;
      return;
    }
  }

  const base = cheminChambre(ch);

  let sous = null;
  if (p.relPath) sous = sousDossierDepuisChemin(p.relPath);
  if (!sous) sous = extraireSousDossier(p.name);

  p.chambre = ch; p.base = base;
  if (sous) {
    p.sousRel = sous;
    p.chemin = `${base}/${sous}/${p.name}`;
    p.dest = `${base.split("/").pop()}/${sous}`;
  } else if ($optKeepPath.checked && p.relPath && p.relPath.includes("/")) {
    const dirOnly = dossiersRestants(p);
    if (dirOnly) {
      p.sousRel = dirOnly;
      p.chemin = `${base}/${dirOnly}/${p.name}`;
      p.dest = `${base.split("/").pop()}/${dirOnly}`;
    } else {
      p.chemin = `${base}/${p.name}`;
      p.dest = `${base.split("/").pop()}/`;
    }
  } else {
    p.chemin = `${base}/${p.name}`;
    p.dest = `${base.split("/").pop()}/`;
  }
  p.assigned = true;
}

// ---------- Recalcul global ----------
function recalculerAssignations() {
  for (const p of photos) calculerDestination(p);
}

// ---------- UI ----------
function majUI() {
  $statCh.textContent = chambres.length;
  const assigned = photos.filter(p => p.assigned).length;
  const unassigned = photos.length - assigned;
  $statPh.textContent = assigned;
  $statUn.textContent = unassigned;
  $statUn.className = "stat-value " + (unassigned > 0 ? "err" : "");
  $statDos.textContent = "—";

  document.getElementById("countAll").textContent = photos.length;
  document.getElementById("countAssigned").textContent = assigned;
  document.getElementById("countUnassigned").textContent = unassigned;
  $filterBar.style.display = photos.length ? "flex" : "none";

  renderPhotoList();
  renderArbo();
  renderNonAssignees();

  $btnClearPh.disabled = photos.length === 0;
  $btnRun.disabled = chambres.length === 0;
}

function renderPhotoList() {
  $photoList.innerHTML = "";
  const visible = photos.filter(p => {
    if (currentFilter === "assigned") return p.assigned;
    if (currentFilter === "unassigned") return !p.assigned;
    return true;
  });

  visible.forEach(p => {
    const realIdx = photos.indexOf(p);
    const item = document.createElement("div");
    item.className = "photo-item";

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.loading = "lazy";
    if (p.url) thumb.src = p.url;

    const info = document.createElement("div");
    info.className = "info";
    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = p.name;
    nameEl.title = p.name;
    const pathEl = document.createElement("div");
    pathEl.className = "path";
    pathEl.textContent = p.relPath || "(fichier isolé)";
    pathEl.title = p.relPath || "";
    info.appendChild(nameEl);
    info.appendChild(pathEl);

    const destEl = document.createElement("div");
    destEl.className = "dest" + (p.assigned ? "" : " unassigned");
    destEl.textContent = p.dest || "";
    destEl.title = p.dest || "";

    const rmBtn = document.createElement("button");
    rmBtn.className = "remove";
    rmBtn.textContent = "✕";
    rmBtn.title = "Retirer";
    rmBtn.dataset.idx = realIdx;

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(destEl);
    item.appendChild(rmBtn);
    $photoList.appendChild(item);
  });
}

// ---------- Arborescence (vue des dossiers + photos) ----------
function niveau1Chambre(ch) {
  return ch.fci !== "Sans_FCI"
    ? `${ch.commune}-${ch.fci}`
    : `${ch.commune}-${SUFFIXE_SANS_FCI}`;
}

function creerEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function photoCorrespond(p, q) {
  if (!q) return true;
  const hay = normaliser(`${p.name} ${p.relPath || ""} ${p.base || ""}`);
  return hay.includes(q);
}

function retirerPhoto(p) {
  const i = photos.indexOf(p);
  if (i === -1) return;
  if (p.url) URL.revokeObjectURL(p.url);
  logInfo(`Retiré : ${p.name}`);
  photos.splice(i, 1);
  majUI();
}

function ouvrirVisionneuse(p) {
  lightboxPhoto = p;
  $lbImg.src = p.url;
  $lbPath.textContent = p.chemin || p.name;
  $lightbox.classList.add("active");
}
function fermerVisionneuse() {
  $lightbox.classList.remove("active");
  $lbImg.removeAttribute("src");
  lightboxPhoto = null;
}
$lbClose.addEventListener("click", fermerVisionneuse);
$lightbox.addEventListener("click", e => { if (e.target === $lightbox) fermerVisionneuse(); });
$lbRemove.addEventListener("click", () => {
  const p = lightboxPhoto;
  fermerVisionneuse();
  if (p) retirerPhoto(p);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $lightbox.classList.contains("active")) fermerVisionneuse();
});

function noeudDossierPhotos(label, liste, ouvert) {
  const det = creerEl("details", "arbo-dir");
  det.open = !!ouvert;
  const sum = creerEl("summary", null, `${label}/ `);
  sum.appendChild(creerEl("span", "arbo-count", `(${liste.length})`));
  det.appendChild(sum);
  const grille = creerEl("div", "arbo-thumbs");
  let rempli = false;
  const remplir = () => {
    if (rempli || !det.open) return;
    rempli = true;
    for (const p of liste) {
      const b = creerEl("button", "arbo-thumb secondary");
      b.type = "button";
      b.title = p.chemin || p.name;
      const img = document.createElement("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = p.url;
      img.addEventListener("error", () => img.removeAttribute("src"));
      b.appendChild(img);
      b.appendChild(creerEl("span", null, p.name));
      b.addEventListener("click", () => ouvrirVisionneuse(p));
      grille.appendChild(b);
    }
  };
  det.addEventListener("toggle", remplir);
  det.appendChild(grille);
  remplir();
  return det;
}

function noeudChambre(ch, base, parSous, q) {
  const nomChambre = base.split("/").pop();
  let total = 0;
  parSous.forEach(l => { total += l.length; });
  const det = creerEl("details", "arbo-ch");
  det.open = !!q;
  const sum = creerEl("summary", null, `${nomChambre}/`);
  if (total) sum.appendChild(creerEl("span", "arbo-badge", `${total} photo${total > 1 ? "s" : ""}`));
  det.appendChild(sum);

  const corps = creerEl("div", "arbo-body");
  const chips = creerEl("div", "arbo-chips");
  const noms = DOSSIERS_BASE.slice();
  if (ch.bpe && $optBpeBox.checked) noms.push(...DOSSIERS_BOITE);
  parSous.forEach((_, k) => { if (k !== "" && !noms.includes(k)) noms.push(k); });

  for (const k of noms) {
    const liste = (parSous.get(k) || []).filter(p => photoCorrespond(p, q) || normaliser(base).includes(q));
    if (liste.length) corps.appendChild(noeudDossierPhotos(k, liste, !!q));
    else if (!q) chips.appendChild(creerEl("span", "arbo-chip" + (DOSSIERS_BOITE.includes(k) ? " boite" : ""), k));
  }
  const racine = (parSous.get("") || []).filter(p => photoCorrespond(p, q) || normaliser(base).includes(q));
  if (racine.length) corps.appendChild(noeudDossierPhotos("(racine)", racine, !!q));
  if (chips.childNodes.length) corps.appendChild(chips);
  det.appendChild(corps);
  return det;
}

function renderArbo() {
  const q = normaliser($arboSearch.value || "");
  $arbo.innerHTML = "";
  if (!chambres.length) {
    $arbo.appendChild(creerEl("p", "arbo-empty", "Importez le CSV pour voir l'arborescence."));
    return;
  }

  // photos assignées regroupées par chambre puis par sous-dossier
  const parBase = new Map();
  for (const p of photos) {
    if (!p.assigned || !p.base) continue;
    if (!parBase.has(p.base)) parBase.set(p.base, new Map());
    const m = parBase.get(p.base);
    if (!m.has(p.sousRel)) m.set(p.sousRel, []);
    m.get(p.sousRel).push(p);
  }

  const groupes = new Map(); // niveau1 -> Map(câble -> [chambres])
  for (const ch of chambres) {
    const n1 = niveau1Chambre(ch);
    if (!groupes.has(n1)) groupes.set(n1, new Map());
    const g = groupes.get(n1);
    const cle = ch.cable || "";
    if (!g.has(cle)) g.set(cle, []);
    g.get(cle).push(ch);
  }

  let affiche = false;
  groupes.forEach((cables, n1) => {
    const kids = creerEl("div", "arbo-kids");
    let total = 0, visibles = 0;

    const ajouter = (hote, ch) => {
      total++;
      const base = cheminChambre(ch);
      const parSous = parBase.get(base) || new Map();
      let nbPhotos = 0;
      parSous.forEach(l => { nbPhotos += l.length; });
      const nomMatch = q && normaliser(base).includes(q);
      const photoMatch = q && [...parSous.values()].some(l => l.some(p => photoCorrespond(p, q)));
      if (q && !nomMatch && !photoMatch) return;
      hote.appendChild(noeudChambre(ch, base, parSous, q));
      visibles++;
    };

    cables.forEach((liste, cable) => {
      if (cable) {
        const d2 = creerEl("details", "arbo-cable");
        d2.open = !!q;
        d2.appendChild(creerEl("summary", null, `${cable}/`));
        const k2 = creerEl("div", "arbo-kids");
        liste.forEach(ch => ajouter(k2, ch));
        if (k2.childNodes.length) { d2.appendChild(k2); kids.appendChild(d2); }
      } else {
        liste.forEach(ch => ajouter(kids, ch));
      }
    });

    if (!visibles) return;
    affiche = true;
    const d1 = creerEl("details", "arbo-n1");
    d1.open = true;
    const s1 = creerEl("summary", null, `${n1}/ `);
    s1.appendChild(creerEl("span", "arbo-count", `(${total})`));
    d1.appendChild(s1);
    d1.appendChild(kids);
    $arbo.appendChild(d1);
  });

  if (!affiche) $arbo.appendChild(creerEl("p", "arbo-empty", "Aucun résultat pour cette recherche."));
}

$arboSearch.addEventListener("input", renderArbo);
$btnArboOpen.addEventListener("click", () => $arbo.querySelectorAll("details").forEach(d => { d.open = true; }));
$btnArboClose.addEventListener("click", () => $arbo.querySelectorAll("details").forEach(d => { d.open = false; }));

// ---------- Photos non assignées : assignation manuelle par dossier ----------
function dossierSource(p) {
  const i = (p.relPath || "").lastIndexOf("/");
  return i > 0 ? p.relPath.slice(0, i) : "";
}

function libelleChambre(ch) {
  return `${cheminChambre(ch).split("/").pop()} · ${ch.commune}`;
}

function renderNonAssignees() {
  $unas.innerHTML = "";
  const non = photos.filter(p => !p.assigned);
  $unasWrap.style.display = non.length ? "block" : "none";
  if (!non.length) return;

  const groupes = new Map();
  non.forEach((p, i) => {
    const dir = dossierSource(p);
    const cle = dir || "\u0000" + i;           // fichiers isolés : un groupe chacun
    if (!groupes.has(cle)) groupes.set(cle, { dir, liste: [] });
    groupes.get(cle).liste.push(p);
  });

  groupes.forEach(g => {
    const bloc = creerEl("div", "unas-group");
    const titre = g.dir || g.liste[0].name;
    bloc.appendChild(creerEl("div", "unas-title", titre));
    bloc.appendChild(creerEl("div", "unas-sub",
      `${g.liste.length} photo${g.liste.length > 1 ? "s" : ""} · ${g.liste[0].dest.replace("❌ ", "")}`));

    const sel = document.createElement("select");
    sel.setAttribute("aria-label", "Chambre pour " + titre);
    const o0 = document.createElement("option");
    o0.value = ""; o0.textContent = "Choisir la chambre…";
    sel.appendChild(o0);
    chambres.forEach((ch, i) => {
      const o = document.createElement("option");
      o.value = String(i); o.textContent = libelleChambre(ch);
      sel.appendChild(o);
    });
    const btn = creerEl("button", "secondary", g.dir ? "Assigner tout le dossier" : "Assigner");
    btn.type = "button";
    btn.addEventListener("click", () => {
      if (sel.value === "") return;
      const ch = chambres[parseInt(sel.value, 10)];
      g.liste.forEach(p => { p.manual = ch; });
      logOk(`${g.liste.length} photo(s) assignée(s) à ${libelleChambre(ch)}`);
      recalculerAssignations();
      majUI();
    });
    const ligne = creerEl("div", "unas-row");
    ligne.appendChild(sel); ligne.appendChild(btn);
    bloc.appendChild(ligne);
    $unas.appendChild(bloc);
  });
}

// ---------- Suppression photo ----------
$photoList.addEventListener("click", e => {
  if (e.target.classList.contains("remove")) {
    const idx = parseInt(e.target.dataset.idx, 10);
    if (!isNaN(idx) && photos[idx]) {
      if (photos[idx].url) URL.revokeObjectURL(photos[idx].url);
      logInfo(`Retiré : ${photos[idx].name}`);
      photos.splice(idx, 1);
      majUI();
    }
  }
});

$btnClearPh.addEventListener("click", () => {
  if (photos.length && confirm(`Retirer les ${photos.length} photo(s) ?`)) {
    photos.forEach(p => { if (p.url) URL.revokeObjectURL(p.url); });
    photos = [];
    logInfo("Toutes les photos retirées");
    majUI();
  }
});

// ---------- Filtres ----------
$filterBar.addEventListener("click", e => {
  const btn = e.target.closest("button[data-filter]");
  if (!btn) return;
  currentFilter = btn.dataset.filter;
  $filterBar.querySelectorAll("button").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  renderPhotoList();
});

// ---------- Drag & Drop ----------
$dropZone.addEventListener("click", () => $photoInput.click());

["dragenter", "dragover"].forEach(ev => {
  $dropZone.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
    $dropZone.classList.add("dragover");
  });
});
["dragleave", "drop"].forEach(ev => {
  $dropZone.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
    $dropZone.classList.remove("dragover");
  });
});

$dropZone.addEventListener("drop", async e => {
  const items = e.dataTransfer.items;
  const files = e.dataTransfer.files;

  if (items && items.length) {
    const entries = [];
    for (const item of items) {
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
        if (entry) entries.push(entry);
        else if (item.getAsFile) entries.push(item.getAsFile());
      }
    }
    if (entries.length && entries[0] && (entries[0].isFile !== undefined)) {
      await traiterEntries(entries);
      return;
    }
  }

  if (files && files.length) {
    await ajouterPhotos(Array.from(files));
  }
});

document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => e.preventDefault());

// ---------- Import fichiers isolés ----------
$btnPickFiles.addEventListener("click", () => $photoInput.click());

$photoInput.addEventListener("change", async e => {
  if (e.target.files.length) {
    await ajouterPhotos(Array.from(e.target.files));
  }
  e.target.value = "";
});

// ---------- Import dossier complet ----------
$btnPickFold.addEventListener("click", () => $folderInput.click());

$folderInput.addEventListener("change", async e => {
  if (!e.target.files.length) return;
  showLoader("Analyse du dossier…");
  try {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith("image/"));
    logInfo(`${files.length} image(s) trouvée(s) dans le dossier`);
    await ajouterPhotos(files);
  } finally {
    hideLoader();
    e.target.value = "";
  }
});

// ---------- Traitement des entries (drop dossier) ----------
async function traiterEntries(entries) {
  showLoader("Analyse du dossier glissé…");
  try {
    const allFiles = [];
    await parcourirEntries(entries, allFiles, "");
    logInfo(`${allFiles.length} image(s) trouvée(s) dans le drop`);
    if (allFiles.length) await ajouterPhotos(allFiles);
    else logWarn("Aucune image détectée dans le drop");
  } catch (err) {
    logErr("Erreur lecture drop : " + err.message);
  } finally {
    hideLoader();
  }
}

async function parcourirEntries(entries, out, basePath) {
  for (const entry of entries) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      if (file.type.startsWith("image/")) {
        Object.defineProperty(file, "webkitRelativePath", {
          value: basePath ? `${basePath}/${file.name}` : file.name,
          configurable: true,
        });
        out.push(file);
      }
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const childs = await lireRep(reader);
      await parcourirEntries(childs, out, basePath ? `${basePath}/${entry.name}` : entry.name);
    }
  }
}

function lireRep(reader) {
  return new Promise((resolve, reject) => {
    const all = [];
    const readBatch = () => {
      reader.readEntries(batch => {
        if (!batch.length) resolve(all);
        else { all.push(...batch); readBatch(); }
      }, reject);
    };
    readBatch();
  });
}

// ---------- Ajout photos ----------
async function ajouterPhotos(fileList) {
  let ajoutees = 0;
  for (const f of fileList) {
    if (!f.type || !f.type.startsWith("image/")) continue;
    const relPath = f.webkitRelativePath || "";
    const deja = photos.find(p => p.name === f.name && p.size === f.size && p.relPath === relPath);
    if (deja) continue;

    const url = URL.createObjectURL(f);
    photos.push({
      file: f,
      name: f.name,
      size: f.size,
      relPath: relPath,
      url: url,
      assigned: false,
      dest: "",
      chemin: null,
    });
    ajoutees++;
  }

  if (ajoutees) {
    logOk(`${ajoutees} photo(s) ajoutée(s) (total : ${photos.length})`);
    recalculerAssignations();
    majUI();
  } else {
    logWarn("Aucune nouvelle photo valide (doublons ou types non supportés)");
  }
}

// ---------- Changement d'options ----------
[$optPrefix, $optBpeBox, $optMatch, $optKeepPath].forEach(el => {
  if (el) el.addEventListener("change", () => {
    recalculerAssignations();
    majUI();
  });
});

// ---------- Génération ZIP ----------
$btnRun.addEventListener("click", async () => {
  if (!chambres.length) return;
  $btnRun.disabled = true;
  $progWrap.style.display = "block";
  $progBar.style.width = "0%";
  $statDos.textContent = "0";

  try {
    await genererZip();
  } catch (err) {
    logErr("Erreur génération : " + err.message);
    console.error(err);
  } finally {
    $btnRun.disabled = false;
  }
});

async function genererZip() {
  logInfo("Démarrage de la génération…");
  if (typeof JSZip === "undefined") {
    throw new Error("JSZip non chargé (vérifiez la connexion)");
  }

  const zip = new JSZip();
  const rootFolder = ($rootName.value.trim() || "SnakePhotos").replace(/[^\w\-]/g, "_");
  const rootZip = zip.folder(rootFolder);

  let dossiersCrees = 0;
  const total = chambres.length;
  for (let i = 0; i < chambres.length; i++) {
    const ch = chambres[i];
    const base = cheminChambre(ch);
    for (const sous of DOSSIERS_BASE) {
      rootZip.file(`${base}/${sous}/.keep`, "");
      dossiersCrees++;
    }
    if (ch.bpe && $optBpeBox.checked) {
      for (const sous of DOSSIERS_BOITE) {
        rootZip.file(`${base}/${sous}/.keep`, "");
        dossiersCrees++;
      }
    }
    if (i % 20 === 0) {
      $progBar.style.width = Math.round(((i + 1) / total) * 40) + "%";
      await new Promise(r => setTimeout(r, 0));
    }
  }
  $statDos.textContent = dossiersCrees;
  logOk(`${dossiersCrees} dossiers créés`);

  const assigned = photos.filter(p => p.assigned && p.chemin);
  const utilises = new Set();
  for (const p of assigned) {
    let chemin = p.chemin, n = 1;
    while (utilises.has(chemin.toLowerCase())) {
      n++;
      const dot = p.chemin.lastIndexOf(".");
      chemin = dot > p.chemin.lastIndexOf("/") + 1
        ? `${p.chemin.slice(0, dot)}_${n}${p.chemin.slice(dot)}`
        : `${p.chemin}_${n}`;
    }
    utilises.add(chemin.toLowerCase());
    p.cheminZip = chemin;
  }
  let photosRangees = 0;

  for (let i = 0; i < assigned.length; i++) {
    const p = assigned[i];
    try {
      const content = await p.file.arrayBuffer();
      rootZip.file(p.cheminZip || p.chemin, content);
      photosRangees++;
    } catch (err) {
      logWarn(`Échec ajout ${p.name} : ${err.message}`);
    }
    if (i % 5 === 0) {
      $progBar.style.width = (40 + Math.round(((i + 1) / assigned.length) * 50)) + "%";
      await new Promise(r => setTimeout(r, 0));
    }
  }
  logOk(`${photosRangees} photo(s) rangée(s)`);

  const unassignedList = photos.filter(p => !p.assigned);
  const readme = [
    "====================================================",
    "ARBORESCENCE PHOTOS CHAMBRES",
    "====================================================",
    "",
    `Généré le : ${new Date().toLocaleString()}`,
    `Source CSV : ${csvFileName || "(inconnu)"}`,
    `Chambres : ${chambres.length}`,
    `Dossiers créés : ${dossiersCrees}`,
    `Photos rangées : ${photosRangees}`,
    `Photos non assignées : ${unassignedList.length}`,
    "",
    "STRUCTURE PAR CHAMBRE :",
    ...DOSSIERS_BASE.map(d => `  - ${d}`),
    "",
    "SI BPE (Boîte) :",
    ...DOSSIERS_BOITE.map(d => `  - ${d}`),
    "",
  ];
  if (unassignedList.length) {
    readme.push("PHOTOS NON ASSIGNÉES (à placer manuellement) :");
    unassignedList.forEach(p => {
      readme.push(`  - ${p.name} (${p.relPath || "isolé"}) : ${p.dest}`);
    });
    readme.push("");
  }
  rootZip.file("README.txt", readme.join("\n"));

  logInfo("Compression en cours…");
  $progBar.style.width = "90%";
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => {
      $progBar.style.width = (90 + Math.round(meta.percent / 10)) + "%";
    }
  );

  $progBar.style.width = "100%";
  const safeName = (rootFolder || "SnakePhotos").replace(/[^\w\-]/g, "_");
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `${safeName}_${dateStr}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);

  logOk(`ZIP téléchargé : ${filename}`);
  logInfo(`Taille : ${(blob.size / 1024 / 1024).toFixed(2)} Mo`);

  setTimeout(() => {
    $progWrap.style.display = "none";
    $progBar.style.width = "0%";
  }, 1500);
}

// =========================================================
// PWA : installation personnalisée
// =========================================================
let deferredInstallPrompt = null;
const $installHelp = document.getElementById("installHelp");

function estInstallee() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function instructionsInstallation() {
  const ua = navigator.userAgent || "";
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!window.isSecureContext) {
    return "L'installation demande une page ouverte en HTTPS. Hébergez l'application sur un site en HTTPS, puis rouvrez-la.";
  }
  if (ios) {
    return "Sur iPhone ou iPad : ouvrez cette page dans Safari, touchez le bouton Partager (le carré avec une flèche vers le haut), puis « Sur l'écran d'accueil ».";
  }
  if (/android/i.test(ua)) {
    return "Sur Android : ouvrez cette page dans Chrome, touchez le menu ⋮ en haut à droite, puis « Installer l'application » (ou « Ajouter à l'écran d'accueil »).";
  }
  return "Sur ordinateur : cliquez sur l'icône d'installation à droite de la barre d'adresse de Chrome ou d'Edge.";
}

if ($installBtn) {
  if (estInstallee()) {
    $installBtn.setAttribute("hidden", "");
  }

  $installBtn.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      $installHelp.textContent = instructionsInstallation();
      $installHelp.hidden = !$installHelp.hidden;
      return;
    }
    $installHelp.hidden = true;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    logInfo(`Choix d'installation : ${outcome === "accepted" ? "Accepté ✅" : "Refusé ❌"}`);
    deferredInstallPrompt = null;
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if ($installHelp) $installHelp.hidden = true;
  logInfo("📲 Application prête à être installée");
});

window.addEventListener("appinstalled", () => {
  logOk("Application installée avec succès !");
  if ($installBtn) $installBtn.setAttribute("hidden", "");
  if ($installHelp) $installHelp.hidden = true;
  deferredInstallPrompt = null;
});

// =========================================================
// PWA : enregistrement du Service Worker
// =========================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then(reg => console.log("✅ SW enregistré :", reg.scope))
      .catch(err => console.error("❌ SW erreur :", err));
  });
}
