const MODULE_ID = 'preset_batch_manager';
const API_ID = 'openai';
const ROOT_ID = 'preset_batch_manager_settings';
const BUNDLE_FORMAT = 'sillytavern-chat-completion-preset-bundle';

let selectedNames = new Set();
let presetRows = [];
let busy = false;

function getContext() {
    const context = globalThis.SillyTavern?.getContext?.();
    if (!context) {
        throw new Error('SillyTavern context is not ready');
    }
    return context;
}

function getManager() {
    const manager = getContext().getPresetManager?.(API_ID);
    if (!manager) {
        throw new Error('Chat Completion preset manager is not ready');
    }
    return manager;
}

function toast(type, message) {
    const handler = globalThis.toastr?.[type];
    if (typeof handler === 'function') {
        handler(message);
    } else {
        console[type === 'error' ? 'error' : 'log'](`[${MODULE_ID}] ${message}`);
    }
}

function setStatus(message, tone = '') {
    const status = document.querySelector(`#${ROOT_ID} .pbm-status`);
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
}

function setBusy(nextBusy) {
    busy = nextBusy;
    document.querySelectorAll(`#${ROOT_ID} button, #${ROOT_ID} input`).forEach(element => {
        element.disabled = nextBusy;
    });
    document.querySelector(`#${ROOT_ID}`)?.classList.toggle('pbm-is-busy', nextBusy);
}

function readPresetRows() {
    const select = document.querySelector('#settings_preset_openai');
    if (!select) {
        throw new Error('Chat Completion preset selector was not found');
    }

    return [...select.options]
        .filter(option => !option.disabled && option.textContent.trim())
        .map(option => ({
            name: option.textContent.trim(),
            value: option.value,
            current: option.selected,
        }));
}

function getVisibleRows() {
    const query = document.querySelector(`#${ROOT_ID} .pbm-search`)?.value.trim().toLocaleLowerCase() ?? '';
    if (!query) return presetRows;
    return presetRows.filter(row => row.name.toLocaleLowerCase().includes(query));
}

function updateSummary() {
    const summary = document.querySelector(`#${ROOT_ID} .pbm-summary`);
    if (!summary) return;
    const visible = getVisibleRows().length;
    summary.textContent = `전체 ${presetRows.length}개 · 표시 ${visible}개 · 선택 ${selectedNames.size}개`;
}

function createPresetRow(row) {
    const label = document.createElement('label');
    label.className = 'pbm-preset-row';
    label.title = row.name;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'pbm-preset-checkbox';
    checkbox.checked = selectedNames.has(row.name);
    checkbox.dataset.name = row.name;

    const name = document.createElement('span');
    name.className = 'pbm-preset-name';
    name.textContent = row.name;

    label.append(checkbox, name);

    if (row.current) {
        const badge = document.createElement('span');
        badge.className = 'pbm-current-badge';
        badge.textContent = '사용 중';
        label.append(badge);
    }

    return label;
}

function renderPresetList() {
    const list = document.querySelector(`#${ROOT_ID} .pbm-list`);
    if (!list) return;

    list.replaceChildren();
    const visibleRows = getVisibleRows();

    if (!visibleRows.length) {
        const empty = document.createElement('div');
        empty.className = 'pbm-empty';
        empty.textContent = presetRows.length ? '검색 결과가 없어.' : 'Chat Completion 프리셋이 없어.';
        list.append(empty);
    } else {
        const fragment = document.createDocumentFragment();
        visibleRows.forEach(row => fragment.append(createPresetRow(row)));
        list.append(fragment);
    }

    updateSummary();
}

function refreshPresets({ preserveSelection = true } = {}) {
    try {
        presetRows = readPresetRows();
        const existingNames = new Set(presetRows.map(row => row.name));
        selectedNames = preserveSelection
            ? new Set([...selectedNames].filter(name => existingNames.has(name)))
            : new Set();
        renderPresetList();
        setStatus('목록을 불러왔어.');
    } catch (error) {
        console.error(`[${MODULE_ID}] Failed to read presets`, error);
        presetRows = [];
        selectedNames.clear();
        renderPresetList();
        setStatus('프리셋 목록을 불러오지 못했어. API를 Chat Completion으로 설정했는지 확인해줘.', 'error');
    }
}

