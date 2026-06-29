// ============================================================
// 登記チェックシステム app.js
// ============================================================

// --- 状態管理 ---
let uploadedFiles = [];
let cases = JSON.parse(localStorage.getItem('touki_cases') || '[]');
let history = JSON.parse(localStorage.getItem('touki_history') || '[]');
let settings = JSON.parse(localStorage.getItem('touki_settings') || '{}');
let lastResult = null;

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  updateStats();
  renderCasesTable();
  renderHistoryTable();
  setupNav();
  setupUpload();

  // スプレッドシートから補正事例を安全に読み込む（中継API経由）
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

// --- ナビゲーション ---
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

// --- 設定 ---
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

// --- ファイルアップロード ---
function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => handleFiles(e.target.files));

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
}

function handleFiles(files) {
  Array.from(files).forEach(file => {
    if (!uploadedFiles.find(f => f.name === file.name)) {
      uploadedFiles.push(file);
    }
  });
  renderFileList();
}

function renderFileList() {
  const list = document.getElementById('file-list');
  const zone = document.getElementById('upload-zone');

  if (uploadedFiles.length === 0) {
    list.innerHTML = '';
    zone.classList.remove('has-files');
    return;
  }

  zone.classList.add('has-files');
  zone.querySelector('.upload-text').textContent = `${uploadedFiles.length}件のファイルを読み込み済み`;
  zone.querySelector('.upload-sub').textContent = 'ここに追加のファイルをドロップ';

  list.innerHTML = uploadedFiles.map((f, i) => {
    const isPdf = f.type === 'application/pdf';
    const size = (f.size / 1024).toFixed(0);
    return `
      <div class="file-item">
        <div class="file-icon ${isPdf ? 'pdf' : 'img'}">${isPdf ? 'PDF' : 'IMG'}</div>
        <span class="file-name">${f.name}</span>
        <span class="file-size">${size}KB</span>
        <button class="file-remove" onclick="removeFile(${i})">✕</button>
      </div>
    `;
  }).join('');
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFileList();
  if (uploadedFiles.length === 0) {
    const zone = document.getElementById('upload-zone');
    zone.querySelector('.upload-text').textContent = 'クリックまたはドラッグ＆ドロップ';
    zone.querySelector('.upload-sub').textContent = 'PDF・JPG・PNG対応 複数ファイル可';
  }
}

function clearCheck() {
  uploadedFiles = [];
  document.getElementById('file-input').value = '';
  document.getElementById('file-list').innerHTML = '';
  document.getElementById('inline-result').innerHTML = '';
  document.getElementById('check-type').value = '';
  const zone = document.getElementById('upload-zone');
  zone.classList.remove('has-files');
  zone.querySelector('.upload-text').textContent = 'クリックまたはドラッグ＆ドロップ';
  zone.querySelector('.upload-sub').textContent = 'PDF・JPG・PNG対応 複数ファイル可';
}

// --- ファイルをbase64に変換 ---
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- 法律知識 ---
const LAW_KNOWLEDGE = `
【不動産登記法・規則の主要チェックポイント】

■ 申請書の必要記載事項（不動産登記令3条）
- 登記の目的
- 登記原因とその日付（必ず具体的な年月日が必要）
- 申請人（権利者・義務者）の氏名・住所
- 代理人がいる場合はその氏名・住所
- 不動産の表示（所在・地番・家屋番号等）
- 登録免許税額（課税価格を含む）

■ 添付書類の要件（申請種別ごと）
【所有権移転（売買）】
必須：登記原因証明情報（売買契約書等）、義務者の印鑑証明書（3ヶ月以内）、住所証明情報（権利者の住民票等）、代理権限証書
注意：買主が法人の場合は資格証明情報も必要

【所有権移転（相続）】
必須：登記原因証明情報（戸籍謄本全部・遺産分割協議書または遺言書）、住所証明情報（相続人）、固定資産評価証明書
注意：相続人全員の印鑑証明書（遺産分割の場合）

【所有権移転（贈与）】
必須：登記原因証明情報（贈与契約書等）、義務者の印鑑証明書、住所証明情報（権利者）

【抵当権設定】
必須：登記原因証明情報（金銭消費貸借契約書・抵当権設定契約書）、設定者の印鑑証明書、代理権限証書
記載必須：債権額、利息、損害金、債務者、抵当権者

【抵当権抹消】
必須：登記原因証明情報（解除証書・弁済証書等）、登記識別情報または登記済証、代理権限証書

【所有権保存】
必須：住所証明情報、固定資産評価証明書

【住所変更・氏名変更】
必須：住民票（住所変更）または戸籍謄本（氏名変更）

■ よくある補正原因
- 登記原因の日付誤り・空欄
- 印鑑証明書の有効期限切れ（作成後3ヶ月以内）
- 申請人の住所が登記簿と不一致
- 委任状の委任事項に不動産表示・登記の目的の記載漏れ
- 委任状の委任事項と申請書の内容の不一致
- 課税価格・登録免許税の計算誤り
  売買・贈与：固定資産評価額×2/1000
  相続：固定資産評価額×4/1000
  抵当権設定：債権額×4/1000
  抵当権抹消：不動産1個につき1000円
- 不動産の表示（地番・家屋番号）の誤記
- 書類間の氏名・住所の不一致
- 売買契約書と申請書の原因日付の不一致
- 戸籍の続柄と相続関係の不整合
`;

