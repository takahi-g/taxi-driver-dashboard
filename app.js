// アプリケーションの状態を一元管理
const state = {
  records: [],
  calendarDate: new Date(),
  showWorkOnly: false
};

// DOMの読み込み完了時
document.addEventListener('DOMContentLoaded', () => {
  // 保存情報が無い場合の初期値は true (出勤日のみ表示) とし、LocalStorageから読み込む
  const savedShowWorkOnly = localStorage.getItem('taxi_show_work_only');
  state.showWorkOnly = savedShowWorkOnly !== null ? savedShowWorkOnly === 'true' : true;
  
  const workOnlyCheckbox = document.getElementById('setting-work-only');
  if (workOnlyCheckbox) {
    workOnlyCheckbox.checked = state.showWorkOnly;
  }

  loadRecords();
  initEventListeners();
  updateUI();
  
  // Lucideアイコンの初期化 (非同期ロード対応)
  initializeIcons();
});

// イベントリスナーの登録
function initEventListeners() {
  const addRecordBtn = document.getElementById('add-record-btn');
  const recordModal = document.getElementById('record-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const recordForm = document.getElementById('record-form');

  const closeModal = () => {
    if (recordModal) {
      recordModal.classList.remove('show');
    }
  };

  if (addRecordBtn) {
    addRecordBtn.addEventListener('click', () => {
      const today = new Date().toISOString().split('T')[0];
      openModalWithDate(today);
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeModal);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
  }

  // モーダル外クリックで閉じる
  window.addEventListener('click', (e) => {
    if (e.target === recordModal) {
      closeModal();
    }
  });

  // 登録・編集フォーム送信
  if (recordForm) {
    recordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const date = document.getElementById('input-date').value;
      const startTime = document.getElementById('input-start-time').value;
      const endTime = document.getElementById('input-end-time').value;
      const earnings = parseInt(document.getElementById('input-earnings').value, 10) || 0;
      const tips = parseInt(document.getElementById('input-tips').value, 10) || 0;

      // 勤務時間の計算
      const hours = (startTime && endTime) ? calculateHours(startTime, endTime) : 0;

      const newRecord = {
        id: Date.now().toString(),
        date,
        startTime,
        endTime,
        hours,
        earnings,
        tips
      };

      // 同一日付の既存データがあれば上書き、なければ新規追加
      const existingIndex = state.records.findIndex(r => r.date === date);
      if (existingIndex !== -1) {
        newRecord.id = state.records[existingIndex].id;
        state.records[existingIndex] = newRecord;
      } else {
        state.records.push(newRecord);
      }

      // 日付順にソート (文字列比較でiOSのDateパースバグを回避)
      sortRecords();

      saveRecords();
      updateUI();
      closeModal();

      // 登録完了時に自動的にカレンダー（出勤リスト）タブに切り替え
      const calendarTab = document.querySelector('.tab-item[data-pane="pane-calendar"]');
      if (calendarTab) {
        calendarTab.click();
      }
    });
  }

  // カレンダー月変更コントロール
  const prevMonthBtn = document.getElementById('prev-month-btn');
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', () => {
      state.calendarDate.setMonth(state.calendarDate.getMonth() - 1);
      renderInputCalendar();
      renderWorkList();
    });
  }

  const nextMonthBtn = document.getElementById('next-month-btn');
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', () => {
      state.calendarDate.setMonth(state.calendarDate.getMonth() + 1);
      renderInputCalendar();
      renderWorkList();
    });
  }

  // ページ更新ボタン (回転エフェクトを350ms見せてからリロード)
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      const icon = this.querySelector('svg') || this.querySelector('i');
      if (icon) {
        icon.classList.add('spin-animate');
      }
      
      // 350ms回転させてからリロードを実行
      setTimeout(() => {
        // iOS PWA（ホーム追加後）でクエリパラメータを付与すると画面崩れやアセットブロックが起きるため、スタンドアロン判定して安全リロード
        if (window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches) {
          window.location.reload();
        } else {
          window.location.replace(window.location.pathname + '?t=' + Date.now());
        }
      }, 350);
    });
  }

  // 下部フローティングタブバーの切り替え
  const tabs = document.querySelectorAll('.tab-item');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panes.forEach(p => p.classList.add('pane-hidden'));
      
      tab.classList.add('active');
      const activePane = document.getElementById(tab.dataset.pane);
      if (activePane) {
        activePane.classList.remove('pane-hidden');
      }

      // 「勤務を記録する」ボタンの表示制御 (カレンダータブのみ表示)
      const addBtn = document.getElementById('add-record-btn');
      if (addBtn) {
        if (tab.dataset.pane === 'pane-calendar') {
          addBtn.style.display = 'inline-flex';
        } else {
          addBtn.style.display = 'none';
        }
      }
    });
  });

  // 設定トグルの変更イベント
  const workOnlyCheckbox = document.getElementById('setting-work-only');
  if (workOnlyCheckbox) {
    workOnlyCheckbox.addEventListener('change', function() {
      state.showWorkOnly = this.checked;
      localStorage.setItem('taxi_show_work_only', state.showWorkOnly);
    });
  }

  // バックアップ・復元ボタンのイベント登録 (コピー＆ペースト方式)
  const copyBackupBtn = document.getElementById('copy-backup-btn');
  const pasteRestoreBtn = document.getElementById('paste-restore-btn');

  if (copyBackupBtn) {
    copyBackupBtn.addEventListener('click', copyBackup);
  }
  if (pasteRestoreBtn) {
    pasteRestoreBtn.addEventListener('click', pasteRestore);
  }

  // チップ額のクイック加算
  const quickTipBtns = document.querySelectorAll('.btn-quick-tip');
  const tipsInput = document.getElementById('input-tips');
  if (tipsInput && quickTipBtns.length > 0) {
    quickTipBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const val = btn.dataset.val;
        if (val === 'clear') {
          tipsInput.value = '';
        } else {
          const currentVal = parseInt(tipsInput.value, 10) || 0;
          const addVal = parseInt(val, 10);
          tipsInput.value = currentVal + addVal;
        }
      });
    });
  }

  // 「今日のチップ」クイック加算 (カレンダー画面上部のウィジェット用)
  const quickTipTodayBtns = document.querySelectorAll('.btn-quick-tip-today');
  if (quickTipTodayBtns.length > 0) {
    quickTipTodayBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const val = btn.dataset.val;
        
        const today = new Date();
        const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
        
        let todayRecord = state.records.find(r => r.date === todayStr);
        
        // 未出勤（レコードなし）の場合は、ベースデフォルト値 (09:00〜04:40) で即時登録
        if (!todayRecord) {
          const startTime = '09:00';
          const endTime = '04:40';
          const hours = calculateHours(startTime, endTime);
          todayRecord = {
            id: Date.now().toString(),
            date: todayStr,
            startTime,
            endTime,
            hours,
            earnings: 0,
            tips: 0
          };
          state.records.push(todayRecord);
          sortRecords();
        }

        if (val === 'clear') {
          todayRecord.tips = 0;
        } else {
          const addVal = parseInt(val, 10);
          todayRecord.tips = (todayRecord.tips || 0) + addVal;
        }

        saveRecords();
        updateUI();
      });
    });
  }
}

