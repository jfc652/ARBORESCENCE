/* =========================================================
   App Web - Arborescence Photos Chambres
   Génère un ZIP contenant toute l'arborescence de dossiers
   ========================================================= */

// ---------- Constantes (reprises du script Python) ----------
const SUFFIXE_SANS_FCI   = "EN_ATTENTE_FCI";
const MARQUEUR_A_VALIDER = "A_Valider";
const LARGEUR_PREFIXE    = 3;
const SEPARATEUR_PREFIXE = " - ";
const PREFIXE_SANS_ORDRE = "ZZZ";

const DOSSIERS_BASE  = ["MA", "MB", "MC", "MD", "VUE_ENSEMBLE", "ETIQ_CABLE"];
const DOSSIERS_BOITE = ["CASSETTE", "BOITE", "MIRE", "ETIQ_BOITE"];

// ---------- DOM ----------
const $csvFile    = document.getElementById("csvFile");
const $rootName   = document.getElementById("rootName");
const $optPrefix  = document.getElementById("optPrefix");
const $optBpeBox  = document.getElementById("optBpeBoxes");
const $btnRun     = document.getElementById("btnRun");
const $btnClear   = document.getElementById("btnClear");
const $log        = document.getElementById("log");
const $progWrap   = document.getElementById("progressWrap");
const $progBar    = document.getElementById("progressBar");
const $statCh     = document.getElementById("statChambres");
const $statDos    = document.getElementById("statDossiers");

let csvContent = "";
let csvFileName = "";

// ---------- Log ----------
function log(msg, cls = "") {
  const time = new Date().toLocaleTimeString();
  const line = document.createElement("div");
  if (cls) line.className = "log-" + cls;
  line.textContent = `[${time}] ${msg}`;
  $log.appendChild(line);
  $log.scrollTop = $log.scrollHeight;
}
function logOk(m)   { log("✅ " + m, "ok"); }
function logErr(m)  { log("❌ " + m, "err"); }
function logInfo(m) { log("ℹ️ " + m, "info"); }
function logWarn(m) { log("⚠️ " + m, "warn"); }
function logClear() { $log.innerHTML = ""; }

// ---------- Utilitaires (repris du Python) ----------
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
    .replace(/îï/g, "i").replace(/ô/g, "o")
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

// ---------- Parser CSV simple ----------
function parseCSV(contenu, sep) {
  const lignes = [];
  let cur = "";
  let row = [];
  let inQuote = false;

  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    const next = contenu[i + 1];

    if (inQuote) {
      if (c === '"' && next === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cur += c; }
    } else {
      if (c === '"') { inQuote = true; }
      else if (c === sep) { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); lignes.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else { cur += c; }
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

// ---------- Lecture fichier ----------
$csvFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    csvContent = await file.text();
    csvFileName = file.name;
    const nbLignes = csvContent.split(/\r?\n/).length - 1;
    logOk(`CSV chargé : ${file.name} (${nbLignes} lignes approx.)`);
    $btnRun.disabled = false;
  } catch (err) {
    logErr("Lecture CSV impossible : " + err.message);
  }
});

$btnClear.addEventListener("click", () => logClear());

// ---------- Génération ----------
$btnRun.addEventListener("click", async () => {
  if (!csvContent) return;
  $btnRun.disabled = true;
  $progWrap.style.display = "block";
  $progBar.style.width = "0%";
  $statCh.textContent = "0";
  $statDos.textContent = "0";

  try {
    await genererZip();
  } catch (err) {
    logErr("Erreur : " + err.message);
    console.error(err);
  } finally {
    $btnRun.disabled = false;
  }
});

