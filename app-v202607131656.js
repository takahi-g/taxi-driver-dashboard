// アプリケーションの状態管理
let records = [];
let calendarDate = new Date();
let showWorkOnly = false;

// DOMの読み込み完了時
document.addEventListener('DOMContentLoaded', () => {
  // 初期設定と読み込み
  loadRecords();
  
  // 設定の読み込み (保存情報が無い場合の初期値は true (出勤日のみ表示) とする)
  const savedShowWorkOnly = localStorage.getItem('taxi_show_work_only');
  showWorkOnly = savedShowWorkOnly !== null ? savedShowWorkOnly === 'true' : true;
  
  const workOnlyCheckbox = document.getElementById('setting-work-only');
  if (workOnlyCheckbox) {
    workOnlyCheckbox.checked = showWorkOnly;
  }

  initEventListeners();
  updateUI();
  
  // Lucideアイコンの初期化
  lucide.createIcons();
});

// イベントリスナーの登録
function initEventListeners() {
  const addRecordBtn = document.getElementById('add-record-btn');
  const recordModal = document.getElementById('record-modal');
  const closeModalBtn = document.getElementById('close-modal-btn');
  const cancelBtn = document.getElementById('cancel-btn');
  const recordForm = document.getElementById('record-form');

  const closeModal = () => {
    recordModal.classList.remove('show');
  };

  if (addRecordBtn) {
    addRecordBtn.addEventListener('click', () => {
      const today = new Date().toISOString().split('T')[0];
      openModalWithDate(today);
    });
  }

  closeModalBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);

  // モーダル外クリックで閉じる
  window.addEventListener('click', (e) => {
    if (e.target === recordModal) {
      closeModal();
    }
  });

  // フォーム送信
  recordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const date = document.getElementById('input-date').value;
    const startTime = document.getElementById('input-start-time').value;
    const endTime = document.getElementById('input-end-time').value;
    const earnings = parseInt(document.getElementById('input-earnings').value, 10) || 0;
    const tips = parseInt(document.getElementById('input-tips').value, 10) || 0;

    // 勤務時間の計算（日跨ぎ対応）
    const hours = calculateHours(startTime, endTime);

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
    const existingIndex = records.findIndex(r => r.date === date);
    if (existingIndex !== -1) {
      newRecord.id = records[existingIndex].id;
      records[existingIndex] = newRecord;
    } else {
      records.push(newRecord);
    }

    // 日付順にソート
    records.sort((a, b) => new Date(a.date) - new Date(b.date));

    saveRecords();
    updateUI();
    closeModal();

    // 登録完了時に自動的にカレンダー（出勤リスト）タブに切り替えて変更を確認できるようにする
    const calendarTab = document.querySelector('.tab-item[data-pane="pane-calendar"]');
    if (calendarTab) {
      calendarTab.click();
    }
  });

  // カレンダーコントロール
  document.getElementById('prev-month-btn').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderInputCalendar();
  });

  document.getElementById('next-month-btn').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderInputCalendar();
  });

  // ページ更新ボタン
  document.getElementById('refresh-btn').addEventListener('click', () => {
    window.location.reload();
  });

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
    });
  });

  // 設定トグルの変更イベント
  const workOnlyCheckbox = document.getElementById('setting-work-only');
  if (workOnlyCheckbox) {
    workOnlyCheckbox.addEventListener('change', function() {
      showWorkOnly = this.checked;
      localStorage.setItem('taxi_show_work_only', showWorkOnly);
      renderWorkList();
    });
  }
}

// 勤務時間の計算 (開始・終了時間から時間数を算出。深夜またぎに対応し、一律で3時間休憩を引く)
function calculateHours(start, end) {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);

  let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  
  // 終了時間が開始時間より前＝日をまたいでいるとみなす
  if (diffMinutes < 0) {
    diffMinutes += 24 * 60; // 24時間分（1440分）を足す
  }

  // 勤務時間を算出
  const rawHours = diffMinutes / 60;
  
  // 3時間の休憩を引く（マイナスにならないよう下限を0にする）
  const finalHours = Math.max(0, rawHours - 3);

  // 小数点第2位まで計算して丸める
  return Math.round(finalHours * 100) / 100;
}