// ----------------------------------------------------
// 日付処理ユーティリティ (iOS Safari互換)
// ----------------------------------------------------

// "YYYY-MM-DD" をどのブラウザでも安全に Date オブジェクトに変換
function parseLocalDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    return new Date(y, m - 1, d);
  }
  return new Date(dateStr);
}

// 日付文字列 (YYYY-MM-DD) を "MM/DD (曜日)" に安全に変換
function formatLocalDate(dateStr) {
  const dateObj = parseLocalDate(dateStr);
  if (isNaN(dateObj.getTime())) return dateStr;
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const dayName = days[dateObj.getDay()];
  return `${month}/${day} (${dayName})`;
}

// 年、月、日から "YYYY-MM-DD" 文字列を生成
function formatDateStr(year, month, day) {
  const d = new Date(year, month, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
}

// 日本の祝日判定 (2025〜2027年対応の簡易・正確な判定)
function isHoliday(year, month, day) {
  // ハッピーマンデー（成人の日: 1月第2月曜, 海の日: 7月第3月曜, 敬老の日: 9月第3月曜, スポーツの日: 10月第2月曜）の計算
  const getHappyMonday = (y, m, weekNumber) => {
    const firstDay = new Date(y, m - 1, 1).getDay();
    let dayOfMon = 1 + (7 - firstDay + 1) % 7 + (weekNumber - 1) * 7;
    return dayOfMon;
  };

  // 春分の日 (2025-2027年はすべて3/20)
  const getVernalEquinox = (y) => 20;
  // 秋分の日 (2025, 2026年は9/23、2027年は9/22)
  const getAutumnalEquinox = (y) => {
    if (y === 2027) return 22;
    return 23;
  };

  // 固定祝日
  if (month === 1 && day === 1) return true; // 元日
  if (month === 2 && day === 11) return true; // 建国記念の日
  if (month === 2 && day === 23) return true; // 天皇誕生日
  if (month === 3 && day === getVernalEquinox(year)) return true; // 春分の日
  if (month === 4 && day === 29) return true; // 昭和の日
  if (month === 5 && day === 3) return true; // 憲法記念日
  if (month === 5 && day === 4) return true; // みどりの日
  if (month === 5 && day === 5) return true; // こどもの日
  if (month === 8 && day === 11) return true; // 山の日
  if (month === 11 && day === 3) return true; // 文化の日
  if (month === 11 && day === 23) return true; // 勤労感謝の日

  // ハッピーマンデー
  if (month === 1 && day === getHappyMonday(year, 1, 2)) return true; // 成人の日
  if (month === 7 && day === getHappyMonday(year, 7, 3)) return true; // 海の日
  if (month === 9 && day === getHappyMonday(year, 9, 3)) return true; // 敬老の日
  if (month === 10 && day === getHappyMonday(year, 10, 2)) return true; // スポーツの日

  if (month === 9 && day === getAutumnalEquinox(year)) return true; // 秋分の日

  // 振替休日判定
  if (month === 5 && day === 6 && [3, 4, 5].includes(new Date(year, 4, 3).getDay())) {
    return true;
  }
  
  const yesterday = new Date(year, month - 1, day - 1);
  if (yesterday.getDay() === 0 && isHoliday(yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate())) {
    return true;
  }

  return false;
}


// 勤務時間の計算 (深夜またぎに対応し、休憩時間を引かずにそのまま算出)
function calculateHours(start, end) {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // 日跨ぎ時に24時間分加算
  }

  const rawHours = diffMinutes / 60;
  return Math.round(rawHours * 100) / 100; // 小数点第2位までに丸める
}