function selectVisible() {
    getVisibleRows().forEach(row => selectedNames.add(row.name));
    renderPresetList();
}

function clearSelection() {
    selectedNames.clear();
    renderPresetList();
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
}

async function confirmAction(title, html, fallbackText) {
    const context = getContext();
    if (context.Popup?.show?.confirm && context.POPUP_RESULT) {
        const result = await context.Popup.show.confirm(title, html);
        return result === context.POPUP_RESULT.AFFIRMATIVE;
    }
    return globalThis.confirm(fallbackText);
}

function getSelectedExistingNames() {
    const existing = new Set(presetRows.map(row => row.name));
    return [...selectedNames].filter(name => existing.has(name));
}

function buildBackupBundle(names) {
    const manager = getManager();
    const presets = names.map(name => ({
        name,
        preset: structuredClone(manager.getCompletionPresetByName(name)),
    })).filter(item => item.preset && typeof item.preset === 'object');

    return {
        format: BUNDLE_FORMAT,
        version: 1,
        apiId: API_ID,
        exportedAt: new Date().toISOString(),
        presets,
    };
}

function buildBackupFiles(names) {
    const manager = getManager();
    const usedFilenames = new Set();

    return names.map(name => {
        const preset = structuredClone(manager.getCompletionPresetByName(name));
        if (!preset || typeof preset !== 'object') return null;

        const base = safeFilenamePart(name);
        let filename = `${base}.json`;
        let duplicateNumber = 2;
        while (usedFilenames.has(filename.toLocaleLowerCase())) {
            filename = `${base} (${duplicateNumber++}).json`;
        }
        usedFilenames.add(filename.toLocaleLowerCase());

        return {
            name,
            filename,
            text: JSON.stringify(preset, null, 4),
        };
    }).filter(Boolean);
}

function safeFilenamePart(value) {
    return String(value).replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 50) || 'presets';
}

function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function concatBytes(parts) {
    const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}

function makeZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;

    for (const file of files) {
        const nameBytes = encoder.encode(file.filename);
        const dataBytes = encoder.encode(file.text);
        const checksum = crc32(dataBytes);

        const localHeader = new Uint8Array(30 + nameBytes.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034B50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0x0800, true);
        localView.setUint16(8, 0, true);
        localView.setUint32(14, checksum, true);
        localView.setUint32(18, dataBytes.length, true);
        localView.setUint32(22, dataBytes.length, true);
        localView.setUint16(26, nameBytes.length, true);
        localHeader.set(nameBytes, 30);
        localParts.push(localHeader, dataBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014B50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint32(16, checksum, true);
        centralView.setUint32(20, dataBytes.length, true);
        centralView.setUint32(24, dataBytes.length, true);
        centralView.setUint16(28, nameBytes.length, true);
        centralView.setUint32(42, localOffset, true);
        centralHeader.set(nameBytes, 46);
        centralParts.push(centralHeader);

        localOffset += localHeader.length + dataBytes.length;
    }

    const centralDirectory = concatBytes(centralParts);
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054B50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localOffset, true);

    return new Blob([...localParts, centralDirectory, endRecord], { type: 'application/zip' });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function backupSelected() {
    const names = getSelectedExistingNames();
    if (!names.length) {
        toast('warning', '백업할 프리셋을 먼저 선택해줘.');
        return false;
    }

    const files = buildBackupFiles(names);
    if (!files.length) {
        toast('error', '선택한 프리셋 데이터를 읽지 못했어.');
        return false;
    }

    const firstName = safeFilenamePart(names[0]);
    const suffix = names.length > 1 ? `_외_${names.length - 1}개` : '';
    downloadBlob(makeZip(files), `ChatCompletion_프리셋_백업_${firstName}${suffix}.zip`);
    toast('success', `${files.length}개 프리셋을 개별 JSON 파일로 백업했어.`);
    return true;
}

