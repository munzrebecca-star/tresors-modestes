require("dotenv").config({ quiet: true });
const fs = require("node:fs");
const path = require("node:path");
const categories = require("./src/_data/categories.json");

const AIRTABLE_BASE_ID = "app4uktFnlj9LU7Wj";
const AIRTABLE_TABLE_ID = "tblRQZacASPJ1BZDG";

const NOM_VERS_SLUG_CATEGORIE = {
  "Figurines & statuettes": "figurines-et-statuettes",
  "Images & affiches": "images-et-affiches",
  "Objets décoratifs": "objets-decoratifs",
};

function slugify(texte) {
  return texte
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Renvoie la valeur d'un champ produit, que la page vienne d'un fichier
// Markdown (données directement sur l'item) ou d'Airtable (données sous `p`).
function valeurProduit(item, cle) {
  const d = item.data;
  return d.p ? d.p[cle] : d[cle];
}

async function recupererProduitsAirtable() {
  const jeton = process.env.AIRTABLE_TOKEN;
  if (!jeton) {
    console.warn(
      "[Airtable] AIRTABLE_TOKEN absent : les produits Airtable ne seront pas chargés sur ce build."
    );
    return [];
  }

  const dossierPhotos = path.join(__dirname, "src/images/produits-airtable");
  fs.mkdirSync(dossierPhotos, { recursive: true });

  let enregistrements = [];
  let offset;
  try {
    do {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`);
      if (offset) url.searchParams.set("offset", offset);
      const reponse = await fetch(url, { headers: { Authorization: `Bearer ${jeton}` } });
      if (!reponse.ok) {
        console.error("[Airtable] Erreur API :", reponse.status, await reponse.text());
        return [];
      }
      const donnees = await reponse.json();
      enregistrements.push(...donnees.records);
      offset = donnees.offset;
    } while (offset);
  } catch (erreur) {
    console.error("[Airtable] Impossible de contacter l'API :", erreur.message);
    return [];
  }

  const slugsUtilises = new Set();
  const produits = [];

  for (const enregistrement of enregistrements) {
    const champs = enregistrement.fields;
    if (!champs.Titre) continue;

    const slugDeBase = slugify(champs.Titre);
    let slugFinal = slugDeBase;
    let compteur = 2;
    while (slugsUtilises.has(slugFinal)) {
      slugFinal = `${slugDeBase}-${compteur}`;
      compteur++;
    }
    slugsUtilises.add(slugFinal);

    const photos = [];
    for (const [index, piece] of (champs.Photos || []).entries()) {
      const correspondance = piece.filename && piece.filename.match(/\.[a-zA-Z0-9]+$/);
      const extension = correspondance ? correspondance[0].toLowerCase() : ".jpg";
      const nomFichier = `${slugFinal}-${index + 1}${extension}`;
      const cheminLocal = path.join(dossierPhotos, nomFichier);
      if (!fs.existsSync(cheminLocal)) {
        try {
          const reponseImage = await fetch(piece.url);
          const tampon = Buffer.from(await reponseImage.arrayBuffer());
          fs.writeFileSync(cheminLocal, tampon);
        } catch (erreur) {
          console.error(`[Airtable] Échec du téléchargement de la photo ${nomFichier} :`, erreur.message);
          continue;
        }
      }
      photos.push(`/images/produits-airtable/${nomFichier}`);
    }

    produits.push({
      slug: slugFinal,
      titre: champs.Titre,
      reference: champs.Reference || "",
      prix: champs.Prix || 0,
      categorie: NOM_VERS_SLUG_CATEGORIE[champs.Categorie] || "",
      dimensions: champs.Dimensions || "",
      etat: champs.Etat || "",
      histoireHtml: (champs.Histoire || "")
        .split(/\n\s*\n/)
        .filter((paragraphe) => paragraphe.trim())
        .map((paragraphe) => `<p>${paragraphe.trim()}</p>`)
        .join("\n"),
      vendu: !!champs.Vendu,
      photos,
    });
  }

  return produits;
}

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");

  let produitsAirtableCache = [];
  eleventyConfig.on("eleventy.before", async () => {
    produitsAirtableCache = await recupererProduitsAirtable();
  });
  eleventyConfig.addGlobalData("produitsAirtable", () => produitsAirtableCache);

  eleventyConfig.addGlobalData("annee", () => new Date().getFullYear());

  eleventyConfig.addFilter("prixFormate", function (prix) {
    if (prix === undefined || prix === null || prix === "") return "";
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(prix);
  });

  eleventyConfig.addFilter("nomCategorie", function (slug) {
    const trouvee = categories.find((c) => c.slug === slug);
    return trouvee ? trouvee.nom : slug;
  });

  eleventyConfig.addCollection("produitsDisponibles", function (collectionApi) {
    return collectionApi.getFilteredByTag("produit").filter((p) => !valeurProduit(p, "vendu"));
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
};