// --- AIチェック実行 ---
async function runCheck() {
  const apiKey = settings.apikey;
  if (!apiKey) { showToast('設定画面でGemini APIキーを入力してください', true); return; }
  if (uploadedFiles.length === 0) { showToast('書類をアップロードしてください', true); return; }
  const type = document.getElementById('check-type').value;
  if (!type) { showToast('申請種別を選択してください', true); return; }

  const person = document.getElementById('check-person').value.trim() || '未設定';
  const doLaw = document.getElementById('chk-law').checked;
  const doDoc = document.getElementById('chk-doc').checked;
  const doCase = document.getElementById('chk-case').checked;
  const doAnon = document.getElementById('chk-anon').checked;

  showLoading('書類を読み取り中...');

  try {
    const fileParts = await Promise.all(uploadedFiles.map(async f => {
      const b64 = await fileToBase64(f);
      const mimeType = f.type || 'application/pdf';
      return { inline_data: { mime_type: mimeType, data: b64 } };
    }));

    const casesText = cases.length > 0
      ? cases.map((c, i) => `【事例${i+1}】種別:${c.type||'不明'}\n内容:${c.content}\n補正:${c.correction}`).join('\n\n')
      : '（まだ登録されていません）';

    const axes = [];
    if (doLaw) axes.push('① 法令チェック（必要記載事項の漏れ・誤り）');
    if (doDoc) axes.push('② 添付書類チェック（種別ごとの必要書類の過不足・有効期限）');
    if (doCase) axes.push('③ 補正事例チェック（過去事例との類似）');

    const anonNote = doAnon ? '※個人の氏名・住所・生年月日は特定できても仮名で言及してください。' : '';

    const prompt = `あなたは司法書士事務所の登記申請書審査AIです。
添付された書類一式（${uploadedFiles.length}件）を精密に確認し、以下の法律知識と補正事例をもとに総合的にチェックしてください。
${anonNote}

${LAW_KNOWLEDGE}

# 過去の補正事例
${casesText}

# 申請種別
${type}

# チェック軸
${axes.join('\n')}

# 出力形式（JSONのみ。前後に説明文は不要）
{
  "risk_level": "high" または "medium" または "low",
  "overall": "全体評価を2文以内で",
  "file_results": [
    {"filename": "ファイル名", "status": "ok" または "warn" または "ng", "note": "この書類の概要1文"}
  ],
  "law_issues": [
    {"severity": "high" または "medium", "filename": "問題のあるファイル名", "issue": "問題点（1文）", "law_ref": "根拠条文（例：不登法59条4号）", "fix": "修正方法（1文）"}
  ],
  "doc_issues": [
    {"severity": "high" または "medium", "filename": "関連ファイル名", "issue": "書類の問題点", "fix": "対応方法"}
  ],
  "cross_issues": [
    {"severity": "high" または "medium", "issue": "書類間の整合性問題", "fix": "修正方法"}
  ],
  "case_matches": [
    {"case_index": 事例番号, "similarity": 0-100, "point": "類似点", "risk": "リスク"}
  ],
  "ok_points": ["問題なさそうな点（簡潔に）"]
}
law_issuesはdoLaw=${doLaw}、doc_issuesはdoDoc=${doDoc}の場合のみ含める。
case_matchesはdoCase=${doCase}かつsimilarity>=50の場合のみ含める。
問題がない軸は空配列にする。`;

    showLoading('AIが書類を解析中...');

    const parts = [{ text: prompt }, ...fileParts];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'APIエラー');

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    hideLoading();
    lastResult = { result, type, person, fileCount: uploadedFiles.length, date: new Date() };

    addHistory(type, person, uploadedFiles.length, result.risk_level);
    renderResult(result, type, person);
    updateStats();

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelector('[data-page="result"]').classList.add('active');
    document.getElementById('page-result').classList.add('active');

  } catch (e) {
    hideLoading();
    showToast('エラーが発生しました: ' + e.message, true);
    console.error(e);
  }
}