function readStoredZipFiles(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    let endOffset = -1;

    for (let offset = Math.max(0, bytes.length - 65557); offset <= bytes.length - 22; offset++) {
        if (view.getUint32(offset, true) === 0x06054B50) endOffset = offset;
    }
    if (endOffset < 0) throw new Error('올바른 ZIP 백업 파일이 아님');

    const entryCount = view.getUint16(endOffset + 10, true);
    let centralOffset = view.getUint32(endOffset + 16, true);
    const files = [];

    for (let index = 0; index < entryCount; index++) {
        if (view.getUint32(centralOffset, true) !== 0x02014B50) {
            throw new Error('ZIP 파일 목록을 읽지 못했어');
        }
        const method = view.getUint16(centralOffset + 10, true);
        const compressedSize = view.getUint32(centralOffset + 20, true);
        const nameLength = view.getUint16(centralOffset + 28, true);
        const extraLength = view.getUint16(centralOffset + 30, true);
        const commentLength = view.getUint16(centralOffset + 32, true);
        const localOffset = view.getUint32(centralOffset + 42, true);
        const filename = decoder.decode(bytes.slice(centralOffset + 46, centralOffset + 46 + nameLength));

        if (method !== 0) throw new Error('이 확장에서 만든 ZIP 백업만 복원할 수 있어');
        if (view.getUint32(localOffset, true) !== 0x04034B50) throw new Error('ZIP 내부 파일이 손상됐어');
        const localNameLength = view.getUint16(localOffset + 26, true);
        const localExtraLength = view.getUint16(localOffset + 28, true);
        const dataOffset = localOffset + 30 + localNameLength + localExtraLength;

        if (filename.toLocaleLowerCase().endsWith('.json')) {
            files.push({
                filename,
                text: decoder.decode(bytes.slice(dataOffset, dataOffset + compressedSize)),
            });
        }
        centralOffset += 46 + nameLength + extraLength + commentLength;
    }
    return files;
}

async function readBackupItems(file) {
    if (file.name.toLocaleLowerCase().endsWith('.zip')) {
        return readStoredZipFiles(await file.arrayBuffer()).map(entry => ({
            name: entry.filename.split('/').pop().replace(/\.json$/i, ''),
            preset: JSON.parse(entry.text),
        }));
    }

    const data = JSON.parse(await file.text());
    if (data?.format === BUNDLE_FORMAT && data?.version === 1 && Array.isArray(data?.presets)) {
        return data.presets;
    }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        return [{ name: file.name.replace(/\.json$/i, ''), preset: data }];
    }
    throw new Error('지원하지 않는 백업 파일 형식');
}

async function restoreBackup(file) {
    if (!file || busy) return;
    setBusy(true);
    setStatus('백업 파일을 확인하는 중…');

    try {
        const presets = await readBackupItems(file);
        const valid = Array.isArray(presets)
            && presets.every(item => typeof item?.name === 'string' && item?.preset && typeof item.preset === 'object');

        if (!valid) {
            throw new Error('지원하지 않는 백업 파일 형식');
        }
        if (!presets.length) {
            throw new Error('백업 파일에 프리셋이 없음');
        }

        const existingNames = new Set(readPresetRows().map(row => row.name));
        const overwriteCount = presets.filter(item => existingNames.has(item.name)).length;
        const detail = overwriteCount
            ? `<p>같은 이름의 프리셋 ${overwriteCount}개는 백업 내용으로 덮어써.</p>`
            : '<p>같은 이름의 프리셋은 없어.</p>';
        const confirmed = await confirmAction(
            `프리셋 ${presets.length}개 복원`,
            `<p>이 백업을 Chat Completion 프리셋으로 복원할까?</p>${detail}`,
            `프리셋 ${presets.length}개를 복원할까?`,
        );

        if (!confirmed) {
            setStatus('복원을 취소했어.');
            return;
        }

        const manager = getManager();
        for (let index = 0; index < presets.length; index++) {
            const item = presets[index];
            setStatus(`복원 중 ${index + 1}/${presets.length} · ${item.name}`);
            await manager.savePreset(item.name, item.preset, { skipUpdate: true });
        }

        toast('success', `${presets.length}개 프리셋을 복원했어. 목록을 다시 불러올게.`);
        setStatus('복원 완료. 화면을 새로고침하는 중…', 'success');
        setTimeout(() => globalThis.location.reload(), 500);
    } catch (error) {
        console.error(`[${MODULE_ID}] Restore failed`, error);
        toast('error', `백업 복원에 실패했어: ${error.message}`);
        setStatus('백업 복원에 실패했어.', 'error');
    } finally {
        setBusy(false);
    }
}

