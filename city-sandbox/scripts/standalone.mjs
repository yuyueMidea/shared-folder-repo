import fs from "node:fs";
let html = fs.readFileSync("dist/index.html", "utf8");
html = html.replace(
  /<script type="module" crossorigin src="([^"]+)"><\/script>/,
  (_, src) =>
    `<script type="module">${fs.readFileSync("dist/" + src.replace(/^\//, ""), "utf8").replaceAll("</script", "<\\/script")}</script>`,
);
html = html.replace(
  /<link rel="stylesheet" crossorigin href="([^"]+)">/,
  (_, src) =>
    `<style>${fs.readFileSync("dist/" + src.replace(/^\//, ""), "utf8")}</style>`,
);
fs.mkdirSync("play", { recursive: true });
fs.writeFileSync("play/START.html", html);
console.log("Offline standalone: play/START.html");