// LocalStorage から読み込み
function loadRecords() {
  const stored = localStorage.getItem('taxi_dashboard_records');
  if (stored) {
    try {
      records = JSON.parse(stored);
      // 日付順にソート
      records.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
      console.error("データの読み込みに失敗しました:", e);
      records = [];
    }
  }
}

// LocalStorage へ保存
function saveRecords() {
  localStorage.setItem('taxi_dashboard_records', JSON.stringify(records));
}

// 履歴から削除
function deleteRecord(id) {
  if (confirm('この勤務記録を削除してもよろしいですか？')) {
    records = records.filter(record => record.id !== id);
    saveRecords();
    updateUI();
  }
}

// UIの全体更新
function updateUI() {
  updateMetrics();
  updateHistoryAccordion();
  renderWorkList();
  renderInputCalendar();
  
  // 動的に追加された要素のアイコンを再描画
  lucide.createIcons();
}

// 主要数値の計算と表示
function updateMetrics() {
  const totalDays = records.length;
  let totalHours = 0;
  let totalEarnings = 0;
  let totalTips = 0;

  records.forEach(r => {
    totalHours += r.hours;
    totalEarnings += r.earnings;
    totalTips += r.tips;
  });

  // 売上のみでの平均時間売上計算（チップを含めない）
  const averageHourly = totalHours > 0 ? Math.round(totalEarnings / totalHours) : 0;

  // 各要素への書き込み
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

  if (records.length === 0) {
    container.innerHTML = `
      <div class="empty-message">
        <i data-lucide="inbox"></i>
        <p>勤務記録がありません。設定カレンダーの日付をタップして登録してください。</p>
      </div>
    `;
    document.getElementById('record-count').innerText = '0 件の記録';
    return;
  }

  document.getElementById('record-count').innerText = `${records.length} 件の記録`;

  // 月ごとにグループ化
  const grouped = {};
  records.forEach(r => {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  // 月を新しい順にソート
  const sortedKeys = Object.keys(grouped).sort().reverse();

  sortedKeys.forEach(key => {
    const [y, m] = key.split('-');
    const monthRecords = grouped[key];

    const section = document.createElement('div');
    section.className = 'accordion-section';

    // ヘッダー（タップで開閉）
    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.innerHTML = `
      <span class="accordion-title"><i data-lucide="calendar"></i> ${parseInt(m)}月 (${monthRecords.length}件)</span>
      <i data-lucide="chevron-down" class="accordion-chevron"></i>
    `;
    header.addEventListener('click', () => {
      section.classList.toggle('open');
    });

    // コンテンツ（各レコード）
    const content = document.createElement('div');
    content.className = 'accordion-content';

    // 新しい日付順
    [...monthRecords].reverse().forEach(r => {
      const item = document.createElement('div');
      item.className = 'accordion-item';

      const infoEl = document.createElement('div');
      infoEl.className = 'accordion-item-info';
      
      const formattedDate = formatDate(r.date);
      infoEl.innerHTML = `
        <span class="acc-date">${formattedDate}</span>
        <span class="acc-hours">${r.hours.toFixed(1)}h</span>
        <span class="acc-earnings">¥${r.earnings.toLocaleString()}</span>
        <span class="acc-tips">C${r.tips.toLocaleString()}</span>
      `;

      const actionsEl = document.createElement('div');
      actionsEl.className = 'accordion-item-actions';
      actionsEl.innerHTML = `
        <button class="btn-edit-icon" title="編集">
          <i data-lucide="pencil"></i>
        </button>
        <button class="btn-danger-icon" title="削除">
          <i data-lucide="trash-2"></i>
        </button>
      `;
      // 編集ボタン
      actionsEl.querySelector('.btn-edit-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        openModalWithDate(r.date);
      });
      // 削除ボタン
      actionsEl.querySelector('.btn-danger-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteRecord(r.id);
      });

      item.appendChild(infoEl);
      item.appendChild(actionsEl);
      content.appendChild(item);
    });

    section.appendChild(header);
    section.appendChild(content);
    container.appendChild(section);
  });
}

