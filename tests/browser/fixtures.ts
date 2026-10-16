import {test as base,expect} from "@playwright/test";

export const test=base.extend<{autoApproveSpend:boolean}>({
  autoApproveSpend:[true,{option:true}],
  page:async({page,autoApproveSpend},use)=>{
    if(autoApproveSpend) await page.addLocatorHandler(page.getByRole("dialog",{name:"Review generation cost"}),async()=>{
      await page.getByRole("button",{name:/^Approve .* estimate$/}).click();
    });
    await use(page);
  },
});
export {expect};
