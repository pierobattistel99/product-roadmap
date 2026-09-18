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
check('boot: library loaded', (await Q(`document.getElementById('libCount').textContent`)) === '10 initiatives');
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
    const grips=slide.querySelectorAll('.grip,.msdel');
    out={w:c.width,h:c.height,ink:+(ink/n*100).toFixed(1),
         gripsHidden:[...grips].every(g=>getComputedStyle(g).display==='none')};
  }catch(e){out={error:String(e)}}
  inner.appendChild(slide); slide.classList.remove('is-export'); slide.classList.add('is-live'); hold.remove();
  return out;
});
check('export: PNG renders at full size', png.w === 1600 && png.h === 900 && png.ink > 15, JSON.stringify(png));
check('export: editing handles excluded from PNG', png.gripsHidden === true);

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
await p.click('.lib-item:nth-child(3) .nm'); await p.waitForTimeout(250);
await p.fill('#iArea', 'Finance'); await p.waitForTimeout(400);
check('area: saved on the initiative',
  (await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).library.find(i=>i.name==='One-step checkout').area`)) === 'Finance');
check('area: shown next to that initiative in the library',
  (await Q(`[...document.querySelectorAll('.lib-item')].some(li=>li.querySelector('.nm').textContent==='One-step checkout' && li.querySelector('.lk').textContent==='Finance')`)));
await p.fill('#iDesc', 'Collapse purchase into one reviewable step.'); await p.waitForTimeout(400);
check('description: saved on the initiative',
  (await Q(`JSON.parse(localStorage.getItem('roadmap-studio-v1')).library.find(i=>i.name==='One-step checkout').desc`)) === 'Collapse purchase into one reviewable step.');
await p.fill('#libSearch', 'finance'); await p.waitForTimeout(300);
check('area: library search matches it', (await Q(`document.querySelectorAll('.lib-item').length`)) === 2,
  'Plans and billing + One-step checkout');
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
check('theme: editor accent is #2151FF',
  (await Q(`getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim().toLowerCase()`)) === '#2151ff');

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