// カレンダー（出勤リスト）の描画ロジック (今月の登録データのみ表示)
function renderWorkList() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const container = document.getElementById('work-list-container');
  if (!container) return;
  container.innerHTML = '';

  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];
  let renderedCount = 0;

  for (let i = 1; i <= totalDays; i++) {
    const dateStr = formatDateStr(year, month, i);
    const hasWork = records.some(r => r.date === dateStr);
    
    // 「出勤日のみ表示」設定のフィルタリング
    if (showWorkOnly && !hasWork) {
      continue;
    }

    const isToday = dateStr === todayStr;
    const dayIndex = new Date(year, month, i).getDay();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekdayStr = weekdays[dayIndex];

    const listItem = createWorkListItem(i, weekdayStr, dayIndex, dateStr, isToday, hasWork);
    container.appendChild(listItem);
    renderedCount++;
  }

  // バッジ件数更新
  const workDaysCount = records.filter(r => {
    const d = new Date(r.date);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;
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

// 7列グリッドカレンダー（設定タブ内入力カレンダー）の描画ロジック
function renderInputCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  // ラベル更新
  document.getElementById('current-month-label').innerText = `${year}年 ${month + 1}月`;

  const grid = document.getElementById('calendar-days-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // その月の最初の日の曜日と日数
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  // 1日の曜日より前の空セルを追加 (7列のマス目を合わせる)
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-day empty';
    emptyCell.style.pointerEvents = 'none';
    emptyCell.style.opacity = '0';
    grid.appendChild(emptyCell);
  }

  // 1日から末日まで順番にセルを生成
  for (let i = 1; i <= totalDays; i++) {
    const dateStr = formatDateStr(year, month, i);
    const isToday = dateStr === todayStr;
    const dayIndex = new Date(year, month, i).getDay();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekdayStr = weekdays[dayIndex];

    const dayEl = createDayCell(i, weekdayStr, dayIndex, dateStr, isToday);
    grid.appendChild(dayEl);
  }
}

// YYYY-MM-DD 形式の日付文字列を生成 (月跨ぎに対応)
function formatDateStr(year, month, day) {
  const d = new Date(year, month, day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
}

// 出勤リスト用の1列アイテム要素を作成
function createWorkListItem(dayNum, weekdayStr, dayIndex, dateStr, isToday, hasWork) {
  const itemEl = document.createElement('div');
  itemEl.className = 'work-list-item';
  if (isToday) itemEl.classList.add('today');

  // タップした時のイベントを追加 (編集用)
  itemEl.addEventListener('click', () => {
    openModalWithDate(dateStr);
  });

  // 日付と曜日の表示
  const numEl = document.createElement('span');
  numEl.className = 'day-number';
  if (dayIndex === 0) numEl.classList.add('sun');
  if (dayIndex === 6) numEl.classList.add('sat');
  numEl.innerText = `${dayNum}(${weekdayStr})`;
  itemEl.appendChild(numEl);

  // 勤務データがあれば詳細を表示、無ければ「未登録」を表示
  const dayRecords = records.filter(r => r.date === dateStr);
  if (dayRecords.length > 0) {
    let dayHours = 0;
    let dayEarnings = 0;
    let dayTips = 0;

    dayRecords.forEach(r => {
      dayHours += r.hours;
      dayEarnings += r.earnings;
      dayTips += r.tips;
    });

    const infoEl = document.createElement('div');
    infoEl.className = 'day-info';

    // 勤務時間
    const hoursEl = document.createElement('span');
    hoursEl.className = 'day-hours';
    hoursEl.innerText = `${dayHours.toFixed(1)}h`;
    infoEl.appendChild(hoursEl);

    // 売上
    const earningsEl = document.createElement('span');
    earningsEl.className = 'day-earnings';
    earningsEl.innerText = `¥${dayEarnings.toLocaleString()}`;
    infoEl.appendChild(earningsEl);

    // チップ
    const tipsEl = document.createElement('span');
    tipsEl.className = 'day-tips';
    tipsEl.innerText = `C${dayTips.toLocaleString()}`;
    infoEl.appendChild(tipsEl);

    itemEl.appendChild(infoEl);
  } else {
    // 勤務データがない場合 (showWorkOnly が false のときだけここに来る)
    const emptyInfoEl = document.createElement('div');
    emptyInfoEl.className = 'day-info';
    emptyInfoEl.style.color = 'var(--text-muted)';
    emptyInfoEl.innerText = '未出勤';
    itemEl.appendChild(emptyInfoEl);
  }

  return itemEl;
}

// 設定カレンダーのセル要素を作成 (7列マス目用)
function createDayCell(dayNum, weekdayStr, dayIndex, dateStr, isToday = false) {
  const dayEl = document.createElement('div');
  dayEl.className = 'calendar-day';
  if (isToday) dayEl.classList.add('today');

  // タップした時は即時出勤オン・オフをトグルする
  dayEl.addEventListener('click', () => {
    toggleWorkDate(dateStr);
  });

  // 日付の表示
  const numEl = document.createElement('span');
  numEl.className = 'day-number';
  if (dayIndex === 0) numEl.classList.add('sun');
  if (dayIndex === 6) numEl.classList.add('sat');
  numEl.innerText = dayNum;
  dayEl.appendChild(numEl);

  // その日の勤務データがあれば「has-work」を付与
  const hasWork = records.some(r => r.date === dateStr);
  if (hasWork) {
    dayEl.classList.add('has-work');
  }

  return dayEl;
}

// 日付の出勤状態をトグル（オン・オフ）切り替えする
function toggleWorkDate(dateStr) {
  const existingIndex = records.findIndex(r => r.date === dateStr);
  
  if (existingIndex !== -1) {
    // すでに登録があれば削除する（オフ）
    records.splice(existingIndex, 1);
  } else {
    // 登録がなければ、デフォルト値で自動登録（オン）。時間は0
    const startTime = document.getElementById('input-start-time').value || '';
    const endTime = document.getElementById('input-end-time').value || '';
    const earnings = parseInt(document.getElementById('input-earnings').value, 10) || 0;
    const tips = parseInt(document.getElementById('input-tips').value, 10) || 0;
    
    const hours = (startTime && endTime) ? calculateHours(startTime, endTime) : 0;
    
    const newRecord = {
      id: Date.now().toString(),
      date: dateStr,
      startTime,
      endTime,
      hours,
      earnings,
      tips
    };
    
    records.push(newRecord);
  }
  
  // 日付順にソート
  records.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  saveRecords();
  updateUI();
}

// 日付を指定して登録モーダルを開く
function openModalWithDate(dateStr) {
  const recordModal = document.getElementById('record-modal');
  const dateInput = document.getElementById('input-date');
  
  // 日付をセット
  dateInput.value = dateStr;

  // 該当日の既存レコードを探す
  const existingRecord = records.find(r => r.date === dateStr);
  if (existingRecord) {
    // 既存データがある場合はフォームにプリセット
    document.getElementById('input-start-time').value = existingRecord.startTime;
    document.getElementById('input-end-time').value = existingRecord.endTime;
    document.getElementById('input-earnings').value = existingRecord.earnings;
    document.getElementById('input-tips').value = existingRecord.tips;
  }

  recordModal.classList.add('show');
}
