const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
delete process.env.DELHIVERY_MAPS_TOKEN;
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(this, request.startsWith("@/") ? path.join(process.cwd(), "src", request.slice(2)) : request, ...args);
};
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
require("../src/rails/gnani/flow.test.ts");
require("../src/rails/gnani/twilio.test.ts");
require("../src/rails/delhivery/location.test.ts");