function switchAwayFromDeletedCurrent(namesToDelete) {
    const current = presetRows.find(row => row.current);
    if (!current || !namesToDelete.includes(current.name)) return;

    const fallback = presetRows.find(row => !namesToDelete.includes(row.name));
    if (!fallback) {
        throw new Error('남길 프리셋을 찾지 못했어');
    }

    const select = document.querySelector('#settings_preset_openai');
    select.value = fallback.value;
    globalThis.jQuery?.(select).trigger('change');
}

async function deleteSelected() {
    if (busy) return;
    const names = getSelectedExistingNames();

    if (!names.length) {
        toast('warning', '삭제할 프리셋을 먼저 선택해줘.');
        return;
    }
    if (names.length >= presetRows.length) {
        toast('warning', '실리태번이 빈 프리셋 상태가 되지 않도록 최소 1개는 남겨야 해.');
        setStatus('모든 프리셋을 한꺼번에 삭제할 수는 없어. 남길 프리셋 1개의 체크를 풀어줘.', 'warning');
        return;
    }

    const previewLimit = 16;
    const preview = names.slice(0, previewLimit).map(name => `<li>${escapeHtml(name)}</li>`).join('');
    const remainder = names.length > previewLimit ? `<li>그 외 ${names.length - previewLimit}개</li>` : '';
    const confirmed = await confirmAction(
        `프리셋 ${names.length}개 영구 삭제`,
        `<p><b>이 작업은 되돌릴 수 없어.</b> 필요하면 먼저 ‘선택 백업’을 눌러줘.</p><ul class="pbm-confirm-list">${preview}${remainder}</ul>`,
        `선택한 프리셋 ${names.length}개를 영구 삭제할까?`,
    );
    if (!confirmed) {
        setStatus('삭제를 취소했어.');
        return;
    }

    setBusy(true);
    const failed = [];

    try {
        switchAwayFromDeletedCurrent(names);
        await new Promise(resolve => setTimeout(resolve, 150));

        const manager = getManager();
        const context = getContext();
        const presetDeletedEvent = context.eventTypes?.PRESET_DELETED ?? context.event_types?.PRESET_DELETED;

        for (let index = 0; index < names.length; index++) {
            const name = names[index];
            setStatus(`삭제 중 ${index + 1}/${names.length} · ${name}`);
            let ok = false;
            try {
                ok = await manager.deletePreset(name);
                if (ok && presetDeletedEvent) {
                    await context.eventSource?.emit?.(presetDeletedEvent, { apiId: API_ID, name });
                }
            } catch (error) {
                console.error(`[${MODULE_ID}] Failed to delete preset: ${name}`, error);
            }
            if (!ok) failed.push(name);
        }

        context.saveSettingsDebounced?.();
        selectedNames.clear();
        refreshPresets({ preserveSelection: false });

        const deletedCount = names.length - failed.length;
        if (deletedCount) toast('success', `${deletedCount}개 프리셋을 삭제했어.`);

        if (failed.length) {
            toast('warning', `${failed.length}개는 서버에서 삭제되지 않았어. 목록을 다시 맞추기 위해 새로고침할게.`);
            setStatus(`삭제 ${deletedCount}개 완료 · 실패 ${failed.length}개. 새로고침하는 중…`, 'warning');
            setTimeout(() => globalThis.location.reload(), 900);
        } else {
            setStatus(`${deletedCount}개 삭제 완료.`, 'success');
        }
    } finally {
        setBusy(false);
    }
}

