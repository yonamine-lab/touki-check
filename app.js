// ============================================================
// 登記チェックシステム app.js (項目変更版)
// ============================================================

let uploadedFiles = [];
let cases = JSON.parse(localStorage.getItem('touki_cases') || '[]');
let history = JSON.parse(localStorage.getItem('touki_history') || '[]');
let settings = JSON.parse(localStorage.getItem('touki_settings') || '{}');
let lastResult = null;

document.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  updateStats();
  renderCasesTable();
  renderHistoryTable();
  setupNav();
  setupUpload();

  try {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list' })
    });
    const data = await res.json();
    if (data.success && data.cases && data.cases.length > 0) {
      cases = data.cases;
      localStorage.setItem('touki_cases', JSON.stringify(cases));
      renderCasesTable();
      updateStats();
      showToast('スプレッドシートから補正事例を読み込みました');
    }
  } catch(e) {
    console.log('スプレッドシート読み込みエラー:', e);
  }
});

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('page-' + btn.dataset.page).classList.add('active');
    });
  });
}

function loadSettings() {
  if (settings.apikey) document.getElementById('setting-apikey').value = settings.apikey;
  if (settings.office) document.getElementById('setting-office').value = settings.office;
  if (settings.user) {
    document.getElementById('setting-user').value = settings.user;
    document.getElementById('user-name-display').textContent = settings.user;
    document.getElementById('user-avatar').textContent = settings.user.charAt(0);
    document.getElementById('check-person').value = settings.user;
  }
}

function saveSettings() {
  settings.apikey = document.getElementById('setting-apikey').value.trim();
  settings.office = document.getElementById('setting-office').value.trim();
  settings.user = document.getElementById('setting-user').value.trim();
  localStorage.setItem('touki_settings', JSON.stringify(settings));
  if (settings.user) {
    document.getElementById('user-name-display').textContent = settings.user;
    document.getElementById('user-avatar').textContent = settings.user.charAt(0);
  }
  showToast('設定を保存しました');
}

function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => handleFiles(e.target.files));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
}

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!uploadedFiles.find(f => f.name === file.name)) uploadedFiles.push(file);
  });
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById('file-list');
  const zone = document.getElementById('upload-zone');
  if (uploadedFiles.length === 0) { list.innerHTML = ''; zone.classList.remove('has-files'); return; }
  zone.classList.add('has-files');
  zone.querySelector('.upload-text').textContent = `${uploadedFiles.length}件のファイルを読み込み済み`;
  list.innerHTML = uploadedFiles.map((f, i) => {
    const isPdf = f.type === 'application/pdf';
    return `<div class="file-item">
      <div class="file-icon ${isPdf ? 'pdf' : 'img'}">${isPdf ? 'PDF' : 'IMG'}</div>
      <span class="file-name">${f.name}</span>
      <button class="file-remove" onclick="removeFile(${i})">✕</button>
    </div>`;
  }).join('');
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFileList();
}

function clearCheck() {
  uploadedFiles = [];
  document.getElementById('file-input').value = '';
  document.getElementById('file-list').innerHTML = '';
  document.getElementById('inline-result').innerHTML = '';
  document.getElementById('check-type').value = '';
  const zone = document.getElementById('upload-zone');
  zone.classList.remove('has-files');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const LAW_KNOWLEDGE = `【省略】`;

async function runCheck() {
  const apiKey = settings.apikey;
  if (!apiKey) { showToast('設定画面でGemini APIキーを入力してください', true); return; }
  if (uploadedFiles.length === 0) { showToast('書類をアップロードしてください', true); return; }
  const type = document.getElementById('check-type').value;
  if (!type) { showToast('申請種別を選択してください', true); return; }

  // ▼ エラー回避のための安全な書き方に変更
  const personEl = document.getElementById('check-person');
  const person = personEl ? personEl.value.trim() : '未設定';

  const doLaw = document.getElementById('chk-law').checked;
  const doDoc = document.getElementById('chk-doc').checked;
  const doCase = document.getElementById('chk-case').checked;
  const doAnon = document.getElementById('chk-anon').checked;

  showLoading('書類を読み取り中...');

  try {
    const fileParts = await Promise.all(uploadedFiles.map(async f => {
      const b64 = await fileToBase64(f);
      return { inline_data: { mime_type: f.type || 'application/pdf', data: b64 } };
    }));

    // 💡 Geminiに送る過去事例のテキストを新しい項目形式に修正
    const casesText = cases.length > 0
      ? cases.map((c, i) => `【事例${i+1}】申請日:${c.date}\n受付番号:${c.receipt_number||'不明'}\n管轄法務局:${c.jurisdiction||'不明'}\n登記官:${c.registrar||'不明'}\n種別:${c.type}\n補正内容:${c.correction}`).join('\n\n')
      : '（まだ登録されていません）';

    const axes = [];
    if (doLaw) axes.push('① 法令チェック');
    if (doDoc) axes.push('② 添付書類チェック');
    if (doCase) axes.push('③ 補正事例チェック');

    const prompt = `あなたは司法書士事務所の登記申請書審査AIです。書類を確認し、過去の補正事例をもとにチェックしてください。\n\n# 過去の補正事例\n${casesText}\n\n# 申請種別\n${type}\n\n（以下出力フォーマット指定等略）`;

    showLoading('AIが書類を解析中...');
    const parts = [{ text: prompt }, ...fileParts];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());

    hideLoading();
    lastResult = { result, type, person, date: new Date() };
    addHistory(type, person, uploadedFiles.length, result.risk_level);
    renderResult(result, type, person);

  } catch (e) {
    hideLoading();
    showToast('エラー: ' + e.message, true);
  }
}

