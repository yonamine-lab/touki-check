// ============================================================
// 登記チェックシステム app.js (履歴詳細表示対応版)
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

    // 担当者の自動セット処理
    const savedSettings = localStorage.getItem('touki_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      if (parsed.user) {
        forceSetPerson(parsed.user);
      }
    }

  } catch(e) {
    console.log('スプレッドシート読み込みエラー:', e);
  }
});

// プルダウン形式でも名前を強制的に追加してセットする安全な関数
function forceSetPerson(val) {
  const personEl = document.getElementById('check-person');
  if (!personEl || !val) return;
  
  if (personEl.tagName === 'SELECT') {
    let exists = false;
    for (let i = 0; i < personEl.options.length; i++) {
      if (personEl.options[i].value === val) { exists = true; break; }
    }
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      personEl.appendChild(opt);
    }
  }
  personEl.value = val;
}

// --- ナビゲーション ---
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const targetPage = document.getElementById('page-' + btn.dataset.page);
      if (targetPage) targetPage.classList.add('active');
    });
  });
}

// --- 設定 ---
function loadSettings() {
  const apiKeyEl = document.getElementById('setting-apikey');
  if (apiKeyEl && settings.apikey) apiKeyEl.value = settings.apikey;
  
  const officeEl = document.getElementById('setting-office');
  if (officeEl && settings.office) officeEl.value = settings.office;
  
  if (settings.user) {
    const userEl = document.getElementById('setting-user');
    if(userEl) userEl.value = settings.user;
    const nameDisplay = document.getElementById('user-name-display');
    if(nameDisplay) nameDisplay.textContent = settings.user;
    const avatar = document.getElementById('user-avatar');
    if(avatar) avatar.textContent = settings.user.charAt(0);
    
    forceSetPerson(settings.user);
  }
}

function saveSettings() {
  const apiKeyEl = document.getElementById('setting-apikey');
  if (apiKeyEl) settings.apikey = apiKeyEl.value.trim();
  
  const officeEl = document.getElementById('setting-office');
  if (officeEl) settings.office = officeEl.value.trim();
  
  const userEl = document.getElementById('setting-user');
  if (userEl) settings.user = userEl.value.trim();
  
  localStorage.setItem('touki_settings', JSON.stringify(settings));
  
  if (settings.user) {
    const nameDisplay = document.getElementById('user-name-display');
    if(nameDisplay) nameDisplay.textContent = settings.user;
    const avatar = document.getElementById('user-avatar');
    if(avatar) avatar.textContent = settings.user.charAt(0);
    
    forceSetPerson(settings.user);
  }
  showToast('設定を保存しました');
}

