import {test,expect} from "@playwright/test";

const plane={model:"seedance-2",prompt:{text:"A man walks in a desert mountain landscape."},settings:{duration:5,resolution:"720p",aspectRatio:"16:9",generateAudio:true},media:{}};
test("a paid request requires an input-bound approval and its receipt is replayed without a second job",async({request})=>{
  const id=crypto.randomUUID();
  expect((await request.post("/api/generations",{data:{plane,idempotencyKey:id}})).status()).toBe(428);
  const quoted=await request.post("/api/generations/estimate",{data:{plane}});
  expect(quoted.ok()).toBe(true);const quote=await quoted.json();
  expect(quote.totalUsd).toBe(.05);
  const accepted=await request.post("/api/generations",{data:{plane,idempotencyKey:id,approval:quote.token}});
  expect(accepted.ok()).toBe(true);const receipt=await accepted.json();
  const replay=await request.post("/api/generations",{data:{plane,idempotencyKey:id}});
  expect((await replay.json()).requestId).toBe(receipt.requestId);
  expect((await request.post("/api/generations",{data:{plane,idempotencyKey:crypto.randomUUID(),approval:quote.token}})).status()).toBe(409);
  const altered={...plane,settings:{...plane.settings,duration:15}};
  expect((await request.post("/api/generations",{data:{plane:altered,idempotencyKey:crypto.randomUUID(),approval:quote.token}})).status()).toBe(428);
});

test("cost review can cancel before submission, then approves one quoted generation",async({page})=>{
  let submitted=0;page.on("request",request=>{if(request.url().endsWith("/api/generations"))submitted++;});
  await page.goto("/");await page.getByLabel("Generation model").selectOption("seedance-2");
  await page.getByLabel("Describe your scene").fill(plane.prompt.text);
  await page.getByRole("button",{name:"Generate video",exact:true}).click();
  const review=page.getByRole("dialog",{name:"Review generation cost"});
  await expect(review).toBeVisible();await expect(review).toContainText("$0.05");expect(submitted).toBe(0);
  await review.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(review).toHaveCount(0);expect(submitted).toBe(0);
  await page.getByRole("button",{name:"Generate video",exact:true}).click();
  await page.getByRole("button",{name:"Approve $0.05 estimate",exact:true}).click();
  await expect(page.getByRole("button",{name:"Inspect latest creation"})).toBeVisible();expect(submitted).toBe(1);
  await page.getByRole("button",{name:"Usage",exact:true}).click();
  await page.getByLabel("Search usage").fill("desert mountain");
  await expect(page.locator(".usage-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".usage-table tbody tr")).toContainText("720p");
});

test("server-side request budget blocks generation and persists independently for the API key",async({request})=>{
  const original=await(await request.get("/api/usage")).json();
  try{
    expect((await request.post("/api/usage",{data:{requestLimitUsd:.02,dailyLimitUsd:1}})).ok()).toBe(true);
    const quote=await(await request.post("/api/generations/estimate",{data:{plane}})).json();
    const response=await request.post("/api/generations",{data:{plane,idempotencyKey:crypto.randomUUID(),approval:quote.token}});
    expect(response.status()).toBe(402);expect((await response.json()).error).toContain("budget");
    const reloaded=await(await request.get("/api/usage")).json();expect(reloaded.requestLimitUsd).toBe(.02);
  }finally{await request.post("/api/usage",{data:{requestLimitUsd:original.requestLimitUsd,dailyLimitUsd:original.dailyLimitUsd}});}
});

test("tool search opens a saved new film and usage remains usable on a narrow screen",async({page})=>{
  await page.goto("/");await page.getByRole("button",{name:/Search tools/}).click();
  await page.getByLabel("Find a tool").fill("new film");await page.getByLabel("Find a tool").press("Enter");
  await expect(page.getByLabel("Film title")).toBeVisible();
  await page.getByRole("button",{name:"Usage",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Usage & budgets"})).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)).toBe(false);
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export usage CSV"}).click();
  expect((await download).suggestedFilename()).toBe("jenera-usage.csv");
  await page.reload();await expect(page.getByRole("heading",{name:"Usage & budgets"})).toBeVisible();
});
