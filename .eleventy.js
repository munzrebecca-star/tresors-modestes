const categories = require("./src/_data/categories.json");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/images");

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
    return collectionApi.getFilteredByTag("produit").filter((p) => !p.data.vendu);
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