// --- ファイルアップロード ---
function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  if(!zone || !input) return;

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
  if (!list || !zone) return;

  if (uploadedFiles.length === 0) { 
    list.innerHTML = ''; 
    zone.classList.remove('has-files'); 
    return; 
  }
  zone.classList.add('has-files');
  
  const uploadText = zone.querySelector('.upload-text');
  if(uploadText) uploadText.textContent = `${uploadedFiles.length}件のファイルを読み込み済み`;
  
  list.innerHTML = uploadedFiles.map((f, i) => {
    const isPdf = f.type === 'application/pdf';
    const size = (f.size / 1024).toFixed(0);
    return `<div class="file-item">
      <div class="file-icon ${isPdf ? 'pdf' : 'img'}">${isPdf ? 'PDF' : 'IMG'}</div>
      <span class="file-name">${f.name}</span>
      <span class="file-size">${size}KB</span>
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
  const fi = document.getElementById('file-input'); if(fi) fi.value = '';
  const fl = document.getElementById('file-list'); if(fl) fl.innerHTML = '';
  const ir = document.getElementById('inline-result'); if(ir) ir.innerHTML = '';
  const zone = document.getElementById('upload-zone');
  if(zone) zone.classList.remove('has-files');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- 法律知識データ ---
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

【登録免許税ルール】
  ・課税価格：1,000円未満切り捨て（1,000円未満の場合は1,000円）
  ・税額算出：課税価格 × 税率
  ・最終税額：100円未満切り捨て（算出された税額が1,000円未満となる場合は、登録免許税法に基づき最低額である「1,000円」とすること！）

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
  
  const personEl = document.getElementById('check-person');
  const person = personEl ? personEl.value.trim() : '未設定';
  
  const lawEl = document.getElementById('chk-law');
  const doLaw = lawEl ? lawEl.checked : true;
  const docEl = document.getElementById('chk-doc');
  const doDoc = docEl ? docEl.checked : true;
  const caseEl = document.getElementById('chk-case');
  const doCase = caseEl ? caseEl.checked : true;
  const anonEl = document.getElementById('chk-anon');
  const doAnon = anonEl ? anonEl.checked : false;

  showLoading('書類を読み取り中...');

  try {
    const fileParts = await Promise.all(uploadedFiles.map(async f => {
      const b64 = await fileToBase64(f);
      return { inline_data: { mime_type: f.type || 'application/pdf', data: b64 } };
    }));

    const casesText = cases.length > 0
      ? cases.map((c, i) => `【事例${i+1}】申請日:${c.date}\n受付番号:${c.receipt_number||'不明'}\n管轄法務局:${c.jurisdiction||'不明'}\n登記官:${c.registrar||'不明'}\n種別:${c.type}\n補正内容:${c.correction}`).join('\n\n')
      : '（まだ登録されていません）';

    const axes = [];
    if (doLaw) axes.push('① 法令チェック');
    if (doDoc) axes.push('② 添付書類チェック');
    if (doCase) axes.push('③ 補正事例チェック');
    
    const anonNote = doAnon ? '※個人の氏名・住所・生年月日は特定できても仮名で言及してください。' : '';

    const prompt = `あなたは司法書士事務所の登記申請書審査AIです。
添付された書類一式（${uploadedFiles.length}件）を精密に確認し、以下の法律知識と補正事例をもとに総合的にチェックしてください。
${anonNote}

${LAW_KNOWLEDGE}

# 過去の補正事例
${casesText}

# 申請種別
添付された申請書等の画像から「登記の目的（または申請の目的）」をAI自身で最優先で読み取り、何の登記申請（例：売買による所有権移転、抵当権設定など）であるかを自動判別した上で、その種別に応じた厳格な審査を行ってください。

# 必須チェック項目および厳格判定基準
AIは以下の5点について、人間の目による審査と同等の厳格さで一項目ずつステップバイステップで確認し、少しでも疑義がある場合は「不備」または「要確認」として指摘してください。

1. 住所の表記揺れの厳格チェック
- 申請書、印鑑証明書、住民票、登記情報（全部事項証明書）に記載されたすべての住所について、1文字のズレも許さずに突合してください。
- 「一丁目2番3号」「1丁目2-3」「1-2-3」といった、ハイフンや漢字・算用数字の表記揺れもすべて抽出し、一致していない場合は必ず「表記揺れによる補正リスクあり」として指摘すること。

2. 住所変更（名変登記）の必要性チェック
- 登記情報上の所有者の住所・氏名と、添付書類（印鑑証明書等）の住所・氏名を必ず突合してください。
- もし現在の住所・氏名に引越しや婚姻等による変更があるにもかかわらず、申請内容に「所有権登記名義人住所（氏名）変更登記」が含まれていない場合は、前提を欠くため必ず「名変登記の漏れ（補正原因環境）」として指摘すること。

3. 登録免許税の検算（四捨五入・切り捨てルール）
- 登録免許税の計算は、AIが自ら以下の法律上の計算式を立てて検算してください。
  - 課税価格：1,000円未満切り捨て（1,000円未満の場合は1,000円）
  - 税額算出：課税価格 × 税率
  - 最終税額：100円未満切り捨て（100円未満の場合は100円、ただし計算結果が0円になる場合は免税措置等がない限り要確認）
- 申請書に記載された金額と、AIの検算結果が1円でも異なる場合は、計算誤りとして必ず指摘すること。

4. 添付書類の有効期限チェック
- 印鑑証明書や住民票など、発行後3ヶ月い内の制限がある法定添付書類について、その「発行年月日」を画像から確実に読み取ってください。
- 本日の日付（2026年6月29日）と比較し、3ヶ月（90日）を超過している場合、または発行日が読み取れない（見切れている、不鮮明など）場合は、期限切れまたは確認不能として必ず指摘すること。

5. 一括申請（連件・一括）の適否チェック
- 複数の不動産や複数の登記を1つの申請書で一括申請（または連件申請）している場合、管轄法務局、登記の目的、登記原因およびその日付、当事者がすべて同一であるかを確認してください。
- 1点でも異なる要素があり、一括申請の要件（不動産登記令等）を満たさない可能性がある場合は、個別に申請する必要がある旨を指摘すること。


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
※注意: 必ず「# 過去の補正事例」として提供された事例（【事例1】など）と類似している場合のみ出力すること。「LAW_KNOWLEDGE（よくある補正原因）」との類似には絶対に使用しないこと。
問題がない軸は空配列にする。`;

    showLoading('AIが書類を解析中...');
    const parts = [{ text: prompt }, ...fileParts];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents: [{ parts }],
        generationConfig: { temperature: 0.0 }
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'APIエラー');
    
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const result = JSON.parse(text.replace(/```json|```/g, '').trim());

    hideLoading();
    lastResult = { result, type: "自動判別案件", person, date: new Date() };
    
    // ★改良：履歴データの中に、AIの「結果オブジェクト(result)」そのものを丸ごと保存する
    addHistory("自動判別案件", person, uploadedFiles.length, result.risk_level, result);
    renderResult(result, "自動判別案件", person);
    
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pResult = document.querySelector('[data-page="result"]');
    if(pResult) pResult.classList.add('active');
    const pResultPage = document.getElementById('page-result');
    if(pResultPage) pResultPage.classList.add('active');

  } catch (e) {
    hideLoading();
    showToast('エラー: ' + e.message, true);
    console.error(e);
  }
}

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
        担当：${person} ${new Date().toLocaleString('ja-JP')}
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

  const rcEl = document.getElementById('result-content');
  if(rcEl) rcEl.innerHTML = html;
  const irEl = document.getElementById('inline-result');
  if(irEl) irEl.innerHTML = '';
}

function saveAsCase() {
  if (!lastResult) return;
  showAddCase();
  const casesTab = document.querySelector('[data-page="cases"]');
  if(casesTab) casesTab.click();
}

function showAddCase() { 
    const form = document.getElementById('add-case-form');
    if(form) form.style.display = 'block'; 
}
function hideAddCase() { 
    const form = document.getElementById('add-case-form');
    if(form) form.style.display = 'none'; 
}

async function addCase() {
  const dateEl = document.getElementById('case-date');
  const date = dateEl ? dateEl.value.trim() : '';
  const receiptEl = document.getElementById('case-receipt');
  const receipt_number = receiptEl ? receiptEl.value.trim() : '';
  const jurEl = document.getElementById('case-jurisdiction');
  const jurisdiction = jurEl ? jurEl.value.trim() : '';
  const regEl = document.getElementById('case-registrar');
  const registrar = regEl ? regEl.value.trim() : '';
  const typeEl = document.getElementById('case-type');
  const type = typeEl ? typeEl.value.trim() : '';
  const corrEl = document.getElementById('case-correction');
  const correction = corrEl ? corrEl.value.trim() : '';

  if (!date || !type || !correction) { showToast('申請日、申請種別、補正内容は必須です', true); return; }

  const newCase = { id: Date.now(), date, receipt_number, jurisdiction, registrar, type, correction };
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
  ['case-date','case-receipt','case-jurisdiction','case-registrar','case-type','case-correction'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.value = '';
  });
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

function renderCasesTable() {
  const tbody = document.getElementById('cases-table-body');
  if(!tbody) return;
  if (cases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">まだ補正事例が登録されていません</td></tr>';
    return;
  }
  tbody.innerHTML = cases.map(c => `
    <tr>
      <td style="white-space:nowrap">${c.date || '-'}</td>
      <td>${c.receipt_number || '-'}</td>
      <td>${c.jurisdiction || '-'}</td>
      <td>${c.registrar || '-'}</td>
      <td><span class="badge badge-case">${c.type || '不明'}</span></td>
      <td>${c.correction ? c.correction.slice(0, 40) + (c.correction.length > 40 ? '…' : '') : ''}</td>
      <td><button class="btn btn-ghost" style="font-size:12px;padding:4px 8px" onclick="deleteCase(${c.id})">削除</button></td>
    </tr>
  `).join('');
}

// ★改良：履歴オブジェクトを構築する際、チェック詳細データ(resultObj)も一緒に受け取って保存する
function addHistory(type, person, fileCount, riskLevel, resultObj = null) { 
  history.unshift({ 
    id: Date.now(), // 行を特定するための個別ID
    date: new Date().toLocaleString('ja-JP'), 
    type, 
    person, 
    fileCount, 
    riskLevel,
    result: resultObj // ここに詳細のJSONを丸ごと記憶
  });
  if (history.length > 100) history = history.slice(0, 100);
  localStorage.setItem('touki_history', JSON.stringify(history));
  renderHistoryTable();
}

// ★改良：履歴のテーブル行にクリックイベント用スタイルと、クリック時の関数(viewHistoryDetail)を仕込む
function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if(!tbody) return;
  if (history.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-cell">チェック履歴がありません</td></tr>';
    return;
  }
  tbody.innerHTML = history.map(h => {
    const badge = h.riskLevel === 'high' ? '<span class="badge badge-danger">要注意</span>' : h.riskLevel === 'medium' ? '<span class="badge badge-warn">注意</span>' : '<span class="badge badge-ok">問題なし</span>';
    // 💡 行(tr)に style="cursor:pointer" を付与し、どこを押しても詳細が開くように変更
    return `<tr style="cursor:pointer;" onclick="viewHistoryDetail(${h.id})" title="クリックして詳細結果を表示">
      <td style="white-space:nowrap;font-size:12px">${h.date}</td>
      <td>${h.fileCount}件</td>
      <td>${h.person}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');
}

// ★追加：過去の履歴をクリックしたときに、詳細内容を取り出して「チェック結果」画面に復元する関数
function viewHistoryDetail(historyId) {
  const item = history.find(h => h.id === historyId);
  if (!item || !item.result) {
    showToast('この履歴の詳細データが見つかりません', true);
    return;
  }
  
  // 1. 直前の結果用グローバル変数にデータを複製（事例保存機能などをそのまま活かすため）
  lastResult = { result: item.result, type: "自動判別案件", person: item.person, date: new Date(item.date) };
  
  // 2. 結果画面をレンダリング
  renderResult(item.result, "自動判別案件", item.person);
  
  // 3. 画面のタブを「チェック結果」に強制移動させる
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  
  const pResult = document.querySelector('[data-page="result"]');
  if(pResult) pResult.classList.add('active');
  const pResultPage = document.getElementById('page-result');
  if(pResultPage) pResultPage.classList.add('active');
  
  showToast('過去のチェック詳細結果を呼び出しました');
}

function clearHistory() { 
  if (!confirm('チェック履歴をすべて削除しますか？')) return;
  history = [];
  localStorage.setItem('touki_history', JSON.stringify(history));
  renderHistoryTable();
  updateStats();
  showToast('履歴を削除しました');
}

function exportCSV() {
  if (cases.length === 0) { showToast('補正事例がありません', true); return; }
  const header = ['ID', '申請日', '受付番号', '管轄法務局', '登記官', '申請種別', '補正内容'];
  const rows = cases.map(c => [c.id, c.date, c.receipt_number, c.jurisdiction, c.registrar, c.type, c.correction].map(v => `"${(v||'').replace(/"/g,'""')}"`));
  const csv = '\uFEFF' + [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `補正事例.csv`; a.click();
}

function setupUpload() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  if(!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => handleFiles(e.target.files));
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
}

function removeFile(index) {
  uploadedFiles.splice(index, 1);
  renderFileList();
}

function clearCheck() {
  uploadedFiles = [];
  const fi = document.getElementById('file-input'); if(fi) fi.value = '';
  const fl = document.getElementById('file-list'); if(fl) fl.innerHTML = '';
  const ir = document.getElementById('inline-result'); if(ir) ir.innerHTML = '';
  const zone = document.getElementById('upload-zone');
  if(zone) zone.classList.remove('has-files');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateStats() {
  const c = document.getElementById('stat-cases'); if(c) c.textContent = cases.length;
  const h = document.getElementById('stat-checked'); if(h) h.textContent = history.length;
}

function clearAllData() { localStorage.clear(); location.reload(); }
function printResult() { window.print(); }

function showLoading(msg) { 
  let el = document.getElementById('loading-overlay');
  if (!el) { el = document.createElement('div'); el.id = 'loading-overlay'; el.className = 'loading-overlay'; document.body.appendChild(el); }
  el.innerHTML = `<div class="spinner"></div><div>${msg}</div>`; el.style.display = 'flex';
}
function hideLoading() { const el = document.getElementById('loading-overlay'); if (el) el.style.display = 'none'; }
function showToast(msg, isError = false) { 
  const el = document.createElement('div'); el.className = 'toast'; el.style.background = isError ? 'var(--color-danger)' : 'var(--color-text)'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3000);
}

// --- カスタムドロップダウンの制御 ---
document.addEventListener('DOMContentLoaded', () => {
  // ① 担当者のドロップダウン制御
  const personInput = document.getElementById('check-person');
  const personDropdown = document.getElementById('person-dropdown');

  if (personInput && personDropdown) {
    personInput.addEventListener('click', (e) => {
      e.stopPropagation();
      personDropdown.style.display = personDropdown.style.display === 'block' ? 'none' : 'block';
    });
    personDropdown.addEventListener('click', (e) => {
      if (e.target.classList.contains('dropdown-item')) {
        personInput.value = e.target.textContent;
        personDropdown.style.display = 'none';
      }
    });
  }

  // ② 管轄法務局のドロップダウン制御（今回追加分）
  const jurInput = document.getElementById('case-jurisdiction');
  const jurDropdown = document.getElementById('jurisdiction-dropdown');

  if (jurInput && jurDropdown) {
    jurInput.addEventListener('click', (e) => {
      e.stopPropagation();
      jurDropdown.style.display = jurDropdown.style.display === 'block' ? 'none' : 'block';
    });
    jurDropdown.addEventListener('click', (e) => {
      if (e.target.classList.contains('dropdown-item')) {
        jurInput.value = e.target.textContent;
        jurDropdown.style.display = 'none';
      }
    });
  }

  // 画面のどこかをクリックしたらすべてのドロップダウンを閉じる
  document.addEventListener('click', (e) => {
    if (personInput && personDropdown && e.target !== personInput && e.target !== personDropdown) {
      personDropdown.style.display = 'none';
    }
    if (jurInput && jurDropdown && e.target !== jurInput && e.target !== jurDropdown) {
      jurDropdown.style.display = 'none';
    }
  });
});

// ==========================================
// 補正事例テーブルの描画と詳細ポップアップ機能
// ==========================================
function renderCasesTable() {
  const tbody = document.getElementById('cases-table-body');
  if(!tbody) return;
  if (cases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">まだ補正事例が登録されていません</td></tr>';
    return;
  }
  
  tbody.innerHTML = cases.map(c => {
    // 💡 日付に「T」が含まれていれば、そこで分割して前の部分だけ取得
    const formattedDate = c.date ? c.date.split('T')[0] : '-';
    
    return `
    <tr onclick="viewCaseDetail(${c.id})" title="クリックして詳細を表示">
      <td style="white-space:nowrap">${formattedDate}</td>
      <td>${c.receipt_number || '-'}</td>
      <td>${c.jurisdiction || '-'}</td>
      <td>${c.registrar || '-'}</td>
      <td><span class="badge badge-case">${c.type || '不明'}</span></td>
      <td>${c.correction ? c.correction.slice(0, 40) + (c.correction.length > 40 ? '…' : '') : ''}</td>
      <td><button class="btn btn-ghost" style="font-size:12px;padding:4px 8px" onclick="event.stopPropagation(); deleteCase(${c.id})">削除</button></td>
    </tr>
  `}).join('');
}

function viewCaseDetail(caseId) {
  const c = cases.find(item => item.id === caseId);
  if (!c) {
    showToast('事例データが見つかりません', true);
    return;
  }
  
  // 💡 ポップアップ側でも同様に「T」以降をカット
  const formattedDate = c.date ? c.date.split('T')[0] : '-';

  document.getElementById('modal-case-date').textContent = formattedDate;
  document.getElementById('modal-case-receipt').textContent = c.receipt_number || '-';
  document.getElementById('modal-case-jurisdiction').textContent = c.jurisdiction || '-';
  document.getElementById('modal-case-registrar').textContent = c.registrar || '-';
  document.getElementById('modal-case-type').textContent = c.type || '不明';
  document.getElementById('modal-case-correction').textContent = c.correction || '';

  const modal = document.getElementById('case-detail-modal');
  if (modal) modal.style.display = 'flex';
}

function closeCaseModal() {
  const modal = document.getElementById('case-detail-modal');
  if (modal) modal.style.display = 'none';
}
