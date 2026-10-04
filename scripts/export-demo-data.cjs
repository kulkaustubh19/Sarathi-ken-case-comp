// Generate local fictional report and prescription files for the demo.
const fs = require("node:fs/promises");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) { return originalResolve.call(this, request.startsWith("@/") ? path.join(process.cwd(), "src", request.slice(2)) : request, ...args); };
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(require("node:fs").readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);

async function main() {
  const { demoSamples } = require("../src/lib/server/demo-samples.ts");
  const destination = path.join(process.cwd(), "output", "demo-data");
  const retained = [demoSamples[0], demoSamples.find(item => item.type === "Prescription")];
  let count = 0;
  for (const [patient, age, sex] of [["Priya Rao", 42, "Female"], ["Rohan Rao", 67, "Male"]]) {
    for (const item of demoSamples.filter(item => !retained.includes(item))) {
      const oldFile = path.resolve(destination, patient, item.date.slice(0, 4), item.type, `${item.type.replaceAll(" ", "_")}_${item.doctor.replaceAll(" ", "_")}_${item.date}.txt`);
      if (!oldFile.startsWith(path.resolve(destination) + path.sep)) throw new Error("Demo file escaped the output folder.");
      const oldText = await fs.readFile(oldFile, "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
      if (/^(HEALTHNEST|SARATHI) PROTOTYPE — FICTIONAL DEMO RECORD/.test(oldText)) await fs.unlink(oldFile);
    }
    for (const item of retained) {
      const folder = path.join(destination, patient, item.date.slice(0, 4), item.type);
      await fs.mkdir(folder, { recursive: true });
      const filename = `${item.type.replaceAll(" ", "_")}_${item.doctor.replaceAll(" ", "_")}_${item.date}.txt`;
      const clinical = item.note.replaceAll("Age: 42", `Age: ${age}`).replaceAll("Sex: Female", `Sex: ${sex}`);
      const text = `SARATHI PROTOTYPE — FICTIONAL DEMO RECORD\nPatient: ${patient}\nClinician: ${item.doctor}\nCity: ${item.city}\nStudy: ${item.label}\nRecord date: ${item.date}\nDocument type: ${item.type}\n\n${clinical}\n\nAll people, observations and medicine histories are synthetic. No dose, timing, treatment or test recommendation is made.\n`;
      await fs.writeFile(path.join(folder, filename), text, "utf8"); count++;
    }
  }
  console.log(`Wrote ${count} varied fictional reports/prescriptions to output/demo-data.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
