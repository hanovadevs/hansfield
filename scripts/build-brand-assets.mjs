// Render the generated Jenera mark into the required delivery formats.
// The original transparent artwork remains unchanged in public/brand/.
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const mark = `data:image/png;base64,${(await readFile(resolve(root, "public/brand/jenera-mark.png"))).toString("base64")}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const img = `<img src="${mark}" alt="" />`;
async function render(file, width, height, body, css, transparent = false) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><head><style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}body{font-family:Arial,sans-serif;color:#233c32}${css}</style></head><body>${body}</body></html>`,
  );
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(images.map((image) => image.decode()));
  });
  await page.screenshot({
    path: resolve(root, file),
    omitBackground: transparent,
  });
  console.log(`${file} ${width}×${height}`);
}
try {
  await render(
    "public/brand/jenera-mark-small.png",
    128,
    128,
    img,
    "body{display:grid;place-items:center}img{width:100%;height:100%;object-fit:contain}",
    true,
  );
  const iconCss =
    "body{display:grid;place-items:center;background:#f5f4ef}img{width:78%;height:78%;object-fit:contain}";
  for (const size of [192, 512])
    await render(`public/icon-${size}.png`, size, size, img, iconCss);
  await render(
    "public/icon-maskable-512.png",
    512,
    512,
    img,
    iconCss.replace("78%", "70%").replace("78%", "70%"),
  );
  await render("src/app/icon.png", 64, 64, img, iconCss);
  await render("src/app/apple-icon.png", 180, 180, img, iconCss);
  await render(
    "public/brand/jenera-logo.png",
    1000,
    260,
    `${img}<span>Jenera</span>`,
    "body{display:flex;align-items:center;justify-content:center;gap:18px}img{width:200px;height:200px;object-fit:contain}span{font-size:146px;font-weight:600;letter-spacing:-9px}",
    true,
  );
  await render(
    "public/og.png",
    1200,
    630,
    `<div class="top">${img}<span>Jenera</span></div><div><p class="label">FILM STUDIO</p><h1>Connected shots.<br>One story.</h1><p class="sub">Create · Direct · Cut · Export</p></div><div class="ribbon">${img}</div>`,
    "body{padding:58px 70px;background:#f5f4ef;position:relative}.top{display:flex;align-items:center;gap:12px}.top img{width:68px;height:68px}.top span{font-size:36px;font-weight:600;letter-spacing:-2px}.label{font-size:13px;letter-spacing:3px;margin-top:50px;color:#61705e}h1{font-size:74px;line-height:1.07;letter-spacing:-4px;margin:20px 0 24px}.sub{font-size:17px;color:#61705e}.ribbon{position:absolute;right:28px;top:100px;width:425px;height:425px}.ribbon img{width:100%;height:100%}",
  );
  const brandGuide = `<div class="identity">${img}<h1>Jenera</h1><p>Film Studio</p></div><div class="tiles"><div style="background:#233c32;color:#fffefa">Forest ink<br><small>#233C32</small></div><div style="background:#8c9c82;color:#233c32">Sage<br><small>#8C9C82</small></div><div style="background:#f5f4ef;color:#233c32">Studio ivory<br><small>#F5F4EF</small></div></div>`;
  await render(
    "public/brand/jenera-brand-board.png",
    1200,
    900,
    brandGuide,
    "body{padding:60px;background:#fffefa}.identity{text-align:center}.identity img{width:230px;height:260px;object-fit:contain}h1{font-size:88px;letter-spacing:-5px;margin:0}p{font-size:16px;letter-spacing:3px;text-transform:uppercase;color:#61705e}.tiles{display:flex;gap:20px;margin-top:60px}.tiles div{flex:1;height:160px;padding:30px;font-size:22px;border-radius:14px}small{font-size:13px;line-height:3}",
  );
} finally {
  await browser.close();
}
