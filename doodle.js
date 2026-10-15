/*!
 * web-canva / doodle.js — 在任何網頁上塗鴉的小工具
 *
 * 功能：畫筆（Apple Pencil 壓力感應）、橡皮擦（整條 / 部分）、選取移動、縮放拉伸、
 *       貼上圖片、隱藏（筆畫 / 圖片 / 全部 / 選取的目標）、復原重做、
 *       重新整理後保留（IndexedDB）、跟著網頁捲動與縮放。
 *
 * 用法：
 *   <script src="doodle.js"></script>                      ← 自動啟動，使用預設設定
 *   <script src="doodle.js" data-position="bottom"></script> ← 用 data-* 屬性調整設定
 *
 *   <script src="doodle.js" data-manual></script>          ← 不自動啟動，自己呼叫：
 *   <script>
 *     const doodle = WebDoodle.init({ position: 'bottom', color: '#2563eb' });
 *   </script>
 *
 * 設定（init 的參數 / script 標籤的 data-* 屬性）：
 *   position         'top' | 'bottom'          工具列位置（預設 'top'）
 *   initialTool      'none' | 'pen' | 'eraser' | 'select'
 *                                               一開始的工具（預設 'none' = 瀏覽，不擋住網頁）
 *   color            '#e11d48'                  預設畫筆顏色
 *   size             4                          預設畫筆粗細（1–30）
 *   collapsed        false                      一開始就把工具列收起來
 *   save             true                       是否存到瀏覽器（重新整理後保留）
 *   storageKey       location.pathname          存檔用的名字（同一個名字共用一份塗鴉）
 *   shortcuts        true                       是否啟用鍵盤快捷鍵
 *   scrollContainer  null                       網頁在某個區塊裡捲動時，指定該區塊的 CSS 選擇器
 *   anchor           null                       想讓塗鴉跟著某個容器縮放時，指定它的 CSS 選擇器
 *   autoHide         5000                       工具列多久沒用就自動收起（毫秒），0 = 不收起
 *                                               收起後：電腦把滑鼠移到畫面上緣、iPad 從上緣往下滑，
 *                                               會出現「▼ 工具列」提示，點一下就拉出來
 *   loadedMessage    '✅ 畫布工具已載入'         網頁載入時在工具列顯示 3 秒的提示，'' = 不顯示
 *
 * data-* 屬性的寫法：data-initial-tool="pen"、data-scroll-container="#content"、data-save="false"、
 *                    data-auto-hide="10000"
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  const CSS = `
  /* 工具列：先重設常見樣式，避免被使用者網頁的 button / select 樣式影響 */
  #wd-toolbar, #wd-toolbar * {
    box-sizing: border-box; font-family: system-ui, -apple-system, "Microsoft JhengHei", sans-serif;
    line-height: normal; letter-spacing: normal; text-transform: none;
  }
  #wd-toolbar button, #wd-toolbar select, #wd-toolbar input { margin: 0; color: #222; }
  #wd-toolbar.wd-bottom { top: auto; bottom: 12px; }
  /* 收合：只留下開合按鈕 */
  #wd-toolbar.wd-collapsed > :not(#wd-collapse):not(#wd-loaded) { display: none; }

  /* 載入提示：網頁剛打開時在工具列顯示一下，幾秒後淡出 */
  #wd-toolbar #wd-loaded {
    padding: 5px 10px; border-radius: 8px; background: #dcfce7; color: #166534;
    font-size: 13px; font-weight: 600; white-space: nowrap;
    transition: opacity .4s ease, max-width .4s ease, padding .4s ease;
    max-width: 240px; overflow: hidden;
  }
  #wd-toolbar #wd-loaded.wd-fade { opacity: 0; max-width: 0; padding-left: 0; padding-right: 0; }
  #wd-toolbar.wd-collapsed { padding: 6px; }
  #wd-toolbar #wd-collapse { font-weight: 600; min-width: 36px; }

  /* 自動收起：一段時間沒用就往上（工具列在下方時往下）滑出畫面 */
  #wd-toolbar { transition: transform .3s ease, opacity .3s ease; }
  #wd-toolbar.wd-autohidden {
    transform: translateX(-50%) translateY(calc(-100% - 24px)); opacity: 0; pointer-events: none;
  }
  #wd-toolbar.wd-bottom.wd-autohidden { transform: translateX(-50%) translateY(calc(100% + 24px)); }

  /* 下拉提示：工具列收起後，滑鼠靠近 / 手指從邊緣往下滑時出現，點一下就把工具列拉出來 */
  #wd-handle {
    position: fixed; left: 50%; top: 0; z-index: 2147483002;
    transform: translate(-50%, -110%); transition: transform .2s ease;
    padding: 6px 18px 7px; border: none; border-radius: 0 0 12px 12px;
    background: #2563eb; color: #fff; font: 600 13px system-ui, -apple-system, "Microsoft JhengHei", sans-serif;
    box-shadow: 0 4px 12px rgba(0,0,0,.2); cursor: pointer;
    touch-action: manipulation; -webkit-tap-highlight-color: transparent; user-select: none;
  }
  #wd-handle:not(.wd-show) { box-shadow: none; }   /* 藏起來時陰影會露出一條線，一起拿掉 */
  #wd-handle.wd-show { transform: translate(-50%, 0); }
  #wd-handle.wd-bottom { top: auto; bottom: 0; border-radius: 12px 12px 0 0; transform: translate(-50%, 110%); }
  #wd-handle.wd-bottom.wd-show { transform: translate(-50%, 0); }
  @media (pointer: coarse) { #wd-handle { padding: 10px 26px 11px; font-size: 15px; } }
  /* 工具列 */
  #wd-toolbar {
    position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
    width: max-content; max-width: calc(100vw - 24px); justify-content: center;
    display: flex; gap: 6px; align-items: center; flex-wrap: wrap;
    padding: 8px 10px; background: #fff; border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0,0,0,.15); z-index: 2147483001; user-select: none;
  }
  #wd-toolbar button {
    border: 1px solid #ddd; background: #fff; border-radius: 8px;
    padding: 6px 10px; cursor: pointer; font-size: 14px;
  }
  #wd-toolbar button.active { background: #2563eb; color: #fff; border-color: #2563eb; }
  #wd-toolbar button:disabled { opacity: .4; cursor: default; }
  #wd-toolbar .sep { width: 1px; height: 24px; background: #ddd; margin: 0 4px; }
  #wd-toolbar select { border: 1px solid #ddd; border-radius: 8px; padding: 5px 6px; font-size: 13px; background: #fff; }
  #wd-toolbar input[type=color] { width: 32px; height: 28px; border: none; padding: 0; background: none; cursor: pointer; }
  #wd-toolbar label { font-size: 13px; display: flex; align-items: center; gap: 4px; }

  /* 觸控裝置 (iPad)：按鈕放大、避免雙擊縮放與點擊閃色 */
  #wd-toolbar { touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
  @media (pointer: coarse) {
    #wd-toolbar button { padding: 9px 13px; font-size: 16px; }
    #wd-toolbar select { padding: 8px; font-size: 15px; }
    #wd-toolbar input[type=checkbox] { width: 20px; height: 20px; }
  }
  /* 繪圖時禁止長按選字 / 跳出選單（瀏覽模式不受影響） */
  body.wd-drawing { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }

  /* 塗鴉層：覆蓋整個視窗 */
  /* 大小由程式設定（高度可能比視窗高，見 resize()），所以只固定左上角 */
  #wd-board { position: fixed; top: 0; left: 0; z-index: 2147483000; touch-action: none;
           -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  #wd-board.wd-passthrough { pointer-events: none; }   /* 瀏覽模式：滑鼠穿透到網頁 */
  #wd-board.wd-pen    { cursor: crosshair; }
  #wd-board.wd-eraser { cursor: cell; }
  #wd-board.wd-select { cursor: default; }
