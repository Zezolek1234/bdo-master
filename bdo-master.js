// ==UserScript==
// @name         BDO - Master (v8.15)
// @namespace    http://tampermonkey.net/
// @version      8.15
// @description  Na potrzeby raportowania danych dla paliw alternatywnych, uproszczona wersja TwojeBDO.
// @author       Michał Tkocz PreZero National Sales PL
// @match        https://rejestr-bdo.mos.gov.pl/*
// @grant        GM_openInTab
// @updateURL    https://raw.githubusercontent.com/Zezolek1234/bdo-master/main/bdo-master.js
// @downloadURL  https://raw.githubusercontent.com/Zezolek1234/bdo-master/main/bdo-master.js
// ==/UserScript==

(function () {
    'use strict';

    console.log("--- BDO KPO Master v8.15: Start ---");

    // --- USTAWIENIA (STORAGE) ---
    const SETTINGS_KEY = 'bdo_master_settings';
    const WINDOW_MINIMIZED_KEY = 'bdo_window_minimized_state';
    const WINDOW_POS_KEY = 'bdo_window_pos';

    let settings = {
        enableTableExtender: true,
        enableFloatingWindow: true,
        enableDetailsButton: true,
        enableRowHighlight: false,
        enableQuickSwitch: true,
        highlightFilters: ""
    };

    const savedSettings = localStorage.getItem(SETTINGS_KEY);
    if (savedSettings) {
        try {
            settings = { ...settings, ...JSON.parse(savedSettings) };
        } catch (e) { console.error("Błąd ładowania ustawień BDO", e); }
    }

    let parsedFilters = [];
    function updateParsedFilters() {
        parsedFilters = settings.highlightFilters.trim() !== ""
            ? settings.highlightFilters.split(',').map(f => f.trim().toLowerCase()).filter(f => f.length > 0)
            : [];
    }
    updateParsedFilters();

    function saveSettingsOnly() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(text).replace(/[&<>"']/g, m => map[m]);
    }

    const SessionCache = {
        get(url) {
            try {
                const dataStr = sessionStorage.getItem('bdo_kpo_' + btoa(encodeURIComponent(url)));
                if (!dataStr) return null;
                const data = JSON.parse(dataStr);
                if (Date.now() - data.timestamp > 14400000) { // 4 godziny TTL
                    sessionStorage.removeItem('bdo_kpo_' + btoa(encodeURIComponent(url)));
                    return null;
                }
                return data;
            } catch (e) { return null; }
        },
        set(url, data) {
            if (data.carrier === "Błąd" || data.info === "Błąd") return;
            try {
                data.timestamp = Date.now();
                sessionStorage.setItem('bdo_kpo_' + btoa(encodeURIComponent(url)), JSON.stringify(data));
            } catch (e) { }
        },
        clear() {
            const keysToRemove = [];
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                if (key && key.startsWith('bdo_kpo_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => sessionStorage.removeItem(key));
        }
    };

    const cssStyles = `
        @keyframes bdoFadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        #bdo-settings-panel {
            position: fixed; top: 60px; right: 20px; width: 330px; background: #ffffff;
            border: 1px solid #cbd5e1; border-radius: 4px; padding: 15px; z-index: 2147483647;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: none; color: #333;
        }
        #bdo-settings-panel.bdo-show-panel { display: block; animation: bdoFadeIn 0.2s ease-out forwards; }
        #bdo-settings-panel h4 { margin: 0 0 15px 0; font-size: 14px; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 8px; }
        .bdo-set-row { margin-bottom: 12px; display: flex; align-items: flex-start; gap: 8px; cursor: pointer; font-weight: normal; }
        .bdo-set-row input[type="checkbox"] { cursor: pointer; margin-top: 2px; }
        
        .bdo-chips-container { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; min-height: 40px; background: #fff; cursor: text; }
        .bdo-chip { background: #e2e8f0; border-radius: 12px; padding: 3px 8px; font-size: 11px; display: flex; align-items: center; gap: 4px; color: #334155; }
        .bdo-chip-remove { cursor: pointer; font-weight: bold; color: #94a3b8; transition: color 0.2s; }
        .bdo-chip-remove:hover { color: #ef4444; }
        .bdo-chips-input { border: none; outline: none; flex: 1; min-width: 60px; font-size: 12px; background: transparent; }

        #bdo-settings-btn-fallback {
            position: fixed; bottom: 20px; left: 20px; width: 45px; height: 45px; background: #0f4c75; color: white; border-radius: 50%;
            display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 2147483647; opacity: 0.8;
            box-shadow: 0 4px 10px rgba(0,0,0,0.2); transition: all 0.3s; font-size: 20px;
        }
        #bdo-settings-btn-fallback:hover { opacity: 1; transform: scale(1.1); background: #002642; }

        #bdo-float-window {
            position: fixed; width: 420px; background: #ffffff; border: 2px solid #cbd5e1;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3); z-index: 2147483646; border-radius: 8px;
            display: flex; flex-direction: column; overflow: hidden; opacity: 1 !important;
            transition: opacity 0.2s;
        }
        #bdo-float-header {
            background: linear-gradient(135deg, #0f4c75 0%, #002642 100%); color: white; padding: 12px 16px;
            cursor: move; font-weight: 600; display: flex; justify-content: space-between; align-items: center;
            font-size: 15px; user-select: none;
        }
        #bdo-controls { display: flex; gap: 10px; }
        .bdo-ctrl-btn {
            background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.4); color: white; cursor: pointer;
            width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px;
            font-weight: bold; font-size: 14px; transition: background 0.2s;
        }
        .bdo-ctrl-btn:hover { background: rgba(255,255,255,0.3); }

        #bdo-float-content { padding: 16px; background: #f8fafc; max-height: 80vh; overflow-y: auto; border-top: 1px solid #e2e8f0; transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), padding 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s; opacity: 1; }
        #bdo-float-content.bdo-minimized { max-height: 0; padding-top: 0; padding-bottom: 0; opacity: 0; overflow: hidden; border-top: none; }
        .bdo-row { margin-bottom: 12px; }
        .bdo-row:last-child { margin-bottom: 0; }
        .bdo-label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; margin-bottom: 4px; font-weight: bold; }
        .bdo-val-box { color:#000000; background: #ffffff; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; min-height: 24px; word-wrap: break-word; transition: all 0.2s; line-height: 1.4; }
        .bdo-interactive { cursor: pointer; border-left: 5px solid #0f4c75; }
        .bdo-interactive:hover { background-color: #e0f2fe; border-color: #38bdf8; }
        .bdo-copied-success { background-color: #86efac !important; border-color: #22c55e !important; color: #064e3b !important; }
        .bdo-highlight-blue { background-color: #eff6ff; border-color: #bfdbfe; color: #1e40af; font-weight: 600; }

        .bdo-extra-col { width: 150px; max-width: 150px; vertical-align: middle !important; }
        .bdo-cell-added {
            border-left: 1px solid #e2e8f0; max-width: 150px; overflow: hidden; text-overflow: ellipsis;
            white-space: nowrap; padding: 8px !important; vertical-align: middle !important;
            cursor: help; background-color: transparent !important; color: inherit;
        }
        .bdo-loading-spinner { font-size: 12px; color: #94a3b8; }

        tr.bdo-highlighted-row > td { background-color: #fffde7 !important; }
        tr.bdo-highlighted-row:hover > td { background-color: #fff9c4 !important; }
        .bdo-hidden-btn-group { display: none !important; }

        .bdo-custom-tooltip {
            position: fixed; background-color: rgba(0, 0, 0, 0.85); color: #ffffff; border-radius: 4px;
            padding: 8px 12px; font-size: 12px; z-index: 2147483647; pointer-events: none; opacity: 0;
            visibility: hidden; transition: opacity 0.2s ease-in-out; max-width: 350px; white-space: pre-wrap;
            word-wrap: break-word; box-shadow: 0 4px 6px rgba(0,0,0,0.15); font-family: inherit;
            line-height: 1.4; text-align: center;
        }
        .bdo-custom-tooltip.bdo-show { opacity: 1; visibility: visible; }
        .bdo-custom-tooltip::after {
            content: ''; position: absolute; top: 100%; left: 50%; margin-left: -6px; border-width: 6px;
            border-style: solid; border-color: rgba(0, 0, 0, 0.85) transparent transparent transparent;
        }
        .bdo-custom-tooltip.bdo-flip::after {
            top: auto; bottom: 100%; border-color: transparent transparent rgba(0, 0, 0, 0.85) transparent;
        }

        .bdo-switch-item-active { color: #0f4c75 !important; font-weight: bold !important; }
        .bdo-switch-item-active .bdo-switch-name::before { content: '✓ '; }

        #bdo-panel-close {
            position: absolute; top: 10px; right: 12px; background: none; border: none;
            cursor: pointer; font-size: 20px; color: #94a3b8; line-height: 1; padding: 0 4px;
            border-radius: 4px; font-weight: normal;
        }
        #bdo-panel-close:hover { color: #ef4444; background: #fef2f2; }


    `;

    const styleEl = document.createElement('style');
    styleEl.id = 'bdo-master-styles';
    styleEl.innerHTML = cssStyles;
    document.head.appendChild(styleEl);

    const bdoTooltip = document.createElement('div');
    bdoTooltip.className = 'bdo-custom-tooltip';
    document.body.appendChild(bdoTooltip);

    function bindCustomTooltip(cell, text) {
        if (cell.dataset.tooltipBound === "true") return;
        cell.removeAttribute('title');

        if (!text || text === "---" || text === "Ładowanie..." || text.includes('fa-spinner')) {
            cell.style.cursor = 'default';
            return;
        }

        cell.style.cursor = 'help';
        cell.dataset.tooltipBound = "true";

        cell.addEventListener('mouseenter', () => {
            bdoTooltip.textContent = text;
            bdoTooltip.classList.add('bdo-show');
            bdoTooltip.classList.remove('bdo-flip');

            const rect = cell.getBoundingClientRect();
            let top = rect.top - bdoTooltip.offsetHeight - 8;
            let left = rect.left + (rect.width / 2) - (bdoTooltip.offsetWidth / 2);

            if (top < 0) {
                top = rect.bottom + 8;
                bdoTooltip.classList.add('bdo-flip');
            }

            if (left < 10) left = 10;
            if (left + bdoTooltip.offsetWidth > window.innerWidth - 10) {
                left = window.innerWidth - bdoTooltip.offsetWidth - 10;
            }

            bdoTooltip.style.top = top + 'px';
            bdoTooltip.style.left = left + 'px';
        });

        cell.addEventListener('mouseleave', () => {
            bdoTooltip.classList.remove('bdo-show');
        });
    }

    let settingsCreated = false;

    function createSettingsUI() {
        if (settingsCreated) return;
        if (document.getElementById('bdo-settings-panel')) {
            settingsCreated = true;
            return;
        }

        const loggedUserLi = document.getElementById('logged-user');

        const panel = document.createElement('div');
        panel.id = 'bdo-settings-panel';

        panel.innerHTML = `
            <button id="bdo-panel-close" title="Zamknij panel">×</button>
            <h4><i class="fa fa-cogs"></i> Ustawienia BDO Master</h4>
            <label class="bdo-set-row">
                <input type="checkbox" id="chk-table-ext" ${settings.enableTableExtender ? 'checked' : ''}>
                Rozszerzenie tabeli o dodatkowe informacje
            </label>
            <label class="bdo-set-row" style="${settings.enableTableExtender ? '' : 'opacity: 0.5; pointer-events: none;'}">
                <input type="checkbox" id="chk-details-btn" ${settings.enableDetailsButton ? 'checked' : ''}>
                Szybkie szczegóły karty
            </label>
            <label class="bdo-set-row">
                <input type="checkbox" id="chk-float-win" ${settings.enableFloatingWindow ? 'checked' : ''}>
                Pływające okno danych w karcie KPO
            </label>
            <label class="bdo-set-row">
                <input type="checkbox" id="chk-quick-switch" ${settings.enableQuickSwitch ? 'checked' : ''}>
                Szybkie przełączanie Podmiotów / MPD
            </label>

            <hr style="margin: 15px 0 10px 0; border-color: #eee;">

            <label class="bdo-set-row">
                <input type="checkbox" id="chk-row-highlight" ${settings.enableRowHighlight ? 'checked' : ''}>
                Wyróżnianie wierszy tabeli (Odbierający)
            </label>
            <div id="div-highlight-filters" style="margin-left: 24px; margin-bottom: 12px; display: ${settings.enableRowHighlight ? 'block' : 'none'};">
                <div style="font-size: 11px; color: #64748b; margin-bottom: 4px;">Wpisz nazwy podmiotów:</div>
                <div style="display: flex; gap: 4px; align-items: stretch;">
                    <div id="bdo-chips-wrapper" class="bdo-chips-container" style="flex: 1; margin: 0; min-height: 36px; padding: 4px 6px;">
                        <input type="text" id="bdo-chips-input" class="bdo-chips-input" placeholder="np. EKO-MAR...">
                    </div>
                    <button type="button" id="bdo-add-chip-btn" class="btn btn-success btn-sm" style="padding: 0 12px; border-radius: 4px; display: flex; align-items: center; justify-content: center; margin: 0;" title="Dodaj podmiot"><i class="fa fa-plus" style="padding: 0 !important; margin: 0 !important;"></i></button>
                </div>
            </div>
            
            <hr style="margin: 15px 0 10px 0; border-color: #eee;">
            <button id="btn-clear-cache" class="btn btn-danger btn-sm" style="width: 100%;">
                <i class="fa fa-trash"></i> Wyczyść Pamięć (Cache)
            </button>
        `;
        document.body.appendChild(panel);

        if (loggedUserLi) {
            const btnLi = document.createElement('li');
            btnLi.id = 'bdo-settings-btn';
            btnLi.innerHTML = `
                <a href="#" title="Ustawienia BDO Master" style="padding-left: 12px; padding-right: 12px; opacity: 0.6; font-size: 25px; border-right: 1px solid #eaeaea;">
                    <i class="pe-7s-config" style="color:#6a6c6f;"></i>
                </a>
            `;

            btnLi.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (panel.classList.contains('bdo-show-panel')) {
                    panel.classList.remove('bdo-show-panel');
                    setTimeout(() => panel.style.display = 'none', 300);
                } else {
                    panel.style.display = 'block';
                    panel.classList.add('bdo-show-panel');
                }
            });

            loggedUserLi.parentNode.insertBefore(btnLi, loggedUserLi);
        } else {
            const fallbackBtn = document.createElement('div');
            fallbackBtn.id = 'bdo-settings-btn-fallback';
            fallbackBtn.innerHTML = '<i class="fa fa-cog"></i>';
            fallbackBtn.title = 'Ustawienia BDO Master';
            document.body.appendChild(fallbackBtn);

            fallbackBtn.onclick = (e) => {
                e.stopPropagation();
                if (panel.classList.contains('bdo-show-panel')) {
                    panel.classList.remove('bdo-show-panel');
                    setTimeout(() => panel.style.display = 'none', 300);
                } else {
                    panel.style.display = 'block';
                    panel.classList.add('bdo-show-panel');
                }
            };
        }

        settingsCreated = true;

        const btnPanelClose = document.getElementById('bdo-panel-close');
        if (btnPanelClose) {
            btnPanelClose.addEventListener('click', () => {
                panel.classList.remove('bdo-show-panel');
                setTimeout(() => panel.style.display = 'none', 300);
            });
        }

        const chkTableExt = panel.querySelector('#chk-table-ext');
        const chkDetailsBtn = panel.querySelector('#chk-details-btn');
        const chkRowHighlight = panel.querySelector('#chk-row-highlight');
        const chkFloatWin = panel.querySelector('#chk-float-win');
        const chkQuickSwitch = panel.querySelector('#chk-quick-switch');
        const chipsWrapper = panel.querySelector('#bdo-chips-wrapper');
        const chipsInput = panel.querySelector('#bdo-chips-input');
        const addChipBtn = panel.querySelector('#bdo-add-chip-btn');
        const divHighlightFilters = panel.querySelector('#div-highlight-filters');
        const btnClearCache = panel.querySelector('#btn-clear-cache');

        chkTableExt.addEventListener('change', (e) => {
            settings.enableTableExtender = e.target.checked;
            chkDetailsBtn.parentElement.style.opacity = e.target.checked ? '1' : '0.5';
            chkDetailsBtn.parentElement.style.pointerEvents = e.target.checked ? 'auto' : 'none';
            saveSettingsOnly();
            resetTableExtender();
            if (settings.enableTableExtender) processTable();
        });

        chkDetailsBtn.addEventListener('change', (e) => {
            settings.enableDetailsButton = e.target.checked;
            saveSettingsOnly();
            resetTableExtender();
            processTable();
        });

        chkRowHighlight.addEventListener('change', (e) => {
            settings.enableRowHighlight = e.target.checked;
            divHighlightFilters.style.display = e.target.checked ? 'block' : 'none';
            saveSettingsOnly();
            if (!settings.enableRowHighlight) {
                document.querySelectorAll('.bdo-highlighted-row').forEach(r => r.classList.remove('bdo-highlighted-row'));
            } else {
                applyRowHighlights();
            }
        });

        chkQuickSwitch.addEventListener('change', (e) => {
            settings.enableQuickSwitch = e.target.checked;
            saveSettingsOnly();
            if (!e.target.checked) {
                // Natychmiastowe czyszczenie listy bez potrzeby przeładowania
                document.querySelectorAll('.bdo-injected-item').forEach(el => el.remove());
                document.querySelectorAll('[data-bdo-loaded]').forEach(el => { delete el.dataset.bdoLoaded; });
                document.querySelectorAll('iframe').forEach(ifr => {
                    if (ifr.src && (ifr.src.includes('/User/Choose'))) ifr.remove();
                });
            }
        });

        function renderChips() {
            try {
                if (!chipsWrapper || !chipsInput) return;
                chipsWrapper.querySelectorAll('.bdo-chip').forEach(el => el.remove());
                parsedFilters.forEach(filter => {
                    const chip = document.createElement('div');
                    chip.className = 'bdo-chip';
                    const spanText = document.createElement('span');
                    spanText.textContent = filter;
                    const spanRemove = document.createElement('span');
                    spanRemove.className = 'bdo-chip-remove';
                    spanRemove.textContent = '×';
                    spanRemove.dataset.filter = filter;
                    chip.appendChild(spanText);
                    chip.appendChild(spanRemove);
                    chipsWrapper.insertBefore(chip, chipsInput);
                });
            } catch (e) {
                console.error("Błąd w renderChips", e);
            }
        }

        if (chipsWrapper && chipsInput) {
            renderChips();
            chipsWrapper.addEventListener('click', (e) => {
                if (e.target.classList.contains('bdo-chip-remove')) {
                    const toRemove = e.target.getAttribute('data-filter');
                    settings.highlightFilters = parsedFilters.filter(f => f !== toRemove).join(',');
                    updateParsedFilters();
                    saveSettingsOnly();
                    renderChips();
                    applyRowHighlights();
                } else {
                    chipsInput.focus();
                }
            });

            function addChip() {
                try {
                    const val = chipsInput.value.trim().replace(/,/g, '');
                    if (val && !parsedFilters.includes(val.toLowerCase())) {
                        const current = settings.highlightFilters ? settings.highlightFilters.split(',').filter(f => f.trim().length > 0) : [];
                        current.push(val);
                        settings.highlightFilters = current.join(',');
                        updateParsedFilters();
                        saveSettingsOnly();
                        chipsInput.value = '';
                        renderChips();
                        applyRowHighlights();
                    } else if (val) {
                        chipsInput.value = '';
                    }
                } catch (e) {
                    console.error("Błąd w addChip", e);
                    alert("Wystąpił błąd skryptu BDO: " + e.message);
                }
            }

            if (addChipBtn) {
                addChipBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    addChip();
                });
            }

            chipsInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13 || e.key === ',') {
                    e.preventDefault();
                    e.stopPropagation();
                    addChip();
                }
            });

            chipsInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.keyCode === 13) {
                    e.preventDefault();
                    e.stopPropagation();
                } else if ((e.key === 'Backspace' || e.keyCode === 8) && chipsInput.value === '') {
                    if (parsedFilters.length > 0) {
                        const current = settings.highlightFilters.split(',').filter(f => f.trim().length > 0);
                        current.pop();
                        settings.highlightFilters = current.join(',');
                        updateParsedFilters();
                        saveSettingsOnly();
                        renderChips();
                        applyRowHighlights();
                    }
                }
            });
        }

        chkFloatWin.addEventListener('change', (e) => {
            settings.enableFloatingWindow = e.target.checked;
            saveSettingsOnly();
            if (!settings.enableFloatingWindow) {
                const win = document.getElementById('bdo-float-window');
                if (win) win.remove();
            }
        });

        btnClearCache.addEventListener('click', () => {
            SessionCache.clear();
            alert("Pamięć podręczna BDO Master została wyczyszczona. Odśwież stronę, aby pobrać najnowsze dane z BDO.");
        });
    }

    document.addEventListener('click', (e) => {
        const panel = document.getElementById('bdo-settings-panel');
        if (panel && panel.classList.contains('bdo-show-panel') && !panel.contains(e.target) && !e.target.closest('#bdo-settings-btn') && !e.target.closest('#bdo-settings-btn-fallback')) {
            panel.classList.remove('bdo-show-panel');
            setTimeout(() => panel.style.display = 'none', 300);
        }
    });

    let currentAbortController = null;

    const FetchQueue = {
        queue: [],
        active: 0,
        limit: 4,
        add(url, signal) {
            return new Promise((resolve, reject) => {
                this.queue.push({ url, resolve, reject, signal });
                this.next();
            });
        },
        next() {
            if (this.active >= this.limit || this.queue.length === 0) return;
            this.active++;
            const { url, resolve, reject, signal } = this.queue.shift();

            fetch(url, { signal })
                .then(response => {
                    if (response.status === 401 || response.status === 403) throw new Error('AUTH');
                    if (!response.ok) throw new Error(`HTTP_${response.status}`);
                    return response.text();
                })
                .then(html => resolve(html))
                .catch(e => reject(e))
                .finally(() => {
                    this.active--;
                    this.next();
                });
        },
        clear() {
            this.queue = [];
            this.active = 0;
        }
    };

    async function fetchCardDetails(url) {
        const cached = SessionCache.get(url);
        if (cached) return cached;

        try {
            if (!currentAbortController) currentAbortController = new AbortController();
            const html = await FetchQueue.add(url, currentAbortController.signal);
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const carrierEl = doc.getElementById('CarrierName');
            const carrier = carrierEl ? (carrierEl.value || carrierEl.getAttribute('value') || "---") : "---";
            const infoEl = doc.getElementById('AdditionalInfo');
            const info = infoEl ? (infoEl.textContent || infoEl.value || "---") : "---";
            const data = { carrier: carrier.trim(), info: info.trim() };

            SessionCache.set(url, data);
            return data;
        } catch (e) {
            if (e.name === 'AbortError') return null;
            return { carrier: "Błąd", info: "Błąd" };
        }
    }

    function applyRowHighlights() {
        if (!settings.enableRowHighlight) return;
        const table = document.querySelector('table.table');
        if (!table) return;

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
            if (row.cells.length < 3) return;
            row.classList.remove('bdo-highlighted-row');

            if (parsedFilters.length > 0) {
                const cellsText = Array.from(row.cells).filter(c => !c.querySelector('.btn-group')).map(c => c.innerText).join(' ').toLowerCase();
                for (let filter of parsedFilters) {
                    if (cellsText.includes(filter)) {
                        row.classList.add('bdo-highlighted-row');
                        break;
                    }
                }
            }
        });
    }

    function resetTableExtender() {
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        FetchQueue.clear();
        document.querySelectorAll('.bdo-extra-col, .bdo-cell-added').forEach(el => el.remove());
        document.querySelectorAll('.bdo-hidden-btn-group').forEach(el => el.classList.remove('bdo-hidden-btn-group'));
        document.querySelectorAll('.bdo-direct-btn').forEach(el => el.remove());
        document.querySelectorAll('tr[data-bdo-processed="true"]').forEach(el => el.removeAttribute('data-bdo-processed'));
    }



    const ALLOWED_TABLE_PATHS = [
        '/wasteregister/wastetransferforwardedcard',
        '/wasteregister/wastetransfertransportcard',
        '/wasteregister/wastetransferacquiredcard',
        '/wasteregister/municipalwastetransferforwardedreceivecard',
        '/wasteregister/municipalwastetransferforwardedtransfercard',
        '/wasteregister/municipalwastetransfertransportreceivecard',
        '/wasteregister/municipalwastetransfertransporttransfercard',
        '/wasteregister/municipalwastetransferacquiredreceivecard',
        '/wasteregister/municipalwastetransferacquiredtransfercard'
    ];

    function isAllowedPath() {
        const path = window.location.pathname.toLowerCase();
        return ALLOWED_TABLE_PATHS.some(p => path.includes(p));
    }

    function processTable() {
        if (!isAllowedPath()) return;
        if (!settings.enableTableExtender) return;

        const table = document.querySelector('table.table');
        if (!table) return;

        const headersRow = table.querySelector('thead tr');
        if (!headersRow) return;

        let insertPos = -1;
        let regIndex = -1;
        const ths = Array.from(headersRow.querySelectorAll('th'));
        ths.forEach((th, index) => {
            const txt = th.innerText.toLowerCase();
            if (txt.includes('rejestracyjny') || txt.includes('rejestracja')) regIndex = index;
        });

        insertPos = regIndex !== -1 ? regIndex + 1 : headersRow.cells.length;

        if (!headersRow.querySelector('.bdo-col-carrier')) {
            const thCarrier = document.createElement('th');
            thCarrier.className = 'bdo-extra-col bdo-col-carrier';
            thCarrier.innerText = 'Transportujący';

            const thInfo = document.createElement('th');
            thInfo.className = 'bdo-extra-col bdo-col-info';
            thInfo.innerText = 'Dodatkowe info';

            if (insertPos < headersRow.cells.length) {
                headersRow.insertBefore(thCarrier, headersRow.children[insertPos]);
            } else {
                headersRow.appendChild(thCarrier);
            }
            headersRow.appendChild(thInfo);
        }

        const rows = table.querySelectorAll('tbody tr:not([data-bdo-processed="true"])');
        rows.forEach(row => {
            if (row.cells.length < 3) return;
            row.dataset.bdoProcessed = "true";

            const cellInsertPos = Math.min(insertPos, row.cells.length);

            const cellCarrier = row.insertCell(cellInsertPos);
            cellCarrier.className = 'bdo-cell-added bdo-cell-carrier text-muted';
            cellCarrier.innerHTML = '<span class="bdo-loading-spinner"><i class="fa fa-spinner fa-spin"></i> Ładowanie...</span>';

            const cellInfo = row.insertCell(row.cells.length);
            cellInfo.className = 'bdo-cell-added bdo-cell-info text-muted';
            cellInfo.innerHTML = '<span class="bdo-loading-spinner"><i class="fa fa-spinner fa-spin"></i> Ładowanie...</span>';

            let linkToFetch = null;
            const btnGroup = row.querySelector('.btn-group');

            if (btnGroup) {
                const dropdownLink = btnGroup.querySelector('.dropdown-menu a');
                if (dropdownLink && dropdownLink.href) {
                    linkToFetch = dropdownLink.href;

                    const directBtn = document.createElement('a');
                    directBtn.href = linkToFetch;
                    directBtn.className = 'btn btn-default btn-sm bdo-direct-btn';
                    directBtn.innerHTML = '<i class="fa fa-search text-info"></i> Szczegóły';
                    directBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        GM_openInTab(linkToFetch, { active: false, insert: true });
                    });

                    btnGroup.parentNode.insertBefore(directBtn, btnGroup.nextSibling);

                    if (settings.enableDetailsButton) {
                        btnGroup.classList.add('bdo-hidden-btn-group');
                    } else {
                        directBtn.style.display = 'none';
                    }
                }
            }

            if (!linkToFetch) {
                let linkEl = row.querySelector('a[href*="/Details"], a[href*="/Edit"]');
                if (linkEl) linkToFetch = linkEl.href;
            }

            if (linkToFetch) {
                fetchCardDetails(linkToFetch).then(details => {
                    if (!details) return;

                    cellCarrier.innerText = details.carrier;
                    cellInfo.innerText = details.info;

                    bindCustomTooltip(cellCarrier, details.carrier);
                    bindCustomTooltip(cellInfo, details.info);

                    cellCarrier.classList.remove('text-muted');
                    cellInfo.classList.remove('text-muted');

                    if (details.carrier === "---") cellCarrier.style.color = "#94a3b8";
                    if (details.info === "---") cellInfo.style.color = "#94a3b8";
                });
            }
        });
    }

    function extractData() {
        const getVal = (id) => {
            const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
            if (!el) return "";
            const val = el.value || el.innerText || "";
            return val.trim() !== "" ? val.trim() : "";
        };

        const wasteNameRaw = getVal('WasteName');
        const wasteCodeRaw = wasteNameRaw !== "" ? wasteNameRaw.split('-')[0].trim() : "";
        const wasteCode = /^\d{2}/.test(wasteCodeRaw) ? wasteCodeRaw : wasteNameRaw;

        return {
            nrKPO: getVal('CardNumber'),
            kodOdpadu: wasteCode,
            transportujacy: getVal('CarrierName'),
            masa: getVal('WasteMass'),
            masaOdbiorcy: getVal('CorrectedWasteMass'),
            rejestracja: getVal('VehicleRegNumber'),
            awizacja: getVal('AdditionalInfo'),
            uwagi: getVal('Remarks')
        };
    }

    function flashSuccess(element) {
        if (element) {
            element.classList.add('bdo-copied-success');
            setTimeout(() => element.classList.remove('bdo-copied-success'), 500);
        }
    }

    function setupCopyAction(element, textToCopy) {
        if (!element || textToCopy === "") return;
        element.onclick = function () {
            navigator.clipboard.writeText(textToCopy)
                .then(() => flashSuccess(element))
                .catch(err => console.error('Błąd kopiowania:', err));
        };
    }

    function makeDraggable(element) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const header = document.getElementById('bdo-float-header');
        if (header) header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e = e || window.event;
            if (e.target.closest('button')) return;
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }
        function elementDrag(e) {
            e = e || window.event;
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;

            let newTop = element.offsetTop - pos2;
            let newLeft = element.offsetLeft - pos1;

            if (newTop < 0) newTop = 0;
            if (newLeft < 0) newLeft = 0;
            if (newTop + element.offsetHeight > window.innerHeight) newTop = window.innerHeight - element.offsetHeight;
            if (newLeft + element.offsetWidth > window.innerWidth) newLeft = window.innerWidth - element.offsetWidth;

            element.style.top = newTop + "px";
            element.style.left = newLeft + "px";
        }
        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            localStorage.setItem(WINDOW_POS_KEY, JSON.stringify({ top: element.style.top, left: element.style.left }));
        }
    }

    function updateFloatingWindowData(data) {
        const setField = (id, value) => {
            const box = document.getElementById(id);
            if (box) {
                box.textContent = value !== "" ? value : "---";
                setupCopyAction(box, value);
            }
        };

        setField('bdo-kpo-box', data.nrKPO);
        setField('bdo-mass-declared-box', data.masa);
        setField('bdo-mass-box', data.masaOdbiorcy);

        document.getElementById('bdo-transport-box')?.textContent !== undefined &&
            (document.getElementById('bdo-transport-box').textContent = data.transportujacy !== "" ? data.transportujacy : "---");
        document.getElementById('bdo-rej-box')?.textContent !== undefined &&
            (document.getElementById('bdo-rej-box').textContent = data.rejestracja !== "" ? data.rejestracja : "---");
        document.getElementById('bdo-info-box')?.textContent !== undefined &&
            (document.getElementById('bdo-info-box').textContent = data.awizacja !== "" ? data.awizacja : "---");
        document.getElementById('bdo-kod-box')?.textContent !== undefined &&
            (document.getElementById('bdo-kod-box').textContent = data.kodOdpadu !== "" ? data.kodOdpadu : "---");
        document.getElementById('bdo-uwagi-box')?.textContent !== undefined &&
            (document.getElementById('bdo-uwagi-box').textContent = data.uwagi !== "" ? data.uwagi : "---");
    }

    function createFloatingWindow() {
        if (!settings.enableFloatingWindow) return;

        const data = extractData();
        const win = document.getElementById('bdo-float-window');

        if (win) {
            updateFloatingWindowData(data);
            return;
        }

        const isMinimized = localStorage.getItem(WINDOW_MINIMIZED_KEY) === 'true';
        const contentDisplay = isMinimized ? 'none' : 'block';
        const minBtnText = isMinimized ? '▼' : '▲';

        const windowDiv = document.createElement('div');
        windowDiv.id = 'bdo-float-window';

        const savedPosStr = localStorage.getItem(WINDOW_POS_KEY);
        if (savedPosStr) {
            try {
                const savedPos = JSON.parse(savedPosStr);
                let t = parseInt(savedPos.top);
                let l = parseInt(savedPos.left);
                if (t > window.innerHeight - 50) t = window.innerHeight - 100;
                if (l > window.innerWidth - 50) l = window.innerWidth - 100;
                if (t < 0) t = 0;
                if (l < 0) l = 0;
                windowDiv.style.top = t + 'px';
                windowDiv.style.left = l + 'px';
            } catch (e) { }
        } else {
            windowDiv.style.top = '130px';
            windowDiv.style.right = '40px';
        }

        windowDiv.innerHTML = `
            <div id="bdo-float-header">
                <span>Dane KPO</span>
                <div id="bdo-controls">
                    <button id="bdo-minimize" class="bdo-ctrl-btn" title="Zwiń/Rozwiń">${minBtnText}</button>
                </div>
            </div>
            <div id="bdo-float-content" style="display: ${contentDisplay};">
                <div class="bdo-row"><span class="bdo-label">Numer KPO (kliknij)</span><div id="bdo-kpo-box" class="bdo-val-box bdo-interactive" title="Skopiuj numer KPO"></div></div>
                <div class="bdo-row"><span class="bdo-label">Transportujący</span><div id="bdo-transport-box" class="bdo-val-box"></div></div>
                <div class="bdo-row"><span class="bdo-label">Masa deklarowana (kliknij)</span><div id="bdo-mass-declared-box" class="bdo-val-box bdo-interactive" title="Skopiuj masę deklarowaną"></div></div>
                <div class="bdo-row"><span class="bdo-label">Masa Odbiorcy (kliknij)</span><div id="bdo-mass-box" class="bdo-val-box bdo-interactive bdo-highlight-blue" title="Skopiuj masę odbiorcy"></div></div>
                <div class="bdo-row"><span class="bdo-label">Rejestracja</span><div id="bdo-rej-box" class="bdo-val-box"></div></div>
                <div class="bdo-row"><span class="bdo-label">Kod Odpadu</span><div id="bdo-kod-box" class="bdo-val-box"></div></div>
                <div class="bdo-row"><span class="bdo-label">Info / Awizacja</span><div id="bdo-info-box" class="bdo-val-box" style="white-space: pre-wrap;"></div></div>
                <div class="bdo-row"><span class="bdo-label">Uwagi (Remarks)</span><div id="bdo-uwagi-box" class="bdo-val-box" style="white-space: pre-wrap;"></div></div>
            </div>
        `;

        document.body.appendChild(windowDiv);

        updateFloatingWindowData(data);

        const minBtn = document.getElementById('bdo-minimize');
        const contentDiv = document.getElementById('bdo-float-content');

        if (isMinimized) {
            contentDiv.classList.add('bdo-minimized');
        }

        minBtn.onclick = (e) => {
            e.stopPropagation();
            if (contentDiv.classList.contains('bdo-minimized')) {
                contentDiv.classList.remove('bdo-minimized');
                minBtn.innerText = '▲';
                localStorage.setItem(WINDOW_MINIMIZED_KEY, 'false');
            } else {
                contentDiv.classList.add('bdo-minimized');
                minBtn.innerText = '▼';
                localStorage.setItem(WINDOW_MINIMIZED_KEY, 'true');
            }
        };

        makeDraggable(windowDiv);
    }

    function fetchAndBuildDropdown(url, dropdown, nameCellIndex) {
        if (dropdown.bdoIframe) {
            dropdown.bdoIframe.remove();
            delete dropdown.bdoIframe;
        }

        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = url;
        dropdown.bdoIframe = iframe;
        document.body.appendChild(iframe);

        let iframeReady = false;
        let checkInterval = null;

        iframe.addEventListener('load', () => {
            checkInterval = setInterval(() => {
                try {
                    const doc = iframe.contentDocument;
                    if (!doc || !doc.body) return;

                    let table = doc.querySelector('table');

                    const processingEl = doc.querySelector('.dataTables_processing');
                    const iframeWin = iframe.contentWindow;
                    const isProcessing = processingEl && iframeWin && (
                        processingEl.style.display === 'block' ||
                        processingEl.style.visibility === 'visible' ||
                        iframeWin.getComputedStyle(processingEl).display !== 'none'
                    );
                    if (isProcessing) return;

                    const emptyEl = doc.querySelector('.dataTables_empty');
                    let rows = doc.querySelectorAll('table tbody tr');

                    if (rows.length === 0) {
                        // Jeśli zmienili widok na listy
                        rows = doc.querySelectorAll('.list-group-item, .card');
                    }

                    if (rows.length === 0 && !emptyEl) return; // Jeśli nie ma wierszy i nie ma komunikatu o braku, czekaj dalej

                    clearInterval(checkInterval);
                    iframeReady = true;

                    let validRows = [];
                    if (rows.length === 1 && emptyEl) {
                        validRows = [];
                    } else {
                        validRows = Array.from(rows).filter(r =>
                            !r.querySelector('.dataTables_empty') && (r.cells ? r.cells.length > 0 : true)
                        );
                    }
                    dropdown.querySelectorAll('.bdo-loading-switch').forEach(el => el.remove());

                    if (validRows.length === 0) {
                        const li = document.createElement('li');
                        li.className = 'bdo-injected-item';
                        const aEmpty = document.createElement('a');
                        aEmpty.href = '#';
                        aEmpty.textContent = 'Brak element\u00f3w';
                        li.appendChild(aEmpty);
                        dropdown.appendChild(li);
                        iframe.remove();
                        delete dropdown.bdoIframe;
                        return;
                    }

                    const divider = document.createElement('li');
                    divider.className = 'divider bdo-injected-item';
                    dropdown.appendChild(divider);

                    const header = document.createElement('li');
                    header.className = 'dropdown-header bdo-injected-item';
                    header.textContent = 'Szybkie prze\u0142\u0105czanie:';
                    header.style.color = '#0f4c75';
                    header.style.fontWeight = 'bold';
                    header.style.textTransform = 'uppercase';
                    dropdown.appendChild(header);

                    const currentName = dropdown.closest('.nav-mid-section')
                        ?.querySelector('.nav-mid-name')?.textContent?.trim() || '';

                    validRows.forEach(row => {
                        let name = "";
                        if (row.cells && row.cells.length > nameCellIndex) {
                            name = row.cells[nameCellIndex].innerText.trim();
                        } else {
                            // Jeśli nie jest to tabela, próbujemy wyciągnąć mocny tekst
                            const strongEl = row.querySelector('strong, h4, .text-bold');
                            name = strongEl ? strongEl.innerText.trim() : row.innerText.trim();
                        }

                        const btn = row.querySelector('button.btn-primary, a.btn-primary, button[type="submit"], a.btn, .btn-info, .btn-success, input[type="submit"]');
                        if (!btn) return;

                        const isActive = currentName && (
                            name === currentName ||
                            name.includes(currentName) ||
                            currentName.includes(name)
                        );

                        const li = document.createElement('li');
                        li.className = 'bdo-injected-item';

                        const a = document.createElement('a');
                        a.href = '#';
                        a.style.padding = '8px 20px';
                        a.style.borderBottom = '1px solid #f5f5f5';
                        a.style.maxWidth = '400px';
                        a.style.display = 'block';
                        if (isActive) a.classList.add('bdo-switch-item-active');

                        const nameSpan = document.createElement('span');
                        nameSpan.className = 'bdo-switch-name';
                        nameSpan.textContent = name;
                        nameSpan.style.fontWeight = 'bold';
                        nameSpan.style.whiteSpace = 'normal';
                        nameSpan.style.display = 'block';
                        nameSpan.style.lineHeight = '1.2';
                        nameSpan.style.color = isActive ? '#0f4c75' : '#333';
                        a.appendChild(nameSpan);

                        a.onclick = ((capturedBtn, liveIframe) => (e) => {
                            e.preventDefault();
                            a.textContent = '';
                            const spinI = document.createElement('i');
                            spinI.className = 'fa fa-spinner fa-spin';
                            a.appendChild(spinI);
                            a.appendChild(document.createTextNode(' Prze\u0142\u0105czanie...'));
                            try {
                                liveIframe.contentWindow.addEventListener('unload', () => {
                                    setTimeout(() => window.location.reload(), 800);
                                });
                            } catch (err) { }
                            capturedBtn.click();
                            setTimeout(() => {
                                if (document.body.contains(liveIframe)) liveIframe.remove();
                                delete dropdown.bdoIframe;
                            }, 500);
                            setTimeout(() => { window.location.reload(); }, 3000);
                        })(btn, iframe);

                        li.appendChild(a);
                        dropdown.appendChild(li);
                    });
                    // Iframe pozostaje w DOM do momentu klikniecia
                } catch (e) { }
            }, 400);

            setTimeout(() => {
                if (checkInterval) clearInterval(checkInterval);
                if (!iframeReady) {
                    if (dropdown.bdoIframe) {
                        dropdown.bdoIframe.remove();
                        delete dropdown.bdoIframe;
                    }
                    delete dropdown.dataset.bdoLoaded;
                    dropdown.querySelectorAll('.bdo-injected-item, .bdo-loading-switch').forEach(el => el.remove());
                    const li = document.createElement('li');
                    li.className = 'bdo-injected-item text-danger';
                    const aErr = document.createElement('a');
                    aErr.href = '#';
                    aErr.textContent = 'B\u0142\u0105d \u0142adowania \u2013 spr\u00f3buj ponownie';
                    li.appendChild(aErr);
                    dropdown.appendChild(li);
                }
            }, 15000);
        });
    }


    function setupQuickSwitch() {
        const companySection = document.querySelector('.nav-mid-section-company');
        const eupSection = document.querySelector('.nav-mid-section-eup');

        if (companySection && !companySection.dataset.bdoBound) {
            companySection.dataset.bdoBound = "true";
            const btnGroup = companySection.querySelector('.btn-group');

            if (btnGroup) {
                companySection.addEventListener('mouseenter', () => {
                    if (!settings.enableQuickSwitch) return;
                    btnGroup.classList.add('open');
                    const dropdown = companySection.querySelector('#company-info');
                    if (dropdown && !dropdown.dataset.bdoLoaded) {
                        dropdown.dataset.bdoLoaded = "true";
                        const li = document.createElement('li');
                        li.className = 'bdo-loading-switch bdo-injected-item';
                        li.innerHTML = '<a href="#"><i class="fa fa-spinner fa-spin"></i> Ładowanie podmiotów...</a>';
                        dropdown.appendChild(li);

                        fetchAndBuildDropdown('/User/ChooseCompany', dropdown, 2);
                    }
                });
                companySection.addEventListener('mouseleave', () => {
                    btnGroup.classList.remove('open');
                });
            }
        }

        if (eupSection && !eupSection.dataset.bdoBound) {
            eupSection.dataset.bdoBound = "true";
            const btnGroup = eupSection.querySelector('.btn-group');

            if (btnGroup) {
                eupSection.addEventListener('mouseenter', () => {
                    if (!settings.enableQuickSwitch) return;
                    btnGroup.classList.add('open');
                    const dropdown = eupSection.querySelector('#eup-info');
                    if (dropdown && !dropdown.dataset.bdoLoaded) {
                        dropdown.dataset.bdoLoaded = "true";
                        const li = document.createElement('li');
                        li.className = 'bdo-loading-switch bdo-injected-item';
                        li.innerHTML = '<a href="#"><i class="fa fa-spinner fa-spin"></i> Ładowanie MPD...</a>';
                        dropdown.appendChild(li);

                        fetchAndBuildDropdown('/User/ChooseEup/Active', dropdown, 2);
                    }
                });
                eupSection.addEventListener('mouseleave', () => {
                    btnGroup.classList.remove('open');
                });
            }
        }
    }

    function initMenuState() {
        const MENU_STATE_KEY = 'bdo_menu_hidden';

        function bindMenuButton() {
            const menuBtn = document.querySelector('.hide-menu');
            if (!menuBtn || menuBtn.dataset.bdoMenuBound) return;
            menuBtn.dataset.bdoMenuBound = 'true';

            const isHidden = localStorage.getItem(MENU_STATE_KEY) === 'true';
            if (isHidden && !document.body.classList.contains('hide-sidebar')) {
                menuBtn.click();
            }

            menuBtn.addEventListener('click', () => {
                setTimeout(() => {
                    localStorage.setItem(MENU_STATE_KEY, document.body.classList.contains('hide-sidebar'));
                }, 50);
            });
        }

        bindMenuButton();

        if (!document.querySelector('.hide-menu')) {
            const menuObserver = new MutationObserver(() => {
                if (document.querySelector('.hide-menu')) {
                    menuObserver.disconnect();
                    bindMenuButton();
                }
            });
            menuObserver.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => menuObserver.disconnect(), 15000);
        }
    }

    let bdoTableTimeout;

    function mainObserverCallback() {
        createSettingsUI();
        setupQuickSwitch();

        if (window.location.pathname.toLowerCase().startsWith('/wasteregister/')) {
            clearTimeout(bdoTableTimeout);
            bdoTableTimeout = setTimeout(() => {
                if (settings.enableRowHighlight) applyRowHighlights();
                if (settings.enableTableExtender) processTable();
            }, 150);
        }

        if (settings.enableFloatingWindow) {
            const inputTest = document.getElementById('CardNumber');
            if (inputTest && inputTest.value && inputTest.value.length > 5) {
                if (inputTest.hasAttribute('readonly') || inputTest.disabled) {
                    createFloatingWindow();
                }
            } else {
                const win = document.getElementById('bdo-float-window');
                if (win) win.remove();
            }
        }
    }

    let mainObserverTimeout;
    const debouncedObserverCallback = () => {
        clearTimeout(mainObserverTimeout);
        mainObserverTimeout = setTimeout(mainObserverCallback, 100);
    };

    const observer = new MutationObserver(debouncedObserverCallback);

    // Uruchomienie nasłuchiwaczy dla statycznych elementów np. Menu
    initMenuState();

    function startObserver() {
        const targetNode = document.querySelector('.main-content') || document.querySelector('#page-wrapper') || document.body;
        observer.observe(targetNode, { childList: true, subtree: true });
        mainObserverCallback();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver);
    } else {
        startObserver();
    }

})();