// ----------------------------------------------------
// データの永続化とサニタイズ (クラッシュ防御)
// ----------------------------------------------------

// LocalStorage から読み込み
function loadRecords() {
  const stored = localStorage.getItem('taxi_dashboard_records');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // データの破損やundefinedを自動修正して読み込む (サニタイズ)
        state.records = parsed.map(r => ({
          id: r.id || Date.now().toString(),
          date: r.date || new Date().toISOString().split('T')[0],
          startTime: r.startTime || '',
          endTime: r.endTime || '',
          hours: (r.startTime && r.endTime) ? calculateHours(r.startTime, r.endTime) : 0,
          earnings: (r.earnings !== undefined && r.earnings !== null && !isNaN(r.earnings)) ? Number(r.earnings) : 0,
          tips: (r.tips !== undefined && r.tips !== null && !isNaN(r.tips)) ? Number(r.tips) : 0
        }));
        sortRecords();
        saveRecords(); // 計算式アップデートをローカルに即時反映して保存
      }
    } catch (e) {
      console.error("データの読み込み・サニタイズに失敗しました:", e);
      state.records = [];
    }
  }
}

// LocalStorage へ保存
function saveRecords() {
  localStorage.setItem('taxi_dashboard_records', JSON.stringify(state.records));
}

// バックアップデータを文字列でコピー (Base64エンコード)
function copyBackup() {
  if (state.records.length === 0) {
    alert('保存されているデータがありません。');
    return;
  }
  
  try {
    const dataStr = JSON.stringify(state.records);
    // iOS Safariでも確実に動作する文字列用Base64エンコード
    const base64Str = btoa(encodeURIComponent(dataStr).replace(/%([0-9A-F]{2})/g, function(match, p1) {
      return String.fromCharCode('0x' + p1);
    }));
    
    // クリップボードにコピー
    navigator.clipboard.writeText(base64Str).then(() => {
      alert('バックアップ用の文字列をコピーしました！\nメモ帳などに貼り付けて保管してください。');
    }).catch(err => {
      // コピーが自動でブロックされた場合のフォールバック（画面上から手動コピーを促す）
      prompt('自動コピーが制限されました。以下の文字列をすべて選択してコピーしてください：', base64Str);
    });
  } catch (error) {
    alert('バックアップ文字列の作成に失敗しました。');
  }
}