`;

  const TOOLBAR_HTML = `
  <button id="wd-collapse" title="收起 / 展開工具列">－</button>
  <button data-tool="none"   title="瀏覽網頁 (Esc)">🖱️ 瀏覽</button>
  <button data-tool="pen"    title="畫筆 (P)">✏️ 畫筆</button>
  <button data-tool="eraser" title="橡皮擦 (E，再按一次切換模式)">🧽 橡皮擦</button>
  <select id="wd-eraserMode" title="橡皮擦模式">
    <option value="whole">整條擦除</option>
    <option value="partial">部分擦除</option>
  </select>
  <button data-tool="select" title="選取方塊 (S)">⬚ 選取</button>
  <span class="sep"></span>
  <button id="wd-pasteBtn" title="貼上剪貼簿中的圖片 (Ctrl+V)">📋 貼上</button>
  <button id="wd-imgBtn" title="插入圖片檔（iPad 可從照片選取）">🖼️ 圖片</button>
  <input type="file" id="wd-imgFile" accept="image/*" multiple hidden>
  <span class="sep"></span>
  <input type="color" id="wd-color" value="#e11d48" title="顏色">
  <label>粗細 <input type="range" id="wd-size" min="1" max="30" value="4"></label>
  <label title="開啟後只有 Apple Pencil 能畫，手指用來捲動網頁（偵測到 Pencil 會自動開啟）"><input type="checkbox" id="wd-penOnly"> 只用筆畫</label>
  <span class="sep"></span>
  <button id="wd-delSel" disabled title="刪除選取 (Delete)">🗑️ 刪除選取</button>
  <button id="wd-undo" title="復原 (Ctrl+Z)">↶</button>
  <button id="wd-redo" title="重做 (Ctrl+Y)">↷</button>
  <button id="wd-clear" title="清除全部">清除</button>
  <span class="sep"></span>
  <select id="wd-hideMode" title="要隱藏什麼">
    <option value="strokes">筆畫 (H)</option>
    <option value="images">圖片 (I)</option>
    <option value="all">全部 (Shift+H)</option>
    <option value="selection" disabled>選取的目標 (K)</option>
  </select>
  <button id="wd-hideApply" title="隱藏 / 顯示下拉選單選的對象">🙈 隱藏</button>
  <button id="wd-unhideSel" disabled title="把「選取的目標」藏起來的東西全部顯示回來 (Shift+K)">👁️ 取消隱藏</button>
