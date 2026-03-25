import {
  defaultDemoAdapter,
  parseDemoAdapterName,
  runAvailableUnifiedAuthDemos,
  runUnifiedAuthDemo,
} from "./demo-runtime";

const adapterArg = process.argv.slice(2).find((value) => value !== "--");
const adapterName = parseDemoAdapterName(adapterArg ?? process.env.FARM_ORM_DEMO_ADAPTER);
const result =
  adapterName === "all"
    ? await runAvailableUnifiedAuthDemos()
    : await runUnifiedAuthDemo(adapterName);

console.log(
  JSON.stringify(
    {
      ok: true,
      status: "passed",
      adapter: adapterName ?? defaultDemoAdapter,
      result,
    },
    null,
    2,
  ),
);