// 貼り付けられた文字列からデータを復元 (Base64デコード)
function pasteRestore() {
  const text = prompt('コピーしておいたバックアップ文字列をここに貼り付けてください：');
  if (!text) return; // キャンセルされた場合

  try {
    // Base64デコード
    const decodedStr = decodeURIComponent(atob(text.trim()).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    
    const parsed = JSON.parse(decodedStr);
    if (Array.isArray(parsed)) {
      // データのサニタイズと復元
      const importedRecords = parsed.map(r => ({
        id: r.id || Date.now().toString() + Math.random().toString(36).substring(2, 5),
        date: r.date || new Date().toISOString().split('T')[0],
        startTime: r.startTime || '',
        endTime: r.endTime || '',
        hours: (r.hours !== undefined && r.hours !== null && !isNaN(r.hours)) ? Number(r.hours) : 0,
        earnings: (r.earnings !== undefined && r.earnings !== null && !isNaN(r.earnings)) ? Number(r.earnings) : 0,
        tips: (r.tips !== undefined && r.tips !== null && !isNaN(r.tips)) ? Number(r.tips) : 0
      }));

      if (importedRecords.length === 0) {
        alert('復元するデータが見つかりませんでした。');
        return;
      }

      const confirmMsg = `${importedRecords.length} 件のデータを復元しますか？\n(注: 現在保存されているデータはすべて上書きされます)`;
      if (confirm(confirmMsg)) {
        state.records = importedRecords;
        sortRecords();
        saveRecords();
        updateUI();
        alert('データの復元が正常に完了しました！');
      }
    } else {
      alert('無効なバックアップ文字列です。');
    }
  } catch (error) {
    alert('復元に失敗しました。貼り付けられた文字列が正しくないか、破損している可能性があります。');
  }
}

// レコードを日付順に文字列ソート
function sortRecords() {
  state.records.sort((a, b) => a.date.localeCompare(b.date));
}

// 履歴からレコードを削除
function deleteRecord(id) {
  if (confirm('この勤務記録を削除してもよろしいですか？')) {
    state.records = state.records.filter(record => record.id !== id);
    saveRecords();
    updateUI();
  }
}

// ----------------------------------------------------
// UI描画・コントロール
// ----------------------------------------------------

// UIの全体更新
function updateUI() {
  updateMetrics();
  updateHistoryAccordion();
  renderWorkList();
  renderInputCalendar();
  updateQuickTipWidget();
  initializeIcons();
}

// 今日のチップ用クイック入力ウィジェットの表示更新
function updateQuickTipWidget() {
  const dateEl = document.getElementById('quick-tip-target-date');
  const valEl = document.getElementById('quick-tip-current-val');
  if (!dateEl || !valEl) return;

  const today = new Date();
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  
  // 今日の日付を表示用にフォーマット
  dateEl.innerText = formatLocalDate(todayStr);

  // 今日のチップ総額を取得
  const todayRecord = state.records.find(r => r.date === todayStr);
  const currentTip = todayRecord ? (todayRecord.tips || 0) : 0;
  
  valEl.innerText = `¥${currentTip.toLocaleString()}`;
}

// 主要集計数値の計算と表示
function updateMetrics() {
  const totalDays = state.records.length;
  let totalHours = 0;
  let totalEarnings = 0;
  let totalTips = 0;

  state.records.forEach(r => {
    totalHours += r.hours;
    totalEarnings += r.earnings;
    totalTips += r.tips;
  });

  // 売上のみでの平均時間売上計算（チップを含めない、各勤務から休憩3時間を引いた実働時間ベースで計算）
  const totalNetHours = Math.max(0, totalHours - (totalDays * 3));
  const averageHourly = totalNetHours > 0 ? Math.round(totalEarnings / totalNetHours) : 0;

  document.getElementById('val-days').innerHTML = `${totalDays} <span class="unit">日</span>`;
  document.getElementById('val-hours').innerHTML = `${totalHours.toFixed(1)} <span class="unit">時間</span>`;
  document.getElementById('val-earnings').innerText = `¥${totalEarnings.toLocaleString()}`;
  document.getElementById('val-tips').innerText = `¥${totalTips.toLocaleString()}`;
  document.getElementById('val-hourly').innerHTML = `¥${averageHourly.toLocaleString()}<span class="unit">/h</span>`;
  document.getElementById('record-count').innerText = `${totalDays} 件の記録`;
}

// 月別アコーディオン履歴の描画
function updateHistoryAccordion() {
  const container = document.getElementById('history-accordion');
  if (!container) return;
  container.innerHTML = '';

  if (state.records.length === 0) {
    container.innerHTML = `
      <div class="empty-message">
        <i data-lucide="inbox"></i>
        <p>勤務記録がありません。設定カレンダーの日付をタップして登録してください。</p>
      </div>
    `;
    return;
  }

  // 月ごとにグループ化 ("YYYY-MM" キー)
  const grouped = {};
  state.records.forEach(r => {
    const key = r.date.substring(0, 7);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  // 月を新しい順にソート
  const sortedKeys = Object.keys(grouped).sort().reverse();

  sortedKeys.forEach(key => {
    const [yearStr, monthStr] = key.split('-');
    const monthRecords = grouped[key];

    const section = document.createElement('div');
    section.className = 'accordion-section';

    // アコーディオンのヘッダー
    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `
      <span class="accordion-title"><i data-lucide="calendar"></i> ${parseInt(monthStr, 10)}月 (${monthRecords.length}件)</span>
      <i data-lucide="chevron-down" class="accordion-chevron"></i>
    `;
    header.addEventListener('click', () => {
      section.classList.toggle('open');
    });

    // アコーディオンの中身
    const content = document.createElement('div');
    content.className = 'accordion-content';

    // 最新日付順に並び替え
    [...monthRecords].reverse().forEach(r => {
      const item = document.createElement('div');
      item.className = 'accordion-item';

      const infoEl = document.createElement('div');
      infoEl.className = 'accordion-item-info';
      
      const formattedDate = formatLocalDate(r.date);
      infoEl.innerHTML = `
        <span class="acc-date">${formattedDate}</span>
        <span class="acc-hours">${r.hours.toFixed(1)}h</span>
        <span class="acc-earnings">¥${r.earnings.toLocaleString()}</span>
        <span class="acc-tips"><span class="tip-c">C</span>${r.tips.toLocaleString()}</span>
      `;

      // 行をタップした時は登録モーダルを開く (編集)
      item.addEventListener('click', () => {
        openModalWithDate(r.date);
      });

      item.appendChild(infoEl);
      content.appendChild(item);
    });

    section.appendChild(header);
    section.appendChild(content);
    container.appendChild(section);
  });
}

// カレンダー（出勤リスト）の描画ロジック (カレンダータブ用)
function renderWorkList() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();

  const container = document.getElementById('work-list-container');
  if (!container) return;
  container.innerHTML = '';

  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];
  let renderedCount = 0;

  for (let i = totalDays; i >= 1; i--) {
    const dateStr = formatDateStr(year, month, i);
    const hasWork = state.records.some(r => r.date === dateStr);
    
    // 「出勤日のみ表示」設定時のスキップ処理
    if (state.showWorkOnly && !hasWork) {
      continue;
    }

    const isToday = dateStr === todayStr;
    const dayIndex = parseLocalDate(dateStr).getDay();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekdayStr = weekdays[dayIndex];

    const listItem = createWorkListItem(i, weekdayStr, dayIndex, dateStr, isToday);
    container.appendChild(listItem);
    renderedCount++;
  }

  // 出勤日数バッジの更新 (文字列プレフィックスで安全集計)
  const targetPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const workDaysCount = state.records.filter(r => r.date.startsWith(targetPrefix)).length;
  document.getElementById('work-days-count').innerText = `${workDaysCount} 日出勤`;

  if (renderedCount === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'empty-calendar-message';
    emptyEl.innerHTML = `
      <i data-lucide="info"></i>
      <p>この月の出勤実績はありません。</p>
    `;
    container.appendChild(emptyEl);
  }
}

// 出勤リスト用の1列アイテム要素を作成
function createWorkListItem(dayNum, weekdayStr, dayIndex, dateStr, isToday) {
  const itemEl = document.createElement('div');
  itemEl.className = 'work-list-item';
  if (isToday) itemEl.classList.add('today');

  // タップした時は登録モーダルを開く (編集)
  itemEl.addEventListener('click', () => {
    openModalWithDate(dateStr);
  });

  const numEl = document.createElement('span');
  numEl.className = 'day-number';
  
  const [y, m, d] = dateStr.split('-').map(Number);
  const isDayHoliday = isHoliday(y, m, d);

  if (dayIndex === 0 || isDayHoliday) {
    numEl.classList.add('sun');
  } else if (dayIndex === 6) {
    numEl.classList.add('sat');
  }
  numEl.innerText = `${dayNum}(${weekdayStr})`;
  itemEl.appendChild(numEl);

  const dayRecords = state.records.filter(r => r.date === dateStr);
  if (dayRecords.length > 0) {
    let dayHours = 0;
    let dayEarnings = 0;
    let dayTips = 0;

    dayRecords.forEach(r => {
      dayHours += r.hours;
      dayEarnings += r.earnings;
      dayTips += r.tips;
    });

    // 勤務時間
    const hoursEl = document.createElement('span');
    hoursEl.className = 'day-hours';
    hoursEl.innerText = `${dayHours.toFixed(1)}h`;
    itemEl.appendChild(hoursEl);

    // 売上
    const earningsEl = document.createElement('span');
    earningsEl.className = 'day-earnings';
    earningsEl.innerText = `¥${dayEarnings.toLocaleString()}`;
    itemEl.appendChild(earningsEl);

    // チップ (Cの部分だけ緑に色分け)
    const tipsEl = document.createElement('span');
    tipsEl.className = 'day-tips';
    tipsEl.innerHTML = `<span class="tip-c">C</span>${dayTips.toLocaleString()}`;
    itemEl.appendChild(tipsEl);
  } else {
    // 未登録時のプレースホルダー表示
    const emptyInfoEl = document.createElement('span');
    emptyInfoEl.className = 'day-status-empty';
    emptyInfoEl.innerText = '未出勤';
    itemEl.appendChild(emptyInfoEl);
  }

  return itemEl;
}

// 7列グリッドカレンダーの描画 (設定タブ用)
function renderInputCalendar() {
  const year = state.calendarDate.getFullYear();
  const month = state.calendarDate.getMonth();

  // 年月表示ラベルの更新
  document.getElementById('current-month-label').innerText = `${year}年 ${month + 1}月`;

  const grid = document.getElementById('calendar-days-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  // 1日の曜日より前の空セルを埋める
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    emptyCell.style.pointerEvents = 'none';
    emptyCell.style.opacity = '0';
    grid.appendChild(emptyCell);
  }

  // 1日から末日までセルを生成
  for (let i = 1; i <= totalDays; i++) {
    const dateStr = formatDateStr(year, month, i);
    const isToday = dateStr === todayStr;
    const dayIndex = parseLocalDate(dateStr).getDay();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekdayStr = weekdays[dayIndex];

    const dayEl = createDayCell(i, weekdayStr, dayIndex, dateStr, isToday);
    grid.appendChild(dayEl);
  }
}

// 設定カレンダーのセル要素（7列マス目用）を作成
function createDayCell(dayNum, weekdayStr, dayIndex, dateStr, isToday) {
  const dayEl = document.createElement('div');
  dayEl.className = 'calendar-day';
  if (isToday) dayEl.classList.add('today');

  // タップした時は即時出勤オン・オフをトグル
  dayEl.addEventListener('click', () => {
    toggleWorkDate(dateStr);
  });

  const numEl = document.createElement('span');
  numEl.className = 'day-number';
  
  const [y, m, d] = dateStr.split('-').map(Number);
  const isDayHoliday = isHoliday(y, m, d);

  if (dayIndex === 0 || isDayHoliday) {
    numEl.classList.add('sun');
  } else if (dayIndex === 6) {
    numEl.classList.add('sat');
  }
  numEl.innerText = dayNum;
  dayEl.appendChild(numEl);

  const hasWork = state.records.some(r => r.date === dateStr);
  if (hasWork) {
    dayEl.classList.add('has-work');
  }

  return dayEl;
}

// 日付の出勤状態をオン・オフ切り替え
function toggleWorkDate(dateStr) {
  const existingIndex = state.records.findIndex(r => r.date === dateStr);
  
  if (existingIndex !== -1) {
    // すでに登録があれば削除
    state.records.splice(existingIndex, 1);
  } else {
    // 登録がなければ、ベースデフォルト値 (開始09:00, 終了04:40) で即時登録
    const startTime = '09:00';
    const endTime = '04:40';
    const earnings = 0;
    const tips = 0;
    const hours = calculateHours(startTime, endTime);
    
    const newRecord = {
      id: Date.now().toString(),
      date: dateStr,
      startTime,
      endTime,
      hours,
      earnings,
      tips
    };
    
    state.records.push(newRecord);
  }
  
  sortRecords();
  saveRecords();
  updateUI();
}

// 日付を指定して登録モーダルを開く
function openModalWithDate(dateStr) {
  const recordModal = document.getElementById('record-modal');
  const dateInput = document.getElementById('input-date');
  const deleteBtn = document.getElementById('delete-record-btn');
  
  dateInput.value = dateStr;

  // 該当日の既存レコードを探してフォームにプリセット
  const existingRecord = state.records.find(r => r.date === dateStr);
  if (existingRecord) {
    document.getElementById('input-start-time').value = existingRecord.startTime;
    document.getElementById('input-end-time').value = existingRecord.endTime;
    
    // 金額やチップが0の場合は空文字を設定し、placeholder="0" に任せる（消す手間を削減）
    document.getElementById('input-earnings').value = existingRecord.earnings === 0 ? '' : existingRecord.earnings;
    document.getElementById('input-tips').value = existingRecord.tips === 0 ? '' : existingRecord.tips;

    // 既存レコードがあるため、削除ボタンを表示
    if (deleteBtn) {
      deleteBtn.style.display = 'flex';
      // 既存のイベントリスナーをクリアするためにクローンに差し替え
      const newDeleteBtn = deleteBtn.cloneNode(true);
      deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
      newDeleteBtn.addEventListener('click', () => {
        if (confirm('この日の勤務記録を削除してもよろしいですか？')) {
          state.records = state.records.filter(r => r.id !== existingRecord.id);
          saveRecords();
          updateUI();
          recordModal.classList.remove('show');
        }
      });
    }
  } else {
    // 新規登録時は入力欄をデフォルト値（ベース）に設定
    document.getElementById('input-start-time').value = '09:00';
    document.getElementById('input-end-time').value = '04:40';
    document.getElementById('input-earnings').value = '';
    document.getElementById('input-tips').value = '';

    // 新規レコード時は削除ボタンを非表示にする
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
    }
  }

  recordModal.classList.add('show');
  initializeIcons(); // クローンしたボタンのアイコンをロードするためにアイコン初期化を実行
}

// Lucideアイコンの非同期ロード待機＆初期化関数
function initializeIcons() {
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  } else {
    // CDNロード待ちで50msごとにリトライ
    setTimeout(initializeIcons, 50);
  }
}