function renderResult(r, type, person) {
  // 結果描画処理（既存のまま）
}

function saveAsCase() {
  if (!lastResult) return;
  showAddCase();
  document.querySelector('[data-page="cases"]').click();
  document.getElementById('case-type').value = lastResult.type;
}

function showAddCase() { document.getElementById('add-case-form').style.display = 'block'; }
function hideAddCase() { document.getElementById('add-case-form').style.display = 'none'; }

// 💡 新しい7つの項目で保存する処理
async function addCase() {
  const date = document.getElementById('case-date').value.trim();
  const receipt_number = document.getElementById('case-receipt').value.trim();
  const jurisdiction = document.getElementById('case-jurisdiction').value.trim();
  const registrar = document.getElementById('case-registrar').value.trim();
  const type = document.getElementById('case-type').value.trim();
  const correction = document.getElementById('case-correction').value.trim();

  if (!date || !type || !correction) { showToast('申請日、申請種別、補正内容は必須です', true); return; }

  const newCase = {
    id: Date.now(),
    date, receipt_number, jurisdiction, registrar, type, correction
  };

  cases.unshift(newCase);
  localStorage.setItem('touki_cases', JSON.stringify(cases));

  try {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        id: String(newCase.id),
        date: newCase.date,
        receipt_number: newCase.receipt_number,
        jurisdiction: newCase.jurisdiction,
        registrar: newCase.registrar,
        type: newCase.type,
        correction: newCase.correction
      })
    });
    const data = await res.json();
    if (data.success) showToast('補正事例を登録しました（スプレッドシートに保存済み）');
  } catch(e) {
    showToast('スプレッドシートへの保存に失敗しました', true);
  }

  hideAddCase();
  ['case-date','case-receipt','case-jurisdiction','case-registrar','case-type','case-correction'].forEach(id => document.getElementById(id).value = '');
  renderCasesTable();
  updateStats();
}

async function deleteCase(id) {
  if (!confirm('この事例を削除しますか？')) return;
  cases = cases.filter(c => String(c.id) !== String(id));
  localStorage.setItem('touki_cases', JSON.stringify(cases));
  renderCasesTable();
  updateStats();

  try {
    await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id: String(id) })
    });
    showToast('削除しました');
  } catch(e) {
    showToast('通信エラー', true);
  }
}

// 💡 新しい7つの項目を一覧テーブルに表示
function renderCasesTable() {
  const tbody = document.getElementById('cases-table-body');
  if (cases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">まだ補正事例が登録されていません</td></tr>';
    return;
  }
  tbody.innerHTML = cases.map(c => `
    <tr>
      <td style="white-space:nowrap">${c.date}</td>
      <td>${c.receipt_number || '-'}</td>
      <td>${c.jurisdiction || '-'}</td>
      <td>${c.registrar || '-'}</td>
      <td><span class="badge badge-case">${c.type || '不明'}</span></td>
      <td>${c.correction ? c.correction.slice(0, 40) + (c.correction.length > 40 ? '…' : '') : ''}</td>
      <td><button class="btn btn-ghost" style="font-size:12px;padding:4px 8px" onclick="deleteCase(${c.id})">削除</button></td>
    </tr>
  `).join('');
}

function addHistory(t, p, f, r) { /* 履歴処理 既存のまま */ }
function renderHistoryTable() { /* 履歴処理 既存のまま */ }
function clearHistory() { /* 既存のまま */ }

// 💡 CSVエクスポートのヘッダー変更
function exportCSV() {
  if (cases.length === 0) { showToast('補正事例がありません', true); return; }
  const header = ['ID', '申請日', '受付番号', '管轄法務局', '登記官', '申請種別', '補正内容'];
  const rows = cases.map(c => [c.id, c.date, c.receipt_number, c.jurisdiction, c.registrar, c.type, c.correction].map(v => `"${(v||'').replace(/"/g,'""')}"`));
  const csv = '\uFEFF' + [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `補正事例.csv`; a.click();
}

// 💡 CSVインポートの列解析変更
function importCSV(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result.replace(/^\uFEFF/, '');
    const lines = text.split('\n').slice(1).filter(l => l.trim());
    let count = 0;
    lines.forEach(line => {
      const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(v => v.replace(/,$/,'').replace(/^"|"$/g,'').replace(/""/g,'"')) || [];
      if (cols.length >= 6) {
        cases.push({ id: cols[0] || Date.now() + count, date: cols[1], receipt_number: cols[2], jurisdiction: cols[3], registrar: cols[4], type: cols[5], correction: cols[6] });
        count++;
      }
    });
    localStorage.setItem('touki_cases', JSON.stringify(cases));
    renderCasesTable(); updateStats(); showToast(`${count}件インポートしました`);
  };
  reader.readAsText(file, 'UTF-8');
}

function updateStats() {
  document.getElementById('stat-cases').textContent = cases.length;
  document.getElementById('stat-checked').textContent = history.length;
}
function clearAllData() { localStorage.clear(); location.reload(); }
function printResult() { window.print(); }
function showLoading(msg) { /* 省略 */ }
function hideLoading() { /* 省略 */ }
function showToast(msg, isError) { /* 省略 */ }