`;

  const DEFAULTS = {
    position: 'top',
    initialTool: 'none',
    color: '#e11d48',
    size: 4,
    collapsed: false,
    save: true,
    storageKey: null,          // null = 用 location.pathname
    shortcuts: true,
    scrollContainer: null,
    anchor: null,
    autoHide: 5000,            // 工具列多久沒用就自動收起（毫秒）；0 = 不自動收起
    loadedMessage: '✅ 畫布工具已載入',   // 網頁載入時在工具列顯示的提示；'' = 不顯示
  };

  let instance = null;         // 一個網頁只能有一個塗鴉板

  function init(options) {
    if (instance) return instance;
    const opts = Object.assign({}, DEFAULTS, options);

    // ---------- 建立樣式、工具列、畫布 ----------
    const style = document.createElement('style');
    style.id = 'wd-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    const toolbarEl = document.createElement('div');
    toolbarEl.id = 'wd-toolbar';
    toolbarEl.innerHTML = TOOLBAR_HTML;
    if (opts.position === 'bottom') toolbarEl.classList.add('wd-bottom');
    document.body.appendChild(toolbarEl);

    const boardEl = document.createElement('canvas');
    boardEl.id = 'wd-board';
    document.body.appendChild(boardEl);

    // 所有元素 id 都有 wd- 前綴，避免和使用者網頁衝突
    const $ = id => document.getElementById('wd-' + id);
    $('color').value = opts.color;
    $('size').value = opts.size;

    const canvas = $('board');
    const ctx = canvas.getContext('2d');
    const colorInput = $('color');
    const sizeInput = $('size');
    const delSelBtn = $('delSel');

    // 每條筆畫以向量儲存：{ color, size, points: [{x,y}], bbox }
    // 圖片也放在同一個陣列：{ type:'image', img, x, y, w, h, bbox }（共用選取 / 移動 / 復原 / 圖層順序）
    // 座標使用「世界座標」（見下方座標系統說明），捲動 / 縮放網頁時塗鴉會跟著內容走
    let strokes = [];
    let undoStack = [], redoStack = [];
    let tool = 'pen';
    let current = null;          // 正在畫的筆畫
    let selected = new Set();    // 被選取的筆畫
    let selRect = null;          // 選取方塊 {x0,y0,x1,y1}
    let eraserPos = null;        // 橡皮擦游標位置
    let erasedThisDrag = [];     // 一次拖曳中擦掉的原始筆畫（合併成一個復原步驟）
    let addedThisDrag = new Set(); // 部分擦除產生的新片段
    let eraseLast = null;        // 上一個擦除位置
    const eraserModeInput = $('eraserMode');
    const penOnlyInput = $('penOnly');
    let dragging = false;
    let moving = null;           // 拖曳移動選取中 {last:{x,y}, dx, dy}
    let scaling = null;          // 拖曳控制點縮放 / 拉伸中 {handle, anchor, items, before}

    // ---------- 隱藏筆畫 / 圖片（只影響顯示，不算編輯動作，不進復原紀錄） ----------
    // 隱藏中的東西看不到，也不能擦、不能選
    const hidden = { strokes: false, images: false };
    const hideModeInput = $('hideMode');
    const hideApplyBtn = $('hideApply');
    // 個別物件也可以用「選取的目標」單獨藏起來（s.hidden = true，會存檔、可復原）
    const isHidden = s => s.hidden || (s.type === 'image' ? hidden.images : hidden.strokes);
    // 例：setHidden({ images: true })、setHidden({ strokes: false, images: false })
    function setHidden(change) {
      Object.assign(hidden, change);
      selected = new Set([...selected].filter(s => !isHidden(s)));
      updateButtons(); render();
      save();
    }
    // 「全部」：只要還有一種看得到就全部隱藏，否則全部顯示
    const toggleAll = () => {
      const hideAll = !(hidden.strokes && hidden.images);
      setHidden({ strokes: hideAll, images: hideAll });
    };

    // ---------- 隱藏下拉選單 ----------
    // 預設「筆畫」；一選取東西就自動切到「選取的目標」，取消選取後回到使用者原本選的項目
    let userHideMode = 'strokes';
    let hadSelection = false;
    hideModeInput.onchange = () => {
      if (hideModeInput.value !== 'selection') userHideMode = hideModeInput.value;
      hideModeInput.blur();      // 讓快捷鍵（Delete、H…）馬上又能用
      syncHideUI();
    };
    function syncHideUI() {
      const has = selected.size > 0;
      hideModeInput.querySelector('[value=selection]').disabled = !has;
      if (has && !hadSelection) hideModeInput.value = 'selection';              // 剛選到東西
      if (!has && hideModeInput.value === 'selection') hideModeInput.value = userHideMode;   // 選取取消
      hadSelection = has;
      // 按鈕顯示「隱藏」或「顯示」：看選單選的對象目前是不是已經藏起來
      const mode = hideModeInput.value;
      const isOff = mode === 'strokes' ? hidden.strokes
        : mode === 'images' ? hidden.images
        : mode === 'all' ? hidden.strokes && hidden.images
        : false;
      hideApplyBtn.textContent = isOff ? '👁️ 顯示' : '🙈 隱藏';
      hideApplyBtn.classList.toggle('active', isOff);
    }
    hideApplyBtn.onclick = () => {
      const mode = hideModeInput.value;
      if (mode === 'strokes') setHidden({ strokes: !hidden.strokes });
      else if (mode === 'images') setHidden({ images: !hidden.images });
      else if (mode === 'all') toggleAll();
      else hideSelected();
    };

    // ---------- 畫布尺寸 (支援高 DPI) ----------
    // iPad / iPhone 捲動時網址列會伸縮，innerHeight 一直變、resize 事件連續觸發。
    // 如果每次都重設畫布大小，就會反覆重新配置一大塊畫布記憶體（iPad 約 15MB），
    // Safari 記憶體吃緊時會先丟掉網頁內容 → 整頁閃一下空白。
    // 所以：寬度沒變時，畫布高度只增不減；尺寸真的變了才重新配置。
    let canvasW = 0, canvasH = 0, canvasDpr = 0;
    function resize() {
      detectScroller();          // 視窗大小改變可能讓「誰在捲動」改變
      const dpr = window.devicePixelRatio || 1;
      const w = innerWidth;
      const h = (w === canvasW && dpr === canvasDpr) ? Math.max(canvasH, innerHeight) : innerHeight;
      if (w !== canvasW || h !== canvasH || dpr !== canvasDpr) {
        canvasW = w; canvasH = h; canvasDpr = dpr;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      render();
    }
    addEventListener('resize', resize);

    // 捲動、排版改變時：同一個畫面週期只重畫一次（scroll 事件一幀可能來好幾次）
    let renderQueued = false;
    function requestRender() {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => { renderQueued = false; render(); });
    }

    // ---------- 捲動：整頁捲動，或網頁裡的捲動區塊（overflow: auto 的 div） ----------
    // 塗鴉會跟著捲動區塊的內容一起移動，捲出區塊範圍就被裁掉看不到。
    // 預設自動偵測；偵測不準時可以直接指定捲動區塊的 CSS 選擇器，例如 '#content'
    const SCROLL_CONTAINER_SELECTOR = opts.scrollContainer || null;
    let scroller = null;         // null = 整個視窗捲動
    const pageScrollable = () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
      || document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    // 「主要」捲動區塊：可以捲動，而且佔畫面一半以上（避免抓到小小的下拉清單）
    const isMainScroller = el => el instanceof Element && el !== document.documentElement && el !== document.body
      && !el.closest('#wd-toolbar')
      && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)
      && /(auto|scroll)/.test(getComputedStyle(el).overflowY + getComputedStyle(el).overflowX)
      && el.clientWidth >= innerWidth * 0.5 && el.clientHeight >= innerHeight * 0.5;
    function detectScroller() {
      if (SCROLL_CONTAINER_SELECTOR) { scroller = document.querySelector(SCROLL_CONTAINER_SELECTOR); return; }
      if (pageScrollable()) { scroller = null; return; }
      scroller = [...document.querySelectorAll('body *')].find(isMainScroller) || null;
    }
    const scrollTarget = () => scroller || window;
    // capture: 捲動區塊的 scroll 事件不會冒泡到 window，用 capture 才收得到
    addEventListener('scroll', e => {
      if (!SCROLL_CONTAINER_SELECTOR && e.target !== document && !scroller && !pageScrollable()
          && isMainScroller(e.target)) scroller = e.target;   // 第一次捲動時自動認出捲動區塊
      requestRender();
    }, { passive: true, capture: true });

    // ---------- 座標系統：跟著網頁邊界移動、寬高各自拉伸縮小 ----------
    // 筆畫與圖片存的是「世界座標」：原點是錨點元素（預設整個網頁）的左上角，
    // 錨點的寬度固定等於 REF_WIDTH 個單位、可視高度固定等於 REF_HEIGHT 個單位。
    // 視窗變寬 / 變窄 → 水平比例 kx 改變；視窗變高 / 變矮 → 垂直比例 ky 改變，
    // 所以所有東西會跟著網頁邊界移動，寬和高各自等比例拉伸或縮小。
    const REF_WIDTH = 1000, REF_HEIGHT = 1000;
    const ANCHOR_SELECTOR = opts.anchor || null;   // 想跟著某個容器縮放（例如 'main'）
    const anchorEl = () => (ANCHOR_SELECTOR && document.querySelector(ANCHOR_SELECTOR)) || document.documentElement;
    // ox, oy：世界原點在螢幕上的位置；kx, ky：水平 / 垂直比例；kw：線寬比例（兩者的幾何平均）
    let view = { ox: 0, oy: 0, kx: 1, ky: 1, kw: 1 };
    function updateView() {
      let ox, oy, w, h, clip = null;
      if (scroller && !ANCHOR_SELECTOR) {
        // 捲動區塊：原點 = 區塊內容的左上角（會隨 scrollTop 移動），比例看區塊的可視大小
        const r = scroller.getBoundingClientRect();
        const left = r.left + scroller.clientLeft, top = r.top + scroller.clientTop;
        ox = left - scroller.scrollLeft; oy = top - scroller.scrollTop;
        w = scroller.clientWidth; h = scroller.clientHeight;
        clip = { x: left, y: top, w, h };   // 只畫在區塊的可視範圍內，捲出去的就消失
      } else {
        const a = anchorEl(), r = a.getBoundingClientRect();
        const page = a === document.documentElement;
        ox = r.left; oy = r.top;
        w = page ? a.clientWidth : r.width;     // 整頁時：不含捲軸的寬度
        h = page ? a.clientHeight : r.height;   // 整頁時：可視區域高度（iPad 捲動時不會跟著工具列跳動）
      }
      const kx = (w || REF_WIDTH) / REF_WIDTH, ky = (h || REF_HEIGHT) / REF_HEIGHT;
      view = { ox, oy, kx, ky, kw: Math.sqrt(kx * ky), clip };
    }
    // 螢幕座標 → 世界座標
    const toWorld = e => ({ x: (e.clientX - view.ox) / view.kx, y: (e.clientY - view.oy) / view.ky });
    // 世界座標 → 畫布座標（畫布已平移到世界原點）
    const S = p => ({ x: p.x * view.kx, y: p.y * view.ky, p: p.p });
    // 世界中的位移量在螢幕上的距離（寬高比例不同，所以距離都在螢幕上算，橡皮擦才會是正圓）
    const screenDist = (dx, dy) => Math.hypot(dx * view.kx, dy * view.ky);

    // 網頁排版改變（不一定有 resize 事件，例如側欄收合、字型載入）也重畫
    new ResizeObserver(() => requestRender()).observe(anchorEl());

    // ---------- 繪製 ----------
    // 世界座標先換成螢幕座標再畫，線寬用 kw 縮放 → 寬高拉伸時筆觸仍是圓的，不會變成扁橢圓
    function drawStroke(s, highlight) {
      ctx.save();
      if (s.type === 'image') {
        const a = S(s);
        ctx.drawImage(s.img, a.x, a.y, s.w * view.kx, s.h * view.ky);
        if (highlight) {
          ctx.strokeStyle = 'rgba(37,99,235,.6)';
          ctx.lineWidth = 3;
          ctx.strokeRect(a.x, a.y, s.w * view.kx, s.h * view.ky);
        }
        ctx.restore();
        return;
      }
      const pts = s.points.map(S);
      ctx.lineCap = ctx.lineJoin = 'round';
      if (highlight) {             // 被選取：外框加一圈藍色光暈
        ctx.strokeStyle = 'rgba(37,99,235,.35)';
        ctx.lineWidth = maxWidth(s) * view.kw + 8;
        tracePath(pts); ctx.stroke();
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size * view.kw;
      if (pts.length === 1) {      // 單點：畫一個圓點
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, screenWidth(s, pts[0]) / 2, 0, Math.PI * 2); ctx.fill();
      } else if (s.pressure) {
        tracePressure(s, pts);
      } else {
        tracePath(pts); ctx.stroke();
      }
      ctx.restore();
    }

    // 壓力感應：線寬 = 粗細 × (0.4 ~ 1.6)，滑鼠的預設壓力 0.5 剛好是 1 倍
    const widthAt = (s, pt) => s.pressure ? s.size * (0.4 + 1.2 * pt.p) : s.size;
    const maxWidth = s => s.pressure ? s.size * 1.6 : s.size;
    const screenWidth = (s, pt) => widthAt(s, pt) * view.kw;   // 螢幕上的線寬

    // 有壓力的筆畫：一段一段畫，每段用自己的線寬（仍用二次貝茲曲線保持平滑）
    function tracePressure(s, pts) {
      let from = pts[0];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i];
        const to = i < pts.length - 1
          ? { x: (a.x + pts[i + 1].x) / 2, y: (a.y + pts[i + 1].y) / 2 }
          : a;
        ctx.lineWidth = screenWidth(s, a);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(a.x, a.y, to.x, to.y);
        ctx.stroke();
        from = to;
      }
    }

    // 用二次貝茲曲線讓線條平滑
    function tracePath(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    function render() {
      updateView();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      if (view.clip) {                   // 捲動區塊：超出區塊可視範圍的部分不畫
        ctx.beginPath();
        ctx.rect(view.clip.x, view.clip.y, view.clip.w, view.clip.h);
        ctx.clip();
      }
      ctx.translate(view.ox, view.oy);   // 原點移到世界原點；座標由 S() 換算
      for (const s of strokes) if (!isHidden(s)) drawStroke(s, selected.has(s));
      if (current) drawStroke(current);

      const box = selRect ? normRect(selRect) : selectionBBox();
      if (box) {                   // 選取方塊（拖曳中）或選取範圍外框（虛線）
        const a = S({ x: box.x0, y: box.y0 }), b = S({ x: box.x1, y: box.y1 });
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#2563eb';
        ctx.fillStyle = 'rgba(37,99,235,.08)';
        ctx.lineWidth = 1;
        ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
        ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
        if (!selRect && tool === 'select') {   // 控制點：角落是方形，邊的中點是長條
          const hs = handleSize();
          ctx.setLineDash([]);
          ctx.fillStyle = '#fff';
          ctx.lineWidth = 1.5;
          for (const h of handles(box)) {
            const c = S(h);
            const w = h.axis === 'y' ? hs * 1.8 : h.axis === 'x' ? hs * 0.7 : hs;
            const ht = h.axis === 'x' ? hs * 1.8 : h.axis === 'y' ? hs * 0.7 : hs;
            ctx.fillRect(c.x - w / 2, c.y - ht / 2, w, ht);
            ctx.strokeRect(c.x - w / 2, c.y - ht / 2, w, ht);
          }
        }
        ctx.restore();
      }
      if (tool === 'eraser' && eraserPos) {   // 橡皮擦範圍圈（螢幕上的正圓）
        const c = S(eraserPos);
        ctx.save();
        ctx.strokeStyle = '#666';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(c.x, c.y, eraserRadius(), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // ---------- 幾何工具 ----------
    // 橡皮擦半徑：螢幕像素（固定大小，不跟著網頁縮放）
    const eraserRadius = () => Math.max(8, +sizeInput.value * 2);
    const normRect = r => ({
      x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1),
      x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1),
    });

    // 外框（世界座標）：筆畫只記點的範圍，線寬在使用時依目前比例另外加
    function computeBBox(s) {
      if (s.type === 'image') {
        s.bbox = { x0: s.x, y0: s.y, x1: s.x + s.w, y1: s.y + s.h };
        return;
      }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of s.points) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
      s.bbox = { x0, y0, x1, y1 };
    }
    // 物件在螢幕上超出外框的寬度（筆畫是半個線寬，圖片是 0）
    const inkPad = s => s.type === 'image' ? 0 : maxWidth(s) * view.kw / 2;

    // 所有選取物件的合併外框（含線寬，再外擴 6px 方便抓取）
    function selectionBBox() {
      if (!selected.size) return null;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const s of selected) {
        const pad = inkPad(s) + 6, padX = pad / view.kx, padY = pad / view.ky;
        x0 = Math.min(x0, s.bbox.x0 - padX); y0 = Math.min(y0, s.bbox.y0 - padY);
        x1 = Math.max(x1, s.bbox.x1 + padX); y1 = Math.max(y1, s.bbox.y1 + padY);
      }
      return { x0, y0, x1, y1 };
    }
    const inRect = (p, r) => r && p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

    // 平移筆畫（同時更新外框）
    function translateStrokes(list, dx, dy) {
      for (const s of list) {
        if (s.type === 'image') { s.x += dx; s.y += dy; }
        else for (const p of s.points) { p.x += dx; p.y += dy; }
        s.bbox.x0 += dx; s.bbox.x1 += dx; s.bbox.y0 += dy; s.bbox.y1 += dy;
      }
    }

    // 找出滑鼠下方最上層的物件
    const strokeAt = p => [...strokes].reverse().find(s =>
      s.type === 'image' ? !isHidden(s) && inRect(p, s.bbox) : hitStroke(s, p, 4));

    // ---------- 縮放 / 拉伸（控制點） ----------
    // 四個角：等比例縮放（axis 'both'）
    // 左右兩邊中點：只拉伸寬度（axis 'x'）；上下兩邊中點：只拉伸高度（axis 'y'）
    // anchor 是拖曳時固定不動的點（對角 / 對邊）
    const handleSize = () => matchMedia('(pointer: coarse)').matches ? 14 : 9;
    function handles(b) {
      const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
      return [
        { x: b.x0, y: b.y0, axis: 'both', cursor: 'nwse-resize', anchor: { x: b.x1, y: b.y1 } },
        { x: b.x1, y: b.y0, axis: 'both', cursor: 'nesw-resize', anchor: { x: b.x0, y: b.y1 } },
        { x: b.x1, y: b.y1, axis: 'both', cursor: 'nwse-resize', anchor: { x: b.x0, y: b.y0 } },
        { x: b.x0, y: b.y1, axis: 'both', cursor: 'nesw-resize', anchor: { x: b.x1, y: b.y0 } },
        { x: b.x0, y: my, axis: 'x', cursor: 'ew-resize', anchor: { x: b.x1, y: my } },
        { x: b.x1, y: my, axis: 'x', cursor: 'ew-resize', anchor: { x: b.x0, y: my } },
        { x: mx, y: b.y0, axis: 'y', cursor: 'ns-resize', anchor: { x: mx, y: b.y1 } },
        { x: mx, y: b.y1, axis: 'y', cursor: 'ns-resize', anchor: { x: mx, y: b.y0 } },
      ];
    }
    // 點到哪個控制點？（用螢幕距離判斷）回傳 {x, y, axis, cursor, anchor}
    function handleAt(p) {
      const b = selectionBBox();
      if (!b) return null;
      const hs = handleSize();
      return handles(b).find(h =>
        Math.abs(p.x - h.x) * view.kx <= hs && Math.abs(p.y - h.y) * view.ky <= hs) || null;
    }

    // 記錄 / 還原物件的幾何狀態（給縮放與復原用）
    const snapshot = s => s.type === 'image'
      ? { x: s.x, y: s.y, w: s.w, h: s.h }
      : { size: s.size, points: s.points.map(p => ({ ...p })) };
    function restore(s, snap) {
      if (s.type === 'image') Object.assign(s, snap);
      else { s.size = snap.size; s.points = snap.points.map(p => ({ ...p })); }
      computeBBox(s);
    }

    // 以 anchor 為固定點，水平縮放 kx 倍、垂直縮放 ky 倍
    // kx = ky 時是等比例縮放；只有一邊不是 1 時就是拉伸（圖片會變形）
    function scaleFrom(s, snap, a, kx, ky) {
      if (s.type === 'image') {
        Object.assign(s, { x: a.x + (snap.x - a.x) * kx, y: a.y + (snap.y - a.y) * ky, w: snap.w * kx, h: snap.h * ky });
      } else {
        s.size = Math.max(0.5, snap.size * Math.min(kx, ky));   // 拉伸時線寬不變，縮小時跟著變細
        s.points = snap.points.map(p => ({ ...p, x: a.x + (p.x - a.x) * kx, y: a.y + (p.y - a.y) * ky }));
      }
      computeBBox(s);
    }

    // 點到線段距離
    function distToSeg(p, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    }

    // 橡皮擦是否碰到筆畫（r 是螢幕像素；距離換到螢幕上算）
    function hitStroke(s, p, r) {
      if (s.type === 'image') return false;   // 橡皮擦不擦圖片（圖片用選取後刪除）
      if (isHidden(s)) return false;          // 看不到的筆畫不能擦、不能選
      const b = s.bbox, reachX = (r + inkPad(s)) / view.kx, reachY = (r + inkPad(s)) / view.ky;
      if (p.x < b.x0 - reachX || p.x > b.x1 + reachX || p.y < b.y0 - reachY || p.y > b.y1 + reachY) return false;
      const pts = s.points, q = S(p);
      if (pts.length === 1) return screenDist(p.x - pts[0].x, p.y - pts[0].y) <= r + screenWidth(s, pts[0]) / 2;
      for (let i = 0; i < pts.length - 1; i++) {
        const reach = r + Math.max(screenWidth(s, pts[i]), screenWidth(s, pts[i + 1])) / 2;
        if (distToSeg(q, S(pts[i]), S(pts[i + 1])) <= reach) return true;
      }
      return false;
    }

    // 選取方塊：筆畫只要有任何一點落在方塊內就選取
    function strokeInRect(s, r) {
      if (isHidden(s)) return false;
      const b = s.bbox;
      if (b.x1 < r.x0 || b.x0 > r.x1 || b.y1 < r.y0 || b.y0 > r.y1) return false;
      if (s.type === 'image') return true;    // 圖片：方塊碰到就選取
      return s.points.some(p => p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1);
    }

    // ---------- 復原 / 重做 ----------
    // 每個動作記成 {type:'add'|'remove'|'move', strokes:[...], dx?, dy?}
    //           或 {type:'replace', removed:[...], added:[...]}（橡皮擦）
    //           或 {type:'transform', strokes:[...], before:[快照], after:[快照]}（縮放）
    function commit(action) {
      undoStack.push(action);
      redoStack = [];
      updateButtons();
      save();
    }
    function apply(action, reverse) {
      if (action.type === 'move') {
        const k = reverse ? -1 : 1;
        translateStrokes(action.strokes, k * action.dx, k * action.dy);
        selected = new Set(action.strokes);   // 復原移動後保持選取，方便繼續調整
        return;
      }
      if (action.type === 'transform') {      // 縮放：直接套用前 / 後的快照
        const snaps = reverse ? action.before : action.after;
        action.strokes.forEach((s, i) => restore(s, snaps[i]));
        selected = new Set(action.strokes);
        return;
      }
      if (action.type === 'hide') {           // 個別隱藏 / 取消隱藏
        const v = reverse ? !action.value : action.value;
        action.strokes.forEach(s => { s.hidden = v; });
        selected = v ? new Set() : new Set(action.strokes);
        return;
      }
      if (action.type === 'replace') {
        const [out, back] = reverse ? [action.added, action.removed] : [action.removed, action.added];
        strokes = strokes.filter(s => !out.includes(s));
        strokes.push(...back);
        selected.clear();
        return;
      }
      const adding = (action.type === 'add') !== reverse;
      if (adding) strokes.push(...action.strokes);
      else strokes = strokes.filter(s => !action.strokes.includes(s));
      selected.clear();
    }
    function undo() { const a = undoStack.pop(); if (a) { apply(a, true);  redoStack.push(a); } afterHistory(); }
    function redo() { const a = redoStack.pop(); if (a) { apply(a, false); undoStack.push(a); } afterHistory(); }
    function afterHistory() {
      selected = new Set([...selected].filter(s => !isHidden(s)));   // 隱藏中的筆畫不留在選取裡
      updateButtons(); render();
      save();
    }

    function removeStrokes(list) {
      if (!list.length) return;
      strokes = strokes.filter(s => !list.includes(s));
      commit({ type: 'remove', strokes: list });
    }
    function deleteSelected() {
      removeStrokes([...selected]);
      selected.clear();
      updateButtons(); render();
    }

    // 隱藏選取：只藏選到的東西；取消隱藏：把個別隱藏的全部顯示回來（兩者都可復原）
    function hideSelected() {
      const list = [...selected];
      if (!list.length) return;
      list.forEach(s => { s.hidden = true; });
      selected.clear();
      commit({ type: 'hide', strokes: list, value: true });
      render();
    }
    function unhideAll() {
      const list = strokes.filter(s => s.hidden);
      if (!list.length) return;
      list.forEach(s => { s.hidden = false; });
      commit({ type: 'hide', strokes: list, value: false });
      if (tool === 'select') selected = new Set(list);   // 顯示回來後順便選起來，看得出是哪些
      updateButtons(); render();
    }

    function updateButtons() {
      delSelBtn.disabled = selected.size === 0;
      syncHideUI();
      const n = strokes.filter(s => s.hidden).length;
      const unhideBtn = $('unhideSel');
      unhideBtn.disabled = n === 0;
      unhideBtn.textContent = n ? `👁️ 取消隱藏 (${n})` : '👁️ 取消隱藏';
      $('undo').disabled = !undoStack.length;
      $('redo').disabled = !redoStack.length;
    }

    // ---------- 滑鼠 / 觸控 / Apple Pencil (Pointer Events) ----------
    let activeId = null;         // 目前負責畫圖的那支筆 / 手指，其他指標一律忽略（防手掌誤觸）
    let fingerScroll = null;     // 「只用筆畫」模式下，手指拖曳改成捲動網頁 {id, x, y}（非 iPad 時才用）

    // iPad / iPhone：「只用筆畫」時，手指交給 Safari 原生捲動和雙指縮放，只有 Apple Pencil 拿來畫。
    // （以前是用程式 scrollBy 模擬手指捲動，雙指滑動時會和 Safari 自己的手勢互相搶，
    //   造成網頁抖動、往回跳、塗鴉跟著晃）
    // 判斷 Pencil 靠 touch 事件的 touchType === 'stylus'，這是 iOS Safari 才有的屬性。
    const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS 會偽裝成 Mac
    const nativeFingerScroll = () => isIOS && penOnlyInput.checked;
    function syncTouchAction() {
      canvas.style.touchAction = nativeFingerScroll() ? 'pan-x pan-y pinch-zoom' : '';
    }
    penOnlyInput.addEventListener('change', syncTouchAction);

    // 筆的壓力 (0~1) 做一點平滑，避免線寬抖動
    function pressureOf(ev, prev) {
      const raw = ev.pressure || 0.5;
      return prev == null ? raw : prev * 0.6 + raw * 0.4;
    }

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;

      // 偵測到 Apple Pencil：自動切到「只用筆畫」，之後手指只負責捲動
      if (e.pointerType === 'pen' && !penOnlyInput.checked) { penOnlyInput.checked = true; syncTouchAction(); }
      if (e.pointerType === 'touch' && penOnlyInput.checked) {
        // iPad：瀏覽器自己會捲動，這裡什麼都不做；其他裝置才用程式模擬捲動
        if (!nativeFingerScroll() && !fingerScroll && !dragging)
          fingerScroll = { id: e.pointerId, x: e.clientX, y: e.clientY };
        return;
      }
      if (dragging) return;      // 已經在畫了 → 第二個觸點（例如手掌）不理它

      try { canvas.setPointerCapture(e.pointerId); } catch {}   // 拿不到 capture 也照樣能畫
      activeId = e.pointerId;
      dragging = true;
      updateView();
      const p = toWorld(e);

      if (tool === 'pen') {
        if (hidden.strokes) setHidden({ strokes: false });   // 開始畫 → 自動顯示，避免畫在看不到的筆畫上
        const usePressure = e.pointerType === 'pen';   // Apple Pencil / 繪圖筆一律有壓力感應
        if (usePressure) p.p = pressureOf(e);
        // 粗細滑桿是螢幕像素，存成世界單位 → 之後網頁縮放時線條粗細也等比例縮放
        current = { color: colorInput.value, size: +sizeInput.value / view.kw, pressure: usePressure, points: [p] };
      } else if (tool === 'eraser') {
        erasedThisDrag = []; addedThisDrag = new Set();
        eraseAt(p);
        eraseLast = p;
      } else if (tool === 'select' && handleAt(p)) {
        // 抓到控制點 → 以對角 / 對邊為固定點縮放或拉伸
        const h = handleAt(p), items = [...selected];
        scaling = { handle: h, anchor: h.anchor, items, before: items.map(snapshot) };
      } else if (tool === 'select') {
        // 點在選取範圍內 → 拖曳移動；點在未選取的筆畫上 → 選它並移動；否則拉新的選取方塊
        if (!inRect(p, selectionBBox())) {
          const s = strokeAt(p);
          selected = new Set(s ? [s] : []);
        }
        if (selected.size) {
          moving = { last: p, dx: 0, dy: 0 };
        } else {
          selRect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
        }
        updateButtons();
      }
      render();
    });

    canvas.addEventListener('pointermove', e => {
      if (fingerScroll && e.pointerId === fingerScroll.id) {
        scrollTarget().scrollBy(fingerScroll.x - e.clientX, fingerScroll.y - e.clientY);
        fingerScroll.x = e.clientX; fingerScroll.y = e.clientY;
        return;
      }
      if (dragging && e.pointerId !== activeId) return;
      if (penOnlyInput.checked && e.pointerType === 'touch') return;

      const p = toWorld(e);
      if (tool === 'eraser') eraserPos = p;   // Pencil 懸停 (hover) 時也會顯示橡皮擦範圍
      if (!dragging) {
        if (tool === 'eraser') render();
        if (tool === 'select')     // 滑過可拖曳的地方顯示移動游標
          canvas.style.cursor = handleAt(p)?.cursor
            || (inRect(p, selectionBBox()) || strokeAt(p) ? 'move' : '');
        return;
      }

      if (tool === 'pen' && current) {
        // 使用 coalesced events 取得更密集的軌跡點（Apple Pencil 240Hz），線條更順
        const co = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        const evs = co.length ? co : [e];
        for (const ev of evs) {
          const q = toWorld(ev), last = current.points[current.points.length - 1];
          if (screenDist(q.x - last.x, q.y - last.y) < 1) continue;
          if (current.pressure) q.p = pressureOf(ev, last.p);
          current.points.push(q);
        }
      } else if (tool === 'eraser') {
        eraseAlong(eraseLast, p);
      } else if (tool === 'select' && scaling) {
        const { anchor: a, handle: h } = scaling;
        let kx = 1, ky = 1;
        if (h.axis === 'both') {
          // 角落：把滑鼠位置投影到「固定點 → 原角落」的方向上，算出等比例倍率
          const vx = h.x - a.x, vy = h.y - a.y;
          kx = ky = Math.max(0.05, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy));
        } else if (h.axis === 'x') {
          kx = Math.max(0.05, (p.x - a.x) / (h.x - a.x));   // 左右拉伸：只看水平距離
        } else {
          ky = Math.max(0.05, (p.y - a.y) / (h.y - a.y));   // 上下拉伸：只看垂直距離
        }
        scaling.items.forEach((s, i) => scaleFrom(s, scaling.before[i], a, kx, ky));
      } else if (tool === 'select' && moving) {
        const dx = p.x - moving.last.x, dy = p.y - moving.last.y;
        translateStrokes(selected, dx, dy);
        moving.dx += dx; moving.dy += dy; moving.last = p;
      } else if (tool === 'select' && selRect) {
        selRect.x1 = p.x; selRect.y1 = p.y;
        const r = normRect(selRect);
        selected = new Set(strokes.filter(s => strokeInRect(s, r)));
      }
      render();
    });

    function endDrag(e) {
      if (fingerScroll && e.pointerId === fingerScroll.id) { fingerScroll = null; return; }
      if (!dragging || e.pointerId !== activeId) return;
      dragging = false;
      activeId = null;
      if (tool === 'pen' && current) {
        computeBBox(current);
        strokes.push(current);
        commit({ type: 'add', strokes: [current] });
        current = null;
      } else if (tool === 'eraser' && erasedThisDrag.length) {
        commit({ type: 'replace', removed: erasedThisDrag, added: [...addedThisDrag] });
        erasedThisDrag = []; addedThisDrag = new Set();
      } else if (tool === 'select' && scaling) {
        const { items, before } = scaling;
        commit({ type: 'transform', strokes: items, before, after: items.map(snapshot) });
        scaling = null;
      } else if (tool === 'select' && moving) {
        if (moving.dx || moving.dy)
          commit({ type: 'move', strokes: [...selected], dx: moving.dx, dy: moving.dy });
        moving = null;
      } else if (tool === 'select') {
        selRect = null;
      }
      updateButtons(); render();
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', e => { if (!dragging) { eraserPos = null; render(); } });

    // iPad Safari：擋掉畫布上的雙擊縮放、長按放大鏡與選字。
    // 但「只用筆畫」時，純手指的觸控不擋，讓 Safari 原生捲動 / 縮放；有 Apple Pencil 參與才擋。
    for (const t of ['touchstart', 'touchmove'])
      canvas.addEventListener(t, e => {
        if (nativeFingerScroll() && ![...e.touches].some(tc => tc.touchType === 'stylus')) return;
        e.preventDefault();
      }, { passive: false });

    // 從上一個位置到目前位置沿路擦除，滑鼠移動很快時也不會漏掉中間的線
    function eraseAlong(from, to) {
      const step = eraserRadius() / 2;   // 螢幕像素
      const n = Math.max(1, Math.ceil(screenDist(to.x - from.x, to.y - from.y) / step));
      for (let i = 1; i <= n; i++)
        eraseAt({ x: from.x + (to.x - from.x) * i / n, y: from.y + (to.y - from.y) * i / n });
      eraseLast = to;
    }

    function eraseAt(p) {
      const r = eraserRadius();
      const partial = eraserModeInput.value === 'partial';
      for (const s of strokes.filter(s => hitStroke(s, p, r))) {
        const idx = strokes.indexOf(s);
        // 整條模式：直接移除；部分模式：切掉橡皮擦圈內的點，剩下的拆成數段新筆畫
        const pieces = partial ? splitStroke(s, p, r) : [];
        strokes.splice(idx, 1, ...pieces);    // 放回原本的圖層位置
        // 這次拖曳中才產生的碎片又被擦 → 直接從新增清單拿掉，不必記入「移除」
        if (addedThisDrag.has(s)) addedThisDrag.delete(s);
        else erasedThisDrag.push(s);
        pieces.forEach(q => addedThisDrag.add(q));
      }
    }

    // 把筆畫在橡皮擦圓內的部分切掉，回傳剩下的片段
    function splitStroke(s, c, r) {
      const pts = densify(s.points, 2);
      const pieces = [];
      let run = [];
      for (const p of pts) {
        // 點的筆觸圓若與橡皮擦重疊就刪（在螢幕上量距離）
        if (screenDist(p.x - c.x, p.y - c.y) <= r + screenWidth(s, p) / 2) {
          if (run.length) pieces.push(run);
          run = [];
        } else run.push(p);
      }
      if (run.length) pieces.push(run);
      return pieces.map(points => {
        const q = { color: s.color, size: s.size, pressure: s.pressure, points };
        computeBBox(q);
        return q;
      });
    }

    // 補點：讓相鄰兩點在螢幕上的距離不超過 gap 像素，部分擦除才切得精準
    function densify(pts, gap) {
      const out = [{ ...pts[0] }];
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const n = Math.ceil(screenDist(b.x - a.x, b.y - a.y) / gap);
        for (let k = 1; k <= n; k++) {
          const t = k / n, q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          if (b.p != null) q.p = a.p + (b.p - a.p) * t;   // 壓力也一起內插
          out.push(q);
        }
      }
      return out;
    }

    // 繪圖模式下滾輪仍可捲動網頁
    // （畫布蓋在網頁上，所以要自己把滾輪轉給整頁或捲動區塊）
    canvas.addEventListener('wheel', e => scrollTarget().scrollBy(e.deltaX, e.deltaY), { passive: true });

    // ---------- 工具切換 ----------
    function setTool(t) {
      tool = t;
      selected.clear(); selRect = null; eraserPos = null;
      canvas.className = t === 'none' ? 'wd-passthrough' : 'wd-' + t;
      canvas.style.cursor = '';
      document.body.classList.toggle('wd-drawing', t !== 'none');
      toolbarEl.querySelectorAll('[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === t));
      updateButtons(); render();
    }
    toolbarEl.querySelectorAll('[data-tool]').forEach(b =>
      b.addEventListener('click', () => setTool(b.dataset.tool)));

    delSelBtn.onclick = deleteSelected;
    $('unhideSel').onclick = unhideAll;
    $('undo').onclick = undo;
    $('redo').onclick = redo;
    $('clear').onclick = () => {
      if (!strokes.length) return;
      selected.clear();
      removeStrokes([...strokes]);
      render();
    };

    // ---------- 插入圖片：貼上 / 選檔 / 拖放 ----------
    // 把圖片檔變成畫布物件，預設放在畫面正中央（太大就縮到視窗 60% 以內）
    // at：放置位置的螢幕座標 {clientX, clientY}
    function addImage(blob, at) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        updateView();
        const k = Math.min(1, innerWidth * 0.6 / img.naturalWidth, innerHeight * 0.6 / img.naturalHeight);
        const w = img.naturalWidth * k / view.kx, h = img.naturalHeight * k / view.ky;   // 螢幕尺寸 → 世界單位
        const c = toWorld(at || { clientX: innerWidth / 2, clientY: innerHeight / 2 });
        const item = { type: 'image', img, blob, x: c.x - w / 2, y: c.y - h / 2, w, h };
        computeBBox(item);
        strokes.push(item);
        commit({ type: 'add', strokes: [item] });
        if (hidden.images) setHidden({ images: false });   // 圖片隱藏中又貼新圖 → 自動顯示，才看得到剛貼的
        setTool('select');                    // 貼上後直接選取，馬上就能拖曳 / 縮放
        selected = new Set([item]);
        updateButtons(); render();
      };
      img.src = url;
    }
    const imageFiles = list => [...list].filter(f => f.type.startsWith('image/'));

    // Ctrl+V / ⌘V
    // 工具列收起來時不處理貼上 / 拖放，交給網頁本身
    const isCollapsed = () => toolbarEl.classList.contains('wd-collapsed');
    addEventListener('paste', e => {
      if (isCollapsed()) return;
      if (/INPUT|TEXTAREA/.test(e.target.tagName) || e.target.isContentEditable) return;
      const files = [...e.clipboardData.items]
        .filter(i => i.kind === 'file' && i.type.startsWith('image/'))
        .map(i => i.getAsFile());
      if (!files.length) return;
      e.preventDefault();
      files.forEach(f => addImage(f));
    });

    // 「貼上」按鈕：用 Clipboard API 讀剪貼簿（需要 https 或 localhost）
    $('pasteBtn').onclick = async () => {
      if (!navigator.clipboard?.read) {
        alert('這個瀏覽器（或非 https 連線）不能直接讀剪貼簿，\n請改用 Ctrl+V / ⌘V，或按「🖼️ 圖片」選檔。');
        return;
      }
      try {
        let found = false;
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find(t => t.startsWith('image/'));
          if (type) { addImage(await item.getType(type)); found = true; }
        }
        if (!found) alert('剪貼簿裡沒有圖片');
      } catch (err) {
        alert('無法讀取剪貼簿：' + err.message);
      }
    };

    // 「圖片」按鈕：選檔（iPad 會出現 照片圖庫 / 拍照 / 檔案）
    const fileInput = $('imgFile');
    $('imgBtn').onclick = () => fileInput.click();
    fileInput.onchange = () => { imageFiles(fileInput.files).forEach(f => addImage(f)); fileInput.value = ''; };

    // 拖放圖片檔到網頁上，放在放開的位置
    addEventListener('dragover', e => { if (!isCollapsed() && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    addEventListener('drop', e => {
      if (isCollapsed()) return;
      const files = imageFiles(e.dataTransfer.files);
      if (!files.length) return;
      e.preventDefault();
      files.forEach((f, i) => addImage(f, { clientX: e.clientX + i * 20, clientY: e.clientY + i * 20 }));
    });

    // ---------- 快捷鍵 ----------
    addEventListener('keydown', e => {
      if (!opts.shortcuts) return;
      // 使用者正在網頁的輸入框打字時不攔截
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      // 工具列收起來時，快捷鍵全部不作用，避免干擾網頁本身的快捷鍵
      if (toolbarEl.classList.contains('wd-collapsed')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
      else if ((k === 'delete' || k === 'backspace') && selected.size) { e.preventDefault(); deleteSelected(); }
      else if (k === 'p') setTool('pen');
      else if (k === 'e') {
        if (tool === 'eraser')   // 已經是橡皮擦 → 切換整條 / 部分
          eraserModeInput.value = eraserModeInput.value === 'whole' ? 'partial' : 'whole';
        else setTool('eraser');
      }
      else if (k === 's') setTool('select');
      else if (k === 'h' && e.shiftKey) toggleAll();
      else if (k === 'h') setHidden({ strokes: !hidden.strokes });
      else if (k === 'i') setHidden({ images: !hidden.images });
      else if (k === 'k' && e.shiftKey) unhideAll();
      else if (k === 'k') hideSelected();
      else if (k === 'escape') setTool('none');
    });

    // ---------- 保存：重新整理後還原（IndexedDB，可以直接存圖片檔） ----------
    // 每個網址各自一份（以 pathname 當 key）；復原 / 重做紀錄不保存
    const DB_NAME = 'web-doodle', STORE = 'boards', KEY = opts.storageKey || location.pathname;
    let loaded = false;          // 讀檔完成前不存檔，避免空白狀態蓋掉舊資料

    let dbPromise = null;        // 只開一次連線，之後重複使用
    function openDB() {
      return dbPromise ??= new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    async function idb(mode, fn) {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode), req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      });
    }

    let saveQueue = Promise.resolve();   // 存檔排隊依序執行，確保最後寫入的是最新狀態
    function save() {
      if (!loaded || !opts.save) return;
      const items = strokes.map(s => s.type === 'image'
        ? { type: 'image', blob: s.blob, x: s.x, y: s.y, w: s.w, h: s.h, hidden: !!s.hidden }
        : { color: s.color, size: s.size, pressure: s.pressure, points: s.points.map(p => ({ ...p })), hidden: !!s.hidden });
      const record = { version: 3, items, hidden: hidden.strokes, hiddenImages: hidden.images, savedAt: Date.now() };   // v3 = 寬高各自縮放的世界座標
      saveQueue = saveQueue
        .then(() => idb('readwrite', st => st.put(record, KEY)))
        .catch(err => console.warn('塗鴉存檔失敗（可能是無痕模式或空間不足）', err));
    }

    // 舊版存檔換成目前的世界座標：先算出它「在目前畫面上」的位置，再換回世界座標
    //   v1：文件像素座標
    //   v2：只跟著寬度等比例縮放（水平、垂直都用 kx）
    function migrate(it, version) {
      const { ox, oy, kx, ky, kw } = view;
      const toScreen = version === 2
        ? { x: v => ox + v * kx, y: v => oy + v * kx, len: kx }
        : { x: v => v - scrollX, y: v => v - scrollY, len: 1 };
      const wx = v => (toScreen.x(v) - ox) / kx, wy = v => (toScreen.y(v) - oy) / ky;
      if (it.type === 'image') {
        Object.assign(it, { x: wx(it.x), y: wy(it.y), w: it.w * toScreen.len / kx, h: it.h * toScreen.len / ky });
      } else {
        it.size = it.size * toScreen.len / kw;
        for (const p of it.points) { p.x = wx(p.x); p.y = wy(p.y); }
      }
    }

    async function load() {
      updateView();
      let migrated = false;
      try {
        const data = await idb('readonly', st => st.get(KEY));
        if (data) {
          const restored = await Promise.all(data.items.map(async it => {
            if (it.type === 'image') {
              const img = new Image();
              await new Promise(res => { img.onload = img.onerror = res; img.src = URL.createObjectURL(it.blob); });
              it.img = img;
            }
            if (data.version !== 3) migrate(it, data.version);
            computeBBox(it);
            return it;
          }));
          strokes = [...restored, ...strokes];   // 讀檔期間若已經畫了東西，放在舊內容上面
          if (data.hidden || data.hiddenImages) setHidden({ strokes: !!data.hidden, images: !!data.hiddenImages });
          migrated = data.version !== 3;
        }
      } catch (err) {
        console.warn('塗鴉讀檔失敗', err);
      }
      loaded = true;
      updateButtons(); render();
      if (undoStack.length || migrated) save();   // 讀檔期間的新筆畫 / 轉換過的舊資料補存
    }

    // ---------- 收合工具列 ----------
    // 收起來時切回「瀏覽」，網頁可以正常操作；塗鴉仍然顯示
    const collapseBtn = $('collapse');
    function setCollapsed(v) {
      toolbarEl.classList.toggle('wd-collapsed', v);
      collapseBtn.textContent = v ? '✏️' : '－';
      collapseBtn.title = v ? '展開塗鴉工具列' : '收起工具列';
      if (v) setTool('none');
    }
    collapseBtn.onclick = () => setCollapsed(!toolbarEl.classList.contains('wd-collapsed'));

    // ---------- 自動收起工具列 + 下拉提示 ----------
    // 工具列 opts.autoHide 毫秒沒有被使用 → 滑出畫面。要叫回來：
    //   電腦：滑鼠移到畫面上緣（工具列在下方時是下緣）→ 出現「▼ 工具列」提示 → 點一下
    //   iPad：手指 / Pencil 從上緣往下滑 → 出現提示 → 點一下
    const atBottom = opts.position === 'bottom';
    const handleEl = document.createElement('button');
    handleEl.id = 'wd-handle';
    handleEl.type = 'button';
    handleEl.textContent = atBottom ? '▲ 工具列' : '▼ 工具列';
    handleEl.title = '顯示塗鴉工具列';
    if (atBottom) handleEl.classList.add('wd-bottom');
    document.body.appendChild(handleEl);

    const EDGE = 40;             // 邊緣感應區（像素）
    let idleTimer = null, handleTimer = null, hovering = false;
    const isToolbarHidden = () => toolbarEl.classList.contains('wd-autohidden');
    const inEdge = y => atBottom ? y >= innerHeight - EDGE : y <= EDGE;

    function hideToolbar() {
      if (hovering) { bumpIdle(); return; }      // 滑鼠還停在工具列上 → 晚點再說
      toolbarEl.classList.add('wd-autohidden');
    }
    function showToolbar() {
      toolbarEl.classList.remove('wd-autohidden');
      hideHandle();
      bumpIdle();
    }
    // 重新計時：每次使用工具列都從頭算
    function bumpIdle() {
      clearTimeout(idleTimer);
      if (opts.autoHide > 0) idleTimer = setTimeout(hideToolbar, opts.autoHide);
    }
    function showHandle() {
      if (!isToolbarHidden()) return;
      handleEl.classList.add('wd-show');
      clearTimeout(handleTimer);
      handleTimer = setTimeout(hideHandle, 3000);   // 沒點就自己縮回去
    }
    function hideHandle() {
      clearTimeout(handleTimer);
      handleEl.classList.remove('wd-show');
    }
    handleEl.onclick = showToolbar;

    // 「使用工具列」= 在工具列上移動、點擊、改設定
    toolbarEl.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') hovering = true; bumpIdle(); });
    toolbarEl.addEventListener('pointerleave', () => { hovering = false; bumpIdle(); });
    for (const t of ['pointerdown', 'input', 'change', 'focusin']) toolbarEl.addEventListener(t, bumpIdle);

    // 電腦：滑鼠靠近邊緣就出現提示，離開邊緣一段距離就收回
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !isToolbarHidden() || swipe) return;
      if (inEdge(e.clientY)) showHandle();
      else if (atBottom ? e.clientY < innerHeight - EDGE * 3 : e.clientY > EDGE * 3) hideHandle();
    }, { capture: true, passive: true });

    // iPad：手指 / Pencil 從邊緣往內滑 → 出現提示
    // 從邊緣開始的觸控先攔下來，不會畫出線，也不會觸發網頁的點擊
    let swipe = null;
    addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !isToolbarHidden() || !inEdge(e.clientY) || e.target === handleEl) return;
      swipe = { id: e.pointerId, y0: e.clientY };
      e.stopPropagation();
    }, { capture: true });
    addEventListener('pointermove', e => {
      if (!swipe || e.pointerId !== swipe.id) return;
      const dist = atBottom ? swipe.y0 - e.clientY : e.clientY - swipe.y0;
      if (dist > 30) showHandle();
      e.stopPropagation();
    }, { capture: true });
    const endSwipe = e => { if (swipe && e.pointerId === swipe.id) { swipe = null; e.stopPropagation(); } };
    addEventListener('pointerup', endSwipe, { capture: true });
    addEventListener('pointercancel', endSwipe, { capture: true });

    resize();
    setTool(['none', 'pen', 'eraser', 'select'].includes(opts.initialTool) ? opts.initialTool : 'none');
    setCollapsed(!!opts.collapsed);
    if (opts.save) load(); else { loaded = true; updateButtons(); render(); }
    bumpIdle();

    // ---------- 載入提示 ----------
    // 網頁打開時在工具列最前面顯示「✅ 畫布工具已載入」，3 秒後淡出並移除
    if (opts.loadedMessage) {
      const msg = document.createElement('span');
      msg.id = 'wd-loaded';
      msg.setAttribute('role', 'status');
      msg.textContent = opts.loadedMessage;
      collapseBtn.after(msg);
      setTimeout(() => {
        msg.classList.add('wd-fade');
        setTimeout(() => msg.remove(), 450);
      }, 3000);
    }

    // ---------- 給網頁程式使用的 API ----------
    instance = {
      version: VERSION,
      setTool,                                   // doodle.setTool('pen')
      undo,
      redo,
      clear: () => $('clear').click(),           // 清除全部（可復原）
      collapse: setCollapsed,                    // doodle.collapse(true) 收起工具列
      hide: what => {                            // doodle.hide('strokes' | 'images' | 'all')
        if (what === 'strokes') setHidden({ strokes: true });
        else if (what === 'images') setHidden({ images: true });
        else setHidden({ strokes: true, images: true });
      },
      show: () => setHidden({ strokes: false, images: false }),
      showToolbar,                               // 把自動收起的工具列叫出來
      hideToolbar: () => { hovering = false; hideToolbar(); },
    };
    return instance;
  }

  global.WebDoodle = { init, version: VERSION };

  // ---------- 自動啟動：<script src="doodle.js"> 沒有 data-manual 就自動 init ----------
  const script = document.currentScript;
  if (script && !('manual' in script.dataset)) {
    const d = script.dataset, opts = {};
    const bool = v => v !== 'false' && v !== '0';
    if (d.position) opts.position = d.position;
    if (d.initialTool) opts.initialTool = d.initialTool;
    if (d.color) opts.color = d.color;
    if (d.size) opts.size = +d.size;
    if ('collapsed' in d) opts.collapsed = bool(d.collapsed);
    if ('save' in d) opts.save = bool(d.save);
    if (d.storageKey) opts.storageKey = d.storageKey;
    if ('shortcuts' in d) opts.shortcuts = bool(d.shortcuts);
    if (d.scrollContainer) opts.scrollContainer = d.scrollContainer;
    if (d.anchor) opts.anchor = d.anchor;
    if ('autoHide' in d) opts.autoHide = d.autoHide === 'false' ? 0 : +d.autoHide || 0;
    if ('loadedMessage' in d) opts.loadedMessage = d.loadedMessage === 'false' ? '' : d.loadedMessage;
    const start = () => init(opts);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
  }
})(window);
