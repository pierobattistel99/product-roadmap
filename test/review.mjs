/**
 * Feature review for Roadmap Snapshot Studio.
 *
 *   npm --prefix test install
 *   npm --prefix test test
 *
 * Drives the built index.html in Chromium and asserts every behaviour the
 * tool promises: painting, the eraser, undo, milestones, presentation mode,
 * exports, persistence and the narrow-window rules.
 *
 * Env:
 *   CHROMIUM       path to a Chromium binary (default: Playwright's own)
 *   PAGE_URL       page under test (default: file://<repo>/index.html)
 *   H2C_PATH       local html2canvas bundle, for sandboxes with no CDN access
 *   JSPDF_PATH     local jsPDF bundle, same reason
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = process.env.PAGE_URL || 'file://' + path.join(ROOT, 'index.html');
const results = []; let pageErrors = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail: detail ?? '' });

const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
const p = await ctx.newPage();
p.on('pageerror', e => pageErrors.push(String(e.message)));
await p.goto(PAGE);
if (process.env.H2C_PATH) await p.addScriptTag({ path: process.env.H2C_PATH });
if (process.env.JSPDF_PATH) await p.addScriptTag({ path: process.env.JSPDF_PATH });
await p.waitForTimeout(1200);


const Q = (s) => p.evaluate(s);

// ---------- 1. boot ----------
check('boot: slide rendered', (await Q(`document.querySelectorAll('.brow--data').length`)) === 9);
check('boot: library loaded', (await Q(`document.getElementById('libCount').textContent`)) === '12 initiatives');
check('boot: undo starts disabled', await Q(`document.getElementById('btnUndo').disabled`));

// ---------- 2. ERASER (the reported bug) ----------
await p.click('.brush[data-brush=""]');
await p.waitForTimeout(150);
check('eraser: stays selected after click',
  await Q(`document.querySelector('.brush[data-brush=""]').getAttribute('aria-pressed') === 'true'`),
  'was reverting to Discovery');
// erase a populated cell
const before = await Q(`document.querySelectorAll('.brow--data[data-row="0"] .chip').length`);
await p.click('.cell[data-row="0"][data-col="1"]');
await p.waitForTimeout(200);
const afterErase = await Q(`document.querySelectorAll('.brow--data[data-row="0"] .chip').length`);
check('eraser: removes a chip on click', afterErase === before - 1, `${before} -> ${afterErase}`);
// drag-erase
await p.click('.brush[data-brush=""]');
const e1 = await p.locator('.cell[data-row="2"][data-col="0"]').boundingBox();
const e2 = await p.locator('.cell[data-row="2"][data-col="3"]').boundingBox();
await p.mouse.move(e1.x + e1.width/2, e1.y + e1.height/2); await p.mouse.down();
for (let i=1;i<=8;i++) await p.mouse.move(e1.x + (e2.x-e1.x)*i/8 + e1.width/2, e1.y + e1.height/2);
await p.mouse.up(); await p.waitForTimeout(250);
check('eraser: drag clears a run', (await Q(`document.querySelectorAll('.brow--data[data-row="2"] .chip').length`)) === 0);
// keyboard 0
await p.click('.brush[data-brush="discovery"]');
await p.keyboard.press('0'); await p.waitForTimeout(150);
check('eraser: keyboard 0 selects it', await Q(`document.querySelector('.brush[data-brush=""]').getAttribute('aria-pressed') === 'true'`));

// ---------- 3. UNDO / REDO ----------
await p.waitForTimeout(600);
check('undo: enabled after edits', !(await Q(`document.getElementById('btnUndo').disabled`)));
const chipsBeforeUndo = await Q(`document.querySelectorAll('.chip').length`);
await p.click('#btnUndo'); await p.waitForTimeout(400);
const chipsAfterUndo = await Q(`document.querySelectorAll('.chip').length`);
check('undo: restores chips', chipsAfterUndo > chipsBeforeUndo, `${chipsBeforeUndo} -> ${chipsAfterUndo}`);
await p.click('#btnRedo'); await p.waitForTimeout(400);
check('redo: re-applies', (await Q(`document.querySelectorAll('.chip').length`)) === chipsBeforeUndo);
await p.keyboard.press('Control+z'); await p.waitForTimeout(400);
check('undo: Ctrl+Z works', (await Q(`document.querySelectorAll('.chip').length`)) === chipsAfterUndo);

// ---------- 4. PAINTING ----------
await p.click('.brush[data-brush="specs"]');
await p.click('.cell[data-row="8"][data-col="3"]'); await p.waitForTimeout(200);
check('paint: click applies the brush',
  (await Q(`document.querySelector('.cell[data-row="8"][data-col="3"] .chip')?.textContent`)) === 'Specs');
await p.click('.cell[data-row="8"][data-col="5"]', { modifiers: ['Shift'] }); await p.waitForTimeout(200);
check('paint: shift+click lays the sequence',
  (await Q(`[...document.querySelectorAll('.brow--data[data-row="8"] .chip')].map(c=>c.textContent).join('|')`)).includes('Discovery|Specs|Delivery'));
// alt+click appends a DIFFERENT phase beside the one already there
await p.click('.brush[data-brush="delivery"]');
await p.click('.cell[data-row="8"][data-col="3"]', { modifiers: ['Alt'] }); await p.waitForTimeout(250);
check('paint: alt+click splits a cell',
  (await Q(`document.querySelectorAll('.cell[data-row="8"][data-col="3"] .chip').length`)) === 2,
  await Q(`[...document.querySelectorAll('.cell[data-row="8"][data-col="3"] .chip')].map(c=>c.textContent).join('+')`));
await p.click('.cell[data-row="8"][data-col="3"]', { modifiers: ['Alt'] }); await p.waitForTimeout(250);
check('paint: alt+click with the same phase is a no-op',
  (await Q(`document.querySelectorAll('.cell[data-row="8"][data-col="3"] .chip').length`)) === 2);
// right-click erases a cell painted right before
await p.click('.brush[data-brush="specs"]');
await p.click('.cell[data-row="7"][data-col="2"]'); await p.waitForTimeout(250);
check('paint: cell seeded for the erase test',
  (await Q(`document.querySelectorAll('.cell[data-row="7"][data-col="2"] .chip').length`)) === 1);
await p.click('.cell[data-row="7"][data-col="2"]', { button: 'right' }); await p.waitForTimeout(300);
check('paint: right-click erases',
  (await Q(`document.querySelectorAll('.cell[data-row="7"][data-col="2"] .chip').length`)) === 0);
// right-button DRAG must erase the whole run, not repaint it with the brush
await p.click('.brush[data-brush="discovery"]');
const d1 = await p.locator('.cell[data-row="6"][data-col="3"]').boundingBox();
const d2 = await p.locator('.cell[data-row="6"][data-col="5"]').boundingBox();
await p.mouse.move(d1.x + d1.width/2, d1.y + d1.height/2); await p.mouse.down();
for (let i=1;i<=6;i++) await p.mouse.move(d1.x + (d2.x-d1.x)*i/6 + d1.width/2, d1.y + d1.height/2);
await p.mouse.up(); await p.waitForTimeout(300);
const painted6 = await Q(`document.querySelectorAll('.brow--data[data-row="6"] .chip').length`);
const r1 = await p.locator('.cell[data-row="6"][data-col="3"]').boundingBox();
await p.mouse.move(r1.x + r1.width/2, r1.y + r1.height/2);
await p.mouse.down({ button: 'right' });
for (let i=1;i<=6;i++) await p.mouse.move(r1.x + (d2.x-r1.x)*i/6 + r1.width/2, r1.y + r1.height/2);
await p.mouse.up({ button: 'right' }); await p.waitForTimeout(350);
const draggedCols = await Q(`[3,4,5].map(c=>document.querySelectorAll('.cell[data-row="6"][data-col="'+c+'"] .chip').length).join(',')`);
check('paint: right-button drag erases the run (never repaints)',
  draggedCols === '0,0,0',
  'cols 3-5 after right-drag: ' + draggedCols + ' (had ' + painted6 + ' chips in the row)');
check('paint: right-drag leaves untouched cells alone',
  (await Q(`document.querySelectorAll('.cell[data-row="6"][data-col="6"] .chip').length`)) === 1);

// ---------- 5. MILESTONES (the reported question) ----------
check('milestone: rendered with handles', (await Q(`document.querySelectorAll('.ms .grip').length`)) === 2);
// edit the caption in place
await p.click('.ms .cap');
await p.keyboard.press('Control+a'); await p.keyboard.type('Go-live pagamenti');
await p.waitForTimeout(500);
check('milestone: caption edits in place',
  (await Q(`document.querySelector('.ms .cap').textContent`)) === 'Go-live pagamenti');
check('milestone: caption persists to model',
  (await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones[0].label`)) === 'Go-live pagamenti');
// drag the line to another sprint
const colBefore = await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones[0].col`);
const msBox = await p.locator('.ms').boundingBox();
const c5 = await p.locator('.cell[data-row="0"][data-col="5"]').boundingBox();
await p.mouse.move(msBox.x + 1, msBox.y + msBox.height/2); await p.mouse.down();
await p.mouse.move(c5.x, msBox.y + msBox.height/2, { steps: 12 }); await p.mouse.up();
await p.waitForTimeout(400);
const colAfter = await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones[0].col`);
check('milestone: line drags between sprints', colAfter === 5, `col ${colBefore} -> ${colAfter}`);
// drag the bottom grip
const rowsBefore = await Q(`(m=>m.endRow)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones[0])`);
await p.hover('.ms');
const grip = await p.locator('.ms .grip-bot').boundingBox();
const r7 = await p.locator('.brow--data[data-row="7"]').boundingBox();
await p.mouse.move(grip.x + grip.width/2, grip.y + grip.height/2); await p.mouse.down();
await p.mouse.move(grip.x + grip.width/2, r7.y + r7.height/2, { steps: 10 }); await p.mouse.up();
await p.waitForTimeout(400);
const rowsAfter = await Q(`(m=>m.endRow)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones[0])`);
check('milestone: grip stretches the line', rowsAfter === 7, `endRow ${rowsBefore} -> ${rowsAfter}`);
// add + delete
await p.click('#glDrag'); await p.waitForTimeout(350);
check('milestone: clicking Go-live (no drag) adds one', (await Q(`document.querySelectorAll('.ms').length`)) === 2);
await p.hover('.ms[data-ms="1"]');
await p.click('.ms[data-ms="1"] .msdel'); await p.waitForTimeout(300);
check('milestone: × deletes it', (await Q(`document.querySelectorAll('.ms').length`)) === 1);

// ---------- 6. PRESENTATION ----------
await p.keyboard.press('p'); await p.waitForTimeout(600);
check('present: overlay opens', !(await Q(`document.getElementById('present').hidden`)));
check('present: slide moved into the stage', await Q(`document.getElementById('presentHost').contains(document.getElementById('slide'))`));
check('present: editor affordances off', !(await Q(`document.getElementById('slide').classList.contains('is-live')`)));
check('present: counter shows the deck', (await Q(`document.getElementById('presentCount').textContent`)).trim() === '1 / 2');
const fitOk = await Q(`(()=>{const h=document.getElementById('presentHost').getBoundingClientRect();return h.width<=innerWidth&&h.height<=innerHeight;})()`);
check('present: slide fits the viewport', fitOk);
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
check('present: → advances to the design view',
  (await Q(`document.getElementById('slideTitle').textContent`)).includes('design'));
check('present: counter follows', (await Q(`document.getElementById('presentCount').textContent`)).trim() === '2 / 2');
await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(500);
check('present: ← goes back', (await Q(`document.getElementById('presentCount').textContent`)).trim() === '1 / 2');
await p.keyboard.press('Escape'); await p.waitForTimeout(600);
check('present: Esc restores the editor',
  (await Q(`document.getElementById('present').hidden && document.getElementById('canvasInner').contains(document.getElementById('slide')) && document.getElementById('slide').classList.contains('is-live')`)));
check('present: view restored to product',
  (await Q(`document.querySelector('.vtab[data-view="product"]').classList.contains('is-on')`)));

// ---------- 7. HELP SHEET ----------
await p.keyboard.press('?'); await p.waitForTimeout(300);
check('help: ? opens the shortcut sheet', !(await Q(`document.getElementById('sheet').hidden`)));
await p.keyboard.press('Escape'); await p.waitForTimeout(250);
check('help: Esc closes it', await Q(`document.getElementById('sheet').hidden`));

// ---------- 7b. DESIGN VIEW PHASES ----------
await p.click('.vtab[data-view="design"]'); await p.waitForTimeout(400);
const designBrushes = await Q(`[...document.querySelectorAll('#brushes .brush')].map(b=>b.dataset.brush+':'+b.textContent.replace(/[0-9]$/,'').trim())`);
check('design: offers Discovery and Experience Conception only',
  designBrushes.length === 3 &&
  designBrushes[0].startsWith('discovery:') &&
  designBrushes[1].startsWith('conception:') &&
  designBrushes[2].startsWith(':'),
  JSON.stringify(designBrushes));
check('design: Delivery is no longer a design phase',
  !designBrushes.some(b => b.startsWith('delivery:')));
const swatches = await Q(`[...document.querySelectorAll('#brushes .brush .swatch')].slice(0,2).map(s=>getComputedStyle(s).backgroundColor)`);
check('design: Discovery is green and Experience Conception amber',
  swatches[0] === 'rgb(23, 195, 162)' && swatches[1] === 'rgb(244, 163, 42)', JSON.stringify(swatches));
await p.click('.cell[data-row="0"][data-col="3"]', { modifiers: ['Shift'] }); await p.waitForTimeout(300);
check('design: the sequence runs Discovery then Experience Conception',
  (await Q(`[...document.querySelectorAll('.brow--data[data-row="0"] .cell[data-col="3"] .chip, .brow--data[data-row="0"] .cell[data-col="4"] .chip')].map(c=>c.className.replace('chip chip--','')).join('>')`)) === 'discovery>conception');
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(300);
check('product: still has all three phases',
  (await Q(`document.querySelectorAll('#brushes .brush').length`)) === 4);

// ---------- 8. EXPORTS ----------
const png = await p.evaluate(async () => {
  const slide=document.getElementById('slide'), inner=document.getElementById('canvasInner');
  const hold=document.createElement('div');
  hold.style.cssText='position:absolute;left:-20000px;top:0;width:1600px;height:900px;background:#fff';
  document.body.appendChild(hold);
  slide.classList.add('is-export'); slide.classList.remove('is-live');
  slide.style.transform='none'; hold.appendChild(slide);
  let out;
  try{
    const c=await html2canvas(slide,{scale:1,backgroundColor:'#fff',width:1600,height:900,windowWidth:1600,windowHeight:900,logging:false});
    const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let ink=0,n=0; for(let i=0;i<d.length;i+=4*97){n++;if(d[i]<245||d[i+1]<245||d[i+2]<245)ink++;}
    const grips=slide.querySelectorAll('.grip,.msdel,.rowtools,.brow--add,.libdel');
    const probe=document.createElement('span');
    probe.className='is-blank';
    slide.querySelector('.pill').appendChild(probe);
    const phContent=getComputedStyle(probe,'::before').content;
    probe.remove();
    out={w:c.width,h:c.height,ink:+(ink/n*100).toFixed(1),
         gripsHidden:[...grips].every(g=>getComputedStyle(g).display==='none'),
         placeholderHidden: phContent === 'none' || phContent === '""'};
  }catch(e){out={error:String(e)}}
  inner.appendChild(slide); slide.classList.remove('is-export'); slide.classList.add('is-live'); hold.remove();
  return out;
});
check('export: PNG renders at full size', png.w === 1600 && png.h === 900 && png.ink > 15, JSON.stringify(png));
check('export: editing handles excluded from PNG', png.gripsHidden === true);
check('export: the "+ Initiative" row and name placeholder stay out', png.placeholderHidden === true);

const pdf = await p.evaluate(async () => {
  try {
    const doc = new window.jspdf.jsPDF({ orientation:'landscape', unit:'px', format:[1600,900] });
    const c = document.createElement('canvas'); c.width=100; c.height=60;
    const g = c.getContext('2d'); g.fillStyle='#17c3a2'; g.fillRect(0,0,100,60);
    doc.addImage(c.toDataURL('image/jpeg',0.95),'JPEG',0,0,1600,900);
    doc.addPage([1600,900],'landscape');
    const blob = doc.output('blob');
    return { pages: doc.getNumberOfPages(), bytes: blob.size, type: blob.type };
  } catch (e) { return { error: String(e) }; }
});
check('export: jsPDF produces a 2-page landscape blob', pdf.pages === 2 && pdf.bytes > 500, JSON.stringify(pdf));

// ---------- 9. LIBRARY / INSPECTOR / LINKS ----------
await p.click('.lib-item:nth-child(2) .nm'); await p.waitForTimeout(300);
check('inspector: opens from the library', !(await Q(`document.getElementById('inspector').hidden`)));
await p.fill('#iUrl', 'https://example.com/doc/push'); await p.waitForTimeout(400);
check('links: setting a URL turns the row into a link',
  (await Q(`document.querySelectorAll('.pill.is-link').length`)) >= 2);
check('links: ↗ button appears on linked rows', (await Q(`document.querySelectorAll('.linkjump').length`)) >= 2);
await p.fill('#iName', 'Notifiche push v2'); await p.waitForTimeout(400);
check('inspector: rename reaches the slide',
  (await Q(`[...document.querySelectorAll('.pill span')].some(s=>s.textContent==='Notifiche push v2')`)));

// ---------- 10. SPRINTS / QUARTERS ----------
await p.click('.stab[data-panel="sprint"]');
await p.fill('#genStart', '2026-01-05');
await p.fill('#genCount', '6');
await p.click('#btnGen'); await p.waitForTimeout(500);
check('sprints: generator rebuilds the header',
  (await Q(`document.querySelectorAll('.sprint').length`)) === 6);
check('sprints: dates computed', (await Q(`document.querySelector('.sprint .dt').textContent`)).includes('05/01'));
check('sprints: out-of-range phases pruned',
  (await Q(`[...document.querySelectorAll('.cell')].every(c=>+c.dataset.col<6)`)));

// ---------- 11. PERSISTENCE ----------
const persisted = await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].sprints.length`);
check('persistence: writes to localStorage', persisted === 6);
await p.reload(); await p.waitForTimeout(900);
check('persistence: survives reload', (await Q(`document.querySelectorAll('.sprint').length`)) === 6);


// ---------- 11b. LEGEND, NOTE, HALF SPRINT, AREA, TOOLTIP, REORDER, GO-LIVE ----------
await p.goto(PAGE); await p.evaluate(() => { try { localStorage.clear(); } catch(e){} });
await p.reload(); await p.waitForTimeout(900);

check('legend: printed on the slide', (await Q(`document.querySelectorAll('.legend .lg').length`)) === 2);
check('legend: names both categories',
  (await Q(`[...document.querySelectorAll('.legend .lg')].map(e=>e.textContent).join('|')`)) === 'Legal obligation|Other initiatives');

check('note: hidden by default', await Q(`document.getElementById('slideNote').hidden`));
await p.click('#btnNote'); await p.waitForTimeout(300);
check('note: + Note brings it back', !(await Q(`document.getElementById('slideNote').hidden`)));
await p.click('#slideNoteText'); await p.keyboard.press('Control+a'); await p.keyboard.type('Pending CPO sign-off');
await p.waitForTimeout(500);
check('note: text is editable and saved',
  (await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].note.text`)) === 'Pending CPO sign-off');
await p.hover('#slideNote'); await p.click('#noteDel'); await p.waitForTimeout(300);
check('note: × removes it again', await Q(`document.getElementById('slideNote').hidden`));

// half sprint
await p.click('.brush[data-brush="delivery"]');
await p.click('#btnHalf'); await p.waitForTimeout(150);
check('half: toggle turns on', (await Q(`document.getElementById('btnHalf').getAttribute('aria-pressed')`)) === 'true');
const hb = await p.locator('.cell[data-row="5"][data-col="6"]').boundingBox();
await p.mouse.click(hb.x + hb.width * 0.25, hb.y + hb.height / 2); await p.waitForTimeout(300);
check('half: left half paints one chip + one empty slot',
  (await Q(`(c=>c.querySelectorAll('.chip').length+'/'+c.querySelectorAll('.chip--ph').length)(document.querySelector('.cell[data-row="5"][data-col="6"]'))`)) === '1/1',
  await Q(`JSON.stringify(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.rows[5].cells['6'])`));
check('half: model stores an empty slot',
  (await Q(`JSON.stringify(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.rows[5].cells['6'])`)) === '["delivery",null]');
await p.mouse.click(hb.x + hb.width * 0.78, hb.y + hb.height / 2); await p.waitForTimeout(300);
check('half: right half fills the other slot',
  (await Q(`document.querySelectorAll('.cell[data-row="5"][data-col="6"] .chip').length`)) === 2);
await p.click('#btnHalf'); await p.waitForTimeout(150);
check('half: toggle turns off', (await Q(`document.getElementById('btnHalf').getAttribute('aria-pressed')`)) === 'false');

// row reorder (was broken: the buttons sat outside the row's hover box)
const firstBefore = await Q(`document.querySelector('.brow--data .pill span').textContent`);
await p.hover('.brow--data[data-row="1"]');
await p.click('.brow--data[data-row="1"] .rowtools button[data-act="up"]'); await p.waitForTimeout(350);
const firstAfter = await Q(`document.querySelector('.brow--data .pill span').textContent`);
check('reorder: ▲ on the slide moves the row up', firstAfter !== firstBefore, firstBefore + ' -> ' + firstAfter);
await p.hover('.brow--data[data-row="0"]');
await p.click('.brow--data[data-row="0"] .rowtools button[data-act="down"]'); await p.waitForTimeout(350);
check('reorder: ▼ puts it back',
  (await Q(`document.querySelector('.brow--data .pill span').textContent`)) === firstBefore);

// description + area
const rowOf = (view, name) => Q(`(()=>{const d=JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  return (d.boards[0].views['${view}'].rows.find(r=>r.name===${JSON.stringify(name)})||null);})()`);

await p.click('.lib-item:nth-child(3) .nm'); await p.waitForTimeout(250);
await p.fill('#iArea', 'Finance'); await p.waitForTimeout(450);
check('area: saved on the row',
  ((await rowOf('product', 'One-step checkout')) || {}).area === 'Finance');
await p.fill('#iDesc', 'Collapse purchase into one reviewable step.'); await p.waitForTimeout(450);
check('description: saved on the row',
  ((await rowOf('product', 'One-step checkout')) || {}).desc === 'Collapse purchase into one reviewable step.');
const catEntry = await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).library.find(i=>i.name==='One-step checkout')`);
check('catalogue: editing a row leaves the library entry unchanged',
  catEntry && catEntry.area === 'Business', 'catalogue area is ' + (catEntry && catEntry.area));
await p.fill('#libSearch', 'finance'); await p.waitForTimeout(300);
check('area: library search still searches the catalogue',
  (await Q(`document.querySelectorAll('.lib-item').length`)) === 1, 'Plans and billing');

// the decisive one: a row that sits on BOTH roadmaps renames on one only
await p.fill('#libSearch', ''); await p.waitForTimeout(250);
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(350);
const sharedIdx = await Q(`[...document.querySelectorAll('.brow--data .pill span')].findIndex(s=>s.textContent==='Onboarding self-service')`);
check('rename: the row is on the product roadmap to begin with', sharedIdx >= 0);
await p.click('.label[data-labelrow="' + sharedIdx + '"]'); await p.waitForTimeout(250);
await p.fill('#iName', 'Onboarding — product wording'); await p.waitForTimeout(500);
check('rename: the product row takes the new name',
  (await Q(`[...document.querySelectorAll('.brow--data .pill span')].some(s=>s.textContent==='Onboarding — product wording')`)));
await p.click('.vtab[data-view="design"]'); await p.waitForTimeout(400);
check('rename: the design roadmap keeps its own wording',
  (await Q(`[...document.querySelectorAll('.brow--data .pill span')].some(s=>s.textContent==='Onboarding self-service')`)) &&
  !(await Q(`[...document.querySelectorAll('.brow--data .pill span')].some(s=>s.textContent==='Onboarding — product wording')`)));
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(350);
await p.fill('#libSearch', ''); await p.waitForTimeout(250);

// ---------- the two roadmaps are independent ----------
await p.fill('#libSearch', ''); await p.waitForTimeout(200);
check('views: the library marks where each initiative is used',
  (await Q(`[...document.querySelectorAll('.lib-item')].some(li=>li.querySelector('.u-p')) && [...document.querySelectorAll('.lib-item')].some(li=>li.querySelector('.u-d'))`)));
check('views: a design-only request carries D and not P',
  (await Q(`(li=>!!li && !li.querySelector('.u-p') && !!li.querySelector('.u-d'))([...document.querySelectorAll('.lib-item')].find(l=>l.querySelector('.nm').textContent==='Design system audit'))`)));
const prodRows = await Q(`[...document.querySelectorAll('.brow--data .pill span')].map(s=>s.textContent)`);
check('views: the design-only request is not on the product roadmap', !prodRows.includes('Design system audit'));
await p.click('.vtab[data-view="design"]'); await p.waitForTimeout(400);
const desRows = await Q(`[...document.querySelectorAll('.brow--data .pill span')].map(s=>s.textContent)`);
check('views: design carries rows product does not', desRows.includes('Design system audit') && desRows.includes('Illustration set refresh'));
check('views: and omits rows product has', !desRows.includes('Data export') && prodRows.includes('Data export'));
await p.fill('#newName', 'Brand guidelines page'); await p.click('#btnAddInit'); await p.waitForTimeout(500);
check('views: a new request lands only on the open view',
  (await Q(`[...document.querySelectorAll('.brow--data .pill span')].map(s=>s.textContent)`)).includes('Brand guidelines page'));
await p.selectOption('#libFilter', 'on'); await p.waitForTimeout(300);
const onlyHere = await Q(`document.querySelectorAll('.lib-item').length`);
check('views: the filter narrows the library to this view', onlyHere === desRows.length + 1, onlyHere + ' items');
await p.selectOption('#libFilter', 'all'); await p.waitForTimeout(250);
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(400);
check('views: the new design request stayed out of product',
  !(await Q(`[...document.querySelectorAll('.brow--data .pill span')].map(s=>s.textContent)`)).includes('Brand guidelines page'));
await p.fill('#libSearch', ''); await p.waitForTimeout(300);

await p.hover('.label[data-labelrow="0"]'); await p.waitForTimeout(400);
const tip = await Q(`({hidden:document.getElementById('tip').hidden, text:document.getElementById('tip').textContent})`);
check('tooltip: description shows on hover', tip.hidden === false && tip.text.length > 10, JSON.stringify(tip).slice(0,110));
await p.hover('.slide-title'); await p.waitForTimeout(300);
check('tooltip: hides when the pointer leaves', await Q(`document.getElementById('tip').hidden`));

// go-live dragged from the toolbar
const msBefore = await Q(`document.querySelectorAll('.ms').length`);
const src = await p.locator('#glDrag').boundingBox();
const tgt = await p.locator('.cell[data-row="4"][data-col="6"]').boundingBox();
await p.mouse.move(src.x + src.width/2, src.y + src.height/2);
await p.mouse.down();
await p.mouse.move(tgt.x, tgt.y + tgt.height/2, { steps: 15 });
const ghostVisible = !(await Q(`document.getElementById('glGhost').hidden`));
await p.mouse.up(); await p.waitForTimeout(400);
check('go-live: ghost follows the pointer while dragging', ghostVisible);
check('go-live: dropping on the grid creates a line',
  (await Q(`document.querySelectorAll('.ms').length`)) === msBefore + 1);
check('go-live: it lands on the sprint you dropped it over',
  (await Q(`(m=>m[m.length-1].col)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones)`)) === 6);

// accent colour
// the line used to be drawn one slide-padding to the right of the grid
const msAlign = await Q(`(()=>{
  const lay=document.querySelector('.ms-layer').getBoundingClientRect();
  const c0=document.querySelector('.brow--data[data-row="0"] .cell[data-col="0"]').getBoundingClientRect();
  const cl=document.querySelector('.brow--data[data-row="0"] .cell:last-child').getBoundingClientRect();
  return {l:+(lay.left-c0.left).toFixed(1), r:+(lay.right-cl.right).toFixed(1)};
})()`);
check('go-live: the milestone layer lines up with the sprint grid',
  Math.abs(msAlign.l) < 0.6 && Math.abs(msAlign.r) < 0.6, JSON.stringify(msAlign));

await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  d.boards[0].views.product.milestones = [{ id:'t', label:'T', col:3, row:0, endRow:2 }];
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(700);
const onBoundary = await Q(`(()=>{
  const line=document.querySelector('.ms').getBoundingClientRect();
  const a=document.querySelector('.brow--data[data-row="0"] .cell[data-col="2"]').getBoundingClientRect();
  const b=document.querySelector('.brow--data[data-row="0"] .cell[data-col="3"]').getBoundingClientRect();
  return +(line.left-(a.right+b.left)/2).toFixed(1);
})()`);
check('go-live: a whole number sits exactly on the sprint boundary', Math.abs(onBoundary) < 0.6, 'delta ' + onBoundary);

await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  d.boards[0].views.product.milestones = [{ id:'t', label:'T', col:3.5, row:0, endRow:2 }];
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(700);
const midSprint = await Q(`(()=>{
  const line=document.querySelector('.ms').getBoundingClientRect();
  const c=document.querySelector('.brow--data[data-row="0"] .cell[data-col="3"]').getBoundingClientRect();
  return +(line.left-(c.left+c.right)/2).toFixed(1);
})()`);
check('go-live: a half lands in the middle of that sprint', Math.abs(midSprint) < 0.6, 'delta ' + midSprint);

// dropping inside a sprint must produce a fractional position
const cellBox = await p.locator('.cell[data-row="3"][data-col="5"]').boundingBox();
const glBox = await p.locator('#glDrag').boundingBox();
await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('roadmap-studio-v1')); d.boards[0].views.product.milestones=[]; localStorage.setItem('roadmap-studio-v1', JSON.stringify(d)); });
await p.reload(); await p.waitForTimeout(600);
await p.mouse.move(glBox.x + glBox.width/2, glBox.y + glBox.height/2);
await p.mouse.down();
await p.mouse.move(cellBox.x + cellBox.width/2, cellBox.y + cellBox.height/2, { steps: 12 });
await p.mouse.up(); await p.waitForTimeout(400);
const droppedCol = await Q(`(m=>m.length?m[0].col:null)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones)`);
check('go-live: dropping mid-sprint gives a mid-sprint position', droppedCol === 5.5, 'col ' + droppedCol);

await p.click('.stab[data-panel="ms"]'); await p.waitForTimeout(300);
check('go-live: the panel offers sprint plus position',
  (await Q(`!!document.querySelector('#msList [data-key="sprintIdx"]') && !!document.querySelector('#msList [data-key="offset"]')`)));
check('go-live: the panel shows the mid-sprint position',
  (await Q(`document.querySelector('#msList [data-key="offset"]').value`)) === '0.5');
await p.click('.stab[data-panel="init"]'); await p.waitForTimeout(200);

check('theme: editor accent is #2151FF',
  (await Q(`getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim().toLowerCase()`)) === '#2151ff');

// ---------- 11d. TYPING ON THE SLIDE ----------
await p.goto(PAGE); await p.evaluate(() => { try { localStorage.clear(); } catch(e){} });
await p.reload(); await p.waitForTimeout(900);

const names = () => Q(`[...document.querySelectorAll('.brow--data .pill span')].map(s=>s.textContent)`);
const focusedRow = () => Q(`(a=>a && a.dataset && a.dataset.namerow !== undefined ? a.dataset.namerow : null)(document.activeElement)`);
const libNames = () => Q(`[...document.querySelectorAll('.lib-item .nm')].map(n=>n.textContent)`);

check('slide: row names are editable in place',
  (await Q(`!!document.querySelector('.brow--data .pill span[contenteditable="true"]')`)));
check('slide: the panel offers no "Remove from library" button',
  await Q(`!document.getElementById('btnDeleteInit') && ![...document.querySelectorAll('#inspector button')].some(b=>/library/i.test(b.textContent))`));
await p.click('.brow--data[data-row="1"] .pill span');
await p.keyboard.press('Control+a');
await p.keyboard.type('Renamed straight on the slide');
await p.waitForTimeout(500);
check('slide: typing on the pill renames the row',
  (await names())[1] === 'Renamed straight on the slide');
check('slide: and it reaches the model',
  (await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.rows[1].name`)) === 'Renamed straight on the slide');
check('slide: the caret stays in the pill while typing', (await focusedRow()) === '1');
check('slide: the library entry follows the new wording',
  (await libNames()).includes('Renamed straight on the slide'));
check('slide: the selected row opens at the top of the panel, above the library',
  await Q(`(()=>{const i=document.getElementById('inspector'), r=i.getBoundingClientRect(), l=document.getElementById('libList').getBoundingClientRect();
    return !i.hidden && r.top < l.top && r.top >= 0 && r.top < 300;})()`));

const nBefore = (await names()).length;
await p.keyboard.press('Enter'); await p.waitForTimeout(400);
check('slide: Enter confirms the name and moves to the next row, no new row',
  (await names()).length === nBefore && (await focusedRow()) === '2');
await p.click('.brow--data[data-row="' + (nBefore - 1) + '"] .pill span');
await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
check('slide: Enter on the last row starts a new row',
  (await names()).length === nBefore + 1 && (await names())[nBefore] === '');
check('slide: the new row is focused and ready to type', (await focusedRow()) === String(nBefore));
await p.keyboard.type('Typed without touching the panel'); await p.waitForTimeout(500);
check('slide: it takes the typing', (await names())[nBefore] === 'Typed without touching the panel');
await p.keyboard.press('Enter'); await p.waitForTimeout(350);
check('slide: Enter on a named last row adds one empty row', (await names()).length === nBefore + 2);
await p.keyboard.press('Enter'); await p.waitForTimeout(450);
check('slide: Enter on the empty row removes it instead of adding another (the reported bug)',
  (await names()).length === nBefore + 1 && !(await names()).includes(''),
  JSON.stringify(await names()));
check('slide: a row typed on the slide joins the library',
  (await libNames()).includes('Typed without touching the panel'));

await p.click('#rowAdd'); await p.waitForTimeout(500);
check('slide: + Initiative appends another row, focused',
  (await names()).length === nBefore + 2 && (await focusedRow()) === String(nBefore + 1));
await p.keyboard.press('Escape'); await p.waitForTimeout(450);
check('slide: Escape on an empty row removes it', (await names()).length === nBefore + 1);
await p.click('#rowAdd'); await p.waitForTimeout(400);
await p.keyboard.press('Backspace'); await p.waitForTimeout(450);
check('slide: Backspace on an empty name removes the row', (await names()).length === nBefore + 1);
check('slide: and puts the caret in the row above', (await focusedRow()) === String(nBefore));
check('slide: no blank pill is left anywhere', !(await names()).includes(''));

await p.keyboard.press('Escape'); await p.waitForTimeout(200);
check('slide: Escape leaves the field but keeps the row selected',
  (await focusedRow()) === null && (await Q(`document.querySelectorAll('.brow--data.is-sel').length`)) === 1);
await p.keyboard.press('Delete'); await p.waitForTimeout(450);
check('slide: Delete removes the selected row',
  (await names()).length === nBefore && !(await names()).includes('Typed without touching the panel'));
check('slide: the toast offers Undo',
  await Q(`!document.getElementById('toast').hidden && !!document.querySelector('#toast .toast-act')`));
await p.click('#toast .toast-act'); await p.waitForTimeout(450);
check('slide: Undo brings the row back', (await names()).includes('Typed without touching the panel'));

const idxTyped = (await names()).indexOf('Typed without touching the panel');
await p.hover('.brow--data[data-row="' + idxTyped + '"]');
const toolBox = await p.locator('.brow--data[data-row="' + idxTyped + '"] .rowtools button[data-act="del"]').boundingBox();
check('slide: the row tools are a real target (at least 17px wide on a fitted slide)',
  toolBox && toolBox.width >= 17, JSON.stringify(toolBox));
await p.click('.brow--data[data-row="' + idxTyped + '"] .rowtools button[data-act="del"]'); await p.waitForTimeout(450);
check('slide: × deletes that row', !(await names()).includes('Typed without touching the panel'));

// ---------- 11d2. UNDO IS PER ACTION ----------
await p.click('.brush[data-brush="specs"]');
await p.click('.brow--data[data-row="0"] .pill span'); await p.keyboard.press('End');
await p.keyboard.type(' v2');
await p.click('.cell[data-row="0"][data-col="7"]'); await p.waitForTimeout(600);
check('undo: painting a cell releases the caret from the name',
  await Q(`!(document.activeElement && document.activeElement.isContentEditable)`));
check('undo: the paint landed', (await Q(`document.querySelectorAll('.cell[data-row="0"][data-col="7"] .chip').length`)) === 1);
await p.keyboard.press('Control+z'); await p.waitForTimeout(450);
check('undo: Ctrl+Z right after removes only the paint, the typed text stays',
  (await Q(`document.querySelectorAll('.cell[data-row="0"][data-col="7"] .chip').length`)) === 0 && (await names())[0].endsWith(' v2'),
  (await names())[0]);
await p.keyboard.press('Control+z'); await p.waitForTimeout(450);
check('undo: the next Ctrl+Z removes the typed text', !(await names())[0].endsWith(' v2'));

await p.click('.vtab[data-view="design"]'); await p.waitForTimeout(350);
await p.click('.brush[data-brush="discovery"]');
await p.click('.cell[data-row="0"][data-col="7"]'); await p.waitForTimeout(600);
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(350);
await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
check('undo: goes back to the roadmap it edits',
  await Q(`document.querySelector('.vtab[data-view="design"]').classList.contains('is-on')`));
check('undo: and the design paint is gone',
  (await Q(`document.querySelectorAll('.cell[data-row="0"][data-col="7"] .chip').length`)) === 0);
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(350);

await p.click('.brush[data-brush="specs"]');
await p.click('.cell[data-row="1"][data-col="7"]'); await p.waitForTimeout(600);
const chipsB = await Q(`document.querySelectorAll('.chip').length`);
await p.click('#newName'); await p.keyboard.type('Draft'); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
check('undo: Ctrl+Z inside a text box does not touch the roadmap',
  (await Q(`document.querySelectorAll('.chip').length`)) === chipsB);
await p.fill('#newName', '');

// ---------- 11d3. EMPTY ROWS NEVER ENTER THE HISTORY ----------
await p.click('.brow--data[data-row="' + ((await names()).length - 1) + '"] .pill span');
await p.keyboard.press('End'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
await p.keyboard.type('Scratch test'); await p.waitForTimeout(200);
await p.keyboard.press('Enter'); await p.waitForTimeout(250);   // a new empty row
await p.keyboard.press('Enter'); await p.waitForTimeout(400);   // removed again
check('undo: the scratch rows left no blank row', !(await names()).includes(''));
await p.keyboard.press('Control+z'); await p.waitForTimeout(450);
check('undo: one Ctrl+Z removes the typed row, not a blank one first',
  !(await names()).includes('Scratch test') && !(await names()).includes(''), JSON.stringify(await names()));
await p.keyboard.press('Control+Shift+z'); await p.waitForTimeout(450);
check('undo: redo brings the typed row back', (await names()).includes('Scratch test'));
const scratchIdx = (await names()).indexOf('Scratch test');
await p.click('.brow--data[data-row="' + scratchIdx + '"] .pill span'); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.keyboard.press('Delete'); await p.waitForTimeout(400);

// Tab out of an empty row lands on the row that took its place
await p.click('.brow--data[data-row="1"] .pill span'); await p.keyboard.press('End');
await p.keyboard.press('Shift+Enter'); await p.waitForTimeout(300);        // empty row at index 2
check('slide: Shift+Enter inserts a row below', (await names())[2] === '' && (await focusedRow()) === '2');
const rowThree = (await names())[3];
await p.keyboard.press('Tab'); await p.waitForTimeout(400);
check('slide: Tab out of an empty row removes it and lands on the next row',
  !(await names()).includes('') && (await focusedRow()) === '2' && (await names())[2] === rowThree,
  'focused ' + (await focusedRow()) + ' names ' + JSON.stringify((await names()).slice(0, 4)));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

// A library entry removed on purpose does not come back when its row is edited
const pushIdx = (await names()).indexOf('Renamed straight on the slide');
const pushLib = await Q(`(()=>{const li=[...document.querySelectorAll('.lib-item')].find(l=>l.querySelector('.nm').textContent==='Renamed straight on the slide'); return li ? li.dataset.iid : null;})()`);
await p.hover('.lib-item[data-iid="' + pushLib + '"]');
await p.click('.lib-item[data-iid="' + pushLib + '"] .libdel'); await p.waitForTimeout(400);
await p.click('.brow--data[data-row="' + pushIdx + '"] .pill span'); await p.keyboard.press('End');
await p.keyboard.type(' again'); await p.keyboard.press('Enter'); await p.waitForTimeout(450);
check('library: an entry removed on purpose stays removed when its row is edited',
  !(await libNames()).some(n => /Renamed straight on the slide/.test(n)), JSON.stringify(await libNames()));
await p.keyboard.press('Escape'); await p.waitForTimeout(150);

// Two rows typed with the same name share one entry; unticking removes both
await p.click('#rowAdd'); await p.keyboard.type('Twin row'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
await p.keyboard.type('Twin row'); await p.keyboard.press('Escape'); await p.waitForTimeout(450);
check('library: the same name typed twice makes one entry',
  (await libNames()).filter(n => n === 'Twin row').length === 1 && (await names()).filter(n => n === 'Twin row').length === 2);
const twinLib = await Q(`(()=>{const li=[...document.querySelectorAll('.lib-item')].find(l=>l.querySelector('.nm').textContent==='Twin row'); return li ? li.dataset.iid : null;})()`);
await p.click('.lib-item[data-iid="' + twinLib + '"] .libchk'); await p.waitForTimeout(450);
check('library: unticking removes every row linked to the entry',
  !(await names()).includes('Twin row') && (await Q(`document.querySelector('.lib-item[data-iid="${twinLib}"] .libchk').checked`)) === false);

// ---------- 11e. THE LIBRARY ----------
const libCount = () => Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).library.length`);
const libN = await libCount();
const rowsN0 = (await names()).length;
await p.fill('#newName', 'Data export'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
check('library: adding a name already on the roadmap adds nothing',
  (await libCount()) === libN && (await names()).length === rowsN0);
await p.fill('#newName', 'Loyalty points'); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
check('library: Enter in the add box adds the row', (await names()).includes('Loyalty points'));
check('library: and exactly one library entry', (await libCount()) === libN + 1);
check('library: focus stays in the box for the next name',
  await Q(`document.activeElement && document.activeElement.id === 'newName'`));

const rowsN = (await names()).length;
const oneStep = await Q(`(()=>{const li=[...document.querySelectorAll('.lib-item')].find(l=>l.querySelector('.nm').textContent==='One-step checkout'); return li ? li.dataset.iid : null;})()`);
await p.click('.lib-item[data-iid="' + oneStep + '"] .libchk'); await p.waitForTimeout(450);
check('library: unticking removes the row from this roadmap',
  (await names()).length === rowsN - 1 && !(await names()).includes('One-step checkout'));
check('library: with an Undo in the toast', await Q(`!!document.querySelector('#toast .toast-act')`));
await p.click('#toast .toast-act'); await p.waitForTimeout(500);
check('library: Undo restores the row with its phases',
  (await names()).includes('One-step checkout') &&
  (await Q(`(()=>{const i=[...document.querySelectorAll('.brow--data .pill span')].findIndex(s=>s.textContent==='One-step checkout');
    return document.querySelectorAll('.brow--data[data-row="'+i+'"] .chip').length;})()`)) > 0);

const libBefore = await Q(`document.querySelectorAll('.lib-item').length`);
await p.hover('.lib-item:nth-child(1)');
await p.click('.lib-item:nth-child(1) .libdel'); await p.waitForTimeout(450);
check('library: × removes a library entry, no dialog',
  (await Q(`document.querySelectorAll('.lib-item').length`)) === libBefore - 1);
check('library: removing it leaves the roadmap rows alone', (await names()).length === rowsN);
await p.keyboard.press('Control+z'); await p.waitForTimeout(450);
check('library: Ctrl+Z brings the entry back', (await Q(`document.querySelectorAll('.lib-item').length`)) === libBefore);

const unusedBefore = await Q(`(()=>{const d=JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  const used={}; d.boards.forEach(b=>Object.keys(b.views).forEach(k=>(b.views[k].rows||[]).forEach(r=>{if(r.libId)used[r.libId]=1})));
  return d.library.filter(x=>!used[x.id]).length;})()`);
check('library: there are unused entries to prune', unusedBefore > 0, unusedBefore + ' unused');
p.once('dialog', d => d.accept());
await p.click('#btnMore'); await p.click('#mPrune'); await p.waitForTimeout(600);
check('library: prune removes exactly the unused ones',
  (await Q(`(()=>{const d=JSON.parse(localStorage.getItem('roadmap-studio-v1'));
    const used={}; d.boards.forEach(b=>Object.keys(b.views).forEach(k=>(b.views[k].rows||[]).forEach(r=>{if(r.libId)used[r.libId]=1})));
    return d.library.filter(x=>!used[x.id]).length;})()`)) === 0);
check('library: pruning left the roadmap untouched', (await names()).length === rowsN);

await p.click('#btnMore'); await p.waitForTimeout(200);
check('menu: the legend item says what it will do',
  (await Q(`document.getElementById('mLegend').textContent`)) === 'Hide the legend');
check('menu: opens right under the top bar',
  await Q(`(()=>{const m=document.getElementById('menu').getBoundingClientRect(), t=document.querySelector('.topbar').getBoundingClientRect(); return m.top >= t.bottom && m.top < t.bottom + 12;})()`));
await p.click('#mLegend'); await p.waitForTimeout(300);
check('menu: the legend is hidden', await Q(`document.querySelector('.legend').hidden`));
await p.click('#btnMore'); await p.waitForTimeout(200);
check('menu: and the item flips', (await Q(`document.getElementById('mLegend').textContent`)) === 'Show the legend');
await p.click('#mLegend'); await p.waitForTimeout(300);
check('chrome: the save status is plain', (await Q(`document.getElementById('sync').textContent`)) === 'saved');

// ---------- 11e2. PASTE, HOVER CARD, EMPTY ROADMAP ----------
await p.click('.brow--data[data-row="1"] .pill span'); await p.keyboard.press('Control+a');
await p.evaluate(() => {
  const dt = new DataTransfer();
  dt.setData('text/html', '<b>Bold</b> <i>name</i><br>second');
  dt.setData('text/plain', 'Bold name\nsecond');
  document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
await p.waitForTimeout(300);
check('slide: paste keeps plain text on one line',
  (await Q(`document.querySelector('.brow--data[data-row="1"] .pill span').innerHTML`)) === 'Bold name second',
  await Q(`document.querySelector('.brow--data[data-row="1"] .pill span').innerHTML`));
await p.hover('.brow--data[data-row="1"] .label'); await p.waitForTimeout(500);
check('tooltip: stays away while the name is being typed', await Q(`document.getElementById('tip').hidden`));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  d.boards[0].views.design.rows = []; d.boards[0].views.design.milestones = [];
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(800);
await p.click('.vtab[data-view="design"]'); await p.waitForTimeout(350);
check('slide: an empty roadmap says what to do next', await Q(`!!document.querySelector('#slide .empty-hint')`));
check('slide: + Initiative is readable', (await Q(`parseFloat(getComputedStyle(document.getElementById('rowAdd')).fontSize)`)) >= 14);
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(300);

// ---------- 11e3. MANY ROWS AND MANY SPRINTS STILL FIT ----------
await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  const v = d.boards[0].views.product;
  for (let i = 0; i < 6; i++) v.rows.push({ libId: null, name: 'Extra ' + (i + 1), url: '', desc: '', area: '', accent: 'teal', box: false, cells: { '2': ['discovery'] } });
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(900);
const fit = await Q(`(()=>{const rows=[...document.querySelectorAll('.brow--data')]; const last=rows[rows.length-1].getBoundingClientRect();
  const lg=document.querySelector('.legend').getBoundingClientRect(); const add=document.getElementById('rowAdd').getBoundingClientRect();
  const slide=document.getElementById('slide').getBoundingClientRect();
  return {n:rows.length, lastBottom:+last.bottom.toFixed(1), legendTop:+lg.top.toFixed(1), addBottom:+add.bottom.toFixed(1), slideBottom:+slide.bottom.toFixed(1), notice:!document.getElementById('fitNotice').hidden};})()`);
check('layout: 16 rows shrink to fit above the legend',
  fit.n === 16 && fit.lastBottom <= fit.legendTop + 0.5 && fit.addBottom <= fit.slideBottom + 0.5 && fit.notice === false, JSON.stringify(fit));
await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  const v = d.boards[0].views.product;
  for (let i = 0; i < 12; i++) v.rows.push({ libId: null, name: 'More ' + (i + 1), url: '', desc: '', area: '', accent: 'teal', box: false, cells: {} });
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(900);
check('layout: past the minimum row height the editor says how many rows do not fit',
  await Q(`!document.getElementById('fitNotice').hidden && /\\d+ rows? do(es)? not fit/.test(document.getElementById('fitNotice').textContent)`),
  await Q(`document.getElementById('fitNotice').textContent`));

await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  d.boards[0].views.product.rows = d.boards[0].views.product.rows.slice(0, 9);
  d.boards[0].sprints = Array.from({ length: 12 }, (_, i) => ({ id: 's' + i, name: 'Sprint ' + (i + 1), quarter: 'Q1', dates: '05/01 – 16/01' }));
  d.boards[0].views.product.rows[0].cells['5'] = ['delivery', null];
  d.boards[0].views.product.milestones = [{ id: 'm', label: 'Go-live checkout release', col: 11.5, row: 2, endRow: 4 }];
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(900);
const dense = await Q(`(()=>{const s=document.getElementById('slide');
  const over=[...s.querySelectorAll('.sprint .nm > span:first-child, .sprint .dt, .chip')].filter(e=>e.scrollWidth>e.clientWidth+1).length;
  const cap=s.querySelector('.ms .cap').getBoundingClientRect(), sl=s.getBoundingClientRect();
  return {dense:s.classList.contains('is-dense'), over, cols:s.querySelectorAll('.sprint').length, capInside: cap.right <= sl.right && cap.left >= sl.left,
    half: s.querySelector('.cell[data-row="0"][data-col="5"] .chip').textContent};})()`);
check('layout: 12 sprints use the dense header and nothing overflows its box', dense.dense && dense.cols === 12 && dense.over === 0, JSON.stringify(dense));
check('layout: a caption near the right edge stays on the slide', dense.capInside === true, JSON.stringify(dense));
check('layout: a lone half-sprint chip uses the short label', dense.half === 'Dl', dense.half);
check('slide: legend markers carry no theme border',
  (await Q(`getComputedStyle(document.querySelector('.legend .mark')).borderTopWidth`)) === '0px');

// ---------- 11e4. LINES FOLLOW THEIR ROWS; UNDO TOASTS ARE HONEST ----------
await p.goto(PAGE); await p.evaluate(() => { try { localStorage.clear(); } catch(e){} });
await p.reload(); await p.waitForTimeout(800);
const msSpan = () => Q(`(m=>m.length?m[0].row+'-'+m[0].endRow:'none')(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones)`);
check('lines: the demo line starts on rows 1 to 3', (await msSpan()) === '1-3', await msSpan());
await p.hover('.brow--data[data-row="0"]');
await p.click('.brow--data[data-row="0"] .rowtools button[data-act="del"]'); await p.waitForTimeout(450);
check('lines: deleting a row above moves the go-live line up with its rows', (await msSpan()) === '0-2', await msSpan());
await p.click('.brush[data-brush="specs"]');
await p.click('.cell[data-row="7"][data-col="0"]'); await p.waitForTimeout(600);
check('toast: the delete toast is still up', await Q(`!document.getElementById('toast').hidden && !!document.querySelector('#toast .toast-act')`));
await p.click('#toast .toast-act'); await p.waitForTimeout(300);
check('toast: Undo refuses once something else changed, instead of undoing the wrong thing',
  (await Q(`document.querySelectorAll('.brow--data').length`)) === 8 &&
  (await Q(`document.querySelectorAll('.cell[data-row="7"][data-col="0"] .chip').length`)) === 1,
  await Q(`document.getElementById('toast').textContent`));
await p.click('.brow--data[data-row="0"] .pill span'); await p.keyboard.press('End');
await p.keyboard.press('Shift+Enter'); await p.waitForTimeout(300);
check('lines: a row inserted inside the span stretches the line over it', (await msSpan()) === '0-3', await msSpan());
await p.keyboard.press('Escape'); await p.waitForTimeout(450);
check('lines: and it shrinks back when the empty row goes', (await msSpan()) === '0-2', await msSpan());
await p.click('.brow--data[data-row="1"] .pill span'); await p.keyboard.press('Control+a');
await p.keyboard.type('ONE-STEP CHECKOUT'); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
check('library: a case-only rename reaches the library entry',
  (await Q(`[...document.querySelectorAll('.lib-item .nm')].map(n=>n.textContent)`)).includes('ONE-STEP CHECKOUT'));
await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  d.boards[0].views.design.rows = [{ libId: null, name: '', url: '', desc: '', area: '', accent: 'teal', box: false, cells: {} }];
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(800);
await p.click('.vtab[data-view="design"]'); await p.waitForTimeout(300);
check('load: an empty row saved by a closed tab is dropped on load',
  (await Q(`document.querySelectorAll('.brow--data').length`)) === 0 && (await Q(`!!document.querySelector('#slide .empty-hint')`)));
await p.click('.vtab[data-view="product"]'); await p.waitForTimeout(200);
await p.keyboard.press('p'); await p.waitForTimeout(600);
check('present: a roadmap with no content is left out of the deck',
  (await Q(`document.getElementById('presentCount').textContent`)).trim() === '1 / 1');
await p.keyboard.press('Escape'); await p.waitForTimeout(600);

// ---------- 11f. THE GHOST ROW MUST NOT SKEW ROW GEOMETRY ----------
await p.goto(PAGE); await p.evaluate(() => { try { localStorage.clear(); } catch(e){} });
await p.reload(); await p.waitForTimeout(900);
const lastRow = (await Q(`document.querySelectorAll('.brow--data').length`)) - 1;
await p.evaluate((n) => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1') || 'null');
  if (d) { d.boards[0].views.product.milestones = [{ id:'g', label:'G', col:3, row:0, endRow:1 }];
           localStorage.setItem('roadmap-studio-v1', JSON.stringify(d)); }
}, lastRow);
await p.click('.cell[data-row="0"][data-col="7"]'); await p.waitForTimeout(600);
await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('roadmap-studio-v1'));
  d.boards[0].views.product.milestones = [{ id:'g', label:'G', col:3, row:0, endRow:1 }];
  localStorage.setItem('roadmap-studio-v1', JSON.stringify(d));
});
await p.reload(); await p.waitForTimeout(800);
// drag the bottom grip all the way to the last row
await p.hover('.ms');
const grip2 = await p.locator('.ms .grip-bot').boundingBox();
const lastBox = await p.locator('.brow--data[data-row="' + lastRow + '"]').boundingBox();
await p.mouse.move(grip2.x + grip2.width/2, grip2.y + grip2.height/2);
await p.mouse.down();
await p.mouse.move(grip2.x + grip2.width/2, lastBox.y + lastBox.height/2, { steps: 12 });
await p.mouse.up(); await p.waitForTimeout(450);
check('geometry: a milestone grip can reach the last row',
  (await Q(`(m=>m[0].endRow)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones)`)) === lastRow,
  'endRow ' + (await Q(`(m=>m[0].endRow)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones)`)) + ' of ' + lastRow);

// dropping a go-live must land on the row under the pointer
await p.evaluate(() => { const d=JSON.parse(localStorage.getItem('roadmap-studio-v1')); d.boards[0].views.product.milestones=[]; localStorage.setItem('roadmap-studio-v1', JSON.stringify(d)); });
await p.reload(); await p.waitForTimeout(800);
const target = await p.locator('.brow--data[data-row="' + (lastRow - 1) + '"] .cell[data-col="5"]').boundingBox();
const glSrc = await p.locator('#glDrag').boundingBox();
await p.mouse.move(glSrc.x + glSrc.width/2, glSrc.y + glSrc.height/2);
await p.mouse.down();
await p.mouse.move(target.x + target.width/2, target.y + target.height/2, { steps: 14 });
await p.mouse.up(); await p.waitForTimeout(450);
check('geometry: a dropped go-live lands on the row under the pointer',
  (await Q(`(m=>m[0].row)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones)`)) === lastRow - 1,
  'row ' + (await Q(`(m=>m[0].row)(JSON.parse(localStorage.getItem('roadmap-studio-v1')).boards[0].views.product.milestones)`)) + ' expected ' + (lastRow - 1));

// ---------- 11g. PRESENTATION IS NOT AN EDITOR ----------
await p.keyboard.press('p'); await p.waitForTimeout(700);
check('present: nothing on the slide is contenteditable',
  (await Q(`document.querySelectorAll('#slide [contenteditable]').length`)) === 0);
check('present: the + Initiative row is gone',
  (await Q(`document.querySelectorAll('#slide .brow--add').length`)) === 0);
const rowsInPresent = await Q(`document.querySelectorAll('#slide .brow--data').length`);
await p.keyboard.press('Enter'); await p.waitForTimeout(400);
check('present: Enter does not insert a row into the deck',
  (await Q(`document.querySelectorAll('#slide .brow--data').length`)) === rowsInPresent);
await p.keyboard.press('Escape'); await p.waitForTimeout(700);
check('present: editing comes back on exit',
  (await Q(`document.querySelectorAll('#slide [contenteditable]').length`)) > 0 &&
  (await Q(`document.querySelectorAll('#slide .brow--add').length`)) === 1);

// ---------- 11c. IMPORT MERGES, IT DOES NOT WIPE ----------
const fixture = path.join(ROOT, 'test', '.import-fixture.json');
fs.writeFileSync(fixture, JSON.stringify({
  version: 1,
  boards: [{
    id: 'b-imported', name: 'Q1 imported', createdAt: Date.now() + 1000, updatedAt: Date.now(),
    note: { show: false, text: 'To validate' }, legend: { show: true },
    sprints: [{ id: 's1', name: 'Sprint 1', quarter: 'Q1', dates: '01/01 – 14/01' },
              { id: 's2', name: 'Sprint 2', quarter: 'Q1', dates: '15/01 – 28/01' }],
    views: {
      product: { title: 'Quarter roadmap snapshot (Q1)', milestones: [],
                 rows: [{ iid: 'imp-1', accent: 'teal', box: false, label: '',
                          cells: { '0': ['discovery'], '1': ['delivery', null] } }] },
      design: { title: 'Quarter design roadmap snapshot (Q1)', milestones: [], rows: [] }
    }
  }],
  library: [{ id: 'imp-1', name: 'Imported initiative', url: '', desc: '', area: 'Finance' }]
}));
const quartersBefore = await Q(`document.getElementById('boardSel').options.length`);
await p.click('#btnMore');
const [chooser] = await Promise.all([ p.waitForEvent('filechooser'), p.click('#mImport') ]);
await chooser.setFiles(fixture);
await p.waitForTimeout(900);
check('import: adds the quarter it carries',
  (await Q(`[...document.getElementById('boardSel').options].some(o=>o.text==='Q1 imported')`)));
check('import: keeps the quarters already there',
  (await Q(`document.getElementById('boardSel').options.length`)) === quartersBefore + 1,
  quartersBefore + ' -> ' + (await Q(`document.getElementById('boardSel').options.length`)));
check('import: half-sprint cells survive the round trip',
  (await Q(`(c=>c.querySelectorAll('.chip').length+'/'+c.querySelectorAll('.chip--ph').length)(document.querySelector('.cell[data-row="0"][data-col="1"]'))`)) === '1/1');
check('import: its library entry is merged in',
  (await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).library.some(i=>i.id==='imp-1')`)));
// an imported quarter must still be the one open after a reload
await p.reload(); await p.waitForTimeout(900);
check('import: the imported quarter is still open after a reload',
  (await Q(`document.getElementById('boardSel').selectedOptions[0].text`)) === 'Q1 imported',
  'reopened on ' + (await Q(`document.getElementById('boardSel').selectedOptions[0].text`)));
check('import: and its rows are intact',
  (await Q(`document.querySelector('.brow--data .pill span').textContent`)) === 'Imported initiative');
fs.unlinkSync(fixture);

// ---------- 12. RESPONSIVE ----------
await p.setViewportSize({ width: 620, height: 900 }); await p.waitForTimeout(600);
const narrow = await Q(`({
  scale: +(document.getElementById('canvasInner').offsetWidth/1600).toFixed(2),
  cell: (r=>r.width.toFixed(0)+'x'+r.height.toFixed(0))(document.querySelector('.cell').getBoundingClientRect()),
  pageScroll: document.documentElement.scrollWidth > innerWidth+1,
  folded: document.body.classList.contains('sidebar-off')
})`);
check('narrow: scale floored at 62%', narrow.scale >= 0.62, JSON.stringify(narrow));
check('narrow: no page-level horizontal scroll', narrow.pageScroll === false);

fs.writeFileSync(path.join(ROOT, 'test', 'review.json'), JSON.stringify({ results, pageErrors }, null, 2));
const fail = results.filter(r => !r.pass);
console.log(results.map(r => (r.pass ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '   [' + r.detail + ']' : '')).join('\n'));
console.log(`\n${results.length - fail.length}/${results.length} passed`);
if (pageErrors.length) console.log('PAGE ERRORS:\n' + pageErrors.join('\n'));
await b.close();
process.exit(fail.length || pageErrors.length ? 1 : 0);
