import babel from "rollup-plugin-babel";
import typescript from "rollup-plugin-typescript2";
import commonjs from "rollup-plugin-commonjs";
import { DEFAULT_EXTENSIONS } from "@babel/core";

const config = {
  input: "./src/index.ts",
  output: {
    file: "./dist/index.js",
    format: "cjs",
    interop: false,
    compact: true,
    esModule: false,
    strict: false
  },
  watch: {
    include: "./src/**"
  },
  plugins: [
    typescript({
      outDir: "dist",
      module: "ESNext",
      target: "ESNext",
      rollupCommonJSResolveHack: true,
      clean: true,
      check: true
    }),
    commonjs({
      extensions: [".js", ".ts", ".graphql"]
    }),
    babel({
      extensions: [...DEFAULT_EXTENSIONS, "ts", "graphql"],
      exclude: "node_modules/**"
    })
  ]
};

export default config;
