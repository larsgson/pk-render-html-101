const {SofriaRenderFromProskomma} = require("proskomma-json-tools");
const sofria2WebActions = require('./sofria2web')
const fse = require("fs-extra");
const path = require("path");
const {Proskomma} = require("proskomma-core")

const succinct = fse.readJsonSync(path.resolve("./data/succinct.json"))
const pk = new Proskomma([
  {
      name: "source",
      type: "string",
      regex: "^[^\\s]+$"
  },
  {
      name: "project",
      type: "string",
      regex: "^[^\\s]+$"
  },
  {
      name: "revision",
      type: "string",
      regex: "^[^\\s]+$"
  },
]);

pk.loadSuccinctDocSet(succinct)

const query = `{ documents { id bookCode: header( id: "bookCode") } }`
const result = pk.gqlQuerySync(query)
const docId = result.data.documents.filter(d=> d.bookCode === 'TIT')[0].id

const renderer = new SofriaRenderFromProskomma({
  proskomma: pk,
  actions: sofria2WebActions,
  debugLevel: 0
});

const config = {
  showWordAtts: true,
  showTitles: true,
  showHeadings: true,
  showIntroductions: true,
  showFootnotes: true,
  showXrefs: true,
  showParaStyles: true,
  showCharacterMarkup: true,
  showChapterLabels: true,
  showVersesLabels: true
};
const output = {};
try {
  renderer.renderDocument(
      {
          docId,
          config,
          output,
      },
  );
} catch (err) {
  console.log("Renderer", err);
  throw err;
}
console.log(output.paras)
