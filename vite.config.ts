import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";
import fs from "fs";

/**
 * closeBundle 阶段后处理，实现真正的单文件输出：
 * 1. 将 ode-worker.js 内联为 Blob URL（经典 Worker）
 * 2. 将所有 assets/*.json 内联为内存数据，注入 fetch 拦截器
 * 3. 删除不再需要的独立文件
 *
 * 必须在 viteSingleFile 之后运行，因为 singlefile 已将 JS/CSS 内联，
 * 且 closeBundle 在所有文件写盘后才触发。
 */
function inlineAll(): Plugin {
  return {
    name: "inline-all",
    apply: "build",
    enforce: "post",

    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      if (!fs.existsSync(distDir)) return;

      const htmlPath = path.join(distDir, "index.html");
      if (!fs.existsSync(htmlPath)) return;

      let html = fs.readFileSync(htmlPath, "utf-8");

      // ─── 1. 内联 Worker ───────────────────────────────
      const files = fs.readdirSync(distDir);
      const workerFile = files.find(
        (f) => f.startsWith("ode-worker-") && f.endsWith(".js"),
      );

      if (workerFile) {
        const workerCode = fs.readFileSync(path.join(distDir, workerFile), "utf-8");
        const escaped = JSON.stringify(workerCode);
        const workerPattern = new RegExp(
          `new Worker\\(new URL\\(""\\+new URL\\("${escapeRegex(workerFile)}"\\s*,\\s*import\\.meta\\.url\\)\\.href\\s*,\\s*import\\.meta\\.url\\)\\s*,\\s*\\{type:"module"\\}\\)`,
          "g",
        );
        const count = (html.match(workerPattern) || []).length;
        html = html.replace(
          workerPattern,
          `new Worker(URL.createObjectURL(new Blob([${escaped}],{type:"application/javascript"})))`,
        );
        fs.unlinkSync(path.join(distDir, workerFile));
        console.log(`[inline-all] Worker 内联完成 (${count} 处替换)，已删除 ${workerFile}`);
      }

      // ─── 2. 内联预计算 JSON ───────────────────────────
      const assetsDir = path.join(distDir, "assets");
      if (fs.existsSync(assetsDir)) {
        const jsonFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith(".json"));
        if (jsonFiles.length > 0) {
          const dataMap: Record<string, string> = {};
          for (const f of jsonFiles) {
            const content = fs.readFileSync(path.join(assetsDir, f), "utf-8");
            dataMap[`./assets/${f}`] = content; // 保留原始字符串，避免 NaN/Infinity 解析报错
            fs.unlinkSync(path.join(assetsDir, f));
          }

          // 注入 fetch 拦截器 —— 在所有代码之前
          const interceptor = `
<script>
(function(){
var __PD=${JSON.stringify(dataMap)};
var __origFetch=window.fetch;
window.fetch=function(url,opts){
  var u=typeof url==='string'?url:(url instanceof Request?url.url:'');
  if(u&&__PD.hasOwnProperty(u)){
    return Promise.resolve(new Response(__PD[u],{status:200,headers:{"Content-Type":"application/json"}}));
  }
  return __origFetch.call(this,url,opts);
};
})();
<\/script>`;

          // 插入到第一个 <script 标签之前（不依赖 type="module"）
          html = html.replace("<script", interceptor + "\n<script");
          console.log(`[inline-all] JSON 内联完成 (${jsonFiles.length} 个文件)`);
        }

        // 清理空的 assets 目录
        const remaining = fs.readdirSync(assetsDir);
        if (remaining.length === 0) fs.rmdirSync(assetsDir);
      }

      // ─── 3. 同时修正 favicon 为空 data URL（可选） ────
      html = html.replace('href="/favicon.svg"', 'href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎯</text></svg>"');

      fs.writeFileSync(htmlPath, html, "utf-8");

      const sizeKB = (fs.statSync(htmlPath).size / 1024).toFixed(0);
      console.log(`[inline-all] 最终单文件: ${sizeKB} KB`);
    },
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile(), inlineAll()],
  server: {
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    format: "iife",
  },
  build: {
    outDir: "dist",
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: [],
  },
});
