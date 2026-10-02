import { test, expect, type Page } from '@playwright/test';
type Snapshot = { ready:boolean; running:boolean; paused:boolean; x:number; y:number; vx:number; vy:number; grounded:boolean; seconds:number; notes:number; lives:number; checkpoint:boolean; enemies:{x:number;active:boolean}[]; movingX:number };
const snapshot = (page:Page):Promise<Snapshot> => page.evaluate(() => (window as any).__forest.snapshot());
async function start(page:Page) { await page.goto('/'); await page.getByRole('button',{name:'開始冒險'}).click(); await expect.poll(async()=> (await snapshot(page)).grounded).toBe(true); }
async function walkUntil(page:Page, target:number, jumpStumps=true) {
  let held=false,releaseAt=0;
  const began=Date.now();
  while(Date.now()-began<14000){
    const s=await snapshot(page);if(s.x>=target||!s.running)break;
    await page.keyboard.down('ArrowRight');
    if(held&&Date.now()>releaseAt){await page.keyboard.up('Space');held=false;}
    if(jumpStumps&&s.grounded&&!held&&[250,950,1810,2530].some(x=>x-s.x>0&&x-s.x<58)) {await page.keyboard.down('Space');held=true;releaseAt=Date.now()+850;}
    await page.waitForTimeout(35);
  }
  await page.keyboard.up('ArrowRight');await page.keyboard.up('Space');
}
test('loads all assets, collects notes, supports jump height, pause and reset',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await start(page);
  await expect(page.locator('img')).toHaveCount(12);
  expect(await page.locator('img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
  // Stop before the stump without the helper jumping; this test presses jump itself.
  await walkUntil(page,196,false);expect((await snapshot(page)).notes).toBe(1);
  await page.keyboard.down('Space');await page.waitForTimeout(200);await page.keyboard.up('Space');
  expect((await snapshot(page)).y).toBeLessThan(255);
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'繼續冒險'})).toBeVisible();
  const paused=await snapshot(page);await page.waitForTimeout(400);const after=await snapshot(page);
  expect(after.seconds).toBe(paused.seconds);expect(after.x).toBe(paused.x);expect(after.movingX).toBe(paused.movingX);
  await page.getByRole('button',{name:'繼續冒險'}).click();await expect.poll(async()=> (await snapshot(page)).seconds).toBeGreaterThan(paused.seconds);
  await page.getByRole('button',{name:'重新開始遊戲'}).click();expect((await snapshot(page)).notes).toBe(0);expect((await snapshot(page)).lives).toBe(3);
  await page.waitForTimeout(1150);await expect(page.locator('#timer')).toHaveText('00:01');
  expect(errors).toEqual([]);
});
test('three falls lead to retry, then reset restores the whole level',async({page})=>{
  await start(page);
  for(let lives=2;lives>=0;lives--){
    await walkUntil(page,735);
    await expect.poll(async()=> (await snapshot(page)).lives).toBe(lives);
  }
  await expect(page.getByRole('heading',{name:'再試一次吧。'})).toBeVisible();
  expect((await snapshot(page)).running).toBe(false);
  await page.getByRole('button',{name:'重新出發'}).click();const s=await snapshot(page);
  expect(s.running).toBe(true);expect(s.lives).toBe(3);expect(s.notes).toBe(0);expect(s.checkpoint).toBe(false);expect(s.x).toBeLessThan(110);
});
test('complete the actual level using keyboard input and save the result',async({page})=>{
  await start(page);let held=false,releaseAt=0;let reachedCheckpoint=false;const began=Date.now();
  while(Date.now()-began<50000){
    const s=await snapshot(page);reachedCheckpoint ||= s.checkpoint;if(!s.running)break;
    await page.keyboard.down('ArrowRight');
    if(held&&Date.now()>=releaseAt){await page.keyboard.up('Space');held=false;}
    const jump=[250,950,1810,2530].some(x=>x-s.x>0&&x-s.x<58)||[700,1510,2310].some(x=>x-s.x>0&&x-s.x<31)||s.enemies.some(e=>e.active&&e.x-s.x>0&&e.x-s.x<58);
    if(s.grounded&&!held&&jump){await page.keyboard.down('Space');held=true;releaseAt=Date.now()+850;}
    await page.waitForTimeout(35);
  }
  await page.keyboard.up('ArrowRight');await page.keyboard.up('Space');
  await expect(page.getByRole('heading',{name:'森林聽見你了！'})).toBeVisible();
  const s=await snapshot(page);expect(reachedCheckpoint).toBe(true);expect(s.x).toBeGreaterThan(3105);expect(s.notes).toBeGreaterThanOrEqual(10);expect(s.lives).toBeGreaterThan(0);
  const best=await page.evaluate(()=>JSON.parse(localStorage.getItem('echo-forest-best-v1')||'null'));expect(best.notes).toBe(s.notes);expect(best.seconds).toBeGreaterThan(10);
  await page.screenshot({path:'tests/evidence/completed.png',fullPage:true});
  await page.getByRole('button',{name:'再冒險一次'}).click();expect((await snapshot(page)).checkpoint).toBe(false);expect((await snapshot(page)).notes).toBe(0);
});
test('eight kart views are selectable and workshop pauses then resumes play',async({page})=>{
  await start(page);await page.getByRole('button',{name:'賽車工坊'}).click();expect((await snapshot(page)).paused).toBe(true);
  const views=['正面','右前','右側','右後','背面','左後','左側','左前'];
  for(const view of views){await page.getByRole('button',{name:view,exact:true}).click();await expect(page.locator('#direction-label')).toHaveText(view);await expect(page.getByRole('button',{name:view,exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('#kart-large')).toHaveAttribute('aria-label',`Anbo 賽車${view}`);}
  const imageUrl=await page.locator('.workshop-note a[download]').getAttribute('href');expect((await page.request.get(imageUrl!)).ok()).toBe(true);
  await page.screenshot({path:'tests/evidence/kart-eight-directions.png',fullPage:true});
  await page.keyboard.press('Escape');await expect(page.locator('#kart-dialog')).not.toBeVisible();await expect.poll(async()=> (await snapshot(page)).paused).toBe(false);
});
test('mobile touch controls move, jump and release without layout overflow',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});const page=await context.newPage();await page.goto('http://127.0.0.1:5173');
  await page.getByRole('button',{name:'開始冒險'}).click();await expect(page.getByRole('button',{name:'向右移動'})).toBeVisible();
  const right=page.getByRole('button',{name:'向右移動'}),jump=page.getByRole('button',{name:'跳躍',exact:true});
  // Real simultaneous touch contacts validate pointer capture, not synthetic unregistered IDs.
  await right.scrollIntoViewIfNeeded();
  const rb=(await right.boundingBox())!,jb=(await jump.boundingBox())!;
  const cdp=await context.newCDPSession(page);
  const r={x:rb.x+rb.width/2,y:rb.y+rb.height/2,id:1};
  const j={x:jb.x+jb.width/2,y:jb.y+jb.height/2,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r]});
  await page.waitForTimeout(450);expect((await snapshot(page)).x).toBeGreaterThan(140);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[r,j]});await page.waitForTimeout(230);expect((await snapshot(page)).y).toBeLessThan(255);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(400);expect(Math.abs((await snapshot(page)).vx)).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'tests/evidence/mobile-playing.png',fullPage:true});
  await page.getByRole('button',{name:'賽車工坊'}).click();await expect(page.getByRole('button',{name:'左前',exact:true})).toBeVisible();await page.getByRole('button',{name:'關閉賽車工坊'}).click();
  await context.close();
});