function bindEvents(root) {
    root.querySelector('.pbm-search').addEventListener('input', renderPresetList);
    root.querySelector('.pbm-refresh').addEventListener('click', () => refreshPresets());
    root.querySelector('.pbm-select-visible').addEventListener('click', selectVisible);
    root.querySelector('.pbm-clear-selection').addEventListener('click', clearSelection);
    root.querySelector('.pbm-backup').addEventListener('click', backupSelected);
    root.querySelector('.pbm-delete').addEventListener('click', deleteSelected);

    const restoreInput = root.querySelector('.pbm-restore-input');
    root.querySelector('.pbm-restore').addEventListener('click', () => restoreInput.click());
    restoreInput.addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        await restoreBackup(file);
    });

    root.querySelector('.pbm-list').addEventListener('change', event => {
        const checkbox = event.target.closest('.pbm-preset-checkbox');
        if (!checkbox) return;
        if (checkbox.checked) selectedNames.add(checkbox.dataset.name);
        else selectedNames.delete(checkbox.dataset.name);
        updateSummary();
    });
}

function createSettings() {
    const root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'extension_container';
    root.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>preset delete</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p class="pbm-description">프롬프트가 들어 있는 Chat Completion 프리셋을 여러 개 골라 한 번에 삭제해.</p>
                <div class="pbm-toolbar pbm-toolbar-top">
                    <input class="text_pole pbm-search" type="search" placeholder="프리셋 이름 검색" autocomplete="off">
                    <button class="menu_button pbm-refresh" type="button" title="목록 새로고침">
                        <i class="fa-solid fa-rotate-right"></i><span>새로고침</span>
                    </button>
                </div>
                <div class="pbm-toolbar pbm-selection-tools">
                    <button class="menu_button pbm-select-visible" type="button">표시 항목 전체 선택</button>
                    <button class="menu_button pbm-clear-selection" type="button">선택 해제</button>
                </div>
                <div class="pbm-summary">전체 0개 · 표시 0개 · 선택 0개</div>
                <div class="pbm-list" role="list"></div>
                <div class="pbm-toolbar pbm-actions">
                    <button class="menu_button pbm-backup" type="button">
                        <i class="fa-solid fa-download"></i><span>선택 백업</span>
                    </button>
                    <button class="menu_button pbm-restore" type="button">
                        <i class="fa-solid fa-upload"></i><span>백업 복원</span>
                    </button>
                    <button class="menu_button redWarningBG pbm-delete" type="button">
                        <i class="fa-solid fa-trash"></i><span>선택 삭제</span>
                    </button>
                    <input class="pbm-restore-input" type="file" accept="application/json,application/zip,.json,.zip" hidden>
                </div>
                <div class="pbm-notice">삭제는 영구적이야. 중요한 프리셋은 먼저 ‘선택 백업’으로 저장해줘. 백업에는 프록시 주소 같은 프리셋 설정이 포함될 수 있어.</div>
                <div class="pbm-status" aria-live="polite"></div>
            </div>
        </div>`;
    return root;
}

function initialize() {
    if (document.getElementById(ROOT_ID)) return true;
    const container = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings');
    if (!container) return false;

    const root = createSettings();
    container.append(root);
    bindEvents(root);
    refreshPresets({ preserveSelection: false });

    try {
        const context = getContext();
        const refresh = () => !busy && refreshPresets();
        const events = context.eventTypes ?? context.event_types;
        if (events?.PRESET_CHANGED) context.eventSource?.on?.(events.PRESET_CHANGED, refresh);
        if (events?.SETTINGS_UPDATED) context.eventSource?.on?.(events.SETTINGS_UPDATED, refresh);
    } catch (error) {
        console.warn(`[${MODULE_ID}] Event listeners were not registered`, error);
    }

    return true;
}

globalThis.jQuery?.(() => {
    if (initialize()) return;
    let attempts = 0;
    const timer = setInterval(() => {
        attempts += 1;
        if (initialize() || attempts >= 30) clearInterval(timer);
    }, 500);
});