// --- 結果レンダリング ---
function renderResult(r, type, person) {
  const riskConfig = {
    high: { cls: 'alert-danger', titleCls: 'danger', icon: '⚠️', label: '要注意：補正リスクが高い申請書です' },
    medium: { cls: 'alert-warn', titleCls: 'warn', icon: '⚠', label: '注意：一部補正リスクがあります' },
    low: { cls: 'alert-success', titleCls: 'success', icon: '✓', label: '問題なし：特段のリスクは見当たりません' }
  };
  const rc = riskConfig[r.risk_level] || riskConfig.low;

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <div style="font-size:14px;color:var(--color-text-secondary)">
        ${type} 担当：${person} ${new Date().toLocaleString('ja-JP')}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost" style="font-size:13px" onclick="saveAsCase()">補正事例として保存</button>
        <button class="btn btn-ghost" style="font-size:13px" onclick="printResult()">印刷</button>
      </div>
    </div>
    <div class="alert ${rc.cls}">
      <div class="alert-title ${rc.titleCls}">${rc.icon} ${rc.label}</div>
      <div style="font-size:13px">${r.overall || ''}</div>
    </div>
  `;

  if (r.file_results && r.file_results.length > 0) {
    html += `<div class="section-label">書類ごとの読み取り状況</div>
    <div class="doc-grid">
      ${r.file_results.map(f => `
        <div class="doc-card ${f.status}">
          <span>${f.status === 'ok' ? '✓' : f.status === 'ng' ? '✕' : '!'}</span>
          <div>
            <div style="font-weight:500;font-size:13px">${f.filename}</div>
            <div style="font-size:12px;color:var(--color-text-secondary)">${f.note}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  if (r.law_issues && r.law_issues.length > 0) {
    html += `<div class="section-label"><span class="badge badge-law">法令</span> 法令・記載事項チェック</div>
    <div class="card">
      ${r.law_issues.map(item => `
        <div class="result-item">
          <div class="dot ${item.severity === 'high' ? 'dot-danger' : 'dot-warn'}"></div>
          <div>
            <div class="result-main">${item.filename ? `【${item.filename}】` : ''}${item.issue}</div>
            ${item.law_ref ? `<span class="result-ref">${item.law_ref}</span>` : ''}
            <div class="result-fix">→ ${item.fix}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  if (r.doc_issues && r.doc_issues.length > 0) {
    html += `<div class="section-label"><span class="badge badge-doc">添付書類</span> 添付書類チェック</div>
    <div class="card">
      ${r.doc_issues.map(item => `
        <div class="result-item">
          <div class="dot ${item.severity === 'high' ? 'dot-danger' : 'dot-warn'}"></div>
          <div>
            <div class="result-main">${item.filename ? `【${item.filename}】` : ''}${item.issue}</div>
            <div class="result-fix">→ ${item.fix}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  if (r.cross_issues && r.cross_issues.length > 0) {
    html += `<div class="section-label"><span class="badge badge-case">整合性</span> 書類間の整合性チェック</div>
    <div class="card">
      ${r.cross_issues.map(item => `
        <div class="result-item">
          <div class="dot ${item.severity === 'high' ? 'dot-danger' : 'dot-warn'}"></div>
          <div>
            <div class="result-main">${item.issue}</div>
            <div class="result-fix">→ ${item.fix}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  }

  if (r.case_matches && r.case_matches.length > 0) {
    html += `<div class="section-label"><span class="badge badge-case">補正事例</span> 類似補正事例</div>`;
    r.case_matches.forEach(m => {
      const c = cases[m.case_index - 1];
      const color = m.similarity >= 75 ? 'var(--color-danger)' : 'var(--color-warn)';
      html += `
        <div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="font-size:13px;font-weight:500">事例${m.case_index}との類似 ${c ? `<span class="badge badge-case" style="margin-left:6px">${c.type}</span>` : ''}</div>
            <span style="font-size:15px;font-weight:600;color:${color}">${Math.round(m.similarity)}%</span>
          </div>
          <div style="height:5px;background:var(--color-border);border-radius:4px;margin-bottom:10px">
            <div style="width:${Math.round(m.similarity)}%;height:5px;border-radius:4px;background:${color}"></div>
          </div>
          <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:4px">${m.point}</div>
          <div style="font-size:13px;font-weight:500">⚠ ${m.risk}</div>
        </div>
      `;
    });
  }

  if (r.ok_points && r.ok_points.length > 0) {
    html += `<div class="section-label">問題なさそうな点</div>
    <div class="card">
      ${r.ok_points.map(p => `
        <div class="result-item">
          <div class="dot dot-success"></div>
          <div style="font-size:13px;color:var(--color-text-secondary)">${p}</div>
        </div>
      `).join('')}
    </div>`;
  }

  document.getElementById('result-content').innerHTML = html;
  document.getElementById('inline-result').innerHTML = '';
}

// --- 補正事例として保存 ---
function saveAsCase() {
  if (!lastResult) return;
  showAddCase();
  document.querySelector('[data-page="cases"]').click();
  document.getElementById('case-type').value = lastResult.type;
  showToast('補正内容を追記して登録してください');
}

// --- 補正事例DB ---
function showAddCase() { document.getElementById('add-case-form').style.display = 'block'; }
function hideAddCase() { document.getElementById('add-case-form').style.display = 'none'; }

async function addCase() {
  const type = document.getElementById('case-type').value.trim();
  const content = document.getElementById('case-content').value.trim();
  const correction = document.getElementById('case-correction').value.trim();
  const person = document.getElementById('case-person').value.trim();
  if (!content || !correction) { showToast('申請書内容と補正内容は必須です', true); return; }

  const newCase = {
    id: Date.now(),
    date: new Date().toLocaleDateString('ja-JP'),
    type, content, correction, person
  };

  cases.unshift(newCase);
  localStorage.setItem('touki_cases', JSON.stringify(cases));

  // 中継APIを経由してスプレッドシートに安全に保存
  try {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        id: String(newCase.id),
        date: newCase.date,
        type: newCase.type,
        content: newCase.content,
        correction: newCase.correction,
        person: newCase.person
      })
    });
    const data = await res.json();
    
    if (data.success) {
      showToast('補正事例を登録しました（スプレッドシートに保存済み）');
    } else {
      showToast('補正事例を登録しましたが、スプレッドシート保存に失敗しました: ' + (data.error || '不明なエラー'), true);
    }
  } catch(e) {
    console.error(e);
    showToast('補正事例を登録しましたが、スプレッドシートとの通信に失敗しました', true);
  }

  hideAddCase();
  ['case-type','case-content','case-correction','case-person'].forEach(id => document.getElementById(id).value = '');
  renderCasesTable();
  updateStats();
}

// --- 修正後の削除処理 ---
async function deleteCase(id) {
  if (!confirm('この事例を削除しますか？')) return;
  
  // 画面の見た目とブラウザの記憶から一旦削除
  cases = cases.filter(c => String(c.id) !== String(id));
  localStorage.setItem('touki_cases', JSON.stringify(cases));
  renderCasesTable();
  updateStats();

  // スプレッドシート（裏側）にも削除するようお願いする
  try {
    const res = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        id: String(id) // どのIDを消すかを送る
      })
    });
    const data = await res.json();
    
    if (data.success) {
      showToast('削除しました');
    } else {
      showToast('スプレッドシートからの削除に失敗しました: ' + (data.error || '不明なエラー'), true);
    }
  } catch(e) {
    console.error(e);
    showToast('通信エラーでスプレッドシートから削除できませんでした', true);
  }
}

function renderCasesTable() {
  const tbody = document.getElementById('cases-table-body');
  if (cases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">まだ補正事例が登録されていません</td></tr>';
    return;
  }
  tbody.innerHTML = cases.map(c => `
    <tr>
      <td style="white-space:nowrap">${c.date}</td>
      <td><span class="badge badge-case">${c.type || '不明'}</span></td>
      <td>${c.correction ? c.correction.slice(0, 40) + (c.correction.length > 40 ? '…' : '') : ''}</td>
      <td>${c.person || '-'}</td>
      <td><button class="btn btn-ghost" style="font-size:12px;padding:4px 8px" onclick="deleteCase(${c.id})">削除</button></td>
    </tr>
  `).join('');
}

// --- チェック履歴 ---
function addHistory(type, person, fileCount, riskLevel) {
  history.unshift({
    date: new Date().toLocaleString('ja-JP'),
    type, person, fileCount, riskLevel
  });
  if (history.length > 100) history = history.slice(0, 100);
  localStorage.setItem('touki_history', JSON.stringify(history));
  renderHistoryTable();
}

function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">チェック履歴がありません</td></tr>';
    return;
  }
  tbody.innerHTML = history.map(h => {
    const badge = h.riskLevel === 'high'
      ? '<span class="badge badge-danger">要注意</span>'
      : h.riskLevel === 'medium'
      ? '<span class="badge badge-warn">注意</span>'
      : '<span class="badge badge-ok">問題なし</span>';
    return `<tr>
      <td style="white-space:nowrap;font-size:12px">${h.date}</td>
      <td>${h.type}</td>
      <td>${h.fileCount}件</td>
      <td>${h.person}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

function clearHistory() {
  if (!confirm('チェック履歴をすべて削除しますか？')) return;
  history = [];
  localStorage.setItem('touki_history', JSON.stringify(history));
  renderHistoryTable();
  updateStats();
  showToast('履歴を削除しました');
}

// --- CSV ---
function exportCSV() {
  if (cases.length === 0) { showToast('補正事例がありません', true); return; }
  const header = ['ID', '日付', '申請種別', '申請書内容', '補正内容', '担当者'];
  const rows = cases.map(c => [c.id, c.date, c.type, c.content, c.correction, c.person].map(v => `"${(v||'').replace(/"/g,'""')}"`));
  const csv = '\uFEFF' + [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `補正事例_${new Date().toLocaleDateString('ja-JP').replace(/\//g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSVをエクスポートしました');
}

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result.replace(/^\uFEFF/, '');
    const lines = text.split('\n').slice(1).filter(l => l.trim());
    let count = 0;
    lines.forEach(line => {
      const cols = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map(v => v.replace(/,$/,'').replace(/^"|"$/g,'').replace(/""/g,'"')) || [];
      if (cols.length >= 5) {
        cases.push({ id: Date.now() + count, date: cols[1], type: cols[2], content: cols[3], correction: cols[4], person: cols[5] || '' });
        count++;
      }
    });
    localStorage.setItem('touki_cases', JSON.stringify(cases));
    renderCasesTable();
    updateStats();
    showToast(`${count}件の事例をインポートしました`);
  };
  reader.readAsText(file, 'UTF-8');
  event.target.value = '';
}

// --- 統計更新 ---
function updateStats() {
  document.getElementById('stat-cases').textContent = cases.length;
  document.getElementById('stat-checked').textContent = history.length;
  const thisMonth = new Date().getMonth();
  const alerts = history.filter(h => {
    const d = new Date(h.date);
    return d.getMonth() === thisMonth && (h.riskLevel === 'high' || h.riskLevel === 'medium');
  }).length;
  document.getElementById('stat-alerts').textContent = alerts;
}

// --- 全データ削除 ---
function clearAllData() {
  if (!confirm('全データ（補正事例・履歴・設定）を削除しますか？この操作は取り消せません。')) return;
  localStorage.clear();
  cases = []; history = []; settings = {};
  renderCasesTable();
  renderHistoryTable();
  updateStats();
  showToast('全データを削除しました');
}

// --- 印刷 ---
function printResult() { window.print(); }

// --- UI補助 ---
function showLoading(msg) {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.className = 'loading-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="spinner"></div><div>${msg}</div>`;
  el.style.display = 'flex';
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

function showToast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.background = isError ? 'var(--color-danger)' : 'var(--color-text)';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}