async function genererZip() {
  logInfo("Démarrage de la génération…");

  const sep = detecterDelimiteur(csvContent);
  const lignes = parseCSV(csvContent, sep);
  const rows = rowsToObjects(lignes);

  if (!rows.length) throw new Error("CSV vide");

  const entetes = Object.keys(rows[0]);
  const colCommune = trouverColonne(entetes, "COMMUNE");
  const colFci     = trouverColonne(entetes, "FCI", "N°_FCI", "N_FCI", "NUM_FCI")
                     || trouverColonneFuzzy(entetes, "fci");
  const colCable   = trouverColonne(entetes, "Câble", "CABLE", "Cable");
  const colCh1     = trouverColonne(entetes, "CODE_CH1", "CODE CH1", "CODE-CH1");
  const colBpe     = trouverColonne(entetes, "BPE");
  const colOrdre   = trouverColonne(entetes, "Ordre", "ORDRE", "N° ordre");

  if (!colCh1) throw new Error("Colonne CODE_CH1 introuvable dans le CSV");

  logInfo(`Colonnes détectées : CH1=${colCh1}, Commune=${colCommune || "-"}, ` +
          `FCI=${colFci || "-"}, Câble=${colCable || "-"}, BPE=${colBpe || "-"}, Ordre=${colOrdre || "-"}`);

  // Construction liste chambres
  const chambres = [];
  for (const r of rows) {
    const commune = nettoyerNom(r[colCommune] || "");
    const fci     = colFci ? nettoyerNom(r[colFci] || "") : "";
    const cable   = colCable ? nettoyerNom(r[colCable] || "") : "";
    const ch1     = nettoyerNom(r[colCh1] || "");
    const bpe     = colBpe ? nettoyerNom(r[colBpe] || "") : "";
    const ordre   = colOrdre ? nettoyerNom(r[colOrdre] || "") : "";
    if (!commune && !ch1) continue;
    chambres.push({ commune, fci: fci || "Sans_FCI", cable, ch1, bpe, ordre });
  }

  if (!chambres.length) throw new Error("Aucune chambre valide dans le CSV");
  logOk(`${chambres.length} chambres à traiter`);

  // Tri par ordre
  const getOrdre = (c) => {
    const n = safeInt(c.ordre);
    return n !== null ? n : 999999;
  };
  chambres.sort((a, b) => getOrdre(a) - getOrdre(b));

  // Préparer le ZIP
  const zip = new JSZip();
  const rootFolder = $rootName.value.trim() || "SnakePhotos";
  const rootZip = zip.folder(rootFolder);

  // Créer les sous-dossiers vides (via fichier .keep pour forcer l'entrée)
  function creerDossierVide(folderPath) {
    rootZip.file(folderPath + "/.keep", "");
  }

  let dossiersCrees = 0;
  const total = chambres.length;

  for (let i = 0; i < chambres.length; i++) {
    const data = chambres[i];

    const niveau1 = data.fci !== "Sans_FCI"
      ? `${data.commune}-${data.fci}`
      : `${data.commune}-${SUFFIXE_SANS_FCI}`;

    let chemin = niveau1;
    if (data.cable) chemin += "/" + data.cable;

    const prefixe = $optPrefix.checked ? construirePrefixeOrdre(data.ordre) : "";
    let nomChambre = data.ch1 ? `CH ${data.ch1}` : "CH";
    if (!data.ordre) nomChambre += ` (${MARQUEUR_A_VALIDER})`;
    if (data.bpe)    nomChambre += ` (${data.bpe})`;

    const cheminCh = chemin + "/" + prefixe + nomChambre;

    // Sous-dossiers de base
    for (const sous of DOSSIERS_BASE) {
      creerDossierVide(cheminCh + "/" + sous);
      dossiersCrees++;
    }

    // Sous-dossiers boîte si BPE
    if (data.bpe && $optBpeBox.checked) {
      for (const sous of DOSSIERS_BOITE) {
        creerDossierVide(cheminCh + "/" + sous);
        dossiersCrees++;
      }
    }

    // Mettre à jour UI tous les 10 items
    if (i % 10 === 0 || i === total - 1) {
      const pct = Math.round(((i + 1) / total) * 100);
      $progBar.style.width = pct + "%";
      $statCh.textContent = i + 1;
      $statDos.textContent = dossiersCrees;
      await new Promise(r => setTimeout(r, 0)); // laisser respirer l'UI
    }
  }

  logOk(`Arborescence construite : ${dossiersCrees} dossiers`);

  // Ajouter un fichier README explicatif
  const readme = [
    "====================================================",
    "ARBORESCENCE PHOTOS CHAMBRES",
    "====================================================",
    "",
    `Généré le : ${new Date().toLocaleString()}`,
    `Source CSV : ${csvFileName}`,
    `Nombre de chambres : ${chambres.length}`,
    `Nombre de dossiers : ${dossiersCrees}`,
    "",
    "STRUCTURE ATTENDUE DANS CHAQUE DOSSIER CHAMBRE :",
    "",
    ...DOSSIERS_BASE.map(d => `  - ${d}`),
    "",
    "ET SI BPE (Boîte) :",
    "",
    ...DOSSIERS_BOITE.map(d => `  - ${d}`),
    "",
    "Dézipper ce dossier à la racine de la tablette/PC, puis",
    "copier vos photos dans le dossier correspondant.",
    "",
  ].join("\n");
  rootZip.file("README.txt", readme);

  logInfo("Compression ZIP en cours…");
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => {
      $progBar.style.width = meta.percent.toFixed(0) + "%";
    }
  );

  // Télécharger
  const safeName = (rootFolder || "SnakePhotos").replace(/[^\w\-]/g, "_");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}_${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  logOk(`ZIP téléchargé : ${a.download}`);
  logInfo(`Taille : ${(blob.size / 1024).toFixed(1)} Ko`);
}